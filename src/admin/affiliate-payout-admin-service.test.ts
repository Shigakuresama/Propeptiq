import { describe, expect, it, vi } from "vitest";

import type { AdminCommandContext } from "./admin-service";
import {
  createAffiliatePayoutBatch,
  recordAffiliatePayoutPaid,
  type AffiliatePayoutAdminRepository,
} from "./affiliate-payout-admin-service";
import type {
  AffiliatePayoutCreateTransaction,
  AffiliatePayoutPaidTransaction,
} from "../growth/affiliate-service";

const now = new Date("2026-08-30T20:00:00.000Z");
const actorUserId = "8f300000-0000-4000-8000-000000000001";
const profileId = "8f300000-0000-4000-8000-000000000002";
const payoutId = "8f300000-0000-4000-8000-000000000003";
const policyId = "8f300000-0000-4000-8000-000000000004";
const commissionId = "8f300000-0000-4000-8000-000000000005";

function context(overrides: Readonly<{
  capability?: boolean;
  mfa?: boolean;
  blocked?: boolean;
}> = {}): AdminCommandContext {
  const mfa = overrides.mfa ?? true;
  return {
    principal: {
      actorId: actorUserId,
      clerkUserId: "clerk-task8-payout-admin",
      buyerStatus: overrides.blocked ? "blocked" : "active",
      capabilities: overrides.capability === false ? [] : ["affiliate:payout"],
      mfaSatisfied: mfa,
    },
    identity: {
      clerkUserId: "clerk-task8-payout-admin",
      primaryEmail: "admin@example.test",
      emailVerifiedAt: "2026-08-30T19:00:00.000Z",
      mfaConfigured: mfa,
      secondFactorCompleted: mfa,
    },
    now,
    correlationId: "task-8-affiliate-payout-correlation",
    rateLimitSecret: "task-8-affiliate-payout-rate-secret-32-characters",
  };
}

function pendingRecord(input: Parameters<AffiliatePayoutCreateTransaction>[0]) {
  return Object.freeze({
    id: input.payoutId,
    affiliateProfileId: input.profileId,
    affiliatePolicyId: policyId,
    affiliatePolicyVersion: 1,
    idempotencyKey: input.idempotencyKey,
    amountMinor: 5_000,
    currency: "USD" as const,
    state: "pending" as const,
    version: 1,
    commissionIds: Object.freeze([commissionId]),
    providerName: null,
    externalReference: null,
    paidAt: null,
    createdAt: input.createdAt.toISOString(),
  });
}

function repository(options: Readonly<{ rateCount?: number; retryOnce?: boolean }> = {}) {
  let limiterCalls = 0;
  let createAttempts = 0;
  let paidAttempts = 0;
  const rawCreate = vi.fn<AffiliatePayoutCreateTransaction>(async (input) => {
    createAttempts += 1;
    if (options.retryOnce && createAttempts === 1) {
      throw Object.assign(new Error("serialization failure"), { code: "40001" });
    }
    return { status: "applied", payout: pendingRecord(input) };
  });
  const createInTransaction: AffiliatePayoutCreateTransaction = async (input) => {
    try {
      return await rawCreate(input);
    } catch (error) {
      if ((error as { code?: string }).code !== "40001") throw error;
      return rawCreate(input);
    }
  };
  const markPaidInTransaction = vi.fn<AffiliatePayoutPaidTransaction>(async (input) => {
    paidAttempts += 1;
    return {
      status: "applied",
      payout: Object.freeze({
        ...pendingRecord({
          actorUserId: input.actorUserId,
          actorClerkUserId: input.actorClerkUserId,
          requiredCapability: input.requiredCapability,
          payoutId: input.payoutId,
          profileId,
          idempotencyKey: "affiliate-payout-create:fixed",
          correlationId: "task-8-affiliate-payout-create",
          createdAt: now,
        }),
        state: "paid" as const,
        version: input.expectedVersion + 1,
        providerName: input.providerName,
        externalReference: input.externalReference,
        paidAt: input.paidAt.toISOString(),
      }),
    };
  });
  const value: AffiliatePayoutAdminRepository = {
    rateLimitStore: {
      async increment() {
        limiterCalls += 1;
        return options.rateCount ?? 1;
      },
    },
    createInTransaction,
    markPaidInTransaction,
  };
  return {
    value,
    rawCreate,
    markPaidInTransaction,
    read: () => ({ limiterCalls, createAttempts, paidAttempts }),
  };
}

