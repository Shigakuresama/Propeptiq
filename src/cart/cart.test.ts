import { describe, expect, it } from "vitest";

import type { PublicCatalog } from "@/catalog/types";

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

const catalog: PublicCatalog = {
  source: "synthetic-demo",
  products: [
    {
      id: "demo-product-alpha",
      slug: "synthetic-reference-alpha",
      name: "Synthetic Reference Alpha — Demo Only",
      packageForm: "Synthetic sealed reference unit",
      price: {
        id: "demo-price-alpha",
        amountMinor: 2400,
        currency: "USD",
        version: 2,
      },
      availableQuantity: 12,
      claims: [],
      merchandising: [],
      relatedProducts: [],
      proof: [],
    },
  ],
  promotions: [],
  qualityRecords: [],
};

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("anonymous cart persistence", () => {
  it("stores only normalized product IDs and bounded positive integer quantities", () => {
    const normalized = normalizeCart([
      { productId: "demo-product-alpha", quantity: 2, name: "Browser lie" },
      { productId: "demo-product-alpha", quantity: 3, amountMinor: 1 },
      { productId: "bad id with spaces", quantity: 2 },
      { productId: "demo-product-negative", quantity: -1 },
      { productId: "demo-product-fraction", quantity: 1.5 },
      { productId: "demo-product-large", quantity: 99999 },
    ]);

    expect(normalized).toEqual([
      { productId: "demo-product-alpha", quantity: 5 },
      {
        productId: "demo-product-large",
        quantity: MAX_CART_ITEM_QUANTITY,
      },
    ]);
    expect(JSON.parse(serializeCart(normalized))).toEqual({
      version: 1,
      items: normalized,
    });
  });

  it("fails closed when persisted data is malformed", () => {
    expect(deserializeCart("not-json")).toEqual([]);
    expect(
      deserializeCart(
        JSON.stringify({
          version: 1,
          items: [{ productId: "demo-product-alpha", quantity: "2" }],
        }),
      ),
    ).toEqual([]);
  });

  it("persists and restores the same ID/quantity cart across the checkout handoff seam", () => {
    const storage = new MemoryStorage();
    const items = [{ productId: "demo-product-alpha", quantity: 2 }];

    expect(prepareCheckoutHandoff(storage, items)).toEqual({
      returnTo: "/cart?checkout=resume",
      itemCount: 2,
    });
    expect(restoreCheckoutHandoff(storage)).toEqual(items);
    expect(storage.getItem(CART_STORAGE_KEY)).toBe(
      JSON.stringify({ version: 1, items }),
    );
  });
});

describe("authoritative cart preview", () => {
  it("ignores browser-supplied facts and preserves unavailable requested IDs and quantities", () => {
    const preview = buildCartPreview(
      [
        {
          productId: "demo-product-alpha",
          quantity: 2,
          name: "Browser lie",
          amountMinor: 1,
        },
        { productId: "unknown-product", quantity: 3 },
      ],
      catalog,
    );

    expect(preview.items).toEqual([
      expect.objectContaining({
        productId: "demo-product-alpha",
        quantity: 2,
        name: "Synthetic Reference Alpha — Demo Only",
        unitAmountMinor: 2400,
        lineSubtotalMinor: 4800,
        available: true,
      }),
      expect.objectContaining({
        productId: "unknown-product",
        quantity: 3,
        available: false,
      }),
    ]);
    expect(preview.subtotalMinor).toBe(4800);
    expect(preview.requiresAcknowledgement).toBe(true);
    expect(canContinueFromPreview(preview, null)).toBe(false);
  });

  it("requires acknowledgment when authoritative server facts change", () => {
    const first = buildCartPreview(
      [{ productId: "demo-product-alpha", quantity: 1 }],
      catalog,
    );
    const changedCatalog: PublicCatalog = {
      ...catalog,
      products: catalog.products.map((product) => ({
        ...product,
        price: { ...product.price, version: 3, amountMinor: 2600 },
      })),
    };
    const changed = buildCartPreview(
      [{ productId: "demo-product-alpha", quantity: 1 }],
      changedCatalog,
      first.previewToken,
    );

    expect(changed.items[0]).toMatchObject({
      productId: "demo-product-alpha",
      quantity: 1,
      unitAmountMinor: 2600,
    });
    expect(changed.requiresAcknowledgement).toBe(true);
    expect(changed.reasons).toContain("server_facts_changed");
    expect(canContinueFromPreview(changed, null)).toBe(false);
    expect(canContinueFromPreview(changed, changed.previewToken)).toBe(true);
  });
});
