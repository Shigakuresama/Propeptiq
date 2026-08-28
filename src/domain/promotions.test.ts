import { describe, expect, it } from "vitest";

import {
  calculatePromotionDiscount,
  selectBestAcquisitionDiscount,
  type PromotionCalculationInput,
  type PromotionRecord,
} from "@/domain/promotions";

const lines = [
  {
    authority: "server_resolved_price",
    productId: "product-a",
    policyGroupId: "group-a",
    grossSubtotalMinor: 500,
  },
  {
    authority: "server_resolved_price",
    productId: "product-b",
    policyGroupId: "group-b",
    grossSubtotalMinor: 300,
  },
] as const;

function promotion(overrides: Partial<PromotionRecord> = {}): PromotionRecord {
  return {
    authority: "server_resolved_promotion",
    id: "promotion-a",
    version: 1,
    code: "SAVE",
    name: "Synthetic savings",
    kind: "discount",
    status: "active",
    currentlyEffective: true,
    amountMinor: 101,
    currency: "USD",
    basisPoints: null,
    targetProductIds: ["product-a"],
    targetPolicyGroupIds: [],
    ...overrides,
  };
}

function calculate(overrides: Partial<PromotionCalculationInput> = {}) {
  return calculatePromotionDiscount({
    currency: "USD",
    lines,
    promotions: [promotion()],
    ...overrides,
  });
}

