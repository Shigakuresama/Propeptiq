import "server-only";

import type {
  QuoteUnavailableReason,
  ShippingQuote,
  ShippingQuotePort,
  ShippingQuoteRequest,
} from "@/commerce/checkout-ports";

/**
 * Shipping quotes backed by a Stripe ShippingRate the owner configures.
 *
 * Deliberately reads exactly one configured rate id rather than listing rates
 * and choosing between them: the server must produce the same shipping amount
 * for the same cart every time, and a selection heuristic would make the quote
 * depend on dashboard ordering. Nothing here invents a rate or a delivery
 * promise — both come from the owner's own Stripe account.
 *
 * Fail closed: any rate that is inactive, mispriced, or not a fixed amount
 * yields "unavailable", which blocks checkout rather than guessing a price.
 */
export type StripeShippingSdkClient = Readonly<{
  shippingRates: Readonly<{
    retrieve: (
      id: string,
      params: unknown,
      options: unknown,
    ) => Promise<unknown>;
  }>;
}>;

function unavailable(reason: QuoteUnavailableReason): ShippingQuote {
  return Object.freeze({ status: "unavailable" as const, reason });
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function boundedLabel(value: unknown): string | null {
  return typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= 200 &&
    !/[\u0000-\u001f\u007f]/u.test(value)
    ? value
    : null;
}

/** A missing or deactivated rate is an owner configuration fault, not a blip. */
export function classifyStripeShippingError(
  error: unknown,
): QuoteUnavailableReason {
  const record = objectRecord(error);
  const type = typeof record?.type === "string" ? record.type : record?.name;
  const code = record?.code;

  if (
    code === "resource_missing" ||
    type === "StripePermissionError" ||
    type === "StripeAuthenticationError"
  ) {
    return "configuration_unavailable";
  }
  return "temporarily_unavailable";
}

export function createStripeShippingQuotePort(input: Readonly<{
  sdk: StripeShippingSdkClient;
  livemode: boolean;
  shippingRateId: string;
}>): ShippingQuotePort {
  const { sdk, livemode, shippingRateId } = input;

  return Object.freeze({
    async quoteShipping(request: ShippingQuoteRequest) {
      // The catalog ships domestically only; refuse before spending a call.
      if (request.destination.countryCode !== "US") {
        return unavailable("unsupported_destination");
      }

      let raw: unknown;
      try {
        raw = await sdk.shippingRates.retrieve(shippingRateId, undefined, {
          maxNetworkRetries: 0,
        });
      } catch (error) {
        return unavailable(classifyStripeShippingError(error));
      }

      const record = objectRecord(raw);
      if (record === null) return unavailable("temporarily_unavailable");
      if (record.active === false) {
        return unavailable("configuration_unavailable");
      }

      const fixedAmount = objectRecord(record.fixed_amount);
      const service = boundedLabel(record.display_name);
      const amountMinor = fixedAmount?.amount;
      if (
        record.id !== shippingRateId ||
        record.type !== "fixed_amount" ||
        record.active !== true ||
        record.livemode !== livemode ||
        fixedAmount === null ||
        fixedAmount.currency !== "usd" ||
        service === null ||
        !Number.isSafeInteger(amountMinor) ||
        (amountMinor as number) < 0
      ) {
        return unavailable("temporarily_unavailable");
      }

      return Object.freeze({
        status: "ready" as const,
        bindingHash: request.bindingHash,
        reference: shippingRateId,
        service,
        amountMinor: amountMinor as number,
        currency: "USD" as const,
      });
    },
  });
}
