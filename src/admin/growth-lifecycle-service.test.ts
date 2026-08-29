import { describe, expect, it } from "vitest";

import * as serviceModule from "./admin-service";
import type {
  AdminAuditEvent,
  AdminCommandContext,
  AdminRepository,
  AdminTransaction,
} from "./admin-service";

const now = new Date("2026-08-29T21:00:00.000Z");
const actorId = "8c1a4000-0000-4000-8000-000000000001";
const referralCodeId = "8c1a4000-0000-4000-8000-000000000002";
const sharedSetId = "8c1a4000-0000-4000-8000-000000000003";
const referralCreatedAt = "2026-08-28T20:00:00.000Z";
const sharedSetUpdatedAt = "2026-08-28T21:00:00.000Z";

type LifecycleStatus = "applied" | "idempotent";
type ReferralResult = Readonly<{
  status: LifecycleStatus;
  referralCodeId: string;
  createdAt: string;
  revokedAt: string;
}>;
type SharedSetResult = Readonly<{
  status: LifecycleStatus;
  sharedSetId: string;
  active: false;
  updatedAt: string;
  deactivatedAt: string;
}>;
type LifecycleServices = Readonly<{
  revokeReferralCode: (
    repository: AdminRepository,
    context: AdminCommandContext,
    input: unknown,
  ) => Promise<ReferralResult>;
  deactivateSharedSet: (
    repository: AdminRepository,
    context: AdminCommandContext,
    input: unknown,
  ) => Promise<SharedSetResult>;
}>;

const services = serviceModule as unknown as Partial<LifecycleServices>;

function context(overrides: Readonly<{
  capability?: boolean;
  mfa?: boolean;
  blocked?: boolean;
}> = {}): AdminCommandContext {
  const capability = overrides.capability ?? true;
  const mfa = overrides.mfa ?? true;
  return {
    principal: {
      actorId,
      clerkUserId: "clerk-growth-lifecycle-admin",
      buyerStatus: overrides.blocked ? "blocked" : "active",
      capabilities: capability ? ["growth:manage"] : [],
      mfaSatisfied: mfa,
    },
    identity: {
      clerkUserId: "clerk-growth-lifecycle-admin",
      primaryEmail: "admin@example.test",
      emailVerifiedAt: "2026-08-28T21:00:00.000Z",
      mfaConfigured: mfa,
      secondFactorCompleted: mfa,
    },
    now,
    correlationId: "task-8c1a-lifecycle-correlation",
    rateLimitSecret: "task-8c1a-lifecycle-rate-secret-at-least-32-characters",
  };
}

const referralCommand = Object.freeze({ referralCodeId, expectedCreatedAt: referralCreatedAt });
const sharedSetCommand = Object.freeze({ sharedSetId, expectedUpdatedAt: sharedSetUpdatedAt });

