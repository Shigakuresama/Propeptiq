import { describe, expect, it } from "vitest";

import {
  normalizeStripeProviderEventV1,
  parseNormalizedProviderEventV1,
} from "@/commerce/provider-events";

const created = 1_787_659_200;
const providerCreatedAt = "2026-08-25T12:00:00.000Z";
const orderId = "76000000-0000-4000-8000-000000000001";
const attemptId = "76000000-0000-4000-8000-000000000002";
const refundRequestId = "76000000-0000-4000-8000-000000000003";

function stripeEvent(
  type: string,
  object: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `evt_synthetic_6e_${type.replaceAll(".", "_")}`,
    type,
    created,
    livemode: false,
    data: { object },
    ...overrides,
  };
}

function checkoutObject(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_synthetic_6e",
    client_reference_id: orderId,
    metadata: { orderId, attemptId },
    payment_intent: { id: "pi_synthetic_6e", email: "discard@example.test" },
    amount_total: 12_345,
    currency: "USD",
    payment_status: "paid",
    status: "complete",
    livemode: false,
    customer_details: { email: "discard@example.test" },
    ...overrides,
  };
}

describe("NormalizedProviderEventV1", () => {
  it("normalizes an exact checkout session without retaining expanded or customer data", () => {
    const result = normalizeStripeProviderEventV1(
      stripeEvent("checkout.session.completed", checkoutObject()),
    );

    expect(result).toEqual({
      status: "normalized",
      event: {
        schemaVersion: 1,
        kind: "checkout_session",
        providerEventId: "evt_synthetic_6e_checkout_session_completed",
        eventType: "checkout.session.completed",
        providerCreatedAt,
        livemode: false,
        sessionId: "cs_test_synthetic_6e",
        orderId,
        attemptId,
        paymentIntentId: "pi_synthetic_6e",
        amountMinor: 12_345,
        currency: "usd",
        paymentStatus: "paid",
        sessionStatus: "complete",
      },
    });
    if (result.status !== "normalized") return;
    expect(Object.isFrozen(result.event)).toBe(true);
    expect(JSON.stringify(result.event)).not.toMatch(/email|customer_details/i);
  });

  it("supports every checkout event and maps future nonblank statuses restrictively", () => {
    for (const type of [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
    ]) {
      const result = normalizeStripeProviderEventV1(
        stripeEvent(
          type,
          checkoutObject({
            payment_intent: null,
            payment_status: "future_payment_status",
            status: "future_session_status",
          }),
        ),
      );
      expect(result).toMatchObject({
        status: "normalized",
        event: {
          kind: "checkout_session",
          eventType: type,
          paymentIntentId: null,
          paymentStatus: "unknown_restrictive",
          sessionStatus: "unknown_restrictive",
        },
      });
    }
  });

  it("turns a malformed known body into common-only conflict and invalid common identity into zero facts", () => {
    const malformed = normalizeStripeProviderEventV1(
      stripeEvent(
        "checkout.session.completed",
        checkoutObject({ metadata: { orderId } }),
      ),
    );
    expect(malformed).toEqual({
      status: "conflict",
      reason: "malformed_known_event",
      event: {
        schemaVersion: 1,
        kind: "ignored",
        providerEventId: "evt_synthetic_6e_checkout_session_completed",
        eventType: "checkout.session.completed",
        providerCreatedAt,
        livemode: false,
      },
    });
    expect(JSON.stringify(malformed)).not.toContain(orderId);

    expect(
      normalizeStripeProviderEventV1(
        stripeEvent("checkout.session.completed", checkoutObject(), { id: " " }),
      ),
    ).toEqual({ status: "invalid" });
  });

  it("normalizes exact refund correlation and discards arbitrary observed metadata", () => {
    const internal = normalizeStripeProviderEventV1(
      stripeEvent("refund.updated", {
        id: "re_synthetic_6e",
        metadata: { orderId, refundId: refundRequestId },
        payment_intent: "pi_synthetic_6e",
        charge: { id: "ch_synthetic_6e", arbitrary: "discard" },
        amount: 1_234,
        currency: "uSd",
        status: "requires_action",
      }),
    );
    expect(internal).toMatchObject({
      status: "normalized",
      event: {
        kind: "refund",
        providerRefundId: "re_synthetic_6e",
        orderId,
        refundRequestId,
        paymentIntentId: "pi_synthetic_6e",
        chargeId: "ch_synthetic_6e",
        amountMinor: 1_234,
        currency: "usd",
        status: "requires_action",
      },
    });

    const observed = normalizeStripeProviderEventV1(
      stripeEvent("refund.created", {
        id: "re_observed_synthetic_6e",
        metadata: { operatorNote: "discard me", customerEmail: "discard@example.test" },
        payment_intent: null,
        charge: null,
        amount: 500,
        currency: "usd",
        status: "pending",
      }),
    );
    expect(observed).toMatchObject({
      status: "normalized",
      event: { kind: "refund", orderId: null, refundRequestId: null },
    });
    expect(JSON.stringify(observed)).not.toMatch(/operatorNote|customerEmail|discard/i);
  });

  it("conflicts malformed reserved refund metadata and incompatible refund status", () => {
    for (const object of [
      {
        id: "re_synthetic_6e",
        metadata: { orderId },
        payment_intent: null,
        charge: null,
        amount: 500,
        currency: "usd",
        status: "pending",
      },
      {
        id: "re_synthetic_6e",
        metadata: { orderId, refundId: refundRequestId, extra: "forbidden" },
        payment_intent: null,
        charge: null,
        amount: 500,
        currency: "usd",
        status: "pending",
      },
      {
        id: "re_synthetic_6e",
        metadata: "not-an-object",
        payment_intent: null,
        charge: null,
        amount: 500,
        currency: "usd",
        status: "pending",
      },
      {
        id: "re_synthetic_6e",
        metadata: { orderId: "not-a-uuid", refundId: refundRequestId },
        payment_intent: null,
        charge: null,
        amount: 500,
        currency: "usd",
        status: "pending",
      },
      {
        id: "re_synthetic_6e",
        metadata: {},
        payment_intent: null,
        charge: null,
        amount: 500,
        currency: "usd",
        status: "succeeded",
      },
    ]) {
      const eventType =
        object.status === "succeeded" ? "refund.failed" : "refund.updated";
      expect(
        normalizeStripeProviderEventV1(stripeEvent(eventType, object)),
      ).toMatchObject({ status: "conflict", reason: "malformed_known_event" });
    }
  });

  it("normalizes reconciliation and dispute variants with restrictive future status", () => {
    expect(
      normalizeStripeProviderEventV1(
        stripeEvent("charge.refunded", {
          id: "ch_synthetic_6e",
          payment_intent: { id: "pi_synthetic_6e", expanded: "discard" },
          amount_refunded: 1_234,
          currency: "usd",
          livemode: false,
        }),
      ),
    ).toMatchObject({
      status: "normalized",
      event: {
        kind: "refund_reconciliation",
        chargeId: "ch_synthetic_6e",
        paymentIntentId: "pi_synthetic_6e",
        amountRefundedMinor: 1_234,
        currency: "usd",
      },
    });

    expect(
      normalizeStripeProviderEventV1(
        stripeEvent("charge.dispute.updated", {
          id: "dp_synthetic_6e",
          payment_intent: "pi_synthetic_6e",
          charge: "ch_synthetic_6e",
          amount: 1_234,
          currency: "usd",
          status: "future_restrictive_status",
          livemode: false,
        }),
      ),
    ).toMatchObject({
      status: "normalized",
      event: {
        kind: "dispute",
        disputeId: "dp_synthetic_6e",
        paymentIntentId: "pi_synthetic_6e",
        chargeId: "ch_synthetic_6e",
        amountMinor: 1_234,
        currency: "usd",
        status: "unknown_restrictive",
      },
    });
  });

  it.each([
    ["charge.dispute.closed", "needs_response"],
    ["charge.dispute.updated", "won"],
  ])("conflicts incoherent dispute event/status pair %s with %s", (eventType, status) => {
    expect(
      normalizeStripeProviderEventV1(
        stripeEvent(eventType, {
          id: "dp_synthetic_6e_incoherent",
          payment_intent: "pi_synthetic_6e",
          charge: "ch_synthetic_6e",
          amount: 1_234,
          currency: "usd",
          status,
          livemode: false,
        }),
      ),
    ).toMatchObject({ status: "conflict", reason: "malformed_known_event" });
  });

  it("conflicts a known dispute with a missing runtime status", () => {
    expect(
      normalizeStripeProviderEventV1(
        stripeEvent("charge.dispute.updated", {
          id: "dp_synthetic_6e_missing_status",
          payment_intent: "pi_synthetic_6e",
          charge: "ch_synthetic_6e",
          amount: 1_234,
          currency: "usd",
          livemode: false,
        }),
      ),
    ).toMatchObject({ status: "conflict", reason: "malformed_known_event" });
  });

  it.each([
    ["checkout payment", "checkout.session.completed", checkoutObject({ payment_status: "   " })],
    ["checkout session", "checkout.session.completed", checkoutObject({ status: "   " })],
    ["dispute", "charge.dispute.updated", {
      id: "dp_synthetic_6e_blank_status",
      payment_intent: "pi_synthetic_6e",
      charge: "ch_synthetic_6e",
      amount: 1_234,
      currency: "usd",
      status: "   ",
      livemode: false,
    }],
  ])("conflicts whitespace-only %s status", (_label, eventType, object) => {
    expect(
      normalizeStripeProviderEventV1(stripeEvent(eventType, object)),
    ).toMatchObject({ status: "conflict", reason: "malformed_known_event" });
  });

  it.each([
    ["absent", {}],
    ["undefined", { metadata: undefined }],
    ["null", { metadata: null }],
    ["empty", { metadata: {} }],
  ])("treats %s refund metadata as an uncorrelated provider observation", (
    _label,
    metadata,
  ) => {
    const normalized = normalizeStripeProviderEventV1(
      stripeEvent("refund.updated", {
        id: "re_synthetic_6e_observed_without_correlation",
        ...metadata,
        payment_intent: "pi_synthetic_6e",
        charge: "ch_synthetic_6e",
        amount: 500,
        currency: "usd",
        status: "pending",
      }),
    );
    expect(normalized).toMatchObject({
      status: "normalized",
      event: {
        kind: "refund",
        orderId: null,
        refundRequestId: null,
      },
    });
    expect(JSON.stringify(normalized)).not.toContain("metadata");
  });

  it("retains only common identity for an unsupported signed event", () => {
    expect(
      normalizeStripeProviderEventV1(
        stripeEvent("customer.created", {
          id: "cus_synthetic_6e",
          email: "discard@example.test",
          metadata: { arbitrary: "discard" },
        }),
      ),
    ).toEqual({
      status: "normalized",
      event: {
        schemaVersion: 1,
        kind: "ignored",
        providerEventId: "evt_synthetic_6e_customer_created",
        eventType: "customer.created",
        providerCreatedAt,
        livemode: false,
      },
    });
  });

  it("strictly parses only exact own-key normalized envelopes", () => {
    const normalized = normalizeStripeProviderEventV1(
      stripeEvent("checkout.session.completed", checkoutObject()),
    );
    expect(normalized.status).toBe("normalized");
    if (normalized.status !== "normalized") return;

    expect(parseNormalizedProviderEventV1(normalized.event)).toBe(normalized.event);
    expect(
      parseNormalizedProviderEventV1({ ...normalized.event, raw: "forbidden" }),
    ).toBeNull();

    const symbolEnvelope = { ...normalized.event } as Record<PropertyKey, unknown>;
    symbolEnvelope[Symbol("forbidden")] = "value";
    expect(parseNormalizedProviderEventV1(symbolEnvelope)).toBeNull();

    const inheritedEnvelope = Object.create({ raw: "forbidden" }) as Record<
      string,
      unknown
    >;
    Object.assign(inheritedEnvelope, normalized.event);
    expect(parseNormalizedProviderEventV1(inheritedEnvelope)).toBeNull();
  });

  it("does not parse a fabricated common-only ignored envelope for a known event", () => {
    expect(parseNormalizedProviderEventV1({
      schemaVersion: 1,
      kind: "ignored",
      providerEventId: "evt_synthetic_6e_fabricated_known_ignored",
      eventType: "checkout.session.completed",
      providerCreatedAt,
      livemode: false,
    })).toBeNull();
  });
});

