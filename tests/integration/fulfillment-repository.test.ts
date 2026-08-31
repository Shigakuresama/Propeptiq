import { createHash } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hashReviewSnapshot } from "@/commerce/checkout-identity";
import { createFulfillmentExecutionContextV1 } from "@/commerce/fulfillment-context";
import { handoffFulfillment } from "@/commerce/fulfillment-service";
import { parseServerEnv } from "@/config/env-schema";
import { resolveExactReviewRequest } from "@/db/repositories/checkout-repository";
import { createFulfillmentRepository } from "@/db/repositories/fulfillment-repository";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  staff: "81000000-0000-4000-8000-000000000001",
  buyer: "81000000-0000-4000-8000-000000000002",
  attestation: "81000000-0000-4000-8000-000000000003",
  acceptance: "81000000-0000-4000-8000-000000000004",
  groupA: "81000000-0000-4000-8000-000000000005",
  groupB: "81000000-0000-4000-8000-000000000006",
  productA: "81000000-0000-4000-8000-000000000007",
  productB: "81000000-0000-4000-8000-000000000008",
  priceA: "81000000-0000-4000-8000-000000000009",
  priceB: "81000000-0000-4000-8000-000000000010",
  lotA1: "81000000-0000-4000-8000-000000000011",
  lotA2: "81000000-0000-4000-8000-000000000012",
  lotB: "81000000-0000-4000-8000-000000000013",
  policyA: "81000000-0000-4000-8000-000000000014",
  policyB: "81000000-0000-4000-8000-000000000015",
  order: "81000000-0000-4000-8000-000000000016",
  itemA: "81000000-0000-4000-8000-000000000017",
  itemB: "81000000-0000-4000-8000-000000000018",
  attempt: "81000000-0000-4000-8000-000000000019",
  sourceEvent: "81000000-0000-4000-8000-000000000020",
  payment: "81000000-0000-4000-8000-000000000021",
  reservationA1: "81000000-0000-4000-8000-000000000022",
  reservationA2: "81000000-0000-4000-8000-000000000023",
  reservationB: "81000000-0000-4000-8000-000000000024",
  reserveEventA1: "81000000-0000-4000-8000-000000000025",
  reserveEventA2: "81000000-0000-4000-8000-000000000026",
  reserveEventB: "81000000-0000-4000-8000-000000000027",
  shipment: "81000000-0000-4000-8000-000000000028",
  refund: "81000000-0000-4000-8000-000000000029",
  disputeEvent: "81000000-0000-4000-8000-000000000030",
  review: "81000000-0000-4000-8000-000000000031",
  newerAttestation: "81000000-0000-4000-8000-000000000032",
  variantA: "81000000-0000-4000-8000-000000000033",
  variantB: "81000000-0000-4000-8000-000000000034",
} as const;

const now = new Date("2026-08-26T12:00:00.000Z");
const sha256 = async (value: string) =>
  createHash("sha256").update(value).digest("hex");

