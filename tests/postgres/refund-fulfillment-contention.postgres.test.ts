import { createHash } from "node:crypto";

import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  requestRefundIntent,
  type AdminCommandContext,
} from "@/admin/admin-service";
import type { VerifiedIdentity } from "@/auth/identity";
import { hashReviewSnapshot } from "@/commerce/checkout-identity";
import type {
  PaymentProvider,
  RefundProviderResult,
} from "@/commerce/payment-provider";
import { createProviderExecutionContextV1 } from "@/commerce/provider-context";
import { normalizeStripeProviderEventV1 } from "@/commerce/provider-events";
import { submitOrRecoverRefund } from "@/commerce/refund-service";
import { createProviderEventAuthorityV1 } from "@/commerce/stripe-webhook-verifier";
import { parseServerEnv } from "@/config/env-schema";
import { createPostgresAdminRepository } from "@/db/repositories/admin-repository";
import {
  createFulfillmentRepository,
  type FulfillmentSqlClient,
  type FulfillmentTransactionRunner,
} from "@/db/repositories/fulfillment-repository";
import {
  createProviderEventRepository,
  createProviderEventTransactionRunner,
  type ProcessableProviderEventNormalizationV1,
  type ProviderEventTransactionRunner,
} from "@/db/repositories/provider-event-repository";
import {
  createRefundFulfillmentRepository,
  type RefundFulfillmentSqlClient,
  type RefundFulfillmentTransactionRunner,
} from "@/db/repositories/refund-fulfillment-repository";
import { createPostgresRateLimitStore } from "@/db/repositories/rate-limit-store";
import type { Principal } from "@/domain/authorization";
import { createRateLimitScope } from "@/security/rate-limit";

import { resolveTestDatabase } from "../integration/helpers/database";

// The guard validates explicit isolated credentials before Pool construction.
// This file is excluded from ordinary unit/PGlite lanes and must never be
// reported as executed when the guard is absent.
const target = resolveTestDatabase(process.env);
const pool = new Pool({ connectionString: target.url, max: 16 });
const suiteScope = `refund-fulfillment-6f-${process.pid}`;
const now = new Date("2026-08-26T12:00:00.000Z");
const stripeAccountId = "acct_synthetic6f";
const providerScope = `stripe:${stripeAccountId}`;
const rateLimitSecret = "task6f-guarded-rate-limit-secret-at-least-32-characters";
const activeClients = new Set<PoolClient>();
const emergencyReleases = new Set<() => void>();

