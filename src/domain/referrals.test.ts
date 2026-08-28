import { describe, expect, it } from "vitest";

import {
  calculateReferralBenefit,
  parseReferralPolicy,
  selectLastEligibleReferralClick,
  type ReferralPolicy,
} from "@/domain/referrals";

function policy(overrides: Partial<ReferralPolicy> = {}): ReferralPolicy {
  return {
    id: "referral-v1", version: 1, status: "active", attributionDays: 30,
    referredDiscountBasisPoints: 1_000, referredDiscountCapMinor: 2_500,
    referrerPointsPerDollar: 5, referrerRewardCapPoints: 2_500,
    effectiveAt: "2026-08-27T00:00:00.000Z", supersededAt: null, ...overrides,
  };
}

describe("referral domain policies", () => {
  it("selects the last active click inside the exact 30-day window", () => {
    expect(selectLastEligibleReferralClick({ policy: policy(), orderAt: "2026-08-31T00:00:00.000Z", clicks: [
      { code: "ref_older", referrerActorId: "owner-a", status: "active", clickedAt: "2026-08-10T00:00:00.000Z" },
      { code: "ref_last", referrerActorId: "owner-b", status: "active", clickedAt: "2026-08-30T00:00:00.000Z" },
      { code: "ref_inactive", referrerActorId: "owner-c", status: "revoked", clickedAt: "2026-08-30T12:00:00.000Z" },
    ] })).toEqual({ ok: true, value: { code: "ref_last", referrerActorId: "owner-b" } });
  });

  it("does not attribute an expired or inactive referral code", () => {
    expect(selectLastEligibleReferralClick({ policy: policy(), orderAt: "2026-09-01T00:00:00.000Z", clicks: [{ code: "ref_old", referrerActorId: "owner-a", status: "active", clickedAt: "2026-08-01T00:00:00.000Z" }] })).toEqual({ ok: false, error: { code: "referral_code_expired", field: "clicks" } });
    expect(selectLastEligibleReferralClick({ policy: policy(), orderAt: "2026-08-31T00:00:00.000Z", clicks: [{ code: "ref_off", referrerActorId: "owner-a", status: "revoked", clickedAt: "2026-08-30T00:00:00.000Z" }] })).toEqual({ ok: false, error: { code: "referral_code_inactive", field: "clicks" } });
  });

  it("awards a first-order referral benefit with independently capped discount and reward", () => {
    expect(calculateReferralBenefit({ policy: policy(), referral: { code: "ref_valid", referrerActorId: "owner-a", status: "active" }, buyerActorId: "buyer-b", isFirstEligibleOrder: true, buyerPreviouslyRewarded: false, preReferralMerchandiseMinor: 40_000, postDiscountMerchandiseMinor: 80_000, currency: "USD" })).toEqual({ ok: true, value: { discountMinor: 2_500, referrerRewardPoints: 2_500 } });
  });

  it.each([
    ["a non-first eligible order", { isFirstEligibleOrder: false }, "first_order_required"],
    ["a self referral", { buyerActorId: "owner-a" }, "self_referral_denied"],
    ["a buyer already rewarded by this policy", { buyerPreviouslyRewarded: true }, "buyer_already_rewarded"],
    ["an inactive referral", { referral: { code: "ref_off", referrerActorId: "owner-a", status: "revoked" } }, "referral_code_inactive"],
  ] as const)("denies %s", (_name, overrides, code) => {
    expect(calculateReferralBenefit({ policy: policy(), referral: { code: "ref_valid", referrerActorId: "owner-a", status: "active" }, buyerActorId: "buyer-b", isFirstEligibleOrder: true, buyerPreviouslyRewarded: false, preReferralMerchandiseMinor: 1_000, postDiscountMerchandiseMinor: 1_000, currency: "USD", ...overrides })).toEqual({ ok: false, error: { code, field: "referral" } });
  });

  it("rejects malformed policy values and unknown or sparse inputs", () => {
    expect(parseReferralPolicy({ ...policy(), attributionDays: 29 })).toEqual({ ok: false, error: { code: "invalid_policy", field: "attributionDays" } });
    expect(parseReferralPolicy({ ...policy(), extra: true })).toEqual({ ok: false, error: { code: "unexpected_field", field: "extra" } });
    expect(parseReferralPolicy(Object.assign(Object.create({ inherited: true }), policy()))).toEqual({ ok: false, error: { code: "unexpected_field", field: "inherited" } });
    const sparse = [{ code: "ref_valid", referrerActorId: "owner-a", status: "active", clickedAt: "2026-08-30T00:00:00.000Z" }];
    sparse.length = 2;
    expect(selectLastEligibleReferralClick({ policy: policy(), orderAt: "2026-08-31T00:00:00.000Z", clicks: sparse })).toEqual({ ok: false, error: { code: "invalid_input", field: "clicks" } });
  });

  it("returns frozen referral calculations", () => {
    const result = calculateReferralBenefit({ policy: policy(), referral: { code: "ref_valid", referrerActorId: "owner-a", status: "active" }, buyerActorId: "buyer-b", isFirstEligibleOrder: true, buyerPreviouslyRewarded: false, preReferralMerchandiseMinor: 1_000, postDiscountMerchandiseMinor: 1_000, currency: "USD" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.value)).toBe(true);
  });
});
