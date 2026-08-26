import { createHash } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { normalizeStripeProviderEventV1 } from "@/commerce/provider-events";
import type { ProcessableProviderEventNormalizationV1 } from "@/db/repositories/provider-event-repository";
import { createProviderEventAuthorityV1 } from "@/commerce/stripe-webhook-verifier";
import { parseServerEnv } from "@/config/env-schema";
import { createProviderEventRepository } from "@/db/repositories/provider-event-repository";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  buyer: "79000000-0000-4000-8000-000000000001",
  attestation: "79000000-0000-4000-8000-000000000002",
  acceptance: "79000000-0000-4000-8000-000000000003",
  group: "79000000-0000-4000-8000-000000000004",
  product: "79000000-0000-4000-8000-000000000005",
  price: "79000000-0000-4000-8000-000000000006",
  policy: "79000000-0000-4000-8000-000000000007",
  lot: "79000000-0000-4000-8000-000000000008",
  order: "79000000-0000-4000-8000-000000000009",
  item: "79000000-0000-4000-8000-000000000010",
  attempt: "79000000-0000-4000-8000-000000000011",
  reservation: "79000000-0000-4000-8000-000000000012",
  key: "79000000-0000-4000-8000-000000000013",
} as const;
const now = new Date("2026-08-25T12:00:30.000Z");
const providerCreated = 1_787_659_200;
const providerSessionId = "cs_test_synthetic_6e_processing";
const paymentIntentId = "pi_synthetic_6e_processing";

