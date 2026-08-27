import { createHash } from "node:crypto";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { normalizeStripeProviderEventV1 } from "@/commerce/provider-events";
import { createProviderEventAuthorityV1 } from "@/commerce/stripe-webhook-verifier";
import { parseServerEnv } from "@/config/env-schema";
import type { ProcessableProviderEventNormalizationV1 } from "@/db/repositories/provider-event-repository";
import {
  createProviderEventRepository,
  createProviderEventTransactionRunner,
} from "@/db/repositories/provider-event-repository";

import { resolveTestDatabase } from "../integration/helpers/database";

// The guard validates explicit isolated credentials before Pool construction.
// This file is excluded from every ordinary unit/PGlite lane.
const target = resolveTestDatabase(process.env);
const pool = new Pool({ connectionString: target.url, max: 8 });
const scope = `provider-event-6e-${process.pid}`;
const providerCreated = 1_787_659_200;
const receivedAt = new Date("2026-08-25T12:00:00.000Z");
const processAt = new Date("2026-08-25T12:00:30.000Z");
const sides = ["left", "right"] as const;
type Side = (typeof sides)[number];

function keyedUuid(label: string): string {
  const hex = createHash("sha256").update(`${scope}:${label}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const fixture = Object.freeze({
  buyers: Object.freeze(sides.map((side) => keyedUuid(`buyer:${side}`))),
  acceptances: Object.freeze(sides.map((side) => keyedUuid(`acceptance:${side}`))),
  orders: Object.freeze(sides.map((side) => keyedUuid(`order:${side}`))),
  items: Object.freeze(sides.map((side) => keyedUuid(`item:${side}`))),
  attempts: Object.freeze(sides.map((side) => keyedUuid(`attempt:${side}`))),
  reservations: Object.freeze(sides.map((side) => keyedUuid(`reservation:${side}`))),
  idempotencyKeys: Object.freeze(sides.map((side) => keyedUuid(`checkout-key:${side}`))),
  attestation: keyedUuid("attestation"),
  group: keyedUuid("group"),
  product: keyedUuid("product"),
  price: keyedUuid("price"),
  policy: keyedUuid("policy"),
  lot: keyedUuid("lot"),
});

function sideIndex(side: Side): 0 | 1 {
  return side === "left" ? 0 : 1;
}

function sideFixture(side: Side) {
  const index = sideIndex(side);
  return Object.freeze({
    buyer: fixture.buyers[index]!,
    acceptance: fixture.acceptances[index]!,
    order: fixture.orders[index]!,
    item: fixture.items[index]!,
    attempt: fixture.attempts[index]!,
    reservation: fixture.reservations[index]!,
    idempotencyKey: fixture.idempotencyKeys[index]!,
  });
}

const runProviderEventTransaction = createProviderEventTransactionRunner(
  async () => {
    const client = await pool.connect();
    return {
      query: async (sql: string, params: readonly unknown[] = []) => {
        const queried = await client.query(sql, [...params]);
        return { rows: queried.rows };
      },
      release: (destroy = false) => client.release(destroy),
    };
  },
);

function repository() {
  return createProviderEventRepository({
    runSerializableTransaction: runProviderEventTransaction,
    keyedUuid,
  });
}

function authority() {
  const result = createProviderEventAuthorityV1(parseServerEnv({
    APP_ENV: "local",
    PAYMENTS_MODE: "test",
    STRIPE_ACCOUNT_ID: "acct_synthetic_guarded",
    STRIPE_SECRET_KEY: "sk_test_synthetic_guarded",
    STRIPE_WEBHOOK_SECRET: "whsec_synthetic_guarded",
  }));
  if (result === null) throw new Error("missing guarded synthetic authority");
  return result;
}

function ignoredNormalization() {
  const result = normalizeStripeProviderEventV1({
    id: `evt_${scope}_claim`,
    type: "customer.created",
    created: providerCreated,
    livemode: false,
    data: { object: { id: `cus_${scope}` } },
  });
  if (result.status !== "normalized") {
    throw new Error("guarded provider event fixture did not normalize");
  }
  return result;
}
const normalizedIgnored = ignoredNormalization();

function checkoutNormalization(side: Side, lane: string, paymentIntentId: string) {
  const data = sideFixture(side);
  const result = normalizeStripeProviderEventV1({
    id: `evt_${scope}_${lane}_${side}`,
    type: "checkout.session.completed",
    created: providerCreated,
    livemode: false,
    data: {
      object: {
        id: `cs_${scope}_${lane}_${side}`,
        client_reference_id: data.order,
        metadata: { orderId: data.order, attemptId: data.attempt },
        payment_intent: paymentIntentId,
        amount_total: 2_380,
        currency: "usd",
        payment_status: "paid",
        status: "complete",
        livemode: false,
      },
    },
  });
  if (result.status !== "normalized") throw new Error("invalid guarded checkout event");
  return result;
}

function refundNormalization(
  side: Side,
  lane: string,
  paymentIntentId: string,
  providerRefundId: string,
  amountMinor = 500,
) {
  const result = normalizeStripeProviderEventV1({
    id: `evt_${scope}_${lane}_${side}`,
    type: "refund.updated",
    created: providerCreated,
    livemode: false,
    data: {
      object: {
        id: providerRefundId,
        metadata: {},
        payment_intent: paymentIntentId,
        charge: `ch_${scope}_${side}`,
        amount: amountMinor,
        currency: "usd",
        status: "succeeded",
      },
    },
  });
  if (result.status !== "normalized") throw new Error("invalid guarded refund event");
  return result;
}

function disputeNormalization(
  side: Side,
  lane: string,
  paymentIntentId: string,
  disputeId: string,
) {
  const result = normalizeStripeProviderEventV1({
    id: `evt_${scope}_${lane}_${side}`,
    type: "charge.dispute.updated",
    created: providerCreated,
    livemode: false,
    data: {
      object: {
        id: disputeId,
        payment_intent: paymentIntentId,
        charge: `ch_${scope}_${side}`,
        amount: 500,
        currency: "usd",
        status: "needs_response",
        livemode: false,
      },
    },
  });
  if (result.status !== "normalized") throw new Error("invalid guarded dispute event");
  return result;
}

function registration(
  lane: string,
  normalization: ProcessableProviderEventNormalizationV1 = normalizedIgnored,
  claimAt = receivedAt,
) {
  return {
    provider: "stripe" as const,
    databaseEventId: keyedUuid(`database-event:${lane}`),
    conflictAuditId: keyedUuid(`registration-audit:${lane}`),
    payloadHash: createHash("sha256")
      .update(JSON.stringify(normalization), "utf8")
      .digest("hex"),
    normalization,
    receivedAt,
    claimAt,
    leaseToken: `lease_${scope}_${lane}`,
    leaseExpiresAt: new Date(claimAt.getTime() + 60_000),
  };
}

async function claim(
  repo: ReturnType<typeof repository>,
  lane: string,
  normalization: ProcessableProviderEventNormalizationV1,
) {
  const input = registration(lane, normalization);
  const result = await repo.registerAndClaim(input);
  if (result.status !== "claimed") throw new Error("expected guarded provider event claim");
  return Object.freeze({
    claim: result.claim,
    databaseEventId: input.databaseEventId,
  });
}

function winnerAndLoser(
  results: readonly Readonly<{ status: string }>[],
): Readonly<{ winner: Side; loser: Side }> {
  expect(results.map((result) => result.status).toSorted()).toEqual([
    "conflict",
    "processed",
  ]);
  const winnerIndex = results.findIndex((result) => result.status === "processed");
  if (winnerIndex !== 0 && winnerIndex !== 1) throw new Error("missing concurrency winner");
  return Object.freeze({
    winner: sides[winnerIndex]!,
    loser: sides[winnerIndex === 0 ? 1 : 0]!,
  });
}

async function cleanupFixture(): Promise<void> {
  const orderIds = [...fixture.orders];
  const buyerIds = [...fixture.buyers];
  const eventPrefix = `evt_${scope}%`;
  await pool.query(
    `DELETE FROM admin_audit
     WHERE service_identity = 'commerce.provider_event'
       AND (
         resource_id = ANY($1::text[])
         OR resource_id IN (
           SELECT id::text FROM provider_events WHERE provider_event_id LIKE $2
         )
         OR correlation_id IN (
           SELECT id::text FROM provider_events WHERE provider_event_id LIKE $2
         )
       )`,
    [orderIds, eventPrefix],
  );
  await pool.query(
    `DELETE FROM downstream_effects
     WHERE order_id = ANY($1::uuid[])
        OR provider_event_id IN (
          SELECT id FROM provider_events WHERE provider_event_id LIKE $2
        )`,
    [orderIds, eventPrefix],
  );
  await pool.query(`DELETE FROM refunds WHERE order_id = ANY($1::uuid[])`, [orderIds]);
  await pool.query(`DELETE FROM payment_events WHERE order_id = ANY($1::uuid[])`, [orderIds]);
  await pool.query(`DELETE FROM provider_events WHERE provider_event_id LIKE $1`, [eventPrefix]);
  await pool.query(`DELETE FROM inventory_events WHERE order_id = ANY($1::uuid[])`, [orderIds]);
  await pool.query(`DELETE FROM inventory_reservations WHERE order_id = ANY($1::uuid[])`, [orderIds]);
  await pool.query(`DELETE FROM checkout_attempts WHERE order_id = ANY($1::uuid[])`, [orderIds]);
  await pool.query(`DELETE FROM order_shipping_addresses WHERE order_id = ANY($1::uuid[])`, [orderIds]);
  await pool.query(`DELETE FROM order_items WHERE order_id = ANY($1::uuid[])`, [orderIds]);
  await pool.query(`DELETE FROM orders WHERE id = ANY($1::uuid[])`, [orderIds]);
  await pool.query(`DELETE FROM destination_policies WHERE id = $1::uuid`, [fixture.policy]);
  await pool.query(`DELETE FROM lots WHERE id = $1::uuid`, [fixture.lot]);
  await pool.query(`DELETE FROM product_prices WHERE id = $1::uuid`, [fixture.price]);
  await pool.query(`DELETE FROM products WHERE id = $1::uuid`, [fixture.product]);
  await pool.query(`DELETE FROM product_policy_groups WHERE id = $1::uuid`, [fixture.group]);
  await pool.query(`DELETE FROM attestation_acceptances WHERE user_id = ANY($1::uuid[])`, [buyerIds]);
  await pool.query(`DELETE FROM attestation_versions WHERE id = $1::uuid`, [fixture.attestation]);
  await pool.query(`DELETE FROM buyer_profiles WHERE user_id = ANY($1::uuid[])`, [buyerIds]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [buyerIds]);
}

async function seedBusinessFixture(): Promise<void> {
  const left = sideFixture("left");
  const right = sideFixture("right");
  await pool.query(
    `INSERT INTO users (id, clerk_id, email_verified_at)
     VALUES ($1::uuid, $3, $5::timestamptz),
            ($2::uuid, $4, $5::timestamptz)`,
    [left.buyer, right.buyer, `clerk-${scope}-left`, `clerk-${scope}-right`, receivedAt],
  );
  await pool.query(
    `INSERT INTO buyer_profiles (user_id, status, age_confirmed_at, research_purpose)
     VALUES ($1::uuid, 'active', $3::timestamptz, 'analytical'),
            ($2::uuid, 'active', $3::timestamptz, 'analytical')`,
    [left.buyer, right.buyer, receivedAt],
  );
  await pool.query(
    `INSERT INTO attestation_versions
       (id, version, content_hash, policy_text, effective_at)
     VALUES ($1::uuid, 1, $2, 'Synthetic guarded contention policy', $3::timestamptz)`,
    [fixture.attestation, "a".repeat(64), receivedAt],
  );
  await pool.query(
    `INSERT INTO attestation_acceptances
       (id, user_id, attestation_version_id, accepted_at)
     VALUES ($1::uuid, $3::uuid, $5::uuid, $6::timestamptz),
            ($2::uuid, $4::uuid, $5::uuid, $6::timestamptz)`,
    [left.acceptance, right.acceptance, left.buyer, right.buyer, fixture.attestation, receivedAt],
  );
  await pool.query(
    `INSERT INTO product_policy_groups (id, slug, name, active)
     VALUES ($1::uuid, $2, 'Synthetic guarded provider-event group', true)`,
    [fixture.group, `pg-${scope}`],
  );
  await pool.query(
    `INSERT INTO products
       (id, slug, name, package_form, material_identity, policy_group_id, status)
     VALUES ($1::uuid, $2, 'Synthetic guarded product', 'sealed vial',
             'Synthetic guarded identity', $3::uuid, 'active')`,
    [fixture.product, `product-${scope}`, fixture.group],
  );
  await pool.query(
    `INSERT INTO product_prices
       (id, product_id, version, amount_minor, currency, effective_at)
     VALUES ($1::uuid, $2::uuid, 1, 2000, 'USD', $3::timestamptz)`,
    [fixture.price, fixture.product, receivedAt],
  );
  await pool.query(
    `INSERT INTO destination_policies
       (id, scope_kind, product_id, state_code, result, version, active, effective_at)
     VALUES ($1::uuid, 'product', $2::uuid, 'CA', 'allowed', 1, true, $3::timestamptz)`,
    [fixture.policy, fixture.product, receivedAt],
  );
  await pool.query(
    `INSERT INTO lots
       (id, product_id, supplier_name, supplier_lot_code,
        received_quantity, available_quantity, status)
     VALUES ($1::uuid, $2::uuid, 'Synthetic guarded supplier', $3, 10, 8, 'released')`,
    [fixture.lot, fixture.product, `${scope}-LOT`],
  );
  await pool.query(
    `INSERT INTO orders
       (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
        destination_state_code, currency, subtotal_minor, discount_minor,
        tax_minor, shipping_minor, total_minor, state)
     VALUES ($1::uuid, $3::uuid, 'active', $5::uuid, 'CA', 'USD', 2000, 0,
             180, 200, 2380, 'checkout_pending'),
            ($2::uuid, $4::uuid, 'active', $6::uuid, 'CA', 'USD', 2000, 0,
             180, 200, 2380, 'checkout_pending')`,
    [left.order, right.order, left.buyer, right.buyer, left.acceptance, right.acceptance],
  );
  await pool.query(
    `INSERT INTO order_items
       (id, order_id, product_id, product_price_id, destination_policy_id,
        product_name_snapshot, package_form_snapshot, currency,
        unit_amount_minor, quantity, subtotal_minor, discount_minor, total_minor)
     VALUES ($1::uuid, $3::uuid, $5::uuid, $6::uuid, $7::uuid,
             'Synthetic guarded product', 'sealed vial', 'USD', 2000, 1, 2000, 0, 2000),
            ($2::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid,
             'Synthetic guarded product', 'sealed vial', 'USD', 2000, 1, 2000, 0, 2000)`,
    [left.item, right.item, left.order, right.order, fixture.product, fixture.price, fixture.policy],
  );
  await pool.query(
    `INSERT INTO order_shipping_addresses
       (order_id, recipient_name, address_line1, city, state_code, postal_code, country)
     VALUES ($1::uuid, 'Synthetic Left', '100 Test Way', 'Los Angeles', 'CA', '90001', 'US'),
            ($2::uuid, 'Synthetic Right', '200 Test Way', 'Los Angeles', 'CA', '90002', 'US')`,
    [left.order, right.order],
  );
  await pool.query(
    `INSERT INTO checkout_attempts
       (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
        account_gate, attestation_gate, product_gate, destination_gate,
        inventory_gate, payment_provider_gate, permitted, review_required,
        tax_ready, shipping_ready, tax_quote_reference, shipping_quote_reference,
        shipping_service, provider, provider_request_id, provider_request_hash,
        expires_at, provider_customer_email, provider_origin,
        provider_request_schema_version, provider_livemode, provider_scope, created_at)
     VALUES ($1::uuid, $3::uuid, $5::uuid, $7, $9, 'created',
             'pass', 'pass', 'pass', 'pass', 'pass', 'pass', true, false,
             true, true, 'tax_guarded', 'ship_guarded', 'Synthetic Ground',
             'stripe', $11, $10, $12::timestamptz, 'left@example.test',
             'https://commerce.synthetic.example', 1, false,
             'stripe:acct_synthetic_guarded', $13::timestamptz),
            ($2::uuid, $4::uuid, $6::uuid, $8, $9, 'created',
             'pass', 'pass', 'pass', 'pass', 'pass', 'pass', true, false,
             true, true, 'tax_guarded', 'ship_guarded', 'Synthetic Ground',
             'stripe', $14, $10, $12::timestamptz, 'right@example.test',
             'https://commerce.synthetic.example', 1, false,
             'stripe:acct_synthetic_guarded', $13::timestamptz)`,
    [
      left.attempt,
      right.attempt,
      left.order,
      right.order,
      left.buyer,
      right.buyer,
      left.idempotencyKey,
      right.idempotencyKey,
      "b".repeat(64),
      "c".repeat(64),
      `checkout_attempt:${left.attempt}`,
      "2026-08-25T20:00:00.000Z",
      "2026-08-25T11:00:00.000Z",
      `checkout_attempt:${right.attempt}`,
    ],
  );
  await pool.query(
    `INSERT INTO inventory_reservations
       (id, checkout_attempt_id, idempotency_key, order_id, order_item_id,
        product_id, lot_id, quantity_reserved, quantity_remaining, state, expires_at)
     VALUES ($1::uuid, $3::uuid, $9, $5::uuid, $7::uuid, $10::uuid, $11::uuid,
             1, 1, 'active', $12::timestamptz),
            ($2::uuid, $4::uuid, $9 || ':right', $6::uuid, $8::uuid,
             $10::uuid, $11::uuid, 1, 1, 'active', $12::timestamptz)`,
    [
      left.reservation,
      right.reservation,
      left.attempt,
      right.attempt,
      left.order,
      right.order,
      left.item,
      right.item,
      `reservation:${scope}`,
      fixture.product,
      fixture.lot,
      "2026-08-25T20:00:00.000Z",
    ],
  );
}

async function seedVerifiedPayment(side: Side, lane: string, paymentIntentId: string) {
  const data = sideFixture(side);
  const normalization = checkoutNormalization(side, `${lane}_source`, paymentIntentId);
  if (normalization.event.kind !== "checkout_session") {
    throw new Error("invalid guarded checkout source event");
  }
  const databaseEventId = keyedUuid(`source-event:${lane}:${side}`);
  const paymentEventId = keyedUuid(`verified-payment:${lane}:${side}`);
  await pool.query(
    `INSERT INTO provider_events
       (id, provider, provider_event_id, payload_hash, status, attempt_count,
        received_at, processed_at, event_type, schema_version,
        normalized_payload, provider_created_at, livemode)
     VALUES ($1::uuid, 'stripe', $2, $3, 'processed', 1, $4, $4,
             $5, 1, $6::jsonb, $7, false)`,
    [
      databaseEventId,
      normalization.event.providerEventId,
      createHash("sha256").update(`source:${scope}:${lane}:${side}`).digest("hex"),
      processAt,
      normalization.event.eventType,
      JSON.stringify(normalization.event),
      normalization.event.providerCreatedAt,
    ],
  );
  await pool.query(
    `INSERT INTO payment_events
       (id, provider_event_id, order_id, event_type, provider_payment_id,
        idempotency_key, amount_minor, currency, occurred_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'payment_verified', $4, $5,
             2380, 'USD', $6)`,
    [
      paymentEventId,
      databaseEventId,
      data.order,
      paymentIntentId,
      `stripe:payment_intent:${paymentIntentId}`,
      normalization.event.providerCreatedAt,
    ],
  );
  await pool.query(
    `UPDATE checkout_attempts
     SET status = 'completed', provider_session_id = $2
     WHERE id = $1::uuid`,
    [data.attempt, normalization.event.sessionId],
  );
  await pool.query(
    `UPDATE orders SET state = 'paid_pending_fulfillment' WHERE id = $1::uuid`,
    [data.order],
  );
}

async function processRace(
  lane: string,
  normalizations: Readonly<Record<Side, ProcessableProviderEventNormalizationV1>>,
) {
  const repo = repository();
  const registered = await Promise.all(sides.map((side) =>
    claim(repo, `${lane}:${side}`, normalizations[side])
  ));
  const results = await Promise.all(registered.map(({ claim: providerClaim }) =>
    repo.processClaim({ claim: providerClaim, authority: authority(), now: processAt })
  ));
  const race = winnerAndLoser(results);
  return Object.freeze({
    ...race,
    winnerEventId: registered[sideIndex(race.winner)]!.databaseEventId,
    loserEventId: registered[sideIndex(race.loser)]!.databaseEventId,
  });
}

describe("guarded PostgreSQL provider event claims and global identity fences", () => {
  beforeAll(async () => {
    const readiness = await pool.query(`
      SELECT to_regclass('public.provider_events') AS provider_events,
             to_regclass('public.downstream_effects') AS downstream_effects,
             to_regclass('public.payment_events') AS payment_events,
             to_regclass('public.refunds') AS refunds,
             to_regclass('public.checkout_attempts') AS checkout_attempts
    `);
    expect(readiness.rows[0]).toEqual({
      provider_events: "provider_events",
      downstream_effects: "downstream_effects",
      payment_events: "payment_events",
      refunds: "refunds",
      checkout_attempts: "checkout_attempts",
    });
    await cleanupFixture();
  });

  afterAll(async () => {
    await cleanupFixture();
    await pool.end();
  });

  it("allows one competing claimant and later reclaims the expired lease exactly once", async () => {
    const [left, right] = await Promise.all([
      repository().registerAndClaim(registration("claim:left")),
      repository().registerAndClaim(registration("claim:right")),
    ]);
    expect([left.status, right.status].toSorted()).toEqual(["busy", "claimed"]);

    await pool.query(
      `UPDATE provider_events
       SET lease_expires_at = '2026-08-25T12:00:10.000Z'
       WHERE provider_event_id = $1`,
      [`evt_${scope}_claim`],
    );
    const reclaimed = await repository().registerAndClaim(
      registration("claim:reclaimed", normalizedIgnored, new Date("2026-08-25T12:00:11.000Z")),
    );
    expect(reclaimed.status).toBe("claimed");
    const stored = await pool.query(
      `SELECT status, attempt_count, lease_token
       FROM provider_events WHERE provider_event_id = $1`,
      [`evt_${scope}_claim`],
    );
    expect(stored.rows).toEqual([{
      status: "processing",
      attempt_count: 2,
      lease_token: `lease_${scope}_claim:reclaimed`,
    }]);
  });

  it("serializes unseen PaymentIntent authority and terminally conflicts the zero-write loser", async () => {
    await cleanupFixture();
    await seedBusinessFixture();
    const paymentIntentId = `pi_${scope}_shared`;
    const race = await processRace("payment-race", {
      left: checkoutNormalization("left", "payment_race", paymentIntentId),
      right: checkoutNormalization("right", "payment_race", paymentIntentId),
    });
    const winner = sideFixture(race.winner);
    const loser = sideFixture(race.loser);
    const stored = await pool.query(
      `SELECT
         (SELECT status FROM provider_events WHERE id = $1::uuid) AS loser_status,
         (SELECT status FROM provider_events WHERE id = $2::uuid) AS winner_status,
         (SELECT count(*)::int FROM payment_events
          WHERE event_type = 'payment_verified' AND provider_payment_id = $3) AS shared_payments,
         (SELECT count(*)::int FROM payment_events
          WHERE provider_event_id = $1::uuid) AS loser_payment_writes,
         (SELECT count(*)::int FROM downstream_effects
          WHERE provider_event_id = $1::uuid) AS loser_effect_writes,
         (SELECT count(*)::int FROM refunds
          WHERE provider_event_id = $1::uuid) AS loser_refund_writes,
         (SELECT state FROM orders WHERE id = $4::uuid) AS loser_order_state,
         (SELECT status FROM checkout_attempts WHERE id = $5::uuid) AS loser_attempt_status,
         (SELECT state FROM inventory_reservations WHERE id = $6::uuid) AS loser_reservation_state,
         (SELECT state FROM orders WHERE id = $7::uuid) AS winner_order_state`,
      [
        race.loserEventId,
        race.winnerEventId,
        paymentIntentId,
        loser.order,
        loser.attempt,
        loser.reservation,
        winner.order,
      ],
    );
    expect(stored.rows[0]).toEqual({
      loser_status: "conflict",
      winner_status: "processed",
      shared_payments: 1,
      loser_payment_writes: 0,
      loser_effect_writes: 0,
      loser_refund_writes: 0,
      loser_order_state: "checkout_pending",
      loser_attempt_status: "created",
      loser_reservation_state: "active",
      winner_order_state: "paid_pending_fulfillment",
    });
  });

  it("serializes unseen provider refund authority and terminally conflicts the zero-write loser", async () => {
    await cleanupFixture();
    await seedBusinessFixture();
    const paymentIntents = {
      left: `pi_${scope}_refund_left`,
      right: `pi_${scope}_refund_right`,
    } as const;
    await Promise.all(sides.map((side) =>
      seedVerifiedPayment(side, "refund-race", paymentIntents[side])
    ));
    const providerRefundId = `re_${scope}_shared`;
    const race = await processRace("refund-race", {
      left: refundNormalization("left", "refund_race", paymentIntents.left, providerRefundId),
      right: refundNormalization("right", "refund_race", paymentIntents.right, providerRefundId),
    });
    const winner = sideFixture(race.winner);
    const loser = sideFixture(race.loser);
    const stored = await pool.query(
      `SELECT
         (SELECT status FROM provider_events WHERE id = $1::uuid) AS loser_status,
         (SELECT status FROM provider_events WHERE id = $2::uuid) AS winner_status,
         (SELECT count(*)::int FROM refunds
          WHERE provider = 'stripe' AND provider_refund_id = $3) AS shared_refunds,
         (SELECT count(*)::int FROM refunds
          WHERE provider_event_id = $1::uuid) AS loser_refund_writes,
         (SELECT count(*)::int FROM payment_events
          WHERE provider_event_id = $1::uuid) AS loser_payment_writes,
         (SELECT count(*)::int FROM downstream_effects
          WHERE provider_event_id = $1::uuid) AS loser_effect_writes,
         (SELECT state FROM orders WHERE id = $4::uuid) AS loser_order_state,
         (SELECT state FROM orders WHERE id = $5::uuid) AS winner_order_state`,
      [race.loserEventId, race.winnerEventId, providerRefundId, loser.order, winner.order],
    );
    expect(stored.rows[0]).toEqual({
      loser_status: "conflict",
      winner_status: "processed",
      shared_refunds: 1,
      loser_refund_writes: 0,
      loser_payment_writes: 0,
      loser_effect_writes: 0,
      loser_order_state: "paid_pending_fulfillment",
      winner_order_state: "paid_on_hold",
    });
  });

  it("serializes cumulative refunds on exact PaymentIntent authority and terminally conflicts the zero-write overflow", async () => {
    await cleanupFixture();
    await seedBusinessFixture();
    const paymentIntentId = `pi_${scope}_refund_cumulative`;
    await seedVerifiedPayment("left", "refund-cumulative-race", paymentIntentId);
    const race = await processRace("refund-cumulative-race", {
      left: refundNormalization(
        "left",
        "refund_cumulative_left",
        paymentIntentId,
        `re_${scope}_cumulative_left`,
        1_300,
      ),
      right: refundNormalization(
        "right",
        "refund_cumulative_right",
        paymentIntentId,
        `re_${scope}_cumulative_right`,
        1_300,
      ),
    });
    const left = sideFixture("left");
    const stored = await pool.query(
      `SELECT
         (SELECT status FROM provider_events WHERE id = $1::uuid) AS loser_status,
         (SELECT status FROM provider_events WHERE id = $2::uuid) AS winner_status,
         (SELECT count(*)::int FROM refunds
          WHERE verified_payment_event_id = (
            SELECT id FROM payment_events
            WHERE event_type = 'payment_verified' AND provider_payment_id = $3
          ) AND status = 'succeeded') AS succeeded_refunds,
         (SELECT coalesce(sum(confirmed_amount_minor), 0)::int FROM refunds
          WHERE verified_payment_event_id = (
            SELECT id FROM payment_events
            WHERE event_type = 'payment_verified' AND provider_payment_id = $3
          ) AND status = 'succeeded') AS confirmed_total,
         (SELECT count(*)::int FROM refunds
          WHERE provider_event_id = $1::uuid) AS loser_refund_writes,
         (SELECT count(*)::int FROM payment_events
          WHERE provider_event_id = $1::uuid) AS loser_payment_writes,
         (SELECT count(*)::int FROM downstream_effects
          WHERE provider_event_id = $1::uuid) AS loser_effect_writes,
         (SELECT state FROM orders WHERE id = $4::uuid) AS order_state`,
      [race.loserEventId, race.winnerEventId, paymentIntentId, left.order],
    );
    expect(stored.rows[0]).toEqual({
      loser_status: "conflict",
      winner_status: "processed",
      succeeded_refunds: 1,
      confirmed_total: 1_300,
      loser_refund_writes: 0,
      loser_payment_writes: 0,
      loser_effect_writes: 0,
      order_state: "paid_on_hold",
    });
  });

  it("serializes unseen dispute authority and terminally conflicts the zero-write loser", async () => {
    await cleanupFixture();
    await seedBusinessFixture();
    const paymentIntents = {
      left: `pi_${scope}_dispute_left`,
      right: `pi_${scope}_dispute_right`,
    } as const;
    await Promise.all(sides.map((side) =>
      seedVerifiedPayment(side, "dispute-race", paymentIntents[side])
    ));
    const disputeId = `dp_${scope}_shared`;
    const race = await processRace("dispute-race", {
      left: disputeNormalization("left", "dispute_race", paymentIntents.left, disputeId),
      right: disputeNormalization("right", "dispute_race", paymentIntents.right, disputeId),
    });
    const winner = sideFixture(race.winner);
    const loser = sideFixture(race.loser);
    const stored = await pool.query(
      `SELECT
         (SELECT status FROM provider_events WHERE id = $1::uuid) AS loser_status,
         (SELECT status FROM provider_events WHERE id = $2::uuid) AS winner_status,
         (SELECT count(*)::int FROM payment_events
          WHERE event_type IN ('dispute_recorded', 'dispute_resolved')
            AND provider_payment_id = $3) AS shared_dispute_journals,
         (SELECT count(*)::int FROM payment_events
          WHERE provider_event_id = $1::uuid) AS loser_payment_writes,
         (SELECT count(*)::int FROM refunds
          WHERE provider_event_id = $1::uuid) AS loser_refund_writes,
         (SELECT count(*)::int FROM downstream_effects
          WHERE provider_event_id = $1::uuid) AS loser_effect_writes,
         (SELECT state FROM orders WHERE id = $4::uuid) AS loser_order_state,
         (SELECT state FROM orders WHERE id = $5::uuid) AS winner_order_state`,
      [race.loserEventId, race.winnerEventId, disputeId, loser.order, winner.order],
    );
    expect(stored.rows[0]).toEqual({
      loser_status: "conflict",
      winner_status: "processed",
      shared_dispute_journals: 1,
      loser_payment_writes: 0,
      loser_refund_writes: 0,
      loser_effect_writes: 0,
      loser_order_state: "paid_pending_fulfillment",
      winner_order_state: "paid_on_hold",
    });
  });
});
