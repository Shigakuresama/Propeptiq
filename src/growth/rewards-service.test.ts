import { describe, expect, it, vi } from "vitest";

import {
  createRewardsService,
  type RewardsCheckoutAtomicPort,
  type RewardsCheckoutSnapshot,
} from "@/growth/rewards-service";

const ids = {
  buyer: "91000000-0000-4000-8000-000000000001",
  account: "91000000-0000-4000-8000-000000000002",
  policy: "91000000-0000-4000-8000-000000000003",
  terms: "91000000-0000-4000-8000-000000000004",
  acceptance: "91000000-0000-4000-8000-000000000005",
  orderA: "91000000-0000-4000-8000-000000000006",
  orderB: "91000000-0000-4000-8000-000000000007",
  attemptA: "91000000-0000-4000-8000-000000000008",
  attemptB: "91000000-0000-4000-8000-000000000009",
  keyA: "checkout-rewards:synthetic-attempt-a",
  keyB: "checkout-rewards:synthetic-attempt-b",
} as const;

const now = new Date("2026-08-28T12:00:00.000Z");
const termsHash = "a".repeat(64);

function availableSnapshot(availablePoints = 10_000): RewardsCheckoutSnapshot {
  return Object.freeze({
    status: "available" as const,
    rewardAccountId: ids.account,
    availablePoints,
    loyaltyPolicy: Object.freeze({
      id: ids.policy,
      version: 1,
      status: "active" as const,
      pointsPerDollar: 2,
      redemptionMinorPerPoint: 1,
      minimumRedemptionPoints: 500,
      maximumRedemptionBasisPoints: 2_500,
      expiresAfterDays: null,
      effectiveAt: "2026-08-01T00:00:00.000Z",
      supersededAt: null,
    }),
    terms: Object.freeze({
      id: ids.terms,
      version: 1,
      contentHash: termsHash,
    }),
    acceptance: Object.freeze({
      id: ids.acceptance,
      termsVersionId: ids.terms,
      contentHash: termsHash,
    }),
  });
}

function port(
  snapshot: RewardsCheckoutSnapshot = availableSnapshot(),
): RewardsCheckoutAtomicPort & {
  loadCheckoutRewards: ReturnType<typeof vi.fn>;
  reserveCheckoutRewards: ReturnType<typeof vi.fn>;
} {
  return {
    loadCheckoutRewards: vi.fn(async () => snapshot),
    reserveCheckoutRewards: vi.fn(async () => ({ status: "reserved" as const })),
  };
}