function keyedUuid(label: string): string {
  const hex = createHash("sha256")
    .update(`${suiteScope}:${label}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const sha256 = async (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

type Deferred<Value> = Readonly<{
  promise: Promise<Value>;
  resolve: (value: Value) => void;
  reject: (reason?: unknown) => void;
}>;

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return Object.freeze({ promise, resolve, reject });
}

function sqlPort(client: PoolClient) {
  return Object.freeze({
    async query<Row extends object>(sql: string, params: readonly unknown[] = []) {
      const result = await client.query(sql, [...params]);
      return { rows: result.rows as Row[] };
    },
  });
}

async function runSerializable<Value>(
  work: (client: FulfillmentSqlClient & RefundFulfillmentSqlClient) => Promise<Value>,
  afterCallback?: () => Promise<void>,
  onBegin?: (pid: number) => void,
): Promise<Value> {
  const client = await pool.connect();
  activeClients.add(client);
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const pid = Number((await client.query<{ pid: number }>(
      "SELECT pg_backend_pid()::int AS pid",
    )).rows[0]!.pid);
    onBegin?.(pid);
    const result = await work(sqlPort(client));
    await afterCallback?.();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    activeClients.delete(client);
    client.release();
  }
}

function normalRunner(): FulfillmentTransactionRunner & RefundFulfillmentTransactionRunner {
  return (work) => runSerializable(work);
}

function pausedFirstRunner() {
  const callbackFinished = deferred<void>();
  const releaseCommit = deferred<void>();
  const backendPid = deferred<number>();
  emergencyReleases.add(() => releaseCommit.resolve());
  let pause = true;
  const runner: FulfillmentTransactionRunner & RefundFulfillmentTransactionRunner =
    (work) => runSerializable(work, async () => {
      if (!pause) return;
      pause = false;
      callbackFinished.resolve();
      await releaseCommit.promise;
    }, (pid) => backendPid.resolve(pid));
  return Object.freeze({ runner, callbackFinished, releaseCommit, backendPid });
}

function tracedRunner(lockPattern: RegExp) {
  const lockAttempted = deferred<number>();
  let signaled = false;
  const runner: FulfillmentTransactionRunner & RefundFulfillmentTransactionRunner =
    async (work) => {
      const client = await pool.connect();
      activeClients.add(client);
      try {
        await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        const pid = Number((await client.query<{ pid: number }>(
          "SELECT pg_backend_pid()::int AS pid",
        )).rows[0]!.pid);
        const result = await work({
          async query<Row extends object>(sql: string, params: readonly unknown[] = []) {
            if (!signaled && lockPattern.test(sql)) {
              signaled = true;
              lockAttempted.resolve(pid);
            }
            const queried = await client.query(sql, [...params]);
            return { rows: queried.rows as Row[] };
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        activeClients.delete(client);
        client.release();
      }
    };
  return Object.freeze({ runner, lockAttempted });
}

async function expectBlocked(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ blocked: boolean }>(
      `SELECT cardinality(pg_blocking_pids($1::int)) > 0 AS blocked`,
      [pid],
    );
    if (result.rows[0]?.blocked === true) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("expected an independently connected transaction to be blocked");
}

async function releaseAndDrainTransactions(): Promise<void> {
  for (const release of emergencyReleases) release();
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (activeClients.size === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("guarded transaction failed to drain before fixture cleanup");
}

type OrderFixture = Readonly<{
  staff: string;
  staffClerkId: string;
  buyer: string;
  buyerClerkId: string;
  attestation: string;
  acceptance: string;
  order: string;
  item: string;
  attempt: string;
  sourceEvent: string;
  payment: string;
  reservation: string;
  reserveEvent: string;
  shipment: string;
  paymentIntentId: string;
  sessionId: string;
}>;

type GuardFixture = Readonly<{
  scope: string;
  group: string;
  product: string;
  price: string;
  policy: string;
  lot: string;
  orders: readonly OrderFixture[];
}>;

function fixture(scope: string, orderCount = 1): GuardFixture {
  const orders = Array.from({ length: orderCount }, (_, index) => {
    const side = index + 1;
    return Object.freeze({
      staff: keyedUuid(`${scope}:staff:${side}`),
      staffClerkId: `clerk_${suiteScope}_${scope}_staff_${side}`,
      buyer: keyedUuid(`${scope}:buyer:${side}`),
      buyerClerkId: `clerk_${suiteScope}_${scope}_buyer_${side}`,
      attestation: keyedUuid(`${scope}:attestation:${side}`),
      acceptance: keyedUuid(`${scope}:acceptance:${side}`),
      order: keyedUuid(`${scope}:order:${side}`),
      item: keyedUuid(`${scope}:item:${side}`),
      attempt: keyedUuid(`${scope}:attempt:${side}`),
      sourceEvent: keyedUuid(`${scope}:source-event:${side}`),
      payment: keyedUuid(`${scope}:payment:${side}`),
      reservation: keyedUuid(`${scope}:reservation:${side}`),
      reserveEvent: keyedUuid(`${scope}:reserve-event:${side}`),
      shipment: keyedUuid(`${scope}:shipment:${side}`),
      paymentIntentId: `pi_${suiteScope}_${scope}_${side}`,
      sessionId: `cs_${suiteScope}_${scope}_${side}`,
    });
  });
  return Object.freeze({
    scope,
    group: keyedUuid(`${scope}:group`),
    product: keyedUuid(`${scope}:product`),
    price: keyedUuid(`${scope}:price`),
    policy: keyedUuid(`${scope}:policy`),
    lot: keyedUuid(`${scope}:lot`),
    orders: Object.freeze(orders),
  });
}

function checkoutPayload(data: OrderFixture) {
  return JSON.stringify({
    schemaVersion: 1,
    kind: "checkout_session",
    providerEventId: `evt_${suiteScope}_${data.order}`,
    eventType: "checkout.session.completed",
    providerCreatedAt: "2026-08-26T10:00:00.000Z",
    livemode: false,
    sessionId: data.sessionId,
    orderId: data.order,
    attemptId: data.attempt,
    paymentIntentId: data.paymentIntentId,
    amountMinor: 1000,
    currency: "usd",
    paymentStatus: "paid",
    sessionStatus: "complete",
  });
}

async function seedFixture(data: GuardFixture): Promise<void> {
  await pool.query(`
    INSERT INTO product_policy_groups (id, slug, name, active)
    VALUES ('${data.group}', '${suiteScope}-${data.scope}-group', 'Guarded 6F group', true);
    INSERT INTO products
      (id, slug, name, package_form, material_identity, policy_group_id, status)
    VALUES ('${data.product}', '${suiteScope}-${data.scope}-product',
      'Guarded 6F product', 'Sealed unit', 'Synthetic identity',
      '${data.group}', 'active');
    INSERT INTO product_prices
      (id, product_id, version, amount_minor, currency, effective_at)
    VALUES ('${data.price}', '${data.product}', 1, 1000, 'USD',
      '2026-08-01T00:00:00.000Z');
    INSERT INTO lots
      (id, product_id, supplier_name, supplier_lot_code,
       received_quantity, available_quantity, status, expires_at)
    VALUES ('${data.lot}', '${data.product}', 'Synthetic guarded supplier',
      '${suiteScope}-${data.scope}-lot', 20, 0, 'released',
      '2027-08-26T12:00:00.000Z');
    INSERT INTO destination_policies
      (id, scope_kind, product_id, state_code, result, version, active, effective_at)
    VALUES ('${data.policy}', 'product', '${data.product}', 'CA', 'allowed',
      1, true, '2026-08-01T00:00:00.000Z')
  `);
  for (const order of data.orders) {
    await pool.query(`
      INSERT INTO users (id, clerk_id, email_verified_at)
      VALUES
        ('${order.staff}', '${order.staffClerkId}', '2026-08-01T00:00:00.000Z'),
        ('${order.buyer}', '${order.buyerClerkId}', '2026-08-01T00:00:00.000Z');
      INSERT INTO buyer_profiles
        (user_id, status, age_confirmed_at, research_purpose, updated_at)
      VALUES
        ('${order.staff}', 'active', '2026-08-01T00:00:00.000Z', 'analytical', '${now.toISOString()}'),
        ('${order.buyer}', 'active', '2026-08-01T00:00:00.000Z', 'analytical', '${now.toISOString()}');
      INSERT INTO staff_roles
        (user_id, capability, granted_by_user_id, grant_correlation_id)
      VALUES
        ('${order.staff}', 'refund:request', '${order.staff}', '${suiteScope}-${data.scope}-refund'),
        ('${order.staff}', 'fulfillment:release:consume', '${order.staff}', '${suiteScope}-${data.scope}-fulfillment');
      INSERT INTO attestation_versions
        (id, version, content_hash, policy_text, effective_at)
      VALUES ('${order.attestation}', 1, '${"1".repeat(64)}',
        'Guarded historical policy.', '2026-08-01T00:00:00.000Z');
      INSERT INTO attestation_acceptances
        (id, user_id, attestation_version_id, accepted_at)
      VALUES ('${order.acceptance}', '${order.buyer}', '${order.attestation}',
        '2026-08-02T00:00:00.000Z');
      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state, updated_at)
      VALUES ('${order.order}', '${order.buyer}', 'active', '${order.acceptance}',
        'CA', 'USD', 1000, 0, 0, 0, 1000, 'paid_pending_fulfillment',
        '2026-08-26T10:00:00.000Z');
      INSERT INTO order_items
        (id, order_id, product_id, product_price_id, destination_policy_id,
         product_name_snapshot, package_form_snapshot, currency,
         unit_amount_minor, quantity, subtotal_minor, discount_minor, total_minor)
      VALUES ('${order.item}', '${order.order}', '${data.product}', '${data.price}',
        '${data.policy}', 'Guarded 6F product', 'Sealed unit', 'USD',
        1000, 1, 1000, 0, 1000);
      INSERT INTO order_shipping_addresses
        (order_id, recipient_name, address_line1, city, state_code, postal_code, country)
      VALUES ('${order.order}', 'Private Guarded Recipient', '100 Private Guarded Address',
        'Test City', 'CA', '90210', 'US');
      INSERT INTO checkout_attempts
        (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         reasons, tax_ready, shipping_ready, provider, provider_request_id,
         provider_session_id, provider_request_hash, provider_customer_email,
         provider_origin, provider_request_schema_version, provider_livemode,
         provider_scope, tax_quote_reference, shipping_quote_reference,
         shipping_service, expires_at)
      VALUES ('${order.attempt}', '${order.order}', '${order.buyer}',
        '${suiteScope}-${data.scope}-checkout-${order.attempt}', '${"2".repeat(64)}',
        'completed', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', true,
        false, '{}', true, true, 'stripe', 'checkout_attempt:${order.attempt}',
        '${order.sessionId}', '${"3".repeat(64)}', 'private@example.test',
        'https://example.test', 1, false, '${providerScope}',
        'tax_guarded_6f', 'ship_guarded_6f', 'synthetic_ground',
        '2027-08-26T12:00:00.000Z');
      INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status, attempt_count,
         received_at, processed_at, event_type, schema_version,
         normalized_payload, provider_created_at, livemode)
      VALUES ('${order.sourceEvent}', 'stripe', 'evt_${suiteScope}_${order.order}',
        '${"4".repeat(64)}', 'processed', 1, '2026-08-26T10:00:00.000Z',
        '2026-08-26T10:01:00.000Z', 'checkout.session.completed', 1,
        '${checkoutPayload(order)}'::jsonb, '2026-08-26T10:00:00.000Z', false);
      INSERT INTO payment_events
        (id, provider_event_id, order_id, event_type, provider_payment_id,
         idempotency_key, amount_minor, currency, occurred_at)
      VALUES ('${order.payment}', '${order.sourceEvent}', '${order.order}',
        'payment_verified', '${order.paymentIntentId}',
        'stripe:payment_intent:${order.paymentIntentId}', 1000, 'USD',
        '2026-08-26T10:00:00.000Z');
      INSERT INTO inventory_reservations
        (id, checkout_attempt_id, idempotency_key, order_id, order_item_id,
         product_id, lot_id, quantity_reserved, quantity_remaining, state,
         expires_at, updated_at)
      VALUES ('${order.reservation}', '${order.attempt}',
        '${suiteScope}-${data.scope}-reservation-${order.reservation}',
        '${order.order}', '${order.item}', '${data.product}', '${data.lot}',
        1, 1, 'active', '2026-08-25T11:00:00.000Z',
        '2026-08-26T10:00:00.000Z');
      INSERT INTO inventory_events
        (id, idempotency_key, event_type, lot_id, order_id, order_item_id,
         reservation_id, quantity, balance_after, occurred_at)
      VALUES ('${order.reserveEvent}', '${suiteScope}-${data.scope}-reserve-event-${order.reserveEvent}',
        'reservation', '${data.lot}', '${order.order}', '${order.item}',
        '${order.reservation}', 1, 0, '2026-08-26T10:00:00.000Z');
      INSERT INTO shipments
        (id, order_id, carrier, tracking_reference, state, updated_at)
      VALUES ('${order.shipment}', '${order.order}', 'PRIVATE-CARRIER-SENTINEL',
        'PRIVATE-TRACKING-SENTINEL', 'pending', '2026-08-26T10:00:00.000Z')
    `);
  }
}

async function cleanupFixture(data: GuardFixture): Promise<void> {
  await releaseAndDrainTransactions();
  const orders = data.orders.map((row) => row.order);
  const users = data.orders.flatMap((row) => [row.staff, row.buyer]);
  const attempts = data.orders.map((row) => row.attempt);
  const rateLimitScopes = data.orders.map((row) =>
    createRateLimitScope(row.staff, "refund.request", rateLimitSecret),
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM admin_audit
       WHERE actor_user_id = ANY($1::uuid[])
          OR resource_id = ANY($2::text[])
          OR resource_id IN (
            SELECT id::text FROM provider_events
            WHERE provider_event_id LIKE $3
          )`,
      [users, orders, `evt_${suiteScope}_%`],
    );
    await client.query(
      `DELETE FROM rate_limit_windows WHERE scope_hash = ANY($1::text[])`,
      [rateLimitScopes],
    );
    await client.query(`DELETE FROM downstream_effects WHERE order_id = ANY($1::uuid[])`, [orders]);
    await client.query(`DELETE FROM inventory_events WHERE order_id = ANY($1::uuid[])`, [orders]);
    await client.query(`DELETE FROM inventory_reservations WHERE order_id = ANY($1::uuid[])`, [orders]);
    await client.query(`DELETE FROM shipments WHERE order_id = ANY($1::uuid[])`, [orders]);
    await client.query(`DELETE FROM fulfillment_releases WHERE order_id = ANY($1::uuid[])`, [orders]);
    await client.query(`DELETE FROM refunds WHERE order_id = ANY($1::uuid[])`, [orders]);
    await client.query(`DELETE FROM payment_events WHERE order_id = ANY($1::uuid[])`, [orders]);
    await client.query(
      `DELETE FROM provider_events
       WHERE id = ANY($1::uuid[])
          OR normalized_payload->>'orderId' = ANY($2::text[])
          OR provider_event_id LIKE $3`,
      [
        data.orders.map((row) => row.sourceEvent),
        orders,
        `evt_${suiteScope}_%`,
      ],
    );
    await client.query(`DELETE FROM checkout_attempts WHERE id = ANY($1::uuid[])`, [attempts]);
    await client.query(`DELETE FROM order_promotion_applications WHERE order_id = ANY($1::uuid[])`, [orders]);
    await client.query(`DELETE FROM order_shipping_addresses WHERE order_id = ANY($1::uuid[])`, [orders]);
    await client.query(`DELETE FROM order_items WHERE order_id = ANY($1::uuid[])`, [orders]);
    await client.query(`DELETE FROM review_requests WHERE order_id = ANY($1::uuid[])`, [orders]);
    await client.query(`DELETE FROM orders WHERE id = ANY($1::uuid[])`, [orders]);
    await client.query(`DELETE FROM destination_policies WHERE product_id = $1::uuid`, [data.product]);
    await client.query(`DELETE FROM lots WHERE id = $1::uuid`, [data.lot]);
    await client.query(`DELETE FROM product_prices WHERE id = $1::uuid`, [data.price]);
    await client.query(`DELETE FROM products WHERE id = $1::uuid`, [data.product]);
    await client.query(`DELETE FROM product_policy_groups WHERE id = $1::uuid`, [data.group]);
    await client.query(`DELETE FROM staff_roles WHERE user_id = ANY($1::uuid[])`, [users]);
    await client.query(`DELETE FROM attestation_acceptances WHERE id = ANY($1::uuid[])`, [data.orders.map((row) => row.acceptance)]);
    await client.query(`DELETE FROM attestation_versions WHERE id = ANY($1::uuid[])`, [data.orders.map((row) => row.attestation)]);
    await client.query(`DELETE FROM buyer_profiles WHERE user_id = ANY($1::uuid[])`, [users]);
    await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [users]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function fulfillmentRepository(
  runner: FulfillmentTransactionRunner = normalRunner(),
  trace?: string[],
) {
  const traced: FulfillmentTransactionRunner = trace === undefined
    ? runner
    : (work, options) => runner(
        (client) => work({
          query(sql, params = []) {
            trace.push(sql);
            return client.query(sql, params);
          },
        }),
        options,
      );
  return createFulfillmentRepository({
    runSerializableTransaction: traced,
    sha256,
    keyedUuid,
    retrySleep: async () => undefined,
  });
}

