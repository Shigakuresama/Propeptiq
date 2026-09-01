import { describe, expect, it } from "vitest";

import type {
  BrowseOnlyPublicStorefrontProduct,
  CanonicalPublicStorefrontProduct,
  PublicStorefrontProduct,
  PublicStorefrontVariant,
} from "@/catalog/storefront-public";
import {
  testCanonicalProduct,
  testPricingContext,
  testPublicVariant,
  testWinter30,
} from "@/components/commerce/storefront-test-fixtures";

import { buildCatalogDiscoveryRows } from "./catalog-discovery";

function canonicalProduct(
  slug: string,
  variants: readonly PublicStorefrontVariant[] = [testPublicVariant()],
  overrides: Partial<CanonicalPublicStorefrontProduct> = {},
): CanonicalPublicStorefrontProduct {
  return structuredClone(
    testCanonicalProduct(variants, {
      id: `synthetic-${slug}-id`,
      slug,
      name: `Synthetic ${slug} research item`,
      popularityRank: 7,
      releasedAt: "2026-08-31T00:00:00.000Z",
      ...overrides,
    }),
  );
}

function browseOnlyProduct(
  overrides: Partial<BrowseOnlyPublicStorefrontProduct> = {},
): BrowseOnlyPublicStorefrontProduct {
  return {
    kind: "browse_only",
    id: null,
    slug: "synthetic-browse-only",
    name: "Synthetic Browse-only Research Item",
    sourceName: "Synthetic Browse Source",
    category: "Synthetic Supplies",
    image: {
      src: "/catalog/tirzepatide.webp",
      alt: "Synthetic browse-only fixture image",
      width: 1_254,
      height: 1_254,
    },
    displayConfigurations: [
      {
        displayCode: "SYN-BROWSE",
        packageForm: "Synthetic package",
        sourceName: "Synthetic Browse Source",
      },
    ],
    defaultVariantId: null,
    variants: [],
    pricingState: "pricing_pending",
    ...overrides,
  };
}

