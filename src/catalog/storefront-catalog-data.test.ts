import { describe, expect, it } from "vitest";

import { browseCatalogProducts, browseCatalogVariantCount } from "./browse-catalog";
import { storefrontCatalogData } from "./storefront-catalog-data";
import { buildConfiguredDisplayVariantFacts } from "./storefront-public";
import { storefrontCatalogDecisionManifest } from "./storefront-catalog-manifest";

describe("canonical storefront catalog data", () => {
  it("publishes every reviewed product and variant identity", () => {
    expect(browseCatalogProducts).toHaveLength(56);
    expect(browseCatalogVariantCount).toBe(103);
    expect(storefrontCatalogData.products).toHaveLength(56);
    expect(storefrontCatalogData.bindings.products).toHaveLength(56);
    expect(storefrontCatalogData.bindings.variants).toHaveLength(103);
    expect(storefrontCatalogData.bindings.variants.map((v) => v.sku)).toEqual(
      storefrontCatalogDecisionManifest.variants.map((v) => v.sku),
    );
  });

  it("exposes reviewed prices as preview-only facts without payment mappings", () => {
    const tirzepatide = storefrontCatalogData.products.find((p) => p.slug === "tirzepatide");
    expect(tirzepatide?.variantIds).toHaveLength(9);
    const variants = storefrontCatalogData.bindings.variants.filter((v) => v.productId === tirzepatide?.id);
    expect(variants.find((v) => v.browseCode === "TR30")).toMatchObject({ baseUnitMinor: 5999, priceStatus: "pending", availability: "preview_only", stripePriceId: null });
    expect(variants.find((v) => v.browseCode === "TR5")).toMatchObject({ baseUnitMinor: 0, priceStatus: "pending" });
  });

  it("only projects deliberately pending preview bindings", () => {
    expect(buildConfiguredDisplayVariantFacts(storefrontCatalogData)).toHaveLength(103);
    const altered = {
      ...storefrontCatalogData,
      bindings: {
        ...storefrontCatalogData.bindings,
        variants: storefrontCatalogData.bindings.variants.map((variant, index) =>
          index === 0 ? { ...variant, priceStatus: "active" as const, availability: "available" as const, stripeProductId: "prod" , stripePriceId: "price" } : variant,
        ),
      },
    };
    expect(buildConfiguredDisplayVariantFacts(altered)).toHaveLength(102);
  });
});
