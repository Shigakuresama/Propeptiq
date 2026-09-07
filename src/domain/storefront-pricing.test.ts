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
  it.each([[1, 0], [2, 300], [3, 300], [4, 600], [9, 600], [10, 600], [11, 3000], [25, 3000]])(
    "prices %i bottles at %i basis points", (quantity, expected) => expect(quantityDiscountBps(quantity)).toBe(expected),
  );
  it.each([[1, 2, 300], [1, 3, 300], [2, 2, 600], [5, 2, 600], [6, 2, 3000], [1, 10, 600], [2, 10, 3000]])(
    "counts %i packages of %i bottles", (quantity, packageQuantity, expected) => expect(quantityDiscountBps(quantity, packageQuantity)).toBe(expected),
  );
  it.each([0, -1, 26, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid quantity %s", (quantity) => expect(() => quantityDiscountBps(quantity)).toThrow(RangeError),
  );
  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid package size %s", (packageQuantity) => expect(() => quantityDiscountBps(1, packageQuantity)).toThrow(RangeError),
  );
  it("rejects an unsafe bottle count", () => expect(() => quantityDiscountBps(2, Number.MAX_SAFE_INTEGER)).toThrow(RangeError));
  it("keeps exported quantity tiers immutable", () => {
    expect(Object.isFrozen(QUANTITY_TIERS)).toBe(true);
    expect(QUANTITY_TIERS.every(Object.isFrozen)).toBe(true);
  });
});

describe("campaign then volume discounts", () => {
  it.each([[1, 3000], [2, 3210], [3, 3210], [4, 3420], [10, 3420], [11, 5100]])(
    "stacks WINTER30 with the bottle tier at quantity %i", (quantity, expected) => {
      expect(resolveEffectiveDiscount({ quantityDiscountBps: quantityDiscountBps(quantity), eligiblePromotions: [{ id: "winter30", discountBps: 3000 }] }).discountBps).toBe(expected);
    },
  );
  it("selects only the highest campaign with deterministic attribution before volume", () => {
    expect(resolveEffectiveDiscount({ quantityDiscountBps: 600, eligiblePromotions: [
      { id: "alpha", discountBps: 2000 }, { id: "winter30", discountBps: 3000 }, { id: "zulu", discountBps: 3000 },
    ] })).toEqual({ source: "stacked", discountBps: 3420, promotionId: "winter30", campaignDiscountBps: 3000, volumeDiscountBps: 600 });
  });
  it("stacks equal campaign and volume percentages multiplicatively", () => {
    expect(resolveEffectiveDiscount({ quantityDiscountBps: 3000, eligiblePromotions: [{ id: "winter30", discountBps: 3000 }] })).toEqual({ source: "stacked", discountBps: 5100, promotionId: "winter30", campaignDiscountBps: 3000, volumeDiscountBps: 3000 });
  });
  it("uses the bottle tier when no campaign is eligible", () => {
    expect(resolveEffectiveDiscount({ quantityDiscountBps: 600, eligiblePromotions: [] })).toEqual({ source: "quantity", discountBps: 600, promotionId: null, campaignDiscountBps: 0, volumeDiscountBps: 600 });
  });
  it.each([
    { quantityDiscountBps: -1, eligiblePromotions: [] },
    { quantityDiscountBps: 0, eligiblePromotions: [{ id: "bad", discountBps: 10_001 }] },
    { quantityDiscountBps: 0, eligiblePromotions: [{ id: "", discountBps: 1 }] },
  ])("rejects invalid effective discounts %j", (input) => expect(() => resolveEffectiveDiscount(input)).toThrow(RangeError));
  it("compares combined storefront savings with referral without reward stacking", () => {
    expect(selectBestAcquisitionDiscount({ candidates: [{ source: "promotion", discountMinor: 3_000 }, { source: "referral", discountMinor: 5_000 }] })).toMatchObject({ ok: true, value: { source: "referral", discountMinor: 5_000 } });
  });
});

describe("integer line pricing", () => {
  it("rounds each sequential unit discount half up, then multiplies; savings reconcile", () => {
    expect(calculateVariantLinePrice({ variantId: "fixture", baseUnitMinor: 1005, quantity: 2,
      effectiveDiscount: resolveEffectiveDiscount({ quantityDiscountBps: 300, eligiblePromotions: [{ id: "winter30", discountBps: 3000 }] }),
    })).toMatchObject({ campaignUnitMinor: 704, effectiveUnitMinor: 683, lineSubtotalMinor: 1366, lineCampaignSavingsMinor: 602, lineVolumeSavingsMinor: 42, lineSavingsMinor: 644 });
  });
  it("keeps zero preview math out of checkout", () => {
    expect(calculateVariantLinePrice({ variantId: "fixture", baseUnitMinor: 0, quantity: 11,
      effectiveDiscount: resolveEffectiveDiscount({ quantityDiscountBps: 3000, eligiblePromotions: [{ id: "winter30", discountBps: 3000 }] }),
    })).toMatchObject({ effectiveUnitMinor: 0, lineSubtotalMinor: 0, lineCampaignSavingsMinor: 0, lineVolumeSavingsMinor: 0, checkoutReady: false });
  });
  it("keeps pending prices out of checkout", () => {
    expect(calculateVariantLinePrice({ variantId: "fixture", baseUnitMinor: 999, quantity: 1, priceStatus: "pending",
      effectiveDiscount: resolveEffectiveDiscount({ quantityDiscountBps: 0, eligiblePromotions: [] }),
    }).checkoutReady).toBe(false);
  });
  it("rejects a subtotal exceeding the safe integer range", () => {
    expect(() => calculateVariantLinePrice({ variantId: "fixture", baseUnitMinor: Number.MAX_SAFE_INTEGER, quantity: 2,
      effectiveDiscount: resolveEffectiveDiscount({ quantityDiscountBps: 0, eligiblePromotions: [] }),
    })).toThrow(RangeError);
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
  it.each([
    ["startAt", "2026-09-01T12:00:00.001000001Z", false],
    ["startAt", "2026-09-01T12:00:00.000999999Z", true],
    ["endAt", "2026-09-01T12:00:00.001000001Z", true],
    ["endAt", "2026-09-01T12:00:00.001000000Z", false],
  ])("compares nanosecond %s boundaries exactly", (boundary, instant, expected) => {
    const promotion = activePromotion({ [boundary]: instant });
    expect(isStorefrontPromotionActive(promotion, new Date("2026-09-01T12:00:00.001Z"))).toBe(expected);
  });

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
