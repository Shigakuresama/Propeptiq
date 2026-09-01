import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import type { ControlledContentRecord } from "@/content/storefront-content";

import { browseCatalogPublicationId } from "./browse-catalog-publication";
import { parseStorefrontBindings } from "./storefront-bindings";
import type { StorefrontCatalogData } from "./storefront-catalog-data";
import type { StorefrontProduct } from "./storefront-types";
import {
  StorefrontProjectionError,
  assessLegacyCatalogConvergence,
  buildPublicStorefrontCatalog,
  findPublicStorefrontProduct,
  parseRuntimeVariantPresentationFacts,
  resolvePublicStorefrontRelatedProducts,
  storefrontImageMetadata,
  type RuntimeVariantPresentationFact,
  type CanonicalPublicStorefrontProduct,
} from "./storefront-public";

const productId = "10000000-0000-4000-8000-000000000001";
const firstVariantId = "20000000-0000-4000-8000-000000000001";
const defaultVariantId = "20000000-0000-4000-8000-000000000002";
const approvedFirstId = "30000000-0000-4000-8000-000000000001";
const draftId = "30000000-0000-4000-8000-000000000002";
const approvedSecondId = "30000000-0000-4000-8000-000000000003";

const canonicalProduct: StorefrontProduct = Object.freeze({
  id: productId,
  slug: "tirzepatide",
  name: "Tirzepatide",
  category: "metabolic",
  description: "Neutral approved fixture description.",
  image: Object.freeze({
    src: "/catalog/tirzepatide.webp",
    alt: "Original illustrative research-catalog still life for Tirzepatide",
    width: 1254,
    height: 1254,
  }),
  aliases: Object.freeze(["fixture alias"]),
  popularityRank: 7,
  releasedAt: "2026-08-30T00:00:00.000Z",
  defaultVariantId,
  variantIds: Object.freeze([firstVariantId, defaultVariantId]),
  relatedProductIds: Object.freeze([]),
  contentIds: Object.freeze([approvedSecondId, draftId, approvedFirstId]),
});

const bindings = parseStorefrontBindings({
  products: [
    {
      id: productId,
      browseSlug: "tirzepatide",
      popularityRank: 7,
      releasedAt: "2026-08-30T00:00:00.000Z",
      defaultVariantId,
      relatedProductIds: [],
      contentIds: [approvedSecondId, draftId, approvedFirstId],
    },
  ],
  variants: [
    {
      id: firstVariantId,
      productId,
      browseCode: "TR5",
      sku: "TEST-TIRZ-5",
      label: "Deliberately not a browse display label",
      amount: { value: 5, unit: "mg" },
      packageQuantity: 1,
      currency: "USD",
      baseUnitMinor: 0,
      priceStatus: "pending",
      availability: "preview_only",
      stripeProductId: "prod_server_only_fixture_5",
      stripePriceId: "price_server_only_fixture_5",
    },
    {
      id: defaultVariantId,
      productId,
      browseCode: "TR10",
      sku: "TEST-TIRZ-10",
      label: "10 mg canonical fixture",
      amount: { value: 10, unit: "mg" },
      packageQuantity: 1,
      currency: "USD",
      baseUnitMinor: 0,
      priceStatus: "pending",
      availability: "preview_only",
      stripeProductId: "prod_server_only_fixture_10",
      stripePriceId: "price_server_only_fixture_10",
    },
  ],
});

const catalogData: StorefrontCatalogData = Object.freeze({
  products: Object.freeze([canonicalProduct]),
  bindings,
});

const controlledContent = Object.freeze([
  {
    id: approvedFirstId,
    kind: "product_information",
    status: "approved",
    title: "Approved first fixture",
    body: "Approved first fixture body.",
    sourceReferences: ["fixture-a"],
    approvalNote: "Approved test fixture",
    reviewedAt: "2026-08-30T00:00:00.000Z",
    effectiveAt: null,
  },
  {
    id: draftId,
    kind: "product_information",
    status: "draft",
    title: "Draft fixture",
    body: "Draft body must not render.",
    sourceReferences: [],
    approvalNote: null,
    reviewedAt: null,
    effectiveAt: null,
  },
  {
    id: approvedSecondId,
    kind: "legal_notice",
    status: "approved",
    title: "Approved second fixture",
    body: "Approved second fixture body.",
    sourceReferences: ["fixture-b"],
    approvalNote: "Approved test fixture",
    reviewedAt: "2026-08-30T01:00:00.000Z",
    effectiveAt: null,
  },
] as const satisfies readonly ControlledContentRecord[]);

