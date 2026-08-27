import { describe, expect, it } from "vitest";

import { deriveProviderRestrictionsV1 } from "./fulfillment-facts";

const payment = {
  provider: "stripe" as const,
  livemode: false,
  paymentIntentId: "pi_fulfillment_exact",
  currency: "USD",
  paidAmountMinor: 5000,
};

function dispute(input: Readonly<{
  id: string;
  status: string;
  createdAt: string;
  provider?: string;
  livemode?: boolean;
  paymentIntentId?: string;
  databaseStatus?: string;
}>) {
  const providerEventId = `evt_${input.id}_${input.status}_${input.createdAt}`;
  return {
    provider: input.provider ?? "stripe",
    providerEventId,
    eventType: input.status === "won" || input.status === "lost"
      ? "charge.dispute.closed"
      : "charge.dispute.updated",
    status: input.databaseStatus ?? "processed",
    livemode: input.livemode ?? false,
    normalizedPayload: {
      schemaVersion: 1,
      kind: "dispute",
      providerEventId,
      eventType: input.status === "won" || input.status === "lost"
        ? "charge.dispute.closed"
        : "charge.dispute.updated",
      providerCreatedAt: input.createdAt,
      livemode: input.livemode ?? false,
      disputeId: input.id,
      paymentIntentId: input.paymentIntentId ?? "pi_fulfillment_exact",
      chargeId: "ch_fulfillment_exact",
      amountMinor: 5000,
      currency: "usd",
      status: input.status,
    },
  };
}

describe("signed provider financial restrictions", () => {
  it("ignores a different provider, livemode, or PaymentIntent", () => {
    const events = [
      dispute({ id: "dp_provider", status: "needs_response", createdAt: "2026-08-26T10:00:00.000Z", provider: "local_test" }),
      dispute({ id: "dp_mode", status: "needs_response", createdAt: "2026-08-26T10:00:00.000Z", livemode: true }),
      dispute({ id: "dp_payment", status: "needs_response", createdAt: "2026-08-26T10:00:00.000Z", paymentIntentId: "pi_other" }),
    ];
    expect(deriveProviderRestrictionsV1({ ...payment, events })).toEqual({
      refundPending: false,
      paymentDisputed: false,
      conflict: false,
    });
  });

  it.each(["pending", "processing", "deferred", "failed", "conflict"])(
    "blocks a matching uncommitted dispute in %s",
    (databaseStatus) => {
      expect(
        deriveProviderRestrictionsV1({
          ...payment,
          events: [
            dispute({
              id: "dp_uncommitted",
              status: "needs_response",
              createdAt: "2026-08-26T10:00:00.000Z",
              databaseStatus,
            }),
          ],
        }),
      ).toMatchObject({ paymentDisputed: true });
    },
  );

  it("uses signed chronology for resolved, reopened, older-late, equal-time, and multiple-dispute cases", () => {
    const recorded = dispute({ id: "dp_one", status: "needs_response", createdAt: "2026-08-26T10:00:00.000Z" });
    const resolved = dispute({ id: "dp_one", status: "won", createdAt: "2026-08-26T10:01:00.000Z" });
    const reopened = dispute({ id: "dp_one", status: "under_review", createdAt: "2026-08-26T10:02:00.000Z" });
    expect(deriveProviderRestrictionsV1({ ...payment, events: [recorded, resolved] })).toMatchObject({ paymentDisputed: false });
    expect(deriveProviderRestrictionsV1({ ...payment, events: [resolved, recorded] })).toMatchObject({ paymentDisputed: false });
    expect(deriveProviderRestrictionsV1({ ...payment, events: [recorded, resolved, reopened] })).toMatchObject({ paymentDisputed: true });

    const equalResolved = dispute({ id: "dp_equal", status: "won", createdAt: "2026-08-26T10:03:00.000Z" });
    const equalRestrictive = dispute({ id: "dp_equal", status: "lost", createdAt: "2026-08-26T10:03:00.000Z" });
    expect(deriveProviderRestrictionsV1({ ...payment, events: [equalResolved, equalRestrictive] })).toMatchObject({ paymentDisputed: true });
    const otherActive = dispute({ id: "dp_other", status: "warning_needs_response", createdAt: "2026-08-26T10:04:00.000Z" });
    expect(deriveProviderRestrictionsV1({ ...payment, events: [recorded, resolved, otherActive] })).toMatchObject({ paymentDisputed: true });
  });

  it("fails closed on a malformed or envelope-mismatched matching dispute", () => {
    const malformed = dispute({ id: "dp_malformed", status: "needs_response", createdAt: "2026-08-26T10:00:00.000Z" });
    const mismatch = {
      ...malformed,
      providerEventId: "evt_database_mismatch",
    };
    const invalid = {
      ...malformed,
      normalizedPayload: { malformed: true },
    };
    for (const event of [mismatch, invalid]) {
      expect(
        deriveProviderRestrictionsV1({ ...payment, events: [event] }),
      ).toEqual({
        refundPending: false,
        paymentDisputed: true,
        conflict: true,
      });
    }
  });

  it("marks exact uncommitted refund and reconciliation envelopes pending", () => {
    const common = {
      provider: "stripe",
      status: "deferred",
      livemode: false,
    } as const;
    const refund = {
      ...common,
      providerEventId: "evt_refund_pending",
      eventType: "refund.updated",
      normalizedPayload: {
        schemaVersion: 1,
        kind: "refund",
        providerEventId: "evt_refund_pending",
        eventType: "refund.updated",
        providerCreatedAt: "2026-08-26T10:00:00.000Z",
        livemode: false,
        providerRefundId: "re_pending",
        orderId: null,
        refundRequestId: null,
        paymentIntentId: "pi_fulfillment_exact",
        chargeId: null,
        amountMinor: 100,
        currency: "usd",
        status: "pending",
      },
    };
    const reconciliation = {
      ...common,
      providerEventId: "evt_reconciliation_pending",
      eventType: "charge.refunded",
      normalizedPayload: {
        schemaVersion: 1,
        kind: "refund_reconciliation",
        providerEventId: "evt_reconciliation_pending",
        eventType: "charge.refunded",
        providerCreatedAt: "2026-08-26T10:01:00.000Z",
        livemode: false,
        chargeId: "ch_fulfillment_exact",
        paymentIntentId: "pi_fulfillment_exact",
        amountRefundedMinor: 100,
        currency: "usd",
      },
    };
    expect(
      deriveProviderRestrictionsV1({
        ...payment,
        events: [refund, reconciliation],
      }),
    ).toMatchObject({ refundPending: true, conflict: false });
  });
});