describe("Task 8 affiliate payout administrator adapter", () => {
  it("delegates server-owned batch and paid facts through the real payout service", async () => {
    const store = repository();
    await expect(createAffiliatePayoutBatch(store.value, context(), {
      profileId,
      payoutId,
      idempotencyKey: "affiliate-payout-create:fixed",
    })).resolves.toMatchObject({
      status: "created",
      payout: { id: payoutId, amountMinor: 5_000, commissionCount: 1, state: "pending" },
    });
    expect(store.rawCreate).toHaveBeenCalledWith({
      actorUserId,
      actorClerkUserId: "clerk-task8-payout-admin",
      requiredCapability: "affiliate:payout",
      payoutId,
      profileId,
      idempotencyKey: "affiliate-payout-create:fixed",
      correlationId: "task-8-affiliate-payout-correlation",
      createdAt: now,
    });

    await expect(recordAffiliatePayoutPaid(store.value, context(), {
      payoutId,
      expectedVersion: 1,
      idempotencyKey: "affiliate-payout-paid:fixed",
      providerName: "Offline ACH operator",
      externalReference: "ach-confirmation-0001",
    })).resolves.toMatchObject({
      status: "paid",
      payout: {
        id: payoutId,
        state: "paid",
        version: 2,
        providerName: "Offline ACH operator",
        externalReference: "ach-confirmation-0001",
      },
    });
    expect(store.markPaidInTransaction).toHaveBeenCalledWith({
      actorUserId,
      actorClerkUserId: "clerk-task8-payout-admin",
      requiredCapability: "affiliate:payout",
      payoutId,
      expectedVersion: 1,
      idempotencyKey: "affiliate-payout-paid:fixed",
      providerName: "Offline ACH operator",
      externalReference: "ach-confirmation-0001",
      correlationId: "task-8-affiliate-payout-correlation",
      paidAt: now,
    });
    expect(store.read()).toEqual({ limiterCalls: 2, createAttempts: 1, paidAttempts: 1 });
    expect(store.value).not.toHaveProperty("sendPayout");
  });

  it.each([
    ["missing capability", context({ capability: false })],
    ["missing MFA", context({ mfa: false })],
    ["blocked principal", context({ blocked: true })],
  ])("denies %s before rate limiting or transaction work", async (_label, denied) => {
    const store = repository();
    await expect(createAffiliatePayoutBatch(store.value, denied, {
      profileId, payoutId, idempotencyKey: "affiliate-payout-create:fixed",
    })).rejects.toThrow();
    expect(store.read()).toEqual({ limiterCalls: 0, createAttempts: 0, paidAttempts: 0 });
  });

  it("rejects malformed, coercible, extra-key, and unbounded commands before limiting", async () => {
    const commands = [
      { profileId: 1, payoutId, idempotencyKey: "affiliate-payout-create:fixed" },
      { profileId, payoutId: payoutId.toUpperCase(), idempotencyKey: "affiliate-payout-create:fixed" },
      { profileId, payoutId, idempotencyKey: "affiliate-payout-create:fixed", amountMinor: 5_000 },
    ];
    for (const command of commands) {
      const store = repository();
      await expect(createAffiliatePayoutBatch(store.value, context(), command)).rejects.toThrow();
      expect(store.read()).toEqual({ limiterCalls: 0, createAttempts: 0, paidAttempts: 0 });
    }

    const paidStore = repository();
    await expect(recordAffiliatePayoutPaid(paidStore.value, context(), {
      payoutId,
      expectedVersion: "1",
      idempotencyKey: "affiliate-payout-paid:fixed",
      providerName: "Offline ACH operator",
      externalReference: "ach-confirmation-0001",
    })).rejects.toThrow();
    expect(paidStore.read()).toEqual({ limiterCalls: 0, createAttempts: 0, paidAttempts: 0 });
  });

  it("consumes the limiter once outside a retried serializable transaction", async () => {
    const store = repository({ retryOnce: true });
    await expect(createAffiliatePayoutBatch(store.value, context(), {
      profileId, payoutId, idempotencyKey: "affiliate-payout-create:fixed",
    })).resolves.toMatchObject({ status: "created" });
    expect(store.read()).toEqual({ limiterCalls: 1, createAttempts: 2, paidAttempts: 0 });
  });

  it("rejects a rate-limited command before transaction work", async () => {
    const store = repository({ rateCount: 31 });
    await expect(createAffiliatePayoutBatch(store.value, context(), {
      profileId, payoutId, idempotencyKey: "affiliate-payout-create:fixed",
    })).rejects.toThrow(/rate limit/i);
    expect(store.read()).toEqual({ limiterCalls: 1, createAttempts: 0, paidAttempts: 0 });
  });
});
