import type { PGlite } from "@electric-sql/pglite";
import { getTableName } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import {
  adminAudit,
  attestationAcceptances,
  attestationVersions,
  buyerProfiles,
  checkoutAttempts,
  coaDocuments,
  destinationPolicies,
  fulfillmentReleases,
  inventoryEvents,
  inventoryReservations,
  lots,
  orderItems,
  orders,
  paymentEvents,
  productPolicyGroups,
  productPrices,
  products,
  promotionTargets,
  promotions,
  providerEvents,
  refunds,
  reviewRequests,
  shipments,
  staffRoles,
  users,
} from "@/db/schema";

import { createMigratedPglite } from "./helpers/pglite";

const expectedLeanTables = [
  [users, "users"],
  [buyerProfiles, "buyer_profiles"],
  [attestationVersions, "attestation_versions"],
  [attestationAcceptances, "attestation_acceptances"],
  [staffRoles, "staff_roles"],
  [productPolicyGroups, "product_policy_groups"],
  [products, "products"],
  [productPrices, "product_prices"],
  [lots, "lots"],
  [coaDocuments, "coa_documents"],
  [destinationPolicies, "destination_policies"],
  [promotions, "promotions"],
  [promotionTargets, "promotion_targets"],
  [orders, "orders"],
  [orderItems, "order_items"],
  [checkoutAttempts, "checkout_attempts"],
  [providerEvents, "provider_events"],
  [paymentEvents, "payment_events"],
  [inventoryReservations, "inventory_reservations"],
  [inventoryEvents, "inventory_events"],
  [refunds, "refunds"],
  [reviewRequests, "review_requests"],
  [fulfillmentReleases, "fulfillment_releases"],
  [shipments, "shipments"],
  [adminAudit, "admin_audit"],
] as const;

const obsoleteTables = [
  "actors",
  "organizations",
  "organization_memberships",
  "researcher_applications",
  "application_evidence",
  "approval_decisions",
  "jurisdiction_policy_versions",
  "eligibility_evaluations",
  "eligibility_gates",
  "compliance_cases",
  "compliance_decisions",
  "manual_review_case_decisions",
  "launch_gates",
] as const;

const ids = {
  user: "00000000-0000-4000-8000-000000000001",
  user2: "00000000-0000-4000-8000-000000000002",
  attestation: "00000000-0000-4000-8000-000000000010",
  acceptance: "00000000-0000-4000-8000-000000000011",
  group: "00000000-0000-4000-8000-000000000020",
  product: "00000000-0000-4000-8000-000000000021",
  price: "00000000-0000-4000-8000-000000000022",
  lot: "00000000-0000-4000-8000-000000000023",
  policy: "00000000-0000-4000-8000-000000000024",
  order: "00000000-0000-4000-8000-000000000030",
  item: "00000000-0000-4000-8000-000000000031",
  providerEvent: "00000000-0000-4000-8000-000000000040",
  paymentEvent: "00000000-0000-4000-8000-000000000041",
  review: "00000000-0000-4000-8000-000000000050",
  release: "00000000-0000-4000-8000-000000000060",
} as const;

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const hashC = "c".repeat(64);
const hashD = "d".repeat(64);
const hashE = "e".repeat(64);
const hashF = "f".repeat(64);

async function expectRejected(client: PGlite, sql: string): Promise<void> {
  await expect(client.exec(sql)).rejects.toThrow();
}

