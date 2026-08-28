import { describe, expect, it } from "vitest";

import {
  calculateEarnedPoints,
  calculateRewardRedemption,
  parseLoyaltyPolicy,
  type LoyaltyPolicy,
} from "@/domain/rewards";

function policy(overrides: Partial<LoyaltyPolicy> = {}): LoyaltyPolicy {
  return {
    id: "loyalty-v1",
    version: 1,
    status: "active",
    pointsPerDollar: 2,
    redemptionMinorPerPoint: 1,
    minimumRedemptionPoints: 500,
    maximumRedemptionBasisPoints: 2_500,
    expiresAfterDays: null,
    effectiveAt: "2026-08-27T00:00:00.000Z",
    supersededAt: null,
    ...overrides,
  };
}

describe("rewards domain policies", () => {
  it.each([
    ["an unsafe earn rate", { pointsPerDollar: Number.MAX_SAFE_INTEGER + 1 }, "pointsPerDollar"],
    ["a changed 100-point USD conversion", { redemptionMinorPerPoint: 2 }, "redemptionMinorPerPoint"],
    ["a changed 500-point minimum", { minimumRedemptionPoints: 499 }, "minimumRedemptionPoints"],
    ["a changed 25 percent cap", { maximumRedemptionBasisPoints: 2_501 }, "maximumRedemptionBasisPoints"],
    ["an expiry", { expiresAfterDays: 30 }, "expiresAfterDays"],
    ["a non-positive version", { version: 0 }, "version"],
  ] as const)("rejects %s", (_name, overrides, field) => {
    expect(parseLoyaltyPolicy({ ...policy(), ...overrides })).toEqual({
      ok: false,
      error: { code: "invalid_policy", field },
    });
  });

  it("accepts one supplied active version without evaluating policy cardinality", () => {
    expect(parseLoyaltyPolicy(policy())).toEqual({ ok: true, value: policy() });
  });

  it("rejects unknown keys, sparse arrays, non-finite values, and unsafe integers", () => {
    expect(parseLoyaltyPolicy({ ...policy(), extra: true })).toEqual({
      ok: false,
      error: { code: "unexpected_field", field: "extra" },
    });
    const sparse = [policy()] as LoyaltyPolicy[];
    sparse.length = 2;
    expect(calculateEarnedPoints({ policy: sparse as never, merchandiseSubtotalMinor: 1_000, promotionDiscountMinor: 0, referralDiscountMinor: 0, redeemedPoints: 0, taxMinor: 0, shippingMinor: 0 })).toEqual({ ok: false, error: { code: "invalid_policy", field: "policy" } });
    expect(parseLoyaltyPolicy({ ...policy(), pointsPerDollar: Infinity })).toEqual({
      ok: false,
      error: { code: "invalid_policy", field: "pointsPerDollar" },
    });
    expect(
      parseLoyaltyPolicy(Object.assign(Object.create({ inherited: true }), policy())),
    ).toEqual({ ok: false, error: { code: "unexpected_field", field: "inherited" } });
  });

  it("calculates points from post-discount merchandise only and rounds down", () => {
    expect(calculateEarnedPoints({ policy: policy(), merchandiseSubtotalMinor: 1_099, promotionDiscountMinor: 200, referralDiscountMinor: 100, redeemedPoints: 50, taxMinor: 999, shippingMinor: 1_500 })).toEqual({
      ok: true,
      value: { eligibleMerchandiseMinor: 749, earnedPoints: 14 },
    });
  });

  it("rejects invalid discounts and arithmetic beyond safe integer bounds", () => {
    expect(calculateEarnedPoints({ policy: policy(), merchandiseSubtotalMinor: 100, promotionDiscountMinor: 101, referralDiscountMinor: 0, redeemedPoints: 0, taxMinor: 0, shippingMinor: 0 })).toEqual({ ok: false, error: { code: "invalid_amount", field: "promotionDiscountMinor" } });
    expect(calculateEarnedPoints({ policy: policy(), merchandiseSubtotalMinor: Number.MAX_SAFE_INTEGER + 1, promotionDiscountMinor: 0, referralDiscountMinor: 0, redeemedPoints: 0, taxMinor: 0, shippingMinor: 0 })).toEqual({ ok: false, error: { code: "invalid_amount", field: "merchandiseSubtotalMinor" } });
  });

  it.each([
    ["below the minimum", 499, 1_000, 10_000, "below_minimum"],
    ["above the cap", 500, 1_000, 1_000, "redemption_cap_exceeded"],
    ["above the available balance", 500, 499, 10_000, "insufficient_balance"],
    ["a negative balance", 500, -1, 10_000, "negative_balance"],
    ["zero points", 0, 1_000, 10_000, "invalid_points"],
  ] as const)("denies redemption %s", (_name, requestedPoints, availablePoints, subtotal, code) => {
    expect(calculateRewardRedemption({ policy: policy(), requestedPoints, availablePoints, postPromotionMerchandiseMinor: subtotal, currency: "USD" })).toEqual({ ok: false, error: { code, field: "requestedPoints" } });
  });

  it("applies the USD-only cap in integer cents", () => {
    expect(calculateRewardRedemption({ policy: policy(), requestedPoints: 500, availablePoints: 700, postPromotionMerchandiseMinor: 2_001, currency: "USD" })).toEqual({ ok: true, value: { redemptionPoints: 500, redemptionMinor: 500, maximumPoints: 500 } });
    expect(calculateRewardRedemption({ policy: policy(), requestedPoints: 500, availablePoints: 700, postPromotionMerchandiseMinor: 2_001, currency: "EUR" })).toEqual({ ok: false, error: { code: "currency_mismatch", field: "currency" } });
  });

  it("returns deeply frozen decisions", () => {
    const result = calculateRewardRedemption({ policy: policy(), requestedPoints: 500, availablePoints: 500, postPromotionMerchandiseMinor: 2_000, currency: "USD" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
  });
});
