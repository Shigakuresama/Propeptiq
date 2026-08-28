import { describe, expect, it } from "vitest";

import {
  calculateAffiliateCommission,
  isAffiliatePayoutEligible,
  parseAffiliatePolicy,
  type AffiliatePolicy,
} from "@/domain/affiliates";

function policy(overrides: Partial<AffiliatePolicy> = {}): AffiliatePolicy {
  return {
    id: "affiliate-v1", version: 1, status: "active", attributionDays: 30,
    firstOrderCommissionBasisPoints: 1_000, reorderCommissionBasisPoints: 500,
    reorderWindowDays: 180, approvalDelayDays: 30, payoutThresholdMinor: 5_000,
    currency: "USD", effectiveAt: "2026-08-27T00:00:00.000Z", supersededAt: null,
    ...overrides,
  };
}

describe("affiliate domain policies", () => {
  it("calculates 10 percent on first orders and 5 percent through day 180", () => {
    expect(calculateAffiliateCommission({ policy: policy(), attribution: { program: "affiliate", code: "affiliate_valid", clickedAt: "2026-08-30T00:00:00.000Z" }, partnerStatus: "active", orderKind: "first", daysSinceFirstQualifiedOrder: null, postDiscountMerchandiseMinor: 12_345, refundedMerchandiseMinor: 0, currency: "USD" })).toEqual({ ok: true, value: { commissionMinor: 1_234, reversalMinor: 0, netCommissionMinor: 1_234 } });
    expect(calculateAffiliateCommission({ policy: policy(), attribution: { program: "affiliate", code: "affiliate_valid", clickedAt: "2026-08-30T00:00:00.000Z" }, partnerStatus: "active", orderKind: "reorder", daysSinceFirstQualifiedOrder: 180, postDiscountMerchandiseMinor: 12_345, refundedMerchandiseMinor: 2_345, currency: "USD" })).toEqual({ ok: true, value: { commissionMinor: 617, reversalMinor: 117, netCommissionMinor: 500 } });
  });

  it("returns no commission after the bounded reorder window", () => {
    expect(calculateAffiliateCommission({ policy: policy(), attribution: { program: "affiliate", code: "affiliate_valid", clickedAt: "2026-08-30T00:00:00.000Z" }, partnerStatus: "active", orderKind: "reorder", daysSinceFirstQualifiedOrder: 181, postDiscountMerchandiseMinor: 10_000, refundedMerchandiseMinor: 0, currency: "USD" })).toEqual({ ok: true, value: { commissionMinor: 0, reversalMinor: 0, netCommissionMinor: 0 } });
  });

  it("denies suspended partners and malformed arithmetic inputs", () => {
    expect(calculateAffiliateCommission({ policy: policy(), attribution: { program: "affiliate", code: "affiliate_valid", clickedAt: "2026-08-30T00:00:00.000Z" }, partnerStatus: "suspended", orderKind: "first", daysSinceFirstQualifiedOrder: null, postDiscountMerchandiseMinor: 10_000, refundedMerchandiseMinor: 0, currency: "USD" })).toEqual({ ok: false, error: { code: "partner_suspended", field: "partnerStatus" } });
    expect(calculateAffiliateCommission({ policy: policy(), attribution: { program: "affiliate", code: "affiliate_valid", clickedAt: "2026-08-30T00:00:00.000Z" }, partnerStatus: "active", orderKind: "first", daysSinceFirstQualifiedOrder: null, postDiscountMerchandiseMinor: 1_000, refundedMerchandiseMinor: 1_001, currency: "USD" })).toEqual({ ok: false, error: { code: "invalid_amount", field: "refundedMerchandiseMinor" } });
  });

  it("reverses directly from refunded merchandise rather than rounded commission", () => {
    for (const [refundedMerchandiseMinor, reversalMinor] of [[0, 0], [50, 2], [100, 5], [101, 5]] as const) {
      expect(calculateAffiliateCommission({ policy: policy(), attribution: { program: "affiliate", code: "affiliate_valid", clickedAt: "2026-08-30T00:00:00.000Z" }, partnerStatus: "active", orderKind: "reorder", daysSinceFirstQualifiedOrder: 180, postDiscountMerchandiseMinor: 101, refundedMerchandiseMinor, currency: "USD" })).toEqual({ ok: true, value: { commissionMinor: 5, reversalMinor, netCommissionMinor: 5 - reversalMinor } });
    }
  });

  it("rejects affiliate commission calculation when the exclusive decision belongs to a customer referral", () => {
    expect(calculateAffiliateCommission({ policy: policy(), attribution: { program: "customer_referral", code: "ref_valid", clickedAt: "2026-08-30T00:00:00.000Z" }, partnerStatus: "active", orderKind: "first", daysSinceFirstQualifiedOrder: null, postDiscountMerchandiseMinor: 1_000, refundedMerchandiseMinor: 0, currency: "USD" })).toEqual({ ok: false, error: { code: "attribution_program_mismatch", field: "attribution" } });
  });

  it("enforces the USD payout threshold without rounding", () => {
    expect(isAffiliatePayoutEligible({ policy: policy(), approvedUnpaidCommissionMinor: 4_999, currency: "USD" })).toEqual({ ok: true, value: { eligible: false, shortfallMinor: 1 } });
    expect(isAffiliatePayoutEligible({ policy: policy(), approvedUnpaidCommissionMinor: 5_000, currency: "USD" })).toEqual({ ok: true, value: { eligible: true, shortfallMinor: 0 } });
    expect(isAffiliatePayoutEligible({ policy: policy(), approvedUnpaidCommissionMinor: 5_000, currency: "EUR" })).toEqual({ ok: false, error: { code: "currency_mismatch", field: "currency" } });
  });

  it("rejects policy drift, unknown fields, non-finite values, and unsafe integers", () => {
    expect(parseAffiliatePolicy({ ...policy(), firstOrderCommissionBasisPoints: 999 })).toEqual({ ok: false, error: { code: "invalid_policy", field: "firstOrderCommissionBasisPoints" } });
    expect(parseAffiliatePolicy({ ...policy(), extra: true })).toEqual({ ok: false, error: { code: "unexpected_field", field: "extra" } });
    expect(parseAffiliatePolicy(Object.assign(Object.create({ inherited: true }), policy()))).toEqual({ ok: false, error: { code: "unexpected_field", field: "inherited" } });
    expect(parseAffiliatePolicy(Object.create(policy()))).toEqual({ ok: false, error: { code: "invalid_policy", field: "policy" } });
    expect(parseAffiliatePolicy({ ...policy(), payoutThresholdMinor: Infinity })).toEqual({ ok: false, error: { code: "invalid_policy", field: "payoutThresholdMinor" } });
    expect(parseAffiliatePolicy({ ...policy(), payoutThresholdMinor: Number.MAX_SAFE_INTEGER + 1 })).toEqual({ ok: false, error: { code: "invalid_policy", field: "payoutThresholdMinor" } });
  });

  it("returns frozen affiliate results", () => {
    const result = isAffiliatePayoutEligible({ policy: policy(), approvedUnpaidCommissionMinor: 5_000, currency: "USD" });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.ok && Object.isFrozen(result.value)).toBe(true);
  });
});