async function insertCommerceFixture(client: PGlite): Promise<void> {
  await client.exec(`
    INSERT INTO users (id, clerk_id, email_verified_at)
    VALUES ('${ids.user}', 'clerk_test_buyer', now());

    INSERT INTO buyer_profiles
      (user_id, status, age_confirmed_at, research_purpose)
    VALUES ('${ids.user}', 'active', now(), 'analytical');

    INSERT INTO attestation_versions
      (id, version, content_hash, policy_text, effective_at)
    VALUES ('${ids.attestation}', 1, '${hashA}', 'Research use only policy', now());

    INSERT INTO attestation_acceptances
      (id, user_id, attestation_version_id, accepted_at)
    VALUES ('${ids.acceptance}', '${ids.user}', '${ids.attestation}', now());

    INSERT INTO product_policy_groups (id, slug, name)
    VALUES ('${ids.group}', 'synthetic-group', 'Synthetic test group');

    INSERT INTO products
      (id, slug, name, package_form, policy_group_id, status)
    VALUES
      ('${ids.product}', 'synthetic-product', 'Synthetic product', 'sealed vial', '${ids.group}', 'active');

    INSERT INTO product_prices
      (id, product_id, version, amount_minor, currency, effective_at)
    VALUES ('${ids.price}', '${ids.product}', 1, 2500, 'USD', now());

    INSERT INTO lots
      (id, product_id, supplier_name, supplier_lot_code, received_quantity, available_quantity, status)
    VALUES
      ('${ids.lot}', '${ids.product}', 'Synthetic supplier', 'SYN-001', 20, 20, 'released');

    INSERT INTO destination_policies
      (id, scope_kind, product_id, state_code, result, version, active, effective_at)
    VALUES
      ('${ids.policy}', 'product', '${ids.product}', 'CA', 'allowed', 1, true, now());

    INSERT INTO orders
      (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
       destination_state_code, buyer_snapshot_hash, destination_snapshot_hash,
       currency, subtotal_minor, discount_minor, tax_minor, shipping_minor,
       total_minor, state)
    VALUES
      ('${ids.order}', '${ids.user}', 'active', '${ids.acceptance}', 'CA',
       '${hashB}', '${hashC}', 'USD', 2500, 0, 200, 300, 3000, 'checkout_pending');

    INSERT INTO order_items
      (id, order_id, product_id, product_price_id, destination_policy_id,
       product_name_snapshot, package_form_snapshot, currency,
       unit_amount_minor, quantity, subtotal_minor, discount_minor, total_minor)
    VALUES
      ('${ids.item}', '${ids.order}', '${ids.product}', '${ids.price}', '${ids.policy}',
       'Synthetic product', 'sealed vial', 'USD', 2500, 1, 2500, 0, 2500);

    INSERT INTO provider_events
      (id, provider, provider_event_id, payload_hash, status, received_at)
    VALUES
      ('${ids.providerEvent}', 'synthetic_provider', 'evt_synthetic_1', '${hashD}', 'pending', now());

    INSERT INTO payment_events
      (id, provider_event_id, order_id, event_type, provider_payment_id,
       idempotency_key, amount_minor, currency, occurred_at)
    VALUES
      ('${ids.paymentEvent}', '${ids.providerEvent}', '${ids.order}', 'payment_verified',
       'pay_synthetic_1', 'payment-event-key-1', 3000, 'USD', now());
  `);
}

