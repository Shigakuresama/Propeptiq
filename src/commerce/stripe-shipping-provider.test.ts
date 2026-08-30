import { describe, expect, it, vi } from "vitest";

import {
  parseShippingQuoteResult,
  type ShippingQuoteRequest,
} from "@/commerce/checkout-ports";
import { createStripeShippingQuotePort } from "@/commerce/stripe-shipping-provider";

const bindingHash = "b".repeat(64);
const shippingRateId = "shr_synthetic6d";

const ids = { product: "78000000-0000-4000-8000-000000000001" } as const;

function exactShippingRequest(
  overrides: Partial<ShippingQuoteRequest> = {},
): ShippingQuoteRequest {
  return Object.freeze({
    schemaVersion: 1 as const,
    bindingHash,
    items: Object.freeze([
      Object.freeze({
        productId: ids.product,
        quantity: 2,
        netAmountMinor: 8_000,
      }),
    ]),
    merchandiseTotalMinor: 8_000,
    currency: "USD" as const,
    destination: Object.freeze({
      recipientName: "Synthetic Researcher",
      line1: "100 Test Way",
      line2: null,
      city: "Los Angeles",
      stateCode: "CA",
      postalCode: "90001",
      countryCode: "US" as const,
    }),
    ...overrides,
  });
}

function rawRate(overrides: Record<string, unknown> = {}) {
  return {
    id: shippingRateId,
    object: "shipping_rate",
    active: true,
    type: "fixed_amount",
    display_name: "Ground",
    fixed_amount: { amount: 700, currency: "usd" },
    livemode: false,
    ...overrides,
  };
}

function portWith(
  retrieve: (id: string, params: unknown, options: unknown) => Promise<unknown>,
  livemode = false,
) {
  return createStripeShippingQuotePort({
    sdk: { shippingRates: { retrieve } },
    livemode,
    shippingRateId,
  });
}

function stripeError(fields: Record<string, unknown>) {
  return Object.assign(new Error("stripe failure"), fields);
}

describe("createStripeShippingQuotePort", () => {
  it("quotes the owner-configured shipping rate", async () => {
    const port = portWith(async () => rawRate());

    const parsed = parseShippingQuoteResult(
      await port.quoteShipping(exactShippingRequest()),
      { bindingHash, currency: "USD" },
    );

    expect(parsed).toEqual({
      ok: true,
      value: {
        status: "ready",
        bindingHash,
        reference: shippingRateId,
        service: "Ground",
        amountMinor: 700,
        currency: "USD",
      },
    });
  });

  it("retrieves exactly the configured rate and never guesses one", async () => {
    const retrieve = vi.fn(async () => rawRate());
    const port = portWith(retrieve);

    await port.quoteShipping(exactShippingRequest());

    expect(retrieve).toHaveBeenCalledWith(shippingRateId, undefined, {
      maxNetworkRetries: 0,
    });
  });

  it("refuses to ship outside the supported country", async () => {
    const retrieve = vi.fn(async () => rawRate());
    const port = portWith(retrieve);

    expect(
      await port.quoteShipping(
        exactShippingRequest({
          destination: {
            ...exactShippingRequest().destination,
            countryCode: "CA" as never,
          },
        }),
      ),
    ).toEqual({ status: "unavailable", reason: "unsupported_destination" });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("reports configuration unavailable for a deactivated rate", async () => {
    const port = portWith(async () => rawRate({ active: false }));

    expect(await port.quoteShipping(exactShippingRequest())).toEqual({
      status: "unavailable",
      reason: "configuration_unavailable",
    });
  });

  it("reports configuration unavailable when the rate does not exist", async () => {
    const port = portWith(async () => {
      throw stripeError({
        type: "StripeInvalidRequestError",
        code: "resource_missing",
        statusCode: 404,
      });
    });

    expect(await port.quoteShipping(exactShippingRequest())).toEqual({
      status: "unavailable",
      reason: "configuration_unavailable",
    });
  });

  it("reports a temporary failure when the rate cannot be fetched", async () => {
    const port = portWith(async () => {
      throw stripeError({ type: "StripeConnectionError" });
    });

    expect(await port.quoteShipping(exactShippingRequest())).toEqual({
      status: "unavailable",
      reason: "temporarily_unavailable",
    });
  });

  it.each([
    ["a rate echoing another id", rawRate({ id: "shr_other" })],
    ["a non fixed-amount rate", rawRate({ type: "calculated" })],
    ["a rate priced in another currency", rawRate({ fixed_amount: { amount: 700, currency: "eur" } })],
    ["a fractional amount", rawRate({ fixed_amount: { amount: 7.5, currency: "usd" } })],
    ["a blank display name", rawRate({ display_name: "  " })],
    ["a missing display name", rawRate({ display_name: null })],
  ])("refuses %s", async (_label, raw) => {
    const port = portWith(async () => raw);

    expect(await port.quoteShipping(exactShippingRequest())).toEqual({
      status: "unavailable",
      reason: "temporarily_unavailable",
    });
  });

  it.each([
    "Ground Shipping",
    "Next-Day Air",
    "2-Day (signature required)",
  ])("accepts the ordinary service name %j", async (displayName) => {
    const port = portWith(async () => rawRate({ display_name: displayName }));

    const parsed = parseShippingQuoteResult(
      await port.quoteShipping(exactShippingRequest()),
      { bindingHash, currency: "USD" },
    );

    expect(parsed).toEqual({
      ok: true,
      value: {
        status: "ready",
        bindingHash,
        reference: shippingRateId,
        service: displayName,
        amountMinor: 700,
        currency: "USD",
      },
    });
  });

  it("refuses a service name carrying a control character", async () => {
    const port = portWith(async () => rawRate({ display_name: "Ground\u0007" }));

    expect(await port.quoteShipping(exactShippingRequest())).toEqual({
      status: "unavailable",
      reason: "temporarily_unavailable",
    });
  });

  it("refuses a rate returned in the wrong livemode", async () => {
    const port = portWith(async () => rawRate({ livemode: true }), false);

    expect(await port.quoteShipping(exactShippingRequest())).toEqual({
      status: "unavailable",
      reason: "temporarily_unavailable",
    });
  });
});
