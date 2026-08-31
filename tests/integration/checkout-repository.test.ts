import { createHash } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hashReviewSnapshot } from "@/commerce/checkout-identity";
import { createCheckoutService } from "@/commerce/checkout-service";
import {
  createPostgresCheckoutRepository,
  resolveExactReviewRequest,
} from "@/db/repositories/checkout-repository";
import { createFulfillmentRepository } from "@/db/repositories/fulfillment-repository";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  buyer: "30000000-0000-4000-8000-000000000001",
  buyer2: "30000000-0000-4000-8000-000000000002",
  attestation: "30000000-0000-4000-8000-000000000003",
  acceptance: "30000000-0000-4000-8000-000000000004",
  acceptance2: "30000000-0000-4000-8000-000000000005",
  group: "30000000-0000-4000-8000-000000000006",
  productA: "30000000-0000-4000-8000-000000000007",
  productB: "30000000-0000-4000-8000-000000000008",
  priceA: "30000000-0000-4000-8000-000000000009",
  priceB: "30000000-0000-4000-8000-000000000010",
  lotA1: "30000000-0000-4000-8000-000000000011",
  lotA2: "30000000-0000-4000-8000-000000000012",
  lotB: "30000000-0000-4000-8000-000000000013",
  policyA: "30000000-0000-4000-8000-000000000014",
  policyB: "30000000-0000-4000-8000-000000000015",
  promotion: "30000000-0000-4000-8000-000000000016",
  promotionTarget: "30000000-0000-4000-8000-000000000017",
  providerEvent: "30000000-0000-4000-8000-000000000018",
  paymentEvent: "30000000-0000-4000-8000-000000000019",
  previousAttestation: "30000000-0000-4000-8000-000000000020",
  variantA: "30000000-0000-4000-8000-000000000021",
  variantPriceA: "30000000-0000-4000-8000-000000000022",
  variantLotA: "30000000-0000-4000-8000-000000000023",
  variantPromotion: "30000000-0000-4000-8000-000000000024",
  variantPromotionTarget: "30000000-0000-4000-8000-000000000025",
  variantB: "30000000-0000-4000-8000-000000000026",
  losingVariantPromotion: "30000000-0000-4000-8000-000000000027",
  groupB: "30000000-0000-4000-8000-000000000028",
  crossedVariantB: "10000000-0000-4000-8000-000000000029",
  crossedVariantPriceB: "30000000-0000-4000-8000-000000000030",
  crossedVariantLotB: "30000000-0000-4000-8000-000000000031",
  unrelatedVariantPromotion: "30000000-0000-4000-8000-000000000032",
  unrelatedVariantPromotionTarget: "30000000-0000-4000-8000-000000000033",
} as const;

const now = new Date("2026-08-25T12:00:00.000Z");
const sha256 = async (value: string) =>
  createHash("sha256").update(value).digest("hex");

