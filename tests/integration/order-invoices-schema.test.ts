import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  userA: "7c000000-0000-4000-8000-000000000001",
  userB: "7c000000-0000-4000-8000-000000000002",
  attestation: "7c000000-0000-4000-8000-000000000003",
  acceptanceA: "7c000000-0000-4000-8000-000000000004",
  acceptanceB: "7c000000-0000-4000-8000-000000000005",
  orderA: "7c000000-0000-4000-8000-000000000006",
  orderB: "7c000000-0000-4000-8000-000000000007",
} as const;

let client: PGlite;

async function insertInvoice(columns: string, values: string): Promise<void> {
  await client.exec(`INSERT INTO order_invoices (${columns}) VALUES (${values});`);
}

beforeEach(async () => {
  client = await createMigratedPglite();
  await client.exec(`
    INSERT INTO users (id, clerk_id, email_verified_at)
    VALUES
      ('${ids.userA}', 'order-invoice-user-a', now()),
      ('${ids.userB}', 'order-invoice-user-b', now());
    INSERT INTO buyer_profiles
      (user_id, status, age_confirmed_at, research_purpose)
    VALUES
      ('${ids.userA}', 'active', now(), 'analytical'),
      ('${ids.userB}', 'active', now(), 'analytical');
    INSERT INTO attestation_versions
      (id, version, content_hash, policy_text, effective_at)
    VALUES ('${ids.attestation}', 1, '${"a".repeat(64)}', 'Synthetic attestation', now());
    INSERT INTO attestation_acceptances
      (id, user_id, attestation_version_id, accepted_at)
    VALUES
      ('${ids.acceptanceA}', '${ids.userA}', '${ids.attestation}', now()),
      ('${ids.acceptanceB}', '${ids.userB}', '${ids.attestation}', now());
    INSERT INTO orders
      (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
       destination_state_code, currency, subtotal_minor, discount_minor,
       tax_minor, shipping_minor, total_minor, state)
    VALUES
      ('${ids.orderA}', '${ids.userA}', 'active', '${ids.acceptanceA}',
       'CA', 'USD', 8000, 0, 400, 300, 8700, 'checkout_pending'),
      ('${ids.orderB}', '${ids.userB}', 'active', '${ids.acceptanceB}',
       'CA', 'USD', 8000, 0, 400, 300, 8700, 'checkout_pending');
  `);
});

afterEach(async () => {
  await client.close();
});

describe("order_invoices durable binding", () => {
  it("accepts a coherent open invoice", async () => {
    await insertInvoice(
      "order_id, provider, provider_invoice_id, hosted_invoice_url, amount_due_minor, status",
      `'${ids.orderA}', 'stripe', 'in_a', 'https://invoice.stripe.com/i/x/a', 8700, 'open'`,
    );

    const rows = await client.query<{ status: string }>(
      `SELECT status FROM order_invoices WHERE order_id = '${ids.orderA}'`,
    );
    expect(rows.rows).toEqual([{ status: "open" }]);
  });

  it("binds at most one invoice per order, so a repeat issue cannot double-bill", async () => {
    await insertInvoice(
      "order_id, provider, provider_invoice_id, hosted_invoice_url, amount_due_minor, status",
      `'${ids.orderA}', 'stripe', 'in_a', 'https://invoice.stripe.com/i/x/a', 8700, 'open'`,
    );

    await expect(
      insertInvoice(
        "order_id, provider, provider_invoice_id, hosted_invoice_url, amount_due_minor, status",
        `'${ids.orderA}', 'stripe', 'in_second', 'https://invoice.stripe.com/i/x/b', 8700, 'open'`,
      ),
    ).rejects.toThrow();
  });

  it("refuses to bind one provider invoice to two orders", async () => {
    await insertInvoice(
      "order_id, provider, provider_invoice_id, hosted_invoice_url, amount_due_minor, status",
      `'${ids.orderA}', 'stripe', 'in_shared', 'https://invoice.stripe.com/i/x/a', 8700, 'open'`,
    );

    await expect(
      insertInvoice(
        "order_id, provider, provider_invoice_id, hosted_invoice_url, amount_due_minor, status",
        `'${ids.orderB}', 'stripe', 'in_shared', 'https://invoice.stripe.com/i/x/b', 8700, 'open'`,
      ),
    ).rejects.toThrow();
  });

  it("refuses an open invoice missing its hosted page", async () => {
    await expect(
      insertInvoice(
        "order_id, provider, provider_invoice_id, amount_due_minor, status",
        `'${ids.orderA}', 'stripe', 'in_a', 8700, 'open'`,
      ),
    ).rejects.toThrow();
  });

  it("refuses an open invoice missing its amount", async () => {
    await expect(
      insertInvoice(
        "order_id, provider, provider_invoice_id, hosted_invoice_url, status",
        `'${ids.orderA}', 'stripe', 'in_a', 'https://invoice.stripe.com/i/x/a', 'open'`,
      ),
    ).rejects.toThrow();
  });

  it("refuses a non-open row that claims a hosted page", async () => {
    await expect(
      insertInvoice(
        "order_id, provider, hosted_invoice_url, status, evidence_code",
        `'${ids.orderA}', 'stripe', 'https://invoice.stripe.com/i/x/a', 'unknown', 'provider_transport_unknown'`,
      ),
    ).rejects.toThrow();
  });

  it("requires evidence on an unavailable or unknown outcome", async () => {
    await expect(
      insertInvoice(
        "order_id, provider, status",
        `'${ids.orderA}', 'stripe', 'unknown'`,
      ),
    ).rejects.toThrow();
  });

  it("refuses evidence on a pending row", async () => {
    await expect(
      insertInvoice(
        "order_id, provider, status, evidence_code",
        `'${ids.orderA}', 'stripe', 'pending', 'provider_transport_unknown'`,
      ),
    ).rejects.toThrow();
  });

  it("refuses a provider other than stripe", async () => {
    await expect(
      insertInvoice(
        "order_id, provider, status",
        `'${ids.orderA}', 'local_test', 'pending'`,
      ),
    ).rejects.toThrow();
  });

  it("refuses an unrecognized status", async () => {
    await expect(
      insertInvoice(
        "order_id, provider, status",
        `'${ids.orderA}', 'stripe', 'paid'`,
      ),
    ).rejects.toThrow();
  });

  it("records an ambiguous outcome with its evidence and no billable binding", async () => {
    await insertInvoice(
      "order_id, provider, provider_invoice_id, status, evidence_code",
      `'${ids.orderA}', 'stripe', 'in_maybe', 'unknown', 'provider_transport_unknown'`,
    );

    const rows = await client.query<{
      status: string;
      hosted_invoice_url: string | null;
      amount_due_minor: number | null;
      provider_invoice_id: string | null;
    }>(
      `SELECT status, hosted_invoice_url, amount_due_minor, provider_invoice_id
       FROM order_invoices WHERE order_id = '${ids.orderA}'`,
    );
    expect(rows.rows).toEqual([{
      status: "unknown",
      hosted_invoice_url: null,
      amount_due_minor: null,
      provider_invoice_id: "in_maybe",
    }]);
  });
});
