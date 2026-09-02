import "server-only";

import { isCanonicalUuid } from "@/commerce/checkout-identity";
import type { TaxTransactionResultV1 } from "@/commerce/stripe-tax-transaction";

/**
 * Drains `stripe_tax_transaction` effects from the downstream effect queue.
 *
 * Tax is computed server-side and sent to Checkout as a plain line item, so
 * Stripe never sees the sale as taxed. `provider-event-repository` enqueues one
 * of these effects in the same transaction that verifies payment; this handler
 * turns it into a recorded Stripe Tax transaction.
 *
 * Disposition maps onto the effect repository deliberately:
 * `claimEffect` re-claims anything that is not `processed`, so only "complete"
 * is terminal. A permanently unrecordable calculation therefore *completes* —
 * failing it would loop forever on something that can never succeed — while a
 * transient fault asks for a retry and is re-claimed on a later pass.
 */
export const STRIPE_TAX_EFFECT_TYPE = "stripe_tax_transaction" as const;

export type TaxEffectDispositionV1 =
  | Readonly<{
      disposition: "complete";
      outcome:
        | "recorded"
        | "already_recorded"
        | "calculation_expired"
        | "rejected";
      transactionId: string | null;
    }>
  | Readonly<{ disposition: "retry"; reason: string }>;

export type TaxTransactionRecorderV1 = Readonly<{
  recordTransaction: (request: Readonly<{
    calculationReference: string;
    orderId: string;
  }>) => Promise<TaxTransactionResultV1>;
}>;

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function rejected(): TaxEffectDispositionV1 {
  return Object.freeze({
    disposition: "complete" as const,
    outcome: "rejected" as const,
    transactionId: null,
  });
}

type TaxEffectPayloadV1 = Readonly<{
  orderId: string;
  calculationReference: string;
}>;

export function parseTaxEffectPayloadV1(
  value: unknown,
): TaxEffectPayloadV1 | null {
  const record = objectRecord(value);
  if (record === null || record.schemaVersion !== 1) return null;
  const { orderId, calculationReference } = record;
  if (
    typeof orderId !== "string" ||
    !isCanonicalUuid(orderId) ||
    typeof calculationReference !== "string" ||
    calculationReference.trim() !== calculationReference ||
    calculationReference.length === 0 ||
    calculationReference.length > 200
  ) {
    return null;
  }
  return Object.freeze({ orderId, calculationReference });
}

export function createTaxEffectHandlerV1(dependencies: Readonly<{
  recorder: TaxTransactionRecorderV1;
}>): Readonly<{
  effectType: typeof STRIPE_TAX_EFFECT_TYPE;
  handleDelivery: (delivery: Readonly<{
    effectType: string;
    payload: unknown;
    idempotencyKey: string;
  }>) => Promise<TaxEffectDispositionV1>;
}> {
  return Object.freeze({
    effectType: STRIPE_TAX_EFFECT_TYPE,
    async handleDelivery(delivery) {
      if (delivery.effectType !== STRIPE_TAX_EFFECT_TYPE) return rejected();
      const payload = parseTaxEffectPayloadV1(delivery.payload);
      // A malformed payload can never become well-formed on a later attempt.
      if (payload === null) return rejected();

      const result = await dependencies.recorder.recordTransaction({
        orderId: payload.orderId,
        calculationReference: payload.calculationReference,
      });

      if (result.status === "retryable") {
        return Object.freeze({
          disposition: "retry" as const,
          reason: "tax_transaction_unavailable",
        });
      }
      if (result.status === "recorded") {
        return Object.freeze({
          disposition: "complete" as const,
          outcome: "recorded" as const,
          transactionId: result.transactionId,
        });
      }
      if (result.status === "already_recorded") {
        return Object.freeze({
          disposition: "complete" as const,
          outcome: "already_recorded" as const,
          transactionId: null,
        });
      }
      return Object.freeze({
        disposition: "complete" as const,
        outcome: result.reason,
        transactionId: null,
      });
    },
  });
}
