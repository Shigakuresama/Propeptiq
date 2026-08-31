import { describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/config/env-schema";

import { browseCatalogPublicationId } from "./browse-catalog-publication";
import type { DatabaseCatalogRecordSet } from "./database-catalog";
import { parseStorefrontBindings } from "./storefront-bindings";
import { storefrontCatalogData, type StorefrontCatalogData } from "./storefront-catalog-data";
import { storefrontImageMetadata } from "./storefront-public";
import {
  createPublicStorefrontRequestAccessors,
  loadPublicStorefrontCatalog,
  loadPublicStorefrontView,
  resolvePricePresentationMode,
} from "./storefront-public-server";

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
  promotionVariantTargets: [],
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

    const view = await loadPublicStorefrontView(env, {
      catalogData,
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
      loadDatabaseRecords,
      now: () => new Date("2026-08-31T12:00:00.000Z"),
    });

    expect(loadDatabaseRecords).not.toHaveBeenCalled();
    expect(view.catalog.products).toHaveLength(56);
    expect(view.pricing.automaticPromotions).toEqual([]);
    expect(Object.isFrozen(view.pricing.automaticPromotions)).toBe(true);
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

  it.each([
    ["production APP_ENV beats test", { APP_ENV: "production", VERCEL_ENV: undefined, VERCEL_TARGET_ENV: undefined }, "test", "production"],
    ["production VERCEL_ENV beats test", { APP_ENV: "preview", VERCEL_ENV: "production", VERCEL_TARGET_ENV: undefined }, "test", "production"],
    ["production target beats test", { APP_ENV: "local", VERCEL_ENV: undefined, VERCEL_TARGET_ENV: "production" }, "test", "production"],
    ["explicit test marker", { APP_ENV: "local", VERCEL_ENV: undefined, VERCEL_TARGET_ENV: undefined }, "test", "test"],
    ["preview identity", { APP_ENV: "preview", VERCEL_ENV: "preview", VERCEL_TARGET_ENV: undefined }, "production", "preview"],
    ["ordinary local", { APP_ENV: "local", VERCEL_ENV: undefined, VERCEL_TARGET_ENV: undefined }, "production", "local"],
  ] as const)("resolves presentation mode for %s", (_label, env, nodeEnv, expected) => {
    expect(resolvePricePresentationMode(env, { nodeEnv })).toBe(expected);
  });

  it("does not treat DATABASE_MODE=test as presentation test mode", async () => {
    const view = await loadPublicStorefrontView(environment({
      DATABASE_MODE: "test",
      TEST_DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/fixture",
      TEST_DATABASE_CONFIRMATION: "isolated-test-database",
    }), {
      catalogData: storefrontCatalogData,
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
      nodeEnv: "production",
      now: () => new Date("2026-08-31T12:00:00.000Z"),
    });
    expect(view.pricing.mode).toBe("local");
  });

  it("uses one captured instant for current variant facts and promotion activity", async () => {
    const exactNow = new Date("2026-08-31T12:00:00.000Z");
    const nowMock = vi.fn(() => exactNow);
    const sameInstantRecords: DatabaseCatalogRecordSet = {
      ...records,
      prices: [{ ...records.prices[0]!, effectiveAt: exactNow.toISOString() }],
      promotions: [{
        id: "private-promotion-record",
        campaignKey: "starts-now",
        code: "STARTSNOW",
        version: 1,
        name: "Starts now fixture",
        kind: "discount",
        status: "active",
        enabled: true,
        timezone: "America/Los_Angeles",
        applicationMode: "automatic",
        scope: "sitewide",
        amountMinor: null,
        basisPoints: 1_000,
        currency: null,
        startsAt: exactNow.toISOString(),
        endsAt: null,
        configuration: {},
      }],
    };
    const view = await loadPublicStorefrontView(environment({
      DATABASE_MODE: "test",
      TEST_DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/fixture",
      TEST_DATABASE_CONFIRMATION: "isolated-test-database",
    }), {
      catalogData: boundCatalogData,
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
      loadDatabaseRecords: vi.fn(async () => sameInstantRecords),
      now: nowMock,
      nodeEnv: "test",
    });

    expect(nowMock).toHaveBeenCalledOnce();
    expect(view.pricing.evaluatedAt).toBe(exactNow.toISOString());
    expect(view.pricing.automaticPromotions).toEqual([
      expect.objectContaining({ id: "starts-now", startAt: exactNow.toISOString() }),
    ]);
    expect(view.catalog.products.find((entry) => entry.slug === "tirzepatide")).toMatchObject({
      kind: "canonical",
      variants: [{ priceStatus: "active", baseUnitMinor: 2_500 }],
    });
  });

  it("uses the safe default diagnostic reporter without leaking database details", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const malformedRecords: DatabaseCatalogRecordSet = {
      ...records,
      promotions: [{
        id: "private-record-never-log",
        campaignKey: "bad-timezone",
        code: "BADTZ",
        version: 1,
        name: "Bad timezone fixture",
        kind: "discount",
        status: "active",
        enabled: true,
        timezone: "private/configuration",
        applicationMode: "automatic",
        scope: "sitewide",
        amountMinor: null,
        basisPoints: 1_000,
        currency: null,
        startsAt: null,
        endsAt: null,
        configuration: { providerSecret: "never-log" },
      }],
    };
    try {
      const view = await loadPublicStorefrontView(environment({
        DATABASE_MODE: "test",
        TEST_DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/fixture",
        TEST_DATABASE_CONFIRMATION: "isolated-test-database",
      }), {
        catalogData: boundCatalogData,
        controlledContent: [],
        verifiedImageMetadata: storefrontImageMetadata,
        loadDatabaseRecords: vi.fn(async () => malformedRecords),
        now: () => new Date("2026-08-31T12:00:00.000Z"),
        nodeEnv: "test",
      });
      expect(view.pricing.automaticPromotions).toEqual([]);
      expect(warn).toHaveBeenCalledOnce();
      const serializedWarning = JSON.stringify(warn.mock.calls);
      expect(serializedWarning).toContain("invalid_campaign");
      expect(serializedWarning).toContain("bad-timezone");
      expect(serializedWarning).not.toContain("private-record-never-log");
      expect(serializedWarning).not.toContain("never-log");
    } finally {
      warn.mockRestore();
    }
  });

  it("shares one modeled request acquisition between the view and compatibility catalog accessor", async () => {
    const connect = vi.fn(async () => undefined);
    const readEnvironment = vi.fn(() => environment());
    const loadView = vi.fn(async () => ({
      catalog: Object.freeze({ publicationId: browseCatalogPublicationId, products: Object.freeze([]), displayConfigurationCount: 0 }),
      pricing: Object.freeze({ mode: "local" as const, evaluatedAt: "2026-08-31T12:00:00.000Z", automaticPromotions: Object.freeze([]) }),
    }));
    const cacheView = <T,>(acquire: () => Promise<T>) => {
      let result: Promise<T> | undefined;
      return () => result ??= acquire();
    };
    const accessors = createPublicStorefrontRequestAccessors({
      connect,
      readEnvironment,
      loadView,
      cacheView,
    });

    const view = await accessors.getView();
    const catalog = await accessors.getCatalog();
    expect(catalog).toBe(view.catalog);
    expect(connect).toHaveBeenCalledOnce();
    expect(readEnvironment).toHaveBeenCalledOnce();
    expect(loadView).toHaveBeenCalledOnce();
  });
});
