import { createHash } from "node:crypto";

import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { normalizeStripeProviderEventV1 } from "@/commerce/provider-events";
import { createProviderEventAuthorityV1 } from "@/commerce/stripe-webhook-verifier";
import { parseServerEnv } from "@/config/env-schema";
import {
  createProviderEventRepository,
  type ProcessableProviderEventNormalizationV1,
} from "@/db/repositories/provider-event-repository";

import { createMigratedPglite } from "./helpers/pglite";

const ids = {
  buyer: "7e000000-0000-4000-8000-000000000001",
  attestation: "7e000000-0000-4000-8000-000000000002",
  acceptance: "7e000000-0000-4000-8000-000000000003",
  group: "7e000000-0000-4000-8000-000000000004",
  product: "7e000000-0000-4000-8000-000000000005",
  price: "7e000000-0000-4000-8000-000000000006",
  policy: "7e000000-0000-4000-8000-000000000007",
  order: "7e000000-0000-4000-8000-000000000008",
  item: "7e000000-0000-4000-8000-000000000009",
} as const;

const now = new Date("2026-08-25T12:00:30.000Z");
const providerCreated = 1_787_659_200;
const invoiceId = "in_synthetic_settlement";

let client: PGlite;

function keyedUuid(label: string): string {
  const hex = createHash("sha256").update(`synthetic-7e:${label}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function authority() {
  const value = createProviderEventAuthorityV1(parseServerEnv({
    APP_ENV: "local",
    PAYMENTS_MODE: "test",
    STRIPE_ACCOUNT_ID: "acct_synthetic7e01",
    STRIPE_SECRET_KEY: "sk_test_synthetic_7e_invoice",
    STRIPE_WEBHOOK_SECRET: "whsec_synthetic_7e_invoice",
  }));
  if (value === null) throw new Error("missing synthetic authority");
  return value;
}

function invoiceNormalization(
  eventType: string,
  providerEventId: string,
  overrides: Record<string, unknown> = {},
): ProcessableProviderEventNormalizationV1 {
  const result = normalizeStripeProviderEventV1({
    id: providerEventId,
    type: eventType,
    created: providerCreated,
    livemode: false,
    data: {
      object: {
        id: invoiceId,
        metadata: { orderId: ids.order },
        amount_due: 8_700,
        amount_paid: 8_700,
        currency: "usd",
        status: "paid",
        collection_method: "send_invoice",
        livemode: false,
        ...overrides,
      },
    },
  });
  if (result.status !== "normalized") {
    throw new Error(`expected normalized invoice event, got ${result.status}`);
  }
  return result as ProcessableProviderEventNormalizationV1;
}

function repository() {
  return createProviderEventRepository({
    runSerializableTransaction: (work) =>
      client.transaction((transaction) => work({
        query: (text, params = []) => transaction.query(text, [...params]),
      })),
    keyedUuid,
  });
}

async function claim(
  normalization: ProcessableProviderEventNormalizationV1,
  suffix: string,
) {
  const result = await repository().registerAndClaim({
    provider: "stripe",
    databaseEventId: keyedUuid(`database-event:${suffix}`),
    conflictAuditId: keyedUuid(`registration-audit:${suffix}`),
    payloadHash: createHash("sha256").update(`payload:${suffix}`).digest("hex"),
    normalization,
    receivedAt: new Date("2026-08-25T12:00:00.000Z"),
    claimAt: new Date("2026-08-25T12:00:00.000Z"),
    leaseToken: `lease_synthetic_7e_${suffix}`,
    leaseExpiresAt: new Date("2026-08-25T12:01:00.000Z"),
  });
  if (result.status !== "claimed") {
    throw new Error(`expected claim, got ${result.status}`);
  }
  return result.claim;
}

async function orderState(): Promise<string> {
  const rows = await client.query<{ state: string }>(
    `SELECT state FROM orders WHERE id = '${ids.order}'`,
  );
  return (rows.rows[0] as { state: string }).state;
}

beforeEach(async () => {
  client = await createMigratedPglite();
  await client.exec(`
    INSERT INTO users (id, clerk_id, email_verified_at)
    VALUES ('${ids.buyer}', 'invoice-event-buyer', now());
    INSERT INTO buyer_profiles (user_id, status, age_confirmed_at, research_purpose)
    VALUES ('${ids.buyer}', 'active', now(), 'analytical');
    INSERT INTO attestation_versions (id, version, content_hash, policy_text, effective_at)
    VALUES ('${ids.attestation}', 1, '${"a".repeat(64)}', 'Synthetic attestation', now());
    INSERT INTO attestation_acceptances (id, user_id, attestation_version_id, accepted_at)
    VALUES ('${ids.acceptance}', '${ids.buyer}', '${ids.attestation}', now());
    INSERT INTO product_policy_groups (id, slug, name)
    VALUES ('${ids.group}', 'invoice-event-group', 'Invoice event group');
    INSERT INTO products
      (id, slug, name, package_form, material_identity, policy_group_id, status)
    VALUES ('${ids.product}', 'invoice-event-product', 'Synthetic Alpha',
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
    VALUES ('${ids.order}', '${ids.buyer}', 'active', '${ids.acceptance}',
            'CA', 'USD', 8000, 0, 400, 300, 8700, 'checkout_pending');
    INSERT INTO order_items
      (id, order_id, product_id, product_price_id, destination_policy_id,
       product_name_snapshot, package_form_snapshot, currency,
       unit_amount_minor, quantity, subtotal_minor, discount_minor, total_minor)
    VALUES ('${ids.item}', '${ids.order}', '${ids.product}', '${ids.price}', '${ids.policy}',
            'Synthetic Alpha', 'sealed vial', 'USD', 4000, 2, 8000, 0, 8000);
    INSERT INTO order_invoices
      (order_id, provider, provider_invoice_id, hosted_invoice_url,
       amount_due_minor, status)
    VALUES ('${ids.order}', 'stripe', '${invoiceId}',
            'https://invoice.stripe.com/i/x/settlement', 8700, 'open');
  `);
});

afterEach(async () => {
  await client.close();
});

describe("invoice provider event processing", () => {
  it("holds a paid invoice in settlement rather than releasing it", async () => {
    const paid = await claim(invoiceNormalization("invoice.paid", "evt_inv_paid"), "paid");

    await expect(
      repository().processClaim({ claim: paid, authority: authority(), now }),
    ).resolves.toEqual({ status: "processed" });

    // Option B: ACH funds can still be pulled back, so a paid invoice must not
    // reach a releasable state. docs/adr/0006.
    expect(await orderState()).toBe("paid_pending_settlement");
  });

  it("journals a verified payment event for the settled invoice", async () => {
    const paid = await claim(invoiceNormalization("invoice.paid", "evt_inv_paid2"), "paid2");
    await repository().processClaim({ claim: paid, authority: authority(), now });

    const rows = await client.query<{ event_type: string; provider_payment_id: string }>(
      `SELECT event_type, provider_payment_id FROM payment_events
        WHERE order_id = '${ids.order}'`,
    );
    expect(rows.rows).toEqual([
      { event_type: "payment_verified", provider_payment_id: invoiceId },
    ]);
  });

  it("does not move an order for an invoice that is merely finalized", async () => {
    const finalized = await claim(
      invoiceNormalization("invoice.finalized", "evt_inv_final", {
        status: "open",
        amount_paid: 0,
      }),
      "final",
    );

    await expect(
      repository().processClaim({ claim: finalized, authority: authority(), now }),
    ).resolves.toEqual({ status: "processed" });
    expect(await orderState()).toBe("checkout_pending");
  });

  it("refuses to move an order when no durable binding names that invoice", async () => {
    await client.exec(`DELETE FROM order_invoices WHERE order_id = '${ids.order}'`);
    const paid = await claim(invoiceNormalization("invoice.paid", "evt_inv_unbound"), "unbound");

    // The provider's metadata.orderId is not sufficient authority on its own.
    const result = await repository().processClaim({
      claim: paid,
      authority: authority(),
      now,
    });
    expect(result.status).not.toBe("processed");
    expect(await orderState()).toBe("checkout_pending");
  });

  it("is idempotent across a replayed paid invoice", async () => {
    const first = await claim(invoiceNormalization("invoice.paid", "evt_inv_r1"), "r1");
    await repository().processClaim({ claim: first, authority: authority(), now });
    const second = await claim(invoiceNormalization("invoice.paid", "evt_inv_r2"), "r2");
    await repository().processClaim({ claim: second, authority: authority(), now });

    expect(await orderState()).toBe("paid_pending_settlement");
    const payments = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM payment_events WHERE order_id = '${ids.order}'`,
    );
    expect(payments.rows[0]).toEqual({ count: 1 });
  });
});
