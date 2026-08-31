import { describe, expect, it } from "vitest";

import { parseStorefrontBindings } from "./storefront-bindings";

const approved = {
  products: [{
    id: "10000000-0000-4000-8000-000000000001",
    browseSlug: "fixture-product",
    popularityRank: 1,
    releasedAt: "2026-08-30T00:00:00.000Z",
    defaultVariantId: "20000000-0000-4000-8000-000000000001",
    relatedProductIds: [],
    contentIds: [],
  }],
  variants: [{
    id: "20000000-0000-4000-8000-000000000001",
    productId: "10000000-0000-4000-8000-000000000001",
    browseCode: "FIXTURE-5",
    sku: "TEST-FIXTURE-5",
    label: "5 mg test fixture",
    amount: { value: 5, unit: "mg" },
    packageQuantity: 1,
    currency: "USD",
    baseUnitMinor: 0,
    priceStatus: "pending",
    availability: "preview_only",
    stripeProductId: null,
    stripePriceId: null,
  }],
} as const;

describe("parseStorefrontBindings", () => {
  it("accepts an explicit pending-price test fixture", () => {
    expect(parseStorefrontBindings(approved).variants[0]?.sku).toBe("TEST-FIXTURE-5");
  });

  it("rejects duplicate variant IDs and SKUs", () => {
    expect(() => parseStorefrontBindings({
      ...approved,
      variants: [approved.variants[0], approved.variants[0]],
    })).toThrow();
  });

  it("rejects a default variant outside the product", () => {
    expect(() => parseStorefrontBindings({
      ...approved,
      products: [{ ...approved.products[0], defaultVariantId: "20000000-0000-4000-8000-000000000099" }],
    })).toThrow();
  });

  it("does not infer an amount or package quantity from a label", () => {
    const { amount: _amount, packageQuantity: _packageQuantity, ...withoutCanonicalFacts } = approved.variants[0];
    expect(() => parseStorefrontBindings({ ...approved, variants: [withoutCanonicalFacts] })).toThrow();
  });
});
