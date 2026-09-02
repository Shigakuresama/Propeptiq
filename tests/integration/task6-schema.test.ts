import type { PGlite } from "@electric-sql/pglite";
import { PGlite as PGliteClient } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMigratedPglite } from "./helpers/pglite";

const migrationDirectory = resolve("src/db/migrations");

async function readMigration(index: number): Promise<string> {
  const prefix = `${String(index).padStart(4, "0")}_`;
  const names = (await readdir(migrationDirectory)).filter(
    (name) => name.startsWith(prefix) && name.endsWith(".sql"),
  );
  expect(names).toHaveLength(1);
  return readFile(resolve(migrationDirectory, names[0]!), "utf8");
}

async function applyMigration(client: PGlite, index: number): Promise<void> {
  const sql = await readMigration(index);
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) {
      await client.exec(statement);
    }
  }
}

const fixture = {
  user1: "67000000-0000-4000-8000-000000000001",
  user2: "67000000-0000-4000-8000-000000000002",
  attestation: "67000000-0000-4000-8000-000000000003",
  acceptance1: "67000000-0000-4000-8000-000000000004",
  acceptance2: "67000000-0000-4000-8000-000000000005",
  group: "67000000-0000-4000-8000-000000000006",
  product: "67000000-0000-4000-8000-000000000007",
  price: "67000000-0000-4000-8000-000000000008",
  lot: "67000000-0000-4000-8000-000000000009",
  policy: "67000000-0000-4000-8000-000000000010",
  order1: "67000000-0000-4000-8000-000000000011",
  order2: "67000000-0000-4000-8000-000000000012",
  item1: "67000000-0000-4000-8000-000000000013",
  item2: "67000000-0000-4000-8000-000000000014",
  attempt1: "67000000-0000-4000-8000-000000000015",
  providerEvent1: "67000000-0000-4000-8000-000000000016",
  paymentEvent1: "67000000-0000-4000-8000-000000000017",
  reservation1: "67000000-0000-4000-8000-000000000018",
  release1: "67000000-0000-4000-8000-000000000019",
} as const;

const variantFixture = {
  group: "68000000-0000-4000-8000-000000000001",
  productA: "68000000-0000-4000-8000-000000000002",
  productB: "68000000-0000-4000-8000-000000000003",
  variantA: "68000000-0000-4000-8000-000000000004",
  variantB: "68000000-0000-4000-8000-000000000005",
  priceA: "68000000-0000-4000-8000-000000000006",
  priceB: "68000000-0000-4000-8000-000000000007",
} as const;

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const hashC = "c".repeat(64);

async function expectRejected(client: PGlite, sql: string): Promise<void> {
  await expect(client.exec(sql)).rejects.toThrow();
}

async function insertVariantProducts(client: PGlite): Promise<void> {
  await client.exec(`
    INSERT INTO product_policy_groups (id, slug, name)
    VALUES ('${variantFixture.group}', 'variant-fixture-group', 'Variant fixture group');
    INSERT INTO products
      (id, slug, name, package_form, material_identity, policy_group_id, status)
    VALUES
      ('${variantFixture.productA}', 'variant-fixture-a', 'Variant fixture A',
       'sealed unit', 'Synthetic identity A', '${variantFixture.group}', 'active'),
      ('${variantFixture.productB}', 'variant-fixture-b', 'Variant fixture B',
       'sealed unit', 'Synthetic identity B', '${variantFixture.group}', 'active');
  `);
}

async function insertTask6Fixture(client: PGlite): Promise<void> {
  await client.exec(`
    INSERT INTO users (id, clerk_id, email_verified_at)
    VALUES
      ('${fixture.user1}', 'task6-user-one', now()),
      ('${fixture.user2}', 'task6-user-two', now());
    INSERT INTO buyer_profiles
      (user_id, status, age_confirmed_at, research_purpose)
    VALUES
      ('${fixture.user1}', 'active', now(), 'analytical'),
      ('${fixture.user2}', 'active', now(), 'analytical');
    INSERT INTO attestation_versions
      (id, version, content_hash, policy_text, effective_at)
    VALUES
      ('${fixture.attestation}', 1, '${hashA}', 'Task 6 attestation', now());
    INSERT INTO attestation_acceptances
      (id, user_id, attestation_version_id, accepted_at)
    VALUES
      ('${fixture.acceptance1}', '${fixture.user1}', '${fixture.attestation}', now()),
      ('${fixture.acceptance2}', '${fixture.user2}', '${fixture.attestation}', now());
    INSERT INTO product_policy_groups (id, slug, name)
    VALUES ('${fixture.group}', 'task6-core-group', 'Task 6 core group');
    INSERT INTO products
      (id, slug, name, package_form, material_identity, policy_group_id, status)
    VALUES
      ('${fixture.product}', 'task6-core-product', 'Task 6 core product',
       'sealed unit', 'Synthetic identity', '${fixture.group}', 'active');
    INSERT INTO product_prices
      (id, product_id, version, amount_minor, currency, effective_at)
    VALUES ('${fixture.price}', '${fixture.product}', 1, 1000, 'USD', now());
    INSERT INTO lots
      (id, product_id, supplier_name, supplier_lot_code,
       received_quantity, available_quantity, status)
    VALUES
      ('${fixture.lot}', '${fixture.product}', 'Synthetic supplier',
       'TASK6-CORE', 10, 10, 'released');
    INSERT INTO destination_policies
      (id, scope_kind, product_id, state_code, result, version, active, effective_at)
    VALUES
      ('${fixture.policy}', 'product', '${fixture.product}', 'CA',
       'allowed', 1, true, now());
    INSERT INTO orders
      (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
       destination_state_code, currency, subtotal_minor, discount_minor,
       tax_minor, shipping_minor, total_minor, state)
    VALUES
      ('${fixture.order1}', '${fixture.user1}', 'active', '${fixture.acceptance1}',
       'CA', 'USD', 1000, 0, 0, 0, 1000, 'checkout_pending'),
      ('${fixture.order2}', '${fixture.user2}', 'active', '${fixture.acceptance2}',
       'CA', 'USD', 1000, 0, 0, 0, 1000, 'checkout_pending');
    INSERT INTO order_items
      (id, order_id, product_id, product_price_id, destination_policy_id,
       product_name_snapshot, package_form_snapshot, currency,
       unit_amount_minor, quantity, subtotal_minor, discount_minor, total_minor)
    VALUES
      ('${fixture.item1}', '${fixture.order1}', '${fixture.product}', '${fixture.price}',
       '${fixture.policy}', 'Task 6 core product', 'sealed unit', 'USD',
       1000, 1, 1000, 0, 1000),
      ('${fixture.item2}', '${fixture.order2}', '${fixture.product}', '${fixture.price}',
       '${fixture.policy}', 'Task 6 core product', 'sealed unit', 'USD',
       1000, 1, 1000, 0, 1000);
    INSERT INTO checkout_attempts
      (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
       account_gate, attestation_gate, product_gate, destination_gate,
       inventory_gate, payment_provider_gate, permitted, review_required,
       tax_ready, shipping_ready)
    VALUES
      ('${fixture.attempt1}', '${fixture.order1}', '${fixture.user1}',
       'task6-core-attempt', '${hashA}', 'created', 'blocked', 'pass', 'pass',
       'pass', 'pass', 'pass', false, false, false, false);
    INSERT INTO provider_events
      (id, provider, provider_event_id, payload_hash, status, event_type,
       schema_version, normalized_payload, provider_created_at, livemode)
    VALUES
      ('${fixture.providerEvent1}', 'synthetic_provider', 'evt_task6_core',
       '${hashB}', 'pending', 'checkout.session.completed', 1,
       '{"providerEventId":"evt_task6_core","eventType":"checkout.session.completed","schemaVersion":1,"livemode":false}'::jsonb,
       now(), false);
    INSERT INTO payment_events
      (id, provider_event_id, order_id, event_type, provider_payment_id,
       idempotency_key, amount_minor, currency, occurred_at)
    VALUES
      ('${fixture.paymentEvent1}', '${fixture.providerEvent1}', '${fixture.order1}',
       'payment_verified', 'pay_task6_core', 'task6-payment-core', 1000, 'USD', now());
  `);
}

