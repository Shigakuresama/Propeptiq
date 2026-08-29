import { describe, expect, it } from "vitest";

import * as serviceModule from "./admin-service";
import type {
  AdminAuditEvent,
  AdminCommandContext,
  AdminRepository,
  AdminTransaction,
} from "./admin-service";

const now = new Date("2026-08-28T22:00:00.000Z");
const actorId = "8c1a0000-0000-4000-8000-000000000001";
const accountId = "8c1a0000-0000-4000-8000-000000000002";
const entryId = "8c1a0000-0000-4000-8000-000000000003";

type RewardAdjustmentService = Readonly<{
  adjustRewardBalance: (
    repository: AdminRepository,
    context: AdminCommandContext,
    input: unknown,
  ) => Promise<Readonly<{
    status: "applied" | "idempotent";
    entryId: string;
    rewardAccountId: string;
    delta: number;
    availablePointsBalanceAfter: number;
  }>>;
}>;

const service = serviceModule as unknown as Partial<RewardAdjustmentService>;

type AdjustmentPortInput = Readonly<{
  entryId: string;
  rewardAccountId: string;
  delta: number;
  reason: "account_correction";
  idempotencyKey: string;
  fingerprint: string;
  occurredAt: Date;
}>;

type AdjustmentResult = Awaited<ReturnType<RewardAdjustmentService["adjustRewardBalance"]>>;
type AdjustmentPortResult = AdjustmentResult & Readonly<{
  reason: "account_correction";
}>;

function command(overrides: Record<string, unknown> = {}) {
  return {
    entryId,
    rewardAccountId: accountId,
    delta: 250,
    reason: "account_correction",
    internalAuditReason: "Corrected a verified migration discrepancy.",
    idempotencyKey: "task-8c1a1-adjustment-0001",
    ...overrides,
  };
}

