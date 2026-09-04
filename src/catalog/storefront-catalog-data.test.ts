import { describe, expect, it } from "vitest";

import { browseCatalogProducts, browseCatalogVariantCount } from "./browse-catalog";
import { storefrontCatalogData } from "./storefront-catalog-data";
import { buildConfiguredDisplayVariantFacts } from "./storefront-public";
import { storefrontCatalogDecisionManifest } from "./storefront-catalog-manifest";

describe("canonical storefront catalog data", () => {
  it("copies every explicit manifest default into canonical catalog data", () => {
    const manifestDefaults = new Map(
      storefrontCatalogDecisionManifest.products.map((product) => [
        product.browseSlug,
        product.defaultVariantId,
      ]),
    );

    expect(manifestDefaults.size).toBe(56);
    expect(storefrontCatalogData.products).toHaveLength(56);
    for (const product of storefrontCatalogData.products) {
      expect(product.defaultVariantId).toBe(manifestDefaults.get(product.slug));
      expect(product.variantIds).toContain(product.defaultVariantId);
    }
  });

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
    const snap = storefrontCatalogData.products.find((p) => p.slug === "snap");
    expect(snap?.variantIds).toHaveLength(1);
    expect(storefrontCatalogData.bindings.variants.find((v) => v.browseCode === "SNP10")).toMatchObject({
      baseUnitMinor: 2999,
      priceStatus: "pending",
      availability: "preview_only",
      stripeProductId: null,
      stripePriceId: null,
    });
  });

  it("uses the decision-manifest amount directly and leaves merchandising metadata unknown", () => {
    const byCode = new Map(
      storefrontCatalogData.bindings.variants.map((variant) => [
        `${variant.productId}:${variant.browseCode}`,
        variant,
      ]),
    );
    const tirzepatide = storefrontCatalogData.products.find((product) => product.slug === "tirzepatide")!;
    const nadPlus = storefrontCatalogData.products.find((product) => product.slug === "nad-plus")!;
    const hcg = storefrontCatalogData.products.find((product) => product.slug === "hcg")!;
    const glow = storefrontCatalogData.products.find((product) => product.slug === "glow")!;
    const liPoC = storefrontCatalogData.products.find((product) => product.slug === "li-po-c")!;

    expect(byCode.get(`${tirzepatide.id}:TR30`)?.amount).toEqual({ value: 30, unit: "mg" });
    expect(byCode.get(`${nadPlus.id}:NJ500`)?.amount).toEqual({ value: 500, unit: "mg" });
    expect(byCode.get(`${hcg.id}:G5K`)?.amount).toEqual({ value: 5000, unit: "iu" });
    expect(byCode.get(`${glow.id}:BBG70`)?.amount).toBeNull();
    expect(byCode.get(`${liPoC.id}:LPC`)?.amount).toBeNull();
    expect(storefrontCatalogData.products.every((product) => (
      product.popularityRank === null && product.releasedAt === null
    ))).toBe(true);
  });

  it("joins approved descriptions, controlled content, and explicit related products for every product", () => {
    const knownProductIds = new Set(
      storefrontCatalogData.products.map((product) => product.id),
    );

    for (const product of storefrontCatalogData.products) {
      expect(product.description).toContain(product.name);
      expect(product.contentIds).toHaveLength(2);
      expect(new Set(product.contentIds).size).toBe(2);
      expect(product.relatedProductIds.length).toBeGreaterThanOrEqual(2);
      expect(product.relatedProductIds.length).toBeLessThanOrEqual(4);
      expect(new Set(product.relatedProductIds).size).toBe(
        product.relatedProductIds.length,
      );
      expect(product.relatedProductIds).not.toContain(product.id);
      expect(
        product.relatedProductIds.every((relatedId) =>
          knownProductIds.has(relatedId)
        ),
      ).toBe(true);
    }
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
