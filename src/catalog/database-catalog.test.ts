import { describe, expect, it, vi } from "vitest";

import { parseStorefrontBindings } from "./storefront-bindings";
import {
  loadDatabaseCatalogRecords,
  type CatalogQueryPort,
  type DatabaseCatalogRecordSet,
} from "./database-catalog";
import { buildRuntimeVariantPresentationFacts } from "./storefront-public";

const productId = "10000000-0000-4000-8000-000000000001";
const variantId = "20000000-0000-4000-8000-000000000001";
const now = new Date("2026-08-31T12:00:00.000Z");

const binding = parseStorefrontBindings({
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
    sku: "TEST-DB-TR5",
    label: "5 mg database fixture",
    amount: { value: 5, unit: "mg" },
    packageQuantity: 1,
    currency: "USD",
    baseUnitMinor: 0,
    priceStatus: "pending",
    availability: "preview_only",
    stripeProductId: "prod_test_db_tr5",
    stripePriceId: "price_test_db_tr5",
  }],
});

function databaseRecords(
  prices: DatabaseCatalogRecordSet["prices"],
  overrides: Partial<DatabaseCatalogRecordSet> = {},
): DatabaseCatalogRecordSet {
  return {
    source: "production",
    products: [{
      id: productId,
      slug: "canonical-database-fixture",
      name: "Canonical database fixture",
      packageForm: "sealed unit",
      materialIdentity: "Neutral fixture identity",
      policyGroupId: "40000000-0000-4000-8000-000000000001",
      status: "active",
    }],
    variants: [{
      id: variantId,
      productId,
      sku: "TEST-DB-TR5",
      label: "5 mg database fixture",
      canonicalAmount: 5,
      amountUnit: "mg",
      packageQuantity: 1,
      status: "active",
      stripeProductId: "prod_test_db_tr5",
      stripePriceId: "price_test_db_tr5",
    }],
    prices,
    lots: [{
      id: "50000000-0000-4000-8000-000000000001",
      productId,
      variantId,
      supplierName: "Test fixture supplier",
      supplierLotCode: "TEST-LOT",
      availableQuantity: 4,
      status: "released",
      analyticalMethod: null,
      manufacturedAt: null,
      expiresAt: "2026-09-30T00:00:00.000Z",
    }],
    coaDocuments: [],
    claims: [],
    promotions: [],
    promotionTargets: [],
    ...overrides,
  };
}

function price(
  priceStatus: "pending" | "active" | "unavailable",
  amountMinor: number | null,
  currency = "USD",
  id = "60000000-0000-4000-8000-000000000001",
) {
  return {
    id,
    productId,
    variantId,
    version: 1,
    priceStatus,
    amountMinor,
    currency,
    effectiveAt: "2026-08-30T00:00:00.000Z",
    supersededAt: null,
  } as const;
}

describe("database catalog loader", () => {
  it("preserves nullable amounts and variant-scoped identity/payment columns", async () => {
    const observedSql: string[] = [];
    const query = vi.fn(async (sql: string) => {
      observedSql.push(sql);
      if (sql.includes("FROM products\n")) return { rows: [] };
      if (sql.includes("FROM product_variants")) return { rows: [{
        id: variantId,
        productId,
        sku: "TEST-DB-TR5",
        label: "5 mg database fixture",
        canonicalAmount: "5.000000",
        amountUnit: "mg",
        packageQuantity: "1",
        status: "active",
        stripeProductId: "prod_test_db_tr5",
        stripePriceId: "price_test_db_tr5",
      }] };
      if (sql.includes("FROM product_prices")) return { rows: [
        price("pending", 0, "USD", "60000000-0000-4000-8000-000000000001"),
        price("pending", null, "USD", "60000000-0000-4000-8000-000000000002"),
        price("active", 2_500, "USD", "60000000-0000-4000-8000-000000000003"),
        price("active", null, "USD", "60000000-0000-4000-8000-000000000004"),
        price("unavailable", 2_500, "USD", "60000000-0000-4000-8000-000000000005"),
      ] };
      return { rows: [] };
    });

    const records = await loadDatabaseCatalogRecords({ query } as CatalogQueryPort);

    expect(records.prices.map((entry) => entry.amountMinor)).toEqual([
      0,
      null,
      2_500,
      null,
      2_500,
    ]);
    expect(records.prices.map((entry) => entry.variantId)).toEqual([
      variantId,
      variantId,
      variantId,
      variantId,
      variantId,
    ]);
    expect(records.variants[0]).toMatchObject({
      stripeProductId: "prod_test_db_tr5",
      stripePriceId: "price_test_db_tr5",
    });
    expect(observedSql.find((sql) => sql.includes("FROM product_variants"))).toMatch(
      /stripe_product_id AS "stripeProductId"[\s\S]*stripe_price_id AS "stripePriceId"/u,
    );
  });
});

