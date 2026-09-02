import { describe, expect, it, vi } from "vitest";

import {
  createStripeInvoiceProvider,
  type StripeInvoiceRequestV1,
} from "@/commerce/stripe-invoice-provider";

const ids = {
  order: "76000000-0000-4000-8000-000000000001",
  productA: "76000000-0000-4000-8000-00000000000a",
  productB: "76000000-0000-4000-8000-00000000000b",
} as const;

function exactRequest(
  overrides: Partial<StripeInvoiceRequestV1> = {},
): StripeInvoiceRequestV1 {
  return Object.freeze({
    orderId: ids.order,
    customerId: "cus_synthetic6d",
    daysUntilDue: 30,
    currency: "USD" as const,
    lines: Object.freeze([
      Object.freeze({
        productId: ids.productA,
        description: "Synthetic Alpha, sealed vial, quantity 2",
        amountMinor: 8_000,
      }),
      Object.freeze({
        productId: ids.productB,
        description: "Shipping",
        amountMinor: 700,
      }),
    ]),
    metadata: Object.freeze({ orderId: ids.order, poNumber: "PO-4417" }),
    ...overrides,
  });
}

function rawInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "in_synthetic6d",
    object: "invoice",
    status: "open",
    currency: "usd",
    amount_due: 8_700,
    total: 8_700,
    collection_method: "send_invoice",
    livemode: false,
    hosted_invoice_url:
      "https://invoice.stripe.com/i/acct_synthetic6d/test_synthetic6d",
    metadata: { orderId: ids.order, poNumber: "PO-4417" },
    ...overrides,
  };
}

type Calls = { params: unknown; options: unknown; method: string }[];

function providerWith(
  handlers: Partial<{
    itemCreate: (p: unknown, o: unknown) => Promise<unknown>;
    invoiceCreate: (p: unknown, o: unknown) => Promise<unknown>;
    finalize: (id: string, p: unknown, o: unknown) => Promise<unknown>;
  }> = {},
  livemode = false,
) {
  const calls: Calls = [];
  const provider = createStripeInvoiceProvider({
    sdk: {
      invoiceItems: {
        create:
          handlers.itemCreate ??
          (async (params, options) => {
            calls.push({ method: "item", params, options });
            return { id: "ii_synthetic6d", object: "invoiceitem" };
          }),
      },
      invoices: {
        create:
          handlers.invoiceCreate ??
          (async (params, options) => {
            calls.push({ method: "invoice", params, options });
            return rawInvoice({ status: "draft", hosted_invoice_url: null });
          }),
        finalizeInvoice:
          handlers.finalize ??
          (async (id, params, options) => {
            calls.push({ method: `finalize:${id}`, params, options });
            return rawInvoice();
          }),
      },
    },
    livemode,
  });
  return { provider, calls };
}