describe("checkout rewards service", () => {
  it("derives the exact 100-points-per-dollar redemption and pending base earn from server facts", async () => {
    const atomicPort = port();
    const service = createRewardsService({ atomicPort });

    await expect(
      service.quoteCheckoutRewards({
        buyerUserId: ids.buyer,
        requestedPoints: 2_000,
        postPromotionMerchandiseMinor: 10_000,
        currency: "USD",
        now,
      }),
    ).resolves.toEqual({
      status: "applied",
      rewardAccountId: ids.account,
      loyaltyPolicyId: ids.policy,
      loyaltyPolicyVersion: 1,
      termsVersionId: ids.terms,
      termsContentHash: termsHash,
      redemptionPoints: 2_000,
      redemptionMinor: 2_000,
      maximumPoints: 2_500,
      eligibleMerchandiseMinor: 8_000,
      pendingBaseEarnPoints: 160,
    });
    expect(atomicPort.loadCheckoutRewards).toHaveBeenCalledWith({
      buyerUserId: ids.buyer,
      now,
    });
  });

  it("enforces the 500-point minimum and 25-percent merchandise cap with integer math", async () => {
    const service = createRewardsService({ atomicPort: port() });

    await expect(
      service.quoteCheckoutRewards({
        buyerUserId: ids.buyer,
        requestedPoints: 499,
        postPromotionMerchandiseMinor: 20_000,
        currency: "USD",
        now,
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "below_minimum" });

    await expect(
      service.quoteCheckoutRewards({
        buyerUserId: ids.buyer,
        requestedPoints: 5_001,
        postPromotionMerchandiseMinor: 20_000,
        currency: "USD",
        now,
      }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "redemption_cap_exceeded",
    });

    await expect(
      service.quoteCheckoutRewards({
        buyerUserId: ids.buyer,
        requestedPoints: 5_000,
        postPromotionMerchandiseMinor: 20_000,
        currency: "USD",
        now,
      }),
    ).resolves.toMatchObject({
      status: "applied",
      redemptionPoints: 5_000,
      redemptionMinor: 5_000,
      maximumPoints: 5_000,
      eligibleMerchandiseMinor: 15_000,
      pendingBaseEarnPoints: 300,
    });
  });

  it("treats missing current customer terms as no rewards benefit and performs no growth write", async () => {
    const atomicPort = port(
      Object.freeze({ status: "unavailable" as const, reason: "terms_unavailable" }),
    );
    const service = createRewardsService({ atomicPort });

    await expect(
      service.quoteCheckoutRewards({
        buyerUserId: ids.buyer,
        requestedPoints: 500,
        postPromotionMerchandiseMinor: 10_000,
        currency: "USD",
        now,
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "terms_unavailable" });
    expect(atomicPort.reserveCheckoutRewards).not.toHaveBeenCalled();
  });

  it("makes one attempt reserve once, exact replay idempotent, and a second attempt unable to spend the same balance", async () => {
    let availablePoints = 1_000;
    const reservations = new Map<string, string>();
    const atomicPort = port(availableSnapshot(1_000));
    atomicPort.reserveCheckoutRewards.mockImplementation(async (input: unknown) => {
      const payload = JSON.stringify(input);
      const key = (input as { idempotencyKey: string }).idempotencyKey;
      const points = (input as { redemptionPoints: number }).redemptionPoints;
      const prior = reservations.get(key);
      if (prior !== undefined) {
        return prior === payload
          ? { status: "idempotent" as const }
          : { status: "conflict" as const };
      }
      if (points > availablePoints) {
        return { status: "unavailable" as const, reason: "insufficient_balance" as const };
      }
      reservations.set(key, payload);
      availablePoints -= points;
      return { status: "reserved" as const };
    });
    const service = createRewardsService({ atomicPort });
    const quoteA = await service.quoteCheckoutRewards({
      buyerUserId: ids.buyer,
      requestedPoints: 750,
      postPromotionMerchandiseMinor: 40_000,
      currency: "USD",
      now,
    });
    const quoteB = await service.quoteCheckoutRewards({
      buyerUserId: ids.buyer,
      requestedPoints: 750,
      postPromotionMerchandiseMinor: 40_000,
      currency: "USD",
      now,
    });
    if (quoteA.status !== "applied" || quoteB.status !== "applied") {
      throw new Error("expected two pre-reservation quotes");
    }

    const attemptA = {
      buyerUserId: ids.buyer,
      orderId: ids.orderA,
      checkoutAttemptId: ids.attemptA,
      idempotencyKey: ids.keyA,
      quote: quoteA,
      reservedAt: now,
    } as const;
    await expect(service.reserveCheckoutRewards(attemptA)).resolves.toEqual({
      status: "reserved",
    });
    await expect(service.reserveCheckoutRewards(attemptA)).resolves.toEqual({
      status: "idempotent",
    });
    await expect(
      service.reserveCheckoutRewards({
        buyerUserId: ids.buyer,
        orderId: ids.orderB,
        checkoutAttemptId: ids.attemptB,
        idempotencyKey: ids.keyB,
        quote: quoteB,
        reservedAt: now,
      }),
    ).resolves.toEqual({
      status: "unavailable",
      reason: "insufficient_balance",
    });
    expect(availablePoints).toBe(250);
    expect(atomicPort.reserveCheckoutRewards).toHaveBeenCalledTimes(3);
  });
});
