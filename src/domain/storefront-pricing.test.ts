import { describe, expect, it } from "vitest";
import { selectBestAcquisitionDiscount } from "./promotions";
import {
  calculateVariantLinePrice,
  isStorefrontPromotionActive,
  promotionApplies,
  QUANTITY_TIERS,
  quantityDiscountBps,
  resolveEffectiveDiscount,
  type StorefrontPromotion,
} from "./storefront-pricing";

describe("quantityDiscountBps", () => {
  it.each([
    [1, 0],
    [2, 800],
    [3, 1000],
    [4, 1000],
    [9, 1000],
    [10, 3000],
    [11, 3000],
    [25, 3000],
  ])("prices quantity %i at %i basis points", (quantity, expected) => {
    expect(quantityDiscountBps(quantity)).toBe(expected);
  });

  it.each([0, -1, 26, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid quantity %s",
    (quantity) => expect(() => quantityDiscountBps(quantity)).toThrow(RangeError),
  );

  it("keeps exported quantity tiers immutable", () => {
    try {
      (QUANTITY_TIERS[0] as { discountBps: number }).discountBps = 9_999;
    } catch {
      // Strict-mode assignment to a frozen tier is expected to throw.
    }
    expect(Object.isFrozen(QUANTITY_TIERS[0])).toBe(true);
    expect(quantityDiscountBps(1)).toBe(0);
  });
});

describe("nonstacking discounts", () => {
  it.each([
    [1, 3000],
    [2, 3000],
    [3, 3000],
    [10, 3000],
  ])("applies WINTER30 once at quantity %i", (quantity, expected) => {
    expect(
      resolveEffectiveDiscount({
        quantityDiscountBps: quantityDiscountBps(quantity),
        eligiblePromotions: [{ id: "winter30", discountBps: 3000 }],
      }).discountBps,
    ).toBe(expected);
  });

  it("selects the highest overlapping promotion with deterministic attribution", () => {
    expect(
      resolveEffectiveDiscount({
        quantityDiscountBps: 1000,
        eligiblePromotions: [
          { id: "alpha", discountBps: 2000 },
          { id: "winter30", discountBps: 3000 },
          { id: "zulu", discountBps: 3000 },
        ],
      }),
    ).toEqual({ source: "promotion", discountBps: 3000, promotionId: "winter30" });
  });

  it("gives a tied promotion attribution without stacking its percentage", () => {
    expect(
      resolveEffectiveDiscount({
        quantityDiscountBps: 3000,
        eligiblePromotions: [{ id: "winter30", discountBps: 3000 }],
      }),
    ).toEqual({ source: "promotion", discountBps: 3000, promotionId: "winter30" });
  });

  it("uses the quantity tier when no promotion is eligible", () => {
    expect(resolveEffectiveDiscount({ quantityDiscountBps: 1000, eligiblePromotions: [] })).toEqual({
      source: "quantity",
      discountBps: 1000,
      promotionId: null,
    });
  });

  it.each([
    [{ quantityDiscountBps: -1, eligiblePromotions: [] }, "quantityDiscountBps"],
    [{ quantityDiscountBps: 0, eligiblePromotions: [{ id: "bad", discountBps: 10_001 }] }, "eligiblePromotions[0].discountBps"],
    [{ quantityDiscountBps: 0, eligiblePromotions: [{ id: "", discountBps: 1 }] }, "eligiblePromotions[0].id"],
  ])("rejects invalid effective discount values (%j)", (input) => {
    expect(() => resolveEffectiveDiscount(input)).toThrow(RangeError);
  });

  it("compares storefront savings with referral without reward stacking", () => {
    expect(
      selectBestAcquisitionDiscount({
        candidates: [
          { source: "promotion", discountMinor: 3_000 },
          { source: "referral", discountMinor: 5_000 },
        ],
      }),
    ).toMatchObject({ ok: true, value: { source: "referral", discountMinor: 5_000 } });
  });
});

describe("integer line pricing", () => {
  it("rounds the discounted unit once and then multiplies", () => {
    expect(
      calculateVariantLinePrice({
        variantId: "fixture",
        baseUnitMinor: 999,
        quantity: 2,
        effectiveDiscount: { source: "quantity", discountBps: 800, promotionId: null },
      }),
    ).toMatchObject({ effectiveUnitMinor: 919, lineSubtotalMinor: 1838, lineSavingsMinor: 160 });
  });

  it("keeps zero-dollar preview math at zero without declaring checkout readiness", () => {
    expect(
      calculateVariantLinePrice({
        variantId: "fixture",
        baseUnitMinor: 0,
        quantity: 11,
        effectiveDiscount: { source: "promotion", discountBps: 3000, promotionId: "winter30" },
      }),
    ).toMatchObject({ effectiveUnitMinor: 0, lineSubtotalMinor: 0, checkoutReady: false });
  });

  it("keeps pending prices out of checkout while preserving preview math", () => {
    expect(
      calculateVariantLinePrice({
        variantId: "fixture",
        baseUnitMinor: 999,
        quantity: 1,
        priceStatus: "pending",
        effectiveDiscount: { source: "quantity", discountBps: 0, promotionId: null },
      }).checkoutReady,
    ).toBe(false);
  });

  it("rejects a line whose gross or discounted subtotal exceeds safe integer range", () => {
    expect(() =>
      calculateVariantLinePrice({
        variantId: "fixture",
        baseUnitMinor: Number.MAX_SAFE_INTEGER,
        quantity: 2,
        effectiveDiscount: { source: "quantity", discountBps: 0, promotionId: null },
      }),
    ).toThrow(RangeError);
  });
});

const activePromotion = (overrides: Partial<StorefrontPromotion> = {}): StorefrontPromotion => ({
  id: "winter30",
  displayName: "Winter 30",
  displayCode: "WINTER30",
  percentage: 30,
  discountBps: 3000,
  enabled: true,
  startAt: null,
  endAt: null,
  timezone: "America/Los_Angeles",
  scope: { kind: "sitewide" },
  applicationMode: "automatic",
  ...overrides,
});

describe("promotion intervals", () => {
  it("keeps an enabled promotion with no time bounds active", () => {
    expect(isStorefrontPromotionActive(activePromotion(), new Date("2026-08-30T08:00:00.000Z"))).toBe(true);
  });

  it("uses an inclusive start and exclusive end", () => {
    const promotion = {
      enabled: true,
      startAt: "2026-08-30T08:00:00.000Z",
      endAt: "2026-08-31T08:00:00.000Z",
    } as const;
    expect(isStorefrontPromotionActive(promotion, new Date(promotion.startAt))).toBe(true);
    expect(isStorefrontPromotionActive(promotion, new Date(promotion.endAt))).toBe(false);
  });

  it.each([
    [activePromotion({ enabled: false }), true],
    [activePromotion({ startAt: "2026-08-31T08:00:00.000Z" }), true],
    [activePromotion({ endAt: "2026-08-29T08:00:00.000Z" }), true],
    [activePromotion({ startAt: "invalid" }), true],
    [activePromotion({ endAt: "invalid" }), true],
  ])("returns inactive for disabled, scheduled, expired, or invalid promotion %j", (promotion) => {
    expect(isStorefrontPromotionActive(promotion, new Date("2026-08-30T08:00:00.000Z"))).toBe(false);
  });
});

describe("promotion scope", () => {
  const target = { id: "variant-a", productId: "product-a" };

  it.each([
    [activePromotion({ scope: { kind: "sitewide" } }), true],
    [activePromotion({ scope: { kind: "products", productIds: ["product-a"] } }), true],
    [activePromotion({ scope: { kind: "products", productIds: ["product-b"] } }), false],
    [activePromotion({ scope: { kind: "variants", variantIds: ["variant-a"] } }), true],
    [activePromotion({ scope: { kind: "variants", variantIds: ["variant-b"] } }), false],
  ])("evaluates configured scope", (promotion, expected) => {
    expect(promotionApplies(promotion, target)).toBe(expected);
  });

  it("accepts a canonical StorefrontVariant-shaped target", () => {
    expect(promotionApplies(activePromotion({ scope: { kind: "variants", variantIds: ["variant-a"] } }), {
      ...target,
    })).toBe(true);
  });

  it("rejects malformed scope values", () => {
    expect(promotionApplies(activePromotion({ scope: { kind: "products", productIds: [] } }), target)).toBe(false);
    expect(promotionApplies({ ...activePromotion(), scope: { kind: "unknown" } } as never, target)).toBe(false);
  });
});
