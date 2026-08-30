import { describe, expect, it, vi } from "vitest";

import { createInvoiceCheckoutOrchestratorV1 } from "@/commerce/invoice-checkout-orchestration";
import type { InvoiceProviderResultV1 } from "@/commerce/stripe-invoice-provider";

const orderId = "79000000-0000-4000-8000-000000000001";
const productId = "79000000-0000-4000-8000-00000000000a";

function invoiceRequest() {
  return Object.freeze({
    orderId,
    customerId: "cus_synthetic6d",
    daysUntilDue: 30,
    currency: "USD" as const,
    lines: Object.freeze([
      Object.freeze({
        productId,
        description: "Synthetic Alpha, sealed vial, quantity 2",
        amountMinor: 8_700,
      }),
    ]),
    metadata: Object.freeze({ orderId }),
  });
}

function openInvoice(): InvoiceProviderResultV1 {
  return Object.freeze({
    status: "open" as const,
    invoice: Object.freeze({
      provider: "stripe" as const,
      providerInvoiceId: "in_synthetic6d",
      orderId,
      hostedInvoiceUrl: "https://invoice.stripe.com/i/acct_x/test_x",
      amountDueMinor: 8_700,
      currency: "USD" as const,
      collectionMethod: "send_invoice" as const,
      livemode: false,
    }),
  });
}

function orchestratorWith(
  providerResult: InvoiceProviderResultV1,
  claim: unknown = { status: "claimed", request: invoiceRequest() },
) {
  const createInvoice = vi.fn(async () => providerResult);
  const claimInvoiceAttempt = vi.fn(async () => claim as never);
  const recordInvoiceOpen = vi.fn(async () => {});
  const recordInvoiceUnavailable = vi.fn(async () => {});
  const orchestrator = createInvoiceCheckoutOrchestratorV1({
    invoiceProvider: { createInvoice },
    port: { claimInvoiceAttempt, recordInvoiceOpen, recordInvoiceUnavailable },
  });
  return {
    orchestrator,
    createInvoice,
    claimInvoiceAttempt,
    recordInvoiceOpen,
    recordInvoiceUnavailable,
  };
}

describe("createInvoiceCheckoutOrchestratorV1", () => {
  it("issues an invoice and returns its hosted page", async () => {
    const { orchestrator, recordInvoiceOpen } = orchestratorWith(openInvoice());

    expect(await orchestrator.startInvoice({ orderId })).toEqual({
      status: "open",
      orderId,
      hostedInvoiceUrl: "https://invoice.stripe.com/i/acct_x/test_x",
    });
    expect(recordInvoiceOpen).toHaveBeenCalledWith({
      orderId,
      providerInvoiceId: "in_synthetic6d",
      hostedInvoiceUrl: "https://invoice.stripe.com/i/acct_x/test_x",
      amountDueMinor: 8_700,
    });
  });

  it("never calls the provider when the order cannot be claimed", async () => {
    const { orchestrator, createInvoice } = orchestratorWith(openInvoice(), {
      status: "ineligible",
      reason: "order_not_invoiceable",
    });

    expect(await orchestrator.startInvoice({ orderId })).toEqual({
      status: "ineligible",
      reason: "order_not_invoiceable",
    });
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("returns the existing invoice without issuing a second one", async () => {
    const { orchestrator, createInvoice, recordInvoiceOpen } = orchestratorWith(
      openInvoice(),
      {
        status: "already_open",
        providerInvoiceId: "in_prior",
        hostedInvoiceUrl: "https://invoice.stripe.com/i/acct_x/prior",
      },
    );

    expect(await orchestrator.startInvoice({ orderId })).toEqual({
      status: "open",
      orderId,
      hostedInvoiceUrl: "https://invoice.stripe.com/i/acct_x/prior",
    });
    expect(createInvoice).not.toHaveBeenCalled();
    expect(recordInvoiceOpen).not.toHaveBeenCalled();
  });

  it("records a definite rejection as unavailable and does not claim success", async () => {
    const { orchestrator, recordInvoiceUnavailable, recordInvoiceOpen } =
      orchestratorWith({
        status: "definite_rejection",
        evidenceCode: "create_rejected_4xx",
        providerRequestId: "req_x",
      });

    expect(await orchestrator.startInvoice({ orderId })).toEqual({
      status: "unavailable",
      reason: "provider_rejected",
    });
    expect(recordInvoiceUnavailable).toHaveBeenCalledWith({
      orderId,
      evidenceCode: "create_rejected_4xx",
      knownProviderInvoiceId: null,
    });
    expect(recordInvoiceOpen).not.toHaveBeenCalled();
  });

  it("never treats an ambiguous provider outcome as failure", async () => {
    const { orchestrator, recordInvoiceUnavailable, recordInvoiceOpen } =
      orchestratorWith({
        status: "provider_unknown",
        evidenceCode: "provider_transport_unknown",
        knownProviderInvoiceId: "in_maybe",
      });

    expect(await orchestrator.startInvoice({ orderId })).toEqual({
      status: "unknown",
      reason: "provider_transport_unknown",
    });
    expect(recordInvoiceUnavailable).toHaveBeenCalledWith({
      orderId,
      evidenceCode: "provider_transport_unknown",
      knownProviderInvoiceId: "in_maybe",
    });
    expect(recordInvoiceOpen).not.toHaveBeenCalled();
  });

  it("refuses a claim whose request names a different order", async () => {
    const { orchestrator, createInvoice } = orchestratorWith(openInvoice(), {
      status: "claimed",
      request: { ...invoiceRequest(), orderId: "79000000-0000-4000-8000-000000000999" },
    });

    expect(await orchestrator.startInvoice({ orderId })).toEqual({
      status: "unavailable",
      reason: "order_binding_mismatch",
    });
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("refuses an invoice whose response names a different order", async () => {
    const mismatched = openInvoice();
    const { orchestrator, recordInvoiceOpen } = orchestratorWith({
      status: "open",
      invoice: {
        ...(mismatched as { invoice: Record<string, unknown> }).invoice,
        orderId: "79000000-0000-4000-8000-000000000999",
      },
    } as InvoiceProviderResultV1);

    expect(await orchestrator.startInvoice({ orderId })).toEqual({
      status: "unavailable",
      reason: "order_binding_mismatch",
    });
    expect(recordInvoiceOpen).not.toHaveBeenCalled();
  });
});