describe("invoice and ACH events are journaled but not yet processable", () => {
  // Invoicing is enqueued in Stripe by src/commerce/stripe-invoice-provider.ts,
  // but no order-state semantics exist for an invoiced sale yet. Until they do,
  // these events must normalize to "ignored": verified and journaled, with zero
  // business effect. Adding a processable kind without matching repository
  // transitions would be strictly worse than this safe default.
  it.each([
    "cash_balance.funds_available",
    "customer_cash_balance_transaction.created",
  ])("normalizes %s to an ignored event with no business payload", (type) => {
    const result = normalizeStripeProviderEventV1(
      stripeEvent(type, {
        id: "in_synthetic6d",
        amount_due: 8_700,
        currency: "usd",
        status: "paid",
      }),
    );

    expect(result).toEqual({
      status: "normalized",
      event: {
        schemaVersion: 1,
        kind: "ignored",
        providerEventId: `evt_synthetic_6e_${type.replaceAll(".", "_")}`,
        eventType: type,
        providerCreatedAt,
        livemode: false,
      },
    });
  });
});

describe("invoice provider events", () => {
  const invoiceOrderId = "76000000-0000-4000-8000-0000000000c1";

  function invoiceObject(overrides: Record<string, unknown> = {}) {
    return {
      id: "in_synthetic6d",
      metadata: { orderId: invoiceOrderId },
      amount_due: 8_700,
      amount_paid: 8_700,
      currency: "usd",
      status: "paid",
      collection_method: "send_invoice",
      livemode: false,
      ...overrides,
    };
  }

  it("normalizes a paid net-terms invoice with its order binding", () => {
    const result = normalizeStripeProviderEventV1(
      stripeEvent("invoice.paid", invoiceObject()),
    );

    expect(result).toEqual({
      status: "normalized",
      event: {
        schemaVersion: 1,
        kind: "invoice",
        providerEventId: "evt_synthetic_6e_invoice_paid",
        eventType: "invoice.paid",
        providerCreatedAt,
        livemode: false,
        invoiceId: "in_synthetic6d",
        orderId: invoiceOrderId,
        amountDueMinor: 8_700,
        amountPaidMinor: 8_700,
        currency: "usd",
        status: "paid",
        collectionMethod: "send_invoice",
      },
    });
  });

  it("round-trips a normalized invoice event through the stored parser", () => {
    const result = normalizeStripeProviderEventV1(
      stripeEvent("invoice.paid", invoiceObject()),
    );
    expect(result.status).toBe("normalized");
    if (result.status !== "normalized") return;
    expect(parseNormalizedProviderEventV1(result.event)).toEqual(result.event);
  });

  it.each(["invoice.finalized", "invoice.payment_failed"])(
    "normalizes %s as an invoice event",
    (type) => {
      const result = normalizeStripeProviderEventV1(
        stripeEvent(type, invoiceObject({ status: "open", amount_paid: 0 })),
      );
      expect(result.status).toBe("normalized");
      if (result.status !== "normalized") return;
      expect(result.event.kind).toBe("invoice");
    },
  );

  it("conflicts an invoice event whose order binding is missing", () => {
    const result = normalizeStripeProviderEventV1(
      stripeEvent("invoice.paid", invoiceObject({ metadata: {} })),
    );
    expect(result.status).toBe("conflict");
  });

  it("conflicts an invoice event whose livemode contradicts the envelope", () => {
    const result = normalizeStripeProviderEventV1(
      stripeEvent("invoice.paid", invoiceObject({ livemode: true })),
    );
    expect(result.status).toBe("conflict");
  });

  it("restricts an unrecognized invoice status rather than trusting it", () => {
    const result = normalizeStripeProviderEventV1(
      stripeEvent("invoice.paid", invoiceObject({ status: "weird" })),
    );
    expect(result.status).toBe("normalized");
    if (result.status !== "normalized" || result.event.kind !== "invoice") return;
    expect(result.event.status).toBe("unknown_restrictive");
  });
});

