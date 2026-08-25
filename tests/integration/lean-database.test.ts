import type { PGlite } from "@electric-sql/pglite";
import { getTableName } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import {
  adminAudit,
  analyticalClaims,
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
  rateLimitWindows,
  providerEvents,
  refunds,
  reviewRequestDestinationPolicies,
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
  [analyticalClaims, "analytical_claims"],
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
  [reviewRequestDestinationPolicies, "review_request_destination_policies"],
  [fulfillmentReleases, "fulfillment_releases"],
  [shipments, "shipments"],
  [adminAudit, "admin_audit"],
  [rateLimitWindows, "rate_limit_windows"],
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

const obsoleteEnumTypes = [
  "actor_status",
  "application_status",
  "attestation_context",
  "cart_status",
  "category_status",
  "compliance_case_state",
  "decision_outcome",
  "gate_key",
  "gate_status",
  "idempotency_status",
  "jurisdiction_class",
  "jurisdiction_decision",
  "launch_gate_state",
  "organization_kind",
  "organization_status",
  "outbox_status",
  "private_object_kind",
  "product_version_status",
  "provider_event_state",
  "release_event_type",
  "scan_status",
] as const;

const ids = {
  user: "00000000-0000-4000-8000-000000000001",
  user2: "00000000-0000-4000-8000-000000000002",
  attestation: "00000000-0000-4000-8000-000000000010",
  acceptance: "00000000-0000-4000-8000-000000000011",
  acceptance2: "00000000-0000-4000-8000-000000000012",
  group: "00000000-0000-4000-8000-000000000020",
  product: "00000000-0000-4000-8000-000000000021",
  product2: "00000000-0000-4000-8000-000000000025",
  price: "00000000-0000-4000-8000-000000000022",
  price2: "00000000-0000-4000-8000-000000000026",
  lot: "00000000-0000-4000-8000-000000000023",
  lot2: "00000000-0000-4000-8000-000000000027",
  policy: "00000000-0000-4000-8000-000000000024",
  policy2: "00000000-0000-4000-8000-000000000028",
  order: "00000000-0000-4000-8000-000000000030",
  order2: "00000000-0000-4000-8000-000000000032",
  item: "00000000-0000-4000-8000-000000000031",
  item2: "00000000-0000-4000-8000-000000000033",
  providerEvent: "00000000-0000-4000-8000-000000000040",
  providerEvent2: "00000000-0000-4000-8000-000000000042",
  paymentEvent: "00000000-0000-4000-8000-000000000041",
  paymentEvent2: "00000000-0000-4000-8000-000000000043",
  review: "00000000-0000-4000-8000-000000000050",
  review2: "00000000-0000-4000-8000-000000000051",
  release: "00000000-0000-4000-8000-000000000060",
  release2: "00000000-0000-4000-8000-000000000061",
  reservation: "00000000-0000-4000-8000-000000000070",
  reservation2: "00000000-0000-4000-8000-000000000071",
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
      (id, slug, name, package_form, material_identity, policy_group_id, status)
    VALUES
      ('${ids.product}', 'synthetic-product', 'Synthetic product', 'sealed vial', 'Synthetic identity', '${ids.group}', 'active');

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
       destination_state_code, currency, subtotal_minor, discount_minor,
       tax_minor, shipping_minor, total_minor, state)
    VALUES
      ('${ids.order}', '${ids.user}', 'active', '${ids.acceptance}', 'CA',
       'USD', 2500, 0, 200, 300, 3000, 'checkout_pending');

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

async function insertSecondUserAcceptance(client: PGlite): Promise<void> {
  await client.exec(`
    INSERT INTO users (id, clerk_id, email_verified_at)
    VALUES ('${ids.user2}', 'clerk_test_second_buyer', now());

    INSERT INTO attestation_acceptances
      (id, user_id, attestation_version_id, accepted_at)
    VALUES ('${ids.acceptance2}', '${ids.user2}', '${ids.attestation}', now());
  `);
}

async function insertSecondCatalogRecord(client: PGlite): Promise<void> {
  await client.exec(`
    INSERT INTO products
      (id, slug, name, package_form, material_identity, policy_group_id, status)
    VALUES
      ('${ids.product2}', 'synthetic-product-two', 'Synthetic product two',
       'sealed vial', 'Synthetic identity two', '${ids.group}', 'active');

    INSERT INTO product_prices
      (id, product_id, version, amount_minor, currency, effective_at)
    VALUES ('${ids.price2}', '${ids.product2}', 1, 3500, 'USD', now());

    INSERT INTO lots
      (id, product_id, supplier_name, supplier_lot_code,
       received_quantity, available_quantity, status)
    VALUES
      ('${ids.lot2}', '${ids.product2}', 'Synthetic supplier', 'SYN-002',
       20, 20, 'released');

    INSERT INTO destination_policies
      (id, scope_kind, product_id, state_code, result, version, active, effective_at)
    VALUES
      ('${ids.policy2}', 'product', '${ids.product2}', 'CA', 'review', 1, true, now());
  `);
}

async function insertSecondOrderAndPayment(client: PGlite): Promise<void> {
  await client.exec(`
    INSERT INTO orders
      (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
       destination_state_code, currency, subtotal_minor, discount_minor,
       tax_minor, shipping_minor, total_minor, state)
    VALUES
      ('${ids.order2}', '${ids.user}', 'active', '${ids.acceptance}', 'CA',
       'USD', 2500, 0, 200, 300, 3000, 'checkout_pending');

    INSERT INTO provider_events
      (id, provider, provider_event_id, payload_hash, status, received_at)
    VALUES
      ('${ids.providerEvent2}', 'synthetic_provider', 'evt_synthetic_second',
       '${hashE}', 'pending', now());

    INSERT INTO payment_events
      (id, provider_event_id, order_id, event_type, provider_payment_id,
       idempotency_key, amount_minor, currency, occurred_at)
    VALUES
      ('${ids.paymentEvent2}', '${ids.providerEvent2}', '${ids.order2}',
       'payment_verified', 'pay_synthetic_second', 'payment-event-key-second',
       3000, 'USD', now());
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
    const expectedNames = expectedLeanTables
      .map(([, name]) => name)
      .toSorted();

    expect(names).toEqual(expectedNames);
    for (const obsolete of obsoleteTables) {
      expect(names).not.toContain(obsolete);
    }
  });

  it("does not retain strict-platform enum types", async () => {
    client = await createMigratedPglite();
    const result = await client.query<{ typname: string }>(`
      SELECT typname
      FROM pg_type
      WHERE typtype = 'e'
        AND typnamespace = 'public'::regnamespace
        AND typname = ANY(ARRAY[${obsoleteEnumTypes.map((name) => `'${name}'`).join(",")}])
      ORDER BY typname
    `);

    expect(result.rows).toEqual([]);
  });

  it("rejects an order whose attestation acceptance belongs to another buyer", async () => {
    client = await createMigratedPglite();
    await insertCommerceFixture(client);
    await insertSecondUserAcceptance(client);

    await expectRejected(
      client,
      `INSERT INTO orders
         (buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
          destination_state_code, currency, subtotal_minor, discount_minor,
          tax_minor, shipping_minor, total_minor, state)
       VALUES
         ('${ids.user}', 'active', '${ids.acceptance2}', 'CA',
          'USD', 2500, 0, 200, 300, 3000, 'checkout_pending')`,
    );
  });

  it("rejects an order item whose price belongs to another product", async () => {
    client = await createMigratedPglite();
    await insertCommerceFixture(client);
    await insertSecondCatalogRecord(client);

    await expectRejected(
      client,
      `INSERT INTO order_items
         (order_id, product_id, product_price_id, destination_policy_id,
          product_name_snapshot, package_form_snapshot, currency,
          unit_amount_minor, quantity, subtotal_minor, discount_minor, total_minor)
       VALUES
         ('${ids.order}', '${ids.product}', '${ids.price2}', '${ids.policy}',
          'Synthetic mismatch', 'sealed vial', 'USD', 3500, 1, 3500, 0, 3500)`,
    );
  });

  it("rejects a review request owned by someone other than the order buyer", async () => {
    client = await createMigratedPglite();
    await insertCommerceFixture(client);
    await insertSecondUserAcceptance(client);

    await expectRejected(
      client,
      `INSERT INTO review_requests
         (user_id, order_id, snapshot_hash, buyer_status_snapshot,
          attestation_version_id, destination_state_code, cart_snapshot,
          buyer_review_required, destination_review_required)
       VALUES
         ('${ids.user2}', '${ids.order}', '${hashE}', 'review', '${ids.attestation}',
          'CA', '{}'::jsonb, true, false)`,
    );
  });

  it("rejects a fulfillment release whose payment belongs to another order", async () => {
    client = await createMigratedPglite();
    await insertCommerceFixture(client);
    await insertSecondOrderAndPayment(client);

    await expectRejected(
      client,
      `INSERT INTO fulfillment_releases
         (order_id, version, idempotency_key, payment_event_id,
          state, issued_at, expires_at, revoked_at)
       VALUES
         ('${ids.order}', 1, 'release-payment-mismatch', '${ids.paymentEvent2}',
          'revoked', now() - interval '2 hours',
          now() - interval '1 hour', now())`,
    );
  });

  it("rejects a fulfillment release whose review belongs to another order", async () => {
    client = await createMigratedPglite();
    await insertCommerceFixture(client);
    await insertSecondOrderAndPayment(client);
    await client.exec(`
      INSERT INTO review_requests
        (id, user_id, order_id, snapshot_hash, buyer_status_snapshot,
         attestation_version_id, destination_state_code, cart_snapshot,
         buyer_review_required, destination_review_required)
      VALUES
        ('${ids.review2}', '${ids.user}', '${ids.order2}', '${hashF}', 'review',
         '${ids.attestation}', 'CA', '{}'::jsonb, true, false);
    `);

    await expectRejected(
      client,
      `INSERT INTO fulfillment_releases
         (order_id, version, idempotency_key, payment_event_id, review_request_id,
          state, issued_at, expires_at, revoked_at)
       VALUES
         ('${ids.order}', 1, 'release-review-mismatch', '${ids.paymentEvent}',
          '${ids.review2}', 'revoked', now() - interval '2 hours',
          now() - interval '1 hour', now())`,
    );
  });

  it("rejects a shipment whose release belongs to another order", async () => {
    client = await createMigratedPglite();
    await insertCommerceFixture(client);
    await insertSecondOrderAndPayment(client);
    await client.exec(`
      INSERT INTO fulfillment_releases
        (id, order_id, version, idempotency_key, payment_event_id,
         state, issued_at, expires_at, revoked_at)
      VALUES
        ('${ids.release}', '${ids.order}', 1, 'release-for-shipment-mismatch',
         '${ids.paymentEvent}', 'revoked', now() - interval '2 hours',
         now() - interval '1 hour', now());
    `);

    await expectRejected(
      client,
      `INSERT INTO shipments
         (order_id, fulfillment_release_id, carrier, tracking_reference, state)
       VALUES
         ('${ids.order2}', '${ids.release}', 'synthetic-carrier', 'mismatch-track', 'pending')`,
    );
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
        (idempotency_key, order_id, order_item_id, product_id, lot_id,
         quantity_reserved, quantity_remaining, state)
      VALUES
        ('reservation-key-1', '${ids.order}', '${ids.item}', '${ids.product}',
         '${ids.lot}', 1, 1, 'active');
    `);
    await expectRejected(
      client,
      `INSERT INTO inventory_reservations
         (idempotency_key, order_id, order_item_id, product_id, lot_id,
          quantity_reserved, quantity_remaining, state)
       VALUES
         ('reservation-key-1', '${ids.order}', '${ids.item}', '${ids.product}',
          '${ids.lot}', 1, 1, 'active')`,
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
        (order_id, requested_by_user_id, verified_payment_event_id, provider, idempotency_key,
         requested_amount_minor, currency, status)
      VALUES
        ('${ids.order}', '${ids.user}', '${ids.paymentEvent}', 'synthetic_provider', 'refund-key-1', 500, 'USD', 'requested');
    `);
    await expectRejected(
      client,
       `INSERT INTO refunds
          (order_id, requested_by_user_id, verified_payment_event_id, provider, idempotency_key,
           requested_amount_minor, currency, status)
        VALUES
          ('${ids.order}', '${ids.user}', '${ids.paymentEvent}', 'synthetic_provider', 'refund-key-1', 500, 'USD', 'requested')`,
    );
  });

  it("enforces lean buyer, destination, money, lease, review, audit, and inventory checks", async () => {
    client = await createMigratedPglite();
    await insertCommerceFixture(client);

    await client.exec(`INSERT INTO users (id, clerk_id) VALUES ('${ids.user2}', 'clerk_incomplete')`);
    await expectRejected(
      client,
      `INSERT INTO buyer_profiles (user_id) VALUES ('${ids.user2}')`,
    );
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
      `INSERT INTO destination_policies
         (scope_kind, policy_group_id, state_code, result, version,
          active, effective_at, superseded_at)
       VALUES
         ('policy_group', '${ids.group}', 'NV', 'allowed', 1,
          true, now() - interval '1 day', now())`,
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
         (idempotency_key, order_id, order_item_id, product_id, lot_id,
          quantity_reserved, quantity_remaining, state)
       VALUES
         ('reservation-negative', '${ids.order}', '${ids.item}', '${ids.product}',
          '${ids.lot}', 1, -1, 'active')`,
    );
    await expectRejected(
      client,
      `INSERT INTO inventory_events
         (idempotency_key, event_type, lot_id, order_id, order_item_id,
          quantity, balance_after)
       VALUES
         ('inventory-negative', 'reservation', '${ids.lot}', '${ids.order}',
          '${ids.item}', 1, -1)`,
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
          buyer_review_required, destination_review_required, outcome)
       VALUES
         ('${ids.user}', '${ids.order}', '${hashE}', 'review', '${ids.attestation}',
          'CA', '{}'::jsonb, true, false, 'approved')`,
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
    await expectRejected(
      client,
      `INSERT INTO provider_events
         (provider, provider_event_id, payload_hash, status, attempt_count,
          lease_token, lease_expires_at, received_at)
       VALUES ('synthetic', 'evt_processing_blank_token', '${hashD}', 'processing', 1,
         '   ', now() + interval '1 hour', now())`,
    );
  });

  it("enforces refund provider identity and reference integrity", async () => {
    client = await createMigratedPglite();
    await insertCommerceFixture(client);
    await client.exec(`
      INSERT INTO refunds
        (order_id, requested_by_user_id, verified_payment_event_id, provider, provider_event_id,
         provider_refund_id, idempotency_key, requested_amount_minor,
         confirmed_amount_minor, currency, status, confirmed_at)
      VALUES
        ('${ids.order}', '${ids.user}', '${ids.paymentEvent}', 'synthetic_provider', '${ids.providerEvent}',
         'refund-shared-id', 'refund-provider-key-1', 500, 500, 'USD',
         'succeeded', now());

      INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status)
      VALUES
        ('${ids.providerEvent2}', 'synthetic_provider', 'evt_refund_second', '${hashE}', 'pending'),
        ('00000000-0000-4000-8000-000000000044', 'other_provider',
         'evt_refund_other', '${hashF}', 'pending'),
        ('00000000-0000-4000-8000-000000000045', 'synthetic_provider',
         'evt_refund_blank', '${hashC}', 'pending');
    `);

    await expectRejected(
      client,
       `INSERT INTO refunds
          (order_id, requested_by_user_id, verified_payment_event_id, provider, provider_event_id,
          provider_refund_id, idempotency_key, requested_amount_minor,
          confirmed_amount_minor, currency, status, confirmed_at)
       VALUES
          ('${ids.order}', '${ids.user}', '${ids.paymentEvent}', 'synthetic_provider', '${ids.providerEvent2}',
          'refund-shared-id', 'refund-provider-key-2', 400, 400, 'USD',
          'succeeded', now())`,
    );
    await expectRejected(
      client,
       `INSERT INTO refunds
          (order_id, requested_by_user_id, verified_payment_event_id, provider, provider_event_id,
          provider_refund_id, idempotency_key, requested_amount_minor,
          confirmed_amount_minor, currency, status, confirmed_at)
       VALUES
          ('${ids.order}', '${ids.user}', '${ids.paymentEvent}', 'synthetic_provider',
          '00000000-0000-4000-8000-000000000045', '   ',
          'refund-provider-key-blank', 300, 300, 'USD', 'succeeded', now())`,
    );
    await expectRejected(
      client,
       `INSERT INTO refunds
          (order_id, requested_by_user_id, verified_payment_event_id, provider, provider_event_id,
          idempotency_key, requested_amount_minor, currency, status)
       VALUES
          ('${ids.order}', '${ids.user}', '${ids.paymentEvent}', 'synthetic_provider',
          '00000000-0000-4000-8000-000000000044',
          'refund-provider-key-mismatch', 200, 'USD', 'requested')`,
    );
  });

  it("keeps the review snapshot as the only routine eligibility hash", async () => {
    client = await createMigratedPglite();
    const result = await client.query<{
      table_name: string;
      column_name: string;
    }>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name LIKE '%hash%'
      ORDER BY table_name, column_name
    `);

    expect(result.rows).toEqual([
      { table_name: "attestation_versions", column_name: "content_hash" },
      { table_name: "checkout_attempts", column_name: "request_hash" },
      { table_name: "coa_documents", column_name: "evidence_hash" },
      { table_name: "provider_events", column_name: "payload_hash" },
      { table_name: "rate_limit_windows", column_name: "scope_hash" },
      { table_name: "review_requests", column_name: "snapshot_hash" },
    ]);
  });

  it("stores checkout reason codes as a text array", async () => {
    client = await createMigratedPglite();
    await insertCommerceFixture(client);
    const result = await client.query<{ reasons: string[] }>(`
      INSERT INTO checkout_attempts
        (order_id, idempotency_key, request_hash, account_gate, attestation_gate,
         product_gate, destination_gate, inventory_gate, payment_provider_gate,
         permitted, review_required, reasons, tax_ready, shipping_ready)
      VALUES
        ('${ids.order}', 'checkout-array-key', '${hashE}', 'blocked', 'pass',
         'pass', 'pass', 'pass', 'pass', false, false,
         ARRAY['account_inactive']::text[], true, true)
      RETURNING reasons
    `);

    expect(result.rows).toEqual([{ reasons: ["account_inactive"] }]);
  });

  it("normalizes exact destination-policy coverage per review", async () => {
    client = await createMigratedPglite();
    await insertCommerceFixture(client);
    await insertSecondCatalogRecord(client);
    await client.exec(`
      INSERT INTO review_requests
        (id, user_id, order_id, snapshot_hash, buyer_status_snapshot,
         attestation_version_id, destination_state_code, cart_snapshot,
         buyer_review_required, destination_review_required)
      VALUES
        ('${ids.review}', '${ids.user}', '${ids.order}', '${hashE}', 'review',
         '${ids.attestation}', 'CA', '{}'::jsonb, false, true);

      INSERT INTO review_request_destination_policies
        (review_request_id, destination_policy_id, covered)
      VALUES
        ('${ids.review}', '${ids.policy}', true),
        ('${ids.review}', '${ids.policy2}', false);
    `);

    const policies = await client.query<{
      destination_policy_id: string;
      covered: boolean;
    }>(`
      SELECT destination_policy_id, covered
      FROM review_request_destination_policies
      WHERE review_request_id = '${ids.review}'
      ORDER BY destination_policy_id
    `);
    expect(policies.rows).toEqual([
      { destination_policy_id: ids.policy, covered: true },
      { destination_policy_id: ids.policy2, covered: false },
    ]);

    await expectRejected(
      client,
      `INSERT INTO review_request_destination_policies
         (review_request_id, destination_policy_id, covered)
       VALUES ('${ids.review}', '${ids.policy}', false)`,
    );
    await expectRejected(
      client,
      `INSERT INTO review_request_destination_policies
         (review_request_id, destination_policy_id, covered)
       VALUES ('00000000-0000-4000-8000-000000000099', '${ids.policy}', false)`,
    );
    await expectRejected(
      client,
      `INSERT INTO review_request_destination_policies
         (review_request_id, destination_policy_id, covered)
       VALUES ('${ids.review}', '00000000-0000-4000-8000-000000000099', false)`,
    );
    await expectRejected(
      client,
      `INSERT INTO review_requests
         (user_id, order_id, snapshot_hash, buyer_status_snapshot,
          attestation_version_id, destination_state_code, cart_snapshot,
          buyer_review_required, destination_review_required)
       VALUES
         ('${ids.user}', '${ids.order}', '${hashF}', 'active', '${ids.attestation}',
          'CA', '{}'::jsonb, false, false)`,
    );
  });

  it("rejects a reservation whose lot belongs to another product", async () => {
    client = await createMigratedPglite();
    await insertCommerceFixture(client);
    await insertSecondCatalogRecord(client);

    await expectRejected(
      client,
      `INSERT INTO inventory_reservations
         (idempotency_key, order_id, order_item_id, product_id, lot_id,
          quantity_reserved, quantity_remaining, state)
       VALUES
         ('reservation-product-mismatch', '${ids.order}', '${ids.item}',
          '${ids.product}', '${ids.lot2}', 1, 1, 'active')`,
    );
  });

  it("rejects an inventory event that disagrees with its reservation line and lot", async () => {
    client = await createMigratedPglite();
    await insertCommerceFixture(client);
    await insertSecondCatalogRecord(client);
    await client.exec(`
      INSERT INTO order_items
        (id, order_id, product_id, product_price_id, destination_policy_id,
         product_name_snapshot, package_form_snapshot, currency,
         unit_amount_minor, quantity, subtotal_minor, discount_minor, total_minor)
      VALUES
        ('${ids.item2}', '${ids.order}', '${ids.product2}', '${ids.price2}', '${ids.policy2}',
         'Synthetic product two', 'sealed vial', 'USD', 3500, 1, 3500, 0, 3500);

      INSERT INTO inventory_reservations
        (id, idempotency_key, order_id, order_item_id, product_id, lot_id,
         quantity_reserved, quantity_remaining, state)
      VALUES
        ('${ids.reservation}', 'reservation-coherent', '${ids.order}', '${ids.item}',
         '${ids.product}', '${ids.lot}', 1, 1, 'active');
    `);

    await expectRejected(
      client,
      `INSERT INTO inventory_events
         (idempotency_key, event_type, lot_id, order_id, order_item_id,
          reservation_id, quantity, balance_after)
       VALUES
         ('inventory-reservation-mismatch', 'reservation', '${ids.lot2}',
          '${ids.order}', '${ids.item2}', '${ids.reservation}', 1, 19)`,
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

  it("allows at most one consumed fulfillment release per order", async () => {
    client = await createMigratedPglite();
    await insertCommerceFixture(client);
    await client.exec(`
      INSERT INTO fulfillment_releases
        (order_id, version, idempotency_key, payment_event_id,
         state, issued_at, expires_at, consumed_at)
      VALUES
        ('${ids.order}', 1, 'consumed-release-key-1', '${ids.paymentEvent}',
         'consumed', now() - interval '2 hours', now() + interval '1 hour', now());
    `);

    await expectRejected(
      client,
      `INSERT INTO fulfillment_releases
         (order_id, version, idempotency_key, payment_event_id,
          state, issued_at, expires_at, consumed_at)
       VALUES
         ('${ids.order}', 2, 'consumed-release-key-2', '${ids.paymentEvent}',
          'consumed', now() - interval '1 hour', now() + interval '2 hours', now())`,
    );
  }, 15_000);

  it("allows release history and one consumption per distinct reservation", async () => {
    client = await createMigratedPglite();
    await insertCommerceFixture(client);

    await client.exec(`
      INSERT INTO fulfillment_releases
        (id, order_id, version, idempotency_key, payment_event_id,
         state, issued_at, expires_at)
      VALUES
        ('${ids.release}', '${ids.order}', 1, 'release-key-1', '${ids.paymentEvent}',
         'issued', now(), now() + interval '1 hour');
    `);
    await expectRejected(
      client,
      `INSERT INTO fulfillment_releases
         (order_id, version, idempotency_key, payment_event_id,
          state, issued_at, expires_at)
       VALUES
         ('${ids.order}', 2, 'release-key-2', '${ids.paymentEvent}',
          'issued', now(), now() + interval '1 hour')`,
    );
    await expectRejected(
      client,
      `INSERT INTO fulfillment_releases
         (order_id, version, idempotency_key, payment_event_id,
          state, issued_at, expires_at)
       VALUES
         ('${ids.order}', 1, 'release-key-other', '${ids.paymentEvent}',
          'revoked', now() - interval '2 hours', now() - interval '1 hour')`,
    );

    await client.exec(`
      UPDATE fulfillment_releases
      SET state = 'revoked', revoked_at = now()
      WHERE id = '${ids.release}';

      INSERT INTO inventory_reservations
        (id, idempotency_key, order_id, order_item_id, product_id, lot_id,
         quantity_reserved, quantity_remaining, state)
      VALUES
        ('${ids.reservation}', 'release-reservation-key', '${ids.order}', '${ids.item}',
         '${ids.product}', '${ids.lot}', 1, 0, 'consumed'),
        ('${ids.reservation2}', 'release-reservation-key-2', '${ids.order}', '${ids.item}',
         '${ids.product}', '${ids.lot}', 1, 0, 'consumed');

      INSERT INTO fulfillment_releases
        (order_id, version, idempotency_key, payment_event_id,
         state, issued_at, expires_at, revoked_at)
      VALUES
        ('${ids.order}', 2, 'release-key-2', '${ids.paymentEvent}',
         'revoked', now() - interval '2 hours', now() - interval '1 hour', now());

      INSERT INTO inventory_events
        (idempotency_key, event_type, lot_id, order_id, order_item_id,
         reservation_id, fulfillment_release_id, quantity, balance_after)
      SELECT 'consume-key-1', 'consume', '${ids.lot}', '${ids.order}', '${ids.item}',
             id, '${ids.release}', 1, 19
      FROM inventory_reservations WHERE idempotency_key = 'release-reservation-key';

      INSERT INTO shipments
        (order_id, fulfillment_release_id, carrier, tracking_reference, state)
      VALUES
        ('${ids.order}', '${ids.release}', 'synthetic-carrier', 'track-1', 'pending');
    `);
    await client.exec(`
      INSERT INTO inventory_events
        (idempotency_key, event_type, lot_id, order_id, order_item_id,
         reservation_id, fulfillment_release_id, quantity, balance_after)
      VALUES
        ('consume-key-2', 'consume', '${ids.lot}', '${ids.order}', '${ids.item}',
         '${ids.reservation2}', '${ids.release}', 1, 18);
    `);
    await expectRejected(
      client,
      `INSERT INTO fulfillment_releases
         (order_id, version, idempotency_key, payment_event_id,
          state, issued_at, expires_at, revoked_at)
       VALUES
         ('${ids.order}', 3, 'release-key-1', '${ids.paymentEvent}',
          'revoked', now() - interval '2 hours', now() - interval '1 hour', now())`,
    );
    await expectRejected(
      client,
      `INSERT INTO inventory_events
         (idempotency_key, event_type, lot_id, order_id, order_item_id,
          reservation_id, fulfillment_release_id, quantity, balance_after)
       SELECT 'consume-key-duplicate-reservation', 'consume', '${ids.lot}', '${ids.order}',
              '${ids.item}', id, '${ids.release}', 1, 17
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
  }, 15_000);
});