describe("buildCatalogDiscoveryRows", () => {
  it("projects one frozen identity-safe row per product in configured order", () => {
    const canonical = canonicalProduct("synthetic-alpha", undefined, {
      aliases: ["Synthetic Alias"],
      popularityRank: 4,
      releasedAt: "2026-08-29T01:02:03.000Z",
    });
    const browseOnly = browseOnlyProduct();
    const products: PublicStorefrontProduct[] = [canonical, browseOnly];
    const before = structuredClone(products);
    const pricing = {
      mode: "production" as const,
      evaluatedAt: "2026-08-31T12:00:00.000Z",
      automaticPromotions: [],
    };

    const rows = buildCatalogDiscoveryRows({ products, pricing });

    expect(rows.map(({ productSlug }) => productSlug)).toEqual([
      "synthetic-alpha",
      "synthetic-browse-only",
    ]);
    expect(rows[0]).toMatchObject({
      productSlug: "synthetic-alpha",
      searchEntry: {
        id: "product:synthetic-alpha",
        href: "/catalog/items/synthetic-alpha",
        exactTerms: expect.arrayContaining(["Synthetic Alias", "TEST-5MG", "5 mg"]),
      },
      sortRow: {
        id: "product:synthetic-alpha",
        name: "Synthetic synthetic-alpha research item",
        popularityRank: 4,
        releasedAt: "2026-08-29T01:02:03.000Z",
        price: { state: "active", effectiveMinor: 1_000 },
      },
    });
    expect(rows[1]).toMatchObject({
      productSlug: "synthetic-browse-only",
      searchEntry: {
        id: "product:synthetic-browse-only",
        href: "/catalog/items/synthetic-browse-only",
      },
      sortRow: {
        id: "product:synthetic-browse-only",
        popularityRank: null,
        releasedAt: null,
        price: { state: "pending" },
      },
    });
    expect(rows.every(({ searchEntry, sortRow }) => searchEntry.id === sortRow.id)).toBe(true);
    expect(products).toEqual(before);
    expect(Object.isFrozen(products)).toBe(false);
    expect(Object.isFrozen(products[0])).toBe(false);
    expect(Object.isFrozen(pricing)).toBe(false);
    expect(Object.isFrozen(rows)).toBe(true);
    expect(rows.every(Object.isFrozen)).toBe(true);
    expect(rows.every(({ searchEntry }) => Object.isFrozen(searchEntry))).toBe(true);
    expect(rows.every(({ sortRow }) => Object.isFrozen(sortRow))).toBe(true);
  });

  it("uses the exact card selector and quantity-one effective price", () => {
    const expensiveDefault = testPublicVariant({
      id: "synthetic-expensive-default",
      sku: "SYN-EXPENSIVE",
      label: "10 mg synthetic default",
      baseUnitMinor: 10_000,
    });
    const cheaperDisplayed = testPublicVariant({
      id: "synthetic-cheaper-displayed",
      sku: "SYN-CHEAPER",
      label: "5 mg synthetic option",
      baseUnitMinor: 5_000,
    });
    const product = canonicalProduct(
      "synthetic-selector-agreement",
      [expensiveDefault, cheaperDisplayed],
      { defaultVariantId: expensiveDefault.id },
    );

    const [row] = buildCatalogDiscoveryRows({
      products: [product],
      pricing: testPricingContext("production", [
        {
          ...testWinter30,
          scope: { kind: "products", productIds: [product.id] },
        },
      ]),
    });

    expect(row?.sortRow.price).toEqual({ state: "active", effectiveMinor: 3_500 });
  });

  it.each([
    [
      "checkout-unavailable priced",
      testPublicVariant({ checkoutReady: false, baseUnitMinor: 2_500 }),
      testPricingContext("production"),
      { state: "active", effectiveMinor: 2_500 },
    ],
    [
      "local zero preview",
      testPublicVariant({
        availability: "preview_only",
        priceStatus: "pending",
        baseUnitMinor: 0,
        currency: "USD",
        checkoutReady: false,
      }),
      testPricingContext("local"),
      { state: "active", effectiveMinor: 0 },
    ],
    [
      "pending",
      testPublicVariant({
        priceStatus: "pending",
        baseUnitMinor: null,
        currency: null,
        checkoutReady: false,
      }),
      testPricingContext("production"),
      { state: "pending" },
    ],
    [
      "all unavailable",
      testPublicVariant({ availability: "unavailable", checkoutReady: false }),
      testPricingContext("production"),
      { state: "unavailable" },
    ],
  ] as const)("maps the %s card presentation to the sort bucket", (_label, variant, pricing, expected) => {
    const [row] = buildCatalogDiscoveryRows({
      products: [canonicalProduct("synthetic-price-state", [variant])],
      pricing,
    });

    expect(row?.sortRow.price).toEqual(expected);
  });

  it("maps a canonical product with no selectable variant to unavailable", () => {
    const [row] = buildCatalogDiscoveryRows({
      products: [canonicalProduct("synthetic-no-selection", [], { defaultVariantId: "missing" })],
      pricing: testPricingContext("production"),
    });

    expect(row?.sortRow.price).toEqual({ state: "unavailable" });
  });

  it("does not infer popularity, release dates, or browse-only prices", () => {
    const [canonical, browseOnly] = buildCatalogDiscoveryRows({
      products: [
        canonicalProduct("synthetic-explicit-merchandising", undefined, {
          popularityRank: 91,
          releasedAt: "2025-02-03T04:05:06.000Z",
        }),
        browseOnlyProduct(),
      ],
      pricing: testPricingContext("local"),
    });

    expect(canonical?.sortRow).toMatchObject({
      popularityRank: 91,
      releasedAt: "2025-02-03T04:05:06.000Z",
    });
    expect(browseOnly?.sortRow).toMatchObject({
      popularityRank: null,
      releasedAt: null,
      price: { state: "pending" },
    });
  });

  it("fails deterministically for duplicate slugs and projection identity mismatches", () => {
    expect(() =>
      buildCatalogDiscoveryRows({
        products: [
          canonicalProduct("synthetic-duplicate"),
          canonicalProduct("synthetic-duplicate", undefined, { name: "Synthetic duplicate two" }),
        ],
        pricing: testPricingContext("production"),
      }),
    ).toThrow(TypeError);

    let reads = 0;
    const changingSlug = canonicalProduct("synthetic-initial") as CanonicalPublicStorefrontProduct & {
      slug: string;
    };
    Object.defineProperty(changingSlug, "slug", {
      configurable: true,
      enumerable: true,
      get: () => (++reads === 1 ? "synthetic-first" : "synthetic-second"),
    });

    expect(() =>
      buildCatalogDiscoveryRows({
        products: [changingSlug],
        pricing: testPricingContext("production"),
      }),
    ).toThrow(TypeError);
  });
});