describe("runtime canonical variant presentation facts", () => {
  it("uses the one current USD price even when another current currency exists", () => {
    const facts = buildRuntimeVariantPresentationFacts({
      records: databaseRecords([
        price("active", 2_500),
        price("active", 9_999, "EUR", "60000000-0000-4000-8000-000000000002"),
      ]),
      bindings: binding,
      now,
    });

    expect(facts).toEqual([expect.objectContaining({
      variantId,
      productId,
      priceStatus: "active",
      baseUnitMinor: 2_500,
      currency: "USD",
      availability: "available",
      availableQuantity: 4,
      paymentMappingStatus: "configured_match",
      checkoutReady: true,
    })]);
  });

  it.each([
    ["pending zero", price("pending", 0), { priceStatus: "pending", baseUnitMinor: 0, currency: "USD", availability: "preview_only", checkoutReady: false }],
    ["pending null", price("pending", null), { priceStatus: "pending", baseUnitMinor: null, currency: null, availability: "preview_only", checkoutReady: false }],
    ["active positive", price("active", 2_500), { priceStatus: "active", baseUnitMinor: 2_500, currency: "USD", availability: "available", checkoutReady: true }],
    ["unavailable positive", price("unavailable", 2_500), { priceStatus: "unavailable", baseUnitMinor: null, currency: null, availability: "unavailable", checkoutReady: false }],
  ] as const)("projects %s without reinterpreting its persisted state", (_label, currentPrice, expected) => {
    expect(buildRuntimeVariantPresentationFacts({
      records: databaseRecords([currentPrice]),
      bindings: binding,
      now,
    })).toEqual([expect.objectContaining(expected)]);
  });

  it("omits an active null or duplicate current USD price instead of coercing or choosing", () => {
    expect(buildRuntimeVariantPresentationFacts({
      records: databaseRecords([price("active", null)]),
      bindings: binding,
      now,
    })).toEqual([]);

    expect(buildRuntimeVariantPresentationFacts({
      records: databaseRecords([
        price("active", 2_500),
        price("active", 2_600, "USD", "60000000-0000-4000-8000-000000000002"),
      ]),
      bindings: binding,
      now,
    })).toEqual([]);
  });

  it("keeps an active price visible but unavailable when exact-variant stock is zero", () => {
    const records = databaseRecords([price("active", 2_500)], { lots: [] });

    expect(buildRuntimeVariantPresentationFacts({ records, bindings: binding, now })).toEqual([
      expect.objectContaining({
        priceStatus: "active",
        baseUnitMinor: 2_500,
        availability: "unavailable",
        availableQuantity: 0,
        checkoutReady: false,
      }),
    ]);
  });

  it("rejects database identity mismatches and never borrows another variant's presentation", () => {
    const records = databaseRecords([price("active", 2_500)], {
      variants: [{
        ...databaseRecords([]).variants[0]!,
        sku: "DIFFERENT-SKU",
      }],
    });

    expect(buildRuntimeVariantPresentationFacts({ records, bindings: binding, now })).toEqual([]);
  });

  it("requires both database and binding payment mappings to match without exposing either", () => {
    const records = databaseRecords([price("active", 2_500)], {
      variants: [{
        ...databaseRecords([]).variants[0]!,
        stripePriceId: "price_different",
      }],
    });

    expect(buildRuntimeVariantPresentationFacts({ records, bindings: binding, now })).toEqual([
      expect.objectContaining({
        paymentMappingStatus: "missing_or_mismatched",
        checkoutReady: false,
      }),
    ]);
  });
});
