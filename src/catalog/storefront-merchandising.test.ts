import { describe, expect, it } from "vitest";

import { storefrontCatalogDecisionManifest } from "./storefront-catalog-manifest";
import {
  buildRelatedProductIdsByProductId,
  getRelatedProductIds,
  storefrontRelatedProductSlugEntries,
} from "./storefront-merchandising";

const products = storefrontCatalogDecisionManifest.products.map(({ browseSlug, id }) => ({
  id,
  slug: browseSlug,
}));

function idsFor(...slugs: string[]): string[] {
  return slugs.map((slug) => products.find((product) => product.slug === slug)!.id);
}

describe("storefront merchandising relationships", () => {
  it("configures two to four immutable canonical neighbors for every catalog product", () => {
    const knownIds = new Set(products.map((product) => product.id));

    expect(storefrontRelatedProductSlugEntries).toHaveLength(56);
    expect(Object.isFrozen(storefrontRelatedProductSlugEntries)).toBe(true);

    for (const product of products) {
      const relatedIds = getRelatedProductIds(product.id);

      expect(relatedIds.length).toBeGreaterThanOrEqual(2);
      expect(relatedIds.length).toBeLessThanOrEqual(4);
      expect(new Set(relatedIds).size).toBe(relatedIds.length);
      expect(relatedIds).not.toContain(product.id);
      expect(relatedIds.every((id) => knownIds.has(id))).toBe(true);
      expect(Object.isFrozen(relatedIds)).toBe(true);
    }
  });

  it("keeps deliberate catalog families in a stable display order", () => {
    const bpc157 = products.find((product) => product.slug === "bpc-157")!;
    const semax = products.find((product) => product.slug === "semax")!;
    const bacWater = products.find((product) => product.slug === "bac-water")!;

    expect(getRelatedProductIds(bpc157.id)).toEqual(
      idsFor("tb500", "bpc-tb-blend", "bpc-tb-blend-bb20", "glow"),
    );
    expect(getRelatedProductIds(semax.id)).toEqual(
      idsFor("selank", "semax-selank", "dsip"),
    );
    expect(getRelatedProductIds(bacWater.id)).toEqual(
      idsFor("acetic-acid", "nad-plus"),
    );
  });

  it.each([
    [
      "missing source coverage",
      [["alpha", ["beta", "gamma"]]] as const,
    ],
    [
      "duplicate source configuration",
      [
        ["alpha", ["beta", "gamma"]],
        ["alpha", ["beta", "gamma"]],
        ["beta", ["alpha", "gamma"]],
        ["gamma", ["alpha", "beta"]],
      ] as const,
    ],
    [
      "self relationship",
      [
        ["alpha", ["alpha", "beta"]],
        ["beta", ["alpha", "gamma"]],
        ["gamma", ["alpha", "beta"]],
      ] as const,
    ],
    [
      "unknown relationship",
      [
        ["alpha", ["beta", "missing"]],
        ["beta", ["alpha", "gamma"]],
        ["gamma", ["alpha", "beta"]],
      ] as const,
    ],
    [
      "duplicate relationship",
      [
        ["alpha", ["beta", "beta"]],
        ["beta", ["alpha", "gamma"]],
        ["gamma", ["alpha", "beta"]],
      ] as const,
    ],
    [
      "fewer than two relationships",
      [
        ["alpha", ["beta"]],
        ["beta", ["alpha", "gamma"]],
        ["gamma", ["alpha", "beta"]],
      ] as const,
    ],
    [
      "more than four relationships",
      [
        ["alpha", ["beta", "gamma", "delta", "epsilon", "zeta"]],
        ["beta", ["alpha", "gamma"]],
        ["gamma", ["alpha", "beta"]],
        ["delta", ["alpha", "beta"]],
        ["epsilon", ["alpha", "beta"]],
        ["zeta", ["alpha", "beta"]],
      ] as const,
    ],
  ])("rejects %s", (_label, relationships) => {
    const fixtureProducts = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"]
      .filter((slug) => relationships.some(([source]) => source === slug))
      .map((slug) => ({ id: `id-${slug}`, slug }));

    expect(() => buildRelatedProductIdsByProductId(fixtureProducts, relationships)).toThrow(
      "Invalid related-product merchandising configuration",
    );
  });

  it("rejects unknown product IDs at the read boundary", () => {
    expect(() => getRelatedProductIds("not-a-canonical-product")).toThrow(
      "Related products are not configured for this product",
    );
  });
});
