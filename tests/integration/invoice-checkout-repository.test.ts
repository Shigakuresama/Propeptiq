import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPostgresInvoiceCheckoutPort } from "@/db/repositories/invoice-checkout-repository";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  user: "7d000000-0000-4000-8000-000000000001",
  attestation: "7d000000-0000-4000-8000-000000000002",
  acceptance: "7d000000-0000-4000-8000-000000000003",
  order: "7d000000-0000-4000-8000-000000000004",
  group: "7d000000-0000-4000-8000-000000000005",
  product: "7d000000-0000-4000-8000-000000000006",
  price: "7d000000-0000-4000-8000-000000000007",
  policy: "7d000000-0000-4000-8000-000000000008",
  item: "7d000000-0000-4000-8000-000000000009",
} as const;

const customerId = "cus_synthetic6d";
const daysUntilDue = 30;

let client: PGlite;

function port() {
  return createPostgresInvoiceCheckoutPort({
    client: {
      query: async <Row extends object>(sql: string, params: readonly unknown[] = []) =>
        (await client.query(sql, [...params])) as unknown as Readonly<{ rows: Row[] }>,
    },
  });
}

beforeEach(async () => {
  client = await createMigratedPglite();
  await client.exec(`
    INSERT INTO users (id, clerk_id, email_verified_at)
    VALUES ('${ids.user}', 'invoice-repo-user', now());
    INSERT INTO buyer_profiles (user_id, status, age_confirmed_at, research_purpose)
    VALUES ('${ids.user}', 'active', now(), 'analytical');
    INSERT INTO attestation_versions (id, version, content_hash, policy_text, effective_at)
    VALUES ('${ids.attestation}', 1, '${"a".repeat(64)}', 'Synthetic attestation', now());
    INSERT INTO attestation_acceptances (id, user_id, attestation_version_id, accepted_at)
    VALUES ('${ids.acceptance}', '${ids.user}', '${ids.attestation}', now());
    INSERT INTO product_policy_groups (id, slug, name)
    VALUES ('${ids.group}', 'invoice-repo-group', 'Invoice repo group');
    INSERT INTO products
      (id, slug, name, package_form, material_identity, policy_group_id, status)
    VALUES ('${ids.product}', 'invoice-repo-product', 'Synthetic Alpha',
            'sealed vial', 'Synthetic identity', '${ids.group}', 'active');
    INSERT INTO product_prices (id, product_id, version, amount_minor, currency, effective_at)
    VALUES ('${ids.price}', '${ids.product}', 1, 4000, 'USD', now());
    INSERT INTO destination_policies
      (id, scope_kind, product_id, state_code, result, version, active, effective_at)
    VALUES ('${ids.policy}', 'product', '${ids.product}', 'CA', 'allowed', 1, true, now());
    INSERT INTO orders
      (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
       destination_state_code, currency, subtotal_minor, discount_minor,
       tax_minor, shipping_minor, total_minor, state)
    VALUES ('${ids.order}', '${ids.user}', 'active', '${ids.acceptance}',
            'CA', 'USD', 8000, 0, 400, 300, 8700, 'checkout_pending');
    INSERT INTO order_items
      (id, order_id, product_id, product_price_id, destination_policy_id,
       product_name_snapshot, package_form_snapshot, currency,
       unit_amount_minor, quantity, subtotal_minor, discount_minor, total_minor)
    VALUES ('${ids.item}', '${ids.order}', '${ids.product}', '${ids.price}', '${ids.policy}',
            'Synthetic Alpha', 'sealed vial', 'USD', 4000, 2, 8000, 0, 8000);
  `);
});

afterEach(async () => {
  await client.close();
});

