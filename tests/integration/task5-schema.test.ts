import type { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMigratedPglite } from "./helpers/pglite";

const migrationDirectory = resolve("src/db/migrations");

async function applyMigration(client: PGlite, index: number): Promise<void> {
  const prefix = `${String(index).padStart(4, "0")}_`;
  const names = (await readdir(migrationDirectory)).filter(
    (name) => name.startsWith(prefix) && name.endsWith(".sql"),
  );
  expect(names).toHaveLength(1);
  const migration = await readFile(resolve(migrationDirectory, names[0]!), "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) await client.exec(statement);
  }
}

describe("Task 5 schema repair", () => {
  let client: PGlite | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  it("persists material identity, analytical method, analytical claims, and fixed-window counters", async () => {
    client = await createMigratedPglite();
    const columns = await client.query<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name, column_name) IN (
          ('products', 'material_identity'),
          ('lots', 'analytical_method'),
          ('analytical_claims', 'coa_document_id'),
          ('rate_limit_windows', 'scope_hash')
        )
      ORDER BY table_name, column_name
    `);

    expect(columns.rows).toEqual([
      { table_name: "analytical_claims", column_name: "coa_document_id" },
      { table_name: "lots", column_name: "analytical_method" },
      { table_name: "products", column_name: "material_identity" },
      { table_name: "rate_limit_windows", column_name: "scope_hash" },
    ]);
  });

  it("rejects analytical claims whose product, released lot, and COA do not share evidence ownership", async () => {
    client = await createMigratedPglite();
    await client.exec(`
      INSERT INTO product_policy_groups (id, slug, name)
      VALUES
        ('00000000-0000-4000-8000-000000000101', 'group-one', 'Group one'),
        ('00000000-0000-4000-8000-000000000102', 'group-two', 'Group two');
      INSERT INTO products (id, slug, name, package_form, material_identity, policy_group_id, status)
      VALUES
        ('00000000-0000-4000-8000-000000000111', 'product-one', 'Product one', 'sealed unit', 'Identity one', '00000000-0000-4000-8000-000000000101', 'active'),
        ('00000000-0000-4000-8000-000000000112', 'product-two', 'Product two', 'sealed unit', 'Identity two', '00000000-0000-4000-8000-000000000102', 'active');
      INSERT INTO lots (id, product_id, supplier_name, supplier_lot_code, received_quantity, available_quantity, status)
      VALUES
        ('00000000-0000-4000-8000-000000000121', '00000000-0000-4000-8000-000000000111', 'Supplier', 'LOT-1', 3, 3, 'released'),
        ('00000000-0000-4000-8000-000000000122', '00000000-0000-4000-8000-000000000112', 'Supplier', 'LOT-2', 3, 3, 'released');
      INSERT INTO coa_documents (id, lot_id, evidence_hash, storage_key, public, active)
      VALUES ('00000000-0000-4000-8000-000000000131', '00000000-0000-4000-8000-000000000121', '${"a".repeat(64)}', 'private/coa-one.pdf', true, true);
    `);

    await expect(
      client.exec(`
        INSERT INTO analytical_claims (product_id, lot_id, coa_document_id, text, active)
        VALUES ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000121', '00000000-0000-4000-8000-000000000131', 'Mismatched analytical record', true)
      `),
    ).rejects.toThrow();
  });

  it("backfills bound mode only from exact bindings and leaves other attempts ambiguous", async () => {
    client = new (await import("@electric-sql/pglite")).PGlite();
    for (let migration = 0; migration <= 27; migration += 1) {
      await applyMigration(client, migration);
    }
    await client.exec(`
      INSERT INTO users (id, clerk_id, email_verified_at)
      VALUES ('69000000-0000-4000-8000-000000000001',
              'task5-round2-existing-user', now());
      INSERT INTO buyer_profiles
        (user_id, status, age_confirmed_at, research_purpose)
      VALUES ('69000000-0000-4000-8000-000000000001',
              'active', now(), 'analytical');
      INSERT INTO attestation_versions
        (id, version, content_hash, policy_text, effective_at)
      VALUES ('69000000-0000-4000-8000-000000000002', 1,
              '${"9".repeat(64)}', 'Task 5 round 2 policy', now());
      INSERT INTO attestation_acceptances
        (id, user_id, attestation_version_id, accepted_at)
      VALUES ('69000000-0000-4000-8000-000000000003',
              '69000000-0000-4000-8000-000000000001',
              '69000000-0000-4000-8000-000000000002', now());
      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state)
      VALUES ('69000000-0000-4000-8000-000000000004',
              '69000000-0000-4000-8000-000000000001', 'active',
              '69000000-0000-4000-8000-000000000003', 'CA', 'USD',
              0, 0, 0, 0, 0, 'draft');
      INSERT INTO checkout_attempts
        (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         tax_ready, shipping_ready)
      VALUES ('69000000-0000-4000-8000-000000000005',
              '69000000-0000-4000-8000-000000000004',
              '69000000-0000-4000-8000-000000000001',
              'task5-round2-existing-attempt', '${"8".repeat(64)}', 'created',
              'pass', 'pass', 'pass', 'pass', 'pass', 'pass', false, false,
              false, false);
    `);

    await applyMigration(client, 28);

    const attempt = await client.query<{
      pricingRevision: string | null;
      quoteSnapshot: unknown;
    }>(`
      SELECT canonical_pricing_revision AS "pricingRevision",
             canonical_quote_snapshot AS "quoteSnapshot"
      FROM checkout_attempts
      WHERE id = '69000000-0000-4000-8000-000000000005'
    `);
    const bindings = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM checkout_attempt_review_bindings`,
    );
    expect(attempt.rows).toEqual([{ pricingRevision: null, quoteSnapshot: null }]);
    expect(bindings.rows).toEqual([{ count: 0 }]);

    await client.exec(`
      INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state)
      VALUES ('69000000-0000-4000-8000-000000000006',
              '69000000-0000-4000-8000-000000000001', 'review',
              '69000000-0000-4000-8000-000000000003', 'CA', 'USD',
              0, 0, 0, 0, 0, 'checkout_pending');
      INSERT INTO checkout_attempts
        (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         tax_ready, shipping_ready)
      VALUES ('69000000-0000-4000-8000-000000000007',
              '69000000-0000-4000-8000-000000000006',
              '69000000-0000-4000-8000-000000000001',
              'task5-round3-bound-attempt', '${"6".repeat(64)}', 'created',
              'pass', 'pass', 'pass', 'pass', 'pass', 'pass', false, true,
              false, false);
      INSERT INTO review_requests
        (id, user_id, order_id, snapshot_hash, buyer_status_snapshot,
         attestation_version_id, destination_state_code, cart_snapshot,
         buyer_review_required, destination_review_required, outcome,
         decided_by_user_id, decided_at, covers_buyer_review)
      VALUES ('69000000-0000-4000-8000-000000000008',
              '69000000-0000-4000-8000-000000000001',
              '69000000-0000-4000-8000-000000000006', '${"7".repeat(64)}',
              'review', '69000000-0000-4000-8000-000000000002', 'CA',
              '{"schemaVersion":1,"items":[],"promotionIds":[]}'::jsonb,
              true, false, 'approved',
              '69000000-0000-4000-8000-000000000001', now(), true);
      INSERT INTO checkout_attempt_review_bindings
        (checkout_attempt_id, order_id, review_request_id,
         review_snapshot_hash, bound_at)
      VALUES ('69000000-0000-4000-8000-000000000007',
              '69000000-0000-4000-8000-000000000006',
              '69000000-0000-4000-8000-000000000008', '${"7".repeat(64)}',
              now());
    `);

    await applyMigration(client, 29);

    const modes = await client.query<{
      id: string;
      reviewAuthorizationMode: string | null;
    }>(`
      SELECT id::text AS id,
             review_authorization_mode AS "reviewAuthorizationMode"
      FROM checkout_attempts
      WHERE id IN ('69000000-0000-4000-8000-000000000005',
                   '69000000-0000-4000-8000-000000000007')
      ORDER BY id
    `);
    expect(modes.rows).toEqual([
      {
        id: "69000000-0000-4000-8000-000000000005",
        reviewAuthorizationMode: null,
      },
      {
        id: "69000000-0000-4000-8000-000000000007",
        reviewAuthorizationMode: "bound",
      },
    ]);
    await expect(client.query(`
      UPDATE checkout_attempts SET review_authorization_mode = 'none'
      WHERE id = '69000000-0000-4000-8000-000000000007'
    `)).rejects.toThrow(/review authorization mode is immutable/iu);
    await client.query(`
      UPDATE checkout_attempts SET review_authorization_mode = 'none'
      WHERE id = '69000000-0000-4000-8000-000000000005'
    `);
    await expect(client.query(`
      UPDATE checkout_attempts SET review_authorization_mode = 'bound'
      WHERE id = '69000000-0000-4000-8000-000000000005'
    `)).rejects.toThrow(/review authorization mode is immutable/iu);
  });

  it("fails a populated-v0 upgrade with an operator-facing reconciliation boundary and no partial mutation", async () => {
    client = new (await import("@electric-sql/pglite")).PGlite();
    const migration0 = await readFile(
      resolve("src/db/migrations/0000_groovy_outlaw_kid.sql"),
      "utf8",
    );
    const migration1 = await readFile(
      resolve("src/db/migrations/0001_thankful_khan.sql"),
      "utf8",
    );
    await client.exec(migration0.replaceAll("--> statement-breakpoint", ""));
    await client.exec(`
      INSERT INTO product_policy_groups (id, slug, name)
      VALUES ('90000000-0000-4000-8000-000000000001', 'legacy-group', 'Legacy group');
      INSERT INTO products (id, slug, name, package_form, policy_group_id)
      VALUES ('90000000-0000-4000-8000-000000000002', 'legacy-product', 'Legacy product', 'sealed unit', '90000000-0000-4000-8000-000000000001');
    `);

    await expect(
      client.transaction((tx) =>
        tx.exec(migration1.replaceAll("--> statement-breakpoint", "")),
      ),
    ).rejects.toThrow(/material_identity.*reconciliation/i);

    const product = await client.query<{ name: string }>(
      "SELECT name FROM products WHERE slug = 'legacy-product'",
    );
    const newTables = await client.query<{ exists: boolean }>(`
      SELECT to_regclass('public.analytical_claims') IS NOT NULL AS exists
    `);
    const newColumns = await client.query<{ count: number }>(`
      SELECT count(*)::int AS count
      FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'material_identity'
    `);
    expect(product.rows).toEqual([{ name: "Legacy product" }]);
    expect(newTables.rows[0]?.exists).toBe(false);
    expect(newColumns.rows[0]?.count).toBe(0);
  });
});