describe("calculatePromotionDiscount", () => {
  it("selects exactly one greatest customer acquisition discount without stacking", () => {
    expect(
      selectBestAcquisitionDiscount({
        candidates: [
          { source: "promotion", discountMinor: 1_000 },
          { source: "referral", discountMinor: 2_500 },
        ],
      }),
    ).toEqual({ ok: true, value: { source: "referral", discountMinor: 2_500 } });
  });

  it("rejects sparse, malformed, or unknown acquisition discount candidates", () => {
    const sparse = [{ source: "promotion", discountMinor: 100 }];
    sparse.length = 2;
    expect(selectBestAcquisitionDiscount({ candidates: sparse })).toEqual({
      ok: false,
      error: { code: "invalid_input", field: "candidates" },
    });
    expect(
      selectBestAcquisitionDiscount({
        candidates: [{ source: "promotion", discountMinor: 100, extra: true }] as never,
      }),
    ).toEqual({
      ok: false,
      error: { code: "invalid_input", field: "candidates[0].extra" },
    });
    expect(
      selectBestAcquisitionDiscount({
        candidates: [Object.assign(Object.create({ inherited: true }), { source: "promotion", discountMinor: 100 })],
      }),
    ).toEqual({
      ok: false,
      error: { code: "invalid_input", field: "candidates[0].inherited" },
    });
  });
  it("returns canonical zero allocations without a promotion", () => {
    expect(calculate({ lines: [...lines].reverse(), promotions: [] })).toEqual({
      ok: true,
      value: {
        discountMinor: 0,
        allocations: [
          { productId: "product-a", discountMinor: 0 },
          { productId: "product-b", discountMinor: 0 },
        ],
      },
    });
  });

  it("rejects stacking before evaluating either promotion", () => {
    expect(
      calculate({ promotions: [promotion(), promotion({ id: "promotion-b" })] }),
    ).toEqual({
      ok: false,
      error: { code: "multiple_promotions", field: "promotions" },
    });
  });

  it.each([
    ["draft", true, "promotion_not_active", "promotions[0].status"],
    ["retired", true, "promotion_not_active", "promotions[0].status"],
    ["active", false, "promotion_not_current", "promotions[0].currentlyEffective"],
  ] as const)("rejects %s/current=%s promotions", (status, currentlyEffective, code, field) => {
    expect(calculate({ promotions: [promotion({ status, currentlyEffective })] })).toEqual({
      ok: false,
      error: { code, field },
    });
  });

  it.each(["bundle", "subscription", "loyalty", "cross_sell"] as const)(
    "rejects merchandising-only %s promotions",
    (kind) => {
      expect(calculate({ promotions: [promotion({ kind })] })).toEqual({
        ok: false,
        error: { code: "unsupported_kind", field: "promotions[0].kind" },
      });
    },
  );

  it("requires a positive version and a nonempty matching target set", () => {
    expect(calculate({ promotions: [promotion({ version: 0 })] })).toEqual({
      ok: false,
      error: { code: "invalid_input", field: "promotions[0].version" },
    });
    expect(
      calculate({
        promotions: [
          promotion({ targetProductIds: [], targetPolicyGroupIds: [] }),
        ],
      }),
    ).toEqual({
      ok: false,
      error: { code: "promotion_not_applicable", field: "promotions[0].targets" },
    });
    expect(
      calculate({ promotions: [promotion({ targetProductIds: ["other"] })] }),
    ).toEqual({
      ok: false,
      error: { code: "promotion_not_applicable", field: "promotions[0].targets" },
    });
  });

  it("caps a fixed discount at the eligible subtotal", () => {
    expect(calculate({ promotions: [promotion({ amountMinor: 999 })] })).toEqual({
      ok: true,
      value: {
        discountMinor: 500,
        allocations: [
          { productId: "product-a", discountMinor: 500 },
          { productId: "product-b", discountMinor: 0 },
        ],
      },
    });
  });

  it("calculates basis points across product and policy-group targets", () => {
    expect(
      calculate({
        promotions: [
          promotion({
            amountMinor: null,
            currency: null,
            basisPoints: 1250,
            targetProductIds: ["product-a"],
            targetPolicyGroupIds: ["group-b"],
          }),
        ],
      }),
    ).toEqual({
      ok: true,
      value: {
        discountMinor: 100,
        allocations: [
          { productId: "product-a", discountMinor: 63 },
          { productId: "product-b", discountMinor: 37 },
        ],
      },
    });
  });

  it("uses largest remainder and lexical product ID for exact-cent ties", () => {
    expect(
      calculate({
        lines: [
          { ...lines[0], productId: "product-b", grossSubtotalMinor: 1 },
          { ...lines[1], productId: "product-a", grossSubtotalMinor: 1 },
          { ...lines[1], productId: "product-c", grossSubtotalMinor: 1 },
        ],
        promotions: [
          promotion({
            amountMinor: 2,
            targetProductIds: ["product-a", "product-b", "product-c"],
          }),
        ],
      }),
    ).toEqual({
      ok: true,
      value: {
        discountMinor: 2,
        allocations: [
          { productId: "product-a", discountMinor: 1 },
          { productId: "product-b", discountMinor: 1 },
          { productId: "product-c", discountMinor: 0 },
        ],
      },
    });
  });

  it("returns exact zero allocations for matching zero-subtotal lines", () => {
    expect(
      calculate({
        lines: [{ ...lines[0], grossSubtotalMinor: 0 }],
        promotions: [promotion({ amountMinor: 25 })],
      }),
    ).toEqual({
      ok: true,
      value: {
        discountMinor: 0,
        allocations: [{ productId: "product-a", discountMinor: 0 }],
      },
    });
  });

  it.each([
    [promotion({ amountMinor: null, currency: "USD", basisPoints: null }), "promotions[0]"],
    [promotion({ amountMinor: 10, currency: "USD", basisPoints: 500 }), "promotions[0]"],
    [promotion({ amountMinor: 0 }), "promotions[0].amountMinor"],
    [promotion({ amountMinor: null, currency: null, basisPoints: 0 }), "promotions[0].basisPoints"],
    [promotion({ amountMinor: null, currency: null, basisPoints: 10001 }), "promotions[0].basisPoints"],
  ] as const)("rejects invalid discount shape %#", (candidate, field) => {
    expect(calculate({ promotions: [candidate] })).toEqual({
      ok: false,
      error: { code: "invalid_discount", field },
    });
  });

  it("distinguishes malformed and mismatched currencies", () => {
    expect(calculate({ currency: "usd" })).toEqual({
      ok: false,
      error: { code: "invalid_currency", field: "currency" },
    });
    expect(calculate({ promotions: [promotion({ currency: "EUR" })] })).toEqual({
      ok: false,
      error: { code: "currency_mismatch", field: "promotions[0].currency" },
    });
  });

  it("rejects wrong authorities, sparse arrays, and duplicate lines", () => {
    expect(
      calculate({
        lines: [{ ...lines[0], authority: "browser_price" as never }],
      }),
    ).toEqual({
      ok: false,
      error: { code: "invalid_input", field: "lines[0].authority" },
    });
    expect(
      calculate({
        promotions: [
          promotion({ authority: "browser_promotion" as never }),
        ],
      }),
    ).toEqual({
      ok: false,
      error: { code: "invalid_input", field: "promotions[0].authority" },
    });
    expect(
      calculate({
        lines: [lines[0], { ...lines[1], productId: "product-a" }],
      }),
    ).toEqual({
      ok: false,
      error: { code: "invalid_line", field: "lines[1].productId" },
    });
    const sparseLines = [lines[0]];
    sparseLines.length = 2;
    expect(calculate({ lines: sparseLines })).toEqual({
      ok: false,
      error: { code: "invalid_input", field: "lines" },
    });
  });

  it("validates dense unique targets and every record identity field", () => {
    expect(
      calculate({
        promotions: [
          promotion({ targetProductIds: ["product-a", "product-a"] }),
        ],
      }),
    ).toEqual({
      ok: false,
      error: { code: "invalid_input", field: "promotions[0].targetProductIds" },
    });
    expect(calculate({ promotions: [promotion({ code: "   " })] })).toEqual({
      ok: false,
      error: { code: "invalid_input", field: "promotions[0].code" },
    });
  });

  it("fails safely when eligible subtotal addition exceeds a safe integer", () => {
    expect(
      calculate({
        lines: [
          { ...lines[0], grossSubtotalMinor: Number.MAX_SAFE_INTEGER },
          { ...lines[1], grossSubtotalMinor: 1 },
        ],
        promotions: [
          promotion({ targetProductIds: ["product-a", "product-b"] }),
        ],
      }),
    ).toEqual({
      ok: false,
      error: { code: "arithmetic_overflow", field: "eligibleSubtotalMinor" },
    });
  });

  it("returns deeply frozen successes and failures", () => {
    const success = calculate();
    expect(success.ok).toBe(true);
    if (!success.ok) return;
    expect(Object.isFrozen(success)).toBe(true);
    expect(Object.isFrozen(success.value)).toBe(true);
    expect(Object.isFrozen(success.value.allocations)).toBe(true);
    expect(Object.isFrozen(success.value.allocations[0])).toBe(true);

    const failure = calculate({
      promotions: [promotion({ status: "draft" })],
    });
    expect(Object.isFrozen(failure)).toBe(true);
    expect(!failure.ok && Object.isFrozen(failure.error)).toBe(true);
  });
});
