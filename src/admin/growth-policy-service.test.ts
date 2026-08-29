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
  const adminRepository = {
    rateLimitStore: { increment: async () => 1 },
    async transaction<Result>(work: (transaction: AdminTransaction) => Promise<Result>) {
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
  };
}

describe("Task 8B1 versioned growth policy service", () => {
  it("creates a draft, rejects stale activation atomically, then activates with one redacted audit", async () => {
    expect(typeof policyService.createGrowthPolicyDraft).toBe("function");
    expect(typeof policyService.activateGrowthPolicy).toBe("function");
    const store = repository();

    const draft = await policyService.createGrowthPolicyDraft!(store.adminRepository, context(), {
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
    });
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
});
