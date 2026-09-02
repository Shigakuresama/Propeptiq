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

  it("rejects duplicate related product IDs", () => {
    const otherId = "10000000-0000-4000-8000-000000000002";
    const otherVariantId = "20000000-0000-4000-8000-000000000002";
    expect(() => parseStorefrontBindings({
      ...approved,
      products: [
        { ...approved.products[0], relatedProductIds: [otherId, otherId] },
        { ...approved.products[0], id: otherId, browseSlug: "fixture-other", defaultVariantId: otherVariantId },
      ],
      variants: [approved.variants[0], { ...approved.variants[0], id: otherVariantId, productId: otherId, sku: "TEST-OTHER-5" }],
    })).toThrow(/duplicate IDs/iu);
  });

  it.each([
    ["missing related target", ["10000000-0000-4000-8000-000000000099"]],
    ["self reference", [approved.products[0].id]],
  ])("rejects %s", (_label, relatedProductIds) => {
    expect(() => parseStorefrontBindings({
      ...approved,
      products: [{ ...approved.products[0], relatedProductIds }],
    })).toThrow(/relationships must reference another bound product/iu);
  });

  it("does not infer an amount or package quantity from a label", () => {
    const withoutCanonicalFacts: Record<string, unknown> = {
      ...approved.variants[0],
    };
    delete withoutCanonicalFacts.amount;
    delete withoutCanonicalFacts.packageQuantity;
    expect(() => parseStorefrontBindings({ ...approved, variants: [withoutCanonicalFacts] })).toThrow();
  });

  it.each([
    ["zero active price", { baseUnitMinor: 0 }],
    ["unavailable availability", { availability: "unavailable" }],
    ["missing Stripe Price mapping", { stripePriceId: null }],
    ["missing Stripe Product mapping", { stripeProductId: null }],
  ] as const)("rejects an active canonical variant with %s", (_label, override) => {
    expect(() => parseStorefrontBindings({
      ...approved,
      variants: [{
        ...approved.variants[0],
        baseUnitMinor: 1_000,
        priceStatus: "active",
        availability: "available",
        stripeProductId: "prod_test_fixture",
        stripePriceId: "price_test_fixture",
        ...override,
      }],
    })).toThrow();
  });
});