function keyedUuid(label: string): string {
  const hex = createHash("sha256").update(`synthetic-6e:${label}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function advisoryFenceKey(identity: string): string {
  return createHash("sha256")
    .update(identity, "utf8")
    .digest()
    .readBigInt64BE(0)
    .toString();
}

function authority() {
  const result = createProviderEventAuthorityV1(parseServerEnv({
    APP_ENV: "local",
    PAYMENTS_MODE: "test",
    STRIPE_ACCOUNT_ID: "acct_synthetic123",
    STRIPE_SECRET_KEY: "sk_test_synthetic_processing",
    STRIPE_WEBHOOK_SECRET: "whsec_synthetic_processing",
  }));
  if (result === null) throw new Error("missing synthetic authority");
  return result;
}

function checkoutNormalization(
  eventType: string,
  providerEventId: string,
  overrides: Record<string, unknown> = {},
) {
  const result = normalizeStripeProviderEventV1({
    id: providerEventId,
    type: eventType,
    created: providerCreated,
    livemode: false,
    data: {
      object: {
        id: providerSessionId,
        client_reference_id: ids.order,
        metadata: { orderId: ids.order, attemptId: ids.attempt },
        payment_intent: paymentIntentId,
        amount_total: 2_380,
        currency: "usd",
        payment_status: "paid",
        status: "complete",
        livemode: false,
        ...overrides,
      },
    },
  });
  if (result.status !== "normalized") throw new Error("invalid synthetic event");
  return result;
}

function refundNormalization(
  providerEventId: string,
  status: "pending" | "requires_action" | "succeeded" | "failed" | "canceled",
  overrides: Record<string, unknown> = {},
) {
  const result = normalizeStripeProviderEventV1({
    id: providerEventId,
    type: status === "failed" ? "refund.failed" : "refund.updated",
    created: providerCreated,
    livemode: false,
    data: {
      object: {
        id: `re_${providerEventId}`,
        metadata: {},
        payment_intent: paymentIntentId,
        charge: "ch_synthetic_6e_processing",
        amount: 500,
        currency: "usd",
        status,
        ...overrides,
      },
    },
  });
  if (result.status !== "normalized") throw new Error("invalid synthetic refund");
  return result;
}

function reconciliationNormalization(
  providerEventId: string,
  amountRefundedMinor: number,
) {
  const result = normalizeStripeProviderEventV1({
    id: providerEventId,
    type: "charge.refunded",
    created: providerCreated,
    livemode: false,
    data: {
      object: {
        id: "ch_synthetic_6e_processing",
        payment_intent: paymentIntentId,
        amount_refunded: amountRefundedMinor,
        currency: "usd",
        livemode: false,
      },
    },
  });
  if (result.status !== "normalized") throw new Error("invalid reconciliation");
  return result;
}

function disputeNormalization(
  providerEventId: string,
  status: string,
  overrides: Record<string, unknown> = {},
) {
  const result = normalizeStripeProviderEventV1({
    id: providerEventId,
    type: ["prevented", "warning_closed", "won", "lost"].includes(status)
      ? "charge.dispute.closed"
      : "charge.dispute.updated",
    created: providerCreated,
    livemode: false,
    data: {
      object: {
        id: `dp_${providerEventId}`,
        payment_intent: paymentIntentId,
        charge: "ch_synthetic_6e_processing",
        amount: 500,
        currency: "usd",
        status,
        livemode: false,
        ...overrides,
      },
    },
  });
  if (result.status !== "normalized") throw new Error("invalid synthetic dispute");
  return result;
}

describe("provider event Transaction B checkout semantics on PGlite", () => {
  let client: PGlite;
  let transactionSql: string[];
  let transactionQueries: Array<Readonly<{
    sql: string;
    parameters: readonly unknown[];
  }>>;

  beforeEach(async () => {
    client = await createMigratedPglite();
    transactionSql = [];
    transactionQueries = [];
    await client.exec(`
      INSERT INTO users (id, clerk_id, email_verified_at)
      VALUES ('${ids.buyer}', 'synthetic-6e-processing', now());
      INSERT INTO buyer_profiles (user_id, status, age_confirmed_at, research_purpose)
      VALUES ('${ids.buyer}', 'active', now(), 'analytical');
      INSERT INTO attestation_versions (id, version, content_hash, policy_text, effective_at)
      VALUES ('${ids.attestation}', 1, '${"a".repeat(64)}', 'Synthetic policy', now());
      INSERT INTO attestation_acceptances (id, user_id, attestation_version_id, accepted_at)
      VALUES ('${ids.acceptance}', '${ids.buyer}', '${ids.attestation}', now());
      INSERT INTO product_policy_groups (id, slug, name)
      VALUES ('${ids.group}', 'processing-group', 'Processing group');
      INSERT INTO products
        (id, slug, name, package_form, material_identity, policy_group_id, status)
      VALUES ('${ids.product}', 'processing-product', 'Synthetic Product',
              'sealed vial', 'Synthetic identity', '${ids.group}', 'active');
      INSERT INTO product_prices
        (id, product_id, version, amount_minor, currency, effective_at)
      VALUES ('${ids.price}', '${ids.product}', 1, 2000, 'USD', now());
      INSERT INTO destination_policies
        (id, scope_kind, product_id, state_code, result, version, active, effective_at)
      VALUES ('${ids.policy}', 'product', '${ids.product}', 'CA', 'allowed', 1, true, now());
      INSERT INTO lots
        (id, product_id, supplier_name, supplier_lot_code, received_quantity,
         available_quantity, status)
      VALUES ('${ids.lot}', '${ids.product}', 'Synthetic supplier', 'SYN-6E', 10, 9, 'released');
      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state)
      VALUES ('${ids.order}', '${ids.buyer}', 'active', '${ids.acceptance}',
              'CA', 'USD', 2000, 0, 180, 200, 2380, 'checkout_pending');
      INSERT INTO order_items
        (id, order_id, product_id, product_price_id, destination_policy_id,
         product_name_snapshot, package_form_snapshot, currency,
         unit_amount_minor, quantity, subtotal_minor, discount_minor, total_minor)
      VALUES ('${ids.item}', '${ids.order}', '${ids.product}', '${ids.price}',
              '${ids.policy}', 'Synthetic Product', 'sealed vial', 'USD',
              2000, 1, 2000, 0, 2000);
      INSERT INTO order_shipping_addresses
        (order_id, recipient_name, address_line1, city, state_code, postal_code, country)
      VALUES ('${ids.order}', 'Synthetic Buyer', '100 Test Way', 'Los Angeles', 'CA', '90001', 'US');
      INSERT INTO checkout_attempts
        (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         tax_ready, shipping_ready, tax_quote_reference, shipping_quote_reference,
         shipping_service, provider, provider_request_id, provider_request_hash,
         expires_at, provider_customer_email, provider_origin,
         provider_request_schema_version, provider_livemode, provider_scope,
         created_at)
      VALUES ('${ids.attempt}', '${ids.order}', '${ids.buyer}', '${ids.key}',
              '${"b".repeat(64)}', 'created', 'pass', 'pass', 'pass', 'pass',
              'pass', 'pass', true, false, true, true, 'tax_6e', 'ship_6e',
              'Synthetic Ground', 'stripe', 'checkout_attempt:${ids.attempt}',
              '${"c".repeat(64)}', '2026-08-25T20:00:00.000Z',
              'stored.buyer@example.test', 'https://commerce.synthetic.example', 1,
              false, 'stripe:acct_synthetic123', '2026-08-25T11:00:00.000Z');
      INSERT INTO inventory_reservations
        (id, checkout_attempt_id, idempotency_key, order_id, order_item_id,
         product_id, lot_id, quantity_reserved, quantity_remaining, state,
         expires_at)
      VALUES ('${ids.reservation}', '${ids.attempt}', 'reservation:synthetic-6e',
              '${ids.order}', '${ids.item}', '${ids.product}', '${ids.lot}',
              1, 1, 'active', '2026-08-25T20:00:00.000Z');
    `);
  });

  afterEach(async () => client.close());

  function repository() {
    return createProviderEventRepository({
      runSerializableTransaction: (work) =>
        client.transaction((transaction) => work({
          query: (text, params = []) => {
            const sql = text.replace(/\s+/gu, " ").trim();
            transactionSql.push(sql);
            transactionQueries.push({ sql, parameters: [...params] });
            return transaction.query(text, [...params]);
          },
        })),
      keyedUuid,
    });
  }

  async function claim(
    normalization: ProcessableProviderEventNormalizationV1,
    suffix: string,
  ) {
    const result = await repository().registerAndClaim({
      provider: "stripe",
      databaseEventId: keyedUuid(`database-event:${suffix}`),
      conflictAuditId: keyedUuid(`registration-audit:${suffix}`),
      payloadHash: createHash("sha256").update(`payload:${suffix}`).digest("hex"),
      normalization,
      receivedAt: new Date("2026-08-25T12:00:00.000Z"),
      claimAt: new Date("2026-08-25T12:00:00.000Z"),
      leaseToken: `lease_synthetic_6e_${suffix}`,
      leaseExpiresAt: new Date("2026-08-25T12:01:00.000Z"),
    });
    if (result.status !== "claimed") throw new Error("expected provider event claim");
    return result.claim;
  }

  async function seedVerifiedPayment(repo = repository()) {
    const paid = await claim(
      checkoutNormalization(
        "checkout.session.completed",
        "evt_synthetic_6e_seed_payment",
      ),
      "seed-payment",
    );
    const result = await repo.processClaim({ claim: paid, authority: authority(), now });
    if (result.status !== "processed") throw new Error("failed to seed payment");
    const payment = await client.query(
      `SELECT id::text AS id FROM payment_events WHERE event_type = 'payment_verified'`,
    );
    return (payment.rows[0] as { id: string }).id;
  }

  function expectGlobalIdentityFence(
    expectedKeys: readonly string[],
    firstIdentityRead: RegExp,
  ): void {
    const inboxLock = transactionQueries.findIndex(({ sql }) =>
      /FROM provider_events[\s\S]*FOR UPDATE/u.test(sql));
    const fences = transactionQueries
      .map(({ sql }, index) => /pg_advisory_xact_lock/u.test(sql) ? index : -1)
      .filter((index) => index >= 0);
    const identityRead = transactionQueries.findIndex(({ sql }) =>
      firstIdentityRead.test(sql));
    expect([inboxLock, identityRead].every((index) => index >= 0)).toBe(true);
    expect(fences).toHaveLength(expectedKeys.length);
    for (const fence of fences) {
      expect(inboxLock).toBeLessThan(fence);
      expect(fence).toBeLessThan(identityRead);
    }
    expect(fences.map((index) => transactionQueries[index]!.parameters)).toEqual(
      expectedKeys
        .map(advisoryFenceKey)
        .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
        .map((key) => [key]),
    );
  }

  async function seedForeignVerifiedPayment(
    foreignPaymentIntentId: string,
  ): Promise<Readonly<{ orderId: string; paymentEventId: string }>> {
    const orderId = "79000000-0000-4000-8000-000000000030";
    const attemptId = "79000000-0000-4000-8000-000000000031";
    const databaseEventId = keyedUuid(`foreign-payment-provider-event:${foreignPaymentIntentId}`);
    const paymentEventId = keyedUuid(`foreign-payment-journal:${foreignPaymentIntentId}`);
    const providerEventId = "evt_synthetic_6e_foreign_payment";
    const sessionId = "cs_test_synthetic_6e_foreign_payment";
    const normalization = checkoutNormalization(
      "checkout.session.completed",
      providerEventId,
      {
        id: sessionId,
        client_reference_id: orderId,
        metadata: { orderId, attemptId },
        payment_intent: foreignPaymentIntentId,
      },
    );

    await client.query(
      `INSERT INTO orders
         (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
          destination_state_code, currency, subtotal_minor, discount_minor,
          tax_minor, shipping_minor, total_minor, state)
       SELECT $1, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
              destination_state_code, currency, subtotal_minor, discount_minor,
              tax_minor, shipping_minor, total_minor, 'paid_pending_fulfillment'
       FROM orders WHERE id = $2::uuid`,
      [orderId, ids.order],
    );
    await client.query(
      `INSERT INTO checkout_attempts
         (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
          account_gate, attestation_gate, product_gate, destination_gate,
          inventory_gate, payment_provider_gate, permitted, review_required,
          tax_ready, shipping_ready, tax_quote_reference, shipping_quote_reference,
          shipping_service, provider, provider_request_id, provider_request_hash,
          provider_session_id, expires_at, provider_customer_email, provider_origin,
          provider_request_schema_version, provider_livemode, provider_scope, created_at)
       SELECT $1, $2, buyer_user_id, $3, request_hash, 'completed', account_gate,
              attestation_gate, product_gate, destination_gate, inventory_gate,
              payment_provider_gate, permitted, review_required, tax_ready,
              shipping_ready, tax_quote_reference, shipping_quote_reference,
              shipping_service, provider, $4, provider_request_hash, $5,
              expires_at, provider_customer_email, provider_origin,
              provider_request_schema_version, provider_livemode, provider_scope,
              created_at
       FROM checkout_attempts WHERE id = $6::uuid`,
      [
        attemptId,
        orderId,
        `foreign-checkout:${foreignPaymentIntentId}`,
        `checkout_attempt:${attemptId}`,
        sessionId,
        ids.attempt,
      ],
    );
    await client.query(
      `INSERT INTO provider_events
         (id, provider, provider_event_id, payload_hash, status, attempt_count,
          received_at, processed_at, event_type, schema_version,
          normalized_payload, provider_created_at, livemode)
       VALUES ($1, 'stripe', $2, $3, 'processed', 1, $4, $4, $5, 1,
               $6::jsonb, $7, false)`,
      [
        databaseEventId,
        providerEventId,
        createHash("sha256").update(`foreign:${foreignPaymentIntentId}`).digest("hex"),
        now,
        normalization.event.eventType,
        JSON.stringify(normalization.event),
        normalization.event.providerCreatedAt,
      ],
    );
    await client.query(
      `INSERT INTO payment_events
         (id, provider_event_id, order_id, event_type, provider_payment_id,
          idempotency_key, amount_minor, currency, occurred_at)
       VALUES ($1, $2, $3, 'payment_verified', $4, $5, 2380, 'USD', $6)`,
      [
        paymentEventId,
        databaseEventId,
        orderId,
        foreignPaymentIntentId,
        `stripe:payment_intent:${foreignPaymentIntentId}`,
        normalization.event.providerCreatedAt,
      ],
    );
    return Object.freeze({ orderId, paymentEventId });
  }

  async function seedSecondVerifiedPaymentForCurrentOrder(
    secondPaymentIntentId: string,
  ): Promise<string> {
    const databaseEventId = keyedUuid(
      `same-order-payment-provider-event:${secondPaymentIntentId}`,
    );
    const paymentEventId = keyedUuid(
      `same-order-payment-journal:${secondPaymentIntentId}`,
    );
    const providerEventId = "evt_synthetic_6e_same_order_second_payment_source";
    const normalization = checkoutNormalization(
      "checkout.session.completed",
      providerEventId,
      { payment_intent: secondPaymentIntentId },
    );
    await client.query(
      `INSERT INTO provider_events
         (id, provider, provider_event_id, payload_hash, status, attempt_count,
          received_at, processed_at, event_type, schema_version,
          normalized_payload, provider_created_at, livemode)
       VALUES ($1, 'stripe', $2, $3, 'processed', 1, $4, $4, $5, 1,
               $6::jsonb, $7, false)`,
      [
        databaseEventId,
        providerEventId,
        createHash("sha256").update(`same-order:${secondPaymentIntentId}`).digest("hex"),
        now,
        normalization.event.eventType,
        JSON.stringify(normalization.event),
        normalization.event.providerCreatedAt,
      ],
    );
    await client.query(
      `INSERT INTO payment_events
         (id, provider_event_id, order_id, event_type, provider_payment_id,
          idempotency_key, amount_minor, currency, occurred_at)
       VALUES ($1, $2, $3, 'payment_verified', $4, $5, 2380, 'USD', $6)`,
      [
        paymentEventId,
        databaseEventId,
        ids.order,
        secondPaymentIntentId,
        `stripe:payment_intent:${secondPaymentIntentId}`,
        normalization.event.providerCreatedAt,
      ],
    );
    return paymentEventId;
  }

  it("verifies paid active inventory, journals once, and enqueues exact payment plus wake effects", async () => {
    const repo = repository();
    const firstClaim = await claim(
      checkoutNormalization(
        "checkout.session.completed",
        "evt_synthetic_6e_paid_primary",
      ),
      "paid-primary",
    );
    const firstResult = await repo.processClaim({
      claim: firstClaim,
      authority: authority(),
      now,
    });
    const firstInbox = await client.query(
      `SELECT last_error_redacted FROM provider_events WHERE provider_event_id = 'evt_synthetic_6e_paid_primary'`,
    );
    expect({ result: firstResult, inbox: firstInbox.rows }).toEqual({
      result: { status: "processed" },
      inbox: [{ last_error_redacted: null }],
    });

    const duplicateClaim = await claim(
      checkoutNormalization(
        "checkout.session.async_payment_succeeded",
        "evt_synthetic_6e_paid_duplicate",
      ),
      "paid-duplicate",
    );
    await expect(repo.processClaim({
      claim: duplicateClaim,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "processed" });

    const state = await client.query(`SELECT
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT status FROM checkout_attempts WHERE id = '${ids.attempt}') AS attempt_status,
      (SELECT provider_session_id FROM checkout_attempts WHERE id = '${ids.attempt}') AS provider_session_id,
      (SELECT count(*)::int FROM payment_events WHERE event_type = 'payment_verified') AS payments,
      (SELECT count(*)::int FROM downstream_effects) AS effects,
      (SELECT count(*)::int FROM downstream_effects WHERE effect_type = 'wake_provider_dependencies') AS wakes,
      (SELECT count(*)::int FROM admin_audit) AS incidents`);
    expect(state.rows[0]).toEqual({
      order_state: "paid_pending_fulfillment",
      attempt_status: "completed",
      provider_session_id: providerSessionId,
      payments: 1,
      effects: 2,
      wakes: 1,
      incidents: 0,
    });
    const effects = await client.query(`
      SELECT effect_type, payload, idempotency_key
      FROM downstream_effects ORDER BY effect_type
    `);
    const payment = await client.query(`SELECT id::text AS id FROM payment_events`);
    const verifiedPaymentEventId = (payment.rows[0] as { id: string }).id;
    expect(effects.rows).toEqual([
      {
        effect_type: "payment_verified",
        payload: {
          schemaVersion: 1,
          orderId: ids.order,
          verifiedPaymentEventId,
          reason: "payment_verified",
        },
        idempotency_key: `payment_event:${verifiedPaymentEventId}:payment_verified`,
      },
      {
        effect_type: "wake_provider_dependencies",
        payload: { schemaVersion: 1, verifiedPaymentEventId },
        idempotency_key: `payment_event:${verifiedPaymentEventId}:wake_provider_dependencies`,
      },
    ]);
  });

  it("rolls back an injected pre-commit crash, fail-marks separately, and reclaims once", async () => {
    const normalization = checkoutNormalization(
      "checkout.session.completed",
      "evt_synthetic_6e_precommit_crash",
    );
    const claimed = await claim(normalization, "precommit-crash");
    const crashingRepository = createProviderEventRepository({
      runSerializableTransaction: (work) =>
        client.transaction(async (transaction) => {
          await work({
            query: (text, params = []) => transaction.query(text, [...params]),
          });
          throw new Error("synthetic crash before Transaction B commit");
        }),
      keyedUuid,
    });

    await expect(crashingRepository.processClaim({
      claim: claimed,
      authority: authority(),
      now,
    })).rejects.toThrow(/before Transaction B commit/i);
    let state = await client.query(`SELECT
      (SELECT status FROM provider_events
       WHERE provider_event_id = 'evt_synthetic_6e_precommit_crash') AS inbox_status,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT count(*)::int FROM payment_events) AS payments,
      (SELECT count(*)::int FROM downstream_effects) AS effects`);
    expect(state.rows[0]).toEqual({
      inbox_status: "processing",
      order_state: "checkout_pending",
      payments: 0,
      effects: 0,
    });

    const repo = repository();
    await expect(repo.markClaimFailed(claimed, {
      now,
      reason: "provider_event_processing_failed",
    })).resolves.toEqual({ status: "applied" });
    const reclaimed = await claim(normalization, "precommit-crash");
    await expect(repo.processClaim({
      claim: reclaimed,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "processed" });
    state = await client.query(`SELECT
      (SELECT status FROM provider_events
       WHERE provider_event_id = 'evt_synthetic_6e_precommit_crash') AS inbox_status,
      (SELECT attempt_count FROM provider_events
       WHERE provider_event_id = 'evt_synthetic_6e_precommit_crash') AS attempts,
      (SELECT count(*)::int FROM payment_events WHERE event_type = 'payment_verified') AS payments,
      (SELECT count(*)::int FROM downstream_effects) AS effects`);
    expect(state.rows[0]).toEqual({
      inbox_status: "processed",
      attempts: 2,
      payments: 1,
      effects: 2,
    });
  });

  it("retains inventory for completed nonpaid and async failure while recording one failure", async () => {
    const repo = repository();
    const completed = await claim(
      checkoutNormalization(
        "checkout.session.completed",
        "evt_synthetic_6e_completed_unpaid",
        { payment_intent: null, payment_status: "unpaid" },
      ),
      "completed-unpaid",
    );
    await expect(repo.processClaim({ claim: completed, authority: authority(), now })).resolves.toEqual({
      status: "processed",
    });
    let state = await client.query(`SELECT
      (SELECT status FROM checkout_attempts WHERE id = '${ids.attempt}') AS attempt_status,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT state FROM inventory_reservations WHERE id = '${ids.reservation}') AS reservation_state,
      (SELECT count(*)::int FROM payment_events) AS payment_events`);
    expect(state.rows[0]).toEqual({
      attempt_status: "completed",
      order_state: "checkout_pending",
      reservation_state: "active",
      payment_events: 0,
    });

    const failed = await claim(
      checkoutNormalization(
        "checkout.session.async_payment_failed",
        "evt_synthetic_6e_async_failed",
        { payment_intent: null, payment_status: "unpaid" },
      ),
      "async-failed",
    );
    await expect(repo.processClaim({ claim: failed, authority: authority(), now })).resolves.toEqual({
      status: "processed",
    });
    state = await client.query(`SELECT
      (SELECT status FROM checkout_attempts WHERE id = '${ids.attempt}') AS attempt_status,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT state FROM inventory_reservations WHERE id = '${ids.reservation}') AS reservation_state,
      (SELECT count(*)::int FROM payment_events WHERE event_type = 'payment_failed') AS payment_events`);
    expect(state.rows[0]).toEqual({
      attempt_status: "completed",
      order_state: "payment_failed",
      reservation_state: "active",
      payment_events: 1,
    });
  });

  it("keeps an incoherent async-failure conflict free of payment business writes", async () => {
    await client.exec(`UPDATE orders SET state = 'cancelled' WHERE id = '${ids.order}'`);
    const repo = repository();
    const failed = await claim(
      checkoutNormalization(
        "checkout.session.async_payment_failed",
        "evt_synthetic_6e_async_failed_cancelled",
        { payment_intent: null, payment_status: "unpaid" },
      ),
      "async-failed-cancelled",
    );

    await expect(repo.processClaim({ claim: failed, authority: authority(), now })).resolves.toEqual({
      status: "conflict",
    });
    const state = await client.query(`SELECT
      (SELECT status FROM checkout_attempts WHERE id = '${ids.attempt}') AS attempt_status,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT count(*)::int FROM payment_events) AS payment_events,
      (SELECT count(*)::int FROM downstream_effects) AS effects`);
    expect(state.rows[0]).toEqual({
      attempt_status: "created",
      order_state: "cancelled",
      payment_events: 0,
      effects: 0,
    });
  });

  it("conflicts completed nonpaid on a cancelled order with active reservations", async () => {
    await client.exec(`UPDATE orders SET state = 'cancelled' WHERE id = '${ids.order}'`);
    const repo = repository();
    const completed = await claim(
      checkoutNormalization(
        "checkout.session.completed",
        "evt_synthetic_6e_completed_unpaid_cancelled",
        { payment_intent: null, payment_status: "unpaid" },
      ),
      "completed-unpaid-cancelled",
    );

    await expect(repo.processClaim({
      claim: completed,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "conflict" });
    const state = await client.query(`SELECT
      (SELECT status FROM checkout_attempts WHERE id = '${ids.attempt}') AS attempt_status,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT state FROM inventory_reservations
       WHERE id = '${ids.reservation}') AS reservation_state,
      (SELECT count(*)::int FROM payment_events) AS payments,
      (SELECT count(*)::int FROM downstream_effects) AS effects`);
    expect(state.rows[0]).toEqual({
      attempt_status: "created",
      order_state: "cancelled",
      reservation_state: "active",
      payments: 0,
      effects: 0,
    });
  });

  it("does not regress an expired attempt on a later nonpaid completion", async () => {
    await client.exec(`
      UPDATE checkout_attempts
      SET status = 'expired', provider_session_id = '${providerSessionId}'
      WHERE id = '${ids.attempt}';
      UPDATE orders SET state = 'cancelled' WHERE id = '${ids.order}';
      UPDATE inventory_reservations
      SET state = 'expired', quantity_remaining = 0
      WHERE id = '${ids.reservation}';
      UPDATE lots SET available_quantity = 10 WHERE id = '${ids.lot}';
    `);
    const repo = repository();
    const completed = await claim(
      checkoutNormalization(
        "checkout.session.completed",
        "evt_synthetic_6e_completed_after_expiry",
        { payment_intent: null, payment_status: "unpaid" },
      ),
      "completed-after-expiry",
    );

    await expect(repo.processClaim({ claim: completed, authority: authority(), now })).resolves.toEqual({
      status: "conflict",
    });
    const state = await client.query(`SELECT
      (SELECT status FROM checkout_attempts WHERE id = '${ids.attempt}') AS attempt_status,
      (SELECT state FROM inventory_reservations WHERE id = '${ids.reservation}') AS reservation_state,
      (SELECT count(*)::int FROM payment_events) AS payment_events`);
    expect(state.rows[0]).toEqual({
      attempt_status: "expired",
      reservation_state: "expired",
      payment_events: 0,
    });
  });

  it("reuses the transaction-level release primitive for signed completed-to-expired release once", async () => {
    const repo = repository();
    const completed = await claim(
      checkoutNormalization(
        "checkout.session.completed",
        "evt_synthetic_6e_before_expiry",
        { payment_intent: null, payment_status: "unpaid" },
      ),
      "before-expiry",
    );
    await repo.processClaim({ claim: completed, authority: authority(), now });
    const expired = await claim(
      checkoutNormalization(
        "checkout.session.expired",
        "evt_synthetic_6e_expiry",
        {
          payment_intent: null,
          payment_status: "unpaid",
          status: "expired",
        },
      ),
      "expiry",
    );
    transactionSql = [];
    await expect(repo.processClaim({ claim: expired, authority: authority(), now })).resolves.toEqual({
      status: "processed",
    });
    const lockIndex = (pattern: RegExp) =>
      transactionSql.findIndex((sql) => pattern.test(sql));
    const releaseLockOrder = [
      lockIndex(/FROM provider_events[\s\S]*FOR UPDATE/u),
      lockIndex(/FROM users[\s\S]*FOR UPDATE/u),
      lockIndex(/FROM buyer_profiles[\s\S]*FOR UPDATE/u),
      lockIndex(/FROM checkout_attempts[\s\S]*FOR UPDATE/u),
      lockIndex(/FROM orders[\s\S]*FOR UPDATE/u),
      lockIndex(/FROM payment_events[\s\S]*FOR UPDATE/u),
      lockIndex(/FROM inventory_reservations[\s\S]*FOR UPDATE/u),
      lockIndex(/FROM lots[\s\S]*FOR UPDATE/u),
    ];
    expect(releaseLockOrder.every((value) => value >= 0)).toBe(true);
    expect(releaseLockOrder).toEqual(
      releaseLockOrder.toSorted((left, right) => left - right),
    );
    await expect(repo.processClaim({ claim: expired, authority: authority(), now })).resolves.toEqual({
      status: "lease_lost",
    });
    const state = await client.query(`SELECT
      (SELECT status FROM checkout_attempts WHERE id = '${ids.attempt}') AS attempt_status,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT state FROM inventory_reservations WHERE id = '${ids.reservation}') AS reservation_state,
      (SELECT available_quantity FROM lots WHERE id = '${ids.lot}') AS available,
      (SELECT count(*)::int FROM inventory_events WHERE event_type = 'release') AS releases`);
    expect(state.rows[0]).toEqual({
      attempt_status: "expired",
      order_state: "cancelled",
      reservation_state: "expired",
      available: 10,
      releases: 1,
    });
  });

  it("processes paid-before-expiry without releasing active inventory", async () => {
    const repo = repository();
    await seedVerifiedPayment(repo);
    const expired = await claim(
      checkoutNormalization(
        "checkout.session.expired",
        "evt_synthetic_6e_paid_before_expiry",
        {
          payment_intent: null,
          payment_status: "unpaid",
          status: "expired",
        },
      ),
      "paid-before-expiry",
    );

    await expect(repo.processClaim({ claim: expired, authority: authority(), now })).resolves.toEqual({
      status: "processed",
    });
    const state = await client.query(`SELECT
      (SELECT status FROM checkout_attempts WHERE id = '${ids.attempt}') AS attempt_status,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT state FROM inventory_reservations WHERE id = '${ids.reservation}') AS reservation_state,
      (SELECT available_quantity FROM lots WHERE id = '${ids.lot}') AS available,
      (SELECT count(*)::int FROM inventory_events WHERE event_type = 'release') AS releases`);
    expect(state.rows[0]).toEqual({
      attempt_status: "completed",
      order_state: "paid_pending_fulfillment",
      reservation_state: "active",
      available: 9,
      releases: 0,
    });
  });

  it("conflicts a second PaymentIntent without duplicating verified payment authority", async () => {
    const repo = repository();
    await seedVerifiedPayment(repo);
    const mismatched = await claim(
      checkoutNormalization(
        "checkout.session.async_payment_succeeded",
        "evt_synthetic_6e_payment_intent_mismatch",
        { payment_intent: "pi_synthetic_6e_other" },
      ),
      "payment-intent-mismatch",
    );

    await expect(repo.processClaim({ claim: mismatched, authority: authority(), now })).resolves.toEqual({
      status: "conflict",
    });
    const state = await client.query(`SELECT
      (SELECT count(*)::int FROM payment_events WHERE event_type = 'payment_verified') AS payments,
      (SELECT count(*)::int FROM downstream_effects) AS effects,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state`);
    expect(state.rows[0]).toEqual({
      payments: 1,
      effects: 2,
      order_state: "paid_pending_fulfillment",
    });
  });

  it("processes an exact paid replay after reservations were consumed", async () => {
    const repo = repository();
    await seedVerifiedPayment(repo);
    await client.exec(`
      UPDATE orders SET state = 'fulfillment_in_progress' WHERE id = '${ids.order}';
      UPDATE inventory_reservations
      SET state = 'consumed', quantity_remaining = 0
      WHERE id = '${ids.reservation}';
    `);
    const replay = await claim(
      checkoutNormalization(
        "checkout.session.async_payment_succeeded",
        "evt_synthetic_6e_paid_replay_after_consume",
      ),
      "paid-replay-after-consume",
    );

    await expect(repo.processClaim({
      claim: replay,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "processed" });
    const state = await client.query(`SELECT
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT state FROM inventory_reservations
       WHERE id = '${ids.reservation}') AS reservation_state,
      (SELECT count(*)::int FROM payment_events
       WHERE event_type = 'payment_verified') AS payments,
      (SELECT count(*)::int FROM downstream_effects) AS effects`);
    expect(state.rows[0]).toEqual({
      order_state: "fulfillment_in_progress",
      reservation_state: "consumed",
      payments: 1,
      effects: 2,
    });
  });

  it("processes async failure after verified late payment without regressing authority", async () => {
    await client.exec(`
      UPDATE checkout_attempts
      SET status = 'expired', provider_session_id = '${providerSessionId}'
      WHERE id = '${ids.attempt}';
      UPDATE orders SET state = 'cancelled' WHERE id = '${ids.order}';
      UPDATE inventory_reservations
      SET state = 'expired', quantity_remaining = 0
      WHERE id = '${ids.reservation}';
      UPDATE lots SET available_quantity = 10 WHERE id = '${ids.lot}';
    `);
    const repo = repository();
    const paid = await claim(
      checkoutNormalization(
        "checkout.session.async_payment_succeeded",
        "evt_synthetic_6e_paid_after_release_before_failure",
      ),
      "paid-after-release-before-failure",
    );
    await expect(repo.processClaim({
      claim: paid,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "processed" });
    const failed = await claim(
      checkoutNormalization(
        "checkout.session.async_payment_failed",
        "evt_synthetic_6e_failure_after_verified_payment",
        { payment_status: "unpaid" },
      ),
      "failure-after-verified-payment",
    );

    await expect(repo.processClaim({
      claim: failed,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "processed" });
    const state = await client.query(`SELECT
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT status FROM checkout_attempts WHERE id = '${ids.attempt}') AS attempt_status,
      (SELECT count(*)::int FROM payment_events
       WHERE event_type = 'payment_verified') AS verified,
      (SELECT count(*)::int FROM payment_events
       WHERE event_type = 'payment_failed') AS failures,
      (SELECT count(*)::int FROM downstream_effects) AS effects`);
    expect(state.rows[0]).toEqual({
      order_state: "paid_on_hold",
      attempt_status: "completed",
      verified: 1,
      failures: 0,
      effects: 2,
    });
  });

  it("conflicts a PaymentIntent already owned by another order without retrying a unique violation", async () => {
    await seedForeignVerifiedPayment(paymentIntentId);
    const repo = repository();
    const collision = await claim(
      checkoutNormalization(
        "checkout.session.completed",
        "evt_synthetic_6e_cross_order_payment_intent",
      ),
      "cross-order-payment-intent",
    );

    await expect(repo.processClaim({
      claim: collision,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "conflict" });
    const state = await client.query(`SELECT
      (SELECT count(*)::int FROM payment_events
       WHERE provider_payment_id = '${paymentIntentId}') AS payments,
      (SELECT count(*)::int FROM downstream_effects) AS effects,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT status FROM provider_events
       WHERE provider_event_id = 'evt_synthetic_6e_cross_order_payment_intent') AS inbox_status`);
    expect(state.rows[0]).toEqual({
      payments: 1,
      effects: 0,
      order_state: "checkout_pending",
      inbox_status: "conflict",
    });
  });

  it("conflicts cross-paired existing checkout references instead of deferring", async () => {
    const foreign = await seedForeignVerifiedPayment(
      "pi_synthetic_6e_foreign_discovery",
    );
    const repo = repository();
    const crossPaired = await claim(
      checkoutNormalization(
        "checkout.session.completed",
        "evt_synthetic_6e_cross_paired_checkout",
        {
          client_reference_id: foreign.orderId,
          metadata: { orderId: foreign.orderId, attemptId: ids.attempt },
        },
      ),
      "cross-paired-checkout",
    );

    await expect(repo.processClaim({
      claim: crossPaired,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "conflict" });
    const state = await client.query(`SELECT
      (SELECT status FROM provider_events
       WHERE provider_event_id = 'evt_synthetic_6e_cross_paired_checkout') AS inbox_status,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS current_order_state,
      (SELECT count(*)::int FROM payment_events) AS payments,
      (SELECT count(*)::int FROM downstream_effects) AS effects`);
    expect(state.rows[0]).toEqual({
      inbox_status: "conflict",
      current_order_state: "checkout_pending",
      payments: 1,
      effects: 0,
    });
  });

  it("takes the global PaymentIntent fence before exact identity discovery", async () => {
    const repo = repository();
    const paid = await claim(
      checkoutNormalization(
        "checkout.session.completed",
        "evt_synthetic_6e_payment_identity_fence",
      ),
      "payment-identity-fence",
    );
    transactionSql = [];
    transactionQueries = [];

    await expect(repo.processClaim({
      claim: paid,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "processed" });
    expectGlobalIdentityFence(
      [`stripe:payment_intent:${paymentIntentId}`],
      /FROM payment_events/u,
    );
  });

  it("takes the global provider-refund fence before exact identity discovery", async () => {
    const repo = repository();
    await seedVerifiedPayment(repo);
    const providerEventId = "evt_synthetic_6e_refund_identity_fence";
    const refund = await claim(
      refundNormalization(providerEventId, "pending"),
      "refund-identity-fence",
    );
    transactionSql = [];
    transactionQueries = [];

    await expect(repo.processClaim({
      claim: refund,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "processed" });
    expectGlobalIdentityFence(
      [
        `stripe:provider_refund:re_${providerEventId}`,
        `stripe:payment_intent:${paymentIntentId}`,
      ],
      /FROM payment_events/u,
    );
  });

  it("takes the global dispute fence before exact identity discovery", async () => {
    const repo = repository();
    await seedVerifiedPayment(repo);
    const providerEventId = "evt_synthetic_6e_dispute_identity_fence";
    const dispute = await claim(
      disputeNormalization(providerEventId, "needs_response"),
      "dispute-identity-fence",
    );
    transactionSql = [];
    transactionQueries = [];

    await expect(repo.processClaim({
      claim: dispute,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "processed" });
    expectGlobalIdentityFence(
      [
        `stripe:dispute:dp_${providerEventId}`,
        `stripe:payment_intent:${paymentIntentId}`,
      ],
      /FROM payment_events/u,
    );
  });

  it("places a late matching payment on hold after authoritative release with one incident", async () => {
    await client.exec(`
      UPDATE checkout_attempts SET status = 'expired', provider_session_id = '${providerSessionId}'
      WHERE id = '${ids.attempt}';
      UPDATE orders SET state = 'cancelled' WHERE id = '${ids.order}';
      UPDATE inventory_reservations SET state = 'expired', quantity_remaining = 0
      WHERE id = '${ids.reservation}';
      UPDATE lots SET available_quantity = 10 WHERE id = '${ids.lot}';
    `);
    const repo = repository();
    const paid = await claim(
      checkoutNormalization(
        "checkout.session.async_payment_succeeded",
        "evt_synthetic_6e_late_paid",
      ),
      "late-paid",
    );
    await expect(repo.processClaim({ claim: paid, authority: authority(), now })).resolves.toEqual({
      status: "processed",
    });
    const state = await client.query(`SELECT
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT count(*)::int FROM payment_events WHERE event_type = 'payment_verified') AS payments,
      (SELECT count(*)::int FROM admin_audit
       WHERE metadata->>'reason' = 'inventory_conflict') AS incidents`);
    expect(state.rows[0]).toEqual({
      order_state: "paid_on_hold",
      payments: 1,
      incidents: 1,
    });
  });

  it.each([
    ["amount", { amount_total: 2_379 }, null],
    ["currency", { currency: "eur" }, null],
    ["order", {
      client_reference_id: "79000000-0000-4000-8000-000000000099",
      metadata: {
        orderId: "79000000-0000-4000-8000-000000000099",
        attemptId: ids.attempt,
      },
    }, null],
    ["attempt", { metadata: { orderId: ids.order, attemptId: "79000000-0000-4000-8000-000000000099" } }, null],
    ["session", { id: "cs_test_synthetic_6e_mismatch" }, `UPDATE checkout_attempts SET status = 'open', provider_session_id = '${providerSessionId}' WHERE id = '${ids.attempt}'`],
    ["livemode", {}, `UPDATE checkout_attempts SET provider_livemode = true WHERE id = '${ids.attempt}'`],
    ["scope", {}, `UPDATE checkout_attempts SET provider_scope = 'stripe:acct_changed123' WHERE id = '${ids.attempt}'`],
  ] as const)("conflicts a %s mismatch with zero business writes", async (_name, overrides, setupSql) => {
    if (setupSql !== null) await client.exec(setupSql);
    const repo = repository();
    const event = await claim(
      checkoutNormalization(
        "checkout.session.completed",
        `evt_synthetic_6e_mismatch_${_name}`,
        overrides,
      ),
      `mismatch-${_name}`,
    );
    await expect(repo.processClaim({ claim: event, authority: authority(), now })).resolves.toEqual({
      status: "conflict",
    });
    const state = await client.query(`SELECT
      (SELECT count(*)::int FROM payment_events) AS payments,
      (SELECT count(*)::int FROM downstream_effects) AS effects,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state`);
    expect(state.rows[0]).toEqual({ payments: 0, effects: 0, order_state: "checkout_pending" });
  });

  it("conflicts a zero-value paid checkout before database shape enforcement", async () => {
    await client.exec(`
      UPDATE orders
      SET subtotal_minor = 0, tax_minor = 0, shipping_minor = 0, total_minor = 0
      WHERE id = '${ids.order}'
    `);
    const repo = repository();
    const event = await claim(
      checkoutNormalization(
        "checkout.session.completed",
        "evt_synthetic_6e_zero_paid",
        { amount_total: 0 },
      ),
      "zero-paid",
    );

    await expect(repo.processClaim({ claim: event, authority: authority(), now })).resolves.toEqual({
      status: "conflict",
    });
    const state = await client.query(`SELECT
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT count(*)::int FROM payment_events) AS payments,
      (SELECT count(*)::int FROM downstream_effects) AS effects`);
    expect(state.rows[0]).toEqual({
      order_state: "checkout_pending",
      payments: 0,
      effects: 0,
    });
  });

  it("defers refund before payment, wakes it by exact dependency, and applies it once", async () => {
    const repo = repository();
    const normalization = refundNormalization(
      "evt_synthetic_6e_refund_before_payment",
      "succeeded",
    );
    const beforePayment = await claim(normalization, "refund-before-payment");
    await expect(repo.processClaim({
      claim: beforePayment,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "deferred" });
    const before = await client.query(`
      SELECT status, attempt_count FROM provider_events
      WHERE provider_event_id = 'evt_synthetic_6e_refund_before_payment'
    `);
    expect(before.rows).toEqual([{ status: "deferred", attempt_count: 1 }]);

    const verifiedPaymentEventId = await seedVerifiedPayment(repo);
    await expect(repo.wakeDeferredDependencies({
      verifiedPaymentEventId,
      now,
    })).resolves.toEqual({ status: "woken", count: 1 });
    await expect(repo.wakeDeferredDependencies({
      verifiedPaymentEventId,
      now,
    })).resolves.toEqual({ status: "woken", count: 0 });
    const afterWake = await client.query(`
      SELECT status, attempt_count, last_error_redacted FROM provider_events
      WHERE provider_event_id = 'evt_synthetic_6e_refund_before_payment'
    `);
    expect(afterWake.rows).toEqual([{
      status: "pending",
      attempt_count: 1,
      last_error_redacted: null,
    }]);

    const reclaimed = await claim(normalization, "refund-before-payment");
    await expect(repo.processClaim({
      claim: reclaimed,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "processed" });
    const applied = await client.query(`SELECT
      (SELECT count(*)::int FROM refunds WHERE origin = 'provider_observed' AND status = 'succeeded') AS refunds,
      (SELECT count(*)::int FROM payment_events WHERE event_type = 'refund_verified') AS journals,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state`);
    expect(applied.rows[0]).toEqual({
      refunds: 1,
      journals: 1,
      order_state: "paid_on_hold",
    });
  });

  it("rejects a refund when the stored verified-payment source envelope has drifted", async () => {
    const repo = repository();
    await seedVerifiedPayment(repo);
    await client.exec(`
      UPDATE provider_events
      SET normalized_payload = jsonb_set(normalized_payload, '{amountMinor}', '2379'::jsonb)
      WHERE provider_event_id = 'evt_synthetic_6e_seed_payment'
    `);
    const event = await claim(
      refundNormalization(
        "evt_synthetic_6e_refund_drifted_payment_source",
        "succeeded",
      ),
      "refund-drifted-payment-source",
    );

    await expect(repo.processClaim({ claim: event, authority: authority(), now })).resolves.toEqual({
      status: "conflict",
    });
    const state = await client.query(`SELECT
      (SELECT count(*)::int FROM refunds) AS refunds,
      (SELECT count(*)::int FROM payment_events WHERE event_type = 'refund_verified') AS refund_journals,
      (SELECT count(*)::int FROM downstream_effects
       WHERE provider_event_id = '${keyedUuid("database-event:refund-drifted-payment-source")}') AS effects,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state`);
    expect(state.rows[0]).toEqual({
      refunds: 0,
      refund_journals: 0,
      effects: 0,
      order_state: "paid_pending_fulfillment",
    });
  });

  it("binds exact ambiguous-create refund metadata and confirms only that staff request", async () => {
    const repo = repository();
    const verifiedPaymentEventId = await seedVerifiedPayment(repo);
    const refundRequestId = "79000000-0000-4000-8000-000000000020";
    await client.query(
      `INSERT INTO refunds
         (id, order_id, requested_by_user_id, verified_payment_event_id,
          provider, provider_event_id, provider_refund_id, idempotency_key,
          requested_amount_minor, confirmed_amount_minor, currency, status,
          requested_at, confirmed_at, origin, provider_request_hash,
          attempt_count, submitted_at, last_error_redacted)
       VALUES ($1, $2, $3, $4, 'stripe', NULL, NULL, $5, 500, NULL, 'USD',
               'submitted', $6, NULL, 'staff_requested', $7, 1, $6, NULL)`,
      [
        refundRequestId,
        ids.order,
        ids.buyer,
        verifiedPaymentEventId,
        `refund_request:${refundRequestId}`,
        now,
        "d".repeat(64),
      ],
    );
    const normalization = refundNormalization(
      "evt_synthetic_6e_internal_refund",
      "succeeded",
      { metadata: { orderId: ids.order, refundId: refundRequestId } },
    );
    const event = await claim(normalization, "internal-refund");
    await expect(repo.processClaim({ claim: event, authority: authority(), now })).resolves.toEqual({
      status: "processed",
    });
    const refund = await client.query(`
      SELECT origin, status, provider_refund_id, confirmed_amount_minor,
             provider_event_id::text AS provider_event_id
      FROM refunds WHERE id = '${refundRequestId}'
    `);
    expect(refund.rows).toMatchObject([{
      origin: "staff_requested",
      status: "succeeded",
      provider_refund_id: "re_evt_synthetic_6e_internal_refund",
      confirmed_amount_minor: 500,
    }]);
    const state = await client.query(`SELECT
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT count(*)::int FROM payment_events WHERE event_type = 'refund_verified') AS journals,
      (SELECT count(*)::int FROM downstream_effects WHERE effect_type = 'refund_verified') AS effects,
      (SELECT count(*)::int FROM admin_audit WHERE action = 'provider_event_incident') AS incidents`);
    expect(state.rows[0]).toEqual({
      order_state: "paid_pending_fulfillment",
      journals: 1,
      effects: 1,
      incidents: 0,
    });
  });

  it("never guesses a same-amount staff request for an uncorrelated provider refund", async () => {
    const repo = repository();
    const verifiedPaymentEventId = await seedVerifiedPayment(repo);
    const refundRequestId = "79000000-0000-4000-8000-000000000022";
    await client.query(
      `INSERT INTO refunds
         (id, order_id, requested_by_user_id, verified_payment_event_id,
          provider, provider_event_id, provider_refund_id, idempotency_key,
          requested_amount_minor, confirmed_amount_minor, currency, status,
          requested_at, confirmed_at, origin, provider_request_hash,
          attempt_count, submitted_at, last_error_redacted)
       VALUES ($1, $2, $3, $4, 'stripe', NULL, NULL, $5, 500, NULL, 'USD',
               'submitted', $6, NULL, 'staff_requested', $7, 1, $6, NULL)`,
      [
        refundRequestId,
        ids.order,
        ids.buyer,
        verifiedPaymentEventId,
        `refund_request:${refundRequestId}`,
        now,
        "f".repeat(64),
      ],
    );
    const observed = await claim(
      refundNormalization(
        "evt_synthetic_6e_uncorrelated_same_amount",
        "succeeded",
      ),
      "uncorrelated-same-amount",
    );

    await expect(repo.processClaim({ claim: observed, authority: authority(), now })).resolves.toEqual({
      status: "processed",
    });
    const state = await client.query(`SELECT
      (SELECT status FROM refunds WHERE id = '${refundRequestId}') AS staff_status,
      (SELECT count(*)::int FROM refunds WHERE origin = 'staff_requested') AS staff_rows,
      (SELECT count(*)::int FROM refunds
       WHERE origin = 'provider_observed' AND status = 'succeeded') AS observed_rows,
      (SELECT count(*)::int FROM admin_audit
       WHERE metadata->>'reason' = 'provider_observed_refund') AS incidents`);
    expect(state.rows[0]).toEqual({
      staff_status: "submitted",
      staff_rows: 1,
      observed_rows: 1,
      incidents: 1,
    });
  });

  it("conflicts a provider refund ID already owned by another payment without retrying a unique violation", async () => {
    const repo = repository();
    await seedVerifiedPayment(repo);
    const foreign = await seedForeignVerifiedPayment(
      "pi_synthetic_6e_foreign_refund_owner",
    );
    const providerRefundId = "re_synthetic_6e_cross_payment_refund";
    const foreignRefundId = "79000000-0000-4000-8000-000000000032";
    await client.query(
      `INSERT INTO refunds
         (id, order_id, requested_by_user_id, verified_payment_event_id,
          provider, provider_event_id, provider_refund_id, idempotency_key,
          requested_amount_minor, confirmed_amount_minor, currency, status,
          requested_at, confirmed_at, origin, provider_request_hash,
          attempt_count, submitted_at, last_error_redacted)
       VALUES ($1, $2, $3, $4, 'stripe', NULL, $5, $6, 500, NULL, 'USD',
               'submitted', $7, NULL, 'staff_requested', $8, 1, $7, NULL)`,
      [
        foreignRefundId,
        foreign.orderId,
        ids.buyer,
        foreign.paymentEventId,
        providerRefundId,
        `refund_request:${foreignRefundId}`,
        now,
        "9".repeat(64),
      ],
    );
    const collision = await claim(
      refundNormalization(
        "evt_synthetic_6e_cross_payment_refund",
        "succeeded",
        { id: providerRefundId },
      ),
      "cross-payment-refund",
    );

    await expect(repo.processClaim({
      claim: collision,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "conflict" });
    const state = await client.query(`SELECT
      (SELECT count(*)::int FROM refunds
       WHERE provider_refund_id = '${providerRefundId}') AS refunds,
      (SELECT count(*)::int FROM payment_events
       WHERE event_type = 'refund_verified') AS refund_journals,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT status FROM provider_events
       WHERE provider_event_id = 'evt_synthetic_6e_cross_payment_refund') AS inbox_status`);
    expect(state.rows[0]).toEqual({
      refunds: 1,
      refund_journals: 0,
      order_state: "paid_pending_fulfillment",
      inbox_status: "conflict",
    });
  });

  it("dedupes repeated provider-observed refund updates by provider refund ID", async () => {
    const repo = repository();
    await seedVerifiedPayment(repo);
    const sharedProviderRefundId = "re_synthetic_6e_shared_observed";
    const pending = await claim(
      refundNormalization(
        "evt_synthetic_6e_shared_observed_pending",
        "pending",
        { id: sharedProviderRefundId },
      ),
      "shared-observed-pending",
    );
    await repo.processClaim({ claim: pending, authority: authority(), now });
    const succeeded = await claim(
      refundNormalization(
        "evt_synthetic_6e_shared_observed_succeeded",
        "succeeded",
        { id: sharedProviderRefundId },
      ),
      "shared-observed-succeeded",
    );
    await expect(repo.processClaim({ claim: succeeded, authority: authority(), now })).resolves.toEqual({
      status: "processed",
    });

    const state = await client.query(`SELECT
      (SELECT count(*)::int FROM refunds
       WHERE provider_refund_id = '${sharedProviderRefundId}') AS refunds,
      (SELECT status FROM refunds
       WHERE provider_refund_id = '${sharedProviderRefundId}') AS refund_status,
      (SELECT count(*)::int FROM payment_events WHERE event_type = 'refund_verified') AS journals,
      (SELECT count(*)::int FROM downstream_effects WHERE effect_type = 'refund_verified') AS effects,
      (SELECT count(*)::int FROM admin_audit
       WHERE metadata->>'reason' = 'provider_observed_refund') AS incidents`);
    expect(state.rows[0]).toEqual({
      refunds: 1,
      refund_status: "succeeded",
      journals: 1,
      effects: 1,
      incidents: 1,
    });
  });

  it("never regresses a terminal provider refund on a stale pending event", async () => {
    const repo = repository();
    await seedVerifiedPayment(repo);
    const sharedProviderRefundId = "re_synthetic_6e_terminal_observed";
    const failed = await claim(
      refundNormalization(
        "evt_synthetic_6e_terminal_observed_failed",
        "failed",
        { id: sharedProviderRefundId },
      ),
      "terminal-observed-failed",
    );
    await repo.processClaim({ claim: failed, authority: authority(), now });
    const stalePending = await claim(
      refundNormalization(
        "evt_synthetic_6e_terminal_observed_stale_pending",
        "pending",
        { id: sharedProviderRefundId },
      ),
      "terminal-observed-stale-pending",
    );

    await expect(repo.processClaim({
      claim: stalePending,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "conflict" });
    const state = await client.query(`SELECT
      (SELECT status FROM refunds
       WHERE provider_refund_id = '${sharedProviderRefundId}') AS refund_status,
      (SELECT count(*)::int FROM refunds
       WHERE provider_refund_id = '${sharedProviderRefundId}') AS refunds,
      (SELECT count(*)::int FROM payment_events WHERE event_type = 'refund_verified') AS journals,
      (SELECT status FROM provider_events
       WHERE provider_event_id = 'evt_synthetic_6e_terminal_observed_stale_pending') AS inbox_status`);
    expect(state.rows[0]).toEqual({
      refund_status: "failed",
      refunds: 1,
      journals: 0,
      inbox_status: "conflict",
    });
  });

  it("conflicts a succeeded refund above the locked remaining balance and permits an exact remainder", async () => {
    const repo = repository();
    await seedVerifiedPayment(repo);
    const first = await claim(
      refundNormalization(
        "evt_synthetic_6e_refund_balance_first",
        "succeeded",
        { id: "re_synthetic_6e_refund_balance_first", amount: 1_500 },
      ),
      "refund-balance-first",
    );
    await expect(repo.processClaim({ claim: first, authority: authority(), now })).resolves.toEqual({
      status: "processed",
    });

    const excessive = await claim(
      refundNormalization(
        "evt_synthetic_6e_refund_balance_excessive",
        "succeeded",
        { id: "re_synthetic_6e_refund_balance_excessive", amount: 1_000 },
      ),
      "refund-balance-excessive",
    );
    await expect(repo.processClaim({
      claim: excessive,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "conflict" });
    const excessiveDatabaseEventId = keyedUuid(
      "database-event:refund-balance-excessive",
    );
    let state = await client.query(`SELECT
      (SELECT count(*)::int FROM refunds WHERE status = 'succeeded') AS refunds,
      (SELECT coalesce(sum(confirmed_amount_minor), 0)::int FROM refunds
       WHERE status = 'succeeded') AS confirmed_total,
      (SELECT count(*)::int FROM payment_events
       WHERE event_type = 'refund_verified') AS journals,
      (SELECT count(*)::int FROM downstream_effects
       WHERE provider_event_id = '${excessiveDatabaseEventId}') AS excessive_effects,
      (SELECT status FROM provider_events
       WHERE id = '${excessiveDatabaseEventId}') AS inbox_status`);
    expect(state.rows[0]).toEqual({
      refunds: 1,
      confirmed_total: 1_500,
      journals: 1,
      excessive_effects: 0,
      inbox_status: "conflict",
    });

    const remainder = await claim(
      refundNormalization(
        "evt_synthetic_6e_refund_balance_remainder",
        "succeeded",
        { id: "re_synthetic_6e_refund_balance_remainder", amount: 880 },
      ),
      "refund-balance-remainder",
    );
    await expect(repo.processClaim({
      claim: remainder,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "processed" });
    state = await client.query(`SELECT
      (SELECT count(*)::int FROM refunds WHERE status = 'succeeded') AS refunds,
      (SELECT coalesce(sum(confirmed_amount_minor), 0)::int FROM refunds
       WHERE status = 'succeeded') AS confirmed_total,
      (SELECT count(*)::int FROM payment_events
       WHERE event_type = 'refund_verified') AS journals,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state`);
    expect(state.rows[0]).toEqual({
      refunds: 2,
      confirmed_total: 2_380,
      journals: 2,
      order_state: "paid_on_hold",
    });
  });

  it("locks financial dependencies in the global order without a second inbox lock", async () => {
    const repo = repository();
    await seedVerifiedPayment(repo);
    const event = await claim(
      refundNormalization(
        "evt_synthetic_6e_financial_lock_order",
        "succeeded",
      ),
      "financial-lock-order",
    );
    transactionSql = [];
    await repo.processClaim({ claim: event, authority: authority(), now });

    const index = (pattern: RegExp) =>
      transactionSql.findIndex((sql) => pattern.test(sql));
    const ordered = [
      index(/FROM provider_events[\s\S]*FOR UPDATE/u),
      index(/FROM users[\s\S]*FOR UPDATE/u),
      index(/FROM buyer_profiles[\s\S]*FOR UPDATE/u),
      index(/FROM checkout_attempts[\s\S]*FOR UPDATE/u),
      index(/FROM orders[\s\S]*FOR UPDATE/u),
      index(/FROM payment_events[\s\S]*FOR UPDATE/u),
      index(/FROM refunds[\s\S]*FOR UPDATE/u),
    ];
    expect(ordered.every((value) => value >= 0)).toBe(true);
    expect(ordered).toEqual(ordered.toSorted((left, right) => left - right));
    expect(
      transactionSql.slice(ordered[4]! + 1).some(
        (sql) => /FROM provider_events[\s\S]*FOR UPDATE/u.test(sql),
      ),
    ).toBe(false);
  });

  it.each([
    ["pending", "submitted", 0, 0],
    ["requires_action", "submitted", 0, 0],
    ["succeeded", "succeeded", 1, 1],
    ["failed", "failed", 0, 0],
    ["canceled", "cancelled", 0, 0],
  ] as const)(
    "preserves a provider-observed %s refund without consuming a staff request",
    async (providerStatus, storedStatus, journalCount, effectCount) => {
      const repo = repository();
      await seedVerifiedPayment(repo);
      const event = await claim(
        refundNormalization(
          `evt_synthetic_6e_observed_${providerStatus}`,
          providerStatus,
        ),
        `observed-${providerStatus}`,
      );
      await expect(repo.processClaim({ claim: event, authority: authority(), now })).resolves.toEqual({
        status: "processed",
      });
      const state = await client.query(`SELECT
        (SELECT status FROM refunds WHERE origin = 'provider_observed') AS refund_status,
        (SELECT count(*)::int FROM payment_events WHERE event_type = 'refund_verified') AS journals,
        (SELECT count(*)::int FROM downstream_effects WHERE effect_type = 'refund_verified') AS effects,
        (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
        (SELECT count(*)::int FROM admin_audit
         WHERE metadata->>'reason' = 'provider_observed_refund') AS incidents`);
      expect(state.rows[0]).toEqual({
        refund_status: storedStatus,
        journals: journalCount,
        effects: effectCount,
        order_state: "paid_on_hold",
        incidents: 1,
      });
    },
  );

  it("keeps a reconciliation conflict free of unreconciled journal writes", async () => {
    const repo = repository();
    await seedVerifiedPayment(repo);
    await client.exec(`UPDATE orders SET state = 'cancelled' WHERE id = '${ids.order}'`);
    const reconciliation = await claim(
      reconciliationNormalization(
        "evt_synthetic_6e_reconciliation_cancelled",
        700,
      ),
      "reconciliation-cancelled",
    );

    await expect(repo.processClaim({
      claim: reconciliation,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "conflict" });
    const state = await client.query(`SELECT
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT count(*)::int FROM payment_events
       WHERE event_type = 'unreconciled_refund_observed') AS unreconciled,
      (SELECT count(*)::int FROM downstream_effects
       WHERE provider_event_id = '${keyedUuid("database-event:reconciliation-cancelled")}') AS effects`);
    expect(state.rows[0]).toEqual({
      order_state: "cancelled",
      unreconciled: 0,
      effects: 0,
    });
  });

  it("conflicts reconciliation when a succeeded refund is not exact payment authority", async () => {
    const repo = repository();
    await seedVerifiedPayment(repo);
    const refund = await claim(
      refundNormalization(
        "evt_synthetic_6e_reconciliation_drifted_refund_source",
        "succeeded",
      ),
      "reconciliation-drifted-refund-source",
    );
    await repo.processClaim({ claim: refund, authority: authority(), now });
    await client.exec(`UPDATE refunds SET currency = 'EUR' WHERE origin = 'provider_observed'`);
    const reconciliation = await claim(
      reconciliationNormalization(
        "evt_synthetic_6e_reconciliation_drifted_refund",
        500,
      ),
      "reconciliation-drifted-refund",
    );

    await expect(repo.processClaim({
      claim: reconciliation,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "conflict" });
    const state = await client.query(`SELECT
      (SELECT count(*)::int FROM payment_events
       WHERE event_type = 'unreconciled_refund_observed') AS unreconciled,
      (SELECT status FROM provider_events
       WHERE provider_event_id = 'evt_synthetic_6e_reconciliation_drifted_refund') AS inbox_status`);
    expect(state.rows[0]).toEqual({ unreconciled: 0, inbox_status: "conflict" });
  });

  it("conflicts reconciliation when a staff refund source drifts its signed request identity", async () => {
    const repo = repository();
    const verifiedPaymentEventId = await seedVerifiedPayment(repo);
    const refundRequestId = "79000000-0000-4000-8000-000000000033";
    const driftedRefundRequestId = "79000000-0000-4000-8000-000000000034";
    const sourceProviderEventId = "evt_synthetic_6e_staff_refund_provenance";
    await client.query(
      `INSERT INTO refunds
         (id, order_id, requested_by_user_id, verified_payment_event_id,
          provider, provider_event_id, provider_refund_id, idempotency_key,
          requested_amount_minor, confirmed_amount_minor, currency, status,
          requested_at, confirmed_at, origin, provider_request_hash,
          attempt_count, submitted_at, last_error_redacted)
       VALUES ($1, $2, $3, $4, 'stripe', NULL, NULL, $5, 500, NULL, 'USD',
               'submitted', $6, NULL, 'staff_requested', $7, 1, $6, NULL)`,
      [
        refundRequestId,
        ids.order,
        ids.buyer,
        verifiedPaymentEventId,
        `refund_request:${refundRequestId}`,
        now,
        "7".repeat(64),
      ],
    );
    const source = await claim(
      refundNormalization(sourceProviderEventId, "succeeded", {
        metadata: { orderId: ids.order, refundId: refundRequestId },
      }),
      "staff-refund-provenance-source",
    );
    await expect(repo.processClaim({
      claim: source,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "processed" });
    await client.query(
      `UPDATE provider_events
       SET normalized_payload = jsonb_set(
         normalized_payload,
         '{refundRequestId}',
         to_jsonb($1::text)
       )
       WHERE provider_event_id = $2`,
      [driftedRefundRequestId, sourceProviderEventId],
    );
    const reconciliation = await claim(
      reconciliationNormalization(
        "evt_synthetic_6e_staff_refund_provenance_reconciliation",
        500,
      ),
      "staff-refund-provenance-reconciliation",
    );

    await expect(repo.processClaim({
      claim: reconciliation,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "conflict" });
    const state = await client.query(`SELECT
      (SELECT count(*)::int FROM payment_events
       WHERE event_type = 'unreconciled_refund_observed') AS unreconciled,
      (SELECT status FROM provider_events
       WHERE provider_event_id = 'evt_synthetic_6e_staff_refund_provenance_reconciliation') AS inbox_status`);
    expect(state.rows[0]).toEqual({ unreconciled: 0, inbox_status: "conflict" });
  });

  it("conflicts reconciliation when an observed refund source gains internal correlation", async () => {
    const repo = repository();
    await seedVerifiedPayment(repo);
    const sourceProviderEventId = "evt_synthetic_6e_observed_refund_provenance";
    const source = await claim(
      refundNormalization(sourceProviderEventId, "succeeded"),
      "observed-refund-provenance-source",
    );
    await expect(repo.processClaim({
      claim: source,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "processed" });
    await client.query(
      `UPDATE provider_events
       SET normalized_payload = jsonb_set(
         jsonb_set(normalized_payload, '{orderId}', to_jsonb($1::text)),
         '{refundRequestId}',
         to_jsonb($2::text)
       )
       WHERE provider_event_id = $3`,
      [
        ids.order,
        "79000000-0000-4000-8000-000000000035",
        sourceProviderEventId,
      ],
    );
    const reconciliation = await claim(
      reconciliationNormalization(
        "evt_synthetic_6e_observed_refund_provenance_reconciliation",
        500,
      ),
      "observed-refund-provenance-reconciliation",
    );

    await expect(repo.processClaim({
      claim: reconciliation,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "conflict" });
    const state = await client.query(`SELECT
      (SELECT count(*)::int FROM payment_events
       WHERE event_type = 'unreconciled_refund_observed') AS unreconciled,
      (SELECT status FROM provider_events
       WHERE provider_event_id = 'evt_synthetic_6e_observed_refund_provenance_reconciliation') AS inbox_status`);
    expect(state.rows[0]).toEqual({ unreconciled: 0, inbox_status: "conflict" });
  });

  it.each([
    [500, "processed", 0, "paid_pending_fulfillment"],
    [700, "processed", 1, "paid_on_hold"],
    [400, "conflict", 0, "paid_pending_fulfillment"],
  ] as const)(
    "reconciles charge.refunded amount %i conservatively",
    async (amountRefunded, expectedStatus, unreconciledCount, orderState) => {
      const repo = repository();
      const verifiedPaymentEventId = await seedVerifiedPayment(repo);
      const refundRequestId = "79000000-0000-4000-8000-000000000021";
      await client.query(
        `INSERT INTO refunds
           (id, order_id, requested_by_user_id, verified_payment_event_id,
            provider, provider_event_id, provider_refund_id, idempotency_key,
            requested_amount_minor, confirmed_amount_minor, currency, status,
            requested_at, confirmed_at, origin, provider_request_hash,
            attempt_count, submitted_at, last_error_redacted)
         VALUES ($1, $2, $3, $4, 'stripe', NULL, NULL, $5, 500, NULL, 'USD',
                 'submitted', $6, NULL, 'staff_requested', $7, 1, $6, NULL)`,
        [
          refundRequestId,
          ids.order,
          ids.buyer,
          verifiedPaymentEventId,
          `refund_request:${refundRequestId}`,
          now,
          "e".repeat(64),
        ],
      );
      const succeeded = await claim(
        refundNormalization(
          `evt_synthetic_6e_reconcile_refund_${amountRefunded}`,
          "succeeded",
          { metadata: { orderId: ids.order, refundId: refundRequestId } },
        ),
        `reconcile-refund-${amountRefunded}`,
      );
      await repo.processClaim({ claim: succeeded, authority: authority(), now });
      const reconciliation = await claim(
        reconciliationNormalization(
          `evt_synthetic_6e_reconciliation_${amountRefunded}`,
          amountRefunded,
        ),
        `reconciliation-${amountRefunded}`,
      );
      await expect(repo.processClaim({
        claim: reconciliation,
        authority: authority(),
        now,
      })).resolves.toEqual({ status: expectedStatus });
      const eventId = keyedUuid(`database-event:reconciliation-${amountRefunded}`);
      const state = await client.query(`SELECT
        (SELECT count(*)::int FROM payment_events
         WHERE event_type = 'unreconciled_refund_observed'
           AND idempotency_key = 'provider_event:${eventId}:unreconciled_refund') AS unreconciled,
        (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state`);
      expect(state.rows[0]).toEqual({
        unreconciled: unreconciledCount,
        order_state: orderState,
      });
    },
  );

  it("records every restrictive/resolved dispute status and never clears a hold", async () => {
    const repo = repository();
    await seedVerifiedPayment(repo);
    const statuses = [
      "lost",
      "needs_response",
      "prevented",
      "under_review",
      "warning_closed",
      "warning_needs_response",
      "warning_under_review",
      "won",
      "future_provider_status",
    ] as const;
    for (const status of statuses) {
      const event = await claim(
        disputeNormalization(
          `evt_synthetic_6e_dispute_${status}`,
          status,
        ),
        `dispute-${status}`,
      );
      await expect(repo.processClaim({ claim: event, authority: authority(), now })).resolves.toEqual({
        status: "processed",
      });
    }
    const state = await client.query(`SELECT
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT count(*)::int FROM payment_events WHERE event_type = 'dispute_recorded') AS restrictive,
      (SELECT count(*)::int FROM payment_events WHERE event_type = 'dispute_resolved') AS resolved,
      (SELECT count(*)::int FROM downstream_effects
       WHERE effect_type IN ('dispute_recorded','dispute_resolved')) AS effects,
      (SELECT count(*)::int FROM admin_audit
       WHERE metadata->>'reason' = 'unsupported_dispute_status') AS unknown_incidents`);
    expect(state.rows[0]).toEqual({
      order_state: "paid_on_hold",
      restrictive: 6,
      resolved: 3,
      effects: 9,
      unknown_incidents: 1,
    });
  });

  it("conflicts the same provider dispute across orders and status categories", async () => {
    const repo = repository();
    const foreignPaymentIntentId = "pi_synthetic_6e_foreign_dispute_owner";
    const foreign = await seedForeignVerifiedPayment(foreignPaymentIntentId);
    const providerDisputeId = "dp_synthetic_6e_cross_order_dispute";
    const recorded = await claim(
      disputeNormalization(
        "evt_synthetic_6e_foreign_dispute_recorded",
        "needs_response",
        {
          id: providerDisputeId,
          payment_intent: foreignPaymentIntentId,
        },
      ),
      "foreign-dispute-recorded",
    );
    await expect(repo.processClaim({
      claim: recorded,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "processed" });
    await seedVerifiedPayment(repo);
    const resolved = await claim(
      disputeNormalization(
        "evt_synthetic_6e_cross_order_dispute_resolved",
        "won",
        { id: providerDisputeId },
      ),
      "cross-order-dispute-resolved",
    );

    await expect(repo.processClaim({
      claim: resolved,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "conflict" });
    const state = await client.query(`SELECT
      (SELECT count(*)::int FROM payment_events
       WHERE provider_payment_id = '${providerDisputeId}'
         AND event_type IN ('dispute_recorded', 'dispute_resolved')) AS journals,
      (SELECT order_id::text FROM payment_events
       WHERE provider_payment_id = '${providerDisputeId}') AS journal_order_id,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS current_order_state,
      (SELECT status FROM provider_events
       WHERE provider_event_id = 'evt_synthetic_6e_cross_order_dispute_resolved') AS inbox_status`);
    expect(state.rows[0]).toEqual({
      journals: 1,
      journal_order_id: foreign.orderId,
      current_order_state: "paid_pending_fulfillment",
      inbox_status: "conflict",
    });
  });

  it("conflicts a dispute status change that switches verified payments on the same order", async () => {
    const repo = repository();
    await seedVerifiedPayment(repo);
    const providerDisputeId = "dp_synthetic_6e_same_order_payment_switch";
    const recorded = await claim(
      disputeNormalization(
        "evt_synthetic_6e_same_order_dispute_recorded",
        "needs_response",
        { id: providerDisputeId },
      ),
      "same-order-dispute-recorded",
    );
    await expect(repo.processClaim({
      claim: recorded,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "processed" });

    const secondPaymentIntentId = "pi_synthetic_6e_same_order_second";
    await seedSecondVerifiedPaymentForCurrentOrder(secondPaymentIntentId);
    const resolved = await claim(
      disputeNormalization(
        "evt_synthetic_6e_same_order_dispute_resolved",
        "won",
        {
          id: providerDisputeId,
          payment_intent: secondPaymentIntentId,
        },
      ),
      "same-order-dispute-resolved",
    );

    await expect(repo.processClaim({
      claim: resolved,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "conflict" });
    const resolvedDatabaseEventId = keyedUuid(
      "database-event:same-order-dispute-resolved",
    );
    const state = await client.query(`SELECT
      (SELECT count(*)::int FROM payment_events
       WHERE provider_payment_id = '${providerDisputeId}'
         AND event_type IN ('dispute_recorded', 'dispute_resolved')) AS journals,
      (SELECT count(*)::int FROM downstream_effects
       WHERE provider_event_id = '${resolvedDatabaseEventId}') AS resolved_effects,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT status FROM provider_events
       WHERE id = '${resolvedDatabaseEventId}') AS inbox_status`);
    expect(state.rows[0]).toEqual({
      journals: 1,
      resolved_effects: 0,
      order_state: "paid_on_hold",
      inbox_status: "conflict",
    });
  });

  it("conflicts a dispute status change that switches the normalized charge authority", async () => {
    const repo = repository();
    await seedVerifiedPayment(repo);
    const providerDisputeId = "dp_synthetic_6e_charge_switch";
    const recorded = await claim(
      disputeNormalization(
        "evt_synthetic_6e_charge_switch_recorded",
        "needs_response",
        { id: providerDisputeId, charge: "ch_synthetic_6e_charge_original" },
      ),
      "charge-switch-dispute-recorded",
    );
    await expect(repo.processClaim({
      claim: recorded,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "processed" });

    const resolved = await claim(
      disputeNormalization(
        "evt_synthetic_6e_charge_switch_resolved",
        "won",
        { id: providerDisputeId, charge: "ch_synthetic_6e_charge_changed" },
      ),
      "charge-switch-dispute-resolved",
    );
    await expect(repo.processClaim({
      claim: resolved,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "conflict" });

    const resolvedDatabaseEventId = keyedUuid(
      "database-event:charge-switch-dispute-resolved",
    );
    const state = await client.query(`SELECT
      (SELECT count(*)::int FROM payment_events
       WHERE provider_payment_id = '${providerDisputeId}'
         AND event_type IN ('dispute_recorded', 'dispute_resolved')) AS journals,
      (SELECT count(*)::int FROM downstream_effects
       WHERE provider_event_id = '${resolvedDatabaseEventId}') AS resolved_effects,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state,
      (SELECT status FROM provider_events
       WHERE id = '${resolvedDatabaseEventId}') AS inbox_status`);
    expect(state.rows[0]).toEqual({
      journals: 1,
      resolved_effects: 0,
      order_state: "paid_on_hold",
      inbox_status: "conflict",
    });
  });

  it("processes dispute record and resolve when exact payment provenance is unchanged", async () => {
    const repo = repository();
    await seedVerifiedPayment(repo);
    const providerDisputeId = "dp_synthetic_6e_exact_payment_transition";
    const recorded = await claim(
      disputeNormalization(
        "evt_synthetic_6e_exact_payment_dispute_recorded",
        "needs_response",
        { id: providerDisputeId },
      ),
      "exact-payment-dispute-recorded",
    );
    await expect(repo.processClaim({
      claim: recorded,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "processed" });
    const resolved = await claim(
      disputeNormalization(
        "evt_synthetic_6e_exact_payment_dispute_resolved",
        "won",
        { id: providerDisputeId },
      ),
      "exact-payment-dispute-resolved",
    );

    await expect(repo.processClaim({
      claim: resolved,
      authority: authority(),
      now,
    })).resolves.toEqual({ status: "processed" });
    const state = await client.query(`SELECT
      (SELECT count(*)::int FROM payment_events
       WHERE provider_payment_id = '${providerDisputeId}'
         AND event_type IN ('dispute_recorded', 'dispute_resolved')) AS journals,
      (SELECT count(*)::int FROM downstream_effects
       WHERE effect_type IN ('dispute_recorded', 'dispute_resolved')) AS effects,
      (SELECT state FROM orders WHERE id = '${ids.order}') AS order_state`);
    expect(state.rows[0]).toEqual({
      journals: 2,
      effects: 2,
      order_state: "paid_on_hold",
    });
  });

  it("defers a dispute with no verified payment and writes no business fact", async () => {
    const repo = repository();
    const event = await claim(
      disputeNormalization(
        "evt_synthetic_6e_dispute_before_payment",
        "needs_response",
      ),
      "dispute-before-payment",
    );

    await expect(repo.processClaim({ claim: event, authority: authority(), now })).resolves.toEqual({
      status: "deferred",
    });
    const state = await client.query(`SELECT
      (SELECT status FROM provider_events
       WHERE provider_event_id = 'evt_synthetic_6e_dispute_before_payment') AS inbox_status,
      (SELECT count(*)::int FROM payment_events) AS journals,
      (SELECT count(*)::int FROM downstream_effects) AS effects,
      (SELECT count(*)::int FROM admin_audit) AS incidents`);
    expect(state.rows[0]).toEqual({
      inbox_status: "deferred",
      journals: 0,
      effects: 0,
      incidents: 0,
    });
  });

  it("locks the inbox first and then follows the global checkout row-family order", async () => {
    const repo = repository();
    const event = await claim(
      checkoutNormalization("checkout.session.completed", "evt_synthetic_6e_lock_order"),
      "lock-order",
    );
    transactionSql = [];
    await repo.processClaim({ claim: event, authority: authority(), now });
    const index = (pattern: RegExp) => transactionSql.findIndex((sql) => pattern.test(sql));
    const ordered = [
      index(/FROM provider_events[\s\S]*FOR UPDATE/u),
      index(/FROM users[\s\S]*FOR UPDATE/u),
      index(/FROM buyer_profiles[\s\S]*FOR UPDATE/u),
      index(/FROM checkout_attempts[\s\S]*FOR UPDATE/u),
      index(/FROM orders[\s\S]*FOR UPDATE/u),
      index(/FROM payment_events[\s\S]*FOR UPDATE/u),
      index(/FROM inventory_reservations[\s\S]*FOR UPDATE/u),
    ];
    expect(ordered.every((value) => value >= 0)).toBe(true);
    expect(ordered).toEqual(ordered.toSorted((left, right) => left - right));
    expect(
      transactionSql.slice(ordered[4]! + 1).some(
        (sql) => /FROM provider_events[\s\S]*FOR UPDATE/u.test(sql),
      ),
    ).toBe(false);
  });
});