describe("credit note provider events", () => {
  function creditNoteObject(overrides: Record<string, unknown> = {}) {
    return {
      id: "cn_synthetic6d",
      invoice: "in_synthetic6d",
      amount: 8_000,
      total: 8_700,
      currency: "usd",
      status: "issued",
      type: "post_payment",
      livemode: false,
      ...overrides,
    };
  }

  it("normalizes an issued credit note against its invoice", () => {
    const result = normalizeStripeProviderEventV1(
      stripeEvent("credit_note.created", creditNoteObject()),
    );

    expect(result).toEqual({
      status: "normalized",
      event: {
        schemaVersion: 1,
        kind: "credit_note",
        providerEventId: "evt_synthetic_6e_credit_note_created",
        eventType: "credit_note.created",
        providerCreatedAt,
        livemode: false,
        creditNoteId: "cn_synthetic6d",
        invoiceId: "in_synthetic6d",
        amountMinor: 8_700,
        currency: "usd",
        status: "issued",
        creditType: "post_payment",
      },
    });
  });

  it("round-trips a normalized credit note through the stored parser", () => {
    const result = normalizeStripeProviderEventV1(
      stripeEvent("credit_note.created", creditNoteObject()),
    );
    expect(result.status).toBe("normalized");
    if (result.status !== "normalized") return;
    expect(parseNormalizedProviderEventV1(result.event)).toEqual(result.event);
  });

  it("accepts an expanded invoice object as the binding", () => {
    const result = normalizeStripeProviderEventV1(
      stripeEvent("credit_note.created", creditNoteObject({
        invoice: { id: "in_synthetic6d", object: "invoice" },
      })),
    );
    expect(result.status).toBe("normalized");
    if (result.status !== "normalized" || result.event.kind !== "credit_note") return;
    expect(result.event.invoiceId).toBe("in_synthetic6d");
  });

  it("conflicts a credit note with no invoice binding", () => {
    const result = normalizeStripeProviderEventV1(
      stripeEvent("credit_note.created", creditNoteObject({ invoice: null })),
    );
    expect(result.status).toBe("conflict");
  });

  it("conflicts a credit note whose livemode contradicts the envelope", () => {
    const result = normalizeStripeProviderEventV1(
      stripeEvent("credit_note.created", creditNoteObject({ livemode: true })),
    );
    expect(result.status).toBe("conflict");
  });

  it("restricts an unrecognized credit note status rather than trusting it", () => {
    const result = normalizeStripeProviderEventV1(
      stripeEvent("credit_note.created", creditNoteObject({ status: "weird" })),
    );
    expect(result.status).toBe("normalized");
    if (result.status !== "normalized" || result.event.kind !== "credit_note") return;
    expect(result.event.status).toBe("unknown_restrictive");
  });
});
