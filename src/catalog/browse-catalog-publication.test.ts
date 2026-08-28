import { describe, expect, it } from "vitest";

import {
  browseCatalogPublicationId,
  ownerBrowseCatalogManifest,
  browseCatalogSourceDocumentSha256,
  resolvePublishedBrowseCatalog,
  validateBrowseCatalogManifest,
} from "./browse-catalog-publication";

describe("owner browse-catalog publication", () => {
  it("pins the exact SHA-256 of the supplied owner PDF", () => {
    expect(browseCatalogSourceDocumentSha256).toBe(
      "07cd4aa023c5455444d52f360841bc126b245c3eb30f0a19fea17bdf9b92f0bf",
    );
    expect(browseCatalogSourceDocumentSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("defaults closed when no publication is authorized", () => {
    expect(resolvePublishedBrowseCatalog(undefined)).toEqual({
      publicationId: null,
      products: [],
      variantCount: 0,
    });
  });

  it("publishes all owner-supplied rows only for the exact manifest ID", () => {
    const catalog = resolvePublishedBrowseCatalog(browseCatalogPublicationId);

    expect(catalog.publicationId).toBe(browseCatalogPublicationId);
    expect(catalog.products).toHaveLength(53);
    expect(catalog.variantCount).toBe(103);
    expect(catalog.products[0]).not.toHaveProperty("id");
    expect(catalog.products[0]).not.toHaveProperty("price");
  });

  it("fails closed for a configured publication mismatch", () => {
    expect(() => resolvePublishedBrowseCatalog("wrong-publication")).toThrow(
      "Browse catalog publication does not match the owner manifest",
    );
  });

  it("rejects a malformed source envelope and duplicate slugs", () => {
    expect(() =>
      validateBrowseCatalogManifest({
        ...ownerBrowseCatalogManifest,
        source: "invented-source",
      }),
    ).toThrow("Invalid owner browse catalog manifest");

    expect(() =>
      validateBrowseCatalogManifest({
        ...ownerBrowseCatalogManifest,
        products: [
          ...ownerBrowseCatalogManifest.products,
          ownerBrowseCatalogManifest.products[0],
        ],
      }),
    ).toThrow("Owner browse catalog contains duplicate product slugs");
  });
});