function refundRepository(
  runner: RefundFulfillmentTransactionRunner = normalRunner(),
) {
  return createRefundFulfillmentRepository({
    runSerializableTransaction: runner,
    sha256,
    retrySleep: async () => undefined,
  });
}

function fulfillmentCommand(order: OrderFixture) {
  return Object.freeze({
    actorUserId: order.staff,
    actorClerkUserId: order.staffClerkId,
    orderId: order.order,
    now,
    correlationId: `${suiteScope}:fulfillment:${order.order}`,
  });
}

function identity(order: OrderFixture): VerifiedIdentity {
  return Object.freeze({
    clerkUserId: order.staffClerkId,
    primaryEmail: "guarded-staff@example.test",
    emailVerifiedAt: "2026-08-26T11:00:00.000Z",
    mfaConfigured: true,
    secondFactorCompleted: true,
  });
}

function principal(order: OrderFixture): Principal {
  return Object.freeze({
    actorId: order.staff,
    clerkUserId: order.staffClerkId,
    buyerStatus: null,
    capabilities: Object.freeze([
      "refund:request",
      "fulfillment:release:consume",
    ] as const),
    mfaSatisfied: true,
  });
}

function adminContext(order: OrderFixture, correlationId: string): AdminCommandContext {
  return Object.freeze({
    principal: principal(order),
    identity: identity(order),
    now,
    correlationId,
    rateLimitSecret,
  });
}

async function seedBuyerReview(
  data: GuardFixture,
  order: OrderFixture,
): Promise<string> {
  const reviewId = keyedUuid(`${data.scope}:review`);
  const reviewInput = Object.freeze({
    orderId: order.order,
    buyerUserId: order.buyer,
    buyerStatus: "review" as const,
    acceptedAttestationVersionId: order.attestation,
    currentAttestationVersionId: order.attestation,
    items: Object.freeze([
      Object.freeze({ productId: data.product, quantity: 1 }),
    ]),
    promotionIds: Object.freeze([]),
    destination: Object.freeze({
      recipientName: "Private Guarded Recipient",
      line1: "100 Private Guarded Address",
      line2: null,
      city: "Test City",
      stateCode: "CA",
      postalCode: "90210",
      countryCode: "US" as const,
    }),
    reviewPolicies: Object.freeze([]),
  });
  const reviewHash = await hashReviewSnapshot(reviewInput, sha256);
  await pool.query(
    `UPDATE buyer_profiles SET status = 'review' WHERE user_id = $1::uuid`,
    [order.buyer],
  );
  await pool.query(
    `INSERT INTO review_requests
       (id, user_id, order_id, snapshot_hash, buyer_status_snapshot,
        attestation_version_id, destination_state_code, cart_snapshot,
        buyer_review_required, destination_review_required, outcome,
        decided_by_user_id, decided_at, covers_buyer_review)
     VALUES
       ($2::uuid, $1::uuid, $3::uuid, $4, 'review', $5::uuid, 'CA',
        $6::jsonb, true, false, 'approved', $7::uuid,
        $8::timestamptz, true)`,
    [
      order.buyer,
      reviewId,
      order.order,
      reviewHash,
      order.attestation,
      JSON.stringify({
        schemaVersion: 1,
        items: reviewInput.items,
        promotionIds: reviewInput.promotionIds,
      }),
      order.staff,
      now,
    ],
  );
  return reviewId;
}

function adminRepository(runner: FulfillmentTransactionRunner) {
  const rateLimitStore = createPostgresRateLimitStore({
    async query<Row extends object>(sql: string, params: readonly unknown[] = []) {
      const result = await pool.query(sql, [...params]);
      return { rows: result.rows as Row[] };
    },
  });
  return createPostgresAdminRepository(runner, rateLimitStore);
}

async function seedRequestedRefund(
  data: OrderFixture,
  label: string,
  amountMinor = 500,
): Promise<string> {
  const refundId = keyedUuid(`${label}:refund`);
  await pool.query(
    `INSERT INTO refunds
       (id, order_id, requested_by_user_id, verified_payment_event_id,
        provider, idempotency_key, requested_amount_minor, currency,
        status, origin, requested_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'stripe', $5,
             $6, 'USD', 'requested', 'staff_requested', $7::timestamptz)`,
    [refundId, data.order, data.staff, data.payment, `${suiteScope}:${label}`, amountMinor, now],
  );
  return refundId;
}

function providerEnvironment() {
  return parseServerEnv({
    APP_ENV: "local",
    AUTH_MODE: "test",
    DATABASE_MODE: "test",
    TEST_DATABASE_URL: target.url,
    TEST_DATABASE_CONFIRMATION: "isolated-test-database",
    PAYMENTS_MODE: "test",
    STRIPE_ACCOUNT_ID: stripeAccountId,
    STRIPE_SECRET_KEY: "sk_test_synthetic_guarded_6f",
    STRIPE_WEBHOOK_SECRET: "whsec_synthetic_guarded_6f",
    RATE_LIMIT_SECRET: "task6f-guarded-rate-limit-secret-at-least-32-characters",
    FULFILLMENT_MODE: "test",
  });
}

function providerAuthority() {
  const value = createProviderEventAuthorityV1(providerEnvironment());
  if (value === null) throw new Error("guarded provider-event authority is unavailable");
  return value;
}