function keyedUuid(label: string): string {
  const hex = createHash("sha256").update(`task6f:${label}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

describe("atomic fulfillment PostgreSQL repository on PGlite", () => {
  let client: PGlite;

  beforeEach(async () => {
    client = await createMigratedPglite();
    await client.exec(`
      INSERT INTO users (id, clerk_id, email_verified_at)
      VALUES
        ('${ids.staff}', 'clerk_fulfillment_staff_6f', '2026-08-01T00:00:00.000Z'),
        ('${ids.buyer}', 'clerk_fulfillment_buyer_6f', '2026-08-01T00:00:00.000Z');
      INSERT INTO buyer_profiles
        (user_id, status, age_confirmed_at, research_purpose, updated_at)
      VALUES
        ('${ids.staff}', 'active', '2026-08-01T00:00:00.000Z', 'analytical', '2026-08-25T00:00:00.000Z'),
        ('${ids.buyer}', 'active', '2026-08-01T00:00:00.000Z', 'analytical', '2026-08-25T00:00:00.000Z');
      INSERT INTO staff_roles
        (user_id, capability, granted_by_user_id, grant_correlation_id)
      VALUES
        ('${ids.staff}', 'fulfillment:release:consume', '${ids.staff}', 'fulfillment-command-authority-6f');
      INSERT INTO attestation_versions
        (id, version, content_hash, policy_text, effective_at)
      VALUES
        ('${ids.attestation}', 1, '${"1".repeat(64)}', 'Historical fulfillment policy.', '2026-08-01T00:00:00.000Z');
      INSERT INTO attestation_acceptances
        (id, user_id, attestation_version_id, accepted_at)
      VALUES
        ('${ids.acceptance}', '${ids.buyer}', '${ids.attestation}', '2026-08-02T00:00:00.000Z');
      INSERT INTO product_policy_groups (id, slug, name, active)
      VALUES
        ('${ids.groupA}', 'fulfillment-group-a', 'Fulfillment group A', true),
        ('${ids.groupB}', 'fulfillment-group-b', 'Fulfillment group B', true);
      INSERT INTO products
        (id, slug, name, package_form, material_identity, policy_group_id, status)
      VALUES
        ('${ids.productA}', 'fulfillment-product-a', 'Reference A', 'Sealed unit', 'Identity A', '${ids.groupA}', 'active'),
        ('${ids.productB}', 'fulfillment-product-b', 'Reference B', 'Sealed unit', 'Identity B', '${ids.groupB}', 'active');
      INSERT INTO product_prices
        (id, product_id, version, amount_minor, currency, effective_at)
      VALUES
        ('${ids.priceA}', '${ids.productA}', 1, 1000, 'USD', '2026-08-01T00:00:00.000Z'),
        ('${ids.priceB}', '${ids.productB}', 1, 1000, 'USD', '2026-08-01T00:00:00.000Z');
      INSERT INTO lots
        (id, product_id, supplier_name, supplier_lot_code,
         received_quantity, available_quantity, status, expires_at)
      VALUES
        ('${ids.lotA1}', '${ids.productA}', 'Synthetic supplier', 'FUL-A1', 10, 4, 'released', '2027-08-26T12:00:00.000Z'),
        ('${ids.lotA2}', '${ids.productA}', 'Synthetic supplier', 'FUL-A2', 10, 3, 'released', '2027-08-26T12:00:00.000Z'),
        ('${ids.lotB}', '${ids.productB}', 'Synthetic supplier', 'FUL-B', 10, 5, 'released', NULL);
      INSERT INTO destination_policies
        (id, scope_kind, product_id, state_code, result, version, active, effective_at)
      VALUES
        ('${ids.policyA}', 'product', '${ids.productA}', 'CA', 'allowed', 1, true, '2026-08-01T00:00:00.000Z'),
        ('${ids.policyB}', 'product', '${ids.productB}', 'CA', 'allowed', 1, true, '2026-08-01T00:00:00.000Z');
      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state, updated_at)
      VALUES
        ('${ids.order}', '${ids.buyer}', 'active', '${ids.acceptance}', 'CA',
         'USD', 5000, 0, 0, 0, 5000, 'paid_pending_fulfillment',
         '2026-08-25T00:00:00.000Z');
      INSERT INTO order_items
        (id, order_id, product_id, product_price_id, destination_policy_id,
         product_name_snapshot, package_form_snapshot, currency,
         unit_amount_minor, quantity, subtotal_minor, discount_minor, total_minor)
      VALUES
        ('${ids.itemA}', '${ids.order}', '${ids.productA}', '${ids.priceA}', '${ids.policyA}',
         'Reference A', 'Sealed unit', 'USD', 1000, 3, 3000, 0, 3000),
        ('${ids.itemB}', '${ids.order}', '${ids.productB}', '${ids.priceB}', '${ids.policyB}',
         'Reference B', 'Sealed unit', 'USD', 1000, 2, 2000, 0, 2000);
      INSERT INTO order_shipping_addresses
        (order_id, recipient_name, address_line1, city, state_code, postal_code, country)
      VALUES
        ('${ids.order}', 'Private Recipient Sentinel', '100 Private Address Sentinel',
         'Test City', 'CA', '90210', 'US');
      INSERT INTO checkout_attempts
        (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         reasons, tax_ready, shipping_ready, provider, provider_request_id,
         provider_session_id, provider_request_hash, provider_customer_email,
         provider_origin, provider_request_schema_version, provider_livemode,
         provider_scope, tax_quote_reference, shipping_quote_reference,
         shipping_service, expires_at, review_authorization_mode)
      VALUES
        ('${ids.attempt}', '${ids.order}', '${ids.buyer}', 'fulfillment-checkout-6f',
         '${"2".repeat(64)}', 'completed', 'pass', 'pass', 'pass', 'pass',
         'pass', 'pass', true, false, '{}', true, true, 'local_test',
         'checkout_attempt:${ids.attempt}', 'cs_fulfillment_6f', '${"3".repeat(64)}',
         'private-buyer@example.test', 'http://localhost:3000', 1, false,
         'local_test:synthetic-propeptiq-v1', 'tax_fulfillment_6f',
         'ship_fulfillment_6f', 'synthetic_ground', '2027-08-26T12:00:00.000Z',
         'none');
      INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status, attempt_count,
         received_at, processed_at, event_type, schema_version,
         normalized_payload, provider_created_at, livemode)
      VALUES
        ('${ids.sourceEvent}', 'local_test', 'evt_fulfillment_paid_6f', '${"4".repeat(64)}',
         'processed', 1, '2026-08-25T10:00:00.000Z', '2026-08-25T10:01:00.000Z',
         'checkout.session.completed', 1,
         '{"schemaVersion":1,"kind":"checkout_session","providerEventId":"evt_fulfillment_paid_6f","eventType":"checkout.session.completed","providerCreatedAt":"2026-08-25T10:00:00.000Z","livemode":false,"sessionId":"cs_fulfillment_6f","orderId":"${ids.order}","attemptId":"${ids.attempt}","paymentIntentId":"pi_fulfillment_6f","amountMinor":5000,"currency":"usd","paymentStatus":"paid","sessionStatus":"complete"}'::jsonb,
         '2026-08-25T10:00:00.000Z', false);
      INSERT INTO payment_events
        (id, provider_event_id, order_id, event_type, provider_payment_id,
         idempotency_key, amount_minor, currency, occurred_at)
      VALUES
        ('${ids.payment}', '${ids.sourceEvent}', '${ids.order}', 'payment_verified',
         'pi_fulfillment_6f', 'local_test:payment_intent:pi_fulfillment_6f',
         5000, 'USD', '2026-08-25T10:00:00.000Z');
      INSERT INTO inventory_reservations
        (id, checkout_attempt_id, idempotency_key, order_id, order_item_id,
         product_id, lot_id, quantity_reserved, quantity_remaining, state,
         expires_at, updated_at)
      VALUES
        ('${ids.reservationA1}', '${ids.attempt}', 'reserve-a1-6f', '${ids.order}', '${ids.itemA}', '${ids.productA}', '${ids.lotA1}', 1, 1, 'active', '2026-08-25T11:00:00.000Z', '2026-08-25T10:00:00.000Z'),
        ('${ids.reservationA2}', '${ids.attempt}', 'reserve-a2-6f', '${ids.order}', '${ids.itemA}', '${ids.productA}', '${ids.lotA2}', 2, 2, 'active', '2026-08-25T11:00:00.000Z', '2026-08-25T10:00:00.000Z'),
        ('${ids.reservationB}', '${ids.attempt}', 'reserve-b-6f', '${ids.order}', '${ids.itemB}', '${ids.productB}', '${ids.lotB}', 2, 2, 'active', '2026-08-25T11:00:00.000Z', '2026-08-25T10:00:00.000Z');
      INSERT INTO inventory_events
        (id, idempotency_key, event_type, lot_id, order_id, order_item_id,
         reservation_id, quantity, balance_after, occurred_at)
      VALUES
        ('${ids.reserveEventA1}', 'reserve-event-a1-6f', 'reservation', '${ids.lotA1}', '${ids.order}', '${ids.itemA}', '${ids.reservationA1}', 1, 4, '2026-08-25T10:00:00.000Z'),
        ('${ids.reserveEventA2}', 'reserve-event-a2-6f', 'reservation', '${ids.lotA2}', '${ids.order}', '${ids.itemA}', '${ids.reservationA2}', 2, 3, '2026-08-25T10:00:00.000Z'),
        ('${ids.reserveEventB}', 'reserve-event-b-6f', 'reservation', '${ids.lotB}', '${ids.order}', '${ids.itemB}', '${ids.reservationB}', 2, 5, '2026-08-25T10:00:00.000Z');
      INSERT INTO shipments
        (id, order_id, carrier, tracking_reference, state, updated_at)
      VALUES
        ('${ids.shipment}', '${ids.order}', 'PRIVATE-CARRIER-SENTINEL',
         'PRIVATE-TRACKING-SENTINEL', 'pending', '2026-08-25T11:00:00.000Z');
    `);
  });

  afterEach(async () => client.close());

  function setup(options: Readonly<{
    failAfter?: string;
    trace?: string[];
    queryTrace?: Array<{ sql: string; params: readonly unknown[] }>;
    reviewCalls?: unknown[];
    zeroWritePattern?: RegExp;
  }> = {}) {
    return createFulfillmentRepository({
      runSerializableTransaction: (work) =>
        client.transaction((transaction) =>
          work({
            query: (sql, params = []) => {
              options.trace?.push(sql);
              options.queryTrace?.push({ sql, params: [...params] });
              if (options.zeroWritePattern?.test(sql)) {
                return Promise.resolve({ rows: [] }) as never;
              }
              return transaction.query(sql, [...params]);
            },
          }),
        ),
      sha256,
      keyedUuid,
      retrySleep: async () => undefined,
      ...(options.failAfter === undefined
        ? {}
        : { afterWriteStage: async (stage: string) => {
            if (stage === options.failAfter) {
              throw new Error(`synthetic rollback after ${stage}`);
            }
          } }),
      ...(options.reviewCalls === undefined
        ? {}
        : {
            resolveExactReviewRequest: async (...args: Parameters<typeof resolveExactReviewRequest>) => {
              options.reviewCalls!.push({
                input: args[1],
                options: args[3],
              });
              return resolveExactReviewRequest(...args);
            },
          }),
    });
  }

  const command = () => ({
    actorUserId: ids.staff,
    actorClerkUserId: "clerk_fulfillment_staff_6f",
    orderId: ids.order,
    now,
    correlationId: "fulfillment-command-6f",
  });

  async function physicalAuthoritySnapshot(): Promise<string> {
    const tables = [
      "rate_limit_windows",
      "admin_audit",
      "refunds",
      "orders",
      "fulfillment_releases",
      "shipments",
      "inventory_reservations",
      "inventory_events",
      "lots",
      "downstream_effects",
    ] as const;
    const snapshot: Record<string, unknown> = {};
    for (const table of tables) {
      snapshot[table] = (await client.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;
    }
    return JSON.stringify(snapshot);
  }

  async function nonShipmentAuthoritySnapshot(): Promise<string> {
    const tables = [
      "refunds",
      "payment_events",
      "provider_events",
      "orders",
      "fulfillment_releases",
      "inventory_reservations",
      "inventory_events",
      "lots",
      "downstream_effects",
    ] as const;
    const snapshot: Record<string, unknown> = {};
    for (const table of tables) {
      snapshot[table] = (await client.query(`SELECT * FROM ${table} ORDER BY 1`)).rows;
    }
    return JSON.stringify(snapshot);
  }

  async function seedBuyerReview(options: Readonly<{
    outcome?: "approved" | "rejected";
    coversBuyerReview?: boolean;
    authorizationMode?: "bound" | "none";
  }> = {}) {
    await client.exec(
      `UPDATE buyer_profiles SET status = 'review' WHERE user_id = '${ids.buyer}'`,
    );
    const reviewInput = {
      orderId: ids.order,
      buyerUserId: ids.buyer,
      buyerStatus: "review" as const,
      acceptedAttestationVersionId: ids.attestation,
      currentAttestationVersionId: ids.attestation,
      items: [
        { productId: ids.productA, quantity: 3 },
        { productId: ids.productB, quantity: 2 },
      ],
      promotionIds: [],
      destination: {
        recipientName: "Private Recipient Sentinel",
        line1: "100 Private Address Sentinel",
        line2: null,
        city: "Test City",
        stateCode: "CA",
        postalCode: "90210",
        countryCode: "US" as const,
      },
      reviewPolicies: [],
    };
    const reviewHash = await hashReviewSnapshot(reviewInput, sha256);
    await client.query(
      `INSERT INTO review_requests
        (id, user_id, order_id, snapshot_hash, buyer_status_snapshot,
         attestation_version_id, destination_state_code, cart_snapshot,
         buyer_review_required, destination_review_required, outcome,
         decided_by_user_id, decided_at, covers_buyer_review)
       VALUES
        ($1::uuid, $2::uuid, $3::uuid, $4, 'review', $5::uuid, 'CA',
         $6::jsonb, true, false, $7, $8::uuid,
         '2026-08-25T12:00:00.000Z', $9)` ,
      [
        ids.review,
        ids.buyer,
        ids.order,
        reviewHash,
        ids.attestation,
        JSON.stringify({
          schemaVersion: 1,
          items: reviewInput.items,
          promotionIds: [],
        }),
        options.outcome ?? "approved",
        ids.staff,
        options.coversBuyerReview ?? true,
      ],
    );
    await client.query(
      `INSERT INTO checkout_attempt_review_bindings
        (checkout_attempt_id, order_id, review_request_id,
         review_snapshot_hash, bound_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4,
               '2026-08-25T12:00:00.000Z')`,
      [ids.attempt, ids.order, ids.review, reviewHash],
    );
    if ((options.authorizationMode ?? "bound") === "bound") {
      await client.exec(`
        ALTER TABLE checkout_attempts
          DISABLE TRIGGER checkout_attempt_review_authorization_mode_immutable;
        UPDATE checkout_attempts SET review_authorization_mode = 'bound'
        WHERE id = '${ids.attempt}';
        ALTER TABLE checkout_attempts
          ENABLE TRIGGER checkout_attempt_review_authorization_mode_immutable;
      `);
    }
    return reviewInput;
  }

  async function expectNoFulfillmentAuthority(): Promise<void> {
    expect((await client.query(`
      SELECT
        (SELECT count(*)::int FROM fulfillment_releases) AS releases,
        (SELECT count(*)::int FROM downstream_effects) AS effects,
        (SELECT state FROM shipments WHERE id = '${ids.shipment}') AS shipment
    `)).rows).toEqual([{ releases: 0, effects: 0, shipment: "pending" }]);
  }

  async function setMigrationEraAuthorizationMode(): Promise<void> {
    await client.exec(`
      ALTER TABLE checkout_attempts
        DISABLE TRIGGER checkout_attempt_review_authorization_mode_immutable;
      UPDATE checkout_attempts SET review_authorization_mode = NULL
      WHERE id = '${ids.attempt}';
      ALTER TABLE checkout_attempts
        ENABLE TRIGGER checkout_attempt_review_authorization_mode_immutable;
    `);
  }

  async function setCanonicalReservationVariantIdentities(): Promise<void> {
    await client.exec(`
      INSERT INTO product_variants
        (id, product_id, sku, label, canonical_amount, amount_unit,
         package_quantity, status)
      VALUES
        ('${ids.variantA}', '${ids.productA}', 'FULFILLMENT-VARIANT-A',
         'Fulfillment variant A', 5, 'mg', 1, 'active'),
        ('${ids.variantB}', '${ids.productB}', 'FULFILLMENT-VARIANT-B',
         'Fulfillment variant B', 10, 'mg', 1, 'active');
      UPDATE product_prices
      SET variant_id = CASE id
        WHEN '${ids.priceA}'::uuid THEN '${ids.variantA}'::uuid
        ELSE '${ids.variantB}'::uuid
      END
      WHERE id IN ('${ids.priceA}', '${ids.priceB}');
      UPDATE order_items
      SET variant_id = CASE id
        WHEN '${ids.itemA}'::uuid THEN '${ids.variantA}'::uuid
        ELSE '${ids.variantB}'::uuid
      END
      WHERE id IN ('${ids.itemA}', '${ids.itemB}');
      UPDATE lots
      SET variant_id = CASE product_id
        WHEN '${ids.productA}'::uuid THEN '${ids.variantA}'::uuid
        ELSE '${ids.variantB}'::uuid
      END
      WHERE id IN ('${ids.lotA1}', '${ids.lotA2}', '${ids.lotB}');
      UPDATE inventory_reservations
      SET variant_id = CASE product_id
        WHEN '${ids.productA}'::uuid THEN '${ids.variantA}'::uuid
        ELSE '${ids.variantB}'::uuid
      END
      WHERE id IN ('${ids.reservationA1}', '${ids.reservationA2}', '${ids.reservationB}');
    `);
  }

  it("returns before authorization and preserves a byte-equivalent authority snapshot for disabled or forged context", async () => {
    const repository = setup();
    for (const executionContext of [
      createFulfillmentExecutionContextV1(parseServerEnv({})),
      { enabled: true },
    ]) {
      const before = await physicalAuthoritySnapshot();
      let authorizationCalls = 0;
      await expect(handoffFulfillment({
        actorUserId: ids.staff,
        orderId: ids.order,
        now,
        correlationId: "disabled-fulfillment-6f",
        executionContext,
        repository,
        authorize: async () => {
          authorizationCalls += 1;
          return {
            actorUserId: ids.staff,
            actorClerkUserId: "clerk_fulfillment_staff_6f",
          };
        },
      })).resolves.toEqual({ status: "unavailable" });
      expect(authorizationCalls).toBe(0);
      expect(await physicalAuthoritySnapshot()).toBe(before);
    }
  });

  it("locks an actor-equals-buyer user/profile exactly once", async () => {
    await client.exec(`
      INSERT INTO staff_roles
        (user_id, capability, granted_by_user_id, grant_correlation_id)
      VALUES
        ('${ids.buyer}', 'fulfillment:release:consume', '${ids.staff}',
         'buyer-self-fulfillment-6f')
    `);
    const queryTrace: Array<{ sql: string; params: readonly unknown[] }> = [];
    await expect(setup({ queryTrace }).handoff({
      ...command(),
      actorUserId: ids.buyer,
      actorClerkUserId: "clerk_fulfillment_buyer_6f",
    })).resolves.toEqual({ status: "handed_off" });
    const userLock = queryTrace.find(({ sql }) =>
      /FROM users[\s\S]*ORDER BY id FOR UPDATE/iu.test(sql),
    );
    const profileLock = queryTrace.find(({ sql }) =>
      /FROM buyer_profiles[\s\S]*ORDER BY user_id FOR UPDATE/iu.test(sql),
    );
    expect(userLock?.params).toEqual([ids.buyer]);
    expect(profileLock?.params).toEqual([ids.buyer]);
  });

  it("sorts the reversed actor/target user pair before either profile or role lock", async () => {
    const staffAcceptance = "81000000-0000-4000-8000-000000000096";
    const reverseOrder = "81000000-0000-4000-8000-000000000097";
    const reverseItem = "81000000-0000-4000-8000-000000000098";
    const reverseAttempt = "81000000-0000-4000-8000-000000000099";
    const reverseReservation = "81000000-0000-4000-8000-000000000100";
    const reverseSource = "81000000-0000-4000-8000-000000000101";
    const reversePayment = "81000000-0000-4000-8000-000000000102";
    const reverseShipment = "81000000-0000-4000-8000-000000000103";
    await client.exec(`
      INSERT INTO staff_roles
        (user_id, capability, granted_by_user_id, grant_correlation_id)
      VALUES
        ('${ids.buyer}', 'fulfillment:release:consume', '${ids.staff}',
         'reverse-pair-fulfillment-6f');
      INSERT INTO attestation_acceptances
        (id, user_id, attestation_version_id, accepted_at)
      VALUES
        ('${staffAcceptance}', '${ids.staff}', '${ids.attestation}',
         '2026-08-02T00:00:00.000Z');
      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state, updated_at)
      VALUES
        ('${reverseOrder}', '${ids.staff}', 'active', '${staffAcceptance}',
         'CA', 'USD', 5000, 0, 0, 0, 5000,
         'paid_pending_fulfillment', '2026-08-25T00:00:00.000Z');
      INSERT INTO order_items
        (id, order_id, product_id, product_price_id, destination_policy_id,
         product_name_snapshot, package_form_snapshot, currency,
         unit_amount_minor, quantity, subtotal_minor, discount_minor, total_minor)
      VALUES
        ('${reverseItem}', '${reverseOrder}', '${ids.productA}', '${ids.priceA}',
         '${ids.policyA}', 'Reference A', 'Sealed unit', 'USD',
         1000, 5, 5000, 0, 5000);
      INSERT INTO order_shipping_addresses
        (order_id, recipient_name, address_line1, city, state_code,
         postal_code, country)
      VALUES
        ('${reverseOrder}', 'Reverse Staff', '200 Reverse Test Way',
         'Test City', 'CA', '90210', 'US');
      INSERT INTO checkout_attempts
        (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         reasons, tax_ready, shipping_ready, provider, provider_request_id,
         provider_session_id, provider_request_hash, provider_customer_email,
         provider_origin, provider_request_schema_version, provider_livemode,
         provider_scope, tax_quote_reference, shipping_quote_reference,
         shipping_service, expires_at, review_authorization_mode)
      VALUES
        ('${reverseAttempt}', '${reverseOrder}', '${ids.staff}',
         'reverse-checkout-6f', '${"9".repeat(64)}', 'completed',
         'pass', 'pass', 'pass', 'pass', 'pass', 'pass', true, false,
         '{}', true, true, 'local_test',
         'checkout_attempt:${reverseAttempt}', 'cs_reverse_pair_6f',
         '${"a".repeat(64)}', 'reverse-staff@example.test',
         'http://localhost:3000', 1, false,
         'local_test:synthetic-propeptiq-v1', 'tax_reverse_6f',
         'ship_reverse_6f', 'synthetic_ground',
         '2027-08-26T12:00:00.000Z', 'none');
      INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status, attempt_count,
         received_at, processed_at, event_type, schema_version,
         normalized_payload, provider_created_at, livemode)
      VALUES
        ('${reverseSource}', 'local_test', 'evt_reverse_pair_paid_6f',
         '${"b".repeat(64)}', 'processed', 1,
         '2026-08-25T10:00:00.000Z', '2026-08-25T10:01:00.000Z',
         'checkout.session.completed', 1,
         '{"schemaVersion":1,"kind":"checkout_session","providerEventId":"evt_reverse_pair_paid_6f","eventType":"checkout.session.completed","providerCreatedAt":"2026-08-25T10:00:00.000Z","livemode":false,"sessionId":"cs_reverse_pair_6f","orderId":"${reverseOrder}","attemptId":"${reverseAttempt}","paymentIntentId":"pi_reverse_pair_6f","amountMinor":5000,"currency":"usd","paymentStatus":"paid","sessionStatus":"complete"}'::jsonb,
         '2026-08-25T10:00:00.000Z', false);
      INSERT INTO payment_events
        (id, provider_event_id, order_id, event_type, provider_payment_id,
         idempotency_key, amount_minor, currency, occurred_at)
      VALUES
        ('${reversePayment}', '${reverseSource}', '${reverseOrder}',
         'payment_verified', 'pi_reverse_pair_6f',
         'local_test:payment_intent:pi_reverse_pair_6f', 5000, 'USD',
         '2026-08-25T10:00:00.000Z');
      INSERT INTO inventory_reservations
        (id, checkout_attempt_id, idempotency_key, order_id, order_item_id,
         product_id, lot_id, quantity_reserved, quantity_remaining, state,
         expires_at, updated_at)
      VALUES
        ('${reverseReservation}', '${reverseAttempt}', 'reserve-reverse-6f',
         '${reverseOrder}', '${reverseItem}', '${ids.productA}', '${ids.lotA1}',
         5, 5, 'active', '2026-08-25T11:00:00.000Z',
         '2026-08-25T10:00:00.000Z');
      INSERT INTO shipments
        (id, order_id, carrier, tracking_reference, state, updated_at)
      VALUES
        ('${reverseShipment}', '${reverseOrder}', 'REVERSE-CARRIER',
         'REVERSE-TRACKING', 'pending', '2026-08-25T11:00:00.000Z')
    `);
    const queryTrace: Array<{ sql: string; params: readonly unknown[] }> = [];
    await expect(setup({ queryTrace }).handoff({
      ...command(),
      actorUserId: ids.buyer,
      actorClerkUserId: "clerk_fulfillment_buyer_6f",
      orderId: reverseOrder,
    })).resolves.toEqual({ status: "handed_off" });
    const userLockIndex = queryTrace.findIndex(({ sql }) =>
      /FROM users[\s\S]*ORDER BY id FOR UPDATE/iu.test(sql),
    );
    const profileLockIndex = queryTrace.findIndex(({ sql }) =>
      /FROM buyer_profiles[\s\S]*ORDER BY user_id FOR UPDATE/iu.test(sql),
    );
    const roleLockIndex = queryTrace.findIndex(({ sql }) =>
      /FROM staff_roles[\s\S]*ORDER BY capability, id FOR UPDATE/iu.test(sql),
    );
    expect(queryTrace[userLockIndex]?.params).toEqual([ids.staff, ids.buyer]);
    expect(queryTrace[profileLockIndex]?.params).toEqual([ids.staff, ids.buyer]);
    expect([userLockIndex, profileLockIndex, roleLockIndex]).toEqual(
      [userLockIndex, profileLockIndex, roleLockIndex]
        .toSorted((left, right) => left - right),
    );
  });

  it("atomically hands off every line/lot exactly once with one redacted effect and audit", async () => {
    expect((await client.query<{ mode: string }>(`
      SELECT review_authorization_mode AS mode
      FROM checkout_attempts WHERE id = '${ids.attempt}'
    `)).rows).toEqual([{ mode: "none" }]);
    await expect(setup().handoff(command())).resolves.toEqual({ status: "handed_off" });
    const releaseId = keyedUuid(`fulfillment-release:${ids.order}:1`);
    const effectId = keyedUuid(`fulfillment-handoff-effect:${releaseId}`);
    const facts = await client.query<{
      orderState: string;
      releaseId: string;
      releaseKey: string;
      paymentEventId: string;
      reviewRequestId: string | null;
      releaseState: string;
      version: number;
      issuedAt: Date;
      expiresAt: Date;
      consumedAt: Date;
      shipmentState: string;
      shipmentReleaseId: string;
      handedOffAt: Date;
      reservations: number;
      consumes: number;
      effects: number;
      audits: number;
      effectPayload: unknown;
      auditMetadata: unknown;
    }>(`
      SELECT o.state AS "orderState", fr.id::text AS "releaseId",
             fr.idempotency_key AS "releaseKey",
             fr.payment_event_id::text AS "paymentEventId",
             fr.review_request_id::text AS "reviewRequestId",
             fr.state AS "releaseState", fr.version,
             fr.issued_at AS "issuedAt", fr.expires_at AS "expiresAt",
             fr.consumed_at AS "consumedAt", s.state AS "shipmentState",
             s.fulfillment_release_id::text AS "shipmentReleaseId",
             s.handed_off_at AS "handedOffAt",
             (SELECT count(*)::int FROM inventory_reservations
              WHERE order_id = o.id AND state = 'consumed' AND quantity_remaining = 0) AS reservations,
             (SELECT count(*)::int FROM inventory_events
              WHERE order_id = o.id AND event_type = 'consume') AS consumes,
             (SELECT count(*)::int FROM downstream_effects
              WHERE order_id = o.id AND effect_type = 'fulfillment_handed_off') AS effects,
             (SELECT count(*)::int FROM admin_audit
              WHERE resource_id = o.id::text AND action = 'fulfillment.handed_off') AS audits,
             (SELECT payload FROM downstream_effects WHERE id = '${effectId}') AS "effectPayload",
             (SELECT metadata FROM admin_audit
              WHERE resource_id = o.id::text AND action = 'fulfillment.handed_off') AS "auditMetadata"
      FROM orders o
      JOIN fulfillment_releases fr ON fr.order_id = o.id
      JOIN shipments s ON s.order_id = o.id
      WHERE o.id = '${ids.order}'
    `);
    expect(facts.rows[0]).toMatchObject({
      orderState: "fulfilled",
      releaseId,
      releaseKey: `fulfillment_release:${ids.order}:1`,
      paymentEventId: ids.payment,
      reviewRequestId: null,
      releaseState: "consumed",
      version: 1,
      shipmentState: "handed_off",
      shipmentReleaseId: releaseId,
      reservations: 3,
      consumes: 3,
      effects: 1,
      audits: 1,
      effectPayload: {
        schemaVersion: 1,
        orderId: ids.order,
        shipmentId: ids.shipment,
        fulfillmentReleaseId: releaseId,
      },
    });
    expect(facts.rows[0]!.issuedAt.toISOString()).toBe(now.toISOString());
    expect(facts.rows[0]!.consumedAt.toISOString()).toBe(now.toISOString());
    expect(facts.rows[0]!.handedOffAt.toISOString()).toBe(now.toISOString());
    expect(facts.rows[0]!.expiresAt.toISOString()).toBe("2026-08-26T12:05:00.000Z");
    expect(facts.rows[0]!.auditMetadata).toEqual({
      schemaVersion: 1,
      paymentEventId: ids.payment,
      fulfillmentReleaseId: releaseId,
      shipmentId: ids.shipment,
    });
    const consumeRows = await client.query<{
      id: string;
      key: string;
      reservationId: string;
      releaseId: string;
      quantity: number;
      balanceAfter: number;
    }>(`
      SELECT id::text AS id, idempotency_key AS key,
             reservation_id::text AS "reservationId",
             fulfillment_release_id::text AS "releaseId", quantity,
             balance_after AS "balanceAfter"
      FROM inventory_events WHERE event_type = 'consume'
      ORDER BY reservation_id
    `);
    expect(consumeRows.rows).toEqual(([
      [ids.reservationA1, 1, 4],
      [ids.reservationA2, 2, 3],
      [ids.reservationB, 2, 5],
    ] as const).map(([reservationId, quantity, balanceAfter]) => ({
      id: keyedUuid(`inventory-consume:${reservationId}`),
      key: `inventory:consume:${reservationId}`,
      reservationId,
      releaseId,
      quantity,
      balanceAfter,
    })));
    const serialized = JSON.stringify({
      effect: facts.rows[0]!.effectPayload,
      audit: facts.rows[0]!.auditMetadata,
    });
    for (const forbidden of [
      "Private Recipient Sentinel",
      "Private Address Sentinel",
      "PRIVATE-CARRIER-SENTINEL",
      "PRIVATE-TRACKING-SENTINEL",
      "private-buyer@example.test",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    const lots = await client.query<{ id: string; available: number }>(`
      SELECT id::text AS id, available_quantity AS available
      FROM lots WHERE id IN ('${ids.lotA1}', '${ids.lotA2}', '${ids.lotB}')
      ORDER BY id
    `);
    expect(lots.rows).toEqual([
      { id: ids.lotA1, available: 4 },
      { id: ids.lotA2, available: 3 },
      { id: ids.lotB, available: 5 },
    ]);
  });

  it("fails closed for a bound attempt whose binding is missing after review facts relax", async () => {
    await seedBuyerReview();
    await client.exec(`
      DELETE FROM checkout_attempt_review_bindings
      WHERE checkout_attempt_id = '${ids.attempt}';
      UPDATE buyer_profiles SET status = 'active'
      WHERE user_id = '${ids.buyer}';
    `);
    await expect(setup().handoff(command())).resolves.toEqual({ status: "conflict" });
    await expectNoFulfillmentAuthority();
  });

  it("fails closed for a bound review whose exact facts no longer match even when current facts allow", async () => {
    await seedBuyerReview();
    await client.exec(`
      UPDATE buyer_profiles SET status = 'active'
      WHERE user_id = '${ids.buyer}';
    `);
    await expect(setup().handoff(command())).resolves.toEqual({ status: "conflict" });
    await expectNoFulfillmentAuthority();
  });

  it("fails closed when a none-authorized attempt possesses any review binding", async () => {
    await seedBuyerReview({ authorizationMode: "none" });
    await client.exec(`
      UPDATE buyer_profiles SET status = 'active'
      WHERE user_id = '${ids.buyer}';
    `);
    await expect(setup().handoff(command())).resolves.toEqual({ status: "conflict" });
    await expectNoFulfillmentAuthority();
  });

  it("fails closed when current facts require review for a none-authorized attempt", async () => {
    await client.exec(`
      UPDATE buyer_profiles SET status = 'review'
      WHERE user_id = '${ids.buyer}';
    `);
    await expect(setup().handoff(command())).resolves.toEqual({ status: "conflict" });
    await expectNoFulfillmentAuthority();
  });

  it("fails closed for a fulfillment-eligible migration-era attempt with ambiguous authorization", async () => {
    await client.exec(`
      ALTER TABLE checkout_attempts
        DISABLE TRIGGER checkout_attempt_review_authorization_mode_immutable;
      UPDATE checkout_attempts SET review_authorization_mode = NULL
      WHERE id = '${ids.attempt}';
      ALTER TABLE checkout_attempts
        ENABLE TRIGGER checkout_attempt_review_authorization_mode_immutable;
    `);
    await expect(setup().handoff(command())).resolves.toEqual({ status: "conflict" });
    await expectNoFulfillmentAuthority();
  });

  it("retries 40001 then 40P01 with the same captured now and deterministic identities", async () => {
    let attempts = 0;
    const sleeps: string[] = [];
    const repository = createFulfillmentRepository({
      runSerializableTransaction: async (work) => {
        attempts += 1;
        if (attempts <= 2) {
          throw Object.assign(new Error("synthetic serializable retry"), {
            code: attempts === 1 ? "40001" : "40P01",
          });
        }
        return client.transaction((transaction) =>
          work({
            query: (sql, params = []) => transaction.query(sql, [...params]),
          }),
        );
      },
      sha256,
      keyedUuid,
      retrySleep: async (retryNumber, sqlState) => {
        sleeps.push(`${retryNumber}:${sqlState}`);
      },
    });
    await expect(repository.handoff(command())).resolves.toEqual({
      status: "handed_off",
    });
    expect(attempts).toBe(3);
    expect(sleeps).toEqual(["1:40001", "2:40P01"]);
    const releaseId = keyedUuid(`fulfillment-release:${ids.order}:1`);
    const facts = await client.query<{
      releaseId: string;
      issuedAt: Date;
      consumedAt: Date;
      handedOffAt: Date;
      effectId: string;
    }>(`
      SELECT fr.id::text AS "releaseId", fr.issued_at AS "issuedAt",
             fr.consumed_at AS "consumedAt", s.handed_off_at AS "handedOffAt",
             e.id::text AS "effectId"
      FROM fulfillment_releases fr
      JOIN shipments s ON s.fulfillment_release_id = fr.id
      JOIN downstream_effects e ON e.order_id = fr.order_id
      WHERE fr.order_id = '${ids.order}'
    `);
    expect(facts.rows[0]).toMatchObject({
      releaseId,
      effectId: keyedUuid(`fulfillment-handoff-effect:${releaseId}`),
    });
    for (const instant of [
      facts.rows[0]!.issuedAt,
      facts.rows[0]!.consumedAt,
      facts.rows[0]!.handedOffAt,
    ]) {
      expect(instant.toISOString()).toBe(now.toISOString());
    }
  });

  it("hands off a canonical reservation tuple only when every variant identity is exact", async () => {
    await setCanonicalReservationVariantIdentities();
    await expect(setup().handoff(command())).resolves.toEqual({ status: "handed_off" });
    expect((await client.query(`SELECT
      (SELECT count(*)::int FROM fulfillment_releases) AS releases,
      (SELECT count(*)::int FROM inventory_events WHERE event_type = 'consume') AS consumes,
      (SELECT count(*)::int FROM inventory_reservations
       WHERE variant_id IS NOT NULL AND state = 'consumed') AS canonical_consumed`)).rows[0])
      .toEqual({ releases: 1, consumes: 3, canonical_consumed: 3 });
  });

  it("rejects canonical fulfillment when a reservation omits its exact variant identity", async () => {
    await setCanonicalReservationVariantIdentities();
    await client.exec(`UPDATE inventory_reservations
      SET variant_id = NULL
      WHERE id = '${ids.reservationA1}'`);
    await expect(setup().handoff(command())).resolves.toEqual({
      status: "held",
      reasons: expect.arrayContaining([
        "inventory_reservation_missing",
        "reserved_lot_unavailable",
      ]),
    });
    await expectNoFulfillmentAuthority();
  });

  it("rejects terminal replay when a consumed canonical reservation loses its variant identity", async () => {
    await setCanonicalReservationVariantIdentities();
    const repository = setup();
    await expect(repository.handoff(command())).resolves.toEqual({ status: "handed_off" });
    const before = await client.query(`SELECT
      (SELECT count(*)::int FROM fulfillment_releases) AS releases,
      (SELECT count(*)::int FROM inventory_events WHERE event_type = 'consume') AS consumes,
      (SELECT count(*)::int FROM downstream_effects
       WHERE effect_type = 'fulfillment_handed_off') AS effects`);
    await client.exec(`UPDATE inventory_reservations
      SET variant_id = NULL
      WHERE id = '${ids.reservationA1}'`);
    await expect(repository.handoff(command())).resolves.toEqual({ status: "conflict" });
    expect((await client.query(`SELECT
      (SELECT count(*)::int FROM fulfillment_releases) AS releases,
      (SELECT count(*)::int FROM inventory_events WHERE event_type = 'consume') AS consumes,
      (SELECT count(*)::int FROM downstream_effects
       WHERE effect_type = 'fulfillment_handed_off') AS effects`)).rows).toEqual(before.rows);
  });

  it("accepts only a complete terminal handoff replay and never repairs a partial tuple", async () => {
    const repository = setup();
    await repository.handoff(command());
    const before = await client.query<{ audits: number; effects: number; consumes: number }>(`
      SELECT
        (SELECT count(*)::int FROM admin_audit) AS audits,
        (SELECT count(*)::int FROM downstream_effects) AS effects,
        (SELECT count(*)::int FROM inventory_events WHERE event_type = 'consume') AS consumes
    `);
    await expect(repository.handoff(command())).resolves.toEqual({ status: "already_handed_off" });
    const after = await client.query<{ audits: number; effects: number; consumes: number }>(`
      SELECT
        (SELECT count(*)::int FROM admin_audit) AS audits,
        (SELECT count(*)::int FROM downstream_effects) AS effects,
        (SELECT count(*)::int FROM inventory_events WHERE event_type = 'consume') AS consumes
    `);
    expect(after.rows).toEqual(before.rows);
    await client.exec(`DELETE FROM downstream_effects`);
    await expect(repository.handoff(command())).resolves.toEqual({ status: "conflict" });
    expect((await client.query(`SELECT count(*)::int AS count FROM downstream_effects`)).rows).toEqual([{ count: 0 }]);
  });

  it("replays a proven historical handoff with a migration-era null authorization mode", async () => {
    const repository = setup();
    await expect(repository.handoff(command())).resolves.toEqual({ status: "handed_off" });
    await setMigrationEraAuthorizationMode();
    const before = await client.query<{ releases: number; effects: number }>(`
      SELECT (SELECT count(*)::int FROM fulfillment_releases) AS releases,
             (SELECT count(*)::int FROM downstream_effects) AS effects
    `);
    await expect(repository.handoff(command())).resolves.toEqual({
      status: "already_handed_off",
    });
    expect((await client.query<{ releases: number; effects: number }>(`
      SELECT (SELECT count(*)::int FROM fulfillment_releases) AS releases,
             (SELECT count(*)::int FROM downstream_effects) AS effects
    `)).rows).toEqual(before.rows);
  });

  it("allows the exact exception transition after a proven null-mode handoff", async () => {
    const repository = setup();
    await expect(repository.handoff(command())).resolves.toEqual({ status: "handed_off" });
    const before = await client.query<{ releases: number; effects: number }>(`
      SELECT (SELECT count(*)::int FROM fulfillment_releases) AS releases,
             (SELECT count(*)::int FROM downstream_effects) AS effects
    `);
    await setMigrationEraAuthorizationMode();
    await expect(repository.transitionShipment({
      ...command(), action: "record_exception",
    })).resolves.toEqual({ status: "exception" });
    expect((await client.query<{ releases: number; effects: number }>(`
      SELECT (SELECT count(*)::int FROM fulfillment_releases) AS releases,
             (SELECT count(*)::int FROM downstream_effects) AS effects
    `)).rows).toEqual(before.rows);
  });

  it("allows the exact delivered transition after a proven null-mode handoff", async () => {
    const repository = setup();
    await expect(repository.handoff(command())).resolves.toEqual({ status: "handed_off" });
    const before = await client.query<{ releases: number; effects: number }>(`
      SELECT (SELECT count(*)::int FROM fulfillment_releases) AS releases,
             (SELECT count(*)::int FROM downstream_effects) AS effects
    `);
    await setMigrationEraAuthorizationMode();
    await expect(repository.transitionShipment({
      ...command(), action: "deliver",
    })).resolves.toEqual({ status: "delivered" });
    expect((await client.query<{ releases: number; effects: number }>(`
      SELECT (SELECT count(*)::int FROM fulfillment_releases) AS releases,
             (SELECT count(*)::int FROM downstream_effects) AS effects
    `)).rows).toEqual(before.rows);
  });

  it("rejects null-mode terminal text without an exact durable handoff tuple", async () => {
    const repository = setup();
    await expect(repository.handoff(command())).resolves.toEqual({ status: "handed_off" });
    await setMigrationEraAuthorizationMode();
    await client.exec(`
      DELETE FROM downstream_effects
      WHERE order_id = '${ids.order}' AND effect_type = 'fulfillment_handed_off';
    `);
    await expect(repository.handoff(command())).resolves.toEqual({ status: "conflict" });
    await expect(repository.transitionShipment({
      ...command(), action: "deliver",
    })).resolves.toEqual({ status: "conflict" });
  });

  it("replays the immutable historical review binding after current buyer review status drifts", async () => {
    await seedBuyerReview();
    const repository = setup();
    await expect(repository.handoff(command())).resolves.toEqual({
      status: "handed_off",
    });
    expect((await client.query<{ reviewRequestId: string }>(`
      SELECT review_request_id::text AS "reviewRequestId"
      FROM fulfillment_releases WHERE order_id = '${ids.order}'
    `)).rows).toEqual([{ reviewRequestId: ids.review }]);

    await client.exec(
      `UPDATE buyer_profiles SET status = 'active' WHERE user_id = '${ids.buyer}'`,
    );
    const before = await physicalAuthoritySnapshot();
    await expect(repository.handoff(command())).resolves.toEqual({
      status: "already_handed_off",
    });
    expect(await physicalAuthoritySnapshot()).toBe(before);
  });

  it("replays a complete historical handoff after a later valid reservation changes current lot availability", async () => {
    const repository = setup();
    await expect(repository.handoff(command())).resolves.toEqual({
      status: "handed_off",
    });
    await client.exec(`
      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state, updated_at)
      VALUES
        ('81000000-0000-4000-8000-000000000110', '${ids.buyer}', 'active',
         '${ids.acceptance}', 'CA', 'USD', 1000, 0, 0, 0, 1000,
         'checkout_pending', '2026-08-26T12:01:00.000Z');
      INSERT INTO order_items
        (id, order_id, product_id, product_price_id, destination_policy_id,
         product_name_snapshot, package_form_snapshot, currency,
         unit_amount_minor, quantity, subtotal_minor, discount_minor, total_minor)
      VALUES
        ('81000000-0000-4000-8000-000000000111',
         '81000000-0000-4000-8000-000000000110', '${ids.productA}',
         '${ids.priceA}', '${ids.policyA}', 'Reference A', 'Sealed unit',
         'USD', 1000, 1, 1000, 0, 1000);
      INSERT INTO checkout_attempts
        (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         reasons, tax_ready, shipping_ready, provider, provider_request_id,
         provider_session_id, provider_request_hash, provider_customer_email,
         provider_origin, provider_request_schema_version, provider_livemode,
         provider_scope, tax_quote_reference, shipping_quote_reference,
         shipping_service, expires_at, created_at, review_authorization_mode)
      VALUES
        ('81000000-0000-4000-8000-000000000112',
         '81000000-0000-4000-8000-000000000110', '${ids.buyer}',
         'later-reservation-checkout-6f', '${"c".repeat(64)}', 'open',
         'pass', 'pass', 'pass', 'pass', 'pass', 'pass', true, false,
         '{}', true, true, 'local_test',
         'checkout_attempt:81000000-0000-4000-8000-000000000112',
         'cs_later_reservation_6f', '${"d".repeat(64)}',
         'later-reservation@example.test', 'http://localhost:3000', 1, false,
         'local_test:synthetic-propeptiq-v1', 'tax_later_reservation_6f',
         'ship_later_reservation_6f', 'synthetic_ground',
         '2026-08-26T13:00:00.000Z', '2026-08-26T12:00:00.000Z',
         'none');

      UPDATE lots SET available_quantity = available_quantity - 1
      WHERE id = '${ids.lotA1}';
      INSERT INTO inventory_reservations
        (id, checkout_attempt_id, idempotency_key, order_id, order_item_id,
         product_id, lot_id, quantity_reserved, quantity_remaining, state,
         expires_at, updated_at)
      VALUES
        ('81000000-0000-4000-8000-000000000113',
         '81000000-0000-4000-8000-000000000112',
         'later-valid-reservation-6f',
         '81000000-0000-4000-8000-000000000110',
         '81000000-0000-4000-8000-000000000111', '${ids.productA}',
         '${ids.lotA1}', 1, 1, 'active', '2026-08-26T12:06:00.000Z',
         '2026-08-26T12:01:00.000Z');
      INSERT INTO inventory_events
        (id, idempotency_key, event_type, lot_id, order_id, order_item_id,
         reservation_id, quantity, balance_after, occurred_at)
      VALUES
        ('81000000-0000-4000-8000-000000000114',
         'later-valid-reservation-event-6f', 'reservation', '${ids.lotA1}',
         '81000000-0000-4000-8000-000000000110',
         '81000000-0000-4000-8000-000000000111',
         '81000000-0000-4000-8000-000000000113', 1, 3,
         '2026-08-26T12:01:00.000Z');
    `);

    await expect(repository.handoff(command())).resolves.toEqual({
      status: "already_handed_off",
    });
  });

  it("allocates the deterministic next version after an expired release and reconstructs its replay", async () => {
    const priorId = keyedUuid(`fulfillment-release:${ids.order}:1`);
    await client.query(
      `INSERT INTO fulfillment_releases
        (id, order_id, version, idempotency_key, payment_event_id,
         review_request_id, state, issued_at, expires_at, expired_at)
       VALUES
        ($1::uuid, $2::uuid, 1, $3, $4::uuid, NULL, 'expired',
         '2026-08-25T09:00:00.000Z', '2026-08-25T09:05:00.000Z',
         '2026-08-25T09:05:00.000Z')`,
      [priorId, ids.order, `fulfillment_release:${ids.order}:1`, ids.payment],
    );
    const repository = setup();
    await expect(repository.handoff(command())).resolves.toEqual({
      status: "handed_off",
    });
    await expect(repository.handoff(command())).resolves.toEqual({
      status: "already_handed_off",
    });
    const releaseId = keyedUuid(`fulfillment-release:${ids.order}:2`);
    const releases = await client.query<{
      id: string;
      version: number;
      state: string;
      key: string;
    }>(`
      SELECT id::text AS id, version, state, idempotency_key AS key
      FROM fulfillment_releases ORDER BY version
    `);
    expect(releases.rows).toEqual([
      {
        id: priorId,
        version: 1,
        state: "expired",
        key: `fulfillment_release:${ids.order}:1`,
      },
      {
        id: releaseId,
        version: 2,
        state: "consumed",
        key: `fulfillment_release:${ids.order}:2`,
      },
    ]);
  });

  it.each([
    ["buyer blocked", `UPDATE buyer_profiles SET status = 'blocked' WHERE user_id = '${ids.buyer}'`],
    ["product retired", `UPDATE products SET status = 'retired' WHERE id = '${ids.productA}'`],
    ["destination blocked", `UPDATE destination_policies SET result = 'blocked' WHERE id = '${ids.policyA}'`],
    ["lot recalled", `UPDATE lots SET status = 'recalled' WHERE id = '${ids.lotA1}'`],
    [
      "refund requested",
      `INSERT INTO refunds
        (id, order_id, requested_by_user_id, verified_payment_event_id,
         provider, idempotency_key, requested_amount_minor, currency, status,
         origin)
       VALUES
        ('${ids.refund}', '${ids.order}', '${ids.staff}', '${ids.payment}',
         'local_test', 'handoff-refund-pending-6f', 100, 'USD', 'requested',
         'staff_requested')`,
    ],
    [
      "matching unsettled dispute",
      `INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status, attempt_count,
         received_at, event_type, schema_version, normalized_payload,
         provider_created_at, livemode)
       VALUES
        ('${ids.disputeEvent}', 'local_test', 'evt_handoff_dispute_6f', '${"5".repeat(64)}',
         'pending', 0, '2026-08-26T11:00:00.000Z', 'charge.dispute.updated', 1,
         '{"schemaVersion":1,"kind":"dispute","providerEventId":"evt_handoff_dispute_6f","eventType":"charge.dispute.updated","providerCreatedAt":"2026-08-26T11:00:00.000Z","livemode":false,"disputeId":"dp_handoff_6f","paymentIntentId":"pi_fulfillment_6f","chargeId":"ch_fulfillment_6f","amountMinor":5000,"currency":"usd","status":"needs_response"}'::jsonb,
         '2026-08-26T11:00:00.000Z', false)`,
    ],
    ["missing pending shipment", `DELETE FROM shipments WHERE id = '${ids.shipment}'`],
  ])("places or retains a hold with no handoff authority when %s", async (_label, mutation) => {
    await client.exec(mutation);
    await expect(setup().handoff(command())).resolves.toMatchObject({ status: "held" });
    const rows = await client.query<{
      state: string;
      releases: number;
      consumes: number;
      effects: number;
    }>(`
      SELECT state,
        (SELECT count(*)::int FROM fulfillment_releases) AS releases,
        (SELECT count(*)::int FROM inventory_events WHERE event_type = 'consume') AS consumes,
        (SELECT count(*)::int FROM downstream_effects) AS effects
      FROM orders WHERE id = '${ids.order}'
    `);
    expect(rows.rows).toEqual([{
      state: "paid_on_hold",
      releases: 0,
      consumes: 0,
      effects: 0,
    }]);
  });

  it("ignores an unrelated malformed financial event only after SQL scopes exact payment authority", async () => {
    await client.exec(`
      INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status, attempt_count,
         received_at, event_type, schema_version, normalized_payload,
         provider_created_at, livemode)
      VALUES
        ('81000000-0000-4000-8000-000000000115', 'local_test',
         'evt_unrelated_malformed_refund_6f', '${"e".repeat(64)}', 'pending', 0,
         '2026-08-26T11:30:00.000Z', 'refund.updated', 1,
         '{"schemaVersion":1,"kind":"refund","providerEventId":"evt_unrelated_malformed_refund_6f","eventType":"refund.updated","providerCreatedAt":"2026-08-26T11:30:00.000Z","livemode":false,"paymentIntentId":"pi_unrelated_6f"}'::jsonb,
         '2026-08-26T11:30:00.000Z', false)
    `);
    const queryTrace: Array<{ sql: string; params: readonly unknown[] }> = [];

    await expect(setup({ queryTrace }).handoff(command())).resolves.toEqual({
      status: "handed_off",
    });
    const restrictionQuery = queryTrace.find(({ sql }) =>
      /FROM provider_events[\s\S]*refund\.created/iu.test(sql),
    );
    expect(restrictionQuery?.sql).toMatch(
      /provider\s*=\s*\$1[\s\S]*livemode\s*=\s*\$2[\s\S]*normalized_payload->>'paymentIntentId'\s*=\s*\$3/iu,
    );
    expect(restrictionQuery?.params).toEqual([
      "local_test",
      false,
      "pi_fulfillment_6f",
    ]);
  });

  it.each([
    ["the verified payment row is absent", `DELETE FROM payment_events WHERE id = '${ids.payment}'`],
    [
      "the signed payment source contradicts its PaymentIntent",
      `UPDATE provider_events
       SET normalized_payload = jsonb_set(normalized_payload, '{paymentIntentId}', '"pi_wrong_6f"'::jsonb)
       WHERE id = '${ids.sourceEvent}'`,
    ],
    [
      "the signed payment source has a mismatched external event identity",
      `ALTER TABLE provider_events
         DROP CONSTRAINT provider_events_normalized_common_coherent;
       UPDATE provider_events SET provider_event_id = 'evt_wrong_fulfillment_6f'
       WHERE id = '${ids.sourceEvent}'`,
    ],
    [
      "the signed payment source envelope is malformed",
      `ALTER TABLE provider_events
         DROP CONSTRAINT provider_events_normalized_common_coherent;
       UPDATE provider_events SET normalized_payload = '{"schemaVersion":1}'::jsonb
       WHERE id = '${ids.sourceEvent}'`,
    ],
    [
      "the checkout attempt contradicts the signed session",
      `UPDATE checkout_attempts SET provider_session_id = 'cs_wrong_6f'
       WHERE id = '${ids.attempt}'`,
    ],
    [
      "the current destination policy is no longer active",
      `UPDATE destination_policies SET active = false
       WHERE id = '${ids.policyA}'`,
    ],
    [
      "the only active destination policy is future-effective",
      `UPDATE destination_policies SET effective_at = '2026-08-27T00:00:00.000Z'
       WHERE id = '${ids.policyA}'`,
    ],
    ["the shipping address is missing", `DELETE FROM order_shipping_addresses WHERE order_id = '${ids.order}'`],
    [
      "one reservation is missing",
      `DELETE FROM inventory_events WHERE reservation_id = '${ids.reservationA1}';
       DELETE FROM inventory_reservations WHERE id = '${ids.reservationA1}'`,
    ],
    [
      "one reservation is no longer active/full",
      `UPDATE inventory_reservations
       SET state = 'released', quantity_remaining = 0
       WHERE id = '${ids.reservationA1}'`,
    ],
    [
      "a duplicate reservation over-covers an item",
      `INSERT INTO lots
         (id, product_id, supplier_name, supplier_lot_code,
          received_quantity, available_quantity, status)
       VALUES
         ('81000000-0000-4000-8000-000000000090', '${ids.productB}',
          'Synthetic supplier', 'FUL-B-DUP', 10, 8, 'released');
       INSERT INTO inventory_reservations
         (id, checkout_attempt_id, idempotency_key, order_id, order_item_id,
          product_id, lot_id, quantity_reserved, quantity_remaining, state,
          expires_at, updated_at)
       VALUES
         ('81000000-0000-4000-8000-000000000091', '${ids.attempt}',
          'reserve-b-duplicate-6f', '${ids.order}', '${ids.itemB}',
          '${ids.productB}', '81000000-0000-4000-8000-000000000090',
          1, 1, 'active', '2026-08-25T11:00:00.000Z',
          '2026-08-25T10:00:00.000Z')`,
    ],
  ])("fails closed before handoff when %s", async (_label, mutation) => {
    await client.exec(mutation);
    await expect(setup().handoff(command())).resolves.toMatchObject({ status: "held" });
    const snapshot = await client.query<{
      orderState: string;
      releases: number;
      consumes: number;
      effects: number;
      shipmentState: string;
    }>(`
      SELECT o.state AS "orderState",
        (SELECT count(*)::int FROM fulfillment_releases) AS releases,
        (SELECT count(*)::int FROM inventory_events WHERE event_type = 'consume') AS consumes,
        (SELECT count(*)::int FROM downstream_effects) AS effects,
        s.state AS "shipmentState"
      FROM orders o JOIN shipments s ON s.order_id = o.id
      WHERE o.id = '${ids.order}'
    `);
    expect(snapshot.rows).toEqual([{
      orderState: "paid_on_hold",
      releases: 0,
      consumes: 0,
      effects: 0,
      shipmentState: "pending",
    }]);
  });

  it("rejects a cross-order reservation at the schema boundary without changing fulfillment authority", async () => {
    await client.exec(`
      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state, updated_at)
      VALUES
        ('81000000-0000-4000-8000-000000000096', '${ids.buyer}', 'active',
         '${ids.acceptance}', 'CA', 'USD', 1000, 0, 0, 0, 1000,
         'draft', '2026-08-25T00:00:00.000Z');
      INSERT INTO order_items
        (id, order_id, product_id, product_price_id, destination_policy_id,
         product_name_snapshot, package_form_snapshot, currency,
         unit_amount_minor, quantity, subtotal_minor, discount_minor, total_minor)
      VALUES
        ('81000000-0000-4000-8000-000000000097',
         '81000000-0000-4000-8000-000000000096', '${ids.productA}',
         '${ids.priceA}', '${ids.policyA}', 'Reference A', 'Sealed unit',
         'USD', 1000, 1, 1000, 0, 1000)
    `);
    const before = await physicalAuthoritySnapshot();

    await expect(client.exec(`
      INSERT INTO inventory_reservations
        (id, checkout_attempt_id, idempotency_key, order_id, order_item_id,
         product_id, lot_id, quantity_reserved, quantity_remaining, state,
         expires_at, updated_at)
      VALUES
        ('81000000-0000-4000-8000-000000000098', '${ids.attempt}',
         'reserve-cross-order-6f', '${ids.order}',
         '81000000-0000-4000-8000-000000000097', '${ids.productA}',
         '${ids.lotA1}', 1, 1, 'active', '2026-08-25T11:00:00.000Z',
         '2026-08-25T10:00:00.000Z')
    `)).rejects.toThrow(/inventory_reservations_item_order_product_fk/iu);
    expect(await physicalAuthoritySnapshot()).toBe(before);
  });

  it("holds an order with multiple otherwise coherent verified payments", async () => {
    const sourceId = "81000000-0000-4000-8000-000000000092";
    const paymentId = "81000000-0000-4000-8000-000000000093";
    await client.exec(`
      INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status, attempt_count,
         received_at, processed_at, event_type, schema_version,
         normalized_payload, provider_created_at, livemode)
      VALUES
        ('${sourceId}', 'local_test', 'evt_fulfillment_paid_duplicate_6f', '${"7".repeat(64)}',
         'processed', 1, '2026-08-25T10:00:00.000Z', '2026-08-25T10:01:00.000Z',
         'checkout.session.completed', 1,
         '{"schemaVersion":1,"kind":"checkout_session","providerEventId":"evt_fulfillment_paid_duplicate_6f","eventType":"checkout.session.completed","providerCreatedAt":"2026-08-25T10:00:00.000Z","livemode":false,"sessionId":"cs_fulfillment_6f","orderId":"${ids.order}","attemptId":"${ids.attempt}","paymentIntentId":"pi_fulfillment_duplicate_6f","amountMinor":5000,"currency":"usd","paymentStatus":"paid","sessionStatus":"complete"}'::jsonb,
         '2026-08-25T10:00:00.000Z', false);
      INSERT INTO payment_events
        (id, provider_event_id, order_id, event_type, provider_payment_id,
         idempotency_key, amount_minor, currency, occurred_at)
      VALUES
        ('${paymentId}', '${sourceId}', '${ids.order}', 'payment_verified',
         'pi_fulfillment_duplicate_6f',
         'local_test:payment_intent:pi_fulfillment_duplicate_6f',
         5000, 'USD', '2026-08-25T10:00:00.000Z')
    `);
    await expect(setup().handoff(command())).resolves.toMatchObject({
      status: "held",
      reasons: expect.arrayContaining(["payment_unverified"]),
    });
    expect((await client.query(`SELECT count(*)::int AS count FROM fulfillment_releases`)).rows)
      .toEqual([{ count: 0 }]);
  });

  it("clears only the hold bit after a current-facts pass and replays without any authority writes", async () => {
    await client.exec(`UPDATE orders SET state = 'paid_on_hold' WHERE id = '${ids.order}'`);
    const repository = setup();
    await expect(repository.clearHold(command())).resolves.toEqual({ status: "cleared" });
    await expect(repository.clearHold(command())).resolves.toEqual({ status: "already_clear" });
    const rows = await client.query<{
      state: string;
      audits: number;
      releases: number;
      consumes: number;
      effects: number;
      shipmentState: string;
    }>(`
      SELECT o.state,
        (SELECT count(*)::int FROM admin_audit
         WHERE action = 'fulfillment.hold.cleared') AS audits,
        (SELECT count(*)::int FROM fulfillment_releases) AS releases,
        (SELECT count(*)::int FROM inventory_events WHERE event_type = 'consume') AS consumes,
        (SELECT count(*)::int FROM downstream_effects) AS effects,
        s.state AS "shipmentState"
      FROM orders o JOIN shipments s ON s.order_id = o.id
      WHERE o.id = '${ids.order}'
    `);
    expect(rows.rows).toEqual([{
      state: "paid_pending_fulfillment",
      audits: 1,
      releases: 0,
      consumes: 0,
      effects: 0,
      shipmentState: "pending",
    }]);
  });

  it("accepts paid reservations past local expiry and released lots at zero, but denies shelf expiry", async () => {
    await client.exec(`
      UPDATE lots SET available_quantity = 0
      WHERE id IN ('${ids.lotA1}', '${ids.lotA2}', '${ids.lotB}')
    `);
    await expect(setup().handoff(command())).resolves.toEqual({ status: "handed_off" });
  });

  it.each([
    ["recalled", `UPDATE lots SET status = 'recalled' WHERE id = '${ids.lotA1}'`],
    ["quarantined", `UPDATE lots SET status = 'quarantined' WHERE id = '${ids.lotA1}'`],
    ["exhausted", `UPDATE lots SET status = 'exhausted' WHERE id = '${ids.lotA1}'`],
    [
      "negative-balance",
      `ALTER TABLE lots DROP CONSTRAINT lots_quantity_bounds;
       UPDATE lots SET available_quantity = -1 WHERE id = '${ids.lotA1}'`,
    ],
    ["shelf-expired", `UPDATE lots SET expires_at = '${now.toISOString()}' WHERE id = '${ids.lotA1}'`],
  ])("denies a %s reserved lot without crossing the handoff boundary", async (_label, mutation) => {
    await client.exec(mutation);
    await expect(setup().handoff(command())).resolves.toMatchObject({
      status: "held",
      reasons: expect.arrayContaining(["reserved_lot_unavailable"]),
    });
    const counts = await client.query<{
      releases: number;
      consumes: number;
      effects: number;
      shipmentState: string;
    }>(`
      SELECT
        (SELECT count(*)::int FROM fulfillment_releases) AS releases,
        (SELECT count(*)::int FROM inventory_events WHERE event_type = 'consume') AS consumes,
        (SELECT count(*)::int FROM downstream_effects) AS effects,
        (SELECT state FROM shipments WHERE id = '${ids.shipment}') AS "shipmentState"
    `);
    expect(counts.rows).toEqual([{
      releases: 0,
      consumes: 0,
      effects: 0,
      shipmentState: "pending",
    }]);
  });

  it.each([
    "release_inserted",
    "reservations_consumed",
    "release_consumed",
    "shipment_handed_off",
    "order_fulfilled",
    "effect_inserted",
    "audit_inserted",
  ])("rolls back every write after injected %s failure", async (stage) => {
    const before = await physicalAuthoritySnapshot();
    await expect(setup({ failAfter: stage }).handoff(command())).rejects.toThrow(/synthetic rollback/i);
    expect(await physicalAuthoritySnapshot()).toBe(before);
    const rows = await client.query<{
      orderState: string;
      releases: number;
      activeReservations: number;
      consumes: number;
      shipmentState: string;
      effects: number;
      audits: number;
    }>(`
      SELECT o.state AS "orderState",
        (SELECT count(*)::int FROM fulfillment_releases) AS releases,
        (SELECT count(*)::int FROM inventory_reservations
         WHERE state = 'active' AND quantity_remaining = quantity_reserved) AS "activeReservations",
        (SELECT count(*)::int FROM inventory_events WHERE event_type = 'consume') AS consumes,
        s.state AS "shipmentState",
        (SELECT count(*)::int FROM downstream_effects) AS effects,
        (SELECT count(*)::int FROM admin_audit) AS audits
      FROM orders o JOIN shipments s ON s.order_id = o.id
      WHERE o.id = '${ids.order}'
    `);
    expect(rows.rows).toEqual([{
      orderState: "paid_pending_fulfillment",
      releases: 0,
      activeReservations: 3,
      consumes: 0,
      shipmentState: "pending",
      effects: 0,
      audits: 0,
    }]);
  });

  it("rolls back the full tuple when a conditional reservation write affects zero rows", async () => {
    const before = await physicalAuthoritySnapshot();
    await expect(setup({
      zeroWritePattern: /UPDATE inventory_reservations/u,
    }).handoff(command())).rejects.toThrow(/reservation update conflict/i);
    expect(await physicalAuthoritySnapshot()).toBe(before);
  });

  it("applies delivery/exception transitions and audits only changed states", async () => {
    const repository = setup();
    await repository.handoff(command());
    const untouchedBefore = await nonShipmentAuthoritySnapshot();
    await expect(repository.transitionShipment({ ...command(), action: "record_exception" })).resolves.toEqual({ status: "exception" });
    await expect(repository.transitionShipment({ ...command(), action: "record_exception" })).resolves.toEqual({ status: "already_exception" });
    await expect(repository.transitionShipment({ ...command(), action: "deliver" })).resolves.toEqual({ status: "delivered" });
    await expect(repository.transitionShipment({ ...command(), action: "deliver" })).resolves.toEqual({ status: "already_delivered" });
    await expect(repository.transitionShipment({ ...command(), action: "record_exception" })).resolves.toEqual({ status: "conflict" });
    const row = await client.query<{ state: string; deliveredAt: Date; audits: number; effects: number }>(`
      SELECT s.state, s.delivered_at AS "deliveredAt",
        (SELECT count(*)::int FROM admin_audit
         WHERE action IN ('shipment.exception.recorded','shipment.delivered')) AS audits,
        (SELECT count(*)::int FROM downstream_effects) AS effects
      FROM shipments s WHERE s.id = '${ids.shipment}'
    `);
    expect(row.rows[0]).toMatchObject({ state: "delivered", audits: 2, effects: 1 });
    expect(row.rows[0]!.deliveredAt.toISOString()).toBe(now.toISOString());
    expect(await nonShipmentAuthoritySnapshot()).toBe(untouchedBefore);
    const releaseId = keyedUuid(`fulfillment-release:${ids.order}:1`);
    const audits = await client.query<{ action: string; metadata: unknown }>(`
      SELECT action, metadata FROM admin_audit
      WHERE action IN ('shipment.exception.recorded','shipment.delivered')
      ORDER BY action
    `);
    expect(audits.rows).toEqual([
      {
        action: "shipment.delivered",
        metadata: { schemaVersion: 1, fulfillmentReleaseId: releaseId },
      },
      {
        action: "shipment.exception.recorded",
        metadata: { schemaVersion: 1, fulfillmentReleaseId: releaseId },
      },
    ]);
  });

  it("rejects a stale delivery command captured before handoff with zero writes", async () => {
    const repository = setup();
    await expect(repository.handoff(command())).resolves.toEqual({
      status: "handed_off",
    });
    const before = await physicalAuthoritySnapshot();
    await expect(repository.transitionShipment({
      ...command(),
      action: "deliver",
      now: new Date("2026-08-26T11:59:59.999Z"),
    })).resolves.toEqual({ status: "conflict" });
    expect(await physicalAuthoritySnapshot()).toBe(before);
  });

  it("keeps delivered terminal when delivery wins the logical delivery/exception interleaving", async () => {
    const repository = setup();
    await repository.handoff(command());
    await expect(repository.transitionShipment({
      ...command(),
      action: "deliver",
    })).resolves.toEqual({ status: "delivered" });
    const before = await physicalAuthoritySnapshot();
    await expect(repository.transitionShipment({
      ...command(),
      action: "record_exception",
    })).resolves.toEqual({ status: "conflict" });
    expect(await physicalAuthoritySnapshot()).toBe(before);
  });

  it.each([
    [
      "address",
      `UPDATE order_shipping_addresses SET address_line1 = 'Changed review address'
       WHERE order_id = '${ids.order}'`,
    ],
    [
      "cart",
      `UPDATE order_items SET quantity = 4, subtotal_minor = 4000,
                              total_minor = 4000
       WHERE id = '${ids.itemA}'`,
    ],
    [
      "promotion",
      `INSERT INTO promotions
         (id, code, version, name, kind, status, configuration)
       VALUES
         ('81000000-0000-4000-8000-000000000094', 'REVIEW-DRIFT-6F', 1,
          'Review drift promotion', 'discount', 'active', '{}'::jsonb);
       INSERT INTO order_promotion_applications
         (id, order_id, promotion_id, promotion_version, code_snapshot,
          name_snapshot, kind_snapshot, applied_discount_minor)
       VALUES
         ('81000000-0000-4000-8000-000000000095', '${ids.order}',
          '81000000-0000-4000-8000-000000000094', 1, 'REVIEW-DRIFT-6F',
          'Review drift promotion', 'discount', 0)`,
    ],
    [
      "current destination policy",
      `UPDATE destination_policies SET result = 'review'
       WHERE id = '${ids.policyA}'`,
    ],
    [
      "historical attestation version",
      `INSERT INTO attestation_versions
         (id, version, content_hash, policy_text, effective_at)
       VALUES
         ('${ids.newerAttestation}', 2, '${"8".repeat(64)}',
          'Different historical policy.', '2026-08-25T00:00:00.000Z');
       UPDATE review_requests SET attestation_version_id = '${ids.newerAttestation}'
       WHERE id = '${ids.review}'`,
    ],
    [
      "review buyer coverage",
      `UPDATE review_requests SET covers_buyer_review = false
       WHERE id = '${ids.review}'`,
    ],
    [
      "review outcome",
      `UPDATE review_requests SET outcome = 'rejected'
       WHERE id = '${ids.review}'`,
    ],
  ])("denies reuse after exact %s drift without selecting another review", async (_label, mutation) => {
    await seedBuyerReview();
    await client.exec(mutation);
    const result = await setup().handoff(command());
    if (_label === "review buyer coverage") {
      expect(result).toMatchObject({
        status: "held",
        reasons: expect.arrayContaining(["buyer_review_not_covered"]),
      });
    } else {
      expect(result).toEqual({ status: "conflict" });
    }
    expect((await client.query(`
      SELECT
        (SELECT count(*)::int FROM fulfillment_releases) AS releases,
        (SELECT count(*)::int FROM downstream_effects) AS effects,
        (SELECT state FROM shipments WHERE id = '${ids.shipment}') AS shipment
    `)).rows).toEqual([{ releases: 0, effects: 0, shipment: "pending" }]);
  });

  it("reuses an exact historical review after a newer attestation exists and never queries current attestation", async () => {
    const reviewInput = await seedBuyerReview();
    await client.exec(`
      INSERT INTO attestation_versions
        (id, version, content_hash, policy_text, effective_at)
      VALUES
        ('${ids.newerAttestation}', 2, '${"6".repeat(64)}', 'Newer global policy.', '2026-08-25T00:00:00.000Z')
    `);
    const trace: string[] = [];
    const reviewCalls: unknown[] = [];
    const queryTrace: Array<{ sql: string; params: readonly unknown[] }> = [];
    await expect(setup({ trace, reviewCalls, queryTrace }).handoff(command())).resolves.toEqual({ status: "handed_off" });
    const release = await client.query<{ reviewRequestId: string }>(`
      SELECT review_request_id::text AS "reviewRequestId"
      FROM fulfillment_releases WHERE order_id = '${ids.order}'
    `);
    expect(release.rows).toEqual([{ reviewRequestId: ids.review }]);
    expect(reviewCalls).toEqual([{
      input: reviewInput,
      options: { lock: true },
    }]);
    expect(
      trace.some((sql) => /attestation_versions[\s\S]*(superseded_at\s+is\s+null|ORDER BY\s+version\s+DESC)/iu.test(sql)),
    ).toBe(false);
    const orderLock = trace.findIndex((sql) => /FROM orders[\s\S]*FOR UPDATE/iu.test(sql));
    const reviewLock = trace.findIndex((sql) => /FROM review_requests[\s\S]*FOR UPDATE/iu.test(sql));
    expect(orderLock).toBeGreaterThanOrEqual(0);
    expect(reviewLock).toBeGreaterThan(orderLock);
    const lockedIndex = (pattern: RegExp) =>
      trace.findIndex((sql) => pattern.test(sql));
    const orderedLocks = [
      lockedIndex(/FROM users[\s\S]*ORDER BY id FOR UPDATE/iu),
      lockedIndex(/FROM buyer_profiles[\s\S]*ORDER BY user_id FOR UPDATE/iu),
      lockedIndex(/FROM staff_roles[\s\S]*ORDER BY capability, id FOR UPDATE/iu),
      lockedIndex(/FROM attestation_acceptances[\s\S]*FOR UPDATE OF aa, av/iu),
      lockedIndex(/FROM checkout_attempts[\s\S]*FOR UPDATE/iu),
      orderLock,
      reviewLock,
      lockedIndex(/FROM payment_events payment[\s\S]*FOR UPDATE OF payment/iu),
      lockedIndex(/FROM refunds refund[\s\S]*FOR UPDATE OF refund/iu),
      lockedIndex(/FROM shipments[\s\S]*FOR UPDATE/iu),
      lockedIndex(/FROM fulfillment_releases[\s\S]*FOR UPDATE/iu),
      lockedIndex(/FROM order_items oi[\s\S]*ORDER BY oi\.id FOR UPDATE/iu),
      lockedIndex(/FROM products p[\s\S]*ORDER BY p\.id FOR UPDATE/iu),
      lockedIndex(/FROM product_policy_groups pg[\s\S]*ORDER BY pg\.id FOR UPDATE/iu),
      lockedIndex(/FROM destination_policies[\s\S]*FOR UPDATE/iu),
      lockedIndex(/FROM inventory_reservations[\s\S]*FOR UPDATE/iu),
      lockedIndex(/FROM lots[\s\S]*FOR UPDATE/iu),
    ];
    expect(orderedLocks.every((index) => index >= 0)).toBe(true);
    expect(orderedLocks).toEqual(
      orderedLocks.toSorted((left, right) => left - right),
    );
    expect(
      queryTrace.find(({ sql }) =>
        /FROM users[\s\S]*ORDER BY id FOR UPDATE/iu.test(sql),
      )?.params,
    ).toEqual([ids.staff, ids.buyer]);
  });
});