const runtimeFacts = parseRuntimeVariantPresentationFacts([
  {
    variantId: firstVariantId,
    productId,
    priceStatus: "active",
    baseUnitMinor: 2_500,
    currency: "USD",
    availability: "available",
    availableQuantity: 3,
    paymentMappingStatus: "configured_match",
    checkoutReady: true,
  },
  {
    variantId: defaultVariantId,
    productId,
    priceStatus: "active",
    baseUnitMinor: 3_500,
    currency: "USD",
    availability: "available",
    availableQuantity: 4,
    paymentMappingStatus: "configured_match",
    checkoutReady: true,
  },
]);

function buildFixtureCatalog(
  overrides: Partial<Parameters<typeof buildPublicStorefrontCatalog>[0]> = {},
) {
  return buildPublicStorefrontCatalog({
    configuredPublicationId: browseCatalogPublicationId,
    catalogData,
    runtimeVariantFacts: runtimeFacts,
    controlledContent,
    verifiedImageMetadata: storefrontImageMetadata,
    ...overrides,
  });
}

function recursivelyCollectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) recursivelyCollectKeys(entry, keys);
    return keys;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      keys.add(key);
      recursivelyCollectKeys(entry, keys);
    }
  }
  return keys;
}

describe("public storefront projection", () => {
  it("resolves configured related products in order and filters unsafe targets", () => {
    const current = buildFixtureCatalog().products.find((entry) => entry.kind === "canonical") as CanonicalPublicStorefrontProduct;
    const target = { ...current, id: "10000000-0000-4000-8000-000000000002", slug: "target", relatedProductIds: [] };
    const unavailable = { ...target, id: "10000000-0000-4000-8000-000000000003", slug: "unavailable", variants: target.variants.map((variant) => ({ ...variant, availability: "unavailable" as const })) };
    const catalog = { ...buildFixtureCatalog(), products: [current, target, unavailable] };
    const withRelations = { ...current, relatedProductIds: [target.id, target.id, "missing", current.id, unavailable.id] };
    const result = resolvePublicStorefrontRelatedProducts(catalog, withRelations);
    expect(result.map((product) => product.id)).toEqual([target.id]);
    expect(Object.isFrozen(result)).toBe(true);
  });
  it("retains all 56 products and 103 display configurations with empty canonical data", () => {
    const catalog = buildFixtureCatalog({
      catalogData: {
        products: [],
        bindings: parseStorefrontBindings({ products: [], variants: [] }),
      },
      runtimeVariantFacts: [],
      controlledContent: [],
    });

    expect(catalog.products).toHaveLength(56);
    expect(catalog.displayConfigurationCount).toBe(103);
    expect(catalog.products.every((product) => product.kind === "browse_only")).toBe(true);
    expect(catalog.products[0]).toMatchObject({
      kind: "browse_only",
      id: null,
      defaultVariantId: null,
      variants: [],
      pricingState: "pricing_pending",
      image: { width: 1254, height: 1254 },
    });
  });

  it("binds only by browse slug and browse code while using the explicit default variant", () => {
    const product = findPublicStorefrontProduct(buildFixtureCatalog(), "tirzepatide");

    expect(product).toMatchObject({
      kind: "canonical",
      id: productId,
      defaultVariantId,
    });
    if (product?.kind !== "canonical") throw new Error("expected canonical fixture");
    expect(product.displayConfigurations).toHaveLength(9);
    expect(product.displayConfigurations.slice(0, 2)).toEqual([
      { displayCode: "TR5", packageForm: "5mg × 10 vials" },
      { displayCode: "TR10", packageForm: "10mg × 10 vials" },
    ]);
    expect(product.variants.map((variant) => variant.id)).toEqual([
      firstVariantId,
      defaultVariantId,
    ]);
    expect(product.variants[0]?.label).toBe("Deliberately not a browse display label");
  });

  it("publishes referenced approved content in product-configured order", () => {
    const product = findPublicStorefrontProduct(buildFixtureCatalog(), "tirzepatide");
    if (product?.kind !== "canonical") throw new Error("expected canonical fixture");

    expect(product.content.map((entry) => entry.id)).toEqual([
      approvedSecondId,
      approvedFirstId,
    ]);
    expect(product.content.every((entry) => entry.status === "approved")).toBe(true);
  });

  it("recursively excludes loose provider, payment, and inventory fields from approved content", () => {
    const looseControlledContent = controlledContent.map(
      (record) => record.id === approvedFirstId
        ? {
            ...record,
            stripePriceId: "price_private_content_fixture",
            availableQuantity: 12,
            sourceReferences: [{
              stripePriceId: "price_nested_private_content_fixture",
            }],
            approvalNote: {
              providerToken: "provider_nested_private_content_fixture",
            },
            provider: {
              name: "private-provider-fixture",
              stripeProductId: "prod_private_content_fixture",
            },
          }
        : record,
    ) as unknown as readonly ControlledContentRecord[];
    const product = findPublicStorefrontProduct(
      buildFixtureCatalog({ controlledContent: looseControlledContent }),
      "tirzepatide",
    );
    if (product?.kind !== "canonical") throw new Error("expected canonical fixture");

    const keys = recursivelyCollectKeys(product.content);
    expect(product.content.map((record) => record.id)).toEqual([approvedSecondId]);
    expect(keys).not.toContain("stripePriceId");
    expect(keys).not.toContain("availableQuantity");
    expect(keys).not.toContain("provider");
    expect(keys).not.toContain("stripeProductId");
    expect(keys).not.toContain("providerToken");
  });

  it("allowlist-maps variants and recursively excludes server-only mappings and inventory facts", () => {
    const serialized = JSON.parse(JSON.stringify(buildFixtureCatalog())) as unknown;
    const keys = recursivelyCollectKeys(serialized);

    expect(keys).not.toContain("stripeProductId");
    expect(keys).not.toContain("stripePriceId");
    expect(keys).not.toContain("paymentMappingStatus");
    expect(keys).not.toContain("availableQuantity");
    expect(keys).not.toContain("browseCode");
    expect(keys).not.toContain("priceId");
    expect(keys).not.toContain("priceVersion");
  });

  it("keeps truthful price and availability but disables checkout for a missing payment match", () => {
    const facts: readonly RuntimeVariantPresentationFact[] = [
      {
        ...runtimeFacts[0]!,
        paymentMappingStatus: "missing_or_mismatched",
        checkoutReady: false,
      },
      runtimeFacts[1]!,
    ];
    const product = findPublicStorefrontProduct(
      buildFixtureCatalog({ runtimeVariantFacts: facts }),
      "tirzepatide",
    );
    if (product?.kind !== "canonical") throw new Error("expected canonical fixture");

    expect(product.variants[0]).toMatchObject({
      baseUnitMinor: 2_500,
      currency: "USD",
      priceStatus: "active",
      availability: "available",
      checkoutReady: false,
    });
  });

  it("fails a missing or cross-product runtime fact closed to pending null", () => {
    const product = findPublicStorefrontProduct(
      buildFixtureCatalog({
        runtimeVariantFacts: [
          { ...runtimeFacts[0]!, productId: "10000000-0000-4000-8000-000000000099" },
        ],
      }),
      "tirzepatide",
    );
    if (product?.kind !== "canonical") throw new Error("expected canonical fixture");

    expect(product.variants).toEqual([
      expect.objectContaining({
        id: firstVariantId,
        baseUnitMinor: null,
        currency: null,
        priceStatus: "pending",
        availability: "preview_only",
        checkoutReady: false,
      }),
      expect.objectContaining({
        id: defaultVariantId,
        baseUnitMinor: null,
        currency: null,
        priceStatus: "pending",
        checkoutReady: false,
      }),
    ]);
  });

  it("rejects duplicate or internally inconsistent runtime presentation facts", () => {
    expect(() => parseRuntimeVariantPresentationFacts([
      runtimeFacts[0]!,
      runtimeFacts[0]!,
    ])).toThrow(/duplicate runtime variant presentation fact/iu);

    const activeFact = runtimeFacts[0]!;
    if (activeFact.priceStatus !== "active") throw new Error("expected active fixture");
    expect(() => parseRuntimeVariantPresentationFacts([{
      ...activeFact,
      checkoutReady: true,
      paymentMappingStatus: "missing_or_mismatched",
    }])).toThrow(/checkout-ready/iu);
  });

  it("throws a typed projection error when duplicated binding facts disagree with canonical data", () => {
    const mismatchedData: StorefrontCatalogData = {
      ...catalogData,
      products: [{ ...canonicalProduct, popularityRank: 8 }],
    };

    expect(() => buildFixtureCatalog({ catalogData: mismatchedData })).toThrowError(
      expect.objectContaining<Partial<StorefrontProjectionError>>({
        name: "StorefrontProjectionError",
        code: "binding_product_mismatch",
      }),
    );
  });

  it("rejects duplicate canonical variant IDs even when binding membership lengths match", () => {
    const duplicatedCanonicalData: StorefrontCatalogData = {
      products: [{
        ...canonicalProduct,
        defaultVariantId: firstVariantId,
        variantIds: [firstVariantId, firstVariantId],
      }],
      bindings: parseStorefrontBindings({
        products: bindings.products.map((product) => ({
          ...product,
          defaultVariantId: firstVariantId,
        })),
        variants: bindings.variants,
      }),
    };

    expect(() => buildFixtureCatalog({ catalogData: duplicatedCanonicalData })).toThrowError(
      expect.objectContaining<Partial<StorefrontProjectionError>>({
        name: "StorefrontProjectionError",
        code: "binding_variant_mismatch",
      }),
    );
  });

  it("requires the exact configured publication and returns null for an unknown retained slug", () => {
    expect(() => buildFixtureCatalog({ configuredPublicationId: "wrong-publication" })).toThrow(
      /publication does not match/iu,
    );
    expect(findPublicStorefrontProduct(buildFixtureCatalog(), "not-a-real-item")).toBeNull();
  });

  it("verifies every projected catalog image against the actual 1254 by 1254 WebP bytes", async () => {
    expect(storefrontImageMetadata).toHaveLength(56);
    for (const image of storefrontImageMetadata) {
      const metadata = await sharp(
        join(process.cwd(), "public", image.src.slice(1)),
      ).metadata();
      expect(
        { width: metadata.width, height: metadata.height, format: metadata.format },
        image.src,
      ).toEqual({ width: 1254, height: 1254, format: "webp" });
    }
  });
});

