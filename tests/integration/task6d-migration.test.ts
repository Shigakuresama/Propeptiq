import type { PGlite } from "@electric-sql/pglite";
import { PGlite as PGliteClient } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

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
  const source = await readMigration(index);
  for (const statement of source.split("--> statement-breakpoint")) {
    if (statement.trim()) await client.exec(statement);
  }
}

async function migrateThrough0003(client: PGlite): Promise<void> {
  for (const migration of [0, 1, 2, 3]) await applyMigration(client, migration);
}

const ids = {
  user: "74000000-0000-4000-8000-000000000001",
  attestation: "74000000-0000-4000-8000-000000000002",
  acceptance: "74000000-0000-4000-8000-000000000003",
  order: "74000000-0000-4000-8000-000000000004",
  attempt: "74000000-0000-4000-8000-000000000005",
} as const;

async function insertAttempt(
  client: PGlite,
  providerBearing: boolean,
): Promise<void> {
  await client.exec(`
    INSERT INTO users (id, clerk_id, email_verified_at)
    VALUES ('${ids.user}', 'synthetic-6d-user', now());
    INSERT INTO buyer_profiles (user_id, status, age_confirmed_at, research_purpose)
    VALUES ('${ids.user}', 'active', now(), 'analytical');
    INSERT INTO attestation_versions (id, version, content_hash, policy_text, effective_at)
    VALUES ('${ids.attestation}', 1, '${"a".repeat(64)}', 'Synthetic 6D attestation', now());
    INSERT INTO attestation_acceptances (id, user_id, attestation_version_id, accepted_at)
    VALUES ('${ids.acceptance}', '${ids.user}', '${ids.attestation}', now());
    INSERT INTO orders
      (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
       destination_state_code, currency, subtotal_minor, discount_minor,
       tax_minor, shipping_minor, total_minor, state)
    VALUES
      ('${ids.order}', '${ids.user}', 'active', '${ids.acceptance}',
       'CA', 'USD', 1000, 0, 0, 0, 1000,
       '${providerBearing ? "checkout_pending" : "eligibility_review"}');
    INSERT INTO checkout_attempts
      (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
       account_gate, attestation_gate, product_gate, destination_gate,
       inventory_gate, payment_provider_gate, permitted, review_required,
       tax_ready, shipping_ready${providerBearing
         ? ", provider, provider_request_id, provider_request_hash, expires_at, tax_quote_reference, shipping_quote_reference, shipping_service"
         : ""})
    VALUES
      ('${ids.attempt}', '${ids.order}', '${ids.user}',
       '74000000-0000-4000-8000-000000000099', '${"b".repeat(64)}', 'created',
       '${providerBearing ? "pass" : "review"}', 'pass', 'pass', 'pass', 'pass',
       '${providerBearing ? "pass" : "blocked"}', ${providerBearing}, ${!providerBearing},
       ${providerBearing}, ${providerBearing}${providerBearing
         ? `, 'stripe', 'checkout_attempt:${ids.attempt}', '${"c".repeat(64)}', now() + interval '1 hour', 'tax_6d', 'ship_6d', 'Synthetic Ground'`
         : ""});
  `);
}

describe("Slice 6D forward replay migration", () => {
  let client: PGlite | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  it("starts with a fail-closed preflight before ALTER for provider-bearing 0003 state", async () => {
    client = new PGliteClient();
    await migrateThrough0003(client);
    await insertAttempt(client, true);

    await expect(applyMigration(client, 4)).rejects.toThrow(
      /0004 preflight refused.*provider authority.*reconciliation/i,
    );
    const columns = await client.query<{ count: number }>(`
      SELECT count(*)::int AS count FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'checkout_attempts'
        AND column_name = 'provider_customer_email'
    `);
    expect(columns.rows).toEqual([{ count: 0 }]);
  });

  it("migrates provider-free review state and retains null replay fields", async () => {
    client = new PGliteClient();
    await migrateThrough0003(client);
    await insertAttempt(client, false);
    await applyMigration(client, 4);

    const rows = await client.query(`
      SELECT provider_customer_email, provider_origin,
             provider_request_schema_version, provider_livemode, provider_scope
      FROM checkout_attempts WHERE id = '${ids.attempt}'
    `);
    expect(rows.rows).toEqual([{
      provider_customer_email: null,
      provider_origin: null,
      provider_request_schema_version: null,
      provider_livemode: null,
      provider_scope: null,
    }]);
  });

  it("requires every replay field for future provider-bearing rows", async () => {
    client = new PGliteClient();
    await migrateThrough0003(client);
    await applyMigration(client, 4);
    await insertAttempt(client, false);
    await client.exec(`
      UPDATE orders SET state = 'checkout_pending' WHERE id = '${ids.order}';
      UPDATE checkout_attempts
      SET account_gate = 'pass', payment_provider_gate = 'pass',
          permitted = true, review_required = false,
          tax_ready = true, shipping_ready = true,
          tax_quote_reference = 'tax_6d',
          shipping_quote_reference = 'ship_6d',
          shipping_service = 'Synthetic Ground',
          provider = 'stripe',
          provider_request_id = 'checkout_attempt:${ids.attempt}',
          provider_request_hash = '${"d".repeat(64)}',
          expires_at = now() + interval '1 hour',
          provider_customer_email = 'synthetic.buyer@example.test',
          provider_origin = 'https://commerce.synthetic.example',
          provider_request_schema_version = 1,
          provider_livemode = false,
          provider_scope = 'stripe:acct_synthetic6d'
      WHERE id = '${ids.attempt}';
    `);
    const coherent = await client.query<{ scope: string }>(`
      SELECT provider_scope AS scope FROM checkout_attempts
      WHERE id = '${ids.attempt}'
    `);
    expect(coherent.rows).toEqual([{ scope: "stripe:acct_synthetic6d" }]);
    await expect(client.exec(`
      UPDATE checkout_attempts
      SET provider_scope = NULL
      WHERE id = '${ids.attempt}'
    `)).rejects.toThrow();
  });
});
