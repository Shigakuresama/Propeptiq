import { describe, expect, it } from "vitest";

import {
  CART_STORAGE_KEY,
  MAX_CART_ITEM_QUANTITY,
  deserializeCart,
  normalizeCart,
  prepareCheckoutHandoff,
  restoreCheckoutHandoff,
  serializeCart,
} from "./cart-storage";
import { buildCartPreview, buildSafeCartPreview, canContinueFromPreview, type CartPreviewSource, type CartPreviewVariant } from "./preview";
import { CartPreviewProjectionError } from "./storefront-preview-source";

const variants = [
  {
    variantId: "variant-5mg", productId: "product-alpha", name: "Synthetic local test only — Alpha",
    packageQuantity: 1, packageForm: "5mg research vial", variantLabel: "5 mg", sku: "TEST-5MG", checkoutReady: true, baseUnitMinor: 2400, currency: "USD" as const,
    priceStatus: "active" as const, availability: "available" as const, availableQuantity: 25, eligiblePromotions: [],
  },
  {
    variantId: "variant-10mg", productId: "product-alpha", name: "Synthetic local test only — Alpha",
    packageQuantity: 1, packageForm: "10mg research vial", variantLabel: "10 mg", sku: "TEST-10MG", checkoutReady: true, baseUnitMinor: 3200, currency: "USD" as const,
    priceStatus: "active" as const, availability: "available" as const, availableQuantity: 25, eligiblePromotions: [],
  },
] as const;

