import "server-only";

/**
 * Records a Stripe Tax transaction from a stored calculation.
 *
 * Because tax is computed server-side and sent to Checkout as an explicit
 * "Sales tax" line item, Stripe never sees the sale as taxed. Without this
 * step the tax is collected correctly but never reaches Stripe Tax reporting,
 * so there is nothing to file from.
 *
 * Call this only after a verified payment webhook. Calculations expire 90 days
 * after creation.
 */
export type StripeTaxTransactionSdkClient = Readonly<{
  tax: Readonly<{
    transactions: Readonly<{
      createFromCalculation: (
        params: unknown,
        options: unknown,
      ) => Promise<unknown>;
    }>;
  }>;
}>;

export type TaxTransactionResultV1 =
  | Readonly<{ status: "recorded"; transactionId: string }>
  /** A prior attempt already claimed this order's reference. Not an error. */
  | Readonly<{ status: "already_recorded" }>
  /** Permanent. Journal for manual reconciliation; do not retry the webhook. */
  | Readonly<{
      status: "unrecordable";
      reason: "calculation_expired" | "rejected";
    }>
  /** Transient. The caller should fail the delivery so Stripe redelivers. */
  | Readonly<{ status: "retryable" }>;

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function transactionId(value: unknown): string | null {
  return typeof value === "string" &&
    value.startsWith("tax_") &&
    value.length <= 200 &&
    value.trim() === value
    ? value
    : null;
}

/**
 * Stripe's exact error codes for an expired calculation and a duplicate
 * reference are handled by name here but have not been observed against the
 * live API. Both fall back to "rejected", which is also permanent, so an
 * unmatched code degrades safely rather than looping the webhook.
 */
export function classifyTaxTransactionError(
  error: unknown,
): TaxTransactionResultV1 {
  const record = objectRecord(error);
  const code = record?.code;
  const type = typeof record?.type === "string" ? record.type : record?.name;
  const statusCode = record?.statusCode;

  if (code === "tax_calculation_expired") {
    return Object.freeze({
      status: "unrecordable" as const,
      reason: "calculation_expired" as const,
    });
  }
  if (
    code === "tax_transaction_reference_already_exists" ||
    code === "resource_already_exists"
  ) {
    return Object.freeze({ status: "already_recorded" as const });
  }
  if (
    type === "StripeInvalidRequestError" &&
    typeof statusCode === "number" &&
    statusCode >= 400 &&
    statusCode <= 499 &&
    statusCode !== 409
  ) {
    return Object.freeze({
      status: "unrecordable" as const,
      reason: "rejected" as const,
    });
  }
  return Object.freeze({ status: "retryable" as const });
}

export function createStripeTaxTransactionRecorder(input: Readonly<{
  sdk: StripeTaxTransactionSdkClient;
  livemode: boolean;
}>): Readonly<{
  recordTransaction: (request: Readonly<{
    calculationReference: string;
    orderId: string;
  }>) => Promise<TaxTransactionResultV1>;
}> {
  const { sdk, livemode } = input;

  return Object.freeze({
    async recordTransaction(request) {
      let raw: unknown;
      try {
        raw = await sdk.tax.transactions.createFromCalculation(
          {
            calculation: request.calculationReference,
            // Unique across all transactions and reversals. The order id is
            // the only identifier that satisfies that for the lifetime of the
            // order.
            reference: request.orderId,
          },
          {
            idempotencyKey: `tax_transaction:${request.orderId}`,
            maxNetworkRetries: 0,
          },
        );
      } catch (error) {
        return classifyTaxTransactionError(error);
      }

      const record = objectRecord(raw);
      const id = transactionId(record?.id);
      if (
        record === null ||
        id === null ||
        record.reference !== request.orderId ||
        record.type !== "transaction" ||
        record.livemode !== livemode
      ) {
        return Object.freeze({
          status: "unrecordable" as const,
          reason: "rejected" as const,
        });
      }

      return Object.freeze({ status: "recorded" as const, transactionId: id });
    },
  });
}
