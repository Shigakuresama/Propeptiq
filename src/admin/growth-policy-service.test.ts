import { describe, expect, it } from "vitest";

import * as serviceModule from "./admin-service";
import type {
  AdminAuditEvent,
  AdminCommandContext,
  AdminRepository,
  AdminTransaction,
} from "./admin-service";

const now = new Date("2026-08-28T20:00:00.000Z");
const policyId = "88000000-0000-4000-8000-000000000001";

type PolicyService = Readonly<{
  createGrowthPolicyDraft: (
    repository: AdminRepository,
    context: AdminCommandContext,
    input: unknown,
  ) => Promise<Readonly<{ id: string; kind: "loyalty"; version: number; status: "draft" }>>;
  activateGrowthPolicy: (
    repository: AdminRepository,
    context: AdminCommandContext,
    input: unknown,
  ) => Promise<Readonly<{ id: string; kind: "loyalty"; version: number; status: "active" }>>;
}>;

const policyService = serviceModule as unknown as Partial<PolicyService>;

function context(): AdminCommandContext {
  return {
    principal: {
      actorId: "88000000-0000-4000-8000-000000000002",
      clerkUserId: "clerk-growth-admin",
      buyerStatus: "active",
      capabilities: ["growth:manage"],
      mfaSatisfied: true,
    },
    identity: {
      clerkUserId: "clerk-growth-admin",
      primaryEmail: "admin@example.test",
      emailVerifiedAt: now.toISOString(),
      mfaConfigured: true,
      secondFactorCompleted: true,
    },
    now,
    correlationId: "task-8b1-policy-correlation",
    rateLimitSecret: "task-8b1-rate-limit-secret-at-least-32-characters",
  };
}

function repository() {
  let policy: { id: string; kind: "loyalty"; version: number; status: "draft" | "active" } | null = null;
  let audits: AdminAuditEvent[] = [];
  let transactionCount = 0;
  const adminRepository = {
    rateLimitStore: { increment: async () => 1 },
    async transaction<Result>(work: (transaction: AdminTransaction) => Promise<Result>) {
      transactionCount += 1;
      const stagedPolicy = policy === null ? null : { ...policy };
      let nextPolicy = stagedPolicy;
      const stagedAudits = [...audits];
      const result = await work({
        assertActorAuthority: async () => undefined,
        createGrowthPolicyDraft: async (input: {
          id: string;
          kind: "loyalty";
          effectiveAt: Date;
          values: Readonly<Record<string, number | null | string>>;
        }) => {
          nextPolicy = { id: input.id, kind: input.kind, version: 1, status: "draft" };
          return nextPolicy;
        },
        activateGrowthPolicy: async (input: {
          id: string;
          kind: "loyalty";
          expectedVersion: number;
          now: Date;
        }) => {
          if (!nextPolicy || nextPolicy.version !== input.expectedVersion || nextPolicy.status !== "draft") {
            throw new Error("Stale growth policy activation rejected");
          }
          nextPolicy = { ...nextPolicy, status: "active" };
          return nextPolicy;
        },
        appendAudit: async (event: AdminAuditEvent) => {
          stagedAudits.push(event);
        },
      } as unknown as AdminTransaction);
      policy = nextPolicy;
      audits = stagedAudits;
      return result;
    },
    retrySerializableTransaction: async <Result>(work: (transaction: AdminTransaction) => Promise<Result>) =>
      adminRepository.transaction(work),
  } as unknown as AdminRepository;
  return {
    adminRepository,
    readPolicy: () => policy,
    readAudits: () => audits,
    readTransactionCount: () => transactionCount,
  };
}

function loyaltyDraft(overrides: Record<string, unknown> = {}) {
  return {
    kind: "loyalty",
    policyId,
    effectiveAt: now.toISOString(),
    values: {
      pointsPerDollar: 2,
      redemptionMinorPerPoint: 1,
      minimumRedemptionPoints: 500,
      maximumRedemptionBasisPoints: 2_500,
      expiresAfterDays: null,
    },
    ...overrides,
  };
}

describe("Task 8B1 versioned growth policy service", () => {
  it("creates a draft, rejects stale activation atomically, then activates with one redacted audit", async () => {
    expect(typeof policyService.createGrowthPolicyDraft).toBe("function");
    expect(typeof policyService.activateGrowthPolicy).toBe("function");
    const store = repository();

    const draft = await policyService.createGrowthPolicyDraft!(
      store.adminRepository,
      context(),
      loyaltyDraft(),
    );
    expect(draft).toEqual({ id: policyId, kind: "loyalty", version: 1, status: "draft" });

    await expect(policyService.activateGrowthPolicy!(store.adminRepository, context(), {
      kind: "loyalty",
      policyId,
      expectedVersion: 2,
    })).rejects.toThrow(/stale/i);
    expect(store.readPolicy()).toEqual(draft);
    expect(store.readAudits()).toEqual([]);

    await expect(policyService.activateGrowthPolicy!(store.adminRepository, context(), {
      kind: "loyalty",
      policyId,
      expectedVersion: 1,
    })).resolves.toEqual({ id: policyId, kind: "loyalty", version: 1, status: "active" });
    expect(store.readAudits()).toEqual([{
      actorUserId: "88000000-0000-4000-8000-000000000002",
      action: "growth.policy.activated",
      resourceType: "loyalty_policy",
      resourceId: policyId,
      correlationId: "task-8b1-policy-correlation",
      metadata: { kind: "loyalty", version: 1, status: "active" },
    }]);
  });

  it.each([
    ["numeric draft ID", "draft", loyaltyDraft({ policyId: 1 })],
    ["boxed draft ID", "draft", loyaltyDraft({ policyId: new String(policyId) })],
    ["coercible draft ID", "draft", loyaltyDraft({ policyId: { toString: () => policyId } })],
    ["extra draft key", "draft", { ...loyaltyDraft(), unexpected: true }],
    ["unsafe policy integer", "draft", loyaltyDraft({ values: {
      pointsPerDollar: Number.MAX_SAFE_INTEGER + 1,
      redemptionMinorPerPoint: 1,
      minimumRedemptionPoints: 500,
      maximumRedemptionBasisPoints: 2_500,
      expiresAfterDays: null,
    } })],
    ["numeric activation ID", "activation", { kind: "loyalty", policyId: 1, expectedVersion: 1 }],
    ["boxed activation ID", "activation", { kind: "loyalty", policyId: new String(policyId), expectedVersion: 1 }],
    ["boolean version", "activation", { kind: "loyalty", policyId, expectedVersion: true }],
    ["numeric-string version", "activation", { kind: "loyalty", policyId, expectedVersion: "1" }],
    ["boxed version", "activation", { kind: "loyalty", policyId, expectedVersion: new Number(1) }],
    ["coercible version", "activation", { kind: "loyalty", policyId, expectedVersion: { valueOf: (): number => 1 } }],
    ["unsafe version", "activation", { kind: "loyalty", policyId, expectedVersion: Number.MAX_SAFE_INTEGER + 1 }],
    ["extra activation key", "activation", { kind: "loyalty", policyId, expectedVersion: 1, unexpected: true }],
  ] as const)("rejects %s before any transaction or audit", async (_label, command, input) => {
    const store = repository();
    const execute = command === "draft"
      ? policyService.createGrowthPolicyDraft!
      : policyService.activateGrowthPolicy!;

    await expect(execute(store.adminRepository, context(), input)).rejects.toThrow(
      /invalid|malformed|domain/i,
    );
    expect(store.readTransactionCount()).toBe(0);
    expect(store.readPolicy()).toBeNull();
    expect(store.readAudits()).toEqual([]);
  });
});