describe("createPostgresInvoiceCheckoutPort", () => {
  it("claims an invoiceable order and builds a request that sums to the order total", async () => {
    const claim = await port().claimInvoiceAttempt({
      orderId: ids.order,
      customerId,
      daysUntilDue,
    });

    expect(claim.status).toBe("claimed");
    if (claim.status !== "claimed") return;
    expect(claim.request.orderId).toBe(ids.order);
    expect(claim.request.customerId).toBe(customerId);
    expect(claim.request.daysUntilDue).toBe(daysUntilDue);
    // Merchandise, shipping and tax travel as explicit lines, exactly as the
    // hosted Checkout request builder does, and must reconcile to the order.
    const total = claim.request.lines.reduce((sum, line) => sum + line.amountMinor, 0);
    expect(total).toBe(8_700);
    expect(claim.request.lines.map((line) => line.description)).toEqual([
      "Synthetic Alpha, sealed vial, quantity 2",
      "Shipping",
      "Sales tax",
    ]);
  });

  it("writes a pending binding row when it claims", async () => {
    await port().claimInvoiceAttempt({ orderId: ids.order, customerId, daysUntilDue });

    const rows = await client.query<{ status: string }>(
      `SELECT status FROM order_invoices WHERE order_id = '${ids.order}'`,
    );
    expect(rows.rows).toEqual([{ status: "pending" }]);
  });

  it("returns the existing invoice instead of claiming a second time", async () => {
    const first = port();
    await first.claimInvoiceAttempt({ orderId: ids.order, customerId, daysUntilDue });
    await first.recordInvoiceOpen({
      orderId: ids.order,
      providerInvoiceId: "in_first",
      hostedInvoiceUrl: "https://invoice.stripe.com/i/x/first",
      amountDueMinor: 8_700,
    });

    const claim = await first.claimInvoiceAttempt({
      orderId: ids.order,
      customerId,
      daysUntilDue,
    });

    expect(claim).toEqual({
      status: "already_open",
      providerInvoiceId: "in_first",
      hostedInvoiceUrl: "https://invoice.stripe.com/i/x/first",
    });
  });

  it("refuses an order that is not awaiting checkout", async () => {
    await client.exec(
      `UPDATE orders SET state = 'fulfilled' WHERE id = '${ids.order}'`,
    );

    expect(
      await port().claimInvoiceAttempt({ orderId: ids.order, customerId, daysUntilDue }),
    ).toEqual({ status: "ineligible", reason: "order_not_invoiceable" });
  });

  it("refuses an order that does not exist", async () => {
    expect(
      await port().claimInvoiceAttempt({
        orderId: "7d000000-0000-4000-8000-0000000000ff",
        customerId,
        daysUntilDue,
      }),
    ).toEqual({ status: "ineligible", reason: "order_not_found" });
  });

  it("records an open invoice against the claimed order", async () => {
    const p = port();
    await p.claimInvoiceAttempt({ orderId: ids.order, customerId, daysUntilDue });
    await p.recordInvoiceOpen({
      orderId: ids.order,
      providerInvoiceId: "in_open",
      hostedInvoiceUrl: "https://invoice.stripe.com/i/x/open",
      amountDueMinor: 8_700,
    });

    const rows = await client.query<{
      status: string;
      provider_invoice_id: string;
      amount_due_minor: number;
    }>(
      `SELECT status, provider_invoice_id, amount_due_minor
       FROM order_invoices WHERE order_id = '${ids.order}'`,
    );
    expect(rows.rows).toEqual([{
      status: "open",
      provider_invoice_id: "in_open",
      amount_due_minor: 8_700,
    }]);
  });

  it("records an ambiguous outcome with its evidence and no billable binding", async () => {
    const p = port();
    await p.claimInvoiceAttempt({ orderId: ids.order, customerId, daysUntilDue });
    await p.recordInvoiceUnavailable({
      orderId: ids.order,
      evidenceCode: "provider_transport_unknown",
      knownProviderInvoiceId: "in_maybe",
    });

    const rows = await client.query<{
      status: string;
      evidence_code: string;
      hosted_invoice_url: string | null;
      provider_invoice_id: string | null;
    }>(
      `SELECT status, evidence_code, hosted_invoice_url, provider_invoice_id
       FROM order_invoices WHERE order_id = '${ids.order}'`,
    );
    expect(rows.rows).toEqual([{
      status: "unknown",
      evidence_code: "provider_transport_unknown",
      hosted_invoice_url: null,
      provider_invoice_id: "in_maybe",
    }]);
  });

  it("records a definite rejection as unavailable rather than unknown", async () => {
    const p = port();
    await p.claimInvoiceAttempt({ orderId: ids.order, customerId, daysUntilDue });
    await p.recordInvoiceUnavailable({
      orderId: ids.order,
      evidenceCode: "create_rejected_4xx",
      knownProviderInvoiceId: null,
    });

    const rows = await client.query<{ status: string }>(
      `SELECT status FROM order_invoices WHERE order_id = '${ids.order}'`,
    );
    expect(rows.rows).toEqual([{ status: "unavailable" }]);
  });
});
