import type { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

import { loadDatabaseCatalogRecords } from "@/catalog/database-catalog";
import {
  buildPublicCatalog,
  findPublicProduct,
} from "@/catalog/public-catalog";

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

  it("loads directly persisted unsafe active rows while the public read boundary sanitizes or excludes them", async () => {
    client = await createMigratedPglite();
    const hash = "b".repeat(64);
    await client.exec(`
      INSERT INTO product_policy_groups (id, slug, name, active)
      VALUES ('20000000-0000-4000-8000-000000000001', 'synthetic-research', 'Synthetic research', true);
      INSERT INTO products (id, slug, name, package_form, material_identity, policy_group_id, status)
      VALUES ('20000000-0000-4000-8000-000000000002', 'synthetic-stored-record', 'Synthetic stored record', 'sealed reference unit', 'Synthetic material identity', '20000000-0000-4000-8000-000000000001', 'active');
      INSERT INTO product_prices (id, product_id, version, amount_minor, currency, effective_at)
      VALUES ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 1, 2400, 'USD', '2026-01-01T00:00:00.000Z');
      INSERT INTO lots (id, product_id, supplier_name, supplier_lot_code, received_quantity, available_quantity, status, analytical_method, manufactured_at, expires_at)
      VALUES ('20000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', 'SYNTHETIC SUPPLIER', 'SYNTHETIC-LOT-1', 4, 3, 'released', 'Clinically proven HPLC purity', '2026-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z');
      INSERT INTO coa_documents (id, lot_id, evidence_hash, storage_key, public, active, issued_at)
      VALUES ('20000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000004', '${hash}', 'synthetic/private-record.pdf', true, true, '2026-01-02T00:00:00.000Z');
      INSERT INTO analytical_claims (id, product_id, lot_id, coa_document_id, text, active)
      VALUES ('20000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000005', 'HPLC is clinically proven for humans.', true);
      INSERT INTO promotions (id, code, name, kind, status, amount_minor, basis_points, currency, configuration)
      VALUES
        ('20000000-0000-4000-8000-000000000007', 'SYNTHETIC10', 'Clinically proven display offer', 'discount', 'active', null, 1000, null, '{}'::jsonb),
        ('20000000-0000-4000-8000-000000000008', 'SYNTHETIC-BUNDLE', 'Synthetic invalid bundle', 'bundle', 'active', 3600, null, 'USD', '{"productIds":["20000000-0000-4000-8000-000000000002","29999999-9999-4999-8999-999999999999"]}'::jsonb);
      INSERT INTO promotion_targets (promotion_id, target_kind, product_id)
      VALUES
        ('20000000-0000-4000-8000-000000000007', 'product', '20000000-0000-4000-8000-000000000002'),
        ('20000000-0000-4000-8000-000000000008', 'product', '20000000-0000-4000-8000-000000000002');
    `);

    const rawRecords = await loadDatabaseCatalogRecords(client);
    expect(rawRecords.lots[0]?.analyticalMethod).toBe(
      "Clinically proven HPLC purity",
    );
    expect(rawRecords.claims[0]?.text).toBe(
      "HPLC is clinically proven for humans.",
    );
    expect(rawRecords.promotions[0]?.name).toBe(
      "Clinically proven display offer",
    );
    expect(
      rawRecords.promotions.find(
        (promotion) => promotion.id === "20000000-0000-4000-8000-000000000008",
      )?.configuration,
    ).toEqual({
      productIds: [
        "20000000-0000-4000-8000-000000000002",
        "29999999-9999-4999-8999-999999999999",
      ],
    });

    const sanitizedCatalog = buildPublicCatalog(rawRecords, {
      now: new Date("2026-08-26T12:00:00.000Z"),
    });
    const sanitizedProduct = findPublicProduct(
      sanitizedCatalog,
      "synthetic-stored-record",
    );
    expect(sanitizedProduct).not.toBeNull();
    expect(
      sanitizedProduct?.proof.find(
        (node) => node.label === "Analytical method",
      )?.state,
    ).toBe("No approved public record");
    expect(sanitizedProduct?.claims).toEqual([]);
    expect(sanitizedProduct?.merchandising).toEqual([]);
    expect(sanitizedCatalog.promotions.map((promotion) => promotion.id)).not.toContain(
      "20000000-0000-4000-8000-000000000008",
    );
    expect(sanitizedCatalog.qualityRecords[0]?.analyticalMethod).toBeNull();

    await client.exec(`
      UPDATE products
      SET name = 'For human use reference'
      WHERE id = '20000000-0000-4000-8000-000000000002';
    `);
    const unsafeCoreRecords = await loadDatabaseCatalogRecords(client);
    expect(unsafeCoreRecords.products[0]?.name).toBe(
      "For human use reference",
    );

    const blockedCatalog = buildPublicCatalog(unsafeCoreRecords, {
      now: new Date("2026-08-26T12:00:00.000Z"),
    });
    expect(
      findPublicProduct(blockedCatalog, "synthetic-stored-record"),
    ).toBeNull();
    expect(blockedCatalog.promotions).toEqual([]);
    expect(blockedCatalog.qualityRecords).toEqual([]);
  });
});
