import "server-only";

import type {
  AllowlistedDownstreamEffectV1,
  DownstreamEffectSinkV1,
} from "@/commerce/downstream-effect-worker";
import {
  STRIPE_TAX_EFFECT_TYPE,
  type TaxEffectDispositionV1,
} from "@/commerce/tax-recording-lifecycle";

type ExternalDelivery = Parameters<DownstreamEffectSinkV1>[0];

export type TaxEffectHandlerV1 = Readonly<{
  effectType: typeof STRIPE_TAX_EFFECT_TYPE;
  handleDelivery: (delivery: Readonly<{
    effectType: string;
    payload: unknown;
    idempotencyKey: string;
  }>) => Promise<TaxEffectDispositionV1>;
}>;

/**
 * Adapts the tax effect handler onto the worker's sink contract.
 *
 * The worker decides an effect's fate from whether the sink settles: resolving
 * completes the claim (terminal), throwing fails it (and `claimEffect` re-claims
 * anything not `processed`, so failing *is* the retry path). This adapter is
 * where the handler's disposition is translated into that convention.
 *
 * Every other effect type is delegated untouched. Passing `downstreamSink: null`
 * means only tax recording is configured; any other effect then throws and is
 * retried rather than being silently marked processed by a sink that ignored it.
 */
export function createTaxRoutingEffectSinkV1(dependencies: Readonly<{
  taxHandler: TaxEffectHandlerV1;
  downstreamSink: DownstreamEffectSinkV1 | null;
}>): DownstreamEffectSinkV1 {
  return async (delivery: ExternalDelivery): Promise<void> => {
    if (delivery.effectType !== STRIPE_TAX_EFFECT_TYPE) {
      if (dependencies.downstreamSink === null) {
        throw new Error(
          `Downstream effect "${delivery.effectType}" has no downstream sink configured`,
        );
      }
      await dependencies.downstreamSink(delivery);
      return;
    }

    const disposition = await dependencies.taxHandler.handleDelivery(
      delivery as AllowlistedDownstreamEffectV1,
    );
    if (disposition.disposition === "retry") {
      throw new Error(disposition.reason);
    }
    // "complete" for every terminal outcome, including a permanently
    // unrecordable calculation: resolving is what stops the queue retrying it.
  };
}
