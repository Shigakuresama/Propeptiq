import { describe, expect, it } from "vitest";

import { browseCatalogProducts } from "./browse-catalog";
import { storefrontCatalogDecisionManifest } from "./storefront-catalog-manifest";
import {
  buildRelatedProductIdsByProductId,
  getRelatedProductIds,
  type RelatedProductIdentity,
} from "./storefront-merchandising";

const browseBySlug = new Map(
  browseCatalogProducts.map((product) => [product.slug, product] as const),
);
const products = storefrontCatalogDecisionManifest.products.map(({ browseSlug, id }) => ({
  id,
  slug: browseSlug,
  category: browseBySlug.get(browseSlug)!.category,
}));

function idsFor(...slugs: string[]): string[] {
  return slugs.map((slug) => products.find((product) => product.slug === slug)!.id);
}

describe("storefront merchandising relationships", () => {
  it("derives one to four immutable same-category neighbors for every catalog product", () => {
    const knownIds = new Set(products.map((product) => product.id));
    const categoryById = new Map(products.map((product) => [product.id, product.category]));

    for (const product of products) {
      const relatedIds = getRelatedProductIds(product.id);

      expect(relatedIds.length).toBeGreaterThanOrEqual(1);
      expect(relatedIds.length).toBeLessThanOrEqual(4);
      expect(new Set(relatedIds).size).toBe(relatedIds.length);
      expect(relatedIds).not.toContain(product.id);
      expect(relatedIds.every((id) => knownIds.has(id))).toBe(true);
      expect(relatedIds.every((id) => categoryById.get(id) === product.category)).toBe(true);
      expect(Object.isFrozen(relatedIds)).toBe(true);
    }
  });

  it("keeps category adjacency stable without asserting research or use pairings", () => {
    const bpc157 = products.find((product) => product.slug === "bpc-157")!;
    const semax = products.find((product) => product.slug === "semax")!;
    const bacWater = products.find((product) => product.slug === "bac-water")!;

    expect(getRelatedProductIds(bpc157.id)).toEqual(
      idsFor("cartalax", "kpv", "ll37", "tb500"),
    );
    expect(getRelatedProductIds(semax.id)).toEqual(
      idsFor("semax-selank", "admax", "dsip", "grp-2"),
    );
    expect(getRelatedProductIds(bacWater.id)).toEqual(idsFor("acetic-acid"));
  });

  it("keeps relationships and record order unchanged after catalog reordering", () => {
    const original = buildRelatedProductIdsByProductId(products);
    const reordered = buildRelatedProductIdsByProductId([...products].reverse());
    expect(reordered).toEqual(original);
    expect(Object.keys(reordered)).toEqual(Object.keys(original));
    for (let offset = 1; offset < products.length; offset += 7) {
      expect(buildRelatedProductIdsByProductId([
        ...products.slice(offset), ...products.slice(0, offset),
      ])).toEqual(original);
    }
  });

  it("does not let another category change the selected peers or mutate its input", () => {
    const selected = products.filter((product) => product.category === "repair");
    const before = structuredClone(selected);
    const peers = buildRelatedProductIdsByProductId(selected);
    const extended = buildRelatedProductIdsByProductId([
      ...selected, { id: "unrelated", slug: "aaaa-unrelated", category: "laboratory" },
    ]);
    for (const product of selected) expect(extended[product.id]).toEqual(peers[product.id]);
    expect(selected).toEqual(before);
    expect(selected.every((product) => !Object.isFrozen(product))).toBe(true);
    expect(Object.isFrozen(peers)).toBe(true);
    expect(Object.values(peers).every(Object.isFrozen)).toBe(true);
    expect(extended.unrelated).toEqual([]);
  });

  it("rejects an unsupported category without invoking accessor fields", () => {
    expect(() => buildRelatedProductIdsByProductId([
      { id: "alpha", slug: "alpha", category: "invented" },
    ] as unknown as RelatedProductIdentity[])).toThrow("Invalid related-product merchandising configuration");
    let reads = 0;
    for (const key of ["id", "slug", "category"]) {
      const identity = { id: "alpha", slug: "alpha", category: "repair" };
      Object.defineProperty(identity, key, { get() { reads += 1; throw new Error("private getter"); } });
      expect(() => buildRelatedProductIdsByProductId([identity] as RelatedProductIdentity[])).toThrow(
        "Invalid related-product merchandising configuration",
      );
    }
    expect(reads).toBe(0);
  });

  it("rejects sparse, accessor, overridden and revoked arrays with the fixed error", () => {
    const identity = { id: "alpha", slug: "alpha", category: "repair" as const };
    const sparse = new Array<RelatedProductIdentity>(1);
    const accessor = [identity];
    let reads = 0;
    Object.defineProperty(accessor, "0", { get() { reads += 1; return identity; } });
    const overridden = [identity];
    overridden.map = () => { throw new Error("private override"); };
    const iterator = [identity];
    iterator[Symbol.iterator] = function* () { throw new Error("private iterator"); };
    const revoked = Proxy.revocable([identity], {});
    revoked.revoke();
    const hostile = new Proxy([identity], { ownKeys() { throw new Error("private proxy"); } });
    for (const input of [sparse, accessor, overridden, iterator, revoked.proxy, hostile]) {
      expect(() => buildRelatedProductIdsByProductId(input)).toThrow(
        "Invalid related-product merchandising configuration",
      );
    }
    expect(reads).toBe(0);
  });

  it.each([
    ["empty catalog", []],
    [
      "duplicate ID",
      [
        { id: "id-alpha", slug: "alpha", category: "repair" },
        { id: "id-alpha", slug: "beta", category: "repair" },
      ],
    ],
    [
      "duplicate slug",
      [
        { id: "id-alpha", slug: "alpha", category: "repair" },
        { id: "id-beta", slug: "alpha", category: "repair" },
      ],
    ],
  ] as const)("rejects %s", (_label, identities) => {
    expect(() => buildRelatedProductIdsByProductId(identities)).toThrow(
      "Invalid related-product merchandising configuration",
    );
  });

  it("rejects unknown product IDs at the read boundary", () => {
    expect(() => getRelatedProductIds("not-a-canonical-product")).toThrow(
      "Related products are not configured for this product",
    );
  });
});