function context(): AdminCommandContext {
  return {
    principal: {
      actorId,
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
    correlationId: "task-8c1a1-adjustment-correlation",
    rateLimitSecret: "task-8c1a1-rate-limit-secret-at-least-32-characters",
  };
}

function harness(options: Readonly<{ retryWorkTwice?: boolean }> = {}) {
  let audits: AdminAuditEvent[] = [];
  let availablePoints = 1_000;
  let stored: Readonly<{
    input: AdjustmentPortInput;
    result: AdjustmentPortResult;
  }> | null = null;
  let adjustmentCalls = 0;
  let directTransactionCalls = 0;
  let rateLimitCalls = 0;
  let retryTransactionCalls = 0;
  let transactions = 0;

  async function runTransaction<Result>(
    work: (transaction: AdminTransaction) => Promise<Result>,
  ) {
    transactions += 1;
    const stagedAudits = [...audits];
    const balanceBefore = availablePoints;
    const storedBefore = stored;
    try {
      const result = await work({
          assertActorAuthority: async () => undefined,
          async adjustRewardBalance(input: AdjustmentPortInput) {
            adjustmentCalls += 1;
            if (stored) {
              if (
                stored.input.idempotencyKey === input.idempotencyKey &&
                stored.input.fingerprint === input.fingerprint
              ) {
                return { ...stored.result, status: "idempotent" as const };
              }
              throw new Error("Reward adjustment idempotency conflict");
            }
            availablePoints += input.delta;
            const applied = Object.freeze({
              status: "applied" as const,
              entryId: input.entryId,
              rewardAccountId: input.rewardAccountId,
              delta: input.delta,
              reason: input.reason,
              availablePointsBalanceAfter: availablePoints,
            });
            stored = Object.freeze({ input: Object.freeze({ ...input }), result: applied });
            return applied;
          },
          appendAudit: async (event: AdminAuditEvent) => {
            stagedAudits.push(event);
          },
      } as unknown as AdminTransaction);
      audits = stagedAudits;
      return result;
    } catch (error) {
      availablePoints = balanceBefore;
      stored = storedBefore;
      throw error;
    }
  }

  const repository = {
    rateLimitStore: {
      async increment() {
        rateLimitCalls += 1;
        return 1;
      },
    },
    async transaction<Result>(work: (transaction: AdminTransaction) => Promise<Result>) {
      directTransactionCalls += 1;
      return runTransaction(work);
    },
    async retrySerializableTransaction<Result>(
      work: (transaction: AdminTransaction) => Promise<Result>,
    ) {
      retryTransactionCalls += 1;
      if (options.retryWorkTwice) {
        await runTransaction(work);
      }
      return runTransaction(work);
    },
  } as unknown as AdminRepository;

  return {
    repository,
    read: () => ({
      adjustmentCalls,
      audits,
      availablePoints,
      directTransactionCalls,
      rateLimitCalls,
      retryTransactionCalls,
      stored,
      transactions,
    }),
  };
}

async function execute(repository: AdminRepository, input: unknown): Promise<AdjustmentResult> {
  if (!service.adjustRewardBalance) {
    throw new Error("adjustRewardBalance service is not implemented");
  }
  return service.adjustRewardBalance(repository, context(), input);
}

describe("Task 8C1A1 reward adjustment service", () => {
  it("applies one bounded adjustment and one redacted audit atomically", async () => {
    const store = harness();

    await expect(execute(store.repository, command())).resolves.toEqual({
      status: "applied",
      entryId,
      rewardAccountId: accountId,
      delta: 250,
      availablePointsBalanceAfter: 1_250,
    });
    expect(store.read().adjustmentCalls).toBe(1);
    expect(store.read().audits).toEqual([{
      actorUserId: actorId,
      action: "growth.reward.adjusted",
      resourceType: "reward_account",
      resourceId: accountId,
      correlationId: "task-8c1a1-adjustment-correlation",
      metadata: {
        delta: 250,
        reason: "account_correction",
        internalAuditReason: "Corrected a verified migration discrepancy.",
      },
    }]);
    expect(JSON.stringify(store.read().audits)).not.toContain("buyerUserId");
    expect(JSON.stringify(store.read().stored)).not.toContain("migration discrepancy");
  });

  it("returns the original result on exact replay without a duplicate balance change or audit", async () => {
    const store = harness();
    const first = await execute(store.repository, command());

    await expect(execute(store.repository, command())).resolves.toEqual({
      ...first,
      status: "idempotent",
    });
    expect(store.read()).toMatchObject({
      adjustmentCalls: 2,
      availablePoints: 1_250,
      rateLimitCalls: 2,
      transactions: 2,
    });
    expect(store.read().audits).toHaveLength(1);
  });

  it("consumes authorization once and returns an exact retry replay without duplicate audit", async () => {
    const store = harness({ retryWorkTwice: true });

    await expect(execute(store.repository, command())).resolves.toEqual({
      status: "idempotent",
      entryId,
      rewardAccountId: accountId,
      delta: 250,
      availablePointsBalanceAfter: 1_250,
    });
    expect(store.read()).toMatchObject({
      adjustmentCalls: 2,
      availablePoints: 1_250,
      directTransactionCalls: 0,
      rateLimitCalls: 1,
      retryTransactionCalls: 1,
      transactions: 2,
    });
    expect(store.read().audits).toHaveLength(1);
  });

  it("conflicts on a changed fingerprint without another balance change or audit", async () => {
    const store = harness();
    await execute(store.repository, command());

    await expect(execute(store.repository, command({
      internalAuditReason: "A different internal explanation.",
    }))).rejects.toThrow(/idempotency conflict/i);
    expect(store.read().availablePoints).toBe(1_250);
    expect(store.read().audits).toHaveLength(1);
  });

  it("rejects an out-of-bound delta before rate limiting, transaction, or write", async () => {
    const store = harness();

    await expect(execute(store.repository, command({ delta: 10_001 }))).rejects.toThrow(
      /delta|bound|invalid/i,
    );
    expect(store.read()).toMatchObject({
      adjustmentCalls: 0,
      availablePoints: 1_000,
      rateLimitCalls: 0,
      transactions: 0,
    });
    expect(store.read().audits).toEqual([]);
  });
});
