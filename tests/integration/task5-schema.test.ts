import type { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMigratedPglite } from "./helpers/pglite";

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