describe("legacy catalog convergence assessment", () => {
  it("compares price and availability to the explicit default variant rather than array element zero", () => {
    const result = assessLegacyCatalogConvergence([
      {
        id: productId,
        slug: "tirzepatide",
        price: { amountMinor: 3_500, currency: "USD" },
        availableQuantity: 1,
        requiresDemoDisclosure: false,
      },
    ], buildFixtureCatalog().products);

    expect(result).toEqual({ ready: true, reasons: [] });
  });

  it("rejects missing, browse-only, and synthetic-demo semantics without authorizing a redirect", () => {
    const products = buildFixtureCatalog().products;
    const result = assessLegacyCatalogConvergence([
      {
        id: "40000000-0000-4000-8000-000000000001",
        slug: "synthetic-reference-alpha",
        price: { amountMinor: 2_400, currency: "USD" },
        availableQuantity: 1,
        requiresDemoDisclosure: true,
      },
      {
        id: "40000000-0000-4000-8000-000000000002",
        slug: "retatrutide",
        price: { amountMinor: 4_000, currency: "USD" },
        availableQuantity: 1,
        requiresDemoDisclosure: false,
      },
      {
        id: productId,
        slug: "tirzepatide",
        price: { amountMinor: 3_500, currency: "USD" },
        availableQuantity: 1,
        requiresDemoDisclosure: true,
      },
    ], products);

    expect(result).toEqual({
      ready: false,
      reasons: [
        { slug: "retatrutide", code: "identity_unproven", legacyProductId: "40000000-0000-4000-8000-000000000002", targetProductId: null },
        { slug: "synthetic-reference-alpha", code: "missing_target" },
        { slug: "tirzepatide", code: "demo_semantics_unrepresented" },
      ],
    });
  });

  it("records both price and availability mismatches in deterministic slug and code order", () => {
    const result = assessLegacyCatalogConvergence([
      {
        id: productId,
        slug: "tirzepatide",
        price: { amountMinor: 1, currency: "USD" },
        availableQuantity: 0,
        requiresDemoDisclosure: false,
      },
    ], buildFixtureCatalog().products);

    expect(result).toEqual({
      ready: false,
      reasons: [
        {
          slug: "tirzepatide",
          code: "availability_mismatch",
          legacyAvailable: false,
          targetAvailable: true,
        },
        {
          slug: "tirzepatide",
          code: "price_mismatch",
          legacyAmountMinor: 1,
          legacyCurrency: "USD",
          targetAmountMinor: 3_500,
          targetCurrency: "USD",
          targetPriceStatus: "active",
        },
      ],
    });
  });

  it("reports a slug collision before considering identity or default variants", () => {
    const product = findPublicStorefrontProduct(buildFixtureCatalog(), "tirzepatide")!;
    if (product.kind !== "canonical") throw new Error("expected canonical fixture");
    const result = assessLegacyCatalogConvergence([
      {
        id: productId,
        slug: "tirzepatide",
        price: { amountMinor: 3_500, currency: "USD" },
        availableQuantity: 1,
        requiresDemoDisclosure: false,
      },
    ], [product, { ...product, id: "10000000-0000-4000-8000-000000000099" }]);

    expect(result).toEqual({
      ready: false,
      reasons: [{
        slug: "tirzepatide",
        code: "slug_collision",
        targetProductIds: [productId, "10000000-0000-4000-8000-000000000099"],
      }],
    });
  });
});
