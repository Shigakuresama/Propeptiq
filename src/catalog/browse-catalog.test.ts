import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  browseCatalogProducts,
  browseCatalogVariantCount,
  findBrowseCatalogProduct,
  projectBrowseCatalogCompatibility,
  validateBrowseCatalogProduct,
} from "./browse-catalog";
import { parseStorefrontBindings } from "./storefront-bindings";
import { storefrontCatalogData } from "./storefront-catalog-data";

describe("browse-only supplier catalog", () => {
  it("projects the empty canonical seam without changing legacy browse output", () => {
    const projection = projectBrowseCatalogCompatibility(
      storefrontCatalogData.bindings,
    );

    expect(projection.products).toBe(browseCatalogProducts);
    expect(projection.variantCount).toBe(103);
    expect(projection.products[0]).not.toHaveProperty("id");
    expect(projection.products[0]).not.toHaveProperty("stripePriceId");
  });

  it("requires explicit browse slug and code bindings without parsing labels", () => {
    const bindings = parseStorefrontBindings({
      products: [{
        id: "10000000-0000-4000-8000-000000000001",
        browseSlug: "tirzepatide",
        popularityRank: 1,
        releasedAt: "2026-08-30T00:00:00.000Z",
        defaultVariantId: "20000000-0000-4000-8000-000000000001",
        relatedProductIds: [],
        contentIds: [],
      }],
      variants: [{
        id: "20000000-0000-4000-8000-000000000001",
        productId: "10000000-0000-4000-8000-000000000001",
        browseCode: "NOT-A-LEGACY-CODE",
        sku: "TEST-NOT-A-LEGACY-CODE",
        label: "A deliberately nonmatching test label",
        amount: { value: 5, unit: "mg" },
        packageQuantity: 1,
        currency: "USD",
        baseUnitMinor: 0,
        priceStatus: "pending",
        availability: "preview_only",
        stripeProductId: null,
        stripePriceId: null,
      }],
    });

    expect(() => projectBrowseCatalogCompatibility(bindings)).toThrow(
      "Storefront binding browse code does not match a legacy browse variant",
    );
  });

  it("preserves every price-free PDF row while grouping package variants", () => {
    expect(browseCatalogProducts).toHaveLength(56);
    expect(browseCatalogVariantCount).toBe(103);

    const rows = browseCatalogProducts.flatMap((product) =>
      product.variants.map((variant) => ({ product, variant })),
    );

    expect(rows).toHaveLength(103);
    expect(rows.some(({ variant }) => variant.code === "Admax")).toBe(true);
    expect(rows.some(({ variant }) => variant.code === "Car20")).toBe(true);
    expect(rows.some(({ variant }) => variant.code === "BBGK")).toBe(true);
    expect(rows.filter(({ variant }) => variant.code === "LPC")).toHaveLength(2);

    for (const { product, variant } of rows) {
      expect(product).not.toHaveProperty("price");
      expect(variant).not.toHaveProperty("price");
    }
  });

  it("gives every product a distinct slug-bound illustration with nonempty alt text", () => {
    for (const product of browseCatalogProducts) {
      expect(product.image.src).toMatch(/^\/catalog\/[^/]+\.webp$/u);
      expect(product.image.alt).toContain(product.name);
      expect(
        existsSync(join(process.cwd(), "public", product.image.src.slice(1))),
      ).toBe(true);
    }

    expect(new Set(browseCatalogProducts.map(({ image }) => image.src)).size).toBe(56);
    for (const product of browseCatalogProducts) {
      expect(product.image.src).toBe(`/catalog/${product.slug}.webp`);
    }
  });

  it("creates exactly one product group for each identical source Name", () => {
    const productSlugsBySourceName = new Map<string, Set<string>>();

    for (const product of browseCatalogProducts) {
      const exactNames = new Set(
        product.variants.map((variant) => variant.sourceName ?? product.sourceName),
      );
      expect(exactNames, product.slug).toEqual(new Set([product.sourceName]));

      const slugs = productSlugsBySourceName.get(product.sourceName) ?? new Set<string>();
      slugs.add(product.slug);
      productSlugsBySourceName.set(product.sourceName, slugs);
    }

    expect(productSlugsBySourceName.size).toBe(56);
    for (const [sourceName, slugs] of productSlugsBySourceName) {
      expect(slugs.size, sourceName).toBe(1);
    }
  });

  it("keeps the five distinct BPC/TB and CJC/IPA source rows as one-variant slugs", () => {
    expect(
      [
        "bpc-tb-blend",
        "bpc-tb-blend-bb20",
        "bpc-tb-blend-bb40",
        "cjc-1295-no-dac-ipa",
        "cjc-1295-no-dac-ipa-cp20",
      ].map((slug) => findBrowseCatalogProduct(slug)),
    ).toMatchObject([
      {
        slug: "bpc-tb-blend",
        sourceName: "BPC 5mg + TB 5mg",
        variants: [{ code: "BB10", packageForm: "10mg × 10 vials", sourcePage: 2 }],
      },
      {
        slug: "bpc-tb-blend-bb20",
        sourceName: "BPC 10mg + TB 10mg",
        variants: [{ code: "BB20", packageForm: "20mg × 10 vials", sourcePage: 2 }],
      },
      {
        slug: "bpc-tb-blend-bb40",
        sourceName: "BPC 20mg + TB 20mg",
        variants: [{ code: "BB40", packageForm: "40mg × 10 vials", sourcePage: 2 }],
      },
      {
        slug: "cjc-1295-no-dac-ipa",
        sourceName: "CJC-1295 NO DAC 5mg + IPA 5mg",
        variants: [{ code: "CP10", packageForm: "10mg × 10 vials", sourcePage: 2 }],
      },
      {
        slug: "cjc-1295-no-dac-ipa-cp20",
        sourceName: "CJC-1295 NO DAC 10mg + IPA 10mg",
        variants: [{ code: "CP20", packageForm: "20mg × 10 vials", sourcePage: 2 }],
      },
    ]);
  });

  it("keeps source ambiguities explicit instead of silently inventing facts", () => {
    expect(findBrowseCatalogProduct("pinealon")).toMatchObject({
      name: "Pinealon",
      sourceName: "Pinealon10mg",
      variants: [{ code: "PN5", packageForm: "5mg × 10 vials" }],
    });
    expect(findBrowseCatalogProduct("mt1")).toMatchObject({
      sourceName: "MT1",
      variants: [{ code: "MT1", packageForm: "10ml × 10 vials" }],
    });
    expect(findBrowseCatalogProduct("klow")).toMatchObject({
      sourceName: "KLOW",
      variants: [
        {
          code: "BBGK",
          packageForm: "GHK 50mg + KPV 10mg + BPC 10mg + TB 10mg × 10 vials",
        },
      ],
    });
  });

  it("keeps all strength rows for the largest product families", () => {
    expect(
      findBrowseCatalogProduct("tirzepatide")?.variants.map(
        ({ code }) => code,
      ),
    ).toEqual(["TR5", "TR10", "TR15", "TR20", "TR30", "TR40", "TR50", "TR60", "TR100"]);
    expect(
      findBrowseCatalogProduct("retatrutide")?.variants.map(
        ({ code }) => code,
      ),
    ).toEqual(["RT5", "RT10", "RT15", "RT20", "RT30", "RT40", "RT50", "RT60"]);
  });

  it("fails closed when a future catalog row is malformed or blocked", () => {
    expect(() => validateBrowseCatalogProduct({ slug: "incomplete" })).toThrow(
      "Invalid browse catalog product",
    );

    expect(() =>
      validateBrowseCatalogProduct({
        slug: "unsupported-claim",
        name: "The current lot is sterile.",
        sourceName: "Supplier row",
        category: "laboratory",
        image: {
          src: "/catalog/unsupported-claim.webp",
          alt: "Editorial laboratory still life",
        },
        variants: [{ code: "TEST", packageForm: "1mg × 10 vials" }],
      }),
    ).toThrow("Browse catalog product unsupported-claim is not publishable");

    expect(() =>
      validateBrowseCatalogProduct({
        slug: "mixed-source-names",
        name: "First exact Name",
        sourceName: "First exact Name",
        category: "blends",
        image: {
          src: "/catalog/mixed-source-names.webp",
          alt: "Neutral illustrative research-catalog still life",
        },
        variants: [
          { code: "FIRST", packageForm: "10mg × 10 vials", sourceName: "First exact Name" },
          { code: "SECOND", packageForm: "20mg × 10 vials", sourceName: "Second exact Name" },
        ],
      }),
    ).toThrow("must contain one exact source Name");
  });
});
