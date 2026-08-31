import { describe, expect, it } from "vitest";
import { canAddPublicVariant, resolvePublicVariantPrice, type PublicStorefrontPricingContext } from "./storefront-price-presentation";
import type { PublicStorefrontVariant } from "./storefront-public";

const pricing: PublicStorefrontPricingContext = { mode: "preview", evaluatedAt: "2026-08-31T00:00:00.000Z", automaticPromotions: [{ id: "winter30", displayName: "Winter Sale", displayCode: "WINTER30", discountBps: 3000, enabled: true, startAt: null, endAt: null, timezone: "America/Los_Angeles", scope: { kind: "sitewide" }, applicationMode: "automatic" }] };
const variant = (overrides: Partial<PublicStorefrontVariant> = {}): PublicStorefrontVariant => ({ id: "v1", sku: "SKU", label: "5 mg", amount: { value: 5, unit: "mg" }, packageQuantity: 1, availability: "available", priceStatus: "active", baseUnitMinor: 1000, currency: "USD", checkoutReady: true, ...overrides });

describe("storefront price presentation", () => {
  it("uses the single higher promotion and integer pricing", () => {
    const result = resolvePublicVariantPrice({ variant: variant(), productId: "p1", quantity: 2, pricing });
    expect(result.state).toBe("priced");
    if (result.state === "priced") expect(result.price.effectiveDiscountBps).toBe(3000);
  });
  it("allows only explicit preview zero pricing outside production", () => {
    const pending = variant({ priceStatus: "pending", baseUnitMinor: 0, availability: "preview_only", checkoutReady: false });
    expect(canAddPublicVariant(pending, "preview")).toBe(true);
    expect(canAddPublicVariant(pending, "production")).toBe(false);
    expect(canAddPublicVariant(variant({ baseUnitMinor: 0 }), "preview")).toBe(false);
  });
  it("fails closed for null and mapping-missing variants", () => {
    expect(canAddPublicVariant(variant({ baseUnitMinor: null, currency: null }), "preview")).toBe(false);
    expect(canAddPublicVariant(variant({ checkoutReady: false }), "production")).toBe(false);
  });
});
