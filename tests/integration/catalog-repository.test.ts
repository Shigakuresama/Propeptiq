import type { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

import { loadDatabaseCatalogRecords } from "@/catalog/database-catalog";

import { createMigratedPglite } from "./helpers/pglite";

describe("database catalog projection", () => {
  let client: PGlite | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  it("projects only stored catalog facts with canonical promotions and evidence relationships", async () => {
    client = await createMigratedPglite();
    const hash = "a".repeat(64);
    await client.exec(`
      INSERT INTO product_policy_groups (id, slug, name, active)
      VALUES ('10000000-0000-4000-8000-000000000001', 'research', 'Research', true);
      INSERT INTO products (id, slug, name, package_form, material_identity, policy_group_id, status)
      VALUES ('10000000-0000-4000-8000-000000000002', 'stored-record', 'Stored record', 'sealed unit', 'Stored material identity', '10000000-0000-4000-8000-000000000001', 'active');
      INSERT INTO product_prices (id, product_id, version, amount_minor, currency, effective_at)
      VALUES ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 1, 2400, 'USD', '2026-01-01T00:00:00.000Z');
      INSERT INTO lots (id, product_id, supplier_name, supplier_lot_code, received_quantity, available_quantity, status, analytical_method, manufactured_at, expires_at)
      VALUES ('10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'Stored supplier', 'LOT-1', 4, 3, 'released', 'Stored method', '2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z');
      INSERT INTO coa_documents (id, lot_id, evidence_hash, storage_key, public, active, issued_at)
      VALUES ('10000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000004', '${hash}', 'private/stored.pdf', true, true, '2026-01-02T00:00:00.000Z');
      INSERT INTO analytical_claims (id, product_id, lot_id, coa_document_id, text, active)
      VALUES ('10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005', 'Stored analytical record', true);
      INSERT INTO promotions (id, code, name, kind, status, amount_minor, basis_points, currency, configuration)
      VALUES ('10000000-0000-4000-8000-000000000007', 'STORED10', 'Stored display offer', 'discount', 'active', null, 1000, null, '{}'::jsonb);
      INSERT INTO promotion_targets (promotion_id, target_kind, product_id)
      VALUES ('10000000-0000-4000-8000-000000000007', 'product', '10000000-0000-4000-8000-000000000002');
    `);

    const records = await loadDatabaseCatalogRecords(client);
    expect(records.source).toBe("production");
    expect(records.products).toEqual([
      {
        id: "10000000-0000-4000-8000-000000000002",
        slug: "stored-record",
        name: "Stored record",
        packageForm: "sealed unit",
        materialIdentity: "Stored material identity",
        policyGroupId: "10000000-0000-4000-8000-000000000001",
        status: "active",
      },
    ]);
    expect(records.lots[0]).toMatchObject({
      analyticalMethod: "Stored method",
      manufacturedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    expect(records.claims[0]).toMatchObject({
      productId: "10000000-0000-4000-8000-000000000002",
      lotId: "10000000-0000-4000-8000-000000000004",
      coaDocumentId: "10000000-0000-4000-8000-000000000005",
      active: true,
    });
    expect(records.promotions[0]).toMatchObject({
      amountMinor: null,
      basisPoints: 1000,
      currency: null,
      configuration: {},
    });
  });
});
