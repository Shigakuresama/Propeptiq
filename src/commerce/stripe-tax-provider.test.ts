import { describe, expect, it } from "vitest";

import { parseTaxQuoteResult, type TaxQuoteRequest } from "@/commerce/checkout-ports";
import { createStripeTaxQuotePort } from "@/commerce/stripe-tax-provider";

const bindingHash = "a".repeat(64);

const ids = {
  product: "73000000-0000-4000-8000-000000000001",
} as const;

function exactTaxRequest(
  overrides: Partial<TaxQuoteRequest> = {},
): TaxQuoteRequest {
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
    shippingMinor: 700,
    shippingReference: "synthetic-local-shipping",
    shippingService: "Synthetic local test only",
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

function rawCalculation(overrides: Record<string, unknown> = {}) {
  return {
    id: "taxcalc_synthetic6d",
    object: "tax.calculation",
    currency: "usd",
    tax_amount_exclusive: 321,
    tax_amount_inclusive: 0,
    amount_total: 9_021,
    livemode: false,
    ...overrides,
  };
}

function portWith(
  create: (params: unknown, options: unknown) => Promise<unknown>,
  livemode = false,
) {
  return createStripeTaxQuotePort({
    sdk: { tax: { calculations: { create } } },
    livemode,
    taxCode: "txcd_99999999",
  });
}

describe("createStripeTaxQuotePort", () => {
  it("returns a ready quote carrying the calculation id as its reference", async () => {
    const port = portWith(async () => rawCalculation());

    const parsed = parseTaxQuoteResult(await port.quoteTax(exactTaxRequest()), {
      bindingHash,
      currency: "USD",
    });

    expect(parsed).toEqual({
      ok: true,
      value: {
        status: "ready",
        bindingHash,
        reference: "taxcalc_synthetic6d",
        amountMinor: 321,
        currency: "USD",
      },
    });
  });

  it("sources the calculation from the shipping destination, not a billing address", async () => {
    let sent: Record<string, unknown> | null = null;
    const port = portWith(async (params) => {
      sent = params as Record<string, unknown>;
      return rawCalculation();
    });

    await port.quoteTax(exactTaxRequest());

    expect(sent).toMatchObject({
      currency: "usd",
      customer_details: {
        address_source: "shipping",
        address: {
          line1: "100 Test Way",
          city: "Los Angeles",
          state: "CA",
          postal_code: "90001",
          country: "US",
        },
      },
      shipping_cost: { amount: 700, tax_behavior: "exclusive" },
    });
  });

  it("reports an unsupported destination when Stripe rejects the customer location", async () => {
    const port = portWith(async () => {
      throw Object.assign(new Error("invalid location"), {
        type: "StripeInvalidRequestError",
        code: "customer_tax_location_invalid",
        statusCode: 400,
      });
    });

    expect(await port.quoteTax(exactTaxRequest())).toEqual({
      status: "unavailable",
      reason: "unsupported_destination",
    });
  });

  it("reports configuration unavailable when the account cannot calculate tax", async () => {
    const port = portWith(async () => {
      throw Object.assign(new Error("not permitted"), {
        type: "StripePermissionError",
        statusCode: 403,
      });
    });

    expect(await port.quoteTax(exactTaxRequest())).toEqual({
      status: "unavailable",
      reason: "configuration_unavailable",
    });
  });

  it("reports a temporary failure when the calculation call cannot be completed", async () => {
    const port = portWith(async () => {
      throw Object.assign(new Error("socket hang up"), {
        type: "StripeConnectionError",
      });
    });

    expect(await port.quoteTax(exactTaxRequest())).toEqual({
      status: "unavailable",
      reason: "temporarily_unavailable",
    });
  });

  it("refuses a calculation whose livemode contradicts the configured mode", async () => {
    const port = portWith(async () => rawCalculation({ livemode: true }), false);

    expect(await port.quoteTax(exactTaxRequest())).toEqual({
      status: "unavailable",
      reason: "temporarily_unavailable",
    });
  });

  it("refuses a calculation returned in another currency", async () => {
    const port = portWith(async () => rawCalculation({ currency: "eur" }));

    expect(await port.quoteTax(exactTaxRequest())).toEqual({
      status: "unavailable",
      reason: "temporarily_unavailable",
    });
  });

  it("refuses a tax amount that is not a safe non-negative integer", async () => {
    const port = portWith(async () =>
      rawCalculation({ tax_amount_exclusive: 32.1 }),
    );

    expect(await port.quoteTax(exactTaxRequest())).toEqual({
      status: "unavailable",
      reason: "temporarily_unavailable",
    });
  });

  it("refuses a calculation without a usable calculation identifier", async () => {
    const port = portWith(async () => rawCalculation({ id: "cs_not_a_calc" }));

    expect(await port.quoteTax(exactTaxRequest())).toEqual({
      status: "unavailable",
      reason: "temporarily_unavailable",
    });
  });
});
