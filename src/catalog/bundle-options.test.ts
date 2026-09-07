import { describe, expect, it } from "vitest";
import { buildCartPreview } from "@/cart/preview";
import { resolveBundleOptions } from "./bundle-options";
import type { PublicStorefrontVariant } from "./storefront-public";
import type { PublicStorefrontPricingContext } from "./storefront-price-presentation";

// Pure synthetic price fixtures; no catalog/provider authority is simulated.
const variant: PublicStorefrontVariant = {
  id: "synthetic-variant", sku: "SYN-BUNDLE", label: "Synthetic 5 mg",
  amount: { value: 5, unit: "mg" }, packageQuantity: 1, availability: "preview_only",
  priceStatus: "active", baseUnitMinor: 1005, currency: "USD", checkoutReady: false,
};
const pricing: PublicStorefrontPricingContext = {
  mode: "production", evaluatedAt: "2026-09-06T12:00:00.000Z",
  automaticPromotions: [{ id: "winter30", discountBps: 3000, displayCode: "WINTER30", displayName: "Winter sale",
    enabled: true, startAt: null, endAt: null, timezone: "America/Los_Angeles", scope: { kind: "sitewide" }, applicationMode: "automatic" }],
};

describe("reachable bottle bundle choices", () => {
  it("offers the 2, 4 and 11 bottle thresholds with separate, reconciled savings", () => {
    expect(resolveBundleOptions("synthetic-product", variant, pricing)).toMatchObject([
      { minBottleCount: 2, maxBottleCount: 3, discountBps: 300, quantity: 2, bottleCount: 2,
        price: { effectiveUnitMinor: 683, lineSubtotalMinor: 1366, lineCampaignSavingsMinor: 602, lineVolumeSavingsMinor: 42, lineSavingsMinor: 644 } },
      { minBottleCount: 4, maxBottleCount: 10, discountBps: 600, quantity: 4, bottleCount: 4,
        price: { effectiveUnitMinor: 662, lineSubtotalMinor: 2648, lineCampaignSavingsMinor: 1204, lineVolumeSavingsMinor: 168, lineSavingsMinor: 1372 } },
      { minBottleCount: 11, maxBottleCount: null, discountBps: 3000, quantity: 11, bottleCount: 11,
        price: { effectiveUnitMinor: 493, lineSubtotalMinor: 5423, lineCampaignSavingsMinor: 3311, lineVolumeSavingsMinor: 2321, lineSavingsMinor: 5632 } },
    ]);
  });

  it.each([
    [2, [[2, 1, 2], [4, 2, 4], [11, 6, 12]]],
    [3, [[2, 1, 3], [4, 2, 6], [11, 4, 12]]],
    [10, [[4, 1, 10], [11, 2, 20]]],
    [12, [[11, 1, 12]]],
  ])("offers whole packages with actual bottle counts for package size %i", (packageQuantity, expected) => {
    expect(resolveBundleOptions("synthetic-product", { ...variant, packageQuantity }, pricing)
      .map((option) => [option.minBottleCount, option.quantity, option.bottleCount])).toEqual(expected);
  });

  it.each(["synthetic-product-a", "synthetic-product-b"])("matches cart cents for every offered package of %s", (productId) => {
    for (const packageQuantity of [1, 2, 10]) {
      const packaged = { ...variant, packageQuantity };
      for (const option of resolveBundleOptions(productId, packaged, pricing)) {
        const preview = buildCartPreview([{ variantId: variant.id, quantity: option.quantity }], { mode: "production", variants: [{
          variantId: variant.id, productId, name: "Synthetic bundle fixture", sku: variant.sku, variantLabel: variant.label,
          packageForm: `${packageQuantity} bottles`, packageQuantity, priceStatus: "active", availability: "preview_only",
          availableQuantity: null, checkoutReady: false, baseUnitMinor: 1005, currency: "USD",
          eligiblePromotions: [{ id: "winter30", displayLabel: "WINTER30", discountBps: 3000 }],
        }] });
        expect(preview.items[0]).toMatchObject({ unitAmountMinor: option.price.effectiveUnitMinor,
          lineSubtotalMinor: option.price.lineSubtotalMinor, lineCampaignSavingsMinor: option.price.lineCampaignSavingsMinor,
          lineVolumeSavingsMinor: option.price.lineVolumeSavingsMinor, available: false, purchaseState: "checkout_unavailable" });
      }
    }
  });

  it.each([0, -1, 1.5, Number.NaN])("offers no malformed package size %s", (packageQuantity) => {
    expect(resolveBundleOptions("synthetic-product", { ...variant, packageQuantity }, pricing)).toEqual([]);
  });
  it("offers no unavailable or pending price", () => {
    expect(resolveBundleOptions("synthetic-product", { ...variant, availability: "unavailable" }, pricing)).toEqual([]);
    expect(resolveBundleOptions("synthetic-product", { ...variant, priceStatus: "pending" }, pricing)).toEqual([]);
  });
});