const source: CartPreviewSource = { mode: "local", variants };
const winter30 = { id: "winter30", displayLabel: "WINTER30", discountBps: 3_000 };
function previewLine(overrides: Partial<CartPreviewVariant> = {}, quantity = 1, mode: CartPreviewSource["mode"] = "production") {
  return buildCartPreview([{ variantId: variants[0].variantId, quantity }], {
    mode, variants: [{ ...variants[0], ...overrides }],
  });
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("anonymous variant cart persistence", () => {
  it("merges repeated additions of the exact variant", () => {
    expect(normalizeCart([{ variantId: "variant-a", quantity: 1 }, { variantId: "variant-a", quantity: 2 }]))
      .toEqual([{ variantId: "variant-a", quantity: 3 }]);
  });

  it("keeps mg variants on separate lines", () => {
    expect(normalizeCart([{ variantId: "variant-5mg", quantity: 2 }, { variantId: "variant-10mg", quantity: 2 }]))
      .toEqual([{ variantId: "variant-5mg", quantity: 2 }, { variantId: "variant-10mg", quantity: 2 }]);
  });

  it("clamps a variant line at 25 individual vials", () => {
    expect(normalizeCart([{ variantId: "variant-a", quantity: MAX_CART_ITEM_QUANTITY }, { variantId: "variant-a", quantity: 26 }]))
      .toEqual([{ variantId: "variant-a", quantity: MAX_CART_ITEM_QUANTITY }]);
  });

  it("keeps no more than 50 distinct variants", () => {
    expect(normalizeCart(Array.from({ length: 51 }, (_, index) => ({ variantId: `variant-${index}`, quantity: 1 })))).toHaveLength(50);
  });

  it("stores only normalized variant IDs and bounded positive integer quantities", () => {
    const normalized = normalizeCart([
      { variantId: "variant-alpha", quantity: 2, name: "Browser lie" },
      { variantId: "variant-alpha", quantity: 3, amountMinor: 1 },
      { variantId: "bad id with spaces", quantity: 2 },
      { variantId: "variant-negative", quantity: -1 },
      { variantId: "variant-fraction", quantity: 1.5 },
      { variantId: "variant-large", quantity: 99999 },
    ]);
    expect(normalized).toEqual([
      { variantId: "variant-alpha", quantity: 5 },
      { variantId: "variant-large", quantity: MAX_CART_ITEM_QUANTITY },
    ]);
    expect(JSON.parse(serializeCart(normalized))).toEqual({ version: 2, items: normalized });
  });

  it("fails closed when persisted v2 data is malformed", () => {
    expect(deserializeCart("not-json")).toEqual({ status: "ready", items: [] });
    expect(deserializeCart(JSON.stringify({ version: 2, items: [{ variantId: "variant-alpha", quantity: "2" }] })))
      .toEqual({ status: "ready", items: [] });
  });

  it("persists and restores the same variant/quantity cart across the checkout handoff seam", () => {
    const storage = new MemoryStorage();
    const items = [{ variantId: "variant-alpha", quantity: 2 }];
    expect(prepareCheckoutHandoff(storage, items)).toEqual({ returnTo: "/checkout", itemCount: 2 });
    expect(restoreCheckoutHandoff(storage)).toEqual({ status: "ready", items });
    expect(storage.getItem(CART_STORAGE_KEY)).toBe(JSON.stringify({ version: 2, items }));
  });
});

describe("authoritative variant cart preview", () => {
  it("reprices a merged variant line through the shared quantity tiers", () => {
    const one = buildCartPreview([{ variantId: "variant-5mg", quantity: 1 }], source);
    const two = buildCartPreview([{ variantId: "variant-5mg", quantity: 2 }], source);
    const three = buildCartPreview([{ variantId: "variant-5mg", quantity: 3 }], source);
    const ten = buildCartPreview([{ variantId: "variant-5mg", quantity: 10 }], source);
    expect(one.items[0]).toMatchObject({ variantId: "variant-5mg", lineSubtotalMinor: 2400 });
    expect(two.items[0]).toMatchObject({ variantId: "variant-5mg", lineSubtotalMinor: 4656 });
    expect(three.items[0]).toMatchObject({ variantId: "variant-5mg", lineSubtotalMinor: 6984 });
    expect(ten.items[0]).toMatchObject({ variantId: "variant-5mg", lineSubtotalMinor: 22560 });
  });

  it("keeps unknown canonical variants unavailable without accepting browser facts", () => {
    const preview = buildCartPreview([
      { variantId: "variant-5mg", quantity: 2, name: "Browser lie", amountMinor: 1 },
      { variantId: "unknown-variant", quantity: 3 },
    ], source);
    expect(preview.items).toEqual([
      expect.objectContaining({ variantId: "variant-5mg", quantity: 2, name: "Synthetic local test only — Alpha", available: true }),
      expect.objectContaining({ variantId: "unknown-variant", quantity: 3, available: false }),
    ]);
    expect(preview.requiresAcknowledgement).toBe(true);
    expect(canContinueFromPreview(preview, null)).toBe(false);
  });
});

describe("version 2 display preview truth", () => {
  it("fails closed when individually safe prices overflow the preview subtotal", () => {
    const oversized = { ...source, variants: variants.map((variant) => ({ ...variant, baseUnitMinor: Number.MAX_SAFE_INTEGER })) };
    expect(() => buildCartPreview(variants.map((variant) => ({ variantId: variant.variantId, quantity: 1 })), oversized)).toThrow(CartPreviewProjectionError);
  });
  it.each([
    [1, 0, 2_400, 2_400, 0], [2, 300, 2_328, 4_656, 144],
    [3, 300, 2_328, 6_984, 216], [4, 600, 2_256, 9_024, 576],
    [9, 600, 2_256, 20_304, 1_296], [10, 600, 2_256, 22_560, 1_440],
    [11, 3_000, 1_680, 18_480, 7_920],
  ])("projects quantity %i with coherent full display facts", (quantity, discount, unit, subtotal, savings) => {
    const preview = previewLine({}, quantity);
    expect(preview.schemaVersion).toBe(2);
    expect(preview.items).toEqual([{
      variantId: "variant-5mg", quantity, available: true, purchaseState: "ready",
      name: "Synthetic local test only — Alpha", variantLabel: "5 mg", sku: "TEST-5MG",
      packageQuantity: 1, packageForm: "5mg research vial", baseUnitMinor: 2_400, unitAmountMinor: unit,
      lineSubtotalMinor: subtotal, lineSavingsMinor: savings, effectiveDiscountBps: discount, campaignDiscountBps: 0, volumeDiscountBps: discount, campaignUnitMinor: 2400, lineCampaignSavingsMinor: 0, lineVolumeSavingsMinor: savings,
      appliedPromotions: [], currency: "USD",
    }]);
    expect(preview.subtotalMinor).toBe(subtotal);
    expect(preview.reasons).toEqual([]);
    expect(preview.requiresAcknowledgement).toBe(false);
    expect(canContinueFromPreview(preview, null)).toBe(true);
  });

  it.each([[1, 1680, 0, 3000], [2, 1630, 300, 3210], [3, 1630, 300, 3210], [4, 1579, 600, 3420], [10, 1579, 600, 3420], [11, 1176, 3000, 5100]])("stacks WINTER30 then volume at quantity %i", (quantity, unit, volume, combined) => {
    expect(previewLine({ eligiblePromotions: [winter30] }, quantity).items[0]).toMatchObject({
      unitAmountMinor: unit, lineSubtotalMinor: unit * quantity,
      lineSavingsMinor: (2400 - unit) * quantity, effectiveDiscountBps: combined,
      campaignDiscountBps: 3000, volumeDiscountBps: volume, campaignUnitMinor: 1680,
      lineCampaignSavingsMinor: 720 * quantity, lineVolumeSavingsMinor: (1680 - unit) * quantity,
      appliedPromotions: [{ id: "winter30", label: "WINTER30" }],
    });
  });

  it("chooses only the highest campaign before stacking volume", () => {
    expect(previewLine({ eligiblePromotions: [winter30, { id: "test35", displayLabel: "Synthetic 35", discountBps: 3_500 }] }, 2).items[0])
      .toMatchObject({ unitAmountMinor: 1_513, lineSubtotalMinor: 3_026, effectiveDiscountBps: 3_695, appliedPromotions: [{ id: "test35", label: "Synthetic 35" }] });
    expect(previewLine({ eligiblePromotions: [{ ...winter30, discountBps: 800 }] }, 10).items[0])
      .toMatchObject({ unitAmountMinor: 2_076, effectiveDiscountBps: 1_352, appliedPromotions: [{ id: "winter30", label: "WINTER30" }] });
  });

  it.each([[1, 10, 600, 1579], [2, 10, 3000, 1176], [2, 2, 600, 1579]])("prices %i packages of %i bottles", (quantity, packageQuantity, volumeDiscountBps, unitAmountMinor) => {
    expect(previewLine({ packageQuantity, eligiblePromotions: [winter30] }, quantity).items[0]).toMatchObject({ packageQuantity, volumeDiscountBps, unitAmountMinor, lineSubtotalMinor: quantity * unitAmountMinor });
  });

  it.each(["local", "test", "preview", "production"] as const)("keeps priced public rows display-only in %s", (mode) => {
    const preview = previewLine({ availability: "preview_only", checkoutReady: false, availableQuantity: null, eligiblePromotions: [winter30] }, 2, mode);
    expect(preview.items[0]).toMatchObject({ purchaseState: mode === "production" ? "checkout_unavailable" : "local_preview", available: false, unitAmountMinor: 1_630 });
    expect(preview.reasons).toEqual(["checkout_unavailable"]);
    expect(canContinueFromPreview(preview, preview.previewToken)).toBe(false);
  });

  it.each(["local", "test", "preview", "production"] as const)("distinguishes pending zero from null in %s", (mode) => {
    const pending = { availability: "preview_only" as const, checkoutReady: false, availableQuantity: null, priceStatus: "pending" as const, eligiblePromotions: [winter30] };
    const zero = previewLine({ ...pending, baseUnitMinor: 0 }, 2, mode);
    expect(zero.items[0]).toMatchObject(mode === "production" ? {
      purchaseState: "pricing_pending", baseUnitMinor: null, unitAmountMinor: null, lineSubtotalMinor: null,
      lineSavingsMinor: null, effectiveDiscountBps: null, campaignDiscountBps: null, volumeDiscountBps: null, campaignUnitMinor: null, lineCampaignSavingsMinor: null, lineVolumeSavingsMinor: null, appliedPromotions: [], currency: null,
    } : { purchaseState: "local_preview", baseUnitMinor: 0, unitAmountMinor: 0, lineSubtotalMinor: 0, lineSavingsMinor: 0, effectiveDiscountBps: 3_210, currency: "USD" });
    expect(previewLine({ ...pending, baseUnitMinor: null, currency: null }, 2, mode).items[0]).toMatchObject({
      purchaseState: "pricing_pending", available: false, baseUnitMinor: null, unitAmountMinor: null,
      lineSubtotalMinor: null, lineSavingsMinor: null, effectiveDiscountBps: null, campaignDiscountBps: null, volumeDiscountBps: null, campaignUnitMinor: null, lineCampaignSavingsMinor: null, lineVolumeSavingsMinor: null, appliedPromotions: [], currency: null,
    });
  });

  it.each([
    [{ availableQuantity: 1 }, "insufficient_quantity", 2_328],
    [{ availableQuantity: 2 }, "ready", 2_328],
    [{ availableQuantity: null }, "checkout_unavailable", 2_328],
    [{ checkoutReady: false, availableQuantity: 0 }, "checkout_unavailable", 2_328],
    [{ availability: "unavailable" }, "unavailable", null],
    [{ priceStatus: "unavailable" }, "unavailable", null],
  ] as const)("resolves authoritative state for %j", (overrides, state, unit) => {
    const preview = previewLine(overrides, 2);
    expect(preview.items[0]).toMatchObject({ purchaseState: state, available: state === "ready", unitAmountMinor: unit });
    expect(canContinueFromPreview(preview, preview.previewToken)).toBe(state === "ready");
  });

  it("returns exact null display facts for unknown variants and ignores browser claims", () => {
    const preview = buildCartPreview([{ variantId: "unknown", quantity: 1, name: "Lie", available: true, unitAmountMinor: 1, purchaseState: "ready" }], source);
    expect(preview.items).toEqual([{
      variantId: "unknown", quantity: 1, available: false, purchaseState: "unknown_variant",
      name: null, variantLabel: null, sku: null, packageQuantity: null, packageForm: null, baseUnitMinor: null,
      unitAmountMinor: null, lineSubtotalMinor: null, lineSavingsMinor: null,
      effectiveDiscountBps: null, campaignDiscountBps: null, volumeDiscountBps: null, campaignUnitMinor: null, lineCampaignSavingsMinor: null, lineVolumeSavingsMinor: null, appliedPromotions: [], currency: null,
    }]);
    expect(preview.reasons).toEqual(["unknown_variant"]);
  });

  it("merges exact IDs before calculating while keeping another variant separate", () => {
    const preview = buildCartPreview([{ variantId: "variant-5mg", quantity: 1 }, { variantId: "variant-5mg", quantity: 1 }, { variantId: "variant-10mg", quantity: 1 }], source);
    expect(preview.items).toMatchObject([{ variantId: "variant-5mg", quantity: 2, unitAmountMinor: 2_328 }, { variantId: "variant-10mg", quantity: 1, unitAmountMinor: 3_200 }]);
  });

  it("hashes quantities and every changed identity, price, promotion and state fact", () => {
    const base = { eligiblePromotions: [winter30] };
    const original = previewLine(base, 1);
    expect(previewLine(base, 1).previewToken).toBe(original.previewToken);
    expect(previewLine(base, 2).items[0]?.unitAmountMinor).toBe(1630);
    expect(previewLine(base, 2).previewToken).not.toBe(original.previewToken);
    for (const changed of [
      { name: "Synthetic renamed product" }, { variantLabel: "Synthetic renamed variant" },
      { sku: "TEST-NEW-SKU" }, { packageQuantity: 1, packageForm: "Synthetic new package" },
      { checkoutReady: false }, { baseUnitMinor: 2_401 },
      { eligiblePromotions: [{ ...winter30, id: "new-promotion-id" }] },
      { eligiblePromotions: [{ ...winter30, displayLabel: "NEW LABEL" }] },
    ]) expect(previewLine({ ...base, ...changed }).previewToken).not.toBe(original.previewToken);
  });

  it("orders and deduplicates reasons independently of line order and only acknowledges changed facts", () => {
    const states: CartPreviewVariant[] = [
      { ...variants[0], variantId: "insufficient", availableQuantity: 0 },
      { ...variants[0], variantId: "unavailable", availability: "unavailable" },
      { ...variants[0], variantId: "pending", priceStatus: "pending", baseUnitMinor: null, currency: null },
      { ...variants[0], variantId: "preview", availability: "preview_only", checkoutReady: false, availableQuantity: null },
      { ...variants[0], variantId: "preview-again", availability: "preview_only", checkoutReady: false, availableQuantity: null },
    ];
    const preview = buildCartPreview(["unknown", ...states.map((row) => row.variantId)].map((variantId) => ({ variantId, quantity: 1 })), { mode: "local", variants: states }, "old-token");
    expect(preview.reasons).toEqual(["server_facts_changed", "checkout_unavailable", "pricing_pending", "product_unavailable", "insufficient_quantity", "unknown_variant"]);
    expect(preview.requiresAcknowledgement).toBe(true);
    expect(preview.items.every((item) => item.available === (item.purchaseState === "ready"))).toBe(true);
    expect(canContinueFromPreview(preview, preview.previewToken)).toBe(false);
    const ready = buildCartPreview([{ variantId: "variant-5mg", quantity: 1 }], source, "old-token");
    expect(ready.reasons).toEqual(["server_facts_changed"]);
    expect(canContinueFromPreview(ready, null)).toBe(false);
    expect(canContinueFromPreview(ready, ready.previewToken)).toBe(true);
    expect(canContinueFromPreview(buildCartPreview([], source), null)).toBe(false);
    expect(canContinueFromPreview({ ...previewLine(), items: [{ ...previewLine().items[0]!, available: true, purchaseState: "checkout_unavailable" }] }, null)).toBe(false);
  });

  it("preserves the exact separate checkout-safe preview shape", () => {
    const line = { variantId: "safe", quantity: 1, available: true, name: "Synthetic safe", packageForm: "sealed unit", variantLabel: "5 mg", sku: "SAFE-5", unitAmountMinor: 2_400, lineSubtotalMinor: 2_400, currency: "USD" };
    expect(buildSafeCartPreview([line])).toEqual({ items: [line], subtotalMinor: 2_400, currency: "USD", taxMinor: null, shippingMinor: null, finalDiscountMinor: null });
  });
});
