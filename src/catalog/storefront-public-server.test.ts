import { describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/config/env-schema";

import { browseCatalogPublicationId } from "./browse-catalog-publication";
import type { DatabaseCatalogRecordSet } from "./database-catalog";
import { parseStorefrontBindings } from "./storefront-bindings";
import { storefrontCatalogData, type StorefrontCatalogData } from "./storefront-catalog-data";
import { storefrontImageMetadata } from "./storefront-public";
import { loadPublicStorefrontCatalog } from "./storefront-public-server";

const productId = "10000000-0000-4000-8000-000000000001";
const variantId = "20000000-0000-4000-8000-000000000001";

const boundCatalogData: StorefrontCatalogData = {
  products: [{
    id: productId,
    slug: "tirzepatide",
    name: "Tirzepatide",
    category: "metabolic",
    description: null,
    image: {
      src: "/catalog/tirzepatide.webp",
      alt: "Original illustrative research-catalog still life for Tirzepatide",
      width: 1254,
      height: 1254,
    },
    aliases: [],
    popularityRank: 1,
    releasedAt: "2026-08-30T00:00:00.000Z",
    defaultVariantId: variantId,
    variantIds: [variantId],
    relatedProductIds: [],
    contentIds: [],
  }],
  bindings: parseStorefrontBindings({
    products: [{
      id: productId,
      browseSlug: "tirzepatide",
      popularityRank: 1,
      releasedAt: "2026-08-30T00:00:00.000Z",
      defaultVariantId: variantId,
      relatedProductIds: [],
      contentIds: [],
    }],
    variants: [{
      id: variantId,
      productId,
      browseCode: "TR5",
      sku: "TEST-SERVER-TR5",
      label: "5 mg server fixture",
      amount: { value: 5, unit: "mg" },
      packageQuantity: 1,
      currency: "USD",
      baseUnitMinor: 0,
      priceStatus: "pending",
      availability: "preview_only",
      stripeProductId: "prod_private_server_fixture",
      stripePriceId: "price_private_server_fixture",
    }],
  }),
};

const records: DatabaseCatalogRecordSet = {
  source: "production",
  products: [{
    id: productId,
    slug: "database-tirzepatide",
    name: "Database Tirzepatide Fixture",
    packageForm: "sealed unit",
    materialIdentity: "Neutral fixture identity",
    policyGroupId: "30000000-0000-4000-8000-000000000001",
    status: "active",
  }],
  variants: [{
    id: variantId,
    productId,
    sku: "TEST-SERVER-TR5",
    label: "5 mg server fixture",
    canonicalAmount: 5,
    amountUnit: "mg",
    packageQuantity: 1,
    status: "active",
    stripeProductId: "prod_private_server_fixture",
    stripePriceId: "price_private_server_fixture",
  }],
  prices: [{
    id: "40000000-0000-4000-8000-000000000001",
    productId,
    variantId,
    version: 1,
    priceStatus: "active",
    amountMinor: 2_500,
    currency: "USD",
    effectiveAt: "2026-08-30T00:00:00.000Z",
    supersededAt: null,
  }],
  lots: [{
    id: "50000000-0000-4000-8000-000000000001",
    productId,
    variantId,
    supplierName: "Test fixture supplier",
    supplierLotCode: "TEST-SERVER-LOT",
    availableQuantity: 2,
    status: "released",
    analyticalMethod: null,
    manufacturedAt: null,
    expiresAt: "2026-09-30T00:00:00.000Z",
  }],
  coaDocuments: [],
  claims: [],
  promotions: [],
  promotionTargets: [],
};

function environment(overrides: Record<string, string | undefined> = {}) {
  return parseServerEnv({
    APP_ENV: "local",
    BROWSE_CATALOG_PUBLICATION: browseCatalogPublicationId,
    DATABASE_MODE: "disabled",
    ...overrides,
  });
}

describe("public storefront server acquisition", () => {
  it.each([
    ["database disabled", environment(), boundCatalogData],
    [
      "empty canonical bindings",
      environment({
        DATABASE_MODE: "test",
        TEST_DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/fixture",
        TEST_DATABASE_CONFIRMATION: "isolated-test-database",
      }),
      storefrontCatalogData,
    ],
    [
      "synthetic demo owns the legacy catalog",
      environment({ CATALOG_DEMO_MODE: "enabled" }),
      boundCatalogData,
    ],
  ] as const)("does not invoke the database loader when %s", async (_label, env, catalogData) => {
    const loadDatabaseRecords = vi.fn(async () => {
      throw new Error("database loader must stay closed");
    });

    const catalog = await loadPublicStorefrontCatalog(env, {
      catalogData,
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
      loadDatabaseRecords,
      now: () => new Date("2026-08-31T12:00:00.000Z"),
    });

    expect(loadDatabaseRecords).not.toHaveBeenCalled();
    expect(catalog.products).toHaveLength(56);
  });

  it("invokes only the injected production-shaped loader once and emits safe public fields", async () => {
    const env = environment({
      DATABASE_MODE: "test",
      TEST_DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/fixture",
      TEST_DATABASE_CONFIRMATION: "isolated-test-database",
    });
    const loadDatabaseRecords = vi.fn(async () => records);

    const catalog = await loadPublicStorefrontCatalog(env, {
      catalogData: boundCatalogData,
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
      loadDatabaseRecords,
      now: () => new Date("2026-08-31T12:00:00.000Z"),
    });

    expect(loadDatabaseRecords).toHaveBeenCalledOnce();
    expect(loadDatabaseRecords).toHaveBeenCalledWith(env);
    expect(catalog.products.find((product) => product.slug === "tirzepatide")).toMatchObject({
      kind: "canonical",
      variants: [{
        id: variantId,
        baseUnitMinor: 2_500,
        availability: "available",
        checkoutReady: true,
      }],
    });
    const serialized = JSON.stringify(catalog);
    expect(serialized).not.toContain("prod_private_server_fixture");
    expect(serialized).not.toContain("price_private_server_fixture");
    expect(serialized).not.toContain("paymentMappingStatus");
    expect(serialized).not.toContain("availableQuantity");
  });
});