describe("lean database migration", () => {
  let client: PGlite | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  it("exports the lean schema and migrates only the required v1 tables", async () => {
    expect(expectedLeanTables.map(([table]) => getTableName(table))).toEqual(
      expectedLeanTables.map(([, name]) => name),
    );

    client = await createMigratedPglite();
    const result = await client.query<{ tablename: string }>(`
      SELECT tablename
      FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    const names = result.rows.map(({ tablename }) => tablename);

    expect(names).toEqual(
      expect.arrayContaining(expectedLeanTables.map(([, name]) => name)),
    );
    for (const obsolete of obsoleteTables) {
      expect(names).not.toContain(obsolete);
    }
  });

  it("rejects duplicate identity, version, and consume-once keys", async () => {
    client = await createMigratedPglite();
    await insertCommerceFixture(client);

    await expectRejected(
      client,
      `INSERT INTO users (clerk_id) VALUES ('clerk_test_buyer')`,
    );
    await expectRejected(
      client,
      `INSERT INTO attestation_versions (version, content_hash, policy_text, effective_at)
       VALUES (1, '${hashE}', 'Second version one', now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO attestation_versions (version, content_hash, policy_text, effective_at)
       VALUES (2, '${hashA}', 'Duplicate content hash', now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO attestation_acceptances (user_id, attestation_version_id)
       VALUES ('${ids.user}', '${ids.attestation}')`,
    );
    await expectRejected(
      client,
      `INSERT INTO product_prices (product_id, version, amount_minor, currency, effective_at)
       VALUES ('${ids.product}', 1, 2600, 'USD', now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO provider_events (provider, provider_event_id, payload_hash, status)
       VALUES ('synthetic_provider', 'evt_synthetic_1', '${hashD}', 'pending')`,
    );
    await expectRejected(
      client,
      `INSERT INTO payment_events
         (provider_event_id, order_id, event_type, idempotency_key, amount_minor, currency, occurred_at)
       VALUES
         ('${ids.providerEvent}', '${ids.order}', 'payment_verified', 'payment-event-key-2', 3000, 'USD', now())`,
    );
    await client.exec(`
      INSERT INTO provider_events
        (provider, provider_event_id, payload_hash, status)
      VALUES ('synthetic_provider', 'evt_synthetic_2', '${hashE}', 'pending');
    `);
    await expectRejected(
      client,
      `INSERT INTO payment_events
         (provider_event_id, order_id, event_type, idempotency_key, amount_minor, currency, occurred_at)
       SELECT id, '${ids.order}', 'payment_failed', 'payment-event-key-1', 0, 'USD', now()
       FROM provider_events WHERE provider_event_id = 'evt_synthetic_2'`,
    );

    await client.exec(`
      INSERT INTO checkout_attempts
        (order_id, idempotency_key, request_hash, account_gate, attestation_gate,
         product_gate, destination_gate, inventory_gate, payment_provider_gate,
         permitted, review_required, tax_ready, shipping_ready)
      VALUES
        ('${ids.order}', 'checkout-key-1', '${hashE}', 'pass', 'pass',
         'pass', 'pass', 'pass', 'pass', true, false, true, true);
    `);
    await expectRejected(
      client,
      `INSERT INTO checkout_attempts
         (order_id, idempotency_key, request_hash, account_gate, attestation_gate,
          product_gate, destination_gate, inventory_gate, payment_provider_gate,
          permitted, review_required, tax_ready, shipping_ready)
       VALUES
         ('${ids.order}', 'checkout-key-1', '${hashF}', 'pass', 'pass',
          'pass', 'pass', 'pass', 'pass', true, false, true, true)`,
    );
    await expectRejected(
      client,
      `INSERT INTO checkout_attempts
         (order_id, idempotency_key, request_hash, account_gate, attestation_gate,
          product_gate, destination_gate, inventory_gate, payment_provider_gate,
          permitted, review_required, tax_ready, shipping_ready)
       VALUES
         ('${ids.order}', 'checkout-key-2', '${hashE}', 'pass', 'pass',
          'pass', 'pass', 'pass', 'pass', true, false, true, true)`,
    );

    await client.exec(`
      INSERT INTO inventory_reservations
        (idempotency_key, order_item_id, lot_id, quantity_reserved, quantity_remaining, state)
      VALUES ('reservation-key-1', '${ids.item}', '${ids.lot}', 1, 1, 'active');
    `);
    await expectRejected(
      client,
      `INSERT INTO inventory_reservations
         (idempotency_key, order_item_id, lot_id, quantity_reserved, quantity_remaining, state)
       VALUES ('reservation-key-1', '${ids.item}', '${ids.lot}', 1, 1, 'active')`,
    );
    await client.exec(`
      INSERT INTO inventory_events
        (idempotency_key, event_type, lot_id, quantity, balance_after)
      VALUES ('inventory-key-1', 'receipt', '${ids.lot}', 1, 20);
    `);
    await expectRejected(
      client,
      `INSERT INTO inventory_events
         (idempotency_key, event_type, lot_id, quantity, balance_after)
       VALUES ('inventory-key-1', 'adjustment', '${ids.lot}', 1, 19)`,
    );

    await client.exec(`
      INSERT INTO refunds
        (order_id, requested_by_user_id, provider, idempotency_key,
         requested_amount_minor, currency, status)
      VALUES
        ('${ids.order}', '${ids.user}', 'synthetic_provider', 'refund-key-1', 500, 'USD', 'requested');
    `);
    await expectRejected(
      client,
      `INSERT INTO refunds
         (order_id, requested_by_user_id, provider, idempotency_key,
          requested_amount_minor, currency, status)
       VALUES
         ('${ids.order}', '${ids.user}', 'synthetic_provider', 'refund-key-1', 500, 'USD', 'requested')`,
    );
  });

  it("enforces lean buyer, destination, money, lease, review, audit, and inventory checks", async () => {
    client = await createMigratedPglite();
    await insertCommerceFixture(client);

    await client.exec(`INSERT INTO users (id, clerk_id) VALUES ('${ids.user2}', 'clerk_incomplete')`);
    await expectRejected(
      client,
      `INSERT INTO buyer_profiles (user_id, status)
       VALUES ('${ids.user2}', 'active')`,
    );
    await expectRejected(
      client,
      `INSERT INTO buyer_profiles (user_id, status, age_confirmed_at, research_purpose)
       VALUES ('${ids.user2}', 'active', now(), 'clinical')`,
    );
    await expectRejected(
      client,
      `INSERT INTO destination_policies
         (scope_kind, product_id, policy_group_id, state_code, result, version, active, effective_at)
       VALUES
         ('product', '${ids.product}', '${ids.group}', 'CA', 'allowed', 2, false, now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO destination_policies
         (scope_kind, policy_group_id, state_code, result, version, active, effective_at)
       VALUES ('product', '${ids.group}', 'CA', 'allowed', 2, false, now())`,
    );
    await client.exec(`
      INSERT INTO destination_policies
        (scope_kind, policy_group_id, state_code, result, version, active, effective_at)
      VALUES ('policy_group', '${ids.group}', 'DC', 'review', 1, true, now());
    `);
    await expectRejected(
      client,
      `INSERT INTO destination_policies
         (scope_kind, policy_group_id, state_code, result, version, active, effective_at)
       VALUES ('policy_group', '${ids.group}', 'PR', 'blocked', 1, true, now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO destination_policies
         (scope_kind, product_id, state_code, result, version, active, effective_at)
       VALUES ('product', '${ids.product}', 'CA', 'blocked', 2, true, now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO destination_policies
         (scope_kind, product_id, state_code, result, version, active, effective_at)
       VALUES ('product', '${ids.product}', 'CA', 'blocked', 1, false, now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO destination_policies
         (scope_kind, policy_group_id, state_code, result, version, active, effective_at)
       VALUES ('policy_group', '${ids.group}', 'DC', 'blocked', 2, true, now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO destination_policies
         (scope_kind, policy_group_id, state_code, result, version, active, effective_at)
       VALUES ('policy_group', '${ids.group}', 'DC', 'blocked', 1, false, now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO product_prices (product_id, version, amount_minor, currency, effective_at)
       VALUES ('${ids.product}', 2, 0, 'usd', now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO lots
         (product_id, supplier_name, supplier_lot_code, received_quantity, available_quantity, status)
       VALUES ('${ids.product}', 'Synthetic supplier', 'SYN-ZERO', 0, 0, 'draft')`,
    );
    await expectRejected(
      client,
      `INSERT INTO inventory_reservations
         (idempotency_key, order_item_id, lot_id, quantity_reserved, quantity_remaining, state)
       VALUES ('reservation-negative', '${ids.item}', '${ids.lot}', 1, -1, 'active')`,
    );
    await expectRejected(
      client,
      `INSERT INTO inventory_events
         (idempotency_key, event_type, lot_id, order_item_id, quantity, balance_after)
       VALUES ('inventory-negative', 'reservation', '${ids.lot}', '${ids.item}', 1, -1)`,
    );
    await expectRejected(
      client,
      `INSERT INTO provider_events
         (provider, provider_event_id, payload_hash, status, lease_token)
       VALUES ('synthetic_provider', 'evt_bad_lease', '${hashE}', 'processing', 'lease-without-expiry')`,
    );
    await expectRejected(
      client,
      `INSERT INTO review_requests
         (user_id, order_id, snapshot_hash, buyer_status_snapshot,
          attestation_version_id, destination_state_code, cart_snapshot,
          buyer_review_required, destination_policy_ids, outcome)
       VALUES
         ('${ids.user}', '${ids.order}', '${hashE}', 'review', '${ids.attestation}',
          'CA', '{}'::jsonb, true, ARRAY['${ids.policy}'::uuid], 'approved')`,
    );
    await expectRejected(
      client,
      `INSERT INTO admin_audit
         (actor_user_id, service_identity, action, resource_type, resource_id, correlation_id)
       VALUES
         ('${ids.user}', 'synthetic-service', 'test.action', 'test', '1', 'correlation-1')`,
    );
  });

  it("persists the exact lean enum domains", async () => {
    client = await createMigratedPglite();
    const result = await client.query<{ typname: string; enumlabel: string }>(`
      SELECT t.typname, e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname IN (
        'buyer_status', 'research_purpose', 'destination_result',
        'provider_event_status', 'inventory_event_type', 'review_outcome'
      )
      ORDER BY t.typname, e.enumsortorder
    `);

    const labelsFor = (type: string) =>
      result.rows
        .filter(({ typname }) => typname === type)
        .map(({ enumlabel }) => enumlabel);
    expect(labelsFor("buyer_status")).toEqual(["active", "review", "blocked"]);
    expect(labelsFor("destination_result")).toEqual([
      "allowed",
      "review",
      "blocked",
    ]);
    expect(labelsFor("inventory_event_type")).toEqual([
        "receipt",
        "reservation",
        "release",
        "consume",
        "adjustment",
    ]);
    expect(labelsFor("provider_event_status")).toEqual([
      "pending",
      "processing",
      "processed",
      "failed",
    ]);
    expect(labelsFor("research_purpose")).toEqual([
      "in_vitro",
      "analytical",
      "educational",
      "other_laboratory",
    ]);
    expect(labelsFor("review_outcome")).toEqual(["approved", "rejected"]);
  });

  it("enforces the provider event lease and terminal-state matrix", async () => {
    client = await createMigratedPglite();

    await client.exec(`
      INSERT INTO provider_events
        (provider, provider_event_id, payload_hash, status, attempt_count,
         lease_token, lease_expires_at, last_error_redacted, received_at, processed_at)
      VALUES
        ('synthetic', 'evt_processing', '${hashA}', 'processing', 1,
         'lease-1', now() + interval '1 hour', 'previous retryable error', now(), null),
        ('synthetic', 'evt_processed', '${hashB}', 'processed', 1,
         null, null, null, now(), now()),
        ('synthetic', 'evt_failed', '${hashC}', 'failed', 1,
         null, null, 'redacted provider failure', now(), null);
    `);

    await expectRejected(
      client,
      `INSERT INTO provider_events
         (provider, provider_event_id, payload_hash, status, attempt_count,
          lease_token, lease_expires_at, received_at)
       VALUES ('synthetic', 'evt_expired_lease', '${hashD}', 'processing', 1,
         'lease-2', now() - interval '1 second', now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO provider_events
         (provider, provider_event_id, payload_hash, status, attempt_count, processed_at, last_error_redacted)
       VALUES ('synthetic', 'evt_processed_error', '${hashD}', 'processed', 1, now(), 'stale error')`,
    );
    await expectRejected(
      client,
      `INSERT INTO provider_events
         (provider, provider_event_id, payload_hash, status, attempt_count, last_error_redacted)
       VALUES ('synthetic', 'evt_failed_blank', '${hashD}', 'failed', 1, '   ')`,
    );
    await expectRejected(
      client,
      `INSERT INTO provider_events
         (provider, provider_event_id, payload_hash, status, attempt_count)
       VALUES ('synthetic', 'evt_processing_no_lease', '${hashD}', 'processing', 1)`,
    );
    await expectRejected(
      client,
      `INSERT INTO provider_events
         (provider, provider_event_id, payload_hash, status, attempt_count,
          lease_token, lease_expires_at, last_error_redacted, received_at)
       VALUES ('synthetic', 'evt_processing_blank_error', '${hashD}', 'processing', 1,
         'lease-3', now() + interval '1 hour', '   ', now())`,
    );
  });

  it("retains provider payload hashes so replay and conflict paths are distinguishable", async () => {
    client = await createMigratedPglite();
    await insertCommerceFixture(client);

    const stored = await client.query<{ payload_hash: string }>(`
      SELECT payload_hash
      FROM provider_events
      WHERE provider = 'synthetic_provider' AND provider_event_id = 'evt_synthetic_1'
    `);
    expect(stored.rows).toEqual([{ payload_hash: hashD }]);
    expect(stored.rows[0]?.payload_hash === hashD).toBe(true);
    expect(stored.rows[0]?.payload_hash === hashE).toBe(false);

    await expectRejected(
      client,
      `INSERT INTO provider_events (provider, provider_event_id, payload_hash, status)
       VALUES ('synthetic_provider', 'evt_synthetic_1', '${hashE}', 'pending')`,
    );
  });

  it("allows release history but consumes each issued release at most once", async () => {
    client = await createMigratedPglite();
    await insertCommerceFixture(client);

    await client.exec(`
      INSERT INTO fulfillment_releases
        (id, order_id, version, idempotency_key, payment_event_id,
         clearance_snapshot_hash, state, issued_at, expires_at)
      VALUES
        ('${ids.release}', '${ids.order}', 1, 'release-key-1', '${ids.paymentEvent}',
         '${hashE}', 'issued', now(), now() + interval '1 hour');
    `);
    await expectRejected(
      client,
      `INSERT INTO fulfillment_releases
         (order_id, version, idempotency_key, payment_event_id,
          clearance_snapshot_hash, state, issued_at, expires_at)
       VALUES
         ('${ids.order}', 2, 'release-key-2', '${ids.paymentEvent}',
          '${hashE}', 'issued', now(), now() + interval '1 hour')`,
    );
    await expectRejected(
      client,
      `INSERT INTO fulfillment_releases
         (order_id, version, idempotency_key, payment_event_id,
          clearance_snapshot_hash, state, issued_at, expires_at)
       VALUES
         ('${ids.order}', 1, 'release-key-other', '${ids.paymentEvent}',
          '${hashE}', 'revoked', now() - interval '2 hours', now() - interval '1 hour')`,
    );

    await client.exec(`
      UPDATE fulfillment_releases
      SET state = 'revoked', revoked_at = now()
      WHERE id = '${ids.release}';

      INSERT INTO inventory_reservations
        (idempotency_key, order_item_id, lot_id, quantity_reserved, quantity_remaining, state)
      VALUES ('release-reservation-key', '${ids.item}', '${ids.lot}', 1, 0, 'consumed');

      INSERT INTO fulfillment_releases
        (order_id, version, idempotency_key, payment_event_id,
         clearance_snapshot_hash, state, issued_at, expires_at, revoked_at)
      VALUES
        ('${ids.order}', 2, 'release-key-2', '${ids.paymentEvent}',
         '${hashE}', 'revoked', now() - interval '2 hours', now() - interval '1 hour', now());

      INSERT INTO inventory_events
        (idempotency_key, event_type, lot_id, order_item_id, reservation_id,
         fulfillment_release_id, quantity, balance_after)
      SELECT 'consume-key-1', 'consume', '${ids.lot}', '${ids.item}', id,
             '${ids.release}', 1, 19
      FROM inventory_reservations WHERE idempotency_key = 'release-reservation-key';

      INSERT INTO shipments
        (order_id, fulfillment_release_id, carrier, tracking_reference, state)
      VALUES
        ('${ids.order}', '${ids.release}', 'synthetic-carrier', 'track-1', 'pending');
    `);
    await expectRejected(
      client,
      `INSERT INTO fulfillment_releases
         (order_id, version, idempotency_key, payment_event_id,
          clearance_snapshot_hash, state, issued_at, expires_at, revoked_at)
       VALUES
         ('${ids.order}', 3, 'release-key-1', '${ids.paymentEvent}',
          '${hashE}', 'revoked', now() - interval '2 hours', now() - interval '1 hour', now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO inventory_events
         (idempotency_key, event_type, lot_id, order_item_id, reservation_id,
          fulfillment_release_id, quantity, balance_after)
       SELECT 'consume-key-2', 'consume', '${ids.lot}', '${ids.item}', id,
              '${ids.release}', 1, 18
       FROM inventory_reservations WHERE idempotency_key = 'release-reservation-key'`,
    );
    await expectRejected(
      client,
      `INSERT INTO shipments
         (order_id, fulfillment_release_id, carrier, tracking_reference, state)
       VALUES
         ('${ids.order}', '${ids.release}', 'synthetic-carrier', 'track-2', 'pending')`,
    );

    const releases = await client.query<{ version: number }>(`
      SELECT version FROM fulfillment_releases WHERE order_id = '${ids.order}' ORDER BY version
    `);
    expect(releases.rows).toEqual([{ version: 1 }, { version: 2 }]);
  });
});
