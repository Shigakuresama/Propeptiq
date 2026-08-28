import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  browseCatalogProducts,
  browseCatalogVariantCount,
  findBrowseCatalogProduct,
  validateBrowseCatalogProduct,
} from "./browse-catalog";

describe("browse-only supplier catalog", () => {
  it("preserves every price-free PDF row while grouping package variants", () => {
    expect(browseCatalogProducts).toHaveLength(53);
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
      expect(product.image.src).toMatch(/^\/catalog\/[^/]+\.webp$/u);
      expect(product.image.alt).toContain(product.name);
      expect(
        existsSync(join(process.cwd(), "public", product.image.src.slice(1))),
      ).toBe(true);
    }

    expect(new Set(browseCatalogProducts.map(({ image }) => image.src)).size).toBe(53);
    for (const product of browseCatalogProducts) {
      expect(product.image.src).toBe(`/catalog/${product.slug}.webp`);
    }
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
  });
});