function harness(options: Readonly<{
  rateLimited?: boolean;
  retryWorkTwice?: boolean;
  invalidReadBack?: "referral" | "shared-set";
}> = {}) {
  let referral = {
    status: "active" as "active" | "revoked",
    createdAt: referralCreatedAt,
    revokedAt: null as string | null,
  };
  let sharedSet = {
    active: true,
    updatedAt: sharedSetUpdatedAt,
    deactivatedAt: null as string | null,
  };
  let audits: AdminAuditEvent[] = [];
  let rateLimitCalls = 0;
  let retryTransactions = 0;
  let directTransactions = 0;
  let authorityChecks = 0;

  async function run<Result>(work: (transaction: AdminTransaction) => Promise<Result>) {
    const referralBefore = { ...referral };
    const sharedSetBefore = { ...sharedSet };
    const stagedAudits = [...audits];
    try {
      const result = await work({
        async assertActorAuthority(
          input: Parameters<AdminTransaction["assertActorAuthority"]>[0],
        ) {
          authorityChecks += 1;
          expect(input).toEqual({
            actorUserId: actorId,
            clerkUserId: "clerk-growth-lifecycle-admin",
            capability: "growth:manage",
          });
        },
        async revokeReferralCode(input: {
          referralCodeId: string;
          expectedCreatedAt: Date;
          revokedAt: Date;
        }) {
          if (referral.status === "revoked") {
            if (referral.revokedAt !== input.revokedAt.toISOString()) throw new Error("stale referral code revocation");
            return {
              status: "idempotent" as const,
              referralCodeId: input.referralCodeId,
              createdAt: referral.createdAt,
              revokedAt: referral.revokedAt,
            };
          }
          if (referral.createdAt !== input.expectedCreatedAt.toISOString()) throw new Error("stale referral code revocation");
          referral = { ...referral, status: "revoked", revokedAt: input.revokedAt.toISOString() };
          return {
            status: "applied" as const,
            referralCodeId: options.invalidReadBack === "referral" ? sharedSetId : input.referralCodeId,
            createdAt: referral.createdAt,
            revokedAt: referral.revokedAt,
          };
        },
        async deactivateSharedSet(input: {
          sharedSetId: string;
          expectedUpdatedAt: Date;
          deactivatedAt: Date;
        }) {
          if (!sharedSet.active) {
            if (sharedSet.deactivatedAt !== input.deactivatedAt.toISOString()) throw new Error("stale shared set deactivation");
            return {
              status: "idempotent" as const,
              sharedSetId: input.sharedSetId,
              active: false as const,
              updatedAt: sharedSet.updatedAt,
              deactivatedAt: sharedSet.deactivatedAt,
            };
          }
          if (sharedSet.updatedAt !== input.expectedUpdatedAt.toISOString()) throw new Error("stale shared set deactivation");
          sharedSet = {
            active: false,
            updatedAt: input.deactivatedAt.toISOString(),
            deactivatedAt: input.deactivatedAt.toISOString(),
          };
          return {
            status: "applied" as const,
            sharedSetId: options.invalidReadBack === "shared-set" ? referralCodeId : input.sharedSetId,
            active: false as const,
            updatedAt: sharedSet.updatedAt,
            deactivatedAt: sharedSet.deactivatedAt,
          };
        },
        async appendAudit(event: AdminAuditEvent) {
          stagedAudits.push(event);
        },
      } as unknown as AdminTransaction);
      audits = stagedAudits;
      return result;
    } catch (error) {
      referral = referralBefore;
      sharedSet = sharedSetBefore;
      throw error;
    }
  }

  const repository = {
    rateLimitStore: {
      async increment() {
        rateLimitCalls += 1;
        return options.rateLimited ? 31 : 1;
      },
    },
    async transaction<Result>(work: (transaction: AdminTransaction) => Promise<Result>) {
      directTransactions += 1;
      return run(work);
    },
    async retrySerializableTransaction<Result>(work: (transaction: AdminTransaction) => Promise<Result>) {
      retryTransactions += 1;
      if (options.retryWorkTwice) await run(work);
      return run(work);
    },
  } as unknown as AdminRepository;

  return {
    repository,
    read: () => ({
      audits,
      authorityChecks,
      directTransactions,
      rateLimitCalls,
      referral,
      retryTransactions,
      sharedSet,
    }),
  };
}

async function revoke(repository: AdminRepository, command: unknown, commandContext = context()) {
  if (!services.revokeReferralCode) throw new Error("revokeReferralCode service is not implemented");
  return services.revokeReferralCode(repository, commandContext, command);
}

async function deactivate(repository: AdminRepository, command: unknown, commandContext = context()) {
  if (!services.deactivateSharedSet) throw new Error("deactivateSharedSet service is not implemented");
  return services.deactivateSharedSet(repository, commandContext, command);
}

