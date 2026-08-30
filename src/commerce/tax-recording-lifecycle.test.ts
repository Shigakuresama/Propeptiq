import { describe, expect, it, vi } from "vitest";

import { createTaxEffectHandlerV1 } from "@/commerce/tax-recording-lifecycle";
import type { TaxTransactionResultV1 } from "@/commerce/stripe-tax-transaction";

const orderId = "75000000-0000-4000-8000-000000000001";
const calculationReference = "taxcalc_synthetic6d";

function delivery(payload: unknown = {
  schemaVersion: 1,
  orderId,
  verifiedPaymentEventId: "75000000-0000-4000-8000-0000000000ff",
  calculationReference,
}) {
  return Object.freeze({
    effectType: "stripe_tax_transaction",
    payload,
    idempotencyKey: `payment_event:x:stripe_tax_transaction`,
  });
}

function handlerWith(result: TaxTransactionResultV1) {
  const recordTransaction = vi.fn(async () => result);
  return {
    handler: createTaxEffectHandlerV1({ recorder: { recordTransaction } }),
    recordTransaction,
  };
}

describe("createTaxEffectHandlerV1", () => {
  it("declares the effect type it drains", () => {
    const { handler } = handlerWith({ status: "already_recorded" });
    expect(handler.effectType).toBe("stripe_tax_transaction");
  });

  it("records the transaction and completes the effect", async () => {
    const { handler, recordTransaction } = handlerWith({
      status: "recorded",
      transactionId: "tax_synthetic6d",
    });

    expect(await handler.handleDelivery(delivery())).toEqual({
      disposition: "complete",
      outcome: "recorded",
      transactionId: "tax_synthetic6d",
    });
    expect(recordTransaction).toHaveBeenCalledWith({
      orderId,
      calculationReference,
    });
  });

  it("completes an effect whose reference a previous attempt already claimed", async () => {
    const { handler } = handlerWith({ status: "already_recorded" });

    expect(await handler.handleDelivery(delivery())).toEqual({
      disposition: "complete",
      outcome: "already_recorded",
      transactionId: null,
    });
  });

  it("completes rather than retries a permanently unrecordable calculation", async () => {
    const { handler } = handlerWith({
      status: "unrecordable",
      reason: "calculation_expired",
    });

    // Completing is deliberate: claimEffect re-claims anything not "processed",
    // so failing here would loop a calculation that can never succeed.
    expect(await handler.handleDelivery(delivery())).toEqual({
      disposition: "complete",
      outcome: "calculation_expired",
      transactionId: null,
    });
  });

  it("asks for a retry when the call could not be completed", async () => {
    const { handler } = handlerWith({ status: "retryable" });

    expect(await handler.handleDelivery(delivery())).toEqual({
      disposition: "retry",
      reason: "tax_transaction_unavailable",
    });
  });

  it("refuses a delivery for another effect type without calling Stripe", async () => {
    const { handler, recordTransaction } = handlerWith({
      status: "already_recorded",
    });

    expect(
      await handler.handleDelivery({
        ...delivery(),
        effectType: "payment_verified",
      }),
    ).toEqual({ disposition: "complete", outcome: "rejected", transactionId: null });
    expect(recordTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing calculation reference", { schemaVersion: 1, orderId }],
    ["a blank calculation reference", { schemaVersion: 1, orderId, calculationReference: "  " }],
    ["a non-canonical order id", { schemaVersion: 1, orderId: "order-1", calculationReference }],
    ["an unknown schema version", { schemaVersion: 2, orderId, calculationReference }],
    ["a non-object payload", "stripe_tax_transaction"],
  ])("refuses %s without calling Stripe", async (_label, payload) => {
    const { handler, recordTransaction } = handlerWith({
      status: "already_recorded",
    });

    expect(await handler.handleDelivery(delivery(payload))).toEqual({
      disposition: "complete",
      outcome: "rejected",
      transactionId: null,
    });
    expect(recordTransaction).not.toHaveBeenCalled();
  });
});
