import "server-only";

import type {
  QuoteUnavailableReason,
  TaxQuote,
  TaxQuotePort,
  TaxQuoteRequest,
} from "@/commerce/checkout-ports";

/**
 * Server-side Stripe Tax adapter for the checkout quote step.
 *
 * The server stays the authority on money: this port returns a tax amount that
 * the checkout service folds into its own totals and re-sends to Stripe as an
 * explicit "Sales tax" line item. Checkout Sessions are deliberately created
 * WITHOUT `automatic_tax`, so `amount_total` remains the exact sum of the line
 * item amounts the server computed.
 *
 * `reference` carries the Stripe calculation id. Record a tax transaction from
 * it after a verified payment webhook so the sale reaches Stripe Tax reporting;
 * calculations expire 90 days after creation.
 */
export type StripeTaxSdkClient = Readonly<{
  tax: Readonly<{
    calculations: Readonly<{
      create: (params: unknown, options: unknown) => Promise<unknown>;
    }>;
  }>;
}>;

function unavailable(reason: QuoteUnavailableReason): TaxQuote {
  return Object.freeze({ status: "unavailable" as const, reason });
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function calculationId(value: unknown): string | null {
  return typeof value === "string" &&
    value.startsWith("taxcalc_") &&
    value.length <= 200 &&
    value.trim() === value
    ? value
    : null;
}

/** Configuration faults are not retryable; transport and integrity faults are. */
export function classifyStripeTaxError(error: unknown): QuoteUnavailableReason {
  const record = objectRecord(error);
  const code = record?.code;
  const type = typeof record?.type === "string" ? record.type : record?.name;

  if (code === "customer_tax_location_invalid") return "unsupported_destination";
  if (
    type === "StripePermissionError" ||
    type === "StripeAuthenticationError" ||
    code === "tax_not_active"
  ) {
    return "configuration_unavailable";
  }
  return "temporarily_unavailable";
}

function calculationParams(request: TaxQuoteRequest, taxCode: string) {
  return {
    currency: "usd",
    line_items: request.items.map((item) => ({
      reference: item.productId,
      amount: item.netAmountMinor,
      quantity: item.quantity,
      tax_code: taxCode,
      tax_behavior: "exclusive" as const,
    })),
    shipping_cost: {
      amount: request.shippingMinor,
      tax_behavior: "exclusive" as const,
    },
    customer_details: {
      address: {
        line1: request.destination.line1,
        ...(request.destination.line2 === null
          ? {}
          : { line2: request.destination.line2 }),
        city: request.destination.city,
        state: request.destination.stateCode,
        postal_code: request.destination.postalCode,
        country: request.destination.countryCode,
      },
      // Physical goods use destination sourcing. Never let a billing address
      // decide the rate.
      address_source: "shipping" as const,
    },
  };
}

export function createStripeTaxQuotePort(input: Readonly<{
  sdk: StripeTaxSdkClient;
  livemode: boolean;
  taxCode: string;
}>): TaxQuotePort {
  const { sdk, livemode, taxCode } = input;

  return Object.freeze({
    async quoteTax(request: TaxQuoteRequest) {
      let raw: unknown;
      try {
        raw = await sdk.tax.calculations.create(
          calculationParams(request, taxCode),
          { maxNetworkRetries: 0 },
        );
      } catch (error) {
        return unavailable(classifyStripeTaxError(error));
      }

      const record = objectRecord(raw);
      if (record === null) return unavailable("temporarily_unavailable");

      const reference = calculationId(record.id);
      const amountMinor = record.tax_amount_exclusive;
      if (
        reference === null ||
        record.currency !== "usd" ||
        !Number.isSafeInteger(amountMinor) ||
        (amountMinor as number) < 0 ||
        (typeof record.livemode === "boolean" && record.livemode !== livemode)
      ) {
        return unavailable("temporarily_unavailable");
      }

      return Object.freeze({
        status: "ready" as const,
        bindingHash: request.bindingHash,
        reference,
        amountMinor: amountMinor as number,
        currency: "USD" as const,
      });
    },
  });
}