describe("createStripeInvoiceProvider", () => {
  it("creates items, drafts the invoice, finalizes it, and returns the hosted page", async () => {
    const { provider } = providerWith();

    expect(await provider.createInvoice(exactRequest())).toEqual({
      status: "open",
      invoice: {
        provider: "stripe",
        providerInvoiceId: "in_synthetic6d",
        orderId: ids.order,
        hostedInvoiceUrl:
          "https://invoice.stripe.com/i/acct_synthetic6d/test_synthetic6d",
        amountDueMinor: 8_700,
        currency: "USD",
        collectionMethod: "send_invoice",
        livemode: false,
      },
    });
  });

  it("derives every idempotency key from the order so a retry cannot double-bill", async () => {
    const { provider, calls } = providerWith();

    await provider.createInvoice(exactRequest());

    expect(calls.map((call) => call.method)).toEqual([
      "item",
      "item",
      "invoice",
      "finalize:in_synthetic6d",
    ]);
    expect(calls.map((call) => (call.options as { idempotencyKey: string }).idempotencyKey)).toEqual([
      `invoice_item:${ids.order}:${ids.productA}`,
      `invoice_item:${ids.order}:${ids.productB}`,
      `invoice:${ids.order}`,
      `invoice_finalize:${ids.order}`,
    ]);
  });

  it("bills on net terms without ever auto-charging a stored method", async () => {
    const { provider, calls } = providerWith();

    await provider.createInvoice(exactRequest());

    const invoiceCall = calls.find((call) => call.method === "invoice");
    expect(invoiceCall?.params).toMatchObject({
      customer: "cus_synthetic6d",
      collection_method: "send_invoice",
      days_until_due: 30,
      auto_advance: false,
      pending_invoice_items_behavior: "include",
      currency: "usd",
      metadata: { orderId: ids.order, poNumber: "PO-4417" },
    });
  });

  it("refuses an invoice whose amount due contradicts the server total", async () => {
    const { provider } = providerWith({
      finalize: async () => rawInvoice({ amount_due: 8_701 }),
    });

    expect(await provider.createInvoice(exactRequest())).toEqual({
      status: "provider_unknown",
      evidenceCode: "provider_response_mismatch",
      knownProviderInvoiceId: "in_synthetic6d",
    });
  });

  it("refuses a hosted invoice page that is not served by Stripe", async () => {
    const { provider } = providerWith({
      finalize: async () =>
        rawInvoice({ hosted_invoice_url: "https://invoice.stripe.com.evil.test/i/x" }),
    });

    expect(await provider.createInvoice(exactRequest())).toEqual({
      status: "provider_unknown",
      evidenceCode: "provider_response_mismatch",
      knownProviderInvoiceId: "in_synthetic6d",
    });
  });

  it("refuses an invoice returned in the wrong livemode", async () => {
    const { provider } = providerWith(
      { finalize: async () => rawInvoice({ livemode: true }) },
      false,
    );

    expect(await provider.createInvoice(exactRequest())).toEqual({
      status: "provider_unknown",
      evidenceCode: "provider_response_mismatch",
      knownProviderInvoiceId: "in_synthetic6d",
    });
  });

  it("refuses an invoice whose metadata points at another order", async () => {
    const { provider } = providerWith({
      finalize: async () =>
        rawInvoice({
          metadata: { orderId: "76000000-0000-4000-8000-000000000999" },
        }),
    });

    expect(await provider.createInvoice(exactRequest())).toEqual({
      status: "provider_unknown",
      evidenceCode: "provider_response_mismatch",
      knownProviderInvoiceId: "in_synthetic6d",
    });
  });

  it("refuses an invoice that did not reach open after finalization", async () => {
    const { provider } = providerWith({
      finalize: async () => rawInvoice({ status: "draft" }),
    });

    expect(await provider.createInvoice(exactRequest())).toEqual({
      status: "provider_unknown",
      evidenceCode: "provider_response_mismatch",
      knownProviderInvoiceId: "in_synthetic6d",
    });
  });

  it("reports a definite rejection when Stripe refuses the request outright", async () => {
    const { provider } = providerWith({
      invoiceCreate: async () => {
        throw Object.assign(new Error("no such customer"), {
          type: "StripeInvalidRequestError",
          statusCode: 400,
          requestId: "req_synthetic6d",
        });
      },
    });

    expect(await provider.createInvoice(exactRequest())).toEqual({
      status: "definite_rejection",
      evidenceCode: "create_rejected_4xx",
      providerRequestId: "req_synthetic6d",
    });
  });

  it("never assumes failure when the call cannot be completed", async () => {
    const { provider } = providerWith({
      invoiceCreate: async () => {
        throw Object.assign(new Error("socket hang up"), {
          type: "StripeConnectionError",
        });
      },
    });

    expect(await provider.createInvoice(exactRequest())).toEqual({
      status: "provider_unknown",
      evidenceCode: "provider_transport_unknown",
      knownProviderInvoiceId: null,
    });
  });

  it("stops before finalizing when an invoice item is rejected", async () => {
    const finalize = vi.fn();
    const { provider } = providerWith({
      itemCreate: async () => {
        throw Object.assign(new Error("bad amount"), {
          type: "StripeInvalidRequestError",
          statusCode: 400,
        });
      },
      finalize,
    });

    expect(await provider.createInvoice(exactRequest())).toEqual({
      status: "definite_rejection",
      evidenceCode: "create_rejected_4xx",
      providerRequestId: null,
    });
    expect(finalize).not.toHaveBeenCalled();
  });
});