const runProviderEventTransaction = createProviderEventTransactionRunner(
  async () => {
    const client = await pool.connect();
    activeClients.add(client);
    return {
      query: async (sql: string, params: readonly unknown[] = []) => {
        const queried = await client.query(sql, [...params]);
        return { rows: queried.rows };
      },
      release: (destroy = false) => {
        activeClients.delete(client);
        client.release(destroy);
      },
    };
  },
);

function pausedProviderEventRunner() {
  const callbackFinished = deferred<void>();
  const releaseCommit = deferred<void>();
  const backendPid = deferred<number>();
  let pause = true;
  emergencyReleases.add(() => releaseCommit.resolve());
  const runner: ProviderEventTransactionRunner = (work, options) =>
    runProviderEventTransaction(async (client) => {
      const pid = await client.query(
        "SELECT pg_backend_pid()::int AS pid",
      );
      const pidValue = (pid.rows[0] as { pid?: unknown } | undefined)?.pid;
      if (!Number.isSafeInteger(Number(pidValue))) {
        throw new Error("guarded provider-event backend PID was invalid");
      }
      backendPid.resolve(Number(pidValue));
      const result = await work(client);
      if (pause) {
        pause = false;
        callbackFinished.resolve();
        await releaseCommit.promise;
      }
      return result;
    }, options);
  return Object.freeze({ runner, callbackFinished, releaseCommit, backendPid });
}

function providerEventRepository(
  runner: ProviderEventTransactionRunner = runProviderEventTransaction,
) {
  return createProviderEventRepository({
    runSerializableTransaction: runner,
    keyedUuid,
  });
}

function normalizedDispute(data: OrderFixture, label: string) {
  const result = normalizeStripeProviderEventV1({
    id: `evt_${suiteScope}_${label}`,
    type: "charge.dispute.updated",
    created: 1_787_741_200,
    livemode: false,
    data: {
      object: {
        id: `dp_${suiteScope}_${label}`,
        payment_intent: data.paymentIntentId,
        charge: `ch_${suiteScope}_${label}`,
        amount: 1000,
        currency: "usd",
        status: "needs_response",
        livemode: false,
      },
    },
  });
  if (result.status !== "normalized") {
    throw new Error("guarded dispute fixture did not normalize");
  }
  return result;
}

function normalizedRefund(
  data: OrderFixture,
  refundId: string,
  providerRefundId: string,
  label: string,
) {
  const result = normalizeStripeProviderEventV1({
    id: `evt_${suiteScope}_${label}`,
    type: "refund.updated",
    created: 1_787_741_200,
    livemode: false,
    data: {
      object: {
        id: providerRefundId,
        metadata: { orderId: data.order, refundId },
        payment_intent: data.paymentIntentId,
        charge: `ch_${suiteScope}_${label}`,
        amount: 500,
        currency: "usd",
        status: "succeeded",
      },
    },
  });
  if (result.status !== "normalized") {
    throw new Error("guarded refund fixture did not normalize");
  }
  return result;
}

async function registerClaim(
  normalization: ProcessableProviderEventNormalizationV1,
  label: string,
) {
  const databaseEventId = keyedUuid(`${label}:provider-event`);
  const registered = await providerEventRepository().registerAndClaim({
    provider: "stripe",
    databaseEventId,
    conflictAuditId: keyedUuid(`${label}:conflict-audit`),
    payloadHash: createHash("sha256")
      .update(JSON.stringify(normalization), "utf8")
      .digest("hex"),
    normalization,
    receivedAt: now,
    claimAt: now,
    leaseToken: `lease_${suiteScope}_${label}`,
    leaseExpiresAt: new Date(now.getTime() + 60_000),
  });
  if (registered.status !== "claimed") {
    throw new Error("expected a guarded provider-event claim");
  }
  return Object.freeze({ claim: registered.claim, databaseEventId });
}

async function processSignedEvent(
  normalization: ProcessableProviderEventNormalizationV1,
  label: string,
  runner: ProviderEventTransactionRunner = runProviderEventTransaction,
) {
  const registered = await registerClaim(normalization, label);
  const result = await providerEventRepository(runner).processClaim({
    claim: registered.claim,
    authority: providerAuthority(),
    now,
  });
  return Object.freeze({ result, databaseEventId: registered.databaseEventId });
}

async function refundProviderContext(
  data: OrderFixture,
  adapter: PaymentProvider,
) {
  const result = await createProviderExecutionContextV1({
    environment: providerEnvironment(),
    identity: identity(data),
    now,
    resolveDatabaseUsersByClerkId: async () => [data.staff],
    adapters: { stripe: adapter, localTest: null },
  });
  if (!result.ok) throw new Error("guarded refund provider context was not minted");
  return result.context;
}

function fakeStripeProvider(input: Readonly<{
  createRefund: () => Promise<RefundProviderResult>;
}>): PaymentProvider {
  return Object.freeze({
    context: Object.freeze({
      provider: "stripe" as const,
      livemode: false,
      scope: providerScope,
    }),
    createCheckoutSession: vi.fn(async () => {
      throw new Error("checkout is outside the guarded Slice 6F lane");
    }),
    retrieveCheckoutSession: vi.fn(async () => {
      throw new Error("checkout is outside the guarded Slice 6F lane");
    }),
    createRefund: vi.fn(input.createRefund),
    retrieveRefund: vi.fn(async () => {
      throw new Error("retrieve is outside this guarded create fixture");
    }),
  });
}

async function withLockedMutation(
  work: (client: PoolClient) => Promise<void>,
  locked: Deferred<number>,
  release: Deferred<void>,
): Promise<void> {
  emergencyReleases.add(() => release.resolve());
  const client = await pool.connect();
  activeClients.add(client);
  try {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    await work(client);
    const pid = Number((await client.query<{ pid: number }>(
      "SELECT pg_backend_pid()::int AS pid",
    )).rows[0]!.pid);
    locked.resolve(pid);
    await release.promise;
    await client.query("COMMIT");
  } catch (error) {
    locked.reject(error);
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    activeClients.delete(client);
    client.release();
  }
}