describe("Task 8C1A lifecycle admin service", () => {
  it("applies exact referral and shared-set transitions with one concise redacted audit each", async () => {
    const store = harness();

    await expect(revoke(store.repository, referralCommand)).resolves.toEqual({
      status: "applied", referralCodeId, createdAt: referralCreatedAt, revokedAt: now.toISOString(),
    });
    await expect(deactivate(store.repository, sharedSetCommand)).resolves.toEqual({
      status: "applied", sharedSetId, active: false,
      updatedAt: now.toISOString(), deactivatedAt: now.toISOString(),
    });
    expect(store.read().audits).toEqual([
      {
        actorUserId: actorId,
        action: "growth.referral_code.revoked",
        resourceType: "referral_code",
        resourceId: referralCodeId,
        correlationId: "task-8c1a-lifecycle-correlation",
        metadata: { status: "revoked" },
      },
      {
        actorUserId: actorId,
        action: "growth.shared_set.deactivated",
        resourceType: "shared_research_set",
        resourceId: sharedSetId,
        correlationId: "task-8c1a-lifecycle-correlation",
        metadata: { active: false },
      },
    ]);
    expect(JSON.stringify(store.read().audits)).not.toMatch(/owner|buyer|codeValue|label|clerk/iu);
  });

  it.each([
    ["referral", (repository: AdminRepository) => revoke(repository, referralCommand)],
    ["shared set", (repository: AdminRepository) => deactivate(repository, sharedSetCommand)],
  ] as const)("uses one rate-limit decision and the retrying transaction for %s", async (_name, execute) => {
    const store = harness({ retryWorkTwice: true });
    await expect(execute(store.repository)).resolves.toMatchObject({ status: "idempotent" });
    expect(store.read()).toMatchObject({
      authorityChecks: 2,
      directTransactions: 0,
      rateLimitCalls: 1,
      retryTransactions: 1,
    });
    expect(store.read().audits).toHaveLength(1);
  });

  it.each([
    ["referral extra key", "referral", { ...referralCommand, extra: true }],
    ["referral coercible ID", "referral", { ...referralCommand, referralCodeId: { toString: (): string => referralCodeId } }],
    ["referral non-string timestamp", "referral", { ...referralCommand, expectedCreatedAt: new Date(referralCreatedAt) }],
    ["shared-set extra key", "shared-set", { ...sharedSetCommand, extra: true }],
    ["shared-set coercible ID", "shared-set", { ...sharedSetCommand, sharedSetId: { toString: (): string => sharedSetId } }],
    ["shared-set non-string timestamp", "shared-set", { ...sharedSetCommand, expectedUpdatedAt: new Date(sharedSetUpdatedAt) }],
  ] as const)("rejects malformed %s before authorization or writes", async (_name, kind, input) => {
    const store = harness();
    const execute = kind === "referral"
      ? revoke(store.repository, input)
      : deactivate(store.repository, input);
    await expect(execute).rejects.toThrow(/malformed|invalid/i);
    expect(store.read()).toMatchObject({
      authorityChecks: 0,
      directTransactions: 0,
      rateLimitCalls: 0,
      retryTransactions: 0,
    });
    expect(store.read().audits).toEqual([]);
  });

  it.each([
    ["missing capability", context({ capability: false })],
    ["missing MFA", context({ mfa: false })],
    ["blocked principal", context({ blocked: true })],
  ] as const)("denies %s before a transaction", async (_name, deniedContext) => {
    const store = harness();
    await expect(revoke(store.repository, referralCommand, deniedContext)).rejects.toThrow();
    expect(store.read()).toMatchObject({ rateLimitCalls: 0, retryTransactions: 0 });
    expect(store.read().audits).toEqual([]);
  });

  it("denies a rate-limited command before persisted authority or mutation", async () => {
    const store = harness({ rateLimited: true });
    await expect(deactivate(store.repository, sharedSetCommand)).rejects.toThrow(/rate limit/i);
    expect(store.read()).toMatchObject({ authorityChecks: 0, rateLimitCalls: 1, retryTransactions: 0 });
  });

  it.each([
    ["referral", "referral", (repository: AdminRepository) => revoke(repository, referralCommand)],
    ["shared set", "shared-set", (repository: AdminRepository) => deactivate(repository, sharedSetCommand)],
  ] as const)("rolls back %s when transactional read-back is invalid", async (_name, invalidReadBack, execute) => {
    const store = harness({ invalidReadBack });
    await expect(execute(store.repository)).rejects.toThrow(/read-back|invalid/i);
    expect(store.read().referral).toMatchObject({ status: "active", revokedAt: null });
    expect(store.read().sharedSet).toMatchObject({ active: true, deactivatedAt: null });
    expect(store.read().audits).toEqual([]);
  });
});