describe("Task 6 schema boundary", () => {
  let client: PGlite | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  it("refuses the variant migration when current legacy commerce facts have no approved mapping", async () => {
    client = new PGliteClient();
    for (let migration = 0; migration <= 25; migration += 1) {
      await applyMigration(client, migration);
    }
    await insertVariantProducts(client);
    await client.exec(`
      INSERT INTO product_prices
        (id, product_id, version, amount_minor, currency, effective_at)
      VALUES
        ('${variantFixture.priceA}', '${variantFixture.productA}', 1, 1000,
         'USD', now());
    `);

    await expect(applyMigration(client, 26)).rejects.toThrow(
      /0026 preflight refused.*variant reconciliation/i,
    );

    const boundary = await client.query<{ variants_table: boolean }>(`
      SELECT to_regclass('public.product_variants') IS NOT NULL AS variants_table
    `);
    expect(boundary.rows).toEqual([{ variants_table: false }]);
  });

  it("rejects duplicate canonical variant SKUs", async () => {
    client = await createMigratedPglite();
    await insertVariantProducts(client);
    await client.exec(`
      INSERT INTO product_variants
        (id, product_id, sku, label, canonical_amount, amount_unit,
         package_quantity, status)
      VALUES
        ('${variantFixture.variantA}', '${variantFixture.productA}',
         'TEST-FIXTURE-5', '5 mg synthetic unit', 5, 'mg', 1, 'inactive');
    `);

    await expectRejected(
      client,
      `INSERT INTO product_variants
        (id, product_id, sku, label, canonical_amount, amount_unit,
         package_quantity, status)
       VALUES ('${variantFixture.variantB}', '${variantFixture.productB}',
         'TEST-FIXTURE-5', 'Another synthetic unit', 5, 'mg', 1, 'inactive')`,
    );
  });

  it("rejects overlapping current prices for one canonical variant", async () => {
    client = await createMigratedPglite();
    await insertVariantProducts(client);
    await client.exec(`
      INSERT INTO product_variants
        (id, product_id, sku, label, canonical_amount, amount_unit,
         package_quantity, status)
      VALUES
        ('${variantFixture.variantA}', '${variantFixture.productA}',
         'TEST-FIXTURE-5', '5 mg synthetic unit', 5, 'mg', 1, 'inactive');
      INSERT INTO product_prices
        (id, product_id, variant_id, version, price_status, amount_minor,
         currency, effective_at)
      VALUES
        ('${variantFixture.priceA}', '${variantFixture.productA}',
         '${variantFixture.variantA}', 1, 'pending', 0, 'USD', now());
    `);

    await expectRejected(
      client,
      `INSERT INTO product_prices
        (product_id, variant_id, version, price_status, amount_minor,
         currency, effective_at)
       VALUES ('${variantFixture.productA}', '${variantFixture.variantA}', 2,
         'pending', 0, 'USD', now())`,
    );
  });

  it("rejects an active zero-dollar canonical variant price", async () => {
    client = await createMigratedPglite();
    await insertVariantProducts(client);
    await client.exec(`
      INSERT INTO product_variants
        (id, product_id, sku, label, canonical_amount, amount_unit,
         package_quantity, status)
      VALUES
        ('${variantFixture.variantA}', '${variantFixture.productA}',
         'TEST-FIXTURE-5', '5 mg synthetic unit', 5, 'mg', 1, 'active');
    `);

    await expectRejected(
      client,
      `INSERT INTO product_prices
        (product_id, variant_id, version, price_status, amount_minor,
         currency, effective_at)
       VALUES ('${variantFixture.productA}', '${variantFixture.variantA}', 1,
         'active', 0, 'USD', now())`,
    );
  });

  it("rejects an order item whose canonical variant belongs to another product", async () => {
    client = await createMigratedPglite();
    await insertVariantProducts(client);
    await client.exec(`
      INSERT INTO product_variants
        (id, product_id, sku, label, canonical_amount, amount_unit,
         package_quantity, status)
      VALUES
        ('${variantFixture.variantA}', '${variantFixture.productA}',
         'TEST-FIXTURE-5', '5 mg synthetic unit', 5, 'mg', 1, 'active'),
        ('${variantFixture.variantB}', '${variantFixture.productB}',
         'TEST-FIXTURE-10', '10 mg synthetic unit', 10, 'mg', 1, 'active');
      INSERT INTO product_prices
        (id, product_id, variant_id, version, price_status, amount_minor,
         currency, effective_at)
      VALUES
        ('${variantFixture.priceA}', '${variantFixture.productB}',
         '${variantFixture.variantB}', 1, 'active', 1000, 'USD', now());
      INSERT INTO users (id, clerk_id, email_verified_at)
      VALUES ('68000000-0000-4000-8000-000000000011', 'variant-order-buyer', now());
      INSERT INTO attestation_versions
        (id, version, content_hash, policy_text, effective_at)
      VALUES ('68000000-0000-4000-8000-000000000012', 1, '${hashA}',
        'Variant order fixture attestation', now());
      INSERT INTO attestation_acceptances
        (id, user_id, attestation_version_id, accepted_at)
      VALUES ('68000000-0000-4000-8000-000000000013',
        '68000000-0000-4000-8000-000000000011',
        '68000000-0000-4000-8000-000000000012', now());
      INSERT INTO destination_policies
        (id, scope_kind, product_id, state_code, result, version, active,
         effective_at)
      VALUES ('68000000-0000-4000-8000-000000000014', 'product',
        '${variantFixture.productB}', 'CA', 'allowed', 1, true, now());
      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state)
      VALUES ('68000000-0000-4000-8000-000000000015',
        '68000000-0000-4000-8000-000000000011', 'active',
        '68000000-0000-4000-8000-000000000013', 'CA', 'USD',
        1000, 0, 0, 0, 1000, 'checkout_pending');
    `);

    await expectRejected(
      client,
      `INSERT INTO order_items
        (order_id, product_id, variant_id, product_price_id,
         destination_policy_id, product_name_snapshot, package_form_snapshot,
         currency, unit_amount_minor, quantity, subtotal_minor,
         discount_minor, total_minor)
       VALUES ('68000000-0000-4000-8000-000000000015',
         '${variantFixture.productB}', '${variantFixture.variantA}',
         '${variantFixture.priceA}', '68000000-0000-4000-8000-000000000014',
         'Variant fixture B', 'sealed unit', 'USD', 1000, 1, 1000, 0, 1000)`,
    );
  });

  it("rejects a same-product order item whose price belongs to another variant", async () => {
    client = await createMigratedPglite();
    await insertVariantProducts(client);
    await client.exec(`
      INSERT INTO product_variants
        (id, product_id, sku, label, canonical_amount, amount_unit,
         package_quantity, status)
      VALUES
        ('${variantFixture.variantA}', '${variantFixture.productA}',
         'TEST-FIXTURE-5', '5 mg synthetic unit', 5, 'mg', 1, 'active'),
        ('${variantFixture.variantB}', '${variantFixture.productA}',
         'TEST-FIXTURE-10', '10 mg synthetic unit', 10, 'mg', 1, 'active');
      INSERT INTO product_prices
        (id, product_id, variant_id, version, price_status, amount_minor,
         currency, effective_at)
      VALUES
        ('${variantFixture.priceB}', '${variantFixture.productA}',
         '${variantFixture.variantB}', 1, 'active', 1000, 'USD', now());
      INSERT INTO users (id, clerk_id, email_verified_at)
      VALUES ('68000000-0000-4000-8000-000000000021', 'same-product-price-buyer', now());
      INSERT INTO attestation_versions
        (id, version, content_hash, policy_text, effective_at)
      VALUES ('68000000-0000-4000-8000-000000000022', 1, '${hashA}',
        'Same-product price fixture attestation', now());
      INSERT INTO attestation_acceptances
        (id, user_id, attestation_version_id, accepted_at)
      VALUES ('68000000-0000-4000-8000-000000000023',
        '68000000-0000-4000-8000-000000000021',
        '68000000-0000-4000-8000-000000000022', now());
      INSERT INTO destination_policies
        (id, scope_kind, product_id, state_code, result, version, active,
         effective_at)
      VALUES ('68000000-0000-4000-8000-000000000024', 'product',
        '${variantFixture.productA}', 'CA', 'allowed', 1, true, now());
      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state)
      VALUES ('68000000-0000-4000-8000-000000000025',
        '68000000-0000-4000-8000-000000000021', 'active',
        '68000000-0000-4000-8000-000000000023', 'CA', 'USD',
        1000, 0, 0, 0, 1000, 'checkout_pending');
    `);

    await expect(
      client.exec(`INSERT INTO order_items
        (order_id, product_id, variant_id, product_price_id,
         destination_policy_id, product_name_snapshot, package_form_snapshot,
         currency, unit_amount_minor, quantity, subtotal_minor,
         discount_minor, total_minor)
       VALUES ('68000000-0000-4000-8000-000000000025',
         '${variantFixture.productA}', '${variantFixture.variantA}',
         '${variantFixture.priceB}', '68000000-0000-4000-8000-000000000024',
         'Variant fixture A', 'sealed unit', 'USD', 1000, 1, 1000, 0, 1000)`),
    ).rejects.toThrow(/order_items_price_variant_fk/);
  });

  it("rejects a same-product reservation whose canonical item and lot variants differ", async () => {
    client = await createMigratedPglite();
    await insertTask6Fixture(client);
    await client.exec(`
      INSERT INTO product_variants
        (id, product_id, sku, label, canonical_amount, amount_unit,
         package_quantity, status)
      VALUES
        ('${variantFixture.variantA}', '${fixture.product}', 'TASK6-VARIANT-A',
         'Task 6 variant A', 5, 'mg', 1, 'active'),
        ('${variantFixture.variantB}', '${fixture.product}', 'TASK6-VARIANT-B',
         'Task 6 variant B', 10, 'mg', 1, 'active');
      UPDATE product_prices
      SET variant_id = '${variantFixture.variantA}'
      WHERE id = '${fixture.price}';
      UPDATE order_items
      SET variant_id = '${variantFixture.variantA}'
      WHERE id = '${fixture.item1}';
      UPDATE lots
      SET variant_id = '${variantFixture.variantB}'
      WHERE id = '${fixture.lot}';
    `);

    await expectRejected(
      client,
      `INSERT INTO inventory_reservations
        (checkout_attempt_id, idempotency_key, order_id, order_item_id,
         product_id, variant_id, lot_id, quantity_reserved,
         quantity_remaining, state, expires_at)
       VALUES ('${fixture.attempt1}', 'task6-cross-variant-reservation',
         '${fixture.order1}', '${fixture.item1}', '${fixture.product}',
         '${variantFixture.variantA}', '${fixture.lot}', 1, 1, 'active',
         now() + interval '1 hour')`,
    );
  });

  it("refuses to backfill a populated mixed reservation variant identity", async () => {
    client = new PGliteClient();
    for (let migration = 0; migration <= 30; migration += 1) {
      await applyMigration(client, migration);
    }
    await insertTask6Fixture(client);
    await client.exec(`
      INSERT INTO product_variants
        (id, product_id, sku, label, canonical_amount, amount_unit,
         package_quantity, status)
      VALUES
        ('${variantFixture.variantA}', '${fixture.product}', 'TASK6-MIGRATION-A',
         'Task 6 migration variant A', 5, 'mg', 1, 'active'),
        ('${variantFixture.variantB}', '${fixture.product}', 'TASK6-MIGRATION-B',
         'Task 6 migration variant B', 10, 'mg', 1, 'active');
      UPDATE product_prices
      SET variant_id = '${variantFixture.variantA}'
      WHERE id = '${fixture.price}';
      UPDATE order_items
      SET variant_id = '${variantFixture.variantA}'
      WHERE id = '${fixture.item1}';
      UPDATE lots
      SET variant_id = '${variantFixture.variantB}'
      WHERE id = '${fixture.lot}';
      INSERT INTO inventory_reservations
        (id, checkout_attempt_id, idempotency_key, order_id, order_item_id,
         product_id, lot_id, quantity_reserved, quantity_remaining, state, expires_at)
      VALUES ('${fixture.reservation1}', '${fixture.attempt1}',
        'task6-migration-cross-variant', '${fixture.order1}', '${fixture.item1}',
        '${fixture.product}', '${fixture.lot}', 1, 1, 'active',
        now() + interval '1 hour');
    `);

    await expect(applyMigration(client, 31)).rejects.toThrow(
      /inventory reservation variant reconciliation required/i,
    );
    const variants = await client.query<{ variant_id: string | null }>(
      `SELECT variant_id::text FROM inventory_reservations WHERE id = '${fixture.reservation1}'`,
    );
    expect(variants.rows).toEqual([{ variant_id: null }]);
  });

  it.each([
    [
      "canonical item with legacy lot",
      `UPDATE product_prices SET variant_id = '${variantFixture.variantA}'
         WHERE id = '${fixture.price}';
       UPDATE order_items SET variant_id = '${variantFixture.variantA}'
         WHERE id = '${fixture.item1}';`,
    ],
    [
      "legacy item with canonical lot",
      `UPDATE lots SET variant_id = '${variantFixture.variantA}'
         WHERE id = '${fixture.lot}';`,
    ],
  ] as const)("refuses to backfill a populated %s reservation identity", async (_label, mutation) => {
    client = new PGliteClient();
    for (let migration = 0; migration <= 30; migration += 1) {
      await applyMigration(client, migration);
    }
    await insertTask6Fixture(client);
    await client.exec(`
      INSERT INTO product_variants
        (id, product_id, sku, label, canonical_amount, amount_unit,
         package_quantity, status)
      VALUES ('${variantFixture.variantA}', '${fixture.product}',
        'TASK6-MIGRATION-MIXED', 'Task 6 mixed migration variant',
        5, 'mg', 1, 'active');
      ${mutation}
      INSERT INTO inventory_reservations
        (id, checkout_attempt_id, idempotency_key, order_id, order_item_id,
         product_id, lot_id, quantity_reserved, quantity_remaining, state, expires_at)
      VALUES ('${fixture.reservation1}', '${fixture.attempt1}',
        'task6-migration-mixed-null', '${fixture.order1}', '${fixture.item1}',
        '${fixture.product}', '${fixture.lot}', 1, 1, 'active',
        now() + interval '1 hour');
    `);

    await expect(applyMigration(client, 31)).rejects.toThrow(
      /inventory reservation variant reconciliation required/i,
    );
    expect((await client.query<{ variant_id: string | null }>(
      `SELECT variant_id::text FROM inventory_reservations WHERE id = '${fixture.reservation1}'`,
    )).rows).toEqual([{ variant_id: null }]);
  });

  it("rejects a WINTER30 campaign with any percentage other than 3000 basis points", async () => {
    client = await createMigratedPglite();

    await expect(
      client.exec(`INSERT INTO promotions
        (campaign_key, code, name, kind, status, basis_points, configuration,
         enabled, timezone, application_mode, scope)
       VALUES ('winter30', 'WINTER30', 'Winter Sale', 'discount', 'active',
         2999, '{}'::jsonb, true, 'America/Los_Angeles', 'automatic',
         'sitewide')`),
    ).rejects.toThrow(/promotions_winter30_exact/);
  });

  it("rejects a populated 0002 commerce chain before any 0003 conversion", async () => {
    client = new PGliteClient();
    await applyMigration(client, 0);
    await applyMigration(client, 1);
    await applyMigration(client, 2);
    await client.exec(`
      INSERT INTO users (id, clerk_id, email_verified_at)
      VALUES ('66000000-0000-4000-8000-000000000101', 'task6-legacy-buyer', now());
      INSERT INTO buyer_profiles
        (user_id, status, age_confirmed_at, research_purpose)
      VALUES ('66000000-0000-4000-8000-000000000101', 'active', now(), 'analytical');
      INSERT INTO attestation_versions
        (id, version, content_hash, policy_text, effective_at)
      VALUES
        ('66000000-0000-4000-8000-000000000102', 1,
         '${"a".repeat(64)}', 'Legacy attestation', now());
      INSERT INTO attestation_acceptances
        (id, user_id, attestation_version_id, accepted_at)
      VALUES
        ('66000000-0000-4000-8000-000000000103',
         '66000000-0000-4000-8000-000000000101',
         '66000000-0000-4000-8000-000000000102', now());
      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state)
      VALUES
        ('66000000-0000-4000-8000-000000000104',
         '66000000-0000-4000-8000-000000000101', 'active',
         '66000000-0000-4000-8000-000000000103', 'CA', 'USD',
         1000, 0, 0, 0, 1000, 'paid_pending_clearance');
    `);

    await expect(applyMigration(client, 3)).rejects.toThrow(
      /0003 preflight refused.*orders.*reconciliation/i,
    );

    const versionColumn = await client.query<{ count: number }>(`
      SELECT count(*)::int AS count
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'promotions'
        AND column_name = 'version'
    `);
    const orderStates = await client.query<{ enumlabel: string }>(`
      SELECT enumlabel
      FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'order_state'
      ORDER BY enumsortorder
    `);
    expect(versionColumn.rows).toEqual([{ count: 0 }]);
    expect(orderStates.rows.map(({ enumlabel }) => enumlabel)).toContain(
      "paid_pending_clearance",
    );
    expect(orderStates.rows.map(({ enumlabel }) => enumlabel)).not.toContain(
      "paid_pending_fulfillment",
    );
  });

  it("rejects a populated 0002 provider inbox before adding normalized columns", async () => {
    client = new PGliteClient();
    await applyMigration(client, 0);
    await applyMigration(client, 1);
    await applyMigration(client, 2);
    await client.exec(`
      INSERT INTO provider_events
        (provider, provider_event_id, payload_hash, status)
      VALUES ('synthetic_provider', 'evt_task6_legacy', '${hashA}', 'pending')
    `);

    await expect(applyMigration(client, 3)).rejects.toThrow(
      /0003 preflight refused.*provider_events.*reconciliation/i,
    );

    const normalizedColumn = await client.query<{ count: number }>(`
      SELECT count(*)::int AS count
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'provider_events'
        AND column_name = 'normalized_payload'
    `);
    expect(normalizedColumn.rows).toEqual([{ count: 0 }]);
  });

  it("deterministically backfills an existing promotion to terms version one", async () => {
    client = new PGliteClient();
    await applyMigration(client, 0);
    await applyMigration(client, 1);
    await applyMigration(client, 2);
    await client.exec(`
      INSERT INTO promotions
        (id, code, name, kind, status, basis_points, configuration)
      VALUES
        ('66000000-0000-4000-8000-000000000201', 'TASK6LEGACY',
         'Task 6 legacy promotion', 'discount', 'draft', 1000, '{}'::jsonb)
    `);

    await applyMigration(client, 3);

    const promotion = await client.query<{ version: number }>(`
      SELECT version FROM promotions
      WHERE id = '66000000-0000-4000-8000-000000000201'
    `);
    expect(promotion.rows).toEqual([{ version: 1 }]);
  });

  it("applies the complete 0000 through 0003 chain to an empty commerce database", async () => {
    client = new PGliteClient();
    for (const migration of [0, 1, 2, 3]) {
      await applyMigration(client, migration);
    }

    const boundary = await client.query<{
      promotion_version: boolean;
      effects_table: boolean;
      old_order_state: boolean;
      new_order_state: boolean;
    }>(`
      SELECT
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'promotions'
            AND column_name = 'version'
        ) AS promotion_version,
        to_regclass('public.downstream_effects') IS NOT NULL AS effects_table,
        EXISTS (
          SELECT 1 FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
          WHERE pg_type.typname = 'order_state'
            AND pg_enum.enumlabel = 'paid_pending_clearance'
        ) AS old_order_state,
        EXISTS (
          SELECT 1 FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
          WHERE pg_type.typname = 'order_state'
            AND pg_enum.enumlabel = 'paid_pending_fulfillment'
        ) AS new_order_state
    `);
    expect(boundary.rows).toEqual([
      {
        promotion_version: true,
        effects_table: true,
        old_order_state: false,
        new_order_state: true,
      },
    ]);
  });

  it("accepts one normalized U.S. address and rejects row-local PII shape violations", async () => {
    client = await createMigratedPglite();
    await insertTask6Fixture(client);
    await client.exec(`
      INSERT INTO order_shipping_addresses
        (order_id, recipient_name, address_line1, address_line2, city,
         state_code, postal_code, country)
      VALUES
        ('${fixture.order1}', 'Dr. Ada Lovelace', '123 Research Way',
         'Unit 4', 'Los Angeles', 'CA', '90001-1234', 'US')
    `);

    const address = await client.query<{
      recipient_name: string;
      state_code: string;
      postal_code: string;
    }>(`
      SELECT recipient_name, state_code, postal_code
      FROM order_shipping_addresses WHERE order_id = '${fixture.order1}'
    `);
    expect(address.rows).toEqual([
      {
        recipient_name: "Dr. Ada Lovelace",
        state_code: "CA",
        postal_code: "90001-1234",
      },
    ]);

    await expectRejected(
      client,
      `UPDATE order_shipping_addresses SET recipient_name = repeat('x', 121)
       WHERE order_id = '${fixture.order1}'`,
    );
    await expectRejected(
      client,
      `UPDATE order_shipping_addresses SET address_line1 = E'Line\\nTwo'
       WHERE order_id = '${fixture.order1}'`,
    );
    await expectRejected(
      client,
      `UPDATE order_shipping_addresses SET address_line2 = '   '
       WHERE order_id = '${fixture.order1}'`,
    );
    await expectRejected(
      client,
      `UPDATE order_shipping_addresses SET state_code = 'NV'
       WHERE order_id = '${fixture.order1}'`,
    );
    await expectRejected(
      client,
      `UPDATE order_shipping_addresses SET postal_code = '9000'
       WHERE order_id = '${fixture.order1}'`,
    );
    await expectRejected(
      client,
      `UPDATE order_shipping_addresses SET country = 'CA'
       WHERE order_id = '${fixture.order1}'`,
    );
  });

  it("enforces buyer-scoped checkout identity plus quote, provider, status, and expiry coherence", async () => {
    client = await createMigratedPglite();
    await insertTask6Fixture(client);
    await client.exec(`
      INSERT INTO checkout_attempts
        (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         tax_ready, shipping_ready, provider, provider_request_id,
         provider_request_hash, tax_quote_reference, shipping_quote_reference,
         shipping_service, expires_at, provider_customer_email, provider_origin,
         provider_request_schema_version, provider_livemode, provider_scope)
      VALUES
        ('67000000-0000-4000-8000-000000000020', '${fixture.order1}',
         '${fixture.user1}', 'task6-shared-key', '${hashB}', 'created',
         'pass', 'pass', 'pass', 'pass', 'pass', 'pass', true, false, true, true,
         'synthetic_provider', 'req_task6_valid', '${hashC}', 'tax_task6_valid',
         'shipping_task6_valid', 'ground', now() + interval '1 hour',
         'synthetic.buyer@example.test', 'https://commerce.synthetic.example',
         1, false, 'synthetic_provider:task6');

      INSERT INTO checkout_attempts
        (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         tax_ready, shipping_ready)
      VALUES
        ('67000000-0000-4000-8000-000000000021', '${fixture.order1}',
         '${fixture.user1}', 'task6-repeat-key', '${hashB}', 'created',
         'blocked', 'pass', 'pass', 'pass', 'pass', 'pass', false, false, false, false),
        ('67000000-0000-4000-8000-000000000022', '${fixture.order2}',
         '${fixture.user2}', 'task6-shared-key', '${hashB}', 'created',
         'blocked', 'pass', 'pass', 'pass', 'pass', 'pass', false, false, false, false);

      INSERT INTO checkout_attempts
        (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         tax_ready, shipping_ready, provider, provider_request_id,
         provider_request_hash, tax_quote_reference, shipping_quote_reference,
         shipping_service, expires_at, provider_customer_email, provider_origin,
         provider_request_schema_version, provider_livemode, provider_scope)
      VALUES
        ('67000000-0000-4000-8000-000000000023', '${fixture.order1}',
         '${fixture.user1}', 'task6-provider-unknown', '${hashC}', 'provider_unknown',
         'pass', 'pass', 'pass', 'pass', 'pass', 'pass', true, false, true, true,
         'synthetic_provider', 'req_task6_unknown', '${hashA}', 'tax_task6_unknown',
         'shipping_task6_unknown', 'ground', now() + interval '1 hour',
         'synthetic.buyer@example.test', 'https://commerce.synthetic.example',
         1, false, 'synthetic_provider:task6');
    `);

    await expectRejected(
      client,
      `INSERT INTO checkout_attempts
        (order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         tax_ready, shipping_ready)
       VALUES ('${fixture.order1}', '${fixture.user1}', 'task6-shared-key',
         '${hashC}', 'created', 'blocked', 'pass', 'pass', 'pass', 'pass', 'pass',
         false, false, false, false)`,
    );
    await expectRejected(
      client,
      `INSERT INTO checkout_attempts
        (order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         tax_ready, shipping_ready)
       VALUES ('${fixture.order1}', '${fixture.user1}', 'task6-missing-tax-reference',
         '${hashC}', 'created', 'blocked', 'pass', 'pass', 'pass', 'pass', 'pass',
         false, false, true, false)`,
    );
    await expectRejected(
      client,
      `INSERT INTO checkout_attempts
        (order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         tax_ready, shipping_ready, shipping_quote_reference)
       VALUES ('${fixture.order1}', '${fixture.user1}', 'task6-missing-shipping-service',
         '${hashC}', 'created', 'blocked', 'pass', 'pass', 'pass', 'pass', 'pass',
         false, false, false, true, 'shipping_without_service')`,
    );
    await expectRejected(
      client,
      `INSERT INTO checkout_attempts
        (order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         tax_ready, shipping_ready, provider, provider_request_id,
         provider_request_hash, tax_quote_reference, shipping_quote_reference,
         shipping_service, expires_at, provider_customer_email, provider_origin,
         provider_request_schema_version, provider_livemode, provider_scope)
       VALUES ('${fixture.order1}', '${fixture.user1}', 'task6-open-without-session',
         '${hashC}', 'open', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', true,
         false, true, true, 'synthetic_provider', 'req_task6_missing_session',
         '${hashA}', 'tax_task6_missing_session', 'shipping_task6_missing_session',
         'ground', now() + interval '1 hour', 'synthetic.buyer@example.test',
         'https://commerce.synthetic.example', 1, false, 'synthetic_provider:task6')`,
    );
    await expectRejected(
      client,
      `INSERT INTO checkout_attempts
        (order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         tax_ready, shipping_ready, provider, provider_request_id,
         provider_request_hash, tax_quote_reference, shipping_quote_reference,
         shipping_service, expires_at, provider_customer_email, provider_origin,
         provider_request_schema_version, provider_livemode, provider_scope)
       VALUES ('${fixture.order1}', '${fixture.user1}', 'task6-past-provider-expiry',
         '${hashC}', 'created', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass', true,
         false, true, true, 'synthetic_provider', 'req_task6_past_expiry',
         '${hashA}', 'tax_task6_past_expiry', 'shipping_task6_past_expiry',
         'ground', now() - interval '1 minute', 'synthetic.buyer@example.test',
         'https://commerce.synthetic.example', 1, false, 'synthetic_provider:task6')`,
    );
  });

  it("enforces the provider inbox status matrix and duplicated normalized-envelope facts", async () => {
    client = await createMigratedPglite();
    await client.exec(`
      INSERT INTO provider_events
        (provider, provider_event_id, payload_hash, status, attempt_count,
         lease_token, lease_expires_at, processed_at, last_error_redacted,
         event_type, schema_version, normalized_payload, provider_created_at, livemode)
      VALUES
        ('synthetic', 'evt_task6_processing', '${hashA}', 'processing', 1,
         'lease-task6', now() + interval '1 hour', null, null,
         'checkout.session.completed', 1,
         '{"providerEventId":"evt_task6_processing","eventType":"checkout.session.completed","schemaVersion":1,"livemode":false}'::jsonb,
         now(), false),
        ('synthetic', 'evt_task6_processed', '${hashB}', 'processed', 1,
         null, null, now(), null, 'checkout.session.completed', 1,
         '{"providerEventId":"evt_task6_processed","eventType":"checkout.session.completed","schemaVersion":1,"livemode":false}'::jsonb,
         now(), false),
        ('synthetic', 'evt_task6_failed', '${hashC}', 'failed', 1,
         null, null, null, 'redacted failure', 'checkout.session.completed', 1,
         '{"providerEventId":"evt_task6_failed","eventType":"checkout.session.completed","schemaVersion":1,"livemode":false}'::jsonb,
         now(), false),
        ('synthetic', 'evt_task6_deferred', '${hashA}', 'deferred', 1,
         null, null, null, 'dependency missing', 'refund.updated', 1,
         '{"providerEventId":"evt_task6_deferred","eventType":"refund.updated","schemaVersion":1,"livemode":false}'::jsonb,
         now(), false),
        ('synthetic', 'evt_task6_conflict', '${hashB}', 'conflict', 1,
         null, null, now(), 'payload conflict', 'checkout.session.completed', 1,
         '{"providerEventId":"evt_task6_conflict","eventType":"checkout.session.completed","schemaVersion":1,"livemode":false}'::jsonb,
         now(), false)
    `);

    await expectRejected(
      client,
      `INSERT INTO provider_events
        (provider, provider_event_id, payload_hash, status, last_error_redacted,
         event_type, schema_version, normalized_payload, provider_created_at, livemode)
       VALUES ('synthetic', 'evt_task6_pending_error', '${hashC}', 'pending',
         'stale error', 'checkout.session.completed', 1,
         '{"providerEventId":"evt_task6_pending_error","eventType":"checkout.session.completed","schemaVersion":1,"livemode":false}'::jsonb,
         now(), false)`,
    );
    await expectRejected(
      client,
      `INSERT INTO provider_events
        (provider, provider_event_id, payload_hash, status, attempt_count,
         event_type, schema_version, normalized_payload, provider_created_at, livemode)
       VALUES ('synthetic', 'evt_task6_processing_no_lease', '${hashC}',
         'processing', 1, 'checkout.session.completed', 1,
         '{"providerEventId":"evt_task6_processing_no_lease","eventType":"checkout.session.completed","schemaVersion":1,"livemode":false}'::jsonb,
         now(), false)`,
    );
    await expectRejected(
      client,
      `INSERT INTO provider_events
        (provider, provider_event_id, payload_hash, status, event_type,
         schema_version, normalized_payload, provider_created_at, livemode)
       VALUES ('synthetic', 'evt_task6_envelope_mismatch', '${hashC}', 'pending',
         'checkout.session.completed', 1,
         '{"providerEventId":"evt_different","eventType":"checkout.session.completed","schemaVersion":1,"livemode":false}'::jsonb,
         now(), false)`,
    );
    await expectRejected(
      client,
      `INSERT INTO provider_events
        (provider, provider_event_id, payload_hash, status, event_type,
         schema_version, normalized_payload, provider_created_at, livemode)
       VALUES ('synthetic', 'evt_task6_schema_version', '${hashC}', 'pending',
         'checkout.session.completed', 2,
         '{"providerEventId":"evt_task6_schema_version","eventType":"checkout.session.completed","schemaVersion":2,"livemode":false}'::jsonb,
         now(), false)`,
    );
  });

  it("requires the exact unreconciled-refund journal identity and payment shape", async () => {
    client = await createMigratedPglite();
    await insertTask6Fixture(client);
    const providerEventId = "67000000-0000-4000-8000-000000000030";
    await client.exec(`
      INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status, event_type,
         schema_version, normalized_payload, provider_created_at, livemode)
      VALUES
        ('${providerEventId}', 'synthetic_provider', 'evt_task6_refund_observed',
         '${hashC}', 'pending', 'charge.refunded', 1,
         '{"providerEventId":"evt_task6_refund_observed","eventType":"charge.refunded","schemaVersion":1,"livemode":false}'::jsonb,
         now(), false);
      INSERT INTO payment_events
        (provider_event_id, order_id, event_type, provider_payment_id,
         idempotency_key, amount_minor, currency, occurred_at)
      VALUES
        ('${providerEventId}', '${fixture.order1}', 'unreconciled_refund_observed',
         'pay_task6_core', 'provider_event:${providerEventId}:unreconciled_refund',
         300, 'USD', now())
    `);

    const invalidEventId = "67000000-0000-4000-8000-000000000031";
    await client.exec(`
      INSERT INTO provider_events
        (id, provider, provider_event_id, payload_hash, status, event_type,
         schema_version, normalized_payload, provider_created_at, livemode)
      VALUES
        ('${invalidEventId}', 'synthetic_provider', 'evt_task6_refund_invalid',
         '${hashC}', 'pending', 'charge.refunded', 1,
         '{"providerEventId":"evt_task6_refund_invalid","eventType":"charge.refunded","schemaVersion":1,"livemode":false}'::jsonb,
         now(), false)
    `);
    await expectRejected(
      client,
      `INSERT INTO payment_events
        (provider_event_id, order_id, event_type, provider_payment_id,
         idempotency_key, amount_minor, currency, occurred_at)
       VALUES ('${invalidEventId}', '${fixture.order1}',
         'unreconciled_refund_observed', 'pay_task6_core',
         'provider_event:${invalidEventId}', 300, 'USD', now())`,
    );
  });

  it("enforces refund origin and submission recovery facts", async () => {
    client = await createMigratedPglite();
    await insertTask6Fixture(client);
    await client.exec(`
      INSERT INTO refunds
        (order_id, requested_by_user_id, verified_payment_event_id, provider,
         idempotency_key, requested_amount_minor, currency, status, origin)
      VALUES
        ('${fixture.order1}', '${fixture.user1}', '${fixture.paymentEvent1}',
         'synthetic_provider', 'task6-refund-requested', 100, 'USD',
         'requested', 'staff_requested');
      INSERT INTO refunds
        (order_id, requested_by_user_id, verified_payment_event_id, provider,
         idempotency_key, requested_amount_minor, currency, status, origin,
         provider_request_hash, attempt_count, submitted_at)
      VALUES
        ('${fixture.order1}', '${fixture.user1}', '${fixture.paymentEvent1}',
         'synthetic_provider', 'task6-refund-submitted', 100, 'USD',
         'submitted', 'staff_requested', '${hashC}', 1, now());
      INSERT INTO refunds
        (order_id, requested_by_user_id, verified_payment_event_id, provider,
         provider_event_id, provider_refund_id, idempotency_key,
         requested_amount_minor, currency, status, origin)
      VALUES
        ('${fixture.order1}', null, '${fixture.paymentEvent1}', 'synthetic_provider',
         '${fixture.providerEvent1}', 're_task6_observed', 'task6-refund-observed',
         100, 'USD', 'submitted', 'provider_observed')
    `);

    await expectRejected(
      client,
      `INSERT INTO refunds
        (order_id, requested_by_user_id, verified_payment_event_id, provider,
         idempotency_key, requested_amount_minor, currency, status, origin)
       VALUES ('${fixture.order1}', '${fixture.user1}', '${fixture.paymentEvent1}',
         'synthetic_provider', 'task6-refund-missing-recovery', 100, 'USD',
         'submitted', 'staff_requested')`,
    );
  });

  it("enforces reservation ownership, remaining quantity, lot uniqueness, and one terminal event", async () => {
    client = await createMigratedPglite();
    await insertTask6Fixture(client);
    await client.exec(`
      INSERT INTO inventory_reservations
        (id, checkout_attempt_id, idempotency_key, order_id, order_item_id,
         product_id, lot_id, quantity_reserved, quantity_remaining, state, expires_at)
      VALUES
        ('${fixture.reservation1}', '${fixture.attempt1}', 'task6-reservation-one',
         '${fixture.order1}', '${fixture.item1}', '${fixture.product}', '${fixture.lot}',
         2, 2, 'active', now() + interval '1 hour');
      INSERT INTO inventory_events
        (idempotency_key, event_type, lot_id, order_id, order_item_id,
         reservation_id, fulfillment_release_id, quantity, balance_after)
      VALUES
        ('task6-reservation-release', 'release', '${fixture.lot}', '${fixture.order1}',
         '${fixture.item1}', '${fixture.reservation1}', null, 2, 10)
    `);

    await expectRejected(
      client,
      `INSERT INTO inventory_reservations
        (checkout_attempt_id, idempotency_key, order_id, order_item_id,
         product_id, lot_id, quantity_reserved, quantity_remaining, state, expires_at)
       VALUES ('${fixture.attempt1}', 'task6-reservation-duplicate-lot',
         '${fixture.order1}', '${fixture.item1}', '${fixture.product}', '${fixture.lot}',
         1, 1, 'active', now() + interval '1 hour')`,
    );
    await expectRejected(
      client,
      `INSERT INTO inventory_reservations
        (checkout_attempt_id, idempotency_key, order_id, order_item_id,
         product_id, lot_id, quantity_reserved, quantity_remaining, state, expires_at)
       VALUES ('67000000-0000-4000-8000-000000000099',
         'task6-reservation-missing-attempt', '${fixture.order1}', '${fixture.item1}',
         '${fixture.product}', '${fixture.lot}', 1, 1, 'active', now() + interval '1 hour')`,
    );
    await expectRejected(
      client,
      `INSERT INTO inventory_reservations
        (checkout_attempt_id, idempotency_key, order_id, order_item_id,
         product_id, lot_id, quantity_reserved, quantity_remaining, state, expires_at)
       VALUES ('${fixture.attempt1}', 'task6-reservation-active-mismatch',
         '${fixture.order1}', '${fixture.item1}', '${fixture.product}', '${fixture.lot}',
         2, 1, 'active', now() + interval '1 hour')`,
    );
    await expectRejected(
      client,
      `INSERT INTO inventory_reservations
        (checkout_attempt_id, idempotency_key, order_id, order_item_id,
         product_id, lot_id, quantity_reserved, quantity_remaining, state, expires_at)
       VALUES ('${fixture.attempt1}', 'task6-reservation-released-mismatch',
         '${fixture.order1}', '${fixture.item1}', '${fixture.product}', '${fixture.lot}',
         2, 1, 'released', now() + interval '1 hour')`,
    );
    await expectRejected(
      client,
      `INSERT INTO inventory_events
        (idempotency_key, event_type, lot_id, order_id, order_item_id,
         reservation_id, quantity, balance_after)
       VALUES ('task6-second-terminal-event', 'release', '${fixture.lot}',
         '${fixture.order1}', '${fixture.item1}', '${fixture.reservation1}', 2, 10)`,
    );
  });

  it("allows release-free pending shipment metadata but rejects attached authority", async () => {
    client = await createMigratedPglite();
    await insertTask6Fixture(client);
    await client.exec(`
      INSERT INTO fulfillment_releases
        (id, order_id, version, idempotency_key, payment_event_id,
         state, issued_at, expires_at)
      VALUES
        ('${fixture.release1}', '${fixture.order1}', 1, 'task6-release-one',
         '${fixture.paymentEvent1}', 'issued', now(), now() + interval '1 hour');
      INSERT INTO shipments
        (order_id, fulfillment_release_id, carrier, tracking_reference, state)
      VALUES
        ('${fixture.order1}', null, 'synthetic-carrier', 'task6-tracking', 'pending')
    `);

    await expectRejected(
      client,
      `UPDATE shipments SET fulfillment_release_id = '${fixture.release1}'
       WHERE order_id = '${fixture.order1}'`,
    );
  });

  it("accepts every coherent downstream-effect state and rejects invalid lease/error rows", async () => {
    client = await createMigratedPglite();
    await client.exec(`
      INSERT INTO downstream_effects
        (effect_type, payload, idempotency_key, status, attempt_count,
         lease_token, lease_expires_at, processed_at, last_error_redacted)
      VALUES
        ('payment_notice', '{}'::jsonb, 'task6-effect-pending', 'pending', 0,
         null, null, null, null),
        ('payment_notice', '{}'::jsonb, 'task6-effect-processing', 'processing', 1,
         'task6-effect-lease', now() + interval '1 hour', null, null),
        ('payment_notice', '{}'::jsonb, 'task6-effect-processed', 'processed', 1,
         null, null, now(), null),
        ('payment_notice', '{}'::jsonb, 'task6-effect-failed', 'failed', 1,
         null, null, null, 'redacted failure')
    `);

    await expectRejected(
      client,
      `INSERT INTO downstream_effects
        (effect_type, payload, idempotency_key, status, attempt_count,
         lease_token, lease_expires_at)
       VALUES ('payment_notice', '{}'::jsonb, 'task6-effect-partial-lease',
         'processing', 1, 'task6-lease-without-expiry', null)`,
    );
    await expectRejected(
      client,
      `INSERT INTO downstream_effects
        (effect_type, payload, idempotency_key, status, attempt_count,
         last_error_redacted)
       VALUES ('payment_notice', '{}'::jsonb, 'task6-effect-failed-blank',
         'failed', 1, '   ')`,
    );
  });

  it("requires exact reservation context for release inventory events", async () => {
    client = await createMigratedPglite();
    await client.exec(`
      INSERT INTO product_policy_groups (id, slug, name)
      VALUES ('66000000-0000-4000-8000-000000000001', 'task6-group', 'Task 6 group');
      INSERT INTO products
        (id, slug, name, package_form, material_identity, policy_group_id, status)
      VALUES
        ('66000000-0000-4000-8000-000000000002', 'task6-product', 'Task 6 product',
         'sealed unit', 'Synthetic identity', '66000000-0000-4000-8000-000000000001', 'active');
      INSERT INTO lots
        (id, product_id, supplier_name, supplier_lot_code,
         received_quantity, available_quantity, status)
      VALUES
        ('66000000-0000-4000-8000-000000000003', '66000000-0000-4000-8000-000000000002',
         'Synthetic supplier', 'TASK6-LOT', 2, 2, 'released');
    `);

    await expect(
      client.exec(`
        INSERT INTO inventory_events
          (idempotency_key, event_type, lot_id, quantity, balance_after)
        VALUES
          ('task6-release-without-context', 'release',
           '66000000-0000-4000-8000-000000000003', 1, 2)
      `),
    ).rejects.toThrow();
  });

  it("enforces the downstream-effect lease and terminal-state matrix", async () => {
    client = await createMigratedPglite();

    await expect(
      client.exec(`
        INSERT INTO downstream_effects
          (effect_type, payload, idempotency_key, status, attempt_count)
        VALUES ('payment_notice', '{}'::jsonb, 'task6-effect-processing-no-lease',
                'processing', 1)
      `),
    ).rejects.toThrow();

    await expect(
      client.exec(`
        INSERT INTO downstream_effects
          (effect_type, payload, idempotency_key, status, attempt_count,
           processed_at, last_error_redacted)
        VALUES ('payment_notice', '{}'::jsonb, 'task6-effect-processed-error',
                'processed', 1, now(), 'stale error')
      `),
    ).rejects.toThrow();
  });
});
