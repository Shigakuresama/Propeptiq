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
import { buildCartPreview, canContinueFromPreview } from "./preview";

const variants = [
  {
    variantId: "variant-5mg", productId: "product-alpha", name: "Synthetic local test only — Alpha",
    packageForm: "5mg research vial", baseUnitMinor: 2400, currency: "USD" as const,
    priceStatus: "active" as const, availability: "available" as const, availableQuantity: 25, eligiblePromotions: [],
  },
  {
    variantId: "variant-10mg", productId: "product-alpha", name: "Synthetic local test only — Alpha",
    packageForm: "10mg research vial", baseUnitMinor: 3200, currency: "USD" as const,
    priceStatus: "active" as const, availability: "available" as const, availableQuantity: 25, eligiblePromotions: [],
  },
] as const;

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
    const one = buildCartPreview([{ variantId: "variant-5mg", quantity: 1 }], { variants });
    const two = buildCartPreview([{ variantId: "variant-5mg", quantity: 2 }], { variants });
    const three = buildCartPreview([{ variantId: "variant-5mg", quantity: 3 }], { variants });
    const ten = buildCartPreview([{ variantId: "variant-5mg", quantity: 10 }], { variants });
    expect(one.items[0]).toMatchObject({ variantId: "variant-5mg", lineSubtotalMinor: 2400 });
    expect(two.items[0]).toMatchObject({ variantId: "variant-5mg", lineSubtotalMinor: 4416 });
    expect(three.items[0]).toMatchObject({ variantId: "variant-5mg", lineSubtotalMinor: 6480 });
    expect(ten.items[0]).toMatchObject({ variantId: "variant-5mg", lineSubtotalMinor: 16800 });
  });

  it("keeps unknown canonical variants unavailable without accepting browser facts", () => {
    const preview = buildCartPreview([
      { variantId: "variant-5mg", quantity: 2, name: "Browser lie", amountMinor: 1 },
      { variantId: "unknown-variant", quantity: 3 },
    ], { variants });
    expect(preview.items).toEqual([
      expect.objectContaining({ variantId: "variant-5mg", quantity: 2, name: "Synthetic local test only — Alpha", available: true }),
      expect.objectContaining({ variantId: "unknown-variant", quantity: 3, available: false }),
    ]);
    expect(preview.requiresAcknowledgement).toBe(true);
    expect(canContinueFromPreview(preview, null)).toBe(false);
  });
});
