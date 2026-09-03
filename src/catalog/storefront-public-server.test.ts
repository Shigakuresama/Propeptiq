import { describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/config/env-schema";
import type { StorefrontPromotionConfiguration } from "@/config/storefront-promotions";

import { browseCatalogPublicationId } from "./browse-catalog-publication";
import type { DatabaseCatalogRecordSet } from "./database-catalog";
import { parseStorefrontBindings } from "./storefront-bindings";
import { storefrontCatalogData, type StorefrontCatalogData } from "./storefront-catalog-data";
import { storefrontImageMetadata } from "./storefront-public";
import { resolvePublicVariantPrice } from "./storefront-price-presentation";
import {
  createPublicStorefrontRequestAccessors,
  loadPublicStorefrontCatalog,
  loadPublicStorefrontView,
  resolvePricePresentationMode,
  STOREFRONT_CATALOG_DATABASE_UNAVAILABLE,
} from "./storefront-public-server";

const productId = "10000000-0000-4000-8000-000000000001";
const variantId = "20000000-0000-4000-8000-000000000001";
const productId2 = "10000000-0000-4000-8000-000000000002";
const variantId2 = "20000000-0000-4000-8000-000000000002";

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

const twoProductCatalogData: StorefrontCatalogData = {
  products: [
    boundCatalogData.products[0]!,
    {
      id: productId2,
      slug: "retatrutide",
      name: "Retatrutide",
      category: "metabolic",
      description: null,
      image: {
        src: "/catalog/retatrutide.webp",
        alt: "Original illustrative research-catalog still life for Retatrutide",
        width: 1254,
        height: 1254,
      },
      aliases: [],
      popularityRank: 2,
      releasedAt: "2026-08-29T00:00:00.000Z",
      defaultVariantId: variantId2,
      variantIds: [variantId2],
      relatedProductIds: [],
      contentIds: [],
    },
  ],
  bindings: parseStorefrontBindings({
    products: [
      boundCatalogData.bindings.products[0]!,
      {
        id: productId2,
        browseSlug: "retatrutide",
        popularityRank: 2,
        releasedAt: "2026-08-29T00:00:00.000Z",
        defaultVariantId: variantId2,
        relatedProductIds: [],
        contentIds: [],
      },
    ],
    variants: [
      boundCatalogData.bindings.variants[0]!,
      {
        id: variantId2,
        productId: productId2,
        browseCode: "RT5",
        sku: "TEST-SERVER-RT5",
        label: "5 mg second server fixture",
        amount: { value: 5, unit: "mg" },
        packageQuantity: 1,
        currency: "USD",
        baseUnitMinor: 0,
        priceStatus: "pending",
        availability: "preview_only",
        stripeProductId: "prod_private_second_fixture",
        stripePriceId: "price_private_second_fixture",
      },
    ],
  }),
};

const twoProductRecords: DatabaseCatalogRecordSet = {
  ...records,
  products: [
    records.products[0]!,
    {
      ...records.products[0]!,
      id: productId2,
      slug: "database-retatrutide",
      name: "Database Retatrutide Fixture",
    },
  ],
  variants: [
    records.variants[0]!,
    {
      ...records.variants[0]!,
      id: variantId2,
      productId: productId2,
      sku: "TEST-SERVER-RT5",
      label: "5 mg second server fixture",
      stripeProductId: "prod_private_second_fixture",
      stripePriceId: "price_private_second_fixture",
    },
  ],
  prices: [
    records.prices[0]!,
    {
      ...records.prices[0]!,
      id: "40000000-0000-4000-8000-000000000002",
      productId: productId2,
      variantId: variantId2,
      amountMinor: 3_000,
    },
  ],
  lots: [
    records.lots[0]!,
    {
      ...records.lots[0]!,
      id: "50000000-0000-4000-8000-000000000002",
      productId: productId2,
      variantId: variantId2,
      supplierLotCode: "TEST-SERVER-LOT-2",
    },
  ],
};

function configuredPromotion(
  overrides: Partial<StorefrontPromotionConfiguration> = {},
): StorefrontPromotionConfiguration {
  return {
    id: "winter30",
    displayName: "Winter Sale",
    displayCode: "WINTER30",
    discountBps: 3_000,
    enabled: true,
    startAt: null,
    endAt: null,
    timezone: "America/Los_Angeles",
    applicationMode: "automatic",
    scope: { kind: "sitewide" },
    ...overrides,
  };
}

function databasePromotion(
  overrides: Partial<DatabaseCatalogRecordSet["promotions"][number]> = {},
): DatabaseCatalogRecordSet["promotions"][number] {
  return {
    id: "60000000-0000-4000-8000-000000000001",
    campaignKey: "winter30",
    code: "WINTER30",
    version: 1,
    name: "Winter Sale",
    kind: "discount",
    status: "active",
    enabled: true,
    timezone: "America/Los_Angeles",
    applicationMode: "automatic",
    scope: "sitewide",
    amountMinor: null,
    basisPoints: 3_000,
    currency: null,
    startsAt: null,
    endsAt: null,
    configuration: {},
    ...overrides,
  };
}

function environment(overrides: Record<string, string | undefined> = {}) {
  return parseServerEnv({
    APP_ENV: "local",
    BROWSE_CATALOG_PUBLICATION: browseCatalogPublicationId,
    DATABASE_MODE: "disabled",
    ...overrides,
  });
}

function databaseEnvironment() {
  return environment({
    DATABASE_MODE: "test",
    TEST_DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/fixture",
    TEST_DATABASE_CONFIRMATION: "isolated-test-database",
  });
}

function sqlStateError(code: string, message = "private database detail") {
  const error = new Error(message);
  Object.defineProperty(error, "code", {
    configurable: true,
    enumerable: true,
    value: code,
    writable: true,
  });
  return error;
}

describe("public storefront server acquisition", () => {
  it("falls back to reviewed display facts when the optional catalog schema is absent", async () => {
    const reporter = vi.fn();
    const view = await loadPublicStorefrontView(databaseEnvironment(), {
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
      loadDatabaseRecords: vi.fn(async () => {
        throw sqlStateError("42P01", "private product_variants schema detail");
      }),
      reportCatalogDatabaseUnavailable: reporter,
      now: () => new Date("2026-08-31T12:00:00.000Z"),
    });

    expect(view.catalog.products).toHaveLength(56);
    expect(view.catalog.products.flatMap((product) =>
      product.kind === "canonical" ? product.variants : [],
    )).toHaveLength(103);
    expect(view.pricing.automaticPromotions).toEqual([
      expect.objectContaining({ id: "winter30", displayCode: "WINTER30", discountBps: 3_000 }),
    ]);
    expect(view.catalog.products.flatMap((product) =>
      product.kind === "canonical" ? product.variants : [],
    ).some((variant) => variant.checkoutReady)).toBe(false);
    expect(reporter).toHaveBeenCalledWith(STOREFRONT_CATALOG_DATABASE_UNAVAILABLE);
  });

  it("reports one fixed token and survives reporter failure without exposing the database error", async () => {
    const secret = "private product_variants schema detail";
    const reporter = vi.fn(() => {
      throw new Error("reporter failure");
    });
    const view = await loadPublicStorefrontView(databaseEnvironment(), {
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
      loadDatabaseRecords: vi.fn(async () => {
        throw sqlStateError("42P01", secret);
      }),
      reportCatalogDatabaseUnavailable: reporter,
      now: () => new Date("2026-08-31T12:00:00.000Z"),
    });

    expect(reporter).toHaveBeenCalledOnce();
    expect(reporter).toHaveBeenCalledWith(STOREFRONT_CATALOG_DATABASE_UNAVAILABLE);
    expect(JSON.stringify(view)).not.toContain(secret);
  });

  it("does not retain partially projected database facts after an absent-schema failure", async () => {
    const partialVariants = {
      map() {
        throw sqlStateError("42P01", "private projection detail");
      },
    };
    const recordsWithPartialProjection = { ...records, variants: partialVariants };
    const view = await loadPublicStorefrontView(databaseEnvironment(), {
      catalogData: boundCatalogData,
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
      loadDatabaseRecords: vi.fn(async () => recordsWithPartialProjection as unknown as DatabaseCatalogRecordSet),
      reportCatalogDatabaseUnavailable: vi.fn(),
      now: () => new Date("2026-08-31T12:00:00.000Z"),
      configuredPromotions: Object.freeze([]),
    });

    const product = view.catalog.products.find((entry) => entry.kind === "canonical");
    expect(product).toMatchObject({ variants: [{ id: variantId, checkoutReady: false, priceStatus: "pending" }] });
  });

  it.each([
    ["unrelated SQLSTATE", sqlStateError("23505", "private unique violation")],
    ["generic error", new Error("private database failure")],
  ] as const)("rethrows %s", async (_label, error) => {
    await expect(loadPublicStorefrontView(databaseEnvironment(), {
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
      loadDatabaseRecords: vi.fn(async () => { throw error; }),
      now: () => new Date("2026-08-31T12:00:00.000Z"),
    })).rejects.toBe(error);
  });

  it("does not invoke a throwing code accessor while inspecting a database error", async () => {
    const error = Object.defineProperty(new Error("private database failure"), "code", {
      configurable: true,
      get() {
        throw new Error("code getter invoked");
      },
    });

    await expect(loadPublicStorefrontView(databaseEnvironment(), {
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
      loadDatabaseRecords: vi.fn(async () => { throw error; }),
      now: () => new Date("2026-08-31T12:00:00.000Z"),
    })).rejects.toBe(error);
  });

  it("applies configured WINTER30 to static display facts when database is disabled", async () => {
    const view = await loadPublicStorefrontView(environment(), {
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
      now: () => new Date("2026-08-31T12:00:00.000Z"),
    });
    expect(view.pricing.automaticPromotions).toHaveLength(1);
    expect(view.pricing.automaticPromotions[0]).toMatchObject({ id: "winter30", discountBps: 3_000 });
    expect(view.pricing.automaticPromotions[0]?.scope.kind).toBe("variants");
    const product = view.catalog.products.find((entry) => entry.slug === "tirzepatide");
    expect(product?.kind).toBe("canonical");
  });

  it("fails closed for malformed configured promotions in the static lane", async () => {
    const view = await loadPublicStorefrontView(environment(), {
      configuredPromotions: [{}], controlledContent: [], verifiedImageMetadata: storefrontImageMetadata,
      now: () => new Date("2026-08-31T12:00:00.000Z"),
    });
    expect(view.pricing.automaticPromotions).toEqual([]);
    expect(view.catalog.products.flatMap((product) => product.kind === "canonical" ? product.variants : []).some((variant) => variant.priceStatus === "active")).toBe(false);
  });

  it.each([
    ["database disabled", environment(), boundCatalogData],
    [
      "database disabled with canonical catalog",
      environment(),
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
    if (catalogData.products.length === 0) {
      expect(view.pricing.automaticPromotions).toEqual([]);
    } else if (catalogData === storefrontCatalogData) {
      expect(view.pricing.automaticPromotions).toHaveLength(1);
    } else {
      expect(view.pricing.automaticPromotions).toEqual([]);
    }
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
      configuredPromotions: Object.freeze([]),
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
      CATALOG_DEMO_MODE: "enabled",
      TEST_DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/fixture",
      TEST_DATABASE_CONFIRMATION: "isolated-test-database",
    }), {
      catalogData: boundCatalogData,
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
      configuredPromotions: Object.freeze([]),
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
        configuredPromotions: Object.freeze([]),
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

  it("turns an active positive variant into the established pending shape when default WINTER30 authority is absent", async () => {
    const view = await loadPublicStorefrontView(environment({
      DATABASE_MODE: "test",
      TEST_DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/fixture",
      TEST_DATABASE_CONFIRMATION: "isolated-test-database",
    }), {
      catalogData: boundCatalogData,
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
      loadDatabaseRecords: vi.fn(async () => records),
      now: () => new Date("2026-08-31T12:00:00.000Z"),
      nodeEnv: "production",
    });

    const product = view.catalog.products.find((entry) => entry.kind === "canonical" && entry.id === productId);
    expect(product).toMatchObject({
      kind: "canonical",
      variants: [{
        id: variantId,
        priceStatus: "pending",
        baseUnitMinor: null,
        currency: null,
        availability: "preview_only",
        checkoutReady: false,
      }],
    });
    expect(view.pricing.automaticPromotions).toEqual([]);
    expect(JSON.stringify(product)).not.toContain("2500");
  });

  it("fails a mismatched persisted WINTER30 row closed but preserves exact persisted 30% pricing", async () => {
    const env = environment({
      DATABASE_MODE: "test",
      TEST_DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/fixture",
      TEST_DATABASE_CONFIRMATION: "isolated-test-database",
    });
    const mismatched = await loadPublicStorefrontView(env, {
      catalogData: boundCatalogData,
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
      loadDatabaseRecords: vi.fn(async () => ({
        ...records,
        promotions: [databasePromotion({ basisPoints: 2_999 })],
      })),
      now: () => new Date("2026-08-31T12:00:00.000Z"),
      nodeEnv: "production",
      reportPromotionDiagnostic: vi.fn(),
    });
    expect(
      mismatched.catalog.products.find((entry) => entry.kind === "canonical" && entry.id === productId),
    ).toMatchObject({ variants: [{ priceStatus: "pending", baseUnitMinor: null }] });

    const exact = await loadPublicStorefrontView(env, {
      catalogData: boundCatalogData,
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
      loadDatabaseRecords: vi.fn(async () => ({
        ...records,
        promotions: [databasePromotion()],
      })),
      now: () => new Date("2026-08-31T12:00:00.000Z"),
      nodeEnv: "production",
    });
    const exactProduct = exact.catalog.products.find((entry) => entry.kind === "canonical" && entry.id === productId);
    if (exactProduct?.kind !== "canonical") throw new Error("expected canonical fixture");
    expect(exactProduct.variants[0]).toMatchObject({
      priceStatus: "active",
      baseUnitMinor: 2_500,
      checkoutReady: true,
    });
    expect(exact.pricing.automaticPromotions).toEqual([
      expect.objectContaining({ id: "winter30", discountBps: 3_000 }),
    ]);
    expect(resolvePublicVariantPrice({
      variant: exactProduct.variants[0]!,
      productId,
      quantity: 1,
      pricing: exact.pricing,
    })).toMatchObject({
      state: "priced",
      price: { effectiveUnitMinor: 1_750, effectiveDiscountBps: 3_000 },
    });
  });

  it.each([
    ["product", configuredPromotion({ id: "product20", displayName: "Product Offer", displayCode: null, discountBps: 2_000, scope: { kind: "products", productIds: [productId] } })],
    ["variant", configuredPromotion({ id: "variant20", displayName: "Variant Offer", displayCode: null, discountBps: 2_000, scope: { kind: "variants", variantIds: [variantId] } })],
  ] as const)("suppresses only the active fact affected by a missing %s-scoped owner campaign", async (_label, configuration) => {
    const view = await loadPublicStorefrontView(environment({
      DATABASE_MODE: "test",
      TEST_DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/fixture",
      TEST_DATABASE_CONFIRMATION: "isolated-test-database",
    }), {
      catalogData: twoProductCatalogData,
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
      loadDatabaseRecords: vi.fn(async () => twoProductRecords),
      now: () => new Date("2026-08-31T12:00:00.000Z"),
      nodeEnv: "production",
      configuredPromotions: [configuration],
    });

    expect(view.catalog.products.find((entry) => entry.kind === "canonical" && entry.id === productId)).toMatchObject({
      variants: [{ priceStatus: "pending", baseUnitMinor: null }],
    });
    expect(view.catalog.products.find((entry) => entry.kind === "canonical" && entry.id === productId2)).toMatchObject({
      variants: [{ priceStatus: "active", baseUnitMinor: 3_000 }],
    });
  });

  it("suppresses every active fact for malformed owner configuration while preserving pending facts and empty browse-only acquisition", async () => {
    const env = environment({
      DATABASE_MODE: "test",
      TEST_DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/fixture",
      TEST_DATABASE_CONFIRMATION: "isolated-test-database",
    });
    const invalid = await loadPublicStorefrontView(env, {
      catalogData: twoProductCatalogData,
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
      loadDatabaseRecords: vi.fn(async () => twoProductRecords),
      now: () => new Date("2026-08-31T12:00:00.000Z"),
      configuredPromotions: {},
    });
    expect(
      invalid.catalog.products
        .filter((entry) => entry.kind === "canonical")
        .flatMap((entry) => entry.variants)
        .map((variant) => variant.priceStatus),
    ).toEqual(["pending", "pending"]);

    const pending = await loadPublicStorefrontView(env, {
      catalogData: boundCatalogData,
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
      loadDatabaseRecords: vi.fn(async () => ({
        ...records,
        prices: [{
          ...records.prices[0]!,
          priceStatus: "pending" as const,
          amountMinor: 0,
        }],
      })),
      now: () => new Date("2026-08-31T12:00:00.000Z"),
    });
    expect(pending.catalog.products.find((entry) => entry.kind === "canonical" && entry.id === productId)).toMatchObject({
      variants: [{ priceStatus: "pending", baseUnitMinor: 0 }],
    });

    await expect(loadPublicStorefrontView(environment(), {
      catalogData: storefrontCatalogData,
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
      now: () => new Date("2026-08-31T12:00:00.000Z"),
    })).resolves.toMatchObject({ catalog: { products: expect.any(Array) } });
  });
});