describe("guarded PostgreSQL refund and fulfillment contention", () => {
  beforeAll(async () => {
    const ready = await pool.query(`
      SELECT to_regclass('public.refunds') AS refunds,
             to_regclass('public.fulfillment_releases') AS fulfillment_releases,
             to_regclass('public.shipments') AS shipments,
             to_regclass('public.provider_events') AS provider_events,
             to_regclass('public.downstream_effects') AS downstream_effects
    `);
    expect(ready.rows[0]).toEqual({
      refunds: "refunds",
      fulfillment_releases: "fulfillment_releases",
      shipments: "shipments",
      provider_events: "provider_events",
      downstream_effects: "downstream_effects",
    });
  });

  afterAll(async () => pool.end());

  it("serializes two over-balance intents and converges two valid claims on the single admitted refund", async () => {
    const data = fixture("refund-balance-race");
    const order = data.orders[0]!;
    await cleanupFixture(data);
    await seedFixture(data);
    try {
      const first = pausedFirstRunner();
      const firstIntent = requestRefundIntent(
        adminRepository(first.runner),
        adminContext(order, `${suiteScope}:refund-balance:first`),
        {
          orderId: order.order,
          requestedAmountMinor: 600,
          reasonRedacted: null,
          idempotencyKey: `${suiteScope}:refund-balance:first`,
        },
      );
      await first.callbackFinished.promise;

      const second = tracedRunner(/FROM orders[\s\S]*FOR UPDATE/iu);
      const secondIntent = requestRefundIntent(
        adminRepository(second.runner),
        adminContext(order, `${suiteScope}:refund-balance:second`),
        {
          orderId: order.order,
          requestedAmountMinor: 600,
          reasonRedacted: null,
          idempotencyKey: `${suiteScope}:refund-balance:second`,
        },
      );
      const secondPid = await second.lockAttempted.promise;
      expect(secondPid).not.toBe(await first.backendPid.promise);
      await expectBlocked(secondPid);
      first.releaseCommit.resolve();

      const intentResults = await Promise.allSettled([firstIntent, secondIntent]);
      expect(intentResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(intentResults.filter((result) => result.status === "rejected")).toHaveLength(1);
      const storedIntent = await pool.query<{
        id: string;
        amount: number;
        status: string;
        audits: number;
      }>(
        `SELECT id::text AS id, requested_amount_minor::int AS amount, status,
           (SELECT count(*)::int FROM admin_audit
            WHERE resource_id = $1::text AND action = 'refund.requested') AS audits
         FROM refunds WHERE order_id = $1::uuid`,
        [order.order],
      );
      expect(storedIntent.rows).toHaveLength(1);
      expect(storedIntent.rows[0]).toMatchObject({ amount: 600, status: "requested", audits: 1 });

      const bothProviderCallsStarted = deferred<void>();
      emergencyReleases.add(() => bothProviderCallsStarted.resolve());
      let providerCallCount = 0;
      const providerCalls = vi.fn(async (): Promise<RefundProviderResult> => {
        providerCallCount += 1;
        if (providerCallCount === 2) bothProviderCallsStarted.resolve();
        await bothProviderCallsStarted.promise;
        return {
          status: "provider_unknown",
          knownProviderRefundId: null,
          evidenceCode: "provider_sdk_unknown",
        };
      });
      const adapter = fakeStripeProvider({ createRefund: providerCalls });
      const context = await refundProviderContext(order, adapter);
      const claimFirst = pausedFirstRunner();
      const firstClaim = submitOrRecoverRefund({
        repository: refundRepository(claimFirst.runner),
        providerContext: context,
        actorUserId: order.staff,
        refundId: storedIntent.rows[0]!.id,
        now,
        authorize: async () => ({
          actorUserId: order.staff,
          actorClerkUserId: order.staffClerkId,
        }),
      });
      await claimFirst.callbackFinished.promise;
      const claimSecond = tracedRunner(/FROM orders[\s\S]*FOR UPDATE/iu);
      const secondClaim = submitOrRecoverRefund({
        repository: refundRepository(claimSecond.runner),
        providerContext: context,
        actorUserId: order.staff,
        refundId: storedIntent.rows[0]!.id,
        now,
        authorize: async () => ({
          actorUserId: order.staff,
          actorClerkUserId: order.staffClerkId,
        }),
      });
      const claimPid = await claimSecond.lockAttempted.promise;
      expect(claimPid).not.toBe(await claimFirst.backendPid.promise);
      await expectBlocked(claimPid);
      claimFirst.releaseCommit.resolve();
      const claimSettled = await Promise.allSettled([firstClaim, secondClaim]);
      expect(claimSettled.map((result) => result.status)).toEqual([
        "fulfilled",
        "fulfilled",
      ]);
      expect(claimSettled.flatMap((result) =>
        result.status === "fulfilled" ? [result.value.status] : [],
      ).toSorted()).toEqual([
        "stale",
        "submitted",
      ]);
      expect(providerCalls).toHaveBeenCalledTimes(2);
      for (const call of vi.mocked(adapter.createRefund).mock.calls) {
        expect(call[1]).toBe(`refund_request:${storedIntent.rows[0]!.id}`);
      }
      const claims = await pool.query<{
        submitted: number;
        total: number;
      }>(
        `SELECT count(*) FILTER (WHERE status = 'submitted')::int AS submitted,
                coalesce(sum(requested_amount_minor), 0)::int AS total
         FROM refunds WHERE order_id = $1::uuid`,
        [order.order],
      );
      expect(claims.rows[0]).toEqual({ submitted: 1, total: 600 });
    } finally {
      await cleanupFixture(data);
    }
  });

  it("serializes requestRefundIntent against handoff in both winner orders", async () => {
    for (const winner of ["intent", "handoff"] as const) {
      const data = fixture(`intent-handoff-${winner}`);
      const order = data.orders[0]!;
      await cleanupFixture(data);
      await seedFixture(data);
      try {
        if (winner === "intent") {
          const paused = pausedFirstRunner();
          const intent = requestRefundIntent(
            adminRepository(paused.runner),
            adminContext(order, `${suiteScope}:intent-handoff:intent`),
            {
              orderId: order.order,
              requestedAmountMinor: 500,
              reasonRedacted: null,
              idempotencyKey: `${suiteScope}:intent-handoff:intent`,
            },
          );
          await paused.callbackFinished.promise;
          const blocked = tracedRunner(/FROM orders[\s\S]*FOR UPDATE/iu);
          const handoff = fulfillmentRepository(blocked.runner).handoff(
            fulfillmentCommand(order),
          );
          const blockedPid = await blocked.lockAttempted.promise;
          expect(blockedPid).not.toBe(await paused.backendPid.promise);
          await expectBlocked(blockedPid);
          paused.releaseCommit.resolve();
          const settled = await Promise.allSettled([intent, handoff]);
          expect(settled.map((result) => result.status)).toEqual([
            "fulfilled",
            "fulfilled",
          ]);
          expect(settled[0]).toMatchObject({ value: { status: "requested" } });
          expect(settled[1]).toMatchObject({ value: { status: "held" } });
        } else {
          const paused = pausedFirstRunner();
          const handoff = fulfillmentRepository(paused.runner).handoff(
            fulfillmentCommand(order),
          );
          await paused.callbackFinished.promise;
          const blocked = tracedRunner(/FROM orders[\s\S]*FOR UPDATE/iu);
          const intent = requestRefundIntent(
            adminRepository(blocked.runner),
            adminContext(order, `${suiteScope}:intent-handoff:handoff`),
            {
              orderId: order.order,
              requestedAmountMinor: 500,
              reasonRedacted: null,
              idempotencyKey: `${suiteScope}:intent-handoff:handoff`,
            },
          );
          const blockedPid = await blocked.lockAttempted.promise;
          expect(blockedPid).not.toBe(await paused.backendPid.promise);
          await expectBlocked(blockedPid);
          paused.releaseCommit.resolve();
          const settled = await Promise.allSettled([handoff, intent]);
          expect(settled.map((result) => result.status)).toEqual([
            "fulfilled",
            "rejected",
          ]);
          expect(settled[0]).toMatchObject({ value: { status: "handed_off" } });
          expect(
            settled[1].status === "rejected" &&
              settled[1].reason instanceof Error &&
              /pre-handoff paid order/iu.test(settled[1].reason.message),
          ).toBe(true);
        }

        const counts = await pool.query<{
          refunds: number;
          refundAudits: number;
          releases: number;
          consumes: number;
          effects: number;
        }>(
          `SELECT
             (SELECT count(*)::int FROM refunds WHERE order_id = $1::uuid) AS refunds,
             (SELECT count(*)::int FROM admin_audit
              WHERE resource_id = $1::text AND action = 'refund.requested') AS "refundAudits",
             (SELECT count(*)::int FROM fulfillment_releases
              WHERE order_id = $1::uuid) AS releases,
             (SELECT count(*)::int FROM inventory_events
              WHERE order_id = $1::uuid AND event_type = 'consume') AS consumes,
             (SELECT count(*)::int FROM downstream_effects
              WHERE order_id = $1::uuid AND effect_type = 'fulfillment_handed_off') AS effects`,
          [order.order],
        );
        expect(counts.rows[0]).toEqual(
          winner === "intent"
            ? { refunds: 1, refundAudits: 1, releases: 0, consumes: 0, effects: 0 }
            : { refunds: 0, refundAudits: 0, releases: 1, consumes: 1, effects: 1 },
        );
      } finally {
        await cleanupFixture(data);
      }
    }
  });

  it("commits a refund claim before one provider call and serializes that claim against handoff", async () => {
    const data = fixture("claim-handoff-visibility");
    const order = data.orders[0]!;
    await cleanupFixture(data);
    await seedFixture(data);
    const providerVisibilityClient = await pool.connect();
    activeClients.add(providerVisibilityClient);
    try {
      const refundId = await seedRequestedRefund(order, "claim-handoff-visibility");
      const providerObserved = deferred<void>();
      const adapter = fakeStripeProvider({
        createRefund: async () => {
          try {
            const visible = await providerVisibilityClient.query<{
              status: string;
              hash: string | null;
              attempt: number;
              pid: number;
            }>(
              `SELECT status, provider_request_hash AS hash,
                      attempt_count::int AS attempt,
                      pg_backend_pid()::int AS pid
               FROM refunds WHERE id = $1::uuid`,
              [refundId],
            );
            expect(visible.rows[0]?.status).toBe("submitted");
            expect(visible.rows[0]?.hash).toMatch(/^[a-f0-9]{64}$/u);
            expect(visible.rows[0]?.attempt).toBe(1);
            expect(visible.rows[0]?.pid).not.toBe(await paused.backendPid.promise);
            providerObserved.resolve();
            return {
              status: "provider_unknown",
              knownProviderRefundId: null,
              evidenceCode: "provider_transport_unknown",
            };
          } catch (error) {
            providerObserved.reject(error);
            throw error;
          }
        },
      });
      const providerContext = await refundProviderContext(order, adapter);
      const paused = pausedFirstRunner();
      const submission = submitOrRecoverRefund({
        repository: refundRepository(paused.runner),
        providerContext,
        actorUserId: order.staff,
        refundId,
        now,
        authorize: async () => ({
          actorUserId: order.staff,
          actorClerkUserId: order.staffClerkId,
        }),
      });
      await paused.callbackFinished.promise;
      expect(adapter.createRefund).not.toHaveBeenCalled();

      const blocked = tracedRunner(/FROM orders[\s\S]*FOR UPDATE/iu);
      const handoff = fulfillmentRepository(blocked.runner).handoff(
        fulfillmentCommand(order),
      );
      const blockedPid = await blocked.lockAttempted.promise;
      expect(blockedPid).not.toBe(await paused.backendPid.promise);
      await expectBlocked(blockedPid);
      paused.releaseCommit.resolve();
      await providerObserved.promise;

      const settled = await Promise.allSettled([submission, handoff]);
      expect(settled).toMatchObject([
        { status: "fulfilled", value: { status: "submitted" } },
        { status: "fulfilled", value: { status: "held" } },
      ]);
      expect(adapter.createRefund).toHaveBeenCalledTimes(1);
      const final = await pool.query<{
        status: string;
        attempts: number;
        releases: number;
      }>(
        `SELECT status, attempt_count::int AS attempts,
           (SELECT count(*)::int FROM fulfillment_releases
            WHERE order_id = $2::uuid) AS releases
         FROM refunds WHERE id = $1::uuid`,
        [refundId, order.order],
      );
      expect(final.rows[0]).toEqual({ status: "submitted", attempts: 1, releases: 0 });
    } finally {
      activeClients.delete(providerVisibilityClient);
      providerVisibilityClient.release();
      await cleanupFixture(data);
    }
  });

  it("serializes two simultaneous handoffs into one deterministic release version and one replay", async () => {
    const data = fixture("simultaneous-handoff");
    const order = data.orders[0]!;
    await cleanupFixture(data);
    await seedFixture(data);
    try {
      const paused = pausedFirstRunner();
      const first = fulfillmentRepository(paused.runner).handoff(
        fulfillmentCommand(order),
      );
      await paused.callbackFinished.promise;
      const blocked = tracedRunner(/FROM orders[\s\S]*FOR UPDATE/iu);
      const second = fulfillmentRepository(blocked.runner).handoff(
        fulfillmentCommand(order),
      );
      const blockedPid = await blocked.lockAttempted.promise;
      expect(blockedPid).not.toBe(await paused.backendPid.promise);
      await expectBlocked(blockedPid);
      paused.releaseCommit.resolve();

      const settled = await Promise.allSettled([first, second]);
      expect(settled.map((result) => result.status)).toEqual([
        "fulfilled",
        "fulfilled",
      ]);
      expect(settled.flatMap((result) =>
        result.status === "fulfilled" ? [result.value.status] : [],
      ).toSorted()).toEqual([
        "already_handed_off",
        "handed_off",
      ]);
      const stored = await pool.query<{
        releases: number;
        minimumVersion: number;
        maximumVersion: number;
        consumes: number;
        effects: number;
        audits: number;
      }>(
        `SELECT
           (SELECT count(*)::int FROM fulfillment_releases
            WHERE order_id = $1::uuid) AS releases,
           (SELECT min(version)::int FROM fulfillment_releases
            WHERE order_id = $1::uuid) AS "minimumVersion",
           (SELECT max(version)::int FROM fulfillment_releases
            WHERE order_id = $1::uuid) AS "maximumVersion",
           (SELECT count(*)::int FROM inventory_events
            WHERE order_id = $1::uuid AND event_type = 'consume') AS consumes,
           (SELECT count(*)::int FROM downstream_effects
            WHERE order_id = $1::uuid AND effect_type = 'fulfillment_handed_off') AS effects,
           (SELECT count(*)::int FROM admin_audit
            WHERE resource_id = $1::text AND action = 'fulfillment.handed_off') AS audits`,
        [order.order],
      );
      expect(stored.rows[0]).toEqual({
        releases: 1,
        minimumVersion: 1,
        maximumVersion: 1,
        consumes: 1,
        effects: 1,
        audits: 1,
      });
    } finally {
      await cleanupFixture(data);
    }
  });

  it("serializes a restrictive signed event against both handoff and clear-hold", async () => {
    for (const action of ["handoff", "clear"] as const) {
      const data = fixture(`signed-restriction-${action}`);
      const order = data.orders[0]!;
      await cleanupFixture(data);
      await seedFixture(data);
      try {
        if (action === "clear") {
          await pool.query(
            `UPDATE orders SET state = 'paid_on_hold' WHERE id = $1::uuid`,
            [order.order],
          );
        }
        const normalization = normalizedDispute(
          order,
          `signed-restriction-${action}`,
        );
        const paused = pausedProviderEventRunner();
        const signed = processSignedEvent(
          normalization,
          `signed-restriction-${action}`,
          paused.runner,
        );
        await paused.callbackFinished.promise;

        const blocked = tracedRunner(/FROM orders[\s\S]*FOR UPDATE/iu);
        const fulfillment = action === "handoff"
          ? fulfillmentRepository(blocked.runner).handoff(
              fulfillmentCommand(order),
            )
          : fulfillmentRepository(blocked.runner).clearHold(
              fulfillmentCommand(order),
            );
        const blockedPid = await blocked.lockAttempted.promise;
        expect(blockedPid).not.toBe(await paused.backendPid.promise);
        await expectBlocked(blockedPid);
        paused.releaseCommit.resolve();

        const settled = await Promise.allSettled([signed, fulfillment]);
        expect(settled[0]).toMatchObject({
          status: "fulfilled",
          value: { result: { status: "processed" } },
        });
        expect(settled[1]).toMatchObject({
          status: "fulfilled",
          value: action === "handoff"
            ? { status: "held", reasons: expect.arrayContaining(["payment_disputed"]) }
            : { status: "denied", reasons: expect.arrayContaining(["payment_disputed"]) },
        });
        const stored = await pool.query<{
          state: string;
          disputeJournals: number;
          releases: number;
          consumes: number;
          handoffEffects: number;
        }>(
          `SELECT state,
             (SELECT count(*)::int FROM payment_events
              WHERE order_id = $1::uuid AND event_type = 'dispute_recorded') AS "disputeJournals",
             (SELECT count(*)::int FROM fulfillment_releases
              WHERE order_id = $1::uuid) AS releases,
             (SELECT count(*)::int FROM inventory_events
              WHERE order_id = $1::uuid AND event_type = 'consume') AS consumes,
             (SELECT count(*)::int FROM downstream_effects
              WHERE order_id = $1::uuid AND effect_type = 'fulfillment_handed_off') AS "handoffEffects"
           FROM orders WHERE id = $1::uuid`,
          [order.order],
        );
        expect(stored.rows[0]).toEqual({
          state: "paid_on_hold",
          disputeJournals: 1,
          releases: 0,
          consumes: 0,
          handoffEffects: 0,
        });
      } finally {
        await cleanupFixture(data);
      }
    }
  });

  it("serializes buyer block, product retirement, destination supersession, and lot recall against handoff", async () => {
    const lanes = [
      {
        label: "buyer-block",
        lockPattern: /FROM buyer_profiles[\s\S]*FOR UPDATE/iu,
        mutate: async (client: PoolClient, data: GuardFixture) => {
          await client.query(
            `UPDATE buyer_profiles SET status = 'blocked'
             WHERE user_id = $1::uuid`,
            [data.orders[0]!.buyer],
          );
        },
      },
      {
        label: "product-retirement",
        lockPattern: /FROM products p[\s\S]*ORDER BY p\.id FOR UPDATE/iu,
        mutate: async (client: PoolClient, data: GuardFixture) => {
          await client.query(
            `UPDATE products SET status = 'retired' WHERE id = $1::uuid`,
            [data.product],
          );
        },
      },
      {
        label: "destination-supersession",
        lockPattern: /FROM destination_policies[\s\S]*FOR UPDATE/iu,
        mutate: async (client: PoolClient, data: GuardFixture) => {
          await client.query(
            `UPDATE destination_policies
             SET active = false, superseded_at = $2::timestamptz
             WHERE id = $1::uuid`,
            [data.policy, now],
          );
          await client.query(
            `INSERT INTO destination_policies
               (id, scope_kind, product_id, state_code, result, version,
                active, effective_at)
             VALUES ($1::uuid, 'product', $2::uuid, 'CA', 'blocked', 2,
                     true, $3::timestamptz)`,
            [keyedUuid(`${data.scope}:superseding-policy`), data.product, now],
          );
        },
      },
      {
        label: "lot-recall",
        lockPattern: /FROM lots[\s\S]*FOR UPDATE/iu,
        mutate: async (client: PoolClient, data: GuardFixture) => {
          await client.query(
            `UPDATE lots SET status = 'recalled' WHERE id = $1::uuid`,
            [data.lot],
          );
        },
      },
    ] as const;

    for (const lane of lanes) {
      const data = fixture(`fact-race-${lane.label}`);
      const order = data.orders[0]!;
      await cleanupFixture(data);
      await seedFixture(data);
      const mutationLocked = deferred<number>();
      const releaseMutation = deferred<void>();
      emergencyReleases.add(() => releaseMutation.resolve());
      try {
        const mutation = withLockedMutation(
          (client) => lane.mutate(client, data),
          mutationLocked,
          releaseMutation,
        );
        const mutationPid = await mutationLocked.promise;
        const blocked = tracedRunner(lane.lockPattern);
        const handoff = fulfillmentRepository(blocked.runner).handoff(
          fulfillmentCommand(order),
        );
        const handoffPid = await blocked.lockAttempted.promise;
        expect(handoffPid).not.toBe(mutationPid);
        await expectBlocked(handoffPid);
        releaseMutation.resolve();

        const settled = await Promise.allSettled([mutation, handoff]);
        expect(settled).toMatchObject([
          { status: "fulfilled", value: undefined },
          { status: "fulfilled", value: { status: "held" } },
        ]);
        const invariant = await pool.query<{
          orderState: string;
          releases: number;
          consumes: number;
          effects: number;
        }>(
          `SELECT state AS "orderState",
             (SELECT count(*)::int FROM fulfillment_releases
              WHERE order_id = $1::uuid) AS releases,
             (SELECT count(*)::int FROM inventory_events
              WHERE order_id = $1::uuid AND event_type = 'consume') AS consumes,
             (SELECT count(*)::int FROM downstream_effects
              WHERE order_id = $1::uuid AND effect_type = 'fulfillment_handed_off') AS effects
           FROM orders WHERE id = $1::uuid`,
          [order.order],
        );
        expect(invariant.rows[0]).toEqual({
          orderState: "paid_on_hold",
          releases: 0,
          consumes: 0,
          effects: 0,
        });
      } finally {
        releaseMutation.resolve();
        await cleanupFixture(data);
      }
    }
  });

  it("completes two orders sharing a lot through canonical locks with no partial consume", async () => {
    const data = fixture("overlapping-lot", 2);
    const [left, right] = data.orders;
    await cleanupFixture(data);
    await seedFixture(data);
    try {
      const paused = pausedFirstRunner();
      const leftHandoff = fulfillmentRepository(paused.runner).handoff(
        fulfillmentCommand(left!),
      );
      await paused.callbackFinished.promise;

      const trace: string[] = [];
      const blocked = tracedRunner(
        /FROM products p[\s\S]*ORDER BY p\.id FOR UPDATE/iu,
      );
      const rightHandoff = fulfillmentRepository(blocked.runner, trace).handoff(
        fulfillmentCommand(right!),
      );
      const rightPid = await blocked.lockAttempted.promise;
      expect(rightPid).not.toBe(await paused.backendPid.promise);
      await expectBlocked(rightPid);
      paused.releaseCommit.resolve();

      const settled = await Promise.allSettled([leftHandoff, rightHandoff]);
      expect(settled).toMatchObject([
        { status: "fulfilled", value: { status: "handed_off" } },
        { status: "fulfilled", value: { status: "handed_off" } },
      ]);
      expect(
        trace.some((sql) => /FROM lots[\s\S]*ORDER BY id FOR UPDATE/iu.test(sql)),
      ).toBe(true);
      const invariant = await pool.query<{
        releases: number;
        consumedReservations: number;
        consumes: number;
        effects: number;
        available: number;
      }>(
        `SELECT
           (SELECT count(*)::int FROM fulfillment_releases
            WHERE order_id = ANY($1::uuid[]) AND state = 'consumed') AS releases,
           (SELECT count(*)::int FROM inventory_reservations
            WHERE order_id = ANY($1::uuid[]) AND state = 'consumed'
              AND quantity_remaining = 0) AS "consumedReservations",
           (SELECT count(*)::int FROM inventory_events
            WHERE order_id = ANY($1::uuid[]) AND event_type = 'consume') AS consumes,
           (SELECT count(*)::int FROM downstream_effects
            WHERE order_id = ANY($1::uuid[])
              AND effect_type = 'fulfillment_handed_off') AS effects,
           (SELECT available_quantity::int FROM lots WHERE id = $2::uuid) AS available`,
        [data.orders.map((row) => row.order), data.lot],
      );
      expect(invariant.rows[0]).toEqual({
        releases: 2,
        consumedReservations: 2,
        consumes: 2,
        effects: 2,
        available: 0,
      });
    } finally {
      await cleanupFixture(data);
    }
  });

  it("serializes delivery against exception and keeps delivery terminal", async () => {
    const data = fixture("delivery-exception");
    const order = data.orders[0]!;
    await cleanupFixture(data);
    await seedFixture(data);
    const paused = pausedFirstRunner();
    const pending: Promise<unknown>[] = [];
    try {
      await expect(
        fulfillmentRepository().handoff(fulfillmentCommand(order)),
      ).resolves.toEqual({ status: "handed_off" });

      const delivery = fulfillmentRepository(paused.runner).transitionShipment({
        ...fulfillmentCommand(order),
        action: "deliver",
      });
      pending.push(delivery);
      await paused.callbackFinished.promise;

      const blocked = tracedRunner(/FROM shipments[\s\S]*FOR UPDATE/iu);
      const exception = fulfillmentRepository(blocked.runner).transitionShipment({
        ...fulfillmentCommand(order),
        action: "record_exception",
      });
      pending.push(exception);
      const exceptionPid = await blocked.lockAttempted.promise;
      expect(exceptionPid).not.toBe(await paused.backendPid.promise);
      await expectBlocked(exceptionPid);
      paused.releaseCommit.resolve();

      const settled = await Promise.allSettled([delivery, exception]);
      expect(settled).toMatchObject([
        { status: "fulfilled", value: { status: "delivered" } },
        { status: "fulfilled", value: { status: "conflict" } },
      ]);
      const stored = await pool.query<{
        shipmentState: string;
        releaseCount: number;
        consumeCount: number;
        handoffEffectCount: number;
        deliveredAudits: number;
        exceptionAudits: number;
      }>(
        `SELECT
           (SELECT state FROM shipments WHERE order_id = $1::uuid) AS "shipmentState",
           (SELECT count(*)::int FROM fulfillment_releases
            WHERE order_id = $1::uuid AND state = 'consumed') AS "releaseCount",
           (SELECT count(*)::int FROM inventory_events
            WHERE order_id = $1::uuid AND event_type = 'consume') AS "consumeCount",
           (SELECT count(*)::int FROM downstream_effects
            WHERE order_id = $1::uuid
              AND effect_type = 'fulfillment_handed_off') AS "handoffEffectCount",
           (SELECT count(*)::int FROM admin_audit
            WHERE resource_id = $1::text
              AND action = 'shipment.delivered') AS "deliveredAudits",
           (SELECT count(*)::int FROM admin_audit
            WHERE resource_id = $1::text
              AND action = 'shipment.exception.recorded') AS "exceptionAudits"`,
        [order.order],
      );
      expect(stored.rows[0]).toEqual({
        shipmentState: "delivered",
        releaseCount: 1,
        consumeCount: 1,
        handoffEffectCount: 1,
        deliveredAudits: 1,
        exceptionAudits: 0,
      });
    } finally {
      paused.releaseCommit.resolve();
      await Promise.allSettled(pending);
      await cleanupFixture(data);
    }
  });

  it("makes a signed terminal refund event win against provider-result CAS without duplicate money", async () => {
    const data = fixture("signed-refund-result-cas");
    const order = data.orders[0]!;
    const label = "signed-refund-result-cas";
    const providerRefundId = `re_${suiteScope}_${label}`;
    const providerStarted = deferred<void>();
    const releaseProviderResult = deferred<void>();
    emergencyReleases.add(() => releaseProviderResult.resolve());
    await cleanupFixture(data);
    await seedFixture(data);
    let submission: Promise<unknown> | null = null;
    try {
      const refundId = await seedRequestedRefund(order, label);
      const adapter = fakeStripeProvider({
        createRefund: async () => {
          providerStarted.resolve();
          await releaseProviderResult.promise;
          return {
            status: "normalized",
            refund: {
              provider: "stripe",
              providerRefundId,
              paymentIntentId: order.paymentIntentId,
              chargeId: `ch_${suiteScope}_${label}`,
              amount: 500,
              currency: "usd",
              status: "succeeded",
              livemode: false,
            },
          };
        },
      });
      const context = await refundProviderContext(order, adapter);
      submission = submitOrRecoverRefund({
        repository: refundRepository(),
        providerContext: context,
        actorUserId: order.staff,
        refundId,
        now,
        authorize: async () => ({
          actorUserId: order.staff,
          actorClerkUserId: order.staffClerkId,
        }),
      });
      void submission.then(
        () => providerStarted.reject(
          new Error("refund submission completed before its provider call"),
        ),
        (error) => providerStarted.reject(error),
      );
      await providerStarted.promise;

      const signed = await processSignedEvent(
        normalizedRefund(order, refundId, providerRefundId, label),
        label,
      );
      expect(signed.result).toEqual({ status: "processed" });
      const beforeProviderResult = await pool.query<{
        status: string;
        providerRefundId: string | null;
        journals: number;
        effects: number;
      }>(
        `SELECT status, provider_refund_id AS "providerRefundId",
           (SELECT count(*)::int FROM payment_events
            WHERE order_id = $2::uuid
              AND event_type = 'refund_verified') AS journals,
           (SELECT count(*)::int FROM downstream_effects
            WHERE order_id = $2::uuid
              AND effect_type = 'refund_verified') AS effects
         FROM refunds WHERE id = $1::uuid`,
        [refundId, order.order],
      );
      expect(beforeProviderResult.rows[0]).toEqual({
        status: "succeeded",
        providerRefundId,
        journals: 1,
        effects: 1,
      });

      releaseProviderResult.resolve();
      await expect(submission).resolves.toEqual({
        status: "terminal",
        refundStatus: "succeeded",
      });
      expect(adapter.createRefund).toHaveBeenCalledTimes(1);
      const final = await pool.query<{
        refunds: number;
        confirmedMinor: number;
        journals: number;
        effects: number;
        inboxStatus: string;
      }>(
        `SELECT
           (SELECT count(*)::int FROM refunds
            WHERE order_id = $1::uuid AND status = 'succeeded') AS refunds,
           (SELECT coalesce(sum(confirmed_amount_minor), 0)::int FROM refunds
            WHERE order_id = $1::uuid AND status = 'succeeded') AS "confirmedMinor",
           (SELECT count(*)::int FROM payment_events
            WHERE order_id = $1::uuid
              AND event_type = 'refund_verified') AS journals,
           (SELECT count(*)::int FROM downstream_effects
            WHERE order_id = $1::uuid
              AND effect_type = 'refund_verified') AS effects,
           (SELECT status FROM provider_events
            WHERE id = $2::uuid) AS "inboxStatus"`,
        [order.order, signed.databaseEventId],
      );
      expect(final.rows[0]).toEqual({
        refunds: 1,
        confirmedMinor: 500,
        journals: 1,
        effects: 1,
        inboxStatus: "processed",
      });
    } finally {
      releaseProviderResult.resolve();
      if (submission !== null) await Promise.allSettled([submission]);
      await cleanupFixture(data);
    }
  });

  it("traces the full canonical lock order and bounds 40001 then 40P01 retries", async () => {
    const data = fixture("canonical-lock-retry");
    const order = data.orders[0]!;
    await cleanupFixture(data);
    await seedFixture(data);
    try {
      const reviewId = await seedBuyerReview(data, order);
      const trace: Array<{
        sql: string;
        params: readonly unknown[];
      }> = [];
      const sleeps: Array<readonly [number, string]> = [];
      let attempts = 0;
      const runner: FulfillmentTransactionRunner = async (work) => {
        attempts += 1;
        if (attempts <= 2) {
          throw Object.assign(
            new Error("synthetic guarded serializable retry"),
            { code: attempts === 1 ? "40001" : "40P01" },
          );
        }
        return runSerializable((client) => work({
          async query<Row extends object>(
            sql: string,
            params: readonly unknown[] = [],
          ) {
            trace.push({ sql, params: Object.freeze([...params]) });
            return client.query<Row>(sql, params);
          },
        }));
      };
      const repository = createFulfillmentRepository({
        runSerializableTransaction: runner,
        sha256,
        keyedUuid,
        retrySleep: async (retryNumber, sqlState) => {
          sleeps.push([retryNumber, sqlState]);
        },
      });

      await expect(repository.handoff(fulfillmentCommand(order))).resolves.toEqual({
        status: "handed_off",
      });
      expect(attempts).toBe(3);
      expect(sleeps).toEqual([
        [1, "40001"],
        [2, "40P01"],
      ]);

      const lockIndex = (pattern: RegExp): number => {
        const index = trace.findIndex((entry) => pattern.test(entry.sql));
        expect(index).toBeGreaterThanOrEqual(0);
        return index;
      };
      const canonicalIndices = [
        lockIndex(/FROM users[\s\S]*ORDER BY id FOR UPDATE/iu),
        lockIndex(/FROM buyer_profiles[\s\S]*ORDER BY user_id FOR UPDATE/iu),
        lockIndex(/FROM staff_roles[\s\S]*ORDER BY capability, id FOR UPDATE/iu),
        lockIndex(/FROM attestation_acceptances aa[\s\S]*FOR UPDATE OF aa, av/iu),
        lockIndex(/FROM checkout_attempts[\s\S]*FOR UPDATE/iu),
        lockIndex(/FROM orders[\s\S]*FOR UPDATE/iu),
        lockIndex(/FROM review_requests[\s\S]*FOR UPDATE/iu),
        lockIndex(/FROM review_request_destination_policies[\s\S]*FOR UPDATE/iu),
        lockIndex(/FROM payment_events payment[\s\S]*FOR UPDATE OF payment/iu),
        lockIndex(/FROM refunds refund[\s\S]*FOR UPDATE OF refund/iu),
        lockIndex(/FROM shipments[\s\S]*FOR UPDATE/iu),
        lockIndex(/FROM fulfillment_releases[\s\S]*ORDER BY version FOR UPDATE/iu),
        lockIndex(/FROM order_items oi[\s\S]*ORDER BY oi\.id FOR UPDATE/iu),
        lockIndex(/FROM products p[\s\S]*ORDER BY p\.id FOR UPDATE/iu),
        lockIndex(/FROM product_policy_groups pg[\s\S]*ORDER BY pg\.id FOR UPDATE/iu),
        lockIndex(/FROM order_shipping_addresses[\s\S]*FOR UPDATE/iu),
        lockIndex(/FROM order_promotion_applications[\s\S]*FOR UPDATE/iu),
        lockIndex(/FROM destination_policies[\s\S]*FOR UPDATE/iu),
        lockIndex(/FROM inventory_reservations[\s\S]*ORDER BY id FOR UPDATE/iu),
        lockIndex(/FROM lots[\s\S]*ORDER BY id FOR UPDATE/iu),
      ];
      for (let index = 1; index < canonicalIndices.length; index += 1) {
        expect(canonicalIndices[index]).toBeGreaterThan(
          canonicalIndices[index - 1]!,
        );
      }

      const userLock = trace[canonicalIndices[0]!]!;
      const profileLock = trace[canonicalIndices[1]!]!;
      const sortedActorBuyer = [order.staff, order.buyer].toSorted();
      expect(userLock.params).toEqual(sortedActorBuyer);
      expect(profileLock.params).toEqual(sortedActorBuyer);
      expect(trace[canonicalIndices[2]!]!.params).toEqual([order.staff]);
      const release = await pool.query<{
        reviewRequestId: string | null;
        version: number;
      }>(
        `SELECT review_request_id::text AS "reviewRequestId", version::int
         FROM fulfillment_releases WHERE order_id = $1::uuid`,
        [order.order],
      );
      expect(release.rows).toEqual([{ reviewRequestId: reviewId, version: 1 }]);
    } finally {
      await cleanupFixture(data);
    }
  });
});
