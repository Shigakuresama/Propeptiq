import { describe, expect, it, vi } from "vitest";

import type { AdminCommandContext } from "./admin-service";
import {
  decideAffiliateApplication,
  suspendAffiliateApplication,
  type AffiliateApplicationAdminRepository,
} from "./affiliate-application-admin-service";
import type { AffiliateAdminMutationTransaction } from "../growth/affiliate-service";

const now = new Date("2026-08-29T22:00:00.000Z");
const actorUserId = "8d000000-0000-4000-8000-000000000001";
const profileId = "8d000000-0000-4000-8000-000000000002";

function context(overrides: Readonly<{
  capability?: boolean;
  mfa?: boolean;
  blocked?: boolean;
}> = {}): AdminCommandContext {
  const mfa = overrides.mfa ?? true;
  return {
    principal: {
      actorId: actorUserId,
      clerkUserId: "clerk-task8-affiliate-admin",
      buyerStatus: overrides.blocked ? "blocked" : "active",
      capabilities: overrides.capability === false ? [] : ["growth:manage"],
      mfaSatisfied: mfa,
    },
    identity: {
      clerkUserId: "clerk-task8-affiliate-admin",
      primaryEmail: "admin@example.test",
      emailVerifiedAt: "2026-08-29T21:00:00.000Z",
      mfaConfigured: mfa,
      secondFactorCompleted: mfa,
    },
    now,
    correlationId: "task-8-affiliate-admin-correlation",
    rateLimitSecret: "task-8-affiliate-admin-rate-secret-32-characters",
  };
}

function repository(options: Readonly<{ rateCount?: number; retryOnce?: boolean }> = {}) {
  let limiterCalls = 0;
  let mutationAttempts = 0;
  let auditWrites = 0;
  const mutateInTransaction = vi.fn<AffiliateAdminMutationTransaction>(async (input) => {
    mutationAttempts += 1;
    if (options.retryOnce && mutationAttempts === 1) {
      throw Object.assign(new Error("serialization failure"), { code: "40001" });
    }
    auditWrites += 1;
    return {
      profile: {
        id: input.profileId,
        status: input.targetStatus,
        version: input.expectedVersion + 1,
        updatedAt: input.mutatedAt.toISOString(),
      },
    };
  });
  const retryingMutation: AffiliateAdminMutationTransaction = async (input) => {
    try {
      return await mutateInTransaction(input);
    } catch (error) {
      if ((error as { code?: string }).code !== "40001") throw error;
      return mutateInTransaction(input);
    }
  };
  const value: AffiliateApplicationAdminRepository = {
    rateLimitStore: {
      async increment() {
        limiterCalls += 1;
        return options.rateCount ?? 1;
      },
    },
    mutateInTransaction: retryingMutation,
  };
  return { value, mutateInTransaction, read: () => ({ auditWrites, limiterCalls, mutationAttempts }) };
}

describe("Task 8 affiliate application admin authorization adapter", () => {
  it("delegates exact decision and suspension facts to the real lifecycle service", async () => {
    const store = repository();

    await expect(decideAffiliateApplication(store.value, context(), {
      profileId,
      expectedVersion: 1,
      decision: "active",
    })).resolves.toEqual({ status: "active", version: 2, updatedAt: now.toISOString() });
    await expect(suspendAffiliateApplication(store.value, context(), {
      profileId,
      expectedVersion: 2,
    })).resolves.toEqual({ status: "suspended", version: 3, updatedAt: now.toISOString() });

    expect(store.mutateInTransaction).toHaveBeenNthCalledWith(1, {
      actorUserId,
      actorClerkUserId: "clerk-task8-affiliate-admin",
      requiredCapability: "growth:manage",
      profileId,
      expectedVersion: 1,
      targetStatus: "active",
      correlationId: "task-8-affiliate-admin-correlation",
      mutatedAt: now,
    });
    expect(store.read()).toEqual({ auditWrites: 2, limiterCalls: 2, mutationAttempts: 2 });
  });

  it.each([
    ["missing capability", context({ capability: false })],
    ["missing MFA", context({ mfa: false })],
    ["blocked principal", context({ blocked: true })],
  ])("denies %s before rate limit or mutation", async (_label, deniedContext) => {
    const store = repository();
    await expect(decideAffiliateApplication(store.value, deniedContext, {
      profileId,
      expectedVersion: 1,
      decision: "active",
    })).rejects.toThrow();
    expect(store.read()).toEqual({ auditWrites: 0, limiterCalls: 0, mutationAttempts: 0 });
  });

  it("rejects malformed, coercible, extra-key, and invalid-transition commands before limiting", async () => {
    const invalid = [
      { profileId: 1, expectedVersion: 1, decision: "active" },
      { profileId, expectedVersion: "1", decision: "active" },
      { profileId, expectedVersion: 1, decision: "suspended" },
      { profileId, expectedVersion: 1, decision: "active", actorUserId },
    ];
    for (const command of invalid) {
      const store = repository();
      await expect(decideAffiliateApplication(store.value, context(), command)).rejects.toThrow();
      expect(store.read()).toEqual({ auditWrites: 0, limiterCalls: 0, mutationAttempts: 0 });
    }
  });

  it("rate-limit denial happens before the transaction", async () => {
    const store = repository({ rateCount: 31 });
    await expect(decideAffiliateApplication(store.value, context(), {
      profileId,
      expectedVersion: 1,
      decision: "rejected",
    })).rejects.toThrow(/rate limit/i);
    expect(store.read()).toEqual({ auditWrites: 0, limiterCalls: 1, mutationAttempts: 0 });
  });

  it("consumes the limiter once while the existing transaction retries", async () => {
    const store = repository({ retryOnce: true });
    await expect(decideAffiliateApplication(store.value, context(), {
      profileId,
      expectedVersion: 1,
      decision: "active",
    })).resolves.toEqual({ status: "active", version: 2, updatedAt: now.toISOString() });
    expect(store.read()).toEqual({ auditWrites: 1, limiterCalls: 1, mutationAttempts: 2 });
  });
});