function keyedUuid(label: string): string {
  const hex = createHash("sha256").update(`synthetic:${label}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const request = {
  items: [
    { productId: ids.productA, quantity: 3 },
    { productId: ids.productB, quantity: 1 },
  ],
  destination: {
    recipientName: "Synthetic Researcher",
    line1: "100 Test Way",
    line2: null,
    city: "Testville",
    stateCode: "CA",
    postalCode: "90001",
    countryCode: "US",
  },
  promotionIds: [] as string[],
};

describe("authoritative checkout PostgreSQL repository on PGlite", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = await createMigratedPglite();
    await client.exec(`
      INSERT INTO users (id, clerk_id, email_verified_at)
      VALUES
        ('${ids.buyer}', 'clerk-synthetic-buyer-a', '2026-08-01T00:00:00.000Z'),
        ('${ids.buyer2}', 'clerk-synthetic-buyer-b', '2026-08-01T00:00:00.000Z');
      INSERT INTO buyer_profiles
        (user_id, status, age_confirmed_at, research_purpose, updated_at)
      VALUES
        ('${ids.buyer}', 'active', '2026-08-01T00:00:00.000Z', 'analytical', '2026-08-24T00:00:00.000Z'),
        ('${ids.buyer2}', 'active', '2026-08-01T00:00:00.000Z', 'analytical', '2026-08-24T00:00:00.000Z');
      INSERT INTO attestation_versions
        (id, version, content_hash, policy_text, effective_at)
      VALUES
        ('${ids.attestation}', 1, '${"a".repeat(64)}', 'Synthetic research-use policy.', '2026-08-01T00:00:00.000Z');
      INSERT INTO attestation_acceptances
        (id, user_id, attestation_version_id, accepted_at)
      VALUES
        ('${ids.acceptance}', '${ids.buyer}', '${ids.attestation}', '2026-08-02T00:00:00.000Z'),
        ('${ids.acceptance2}', '${ids.buyer2}', '${ids.attestation}', '2026-08-02T00:00:00.000Z');
      INSERT INTO product_policy_groups (id, slug, name, active)
      VALUES ('${ids.group}', 'synthetic-group', 'Synthetic group', true);
      INSERT INTO products
        (id, slug, name, package_form, material_identity, policy_group_id, status)
      VALUES
        ('${ids.productA}', 'synthetic-a', 'Synthetic Reference A', 'Sealed unit A', 'Synthetic identity A', '${ids.group}', 'active'),
        ('${ids.productB}', 'synthetic-b', 'Synthetic Reference B', 'Sealed unit B', 'Synthetic identity B', '${ids.group}', 'active');
      INSERT INTO product_prices
        (id, product_id, version, amount_minor, currency, effective_at)
      VALUES
        ('${ids.priceA}', '${ids.productA}', 1, 5000, 'USD', '2026-08-01T00:00:00.000Z'),
        ('${ids.priceB}', '${ids.productB}', 1, 4000, 'USD', '2026-08-01T00:00:00.000Z');
      INSERT INTO lots
        (id, product_id, supplier_name, supplier_lot_code, received_quantity,
         available_quantity, status, expires_at)
      VALUES
        ('${ids.lotA1}', '${ids.productA}', 'Synthetic supplier', 'SYN-A-EARLY', 1, 1, 'released', '2026-09-01T00:00:00.000Z'),
        ('${ids.lotA2}', '${ids.productA}', 'Synthetic supplier', 'SYN-A-LATE', 5, 5, 'released', '2026-12-01T00:00:00.000Z'),
        ('${ids.lotB}', '${ids.productB}', 'Synthetic supplier', 'SYN-B-OPEN', 5, 5, 'released', NULL);
      INSERT INTO destination_policies
        (id, scope_kind, product_id, state_code, result, version, active, effective_at)
      VALUES
        ('${ids.policyA}', 'product', '${ids.productA}', 'CA', 'allowed', 1, true, '2026-08-01T00:00:00.000Z'),
        ('${ids.policyB}', 'product', '${ids.productB}', 'CA', 'allowed', 1, true, '2026-08-01T00:00:00.000Z');
      INSERT INTO promotions
        (id, code, version, name, kind, status, basis_points, configuration,
         starts_at, ends_at)
      VALUES
        ('${ids.promotion}', 'SYN10', 1, 'Synthetic ten percent', 'discount',
         'active', 1000, '{}'::jsonb, '2026-08-01T00:00:00.000Z',
         '2026-09-01T00:00:00.000Z');
      INSERT INTO promotion_targets
        (id, promotion_id, target_kind, product_id)
      VALUES
        ('${ids.promotionTarget}', '${ids.promotion}', 'product', '${ids.productA}');
    `);
  });

  afterEach(async () => client.close());

  function setup(
    options: Readonly<{
      generator?: (label: string) => string;
      failTransactions?: number;
      transactionSql?: string[];
      transactionQueries?: Array<{ sql: string; params: readonly unknown[] }>;
    }> = {},
  ) {
    let transactionAttempts = 0;
    const repository = createPostgresCheckoutRepository({
      client: {
        query: (sql, params = []) => client.query(sql, [...params]),
      },
      runTransaction: (work) => {
        transactionAttempts += 1;
        if (transactionAttempts <= (options.failTransactions ?? 0)) {
          throw Object.assign(new Error("synthetic serialization failure"), {
            code: "40001",
          });
        }
        return client.transaction((transaction) =>
          work({
            query: (sql, params = []) => {
              options.transactionSql?.push(sql.replace(/\s+/g, " ").trim());
              options.transactionQueries?.push({
                sql: sql.replace(/\s+/g, " ").trim(),
                params: [...params],
              });
              return transaction.query(sql, [...params]);
            },
          }),
        );
      },
      sha256,
      keyedUuid: options.generator ?? keyedUuid,
      retrySleep: async () => undefined,
    });
    const shipping = vi.fn(async (input: { bindingHash: string }) => ({
      status: "ready",
      bindingHash: input.bindingHash,
      reference: "ship_synthetic",
      service: "Synthetic Ground",
      amountMinor: 700,
      currency: "USD",
    }));
    const tax = vi.fn(async (input: { bindingHash: string }) => ({
      status: "ready",
      bindingHash: input.bindingHash,
      reference: "tax_synthetic",
      amountMinor: 325,
      currency: "USD",
    }));
    const service = createCheckoutService({
      repository,
      shippingQuotePort: { quoteShipping: shipping },
      taxQuotePort: { quoteTax: tax },
      sha256,
      clock: () => new Date(now),
      keyedUuid: options.generator ?? keyedUuid,
      moneyPolicy: {
        allowedCurrencies: ["USD"],
        maximumLineCount: 50,
        maximumQuantityPerLine: 25,
        maximumOrderAmountMinor: 1_000_000,
      },
    });
    return {
      repository,
      service,
      shipping,
      tax,
      transactionAttempts: () => transactionAttempts,
    };
  }

  async function quoteAndPrepare(
    key: string,
    buyerUserId: string = ids.buyer,
    checkoutRequest = request,
  ) {
    const setupResult = setup();
    const quoted = await setupResult.service.quote({
      buyerUserId,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request: checkoutRequest,
    });
    expect(quoted.status).toBe("quoted");
    if (quoted.status !== "quoted") throw new Error("expected quote");
    const prepared = await setupResult.service.prepare(quoted.plan, {
      authority: "server_prepared_provider_request",
      provider: "local_test",
      providerIdempotencyKey: `checkout_attempt:${quoted.plan.identity.attemptId}`,
      providerRequestHash: "c".repeat(64),
      providerExpiresAt: "2026-08-25T13:00:00.000Z",
      providerCustomerEmail: "synthetic.buyer@example.test",
      providerOrigin: "http://127.0.0.1:3000",
      providerRequestSchemaVersion: 1,
      providerLivemode: false,
      providerScope: "local_test:synthetic-propeptiq-v1",
    });
    expect(prepared.status).toBe("prepared");
    return { ...setupResult, quoted, prepared };
  }

  const variantRequest = {
    items: [{ variantId: ids.variantA, quantity: 2 }],
    destination: request.destination,
  } as const;

  async function seedCheckoutReadyVariant() {
    await client.exec(`
      INSERT INTO product_variants
        (id, product_id, sku, label, canonical_amount, amount_unit,
         package_quantity, status, stripe_product_id, stripe_price_id,
         updated_at)
      VALUES ('${ids.variantA}', '${ids.productA}', 'SYNTHETIC-VARIANT-5MG',
        '5 mg synthetic checkout fixture', 5, 'mg', 1, 'active',
        'prod_synthetic_variant_a', 'price_synthetic_variant_a',
        '2026-08-24T00:00:00.000Z');
      INSERT INTO product_prices
        (id, product_id, variant_id, version, price_status, amount_minor,
         currency, effective_at)
      VALUES ('${ids.variantPriceA}', '${ids.productA}', '${ids.variantA}',
        1, 'active', 5000, 'USD', '2026-08-01T00:00:00.000Z');
      INSERT INTO lots
        (id, product_id, variant_id, supplier_name, supplier_lot_code,
         received_quantity, available_quantity, status, expires_at,
         updated_at)
      VALUES ('${ids.variantLotA}', '${ids.productA}', '${ids.variantA}',
        'Synthetic supplier', 'SYN-VARIANT-ACTIVE', 5, 5, 'released',
        '2026-12-01T00:00:00.000Z', '2026-08-24T00:00:00.000Z');
      INSERT INTO promotions
        (id, code, version, name, kind, status, basis_points, configuration,
         starts_at, ends_at, campaign_key, enabled, timezone,
         application_mode, scope)
      VALUES ('${ids.variantPromotion}', 'WINTER30', 1, 'Winter Sale',
        'discount', 'active', 3000, '{}'::jsonb, NULL, NULL, 'winter30',
        true, 'America/Los_Angeles', 'automatic', 'sitewide');
    `);
  }

  it("returns PRICE_CHANGED before writes when locked canonical variant price facts change", async () => {
    await seedCheckoutReadyVariant();
    const { service } = setup();
    const key = "30000000-0000-4000-8000-000000000121";
    const quoted = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request: variantRequest,
    });
    expect(quoted).toMatchObject({ status: "quoted" });
    if (quoted.status !== "quoted" || quoted.pricingRevision === undefined) {
      throw new Error("expected canonical variant quote");
    }
    await client.exec(`
      UPDATE product_prices SET amount_minor = 5200
      WHERE id = '${ids.variantPriceA}';
    `);
    const stale = await service.quoteForSession({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request: { ...variantRequest, pricingRevision: quoted.pricingRevision },
    });
    expect(stale).toMatchObject({
      status: "PRICE_CHANGED",
      cart: { items: [{ variantId: ids.variantA, unitAmountMinor: 3640 }] },
    });
    const writes = await client.query<{ orders: number; reservations: number }>(`
      SELECT (SELECT count(*)::int FROM orders) AS orders,
             (SELECT count(*)::int FROM inventory_reservations) AS reservations
    `);
    expect(writes.rows[0]).toEqual({ orders: 0, reservations: 0 });
  });

  it("locks, snapshots, and reserves the canonical variant without using legacy null-variant inventory", async () => {
    await seedCheckoutReadyVariant();
    const transactionSql: string[] = [];
    const { service } = setup({ transactionSql });
    const key = "30000000-0000-4000-8000-000000000122";
    const quoted = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request: variantRequest,
    });
    if (quoted.status !== "quoted" || quoted.pricingRevision === undefined) {
      throw new Error("expected canonical variant quote");
    }
    const sessionQuote = await service.quoteForSession({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request: { ...variantRequest, pricingRevision: quoted.pricingRevision },
    });
    if (sessionQuote.status !== "quoted") throw new Error("expected acknowledged quote");
    const prepared = await service.prepare(sessionQuote.plan, {
      authority: "server_prepared_provider_request",
      provider: "local_test",
      providerIdempotencyKey: `checkout_attempt:${sessionQuote.plan.identity.attemptId}`,
      providerRequestHash: "f".repeat(64),
      providerExpiresAt: "2026-08-25T13:00:00.000Z",
      providerCustomerEmail: "synthetic.variant.buyer@example.test",
      providerOrigin: "http://127.0.0.1:3000",
      providerRequestSchemaVersion: 1,
      providerLivemode: false,
      providerScope: "local_test:synthetic-propeptiq-v1",
    });
    expect(prepared).toMatchObject({ status: "prepared" });
    const snapshots = await client.query<{
      variantId: string;
      productId: string;
      remainingVariant: number;
      remainingLegacy: number;
      promotionId: string;
      reservationCount: number;
    }>(`
      SELECT oi.variant_id::text AS "variantId", oi.product_id::text AS "productId",
        (SELECT available_quantity FROM lots WHERE id = '${ids.variantLotA}') AS "remainingVariant",
        (SELECT available_quantity FROM lots WHERE id = '${ids.lotA1}') AS "remainingLegacy",
        (SELECT promotion_id::text FROM order_promotion_applications
          WHERE order_id = oi.order_id) AS "promotionId",
        (SELECT count(*)::int FROM inventory_reservations
          WHERE order_id = oi.order_id) AS "reservationCount"
      FROM order_items oi
      WHERE oi.order_id = '${sessionQuote.plan.identity.orderId}'
    `);
    expect(snapshots.rows[0]).toEqual({
      variantId: ids.variantA,
      productId: ids.productA,
      remainingVariant: 3,
      remainingLegacy: 1,
      promotionId: ids.variantPromotion,
      reservationCount: 1,
    });
    expect(transactionSql.some((sql) =>
      sql.includes("FROM product_variants") && sql.includes("ORDER BY v.id FOR UPDATE"),
    )).toBe(true);
    expect(transactionSql.some((sql) =>
      sql.includes("FROM lots") && sql.includes("variant_id = ANY") && sql.includes("FOR UPDATE"),
    )).toBe(true);
  });

  it("locks globally ordered parents before crossed variant, price, and lot identities", async () => {
    await seedCheckoutReadyVariant();
    await client.exec(`
      INSERT INTO product_policy_groups (id, slug, name, active)
      VALUES ('${ids.groupB}', 'synthetic-crossed-group-b',
              'Synthetic crossed group B', true);
      UPDATE products SET policy_group_id = '${ids.groupB}'
      WHERE id = '${ids.productB}';
      INSERT INTO product_variants
        (id, product_id, sku, label, canonical_amount, amount_unit,
         package_quantity, status, stripe_product_id, stripe_price_id,
         updated_at)
      VALUES ('${ids.crossedVariantB}', '${ids.productB}', 'CROSSED-B-5MG',
        'Crossed B 5 mg fixture', 5, 'mg', 1, 'active',
        'prod_crossed_b', 'price_crossed_b', '2026-08-24T00:00:00.000Z');
      INSERT INTO product_prices
        (id, product_id, variant_id, version, price_status, amount_minor,
         currency, effective_at)
      VALUES ('${ids.crossedVariantPriceB}', '${ids.productB}',
        '${ids.crossedVariantB}', 1, 'active', 4000, 'USD',
        '2026-08-01T00:00:00.000Z');
      INSERT INTO lots
        (id, product_id, variant_id, supplier_name, supplier_lot_code,
         received_quantity, available_quantity, status, expires_at, updated_at)
      VALUES ('${ids.crossedVariantLotB}', '${ids.productB}',
        '${ids.crossedVariantB}', 'Synthetic supplier', 'CROSSED-B-LOT',
        5, 5, 'released', '2026-12-01T00:00:00.000Z',
        '2026-08-24T00:00:00.000Z');
    `);
    const transactionQueries: Array<{
      sql: string;
      params: readonly unknown[];
    }> = [];
    const { service } = setup({ transactionQueries });
    const key = "30000000-0000-4000-8000-000000000133";
    const crossedRequest = {
      ...variantRequest,
      items: [
        { variantId: ids.variantA, quantity: 1 },
        { variantId: ids.crossedVariantB, quantity: 1 },
      ],
    } as const;
    const quoted = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request: crossedRequest,
    });
    if (quoted.status !== "quoted" || quoted.pricingRevision === undefined) {
      throw new Error("expected crossed quote");
    }
    const acknowledged = await service.quoteForSession({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request: { ...crossedRequest, pricingRevision: quoted.pricingRevision },
    });
    if (acknowledged.status !== "quoted") throw new Error("expected acknowledged");
    await expect(service.prepare(acknowledged.plan, {
      authority: "server_prepared_provider_request",
      provider: "local_test",
      providerIdempotencyKey: `checkout_attempt:${acknowledged.plan.identity.attemptId}`,
      providerRequestHash: "6".repeat(64),
      providerExpiresAt: "2026-08-25T13:00:00.000Z",
      providerCustomerEmail: "crossed.parents@example.test",
      providerOrigin: "http://127.0.0.1:3000",
      providerRequestSchemaVersion: 1,
      providerLivemode: false,
      providerScope: "local_test:synthetic-propeptiq-v1",
    })).resolves.toMatchObject({ status: "prepared" });

    const productLockIndex = transactionQueries.findIndex(({ sql }) =>
      /FROM products p WHERE p\.id = ANY\([^)]*\) ORDER BY p\.id FOR UPDATE/iu.test(sql),
    );
    const groupLockIndex = transactionQueries.findIndex(({ sql }) =>
      /FROM product_policy_groups g WHERE g\.id = ANY\([^)]*\) ORDER BY g\.id FOR UPDATE/iu.test(sql),
    );
    const variantLockIndex = transactionQueries.findIndex(({ sql }) =>
      /FROM product_variants v WHERE v\.id = ANY\([^)]*\) ORDER BY v\.id FOR UPDATE/iu.test(sql),
    );
    const priceLockIndex = transactionQueries.findIndex(({ sql }) =>
      /FROM product_prices[\s\S]*FOR UPDATE/iu.test(sql),
    );
    const lotLockIndex = transactionQueries.findIndex(({ sql }) =>
      /FROM lots[\s\S]*variant_id = ANY[\s\S]*FOR UPDATE/iu.test(sql),
    );
    expect(transactionQueries[productLockIndex]?.params[0]).toEqual([
      ids.productA,
      ids.productB,
    ]);
    expect(transactionQueries[groupLockIndex]?.params[0]).toEqual([
      ids.group,
      ids.groupB,
    ]);
    expect(transactionQueries[variantLockIndex]?.params[0]).toEqual([
      ids.crossedVariantB,
      ids.variantA,
    ]);
    expect(productLockIndex).toBeGreaterThanOrEqual(0);
    expect(groupLockIndex).toBeGreaterThan(productLockIndex);
    expect(variantLockIndex).toBeGreaterThan(groupLockIndex);
    expect(priceLockIndex).toBeGreaterThan(variantLockIndex);
    expect(lotLockIndex).toBeGreaterThan(priceLockIndex);
  });

  it("locks only promotion candidates scoped to the cart under the serializable predicate read", async () => {
    await seedCheckoutReadyVariant();
    await client.exec(`
      DELETE FROM promotions WHERE id = '${ids.variantPromotion}';
      INSERT INTO promotions
        (id, code, version, name, kind, status, basis_points, configuration,
         starts_at, ends_at, campaign_key, enabled, timezone,
         application_mode, scope)
      VALUES
        ('${ids.variantPromotion}', 'VARIANT-A-20', 1, 'Variant A offer',
         'discount', 'active', 2000, '{}'::jsonb, NULL, NULL, 'variant-a-20',
         true, 'America/Los_Angeles', 'automatic', 'products'),
        ('${ids.unrelatedVariantPromotion}', 'VARIANT-B-40', 1,
         'Unrelated variant B offer', 'discount', 'active', 4000,
         '{}'::jsonb, NULL, NULL, 'variant-b-40', true,
         'America/Los_Angeles', 'automatic', 'products');
      INSERT INTO promotion_targets
        (id, promotion_id, target_kind, product_id)
      VALUES
        ('${ids.variantPromotionTarget}', '${ids.variantPromotion}', 'product',
         '${ids.productA}'),
        ('${ids.unrelatedVariantPromotionTarget}',
         '${ids.unrelatedVariantPromotion}', 'product', '${ids.productB}');
    `);
    const transactionQueries: Array<{
      sql: string;
      params: readonly unknown[];
    }> = [];
    const { service } = setup({ transactionQueries });
    const key = "30000000-0000-4000-8000-000000000134";
    const quoted = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request: variantRequest,
    });
    if (quoted.status !== "quoted" || quoted.pricingRevision === undefined) {
      throw new Error("expected scoped promotion quote");
    }
    const acknowledged = await service.quoteForSession({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request: { ...variantRequest, pricingRevision: quoted.pricingRevision },
    });
    if (acknowledged.status !== "quoted") throw new Error("expected acknowledged");
    await expect(service.prepare(acknowledged.plan, {
      authority: "server_prepared_provider_request",
      provider: "local_test",
      providerIdempotencyKey: `checkout_attempt:${acknowledged.plan.identity.attemptId}`,
      providerRequestHash: "5".repeat(64),
      providerExpiresAt: "2026-08-25T13:00:00.000Z",
      providerCustomerEmail: "scoped.promotions@example.test",
      providerOrigin: "http://127.0.0.1:3000",
      providerRequestSchemaVersion: 1,
      providerLivemode: false,
      providerScope: "local_test:synthetic-propeptiq-v1",
    })).resolves.toMatchObject({ status: "prepared" });

    const promotionLock = transactionQueries.find(({ sql }) =>
      /FROM promotions p[\s\S]*FOR UPDATE OF p/iu.test(sql),
    );
    expect(promotionLock?.sql).toMatch(/EXISTS[\s\S]*promotion_targets/iu);
    expect(promotionLock?.params).toEqual([
      [ids.productA],
      [ids.group],
      [ids.variantA],
      now.toISOString(),
    ]);
    expect(transactionQueries.some(({ sql }) =>
      /FROM promotions[\s\S]*application_mode = 'automatic'[\s\S]*ORDER BY campaign_key, version, id FOR UPDATE$/iu.test(sql),
    )).toBe(false);
    if (acknowledged.plan.kind !== "canonical_variant") {
      throw new Error("expected canonical plan");
    }
    expect(acknowledged.plan.activeAutomaticPromotions).toEqual([
      { id: "variant-a-20", version: 1 },
    ]);
  });

  it.each([
    {
      label: "another automatic promotion wins",
      quantity: 2,
      keepWinter30: true,
    },
    {
      label: "the quantity tier wins",
      quantity: 10,
      keepWinter30: false,
    },
  ])("retains a losing applicable promotion through locked review recheck when $label", async ({ quantity, keepWinter30 }) => {
    await seedCheckoutReadyVariant();
    await client.exec(`
      UPDATE lots SET received_quantity = 20, available_quantity = 20
      WHERE id = '${ids.variantLotA}';
      ${keepWinter30 ? "" : `DELETE FROM promotions WHERE id = '${ids.variantPromotion}';`}
      INSERT INTO promotions
        (id, code, version, name, kind, status, basis_points, configuration,
         starts_at, ends_at, campaign_key, enabled, timezone,
         application_mode, scope)
      VALUES ('${ids.losingVariantPromotion}', 'SPRING20', 2,
        'Synthetic losing spring offer', 'discount', 'active', 2000,
        '{}'::jsonb, NULL, NULL, 'spring20', true,
        'America/Los_Angeles', 'automatic', 'sitewide');
      UPDATE buyer_profiles SET status = 'review'
      WHERE user_id = '${ids.buyer}';
    `);
    const { service } = setup();
    const key = keepWinter30
      ? "30000000-0000-4000-8000-000000000128"
      : "30000000-0000-4000-8000-000000000129";
    const quote = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request: {
        ...variantRequest,
        items: [{ variantId: ids.variantA, quantity }],
      },
    });
    if (quote.status !== "quoted") throw new Error("expected canonical review quote");

    const prepared = await service.prepare(quote.plan, null);

    expect(prepared).toMatchObject({ status: "review_required" });
    const review = await client.query<{ cartSnapshot: unknown }>(
      `SELECT cart_snapshot AS "cartSnapshot" FROM review_requests
       WHERE order_id = $1::uuid`,
      [quote.plan.identity.orderId],
    );
    expect(review.rows[0]?.cartSnapshot).toEqual({
      schemaVersion: 2,
      kind: "canonical_variant",
      items: [{ variantId: ids.variantA, quantity }],
      automaticPromotions: keepWinter30
        ? [
            { id: "spring20", version: 2 },
            { id: "winter30", version: 1 },
          ]
        : [{ id: "spring20", version: 2 }],
    });
  });

  it("carries exact canonical variant and automatic-promotion review identity through payment and fulfillment", async () => {
    await seedCheckoutReadyVariant();
    await client.exec(`
      INSERT INTO promotions
        (id, code, version, name, kind, status, basis_points, configuration,
         starts_at, ends_at, campaign_key, enabled, timezone,
         application_mode, scope)
      VALUES ('${ids.losingVariantPromotion}', 'SPRING20', 2,
        'Synthetic losing spring offer', 'discount', 'active', 2000,
        '{}'::jsonb, NULL, NULL, 'spring20', true,
        'America/Los_Angeles', 'automatic', 'sitewide');
      UPDATE buyer_profiles SET status = 'review'
      WHERE user_id = '${ids.buyer}';
      INSERT INTO staff_roles
        (user_id, capability, granted_by_user_id, grant_correlation_id)
      VALUES ('${ids.buyer2}', 'fulfillment:release:consume', '${ids.buyer2}',
              'canonical-review-fulfillment-task5');
    `);
    const { service } = setup();
    const key = "30000000-0000-4000-8000-000000000132";
    const quoted = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request: variantRequest,
    });
    if (quoted.status !== "quoted" || quoted.pricingRevision === undefined) {
      throw new Error("expected canonical review quote");
    }
    const review = await service.prepare(quoted.plan, null);
    if (review.status !== "review_required" || review.reviewRequestId === null) {
      throw new Error("expected canonical review request");
    }
    await client.query(
      `UPDATE review_requests
       SET outcome = 'approved', decided_by_user_id = $2::uuid,
           decided_at = $3::timestamptz, covers_buyer_review = true
       WHERE id = $1::uuid`,
      [review.reviewRequestId, ids.buyer2, now.toISOString()],
    );
    const approved = await service.quoteForSession({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request: {
        ...variantRequest,
        pricingRevision: quoted.pricingRevision,
      },
    });
    if (approved.status !== "quoted") throw new Error("expected approved quote");
    const prepared = await service.prepare(approved.plan, {
      authority: "server_prepared_provider_request",
      provider: "local_test",
      providerIdempotencyKey: `checkout_attempt:${approved.plan.identity.attemptId}`,
      providerRequestHash: "9".repeat(64),
      providerExpiresAt: "2026-08-25T13:00:00.000Z",
      providerCustomerEmail: "canonical.fulfillment@example.test",
      providerOrigin: "http://127.0.0.1:3000",
      providerRequestSchemaVersion: 1,
      providerLivemode: false,
      providerScope: "local_test:synthetic-propeptiq-v1",
    });
    if (prepared.status !== "prepared") throw new Error("expected prepared");
    const order = await client.query<{ totalMinor: number }>(
      `SELECT total_minor AS "totalMinor" FROM orders WHERE id = $1::uuid`,
      [prepared.orderId],
    );
    const totalMinor = order.rows[0]!.totalMinor;
    const providerSessionId = "cs_task5_canonical_review_paid";
    const normalizedPayload = {
      schemaVersion: 1,
      kind: "checkout_session",
      providerEventId: "evt_task5_canonical_review_paid",
      eventType: "checkout.session.completed",
      providerCreatedAt: now.toISOString(),
      livemode: false,
      sessionId: providerSessionId,
      orderId: prepared.orderId,
      attemptId: prepared.attemptId,
      paymentIntentId: "pi_task5_canonical_review_paid",
      amountMinor: totalMinor,
      currency: "usd",
      paymentStatus: "paid",
      sessionStatus: "complete",
    } as const;
    await client.query(
      `UPDATE checkout_attempts
       SET status = 'completed', provider_session_id = $2
       WHERE id = $1::uuid`,
      [prepared.attemptId, providerSessionId],
    );
    await client.query(
      `UPDATE orders SET state = 'paid_pending_fulfillment'
       WHERE id = $1::uuid`,
      [prepared.orderId],
    );
    await client.query(
      `INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status, attempt_count,
         received_at, processed_at, event_type, schema_version,
         normalized_payload, provider_created_at, livemode)
       VALUES ($1::uuid, 'local_test', $2, $3, 'processed', 1,
               $4::timestamptz, $4::timestamptz,
               'checkout.session.completed', 1, $5::jsonb,
               $4::timestamptz, false)`,
      [
        ids.providerEvent,
        normalizedPayload.providerEventId,
        "8".repeat(64),
        now.toISOString(),
        JSON.stringify(normalizedPayload),
      ],
    );
    await client.query(
      `INSERT INTO payment_events
        (id, provider_event_id, order_id, event_type, provider_payment_id,
         idempotency_key, amount_minor, currency, occurred_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'payment_verified', $4, $5,
               $6, 'USD', $7::timestamptz)`,
      [
        ids.paymentEvent,
        ids.providerEvent,
        prepared.orderId,
        normalizedPayload.paymentIntentId,
        `local_test:payment_intent:${normalizedPayload.paymentIntentId}`,
        totalMinor,
        now.toISOString(),
      ],
    );
    await client.query(
      `INSERT INTO shipments
        (id, order_id, carrier, tracking_reference, state, updated_at)
       VALUES ($1::uuid, $2::uuid, 'SYNTHETIC-CARRIER',
               'SYNTHETIC-TRACKING', 'pending', $3::timestamptz)`,
      [keyedUuid("canonical-review-shipment"), prepared.orderId, now.toISOString()],
    );
    const reviewInputs: unknown[] = [];
    const fulfillment = createFulfillmentRepository({
      runSerializableTransaction: (work) =>
        client.transaction((transaction) =>
          work({
            query: (sql, params = []) => transaction.query(sql, [...params]),
          }),
        ),
      sha256,
      keyedUuid,
      retrySleep: async () => undefined,
      resolveExactReviewRequest: async (...args) => {
        reviewInputs.push(args[1]);
        return resolveExactReviewRequest(...args);
      },
    });

    await expect(fulfillment.handoff({
      actorUserId: ids.buyer2,
      actorClerkUserId: "clerk-synthetic-buyer-b",
      orderId: prepared.orderId,
      now,
      correlationId: "canonical-review-fulfillment-task5",
    })).resolves.toEqual({ status: "handed_off" });
    expect(reviewInputs).toContainEqual(expect.objectContaining({
      items: [{ variantId: ids.variantA, quantity: 2 }],
      automaticPromotions: [
        { id: "spring20", version: 2 },
        { id: "winter30", version: 1 },
      ],
    }));
  });

  it.each([
    {
      label: "discounted",
      key: "30000000-0000-4000-8000-000000000130",
      automaticPromotion: true,
      quantity: 2,
    },
    {
      label: "zero-discount",
      key: "30000000-0000-4000-8000-000000000131",
      automaticPromotion: false,
      quantity: 1,
    },
  ])("replays the exact safe canonical $label quote and pricing revision", async ({ key, automaticPromotion, quantity }) => {
    await seedCheckoutReadyVariant();
    if (!automaticPromotion) {
      await client.exec(
        `DELETE FROM promotions WHERE id = '${ids.variantPromotion}'`,
      );
    }
    const { service } = setup();
    const replayRequest = {
      ...variantRequest,
      items: [{ variantId: ids.variantA, quantity }],
    } as const;
    const quoted = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request: replayRequest,
    });
    if (quoted.status !== "quoted" || quoted.pricingRevision === undefined) {
      throw new Error("expected canonical variant quote");
    }
    const sessionQuote = await service.quoteForSession({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request: {
        ...replayRequest,
        pricingRevision: quoted.pricingRevision,
      },
    });
    if (sessionQuote.status !== "quoted") throw new Error("expected session quote");
    await expect(service.prepare(sessionQuote.plan, {
      authority: "server_prepared_provider_request",
      provider: "local_test",
      providerIdempotencyKey: `checkout_attempt:${sessionQuote.plan.identity.attemptId}`,
      providerRequestHash: "d".repeat(64),
      providerExpiresAt: "2026-08-25T13:00:00.000Z",
      providerCustomerEmail: "canonical.replay@example.test",
      providerOrigin: "http://127.0.0.1:3000",
      providerRequestSchemaVersion: 1,
      providerLivemode: false,
      providerScope: "local_test:synthetic-propeptiq-v1",
    })).resolves.toMatchObject({ status: "prepared" });

    const durableReplay = await client.query<{
      pricingRevision: string;
      quoteSnapshot: unknown;
    }>(
      `SELECT canonical_pricing_revision AS "pricingRevision",
              canonical_quote_snapshot AS "quoteSnapshot"
       FROM checkout_attempts WHERE id = $1::uuid`,
      [sessionQuote.plan.identity.attemptId],
    );
    expect(durableReplay.rows[0]?.pricingRevision).toBe(quoted.pricingRevision);
    expect(JSON.stringify(durableReplay.rows[0]?.quoteSnapshot)).not.toMatch(
      /productId|stripe|priceBook|inventoryRevision/iu,
    );

    for (const replay of [
      await service.quote({
        buyerUserId: ids.buyer,
        idempotencyKey: key,
        paymentProviderAvailable: true,
        request: replayRequest,
      }),
      await service.quoteForSession({
        buyerUserId: ids.buyer,
        idempotencyKey: key,
        paymentProviderAvailable: true,
        request: {
          ...replayRequest,
          pricingRevision: quoted.pricingRevision,
        },
      }),
    ]) {
      expect(replay).toMatchObject({
        status: "loaded",
        pricingRevision: quoted.pricingRevision,
        quoteSnapshot: {
          lines: [{
            variantId: ids.variantA,
            sku: "SYNTHETIC-VARIANT-5MG",
            variantLabel: "5 mg synthetic checkout fixture",
          }],
        },
      });
      expect(JSON.stringify(replay)).not.toMatch(
        /productId|stripe|priceBook|inventoryRevision/iu,
      );
    }
  });

  it("keeps legacy attempts null-compatible and rejects incoherent canonical replay fields", async () => {
    const prepared = await quoteAndPrepare(
      "30000000-0000-4000-8000-000000000135",
    );
    if (prepared.prepared.status !== "prepared") throw new Error("expected prepared");
    const legacy = await client.query<{
      pricingRevision: string | null;
      quoteSnapshot: unknown;
    }>(
      `SELECT canonical_pricing_revision AS "pricingRevision",
              canonical_quote_snapshot AS "quoteSnapshot"
       FROM checkout_attempts WHERE id = $1::uuid`,
      [prepared.prepared.attemptId],
    );
    expect(legacy.rows[0]).toEqual({
      pricingRevision: null,
      quoteSnapshot: null,
    });
    await expect(client.query(
      `UPDATE checkout_attempts
       SET canonical_pricing_revision = $2
       WHERE id = $1::uuid`,
      [prepared.prepared.attemptId, "a".repeat(64)],
    )).rejects.toThrow(/checkout_attempts_canonical_replay_coherent/iu);
  });

  it("returns only explicitly bound canonical variant checkout facts", async () => {
    const { repository } = setup();
    await expect(repository.getCheckoutVariantFacts(ids.productA)).resolves.toBeNull();

    await client.exec(`
      INSERT INTO product_variants
        (id, product_id, sku, label, canonical_amount, amount_unit,
         package_quantity, status, stripe_product_id, stripe_price_id)
      VALUES ('${ids.variantA}', '${ids.productA}', 'TEST-FIXTURE-5',
        '5 mg synthetic unit', 5, 'mg', 1, 'inactive', null, null);
      INSERT INTO product_prices
        (id, product_id, variant_id, version, price_status, amount_minor,
         currency, effective_at)
      VALUES ('${ids.variantPriceA}', '${ids.productA}', '${ids.variantA}',
        1, 'pending', 0, 'USD', '2026-08-01T00:00:00.000Z');
      INSERT INTO lots
        (id, product_id, variant_id, supplier_name, supplier_lot_code,
         received_quantity, available_quantity, status, expires_at)
      VALUES ('${ids.variantLotA}', '${ids.productA}', '${ids.variantA}',
        'Synthetic supplier', 'SYN-VARIANT-ZERO', 1, 0, 'draft', null);
    `);

    expect(await repository.getCheckoutVariantFacts(ids.variantA)).toMatchObject({
      variantId: ids.variantA,
      productId: ids.productA,
      sku: "TEST-FIXTURE-5",
      priceStatus: "pending",
      amountMinor: 0,
      currency: "USD",
      stripePriceId: null,
      availableQuantity: 0,
    });
  });

  it("projects the exact automatic sitewide WINTER30 fixture from persisted records", async () => {
    const { repository } = setup();
    await client.exec(`
      INSERT INTO promotions
        (campaign_key, code, name, kind, status, basis_points, configuration,
         enabled, timezone, application_mode, scope, starts_at, ends_at)
      VALUES ('winter30', 'WINTER30', 'Winter Sale', 'discount', 'active',
        3000, '{}'::jsonb, true, 'America/Los_Angeles', 'automatic',
        'sitewide', null, null);
    `);

    await expect(repository.getAutomaticStorefrontPromotions()).resolves.toEqual([
      expect.objectContaining({
        id: "winter30",
        displayName: "Winter Sale",
        displayCode: "WINTER30",
        discountBps: 3000,
        enabled: true,
        startAt: null,
        endAt: null,
        timezone: "America/Los_Angeles",
        applicationMode: "automatic",
        scope: { kind: "sitewide" },
      }),
    ]);
  });

  it("projects an automatic promotion only to its explicitly persisted variant targets", async () => {
    const { repository } = setup();
    await client.exec(`
      INSERT INTO product_variants
        (id, product_id, sku, label, canonical_amount, amount_unit,
         package_quantity, status)
      VALUES ('${ids.variantA}', '${ids.productA}', 'TEST-FIXTURE-5',
        '5 mg synthetic unit', 5, 'mg', 1, 'inactive');
      INSERT INTO promotions
        (id, campaign_key, code, name, kind, status, basis_points,
         configuration, enabled, timezone, application_mode, scope)
      VALUES ('${ids.variantPromotion}', 'variant15', 'VARIANT15',
        'Synthetic variant offer', 'discount', 'active', 1500, '{}'::jsonb,
        true, 'America/Los_Angeles', 'automatic', 'variants');
      INSERT INTO promotion_variant_targets
        (id, promotion_id, variant_id)
      VALUES ('${ids.variantPromotionTarget}', '${ids.variantPromotion}',
        '${ids.variantA}');
    `);

    await expect(repository.getAutomaticStorefrontPromotions()).resolves.toEqual([
      expect.objectContaining({
        id: "variant15",
        discountBps: 1500,
        scope: { kind: "variants", variantIds: [ids.variantA] },
      }),
    ]);
  });

  it("denies product-keyed checkout when only variant-bound prices exist", async () => {
    await client.exec(`
      INSERT INTO product_variants
        (id, product_id, sku, label, canonical_amount, amount_unit,
         package_quantity, status)
      VALUES
        ('${ids.variantA}', '${ids.productA}', 'TEST-FIXTURE-5',
         '5 mg synthetic unit', 5, 'mg', 1, 'active'),
        ('${ids.variantB}', '${ids.productB}', 'TEST-FIXTURE-10',
         '10 mg synthetic unit', 10, 'mg', 1, 'active');
      UPDATE product_prices
      SET variant_id = CASE product_id
        WHEN '${ids.productA}'::uuid THEN '${ids.variantA}'::uuid
        ELSE '${ids.variantB}'::uuid
      END;
    `);
    const { service } = setup();
    const denied = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: "30000000-0000-4000-8000-000000000401",
      paymentProviderAvailable: true,
      request,
    });

    expect(denied).toEqual({
      status: "denied",
      reasons: ["product_catalog_incomplete"],
    });
    const writes = await client.query<{
      orders: number;
      attempts: number;
      reservations: number;
    }>(`SELECT
      (SELECT count(*)::int FROM orders) AS orders,
      (SELECT count(*)::int FROM checkout_attempts) AS attempts,
      (SELECT count(*)::int FROM inventory_reservations) AS reservations`);
    expect(writes.rows).toEqual([{ orders: 0, attempts: 0, reservations: 0 }]);
  });

  it("denies product-keyed checkout when the legacy price is not active", async () => {
    await client.exec(`UPDATE product_prices SET price_status = 'unavailable'`);
    const { service } = setup();
    const denied = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: "30000000-0000-4000-8000-000000000403",
      paymentProviderAvailable: true,
      request,
    });

    expect(denied).toEqual({
      status: "denied",
      reasons: ["product_catalog_incomplete"],
    });
    const writes = await client.query<{
      orders: number;
      attempts: number;
      reservations: number;
    }>(`SELECT
      (SELECT count(*)::int FROM orders) AS orders,
      (SELECT count(*)::int FROM checkout_attempts) AS attempts,
      (SELECT count(*)::int FROM inventory_reservations) AS reservations`);
    expect(writes.rows).toEqual([{ orders: 0, attempts: 0, reservations: 0 }]);
  });

  it("denies product-keyed checkout when only variant-bound inventory exists", async () => {
    await client.exec(`
      INSERT INTO product_variants
        (id, product_id, sku, label, canonical_amount, amount_unit,
         package_quantity, status)
      VALUES
        ('${ids.variantA}', '${ids.productA}', 'TEST-FIXTURE-5',
         '5 mg synthetic unit', 5, 'mg', 1, 'active'),
        ('${ids.variantB}', '${ids.productB}', 'TEST-FIXTURE-10',
         '10 mg synthetic unit', 10, 'mg', 1, 'active');
      UPDATE lots
      SET variant_id = CASE product_id
        WHEN '${ids.productA}'::uuid THEN '${ids.variantA}'::uuid
        ELSE '${ids.variantB}'::uuid
      END;
    `);
    const { service } = setup();
    const denied = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: "30000000-0000-4000-8000-000000000402",
      paymentProviderAvailable: true,
      request,
    });

    expect(denied).toEqual({
      status: "denied",
      reasons: ["inventory_unavailable"],
    });
    const writes = await client.query<{
      orders: number;
      attempts: number;
      reservations: number;
    }>(`SELECT
      (SELECT count(*)::int FROM orders) AS orders,
      (SELECT count(*)::int FROM checkout_attempts) AS attempts,
      (SELECT count(*)::int FROM inventory_reservations) AS reservations`);
    expect(writes.rows).toEqual([{ orders: 0, attempts: 0, reservations: 0 }]);
  });

  it("persists authoritative snapshots and allocates earliest-expiry lots atomically with idempotent replay", async () => {
    const key = "30000000-0000-4000-8000-000000000101";
    const { service, shipping, tax, prepared } = await quoteAndPrepare(key);
    if (prepared.status !== "prepared") throw new Error("expected prepared");

    const attempt = await client.query<{
      provider_request_id: string;
      provider_request_hash: string;
      expires_at: Date;
      permitted: boolean;
    }>(`SELECT provider_request_id, provider_request_hash, expires_at, permitted
        FROM checkout_attempts WHERE id = '${prepared.attemptId}'`);
    expect(attempt.rows[0]).toMatchObject({
      provider_request_id: `checkout_attempt:${prepared.attemptId}`,
      provider_request_hash: "c".repeat(64),
      permitted: true,
    });
    expect(new Date(attempt.rows[0]!.expires_at).toISOString()).toBe(
      "2026-08-25T13:00:00.000Z",
    );

    const reservations = await client.query<{
      product_id: string;
      lot_id: string;
      quantity_reserved: number;
      expires_at: Date;
    }>(`SELECT product_id, lot_id, quantity_reserved, expires_at
        FROM inventory_reservations WHERE order_id = '${prepared.orderId}'
        ORDER BY product_id, lot_id`);
    expect(
      reservations.rows.map((row) => ({
        ...row,
        expires_at: new Date(row.expires_at).toISOString(),
      })),
    ).toEqual([
      {
        product_id: ids.productA,
        lot_id: ids.lotA1,
        quantity_reserved: 1,
        expires_at: "2026-08-25T13:00:00.000Z",
      },
      {
        product_id: ids.productA,
        lot_id: ids.lotA2,
        quantity_reserved: 2,
        expires_at: "2026-08-25T13:00:00.000Z",
      },
      {
        product_id: ids.productB,
        lot_id: ids.lotB,
        quantity_reserved: 1,
        expires_at: "2026-08-25T13:00:00.000Z",
      },
    ]);
    const legacyVariantBindings = await client.query<{
      itemVariantId: string | null;
      lotVariantId: string | null;
    }>(`SELECT
          oi.variant_id::text AS "itemVariantId",
          l.variant_id::text AS "lotVariantId"
        FROM inventory_reservations r
        JOIN order_items oi ON oi.id = r.order_item_id
        JOIN lots l ON l.id = r.lot_id
        WHERE r.order_id = '${prepared.orderId}'
        ORDER BY r.id`);
    expect(legacyVariantBindings.rows).toHaveLength(3);
    expect(legacyVariantBindings.rows).toEqual(
      expect.arrayContaining([
        { itemVariantId: null, lotVariantId: null },
        { itemVariantId: null, lotVariantId: null },
        { itemVariantId: null, lotVariantId: null },
      ]),
    );
    const counts = await client.query<{
      orders: number;
      attempts: number;
      events: number;
      addresses: number;
      growthWrites: number;
    }>(`SELECT
      (SELECT count(*)::int FROM orders) AS orders,
      (SELECT count(*)::int FROM checkout_attempts) AS attempts,
      (SELECT count(*)::int FROM inventory_events WHERE event_type = 'reservation') AS events,
      (SELECT count(*)::int FROM order_shipping_addresses) AS addresses,
      ((SELECT count(*)::int FROM reward_redemptions) +
       (SELECT count(*)::int FROM reward_ledger_entries)) AS "growthWrites"`);
    expect(counts.rows[0]).toEqual({
      orders: 1,
      attempts: 1,
      events: 3,
      addresses: 1,
      growthWrites: 0,
    });
    const sideEffects = await client.query<{ audits: number; effects: number }>(
      `SELECT (SELECT count(*)::int FROM admin_audit) AS audits,
              (SELECT count(*)::int FROM downstream_effects) AS effects`,
    );
    expect(sideEffects.rows[0]).toEqual({ audits: 0, effects: 0 });

    const replay = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request,
    });
    expect(replay).toMatchObject({
      status: "loaded",
      orderId: prepared.orderId,
      attemptId: prepared.attemptId,
    });
    expect(shipping).toHaveBeenCalledTimes(1);
    expect(tax).toHaveBeenCalledTimes(1);
    const afterReplay = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM inventory_reservations`,
    );
    expect(afterReplay.rows[0]!.count).toBe(3);
  });

  it.each([
    {
      label: "future email verification",
      key: "30000000-0000-4000-8000-000000000121",
      mutation: `UPDATE users SET email_verified_at = '2026-08-25T12:00:00.001Z'
                 WHERE id = '${ids.buyer}'`,
      reason: "account_required",
    },
    {
      label: "future attestation acceptance",
      key: "30000000-0000-4000-8000-000000000122",
      mutation: `UPDATE attestation_acceptances
                 SET accepted_at = '2026-08-25T12:00:00.001Z'
                 WHERE user_id = '${ids.buyer}'`,
      reason: "attestation_not_current",
    },
  ])("fails closed with zero writes for $label", async ({ key, mutation, reason }) => {
    await client.exec(mutation);
    const { service, shipping, tax } = setup();

    await expect(
      service.quote({
        buyerUserId: ids.buyer,
        idempotencyKey: key,
        paymentProviderAvailable: true,
        request,
      }),
    ).resolves.toEqual({ status: "denied", reasons: [reason] });
    expect(shipping).not.toHaveBeenCalled();
    expect(tax).not.toHaveBeenCalled();
    const counts = await client.query<{
      orders: number;
      attempts: number;
      reviews: number;
      reservations: number;
    }>(`SELECT
      (SELECT count(*)::int FROM orders) AS orders,
      (SELECT count(*)::int FROM checkout_attempts) AS attempts,
      (SELECT count(*)::int FROM review_requests) AS reviews,
      (SELECT count(*)::int FROM inventory_reservations) AS reservations`);
    expect(counts.rows[0]).toEqual({
      orders: 0,
      attempts: 0,
      reviews: 0,
      reservations: 0,
    });
  });

  it("replays failed and provider-unknown attempts with their persisted status instead of a ready result", async () => {
    const failedKey = "30000000-0000-4000-8000-000000000123";
    const failed = await quoteAndPrepare(failedKey);
    if (failed.prepared.status !== "prepared") throw new Error("expected prepared");
    await expect(
      failed.repository.releaseDefiniteFailure({
        authority: "authoritative_provider_terminal",
        cause: "definite_rejection",
        providerEvidenceId: "synthetic-terminal-replay",
        attemptId: failed.prepared.attemptId,
        orderId: failed.prepared.orderId,
        provider: "local_test",
        providerIdempotencyKey: `checkout_attempt:${failed.prepared.attemptId}`,
        targetAttemptStatus: "failed",
      }),
    ).resolves.toEqual({ status: "released" });
    const failedReplay = await failed.service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: failedKey,
      paymentProviderAvailable: true,
      request,
    });
    expect(failedReplay).toMatchObject({
      status: "loaded",
      attemptStatus: "failed",
      orderState: "cancelled",
      quoteSnapshot: { status: "ready" },
    });
    expect(failedReplay).not.toHaveProperty("quote");

    const unknownKey = "30000000-0000-4000-8000-000000000124";
    const unknown = await quoteAndPrepare(unknownKey, ids.buyer2);
    if (unknown.prepared.status !== "prepared") throw new Error("expected prepared");
    await client.exec(
      `UPDATE checkout_attempts SET status = 'provider_unknown'
       WHERE id = '${unknown.prepared.attemptId}'`,
    );
    const unknownReplay = await unknown.service.quote({
      buyerUserId: ids.buyer2,
      idempotencyKey: unknownKey,
      paymentProviderAvailable: true,
      request,
    });
    expect(unknownReplay).toMatchObject({
      status: "loaded",
      attemptStatus: "provider_unknown",
      orderState: "checkout_pending",
      quoteSnapshot: { status: "ready" },
    });
    expect(unknownReplay).not.toHaveProperty("quote");
  });

  it("scopes the same literal idempotency key independently by buyer and conflicts a changed same-buyer request before quotes", async () => {
    const key = "30000000-0000-4000-8000-000000000108";
    const smallerRequest = {
      ...request,
      items: [
        { productId: ids.productA, quantity: 1 },
        { productId: ids.productB, quantity: 1 },
      ],
    };
    const first = await quoteAndPrepare(key, ids.buyer, smallerRequest);
    const second = await quoteAndPrepare(key, ids.buyer2, smallerRequest);
    if (
      first.prepared.status !== "prepared" ||
      second.prepared.status !== "prepared"
    ) {
      throw new Error("expected both buyers prepared");
    }
    expect(second.prepared.orderId).not.toBe(first.prepared.orderId);
    expect(second.prepared.attemptId).not.toBe(first.prepared.attemptId);
    const attempts = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM checkout_attempts
       WHERE idempotency_key = '${key}'`,
    );
    expect(attempts.rows[0]!.count).toBe(2);

    const changed = {
      ...smallerRequest,
      items: [{ productId: ids.productA, quantity: 2 }],
    };
    const shippingBefore = first.shipping.mock.calls.length;
    await expect(
      first.service.quote({
        buyerUserId: ids.buyer,
        idempotencyKey: key,
        paymentProviderAvailable: true,
        request: changed,
      }),
    ).resolves.toEqual({ status: "idempotency_conflict" });
    expect(first.shipping).toHaveBeenCalledTimes(shippingBefore);
  });

  it("creates one truthful pending review without inventory, ignores an old approval, then reserves only after the exact approval", async () => {
    await client.exec(
      `UPDATE buyer_profiles SET status = 'review' WHERE user_id = '${ids.buyer}'`,
    );
    const key = "30000000-0000-4000-8000-000000000102";
    const { service } = setup();
    const quote = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request,
    });
    expect(quote).toMatchObject({
      status: "quoted",
      quote: { status: "review_required", totalMinor: 20_025 },
    });
    if (quote.status !== "quoted") throw new Error("expected review quote");
    const created = await service.prepare(quote.plan, null);
    expect(created).toMatchObject({ status: "review_required" });
    if (created.status !== "review_required") throw new Error("expected review");

    const persisted = await client.query<{
      cart_snapshot: unknown;
      state: string;
      permitted: boolean;
      provider_request_id: string | null;
    }>(`SELECT r.cart_snapshot, o.state, a.permitted, a.provider_request_id
        FROM review_requests r
        JOIN orders o ON o.id = r.order_id
        JOIN checkout_attempts a ON a.order_id = o.id
        WHERE r.id = '${created.reviewRequestId}'`);
    expect(persisted.rows[0]).toEqual({
      cart_snapshot: {
        schemaVersion: 1,
        items: request.items,
        promotionIds: [],
      },
      state: "eligibility_review",
      permitted: false,
      provider_request_id: null,
    });
    expect(JSON.stringify(persisted.rows[0]!.cart_snapshot)).not.toContain(
      "Test Way",
    );
    expect(
      (await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM inventory_reservations`,
      )).rows[0]!.count,
    ).toBe(0);

    const oldReviewId = "30000000-0000-4000-8000-000000000199";
    const oldReviewHash = await hashReviewSnapshot(
      {
        orderId: created.orderId,
        buyerUserId: ids.buyer,
        buyerStatus: "review",
        acceptedAttestationVersionId: ids.previousAttestation,
        currentAttestationVersionId: ids.previousAttestation,
        items: request.items,
        promotionIds: [],
        destination: { ...request.destination, countryCode: "US" },
        reviewPolicies: [],
      },
      sha256,
    );
    const exactCartSnapshot = JSON.stringify({
      schemaVersion: 1,
      items: request.items,
      promotionIds: [],
    });
    await client.exec(`
      INSERT INTO attestation_versions
        (id, version, content_hash, policy_text, effective_at, superseded_at)
      VALUES
        ('${ids.previousAttestation}', 2, '${"e".repeat(64)}',
         'Synthetic previous research-use policy.', '2026-07-01T00:00:00.000Z',
         '2026-08-01T00:00:00.000Z');
      INSERT INTO review_requests
        (id, user_id, order_id, snapshot_hash, buyer_status_snapshot,
         attestation_version_id, destination_state_code, cart_snapshot,
         buyer_review_required, destination_review_required, outcome,
         decided_by_user_id, decided_at, covers_buyer_review)
      VALUES
        ('${oldReviewId}', '${ids.buyer}', '${created.orderId}', '${oldReviewHash}',
         'review', '${ids.previousAttestation}', 'CA',
         '${exactCartSnapshot}'::jsonb,
         true, false, 'approved', '${ids.buyer2}',
         '2026-08-25T12:10:00.000Z', true);
    `);
    const stillPending = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request,
    });
    expect(stillPending).toMatchObject({
      status: "quoted",
      quote: { status: "review_required" },
    });
    await expect(
      resolveExactReviewRequest(
        {
          query: (sql, params = []) => client.query(sql, [...params]),
        },
        {
          orderId: created.orderId,
          buyerUserId: ids.buyer,
          buyerStatus: "review",
          acceptedAttestationVersionId: ids.previousAttestation,
          currentAttestationVersionId: ids.previousAttestation,
          items: request.items,
          promotionIds: [],
          destination: { ...request.destination, countryCode: "US" },
          reviewPolicies: [],
        },
        sha256,
      ),
    ).resolves.toMatchObject({ reviewRequestId: oldReviewId });

    await client.exec(`
      UPDATE review_requests
      SET outcome = 'approved', decided_by_user_id = '${ids.buyer2}',
          decided_at = '2026-08-25T12:15:00.000Z', covers_buyer_review = true
      WHERE id = '${created.reviewRequestId}';
    `);
    const exactResolved = await resolveExactReviewRequest(
      {
        query: (sql, params = []) => client.query(sql, [...params]),
      },
      {
        orderId: created.orderId,
        buyerUserId: ids.buyer,
        buyerStatus: "review",
        acceptedAttestationVersionId: ids.attestation,
        currentAttestationVersionId: ids.attestation,
        items: request.items,
        promotionIds: [],
        destination: {
          ...request.destination,
          countryCode: "US",
        },
        reviewPolicies: [],
      },
      sha256,
    );
    expect(exactResolved?.reviewRequestId).toBe(created.reviewRequestId);
    await expect(
      resolveExactReviewRequest(
        {
          query: (sql, params = []) => client.query(sql, [...params]),
        },
        {
          orderId: created.orderId,
          buyerUserId: ids.buyer,
          buyerStatus: "review",
          acceptedAttestationVersionId: ids.attestation,
          currentAttestationVersionId: ids.attestation,
          items: request.items,
          promotionIds: [],
          destination: {
            ...request.destination,
            line1: "101 Changed Test Way",
            countryCode: "US",
          },
          reviewPolicies: [],
        },
        sha256,
      ),
    ).resolves.toBeNull();
    await expect(
      resolveExactReviewRequest(
        {
          query: (sql, params = []) => client.query(sql, [...params]),
        },
        {
          orderId: created.orderId,
          buyerUserId: ids.buyer,
          buyerStatus: "review",
          acceptedAttestationVersionId: ids.previousAttestation,
          currentAttestationVersionId: ids.attestation,
          items: request.items,
          promotionIds: [],
          destination: {
            ...request.destination,
            countryCode: "US",
          },
          reviewPolicies: [],
        },
        sha256,
      ),
    ).resolves.toBeNull();
    const approved = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request,
    });
    expect(approved).toMatchObject({
      status: "quoted",
      quote: { status: "ready", reviewRequired: false },
    });
    if (approved.status !== "quoted") throw new Error("expected approval");
    const prepared = await service.prepare(approved.plan, {
      authority: "server_prepared_provider_request",
      provider: "local_test",
      providerIdempotencyKey: `checkout_attempt:${approved.plan.identity.attemptId}`,
      providerRequestHash: "e".repeat(64),
      providerExpiresAt: "2026-08-25T13:00:00.000Z",
      providerCustomerEmail: "synthetic.buyer@example.test",
      providerOrigin: "http://127.0.0.1:3000",
      providerRequestSchemaVersion: 1,
      providerLivemode: false,
      providerScope: "local_test:synthetic-propeptiq-v1",
    });
    expect(prepared).toMatchObject({
      status: "prepared",
      reviewRequestId: created.reviewRequestId,
    });
    expect(
      (await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM inventory_reservations`,
      )).rows[0]!.count,
    ).toBe(3);
  });

  it("terminalizes only an exact immutable review rejection and leaves no reservation", async () => {
    await client.exec(
      `UPDATE buyer_profiles SET status = 'review' WHERE user_id = '${ids.buyer}'`,
    );
    const key = "30000000-0000-4000-8000-000000000103";
    const { service } = setup();
    const quote = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request,
    });
    if (quote.status !== "quoted") throw new Error("expected review quote");
    const created = await service.prepare(quote.plan, null);
    if (created.status !== "review_required") throw new Error("expected review");
    await client.exec(`
      UPDATE review_requests
      SET outcome = 'rejected', decided_by_user_id = '${ids.buyer2}',
          decided_at = '2026-08-25T12:15:00.000Z', covers_buyer_review = false
      WHERE id = '${created.reviewRequestId}';
    `);
    const rejected = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request,
    });
    expect(rejected).toMatchObject({
      status: "review_rejected",
      reasons: ["review_rejected"],
    });
    if (rejected.status !== "review_rejected") throw new Error("expected rejection");
    await expect(service.prepare(rejected.plan, null)).resolves.toMatchObject({
      status: "review_rejected",
    });
    const terminal = await client.query<{
      attempt_status: string;
      order_state: string;
      reservation_count: number;
    }>(`SELECT a.status AS attempt_status, o.state AS order_state,
        (SELECT count(*)::int FROM inventory_reservations r WHERE r.order_id = o.id) AS reservation_count
        FROM checkout_attempts a JOIN orders o ON o.id = a.order_id
        WHERE a.id = '${created.attemptId}'`);
    expect(terminal.rows[0]).toEqual({
      attempt_status: "failed",
      order_state: "cancelled",
      reservation_count: 0,
    });
  });

  it("does not mutate a historical pending-review order when current buyer facts hard-deny", async () => {
    await client.exec(
      `UPDATE buyer_profiles SET status = 'review' WHERE user_id = '${ids.buyer}'`,
    );
    const key = "30000000-0000-4000-8000-000000000109";
    const { service } = setup();
    const quote = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request,
    });
    if (quote.status !== "quoted") throw new Error("expected review quote");
    const created = await service.prepare(quote.plan, null);
    if (created.status !== "review_required") throw new Error("expected review");

    await client.exec(
      `UPDATE buyer_profiles SET status = 'blocked' WHERE user_id = '${ids.buyer}'`,
    );
    await expect(
      service.quote({
        buyerUserId: ids.buyer,
        idempotencyKey: key,
        paymentProviderAvailable: true,
        request,
      }),
    ).resolves.toEqual({ status: "denied", reasons: ["buyer_blocked"] });
    const unchanged = await client.query<{
      attemptStatus: string;
      orderState: string;
      reviewOutcome: string | null;
      reservations: number;
    }>(`SELECT a.status AS "attemptStatus", o.state AS "orderState",
              r.outcome AS "reviewOutcome",
              (SELECT count(*)::int FROM inventory_reservations ir
               WHERE ir.order_id = o.id) AS reservations
        FROM checkout_attempts a
        JOIN orders o ON o.id = a.order_id
        JOIN review_requests r ON r.order_id = o.id
        WHERE a.id = '${created.attemptId}'`);
    expect(unchanged.rows[0]).toEqual({
      attemptStatus: "created",
      orderState: "eligibility_review",
      reviewOutcome: null,
      reservations: 0,
    });
  });

  it.each(["compliance_hold", "cancelled"] as const)(
    "cannot clear an externally authoritative %s order while preparing an approved review",
    async (authoritativeState) => {
      await client.exec(
        `UPDATE buyer_profiles SET status = 'review' WHERE user_id = '${ids.buyer}'`,
      );
      const key =
        authoritativeState === "compliance_hold"
          ? "30000000-0000-4000-8000-000000000125"
          : "30000000-0000-4000-8000-000000000126";
      const initial = setup();
      const reviewQuote = await initial.service.quote({
        buyerUserId: ids.buyer,
        idempotencyKey: key,
        paymentProviderAvailable: true,
        request,
      });
      if (reviewQuote.status !== "quoted") throw new Error("expected review quote");
      const review = await initial.service.prepare(reviewQuote.plan, null);
      if (review.status !== "review_required") throw new Error("expected review");
      await client.exec(`
        UPDATE review_requests
        SET outcome = 'approved', decided_by_user_id = '${ids.buyer2}',
            decided_at = '2026-08-25T12:15:00.000Z', covers_buyer_review = true
        WHERE id = '${review.reviewRequestId}';
        UPDATE product_prices SET amount_minor = 6000 WHERE id = '${ids.priceA}';
      `);
      const approved = await initial.service.quote({
        buyerUserId: ids.buyer,
        idempotencyKey: key,
        paymentProviderAvailable: true,
        request,
      });
      expect(approved).toMatchObject({
        status: "quoted",
        quote: { status: "ready", totalMinor: 23_025 },
      });
      if (approved.status !== "quoted") throw new Error("expected approved quote");
      await client.exec(
        `UPDATE orders SET state = '${authoritativeState}' WHERE id = '${review.orderId}'`,
      );

      await expect(
        initial.service.prepare(approved.plan, {
          authority: "server_prepared_provider_request",
          provider: "local_test",
          providerIdempotencyKey: `checkout_attempt:${approved.plan.identity.attemptId}`,
          providerRequestHash: "7".repeat(64),
          providerExpiresAt: "2026-08-25T13:00:00.000Z",
          providerCustomerEmail: "synthetic.buyer@example.test",
          providerOrigin: "http://127.0.0.1:3000",
          providerRequestSchemaVersion: 1,
          providerLivemode: false,
          providerScope: "local_test:synthetic-propeptiq-v1",
        }),
      ).resolves.toMatchObject({
        status: "loaded",
        attemptStatus: "created",
        orderState: authoritativeState,
        quoteSnapshot: { status: "review_required", totalMinor: 20_025 },
      });

      const unchanged = await client.query<{
        orderState: string;
        orderTotalMinor: number;
        attemptStatus: string;
        permitted: boolean;
        providerRequestId: string | null;
        providerRequestHash: string | null;
        expiresAt: Date | null;
        productAUnitMinor: number;
        items: number;
        addresses: number;
        reservations: number;
        reservationEvents: number;
        lotA1: number;
        lotA2: number;
        lotB: number;
      }>(`SELECT o.state AS "orderState", o.total_minor AS "orderTotalMinor",
          a.status AS "attemptStatus", a.permitted,
          a.provider_request_id AS "providerRequestId",
          a.provider_request_hash AS "providerRequestHash", a.expires_at AS "expiresAt",
          (SELECT unit_amount_minor FROM order_items
           WHERE order_id = o.id AND product_id = '${ids.productA}') AS "productAUnitMinor",
          (SELECT count(*)::int FROM order_items WHERE order_id = o.id) AS items,
          (SELECT count(*)::int FROM order_shipping_addresses WHERE order_id = o.id) AS addresses,
          (SELECT count(*)::int FROM inventory_reservations WHERE order_id = o.id) AS reservations,
          (SELECT count(*)::int FROM inventory_events
           WHERE order_id = o.id AND event_type = 'reservation') AS "reservationEvents",
          (SELECT available_quantity FROM lots WHERE id = '${ids.lotA1}') AS "lotA1",
          (SELECT available_quantity FROM lots WHERE id = '${ids.lotA2}') AS "lotA2",
          (SELECT available_quantity FROM lots WHERE id = '${ids.lotB}') AS "lotB"
        FROM orders o JOIN checkout_attempts a ON a.order_id = o.id
        WHERE o.id = '${review.orderId}'`);
      expect(unchanged.rows[0]).toEqual({
        orderState: authoritativeState,
        orderTotalMinor: 20_025,
        attemptStatus: "created",
        permitted: false,
        providerRequestId: null,
        providerRequestHash: null,
        expiresAt: null,
        productAUnitMinor: 5_000,
        items: 2,
        addresses: 1,
        reservations: 0,
        reservationEvents: 0,
        lotA1: 1,
        lotA2: 5,
        lotB: 5,
      });
    },
  );

  it("requires coverage from the exact destination-review link before reservation", async () => {
    await client.exec(
      `UPDATE destination_policies SET result = 'review' WHERE id = '${ids.policyA}'`,
    );
    const key = "30000000-0000-4000-8000-000000000113";
    const { service } = setup();
    const quoted = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request,
    });
    expect(quoted).toMatchObject({
      status: "quoted",
      quote: { reasons: ["destination_review_required"] },
    });
    if (quoted.status !== "quoted") throw new Error("expected destination review");
    const created = await service.prepare(quoted.plan, null);
    if (created.status !== "review_required") throw new Error("expected review");
    const links = await client.query<{
      destinationPolicyId: string;
      covered: boolean;
    }>(`SELECT destination_policy_id::text AS "destinationPolicyId", covered
        FROM review_request_destination_policies
        WHERE review_request_id = '${created.reviewRequestId}'`);
    expect(links.rows).toEqual([
      { destinationPolicyId: ids.policyA, covered: false },
    ]);

    await client.exec(`
      UPDATE review_requests
      SET outcome = 'approved', decided_by_user_id = '${ids.buyer2}',
          decided_at = '2026-08-25T12:15:00.000Z', covers_buyer_review = false
      WHERE id = '${created.reviewRequestId}';
    `);
    const uncovered = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request,
    });
    expect(uncovered).toMatchObject({
      status: "quoted",
      quote: { reasons: ["destination_review_required"] },
    });
    await client.exec(`
      UPDATE review_request_destination_policies SET covered = true
      WHERE review_request_id = '${created.reviewRequestId}'
        AND destination_policy_id = '${ids.policyA}';
    `);
    const covered = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request,
    });
    expect(covered).toMatchObject({
      status: "quoted",
      quote: { status: "ready", reasons: [] },
    });
    if (covered.status !== "quoted") throw new Error("expected covered quote");
    await expect(
      service.prepare(covered.plan, {
        authority: "server_prepared_provider_request",
        provider: "local_test",
        providerIdempotencyKey: `checkout_attempt:${covered.plan.identity.attemptId}`,
        providerRequestHash: "8".repeat(64),
        providerExpiresAt: "2026-08-25T13:00:00.000Z",
        providerCustomerEmail: "synthetic.buyer@example.test",
        providerOrigin: "http://127.0.0.1:3000",
        providerRequestSchemaVersion: 1,
        providerLivemode: false,
        providerScope: "local_test:synthetic-propeptiq-v1",
      }),
    ).resolves.toMatchObject({
      status: "prepared",
      reviewRequestId: created.reviewRequestId,
    });
  });

  it("stores one exact review link when multiple items share a winning group policy", async () => {
    await client.exec(`
      DELETE FROM destination_policies
      WHERE id IN ('${ids.policyA}', '${ids.policyB}');
      INSERT INTO destination_policies
        (id, scope_kind, policy_group_id, state_code, result, version, active, effective_at)
      VALUES
        ('${ids.policyA}', 'policy_group', '${ids.group}', 'CA', 'review', 1,
         true, '2026-08-01T00:00:00.000Z');
    `);
    const key = "30000000-0000-4000-8000-00000000010d";
    const initial = setup();
    const quoted = await initial.service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request,
    });
    expect(quoted).toMatchObject({
      status: "quoted",
      quote: { reasons: ["destination_review_required"] },
    });
    if (quoted.status !== "quoted") throw new Error("expected destination review");
    const created = await initial.service.prepare(quoted.plan, null);
    expect(created).toMatchObject({ status: "review_required" });
    if (created.status !== "review_required") throw new Error("expected review");
    const links = await client.query<{ policyId: string }>(
      `SELECT destination_policy_id::text AS "policyId"
       FROM review_request_destination_policies
       WHERE review_request_id = $1::uuid`,
      [created.reviewRequestId],
    );
    expect(links.rows).toEqual([{ policyId: ids.policyA }]);

    await client.exec(`
      UPDATE review_requests
      SET outcome = 'approved', decided_by_user_id = '${ids.buyer2}',
          decided_at = '2026-08-25T12:15:00.000Z', covers_buyer_review = false
      WHERE id = '${created.reviewRequestId}';
      UPDATE review_request_destination_policies SET covered = true
      WHERE review_request_id = '${created.reviewRequestId}';
    `);
    const approved = await initial.service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request,
    });
    expect(approved).toMatchObject({
      status: "quoted",
      quote: { status: "ready", reasons: [] },
    });
  });

  it("locks an approved mutable-review checkout in the global parent and row-class order", async () => {
    await client.exec(
      `UPDATE buyer_profiles SET status = 'review' WHERE user_id = '${ids.buyer}'`,
    );
    const promotedRequest = { ...request, promotionIds: [ids.promotion] };
    const key = "30000000-0000-4000-8000-00000000010c";
    const initial = setup();
    const reviewQuote = await initial.service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request: promotedRequest,
    });
    if (reviewQuote.status !== "quoted") throw new Error("expected review quote");
    const review = await initial.service.prepare(reviewQuote.plan, null);
    if (review.status !== "review_required") throw new Error("expected review");
    await client.exec(`
      UPDATE review_requests
      SET outcome = 'approved', decided_by_user_id = '${ids.buyer2}',
          decided_at = '2026-08-25T12:15:00.000Z', covers_buyer_review = true
      WHERE id = '${review.reviewRequestId}';
    `);

    const transactionSql: string[] = [];
    const approved = setup({ transactionSql });
    const approvedQuote = await approved.service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request: promotedRequest,
    });
    if (approvedQuote.status !== "quoted") throw new Error("expected approved quote");
    await expect(
      approved.service.prepare(approvedQuote.plan, {
        authority: "server_prepared_provider_request",
        provider: "local_test",
        providerIdempotencyKey: `checkout_attempt:${approvedQuote.plan.identity.attemptId}`,
        providerRequestHash: "f".repeat(64),
        providerExpiresAt: "2026-08-25T13:00:00.000Z",
        providerCustomerEmail: "synthetic.buyer@example.test",
        providerOrigin: "http://127.0.0.1:3000",
        providerRequestSchemaVersion: 1,
        providerLivemode: false,
        providerScope: "local_test:synthetic-propeptiq-v1",
      }),
    ).resolves.toMatchObject({ status: "prepared" });

    const locked = transactionSql
      .map((sql, index) => ({ sql, index }))
      .filter(({ sql }) => sql.includes("FOR UPDATE"));
    const firstLock = (pattern: RegExp) =>
      locked.find(({ sql }) => pattern.test(sql))?.index ?? -1;
    const productLocks = locked
      .filter(({ sql }) => sql.includes("FROM products p"))
      .map(({ index }) => index);
    const priceLocks = locked
      .filter(({ sql }) => sql.includes("FROM product_prices"))
      .map(({ index }) => index);
    expect(locked.map(({ sql }) => sql)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("FROM review_request_destination_policies"),
      ]),
    );
    const sequence = [
      firstLock(/FROM checkout_attempts a/),
      firstLock(/^SELECT id(?:::text AS id)?, state FROM orders/),
      firstLock(/^SELECT id.*FROM review_requests/),
      firstLock(/FROM review_request_destination_policies/),
      firstLock(/^SELECT (?:id|product_id::text).*FROM order_items/),
      Math.min(...productLocks),
      Math.min(...priceLocks),
      firstLock(/FROM promotions/),
      firstLock(/FROM promotion_targets/),
      firstLock(/FROM destination_policies/),
      firstLock(/^SELECT id FROM inventory_reservations/),
      firstLock(/FROM lots/),
    ];
    expect(sequence).toEqual([...sequence].toSorted((left, right) => left - right));
    expect(sequence.every((index) => index >= 0)).toBe(true);
    expect(Math.max(...productLocks)).toBeLessThan(Math.min(...priceLocks));
  });

  it("returns facts_changed_retry with zero writes when a promotion retires after planning", async () => {
    const key = "30000000-0000-4000-8000-000000000104";
    const promotedRequest = { ...request, promotionIds: [ids.promotion] };
    const { service, shipping, tax } = setup();
    const quote = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request: promotedRequest,
    });
    expect(quote).toMatchObject({
      status: "quoted",
      quote: { discountMinor: 1500 },
    });
    if (quote.status !== "quoted") throw new Error("expected promoted quote");
    await client.exec(
      `UPDATE promotions SET status = 'retired' WHERE id = '${ids.promotion}'`,
    );
    await expect(
      service.prepare(quote.plan, {
        authority: "server_prepared_provider_request",
        provider: "local_test",
        providerIdempotencyKey: `checkout_attempt:${quote.plan.identity.attemptId}`,
        providerRequestHash: "f".repeat(64),
        providerExpiresAt: "2026-08-25T13:00:00.000Z",
        providerCustomerEmail: "synthetic.buyer@example.test",
        providerOrigin: "http://127.0.0.1:3000",
        providerRequestSchemaVersion: 1,
        providerLivemode: false,
        providerScope: "local_test:synthetic-propeptiq-v1",
      }),
    ).resolves.toEqual({ status: "facts_changed_retry" });
    expect(shipping).toHaveBeenCalledTimes(1);
    expect(tax).toHaveBeenCalledTimes(1);
    const counts = await client.query<{ orders: number; attempts: number }>(
      `SELECT (SELECT count(*)::int FROM orders) AS orders,
              (SELECT count(*)::int FROM checkout_attempts) AS attempts`,
    );
    expect(counts.rows[0]).toEqual({ orders: 0, attempts: 0 });
  });

  it("persists the exact active promotion version and complete per-item allocation", async () => {
    const key = "30000000-0000-4000-8000-000000000112";
    const promotedRequest = { ...request, promotionIds: [ids.promotion] };
    const prepared = await quoteAndPrepare(key, ids.buyer, promotedRequest);
    if (prepared.prepared.status !== "prepared") throw new Error("expected prepared");
    const application = await client.query<{
      promotionId: string;
      promotionVersion: number;
      appliedDiscountMinor: number;
      allocatedDiscountMinor: number;
      allocations: number;
    }>(`SELECT a.promotion_id::text AS "promotionId",
              a.promotion_version AS "promotionVersion",
              a.applied_discount_minor AS "appliedDiscountMinor",
              sum(pa.allocated_discount_minor)::int AS "allocatedDiscountMinor",
              count(pa.id)::int AS allocations
       FROM order_promotion_applications a
       JOIN order_promotion_allocations pa ON pa.application_id = a.id
       WHERE a.order_id = '${prepared.prepared.orderId}'
       GROUP BY a.id`);
    expect(application.rows[0]).toEqual({
      promotionId: ids.promotion,
      promotionVersion: 1,
      appliedDiscountMinor: 1500,
      allocatedDiscountMinor: 1500,
      allocations: 2,
    });
  });

  it("reuses one frozen plan across approved serialization retries without recalling quote ports", async () => {
    const key = "30000000-0000-4000-8000-000000000111";
    const { service, shipping, tax, transactionAttempts } = setup({
      failTransactions: 2,
    });
    const quote = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request,
    });
    if (quote.status !== "quoted") throw new Error("expected quote");
    await expect(
      service.prepare(quote.plan, {
        authority: "server_prepared_provider_request",
        provider: "local_test",
        providerIdempotencyKey: `checkout_attempt:${quote.plan.identity.attemptId}`,
        providerRequestHash: "9".repeat(64),
        providerExpiresAt: "2026-08-25T13:00:00.000Z",
        providerCustomerEmail: "synthetic.buyer@example.test",
        providerOrigin: "http://127.0.0.1:3000",
        providerRequestSchemaVersion: 1,
        providerLivemode: false,
        providerScope: "local_test:synthetic-propeptiq-v1",
      }),
    ).resolves.toMatchObject({ status: "prepared" });
    expect(transactionAttempts()).toBe(3);
    expect(shipping).toHaveBeenCalledTimes(1);
    expect(tax).toHaveBeenCalledTimes(1);
  });

  it("rolls back lot decrements and every snapshot when a later deterministic insert fails", async () => {
    const key = "30000000-0000-4000-8000-000000000105";
    const duplicateEvent = "30000000-0000-4000-8000-000000000198";
    const { service } = setup({
      generator(label) {
        if (label.includes("inventory-event:reservation:")) return duplicateEvent;
        return keyedUuid(label);
      },
    });
    const quote = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: key,
      paymentProviderAvailable: true,
      request,
    });
    if (quote.status !== "quoted") throw new Error("expected quote");
    await expect(
      service.prepare(quote.plan, {
        authority: "server_prepared_provider_request",
        provider: "local_test",
        providerIdempotencyKey: `checkout_attempt:${quote.plan.identity.attemptId}`,
        providerRequestHash: "a".repeat(64),
        providerExpiresAt: "2026-08-25T13:00:00.000Z",
        providerCustomerEmail: "synthetic.buyer@example.test",
        providerOrigin: "http://127.0.0.1:3000",
        providerRequestSchemaVersion: 1,
        providerLivemode: false,
        providerScope: "local_test:synthetic-propeptiq-v1",
      }),
    ).rejects.toThrow();
    const state = await client.query<{
      orders: number;
      attempts: number;
      reservations: number;
      lot_a1: number;
      lot_a2: number;
      lot_b: number;
    }>(`SELECT
      (SELECT count(*)::int FROM orders) AS orders,
      (SELECT count(*)::int FROM checkout_attempts) AS attempts,
      (SELECT count(*)::int FROM inventory_reservations) AS reservations,
      (SELECT available_quantity FROM lots WHERE id = '${ids.lotA1}') AS lot_a1,
      (SELECT available_quantity FROM lots WHERE id = '${ids.lotA2}') AS lot_a2,
      (SELECT available_quantity FROM lots WHERE id = '${ids.lotB}') AS lot_b`);
    expect(state.rows[0]).toEqual({
      orders: 0,
      attempts: 0,
      reservations: 0,
      lot_a1: 1,
      lot_a2: 5,
      lot_b: 5,
    });
  });

  it("releases inventory exactly once for definite failure and fences every verified order payment", async () => {
    const key = "30000000-0000-4000-8000-000000000106";
    const first = await quoteAndPrepare(key);
    if (first.prepared.status !== "prepared") throw new Error("expected prepared");
    const releaseInput = {
      authority: "authoritative_provider_terminal" as const,
      cause: "definite_rejection" as const,
      providerEvidenceId: "synthetic-definite-rejection-1",
      attemptId: first.prepared.attemptId,
      orderId: first.prepared.orderId,
      provider: "local_test" as const,
      providerIdempotencyKey: `checkout_attempt:${first.prepared.attemptId}`,
      targetAttemptStatus: "failed" as const,
    };
    await expect(
      first.repository.releaseDefiniteFailure(releaseInput),
    ).resolves.toEqual({ status: "released" });
    await expect(
      first.repository.releaseDefiniteFailure(releaseInput),
    ).resolves.toEqual({ status: "already_released" });
    const restored = await client.query<{
      active: number;
      released: number;
      release_events: number;
      lot_a1: number;
      lot_a2: number;
      lot_b: number;
    }>(`SELECT
      (SELECT count(*)::int FROM inventory_reservations WHERE state = 'active') AS active,
      (SELECT count(*)::int FROM inventory_reservations WHERE state = 'released') AS released,
      (SELECT count(*)::int FROM inventory_events WHERE event_type = 'release') AS release_events,
      (SELECT available_quantity FROM lots WHERE id = '${ids.lotA1}') AS lot_a1,
      (SELECT available_quantity FROM lots WHERE id = '${ids.lotA2}') AS lot_a2,
      (SELECT available_quantity FROM lots WHERE id = '${ids.lotB}') AS lot_b`);
    expect(restored.rows[0]).toEqual({
      active: 0,
      released: 3,
      release_events: 3,
      lot_a1: 1,
      lot_a2: 5,
      lot_b: 5,
    });

    const secondKey = "30000000-0000-4000-8000-000000000107";
    const second = await quoteAndPrepare(secondKey, ids.buyer2);
    if (second.prepared.status !== "prepared") throw new Error("expected prepared");
    await client.exec(`
      INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status, attempt_count,
         processed_at, event_type, schema_version, normalized_payload,
         provider_created_at, livemode)
      VALUES
        ('${ids.providerEvent}', 'local_test', 'evt_synthetic_verified', '${"b".repeat(64)}',
         'processed', 1, '2026-08-25T12:20:00.000Z',
         'checkout.session.completed', 1,
         '{"providerEventId":"evt_synthetic_verified","eventType":"checkout.session.completed","schemaVersion":1,"livemode":false}'::jsonb,
         '2026-08-25T12:19:00.000Z', false);
      INSERT INTO payment_events
        (id, provider_event_id, order_id, event_type, provider_payment_id,
         idempotency_key, amount_minor, currency, occurred_at)
      VALUES
        ('${ids.paymentEvent}', '${ids.providerEvent}', '${second.prepared.orderId}',
         'payment_verified', 'pay_synthetic_other_reference',
         'payment-synthetic-fence', 20025, 'USD', '2026-08-25T12:20:00.000Z');
    `);
    await expect(
      second.repository.releaseDefiniteFailure({
        ...releaseInput,
        providerEvidenceId: "synthetic-definite-rejection-2",
        attemptId: second.prepared.attemptId,
        orderId: second.prepared.orderId,
        providerIdempotencyKey: `checkout_attempt:${second.prepared.attemptId}`,
      }),
    ).resolves.toEqual({ status: "payment_verified" });
    const retained = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM inventory_reservations
       WHERE order_id = '${second.prepared.orderId}' AND state = 'active'`,
    );
    expect(retained.rows[0]!.count).toBe(3);
  });

  it("retains provider-unknown reservations when presented only with local-clock expiry", async () => {
    const key = "30000000-0000-4000-8000-000000000110";
    const prepared = await quoteAndPrepare(key);
    if (prepared.prepared.status !== "prepared") throw new Error("expected prepared");
    await client.exec(
      `UPDATE checkout_attempts SET status = 'provider_unknown'
       WHERE id = '${prepared.prepared.attemptId}'`,
    );
    await expect(
      prepared.repository.releaseDefiniteFailure({
        authority: "authoritative_provider_terminal",
        cause: "local_clock_expired",
        providerEvidenceId: "synthetic-local-clock",
        attemptId: prepared.prepared.attemptId,
        orderId: prepared.prepared.orderId,
        provider: "local_test",
        providerIdempotencyKey: `checkout_attempt:${prepared.prepared.attemptId}`,
        targetAttemptStatus: "expired",
      } as never),
    ).resolves.toEqual({ status: "conflict" });
    const retained = await client.query<{
      active: number;
      releaseEvents: number;
    }>(`SELECT
      (SELECT count(*)::int FROM inventory_reservations
       WHERE order_id = '${prepared.prepared.orderId}' AND state = 'active') AS active,
      (SELECT count(*)::int FROM inventory_events
       WHERE order_id = '${prepared.prepared.orderId}' AND event_type = 'release') AS "releaseEvents"`);
    expect(retained.rows[0]).toEqual({ active: 3, releaseEvents: 0 });
  });

  it("releases a completed unpaid attempt once only with exact signed event and session evidence", async () => {
    const key = "30000000-0000-4000-8000-000000000111";
    const prepared = await quoteAndPrepare(key);
    if (prepared.prepared.status !== "prepared") throw new Error("expected prepared");
    const providerSessionId = "cs_local_synthetic_completed_unpaid";
    await client.query(
      `UPDATE checkout_attempts
       SET status = 'completed', provider_session_id = $2
       WHERE id = $1::uuid`,
      [prepared.prepared.attemptId, providerSessionId],
    );
    const input = {
      authority: "authoritative_provider_terminal" as const,
      cause: "verified_expiry" as const,
      providerEvidenceId: "evt_synthetic_signed_expiry",
      providerSessionId,
      providerLivemode: false,
      providerScope: "local_test:synthetic-propeptiq-v1",
      amountMinor: 20_025,
      currency: "USD" as const,
      attemptId: prepared.prepared.attemptId,
      orderId: prepared.prepared.orderId,
      provider: "local_test" as const,
      providerIdempotencyKey: `checkout_attempt:${prepared.prepared.attemptId}`,
      targetAttemptStatus: "expired" as const,
    };
    await expect(prepared.repository.releaseDefiniteFailure(input)).resolves.toEqual({
      status: "released",
    });
    await expect(prepared.repository.releaseDefiniteFailure(input)).resolves.toEqual({
      status: "already_released",
    });
    await expect(prepared.repository.releaseDefiniteFailure({
      ...input,
      providerSessionId: "cs_local_synthetic_wrong_session",
    })).resolves.toEqual({ status: "conflict" });

    const state = await client.query(`SELECT
      (SELECT status FROM checkout_attempts WHERE id = '${prepared.prepared.attemptId}') AS attempt_status,
      (SELECT state FROM orders WHERE id = '${prepared.prepared.orderId}') AS order_state,
      (SELECT count(*)::int FROM inventory_reservations
       WHERE order_id = '${prepared.prepared.orderId}' AND state = 'expired') AS expired,
      (SELECT count(*)::int FROM inventory_events
       WHERE order_id = '${prepared.prepared.orderId}' AND event_type = 'release') AS release_events`);
    expect(state.rows[0]).toEqual({
      attempt_status: "expired",
      order_state: "cancelled",
      expired: 3,
      release_events: 3,
    });
  });
});
