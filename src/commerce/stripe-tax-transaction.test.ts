import { describe, expect, it } from "vitest";

import { createStripeTaxTransactionRecorder } from "@/commerce/stripe-tax-transaction";

const ids = {
  order: "74000000-0000-4000-8000-000000000001",
} as const;

const calculationReference = "taxcalc_synthetic6d";

function rawTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "tax_synthetic6d",
    object: "tax.transaction",
    reference: ids.order,
    currency: "usd",
    livemode: false,
    type: "transaction",
    ...overrides,
  };
}

function recorderWith(
  createFromCalculation: (params: unknown, options: unknown) => Promise<unknown>,
  livemode = false,
) {
  return createStripeTaxTransactionRecorder({
    sdk: { tax: { transactions: { createFromCalculation } } },
    livemode,
  });
}

function stripeError(fields: Record<string, unknown>) {
  return Object.assign(new Error("stripe failure"), fields);
}

describe("createStripeTaxTransactionRecorder", () => {
  it("records the transaction and returns its identifier", async () => {
    const recorder = recorderWith(async () => rawTransaction());

    expect(
      await recorder.recordTransaction({
        calculationReference,
        orderId: ids.order,
      }),
    ).toEqual({ status: "recorded", transactionId: "tax_synthetic6d" });
  });

  it("keys the call on the order so a webhook retry cannot double-record", async () => {
    let sentParams: unknown = null;
    let sentOptions: unknown = null;
    const recorder = recorderWith(async (params, options) => {
      sentParams = params;
      sentOptions = options;
      return rawTransaction();
    });

    await recorder.recordTransaction({
      calculationReference,
      orderId: ids.order,
    });

    expect(sentParams).toEqual({
      calculation: calculationReference,
      reference: ids.order,
    });
    expect(sentOptions).toEqual({
      idempotencyKey: `tax_transaction:${ids.order}`,
      maxNetworkRetries: 0,
    });
  });

  it("treats an expired calculation as permanently unrecordable", async () => {
    const recorder = recorderWith(async () => {
      throw stripeError({
        type: "StripeInvalidRequestError",
        code: "tax_calculation_expired",
        statusCode: 400,
      });
    });

    expect(
      await recorder.recordTransaction({
        calculationReference,
        orderId: ids.order,
      }),
    ).toEqual({ status: "unrecordable", reason: "calculation_expired" });
  });

  it("treats an already-used reference as an earlier success", async () => {
    const recorder = recorderWith(async () => {
      throw stripeError({
        type: "StripeInvalidRequestError",
        code: "tax_transaction_reference_already_exists",
        statusCode: 400,
      });
    });

    expect(
      await recorder.recordTransaction({
        calculationReference,
        orderId: ids.order,
      }),
    ).toEqual({ status: "already_recorded" });
  });

  it("treats any other definite rejection as permanently unrecordable", async () => {
    const recorder = recorderWith(async () => {
      throw stripeError({
        type: "StripeInvalidRequestError",
        code: "parameter_invalid_empty",
        statusCode: 400,
      });
    });

    expect(
      await recorder.recordTransaction({
        calculationReference,
        orderId: ids.order,
      }),
    ).toEqual({ status: "unrecordable", reason: "rejected" });
  });

  it("asks the caller to retry when the call cannot be completed", async () => {
    const recorder = recorderWith(async () => {
      throw stripeError({ type: "StripeConnectionError" });
    });

    expect(
      await recorder.recordTransaction({
        calculationReference,
        orderId: ids.order,
      }),
    ).toEqual({ status: "retryable" });
  });

  it("asks the caller to retry when Stripe fails internally", async () => {
    const recorder = recorderWith(async () => {
      throw stripeError({ type: "StripeAPIError", statusCode: 500 });
    });

    expect(
      await recorder.recordTransaction({
        calculationReference,
        orderId: ids.order,
      }),
    ).toEqual({ status: "retryable" });
  });

  it("refuses a transaction echoing a different order reference", async () => {
    const recorder = recorderWith(async () =>
      rawTransaction({ reference: "74000000-0000-4000-8000-000000000999" }),
    );

    expect(
      await recorder.recordTransaction({
        calculationReference,
        orderId: ids.order,
      }),
    ).toEqual({ status: "unrecordable", reason: "rejected" });
  });

  it("refuses a transaction returned in the wrong livemode", async () => {
    const recorder = recorderWith(
      async () => rawTransaction({ livemode: true }),
      false,
    );

    expect(
      await recorder.recordTransaction({
        calculationReference,
        orderId: ids.order,
      }),
    ).toEqual({ status: "unrecordable", reason: "rejected" });
  });

  it("refuses a reversal masquerading as a forward transaction", async () => {
    const recorder = recorderWith(async () =>
      rawTransaction({ type: "reversal" }),
    );

    expect(
      await recorder.recordTransaction({
        calculationReference,
        orderId: ids.order,
      }),
    ).toEqual({ status: "unrecordable", reason: "rejected" });
  });
});
