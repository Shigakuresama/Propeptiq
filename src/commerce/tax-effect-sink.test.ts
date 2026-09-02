import { describe, expect, it, vi } from "vitest";

import { createTaxRoutingEffectSinkV1 } from "@/commerce/tax-effect-sink";
import type { DownstreamEffectSinkV1 } from "@/commerce/downstream-effect-worker";
import type { TaxEffectDispositionV1 } from "@/commerce/tax-recording-lifecycle";

type ExternalDelivery = Parameters<DownstreamEffectSinkV1>[0];

const orderId = "77000000-0000-4000-8000-000000000001";
const paymentEventId = "77000000-0000-4000-8000-000000000002";

function taxDelivery(): ExternalDelivery {
  return Object.freeze({
    effectType: "stripe_tax_transaction" as const,
    payload: Object.freeze({
      schemaVersion: 1 as const,
      orderId,
      verifiedPaymentEventId: paymentEventId,
      calculationReference: "taxcalc_synthetic6d",
    }),
    idempotencyKey: `payment_event:${paymentEventId}:stripe_tax_transaction`,
  });
}

function paymentDelivery(): ExternalDelivery {
  return Object.freeze({
    effectType: "payment_verified" as const,
    payload: Object.freeze({
      schemaVersion: 1 as const,
      orderId,
      verifiedPaymentEventId: paymentEventId,
      reason: "payment_verified" as const,
    }),
    idempotencyKey: `payment_event:${paymentEventId}:payment_verified`,
  });
}

function sinkWith(
  disposition: TaxEffectDispositionV1,
  downstream: ((d: unknown) => Promise<void>) | null = null,
) {
  const handleDelivery = vi.fn(async () => disposition);
  const downstreamSink = downstream === null ? null : vi.fn(downstream);
  const sink = createTaxRoutingEffectSinkV1({
    taxHandler: { effectType: "stripe_tax_transaction", handleDelivery },
    downstreamSink,
  });
  return { sink, handleDelivery, downstreamSink };
}

describe("createTaxRoutingEffectSinkV1", () => {
  it("resolves when the tax effect completes, so the worker marks it processed", async () => {
    const { sink, handleDelivery } = sinkWith({
      disposition: "complete",
      outcome: "recorded",
      transactionId: "tax_synthetic6d",
    });

    await expect(sink(taxDelivery())).resolves.toBeUndefined();
    expect(handleDelivery).toHaveBeenCalledWith(taxDelivery());
  });

  it("resolves for a permanently unrecordable calculation rather than looping it", async () => {
    const { sink } = sinkWith({
      disposition: "complete",
      outcome: "calculation_expired",
      transactionId: null,
    });

    await expect(sink(taxDelivery())).resolves.toBeUndefined();
  });

  it("throws on a retryable tax failure so the worker fails and re-claims it", async () => {
    const { sink } = sinkWith({
      disposition: "retry",
      reason: "tax_transaction_unavailable",
    });

    await expect(sink(taxDelivery())).rejects.toThrow(
      /tax_transaction_unavailable/,
    );
  });

  it("passes a non-tax effect to the downstream sink untouched", async () => {
    const { sink, handleDelivery, downstreamSink } = sinkWith(
      { disposition: "complete", outcome: "recorded", transactionId: null },
      async () => {},
    );

    await expect(sink(paymentDelivery())).resolves.toBeUndefined();
    expect(downstreamSink).toHaveBeenCalledWith(paymentDelivery());
    expect(handleDelivery).not.toHaveBeenCalled();
  });

  it("throws for a non-tax effect when no downstream sink is configured", async () => {
    const { sink, handleDelivery } = sinkWith({
      disposition: "complete",
      outcome: "recorded",
      transactionId: null,
    });

    await expect(sink(paymentDelivery())).rejects.toThrow(
      /no downstream sink/i,
    );
    expect(handleDelivery).not.toHaveBeenCalled();
  });
});
