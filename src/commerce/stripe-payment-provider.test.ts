import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import {
  buildProviderRefundRequestV1,
  buildStripeCheckoutRequestV1,
  buildStripeCheckoutRequestV2,
  createStripeProviderBindingSnapshotV2,
} from "@/commerce/provider-contracts";
import {
  STRIPE_API_VERSION,
  classifyStripeProviderError,
  createRuntimeStripePaymentProvider,
  createStripeBindingVerifier,
  createStripePaymentProvider,
  type StripeSdkClient,
} from "@/commerce/stripe-payment-provider";

const ids = {
  order: "72000000-0000-4000-8000-000000000001",
  attempt: "72000000-0000-4000-8000-000000000002",
  product: "72000000-0000-4000-8000-000000000003",
  refund: "72000000-0000-4000-8000-000000000004",
  variant: "72000000-0000-4000-8000-000000000005",
  priceBook: "72000000-0000-4000-8000-000000000006",
} as const;

const context = Object.freeze({
  provider: "stripe" as const,
  livemode: false,
  scope: "stripe:acct_synthetic6d",
});

function exactCheckoutRequest() {
  const built = buildStripeCheckoutRequestV1({
    provider: "stripe",
    providerRequestSchemaVersion: 1,
    orderId: ids.order,
    attemptId: ids.attempt,
    providerCustomerEmail: "synthetic.buyer@example.test",
    providerOrigin: "https://commerce.synthetic.example",
    providerExpiresAt: "2026-08-25T13:00:00.000Z",
    currency: "USD",
    destination: {
      recipientName: "Synthetic Researcher",
      line1: "100 Test Way",
      line2: null,
      city: "Los Angeles",
      stateCode: "CA",
      postalCode: "90001",
      countryCode: "US",
    },
    lines: [
      {
        productId: ids.product,
        productName: "Synthetic Alpha",
        packageForm: "sealed vial",
        purchasedQuantity: 2,
        postDiscountTotalMinor: 8_000,
      },
    ],
    shippingMinor: 700,
    taxMinor: 600,
    totalMinor: 9_300,
  });
  if (!built.ok) throw new Error("invalid synthetic checkout fixture");
  return built.value;
}

function exactRefundRequest() {
  const built = buildProviderRefundRequestV1({
    schemaVersion: 1,
    provider: "stripe",
    refundId: ids.refund,
    orderId: ids.order,
    requestedAmountMinor: 1_250,
    currency: "USD",
    paymentIntentId: "pi_synthetic6d",
    chargeId: null,
    providerIdempotencyKey: `refund_request:${ids.refund}`,
  });
  if (!built.ok) throw new Error("invalid synthetic refund fixture");
  return built.value;
}

function exactCheckoutRequestV2() {
  const built = buildStripeCheckoutRequestV2({
    provider: "stripe",
    providerRequestSchemaVersion: 2,
    orderId: ids.order,
    attemptId: ids.attempt,
    providerCustomerEmail: "synthetic.buyer@example.test",
    providerOrigin: "https://commerce.synthetic.example",
    providerExpiresAt: "2026-08-25T13:00:00.000Z",
    currency: "USD",
    destination: {
      recipientName: "Synthetic Researcher",
      line1: "100 Test Way",
      line2: null,
      city: "Los Angeles",
      stateCode: "CA",
      postalCode: "90001",
      countryCode: "US",
    },
    lines: syntheticBindingSnapshot().lines,
    shippingMinor: 700,
    taxMinor: 600,
    totalMinor: 4_976,
  });
  if (!built.ok) throw new Error("invalid synthetic V2 checkout fixture");
  return built.value;
}

function rawSession(overrides: Record<string, unknown> = {}) {
  const request = exactCheckoutRequest();
  return {
    id: "cs_test_synthetic6d",
    url: "https://checkout.stripe.com/c/pay/cs_test_synthetic6d",
    client_reference_id: ids.order,
    metadata: { orderId: ids.order, attemptId: ids.attempt },
    payment_intent: { id: "pi_synthetic6d", object: "payment_intent", client_secret: "must-not-retain" },
    amount_total: 9_300,
    currency: "usd",
    mode: "payment",
    ui_mode: "hosted_page",
    status: "open",
    payment_status: "unpaid",
    livemode: false,
    customer_email: "synthetic.buyer@example.test",
    expires_at: request.expires_at,
    customer_details: { email: "must-not-retain@example.test" },
    ...overrides,
  };
}

function rawRefund(overrides: Record<string, unknown> = {}) {
  return {
    id: "re_synthetic6d",
    payment_intent: { id: "pi_synthetic6d", object: "payment_intent", client_secret: "must-not-retain" },
    charge: { id: "ch_synthetic6d", object: "charge", billing_details: "must-not-retain" },
    amount: 1_250,
    currency: "usd",
    status: "pending",
    livemode: false,
    metadata: { orderId: ids.order, refundId: ids.refund },
    failure_reason: "must-not-retain",
    ...overrides,
  };
}

function setup() {
  const sdk = {
    checkout: {
      sessions: {
        create: vi.fn<StripeSdkClient["checkout"]["sessions"]["create"]>(
          async () => rawSession(),
        ),
        retrieve: vi.fn<StripeSdkClient["checkout"]["sessions"]["retrieve"]>(
          async () => rawSession(),
        ),
      },
    },
    refunds: {
      create: vi.fn<StripeSdkClient["refunds"]["create"]>(async () => rawRefund()),
      retrieve: vi.fn<StripeSdkClient["refunds"]["retrieve"]>(async () => rawRefund()),
    },
  };
  return { sdk, provider: createStripePaymentProvider({ sdk, context }) };
}

function syntheticBindingSnapshot() {
  const result = createStripeProviderBindingSnapshotV2([{
    variantId: ids.variant,
    productId: ids.product,
    sku: "SYNTH-5MG",
    productName: "Synthetic Alpha",
    variantLabel: "5 mg",
    requestedQuantity: 2,
    netLineMinor: 3_676,
    baseUnitMinor: 2_000,
    currency: "USD",
    priceBookId: ids.priceBook,
    priceVersion: 3,
    stripeProductId: "prod_synthetic_alpha",
    stripePriceId: "price_synthetic_alpha_5mg",
  }]);
  if (!result.ok) throw new Error("invalid synthetic binding fixture");
  return result.value;
}

function rawAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: "acct_synthetic6d",
    object: "account",
    business_profile: { name: "must-not-retain" },
    ...overrides,
  };
}

function rawPrice(overrides: Record<string, unknown> = {}) {
  return {
    id: "price_synthetic_alpha_5mg",
    object: "price",
    active: true,
    billing_scheme: "per_unit",
    currency: "usd",
    custom_unit_amount: null,
    livemode: false,
    recurring: null,
    tiers_mode: null,
    transform_quantity: null,
    type: "one_time",
    unit_amount: 2_000,
    unit_amount_decimal: Stripe.Decimal.from("2000"),
    product: {
      id: "prod_synthetic_alpha",
      object: "product",
      active: true,
      livemode: false,
      name: "must-not-retain",
    },
    ...overrides,
  };
}

function setupBindingVerifier() {
  const sdk = {
    accounts: {
      retrieveCurrent: vi.fn<() => Promise<unknown>>(async () => rawAccount()),
    },
    prices: {
      retrieve: vi.fn<
        (id: string, params: Readonly<{ expand: readonly ["product"] }>) => Promise<unknown>
      >(async () => rawPrice()),
    },
  };
  return {
    sdk,
    verifier: createStripeBindingVerifier({ sdk, context }),
  };
}

describe("Stripe owner-account binding verifier test double", () => {
  it("is lazy and verifies the current account plus the expanded configured Price/Product", async () => {
    const { sdk, verifier } = setupBindingVerifier();
    expect(sdk.accounts.retrieveCurrent).not.toHaveBeenCalled();
    expect(sdk.prices.retrieve).not.toHaveBeenCalled();
    await expect(verifier.verifyBindings(syntheticBindingSnapshot())).resolves.toEqual({
      status: "verified",
    });
    expect(sdk.accounts.retrieveCurrent).toHaveBeenCalledWith();
    expect(sdk.prices.retrieve).toHaveBeenCalledWith(
      "price_synthetic_alpha_5mg",
      { expand: ["product"] },
    );
  });

  it("fails closed for every account, Price, amount, mode, currency, and Product mismatch", async () => {
    const invalidPrices = [
      null,
      {},
      rawPrice({ id: "price_wrong" }),
      rawPrice({ active: false }),
      rawPrice({ type: "recurring", recurring: { interval: "month" } }),
      rawPrice({ billing_scheme: "tiered" }),
      rawPrice({ custom_unit_amount: { enabled: true } }),
      rawPrice({ unit_amount: null, unit_amount_decimal: "2000.5" }),
      rawPrice({ unit_amount: 0 }),
      rawPrice({ unit_amount: -1 }),
      rawPrice({ unit_amount: Number.MAX_SAFE_INTEGER + 1 }),
      rawPrice({ unit_amount: 2_001 }),
      rawPrice({ currency: "eur" }),
      rawPrice({ livemode: true }),
      rawPrice({ product: "prod_synthetic_alpha" }),
      rawPrice({ product: { id: "prod_wrong", object: "product", active: true, livemode: false } }),
      rawPrice({ product: { id: "prod_synthetic_alpha", object: "product", active: false, livemode: false } }),
      rawPrice({ product: { id: "prod_synthetic_alpha", object: "product", deleted: true } }),
      rawPrice({ product: { id: "prod_synthetic_alpha", object: "future_product", active: true, livemode: false } }),
      rawPrice({ product: { id: "prod_synthetic_alpha", object: "product", active: true, livemode: true } }),
      rawPrice({ object: "future_price" }),
      rawPrice({ type: "future_type" }),
    ];
    for (const price of invalidPrices) {
      const { sdk, verifier } = setupBindingVerifier();
      sdk.prices.retrieve.mockResolvedValueOnce(price);
      const result = await verifier.verifyBindings(syntheticBindingSnapshot());
      expect(result).toEqual({ status: "unavailable" });
      expect(JSON.stringify(result)).not.toContain("must-not-retain");
    }

    for (const account of [
      null,
      {},
      rawAccount({ id: "acct_wrong" }),
      rawAccount({ object: "future_account" }),
    ]) {
      const { sdk, verifier } = setupBindingVerifier();
      sdk.accounts.retrieveCurrent.mockResolvedValueOnce(account);
      await expect(verifier.verifyBindings(syntheticBindingSnapshot())).resolves.toEqual({
        status: "unavailable",
      });
      expect(sdk.prices.retrieve).not.toHaveBeenCalled();
    }
  });

  it("rejects a Price that transforms quantity before billing", async () => {
    const { sdk, verifier } = setupBindingVerifier();
    sdk.prices.retrieve.mockResolvedValueOnce(rawPrice({
      transform_quantity: { divide_by: 2, round: "up" },
    }));

    await expect(verifier.verifyBindings(syntheticBindingSnapshot())).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("rejects a fractional decimal amount even when the integer amount matches", async () => {
    const { sdk, verifier } = setupBindingVerifier();
    sdk.prices.retrieve.mockResolvedValueOnce(rawPrice({
      unit_amount_decimal: Stripe.Decimal.from("2000.5"),
    }));

    await expect(verifier.verifyBindings(syntheticBindingSnapshot())).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("rejects a whole decimal amount that differs from the integer amount", async () => {
    const { sdk, verifier } = setupBindingVerifier();
    sdk.prices.retrieve.mockResolvedValueOnce(rawPrice({
      unit_amount_decimal: Stripe.Decimal.from("2001"),
    }));

    await expect(verifier.verifyBindings(syntheticBindingSnapshot())).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("accepts absent, null, or exactly equal whole-minor decimal amounts", async () => {
    const absentDecimal = rawPrice();
    Reflect.deleteProperty(absentDecimal, "unit_amount_decimal");
    const acceptedPrices = [
      absentDecimal,
      rawPrice({ unit_amount_decimal: null }),
      rawPrice({ unit_amount_decimal: Stripe.Decimal.from("2000.000000000000") }),
    ];

    for (const price of acceptedPrices) {
      const { sdk, verifier } = setupBindingVerifier();
      sdk.prices.retrieve.mockResolvedValueOnce(price);
      await expect(verifier.verifyBindings(syntheticBindingSnapshot())).resolves.toEqual({
        status: "verified",
      });
    }
  });

  it("converts verifier transport and SDK failures to one safe result without retaining raw errors", async () => {
    for (const failingMethod of ["account", "price"] as const) {
      const { sdk, verifier } = setupBindingVerifier();
      const rawError = {
        type: "StripeConnectionError",
        message: "private provider body must-not-retain",
      };
      if (failingMethod === "account") {
        sdk.accounts.retrieveCurrent.mockRejectedValueOnce(rawError);
      } else {
        sdk.prices.retrieve.mockRejectedValueOnce(rawError);
      }
      const result = await verifier.verifyBindings(syntheticBindingSnapshot());
      expect(result).toEqual({ status: "unavailable" });
      expect(JSON.stringify(result)).not.toContain("must-not-retain");
    }
  });
});

describe("Stripe Checkout adapter", () => {
  it("pins the bundled API version in the injectable runtime factory", () => {
    const observed: unknown[] = [];
    class SyntheticStripeConstructor {
      checkout = { sessions: { create: vi.fn(), retrieve: vi.fn() } };
      refunds = { create: vi.fn(), retrieve: vi.fn() };
      constructor(secret: string, options: unknown) {
        observed.push({ secret, options });
      }
    }
    createRuntimeStripePaymentProvider({
      secretKey: "sk_test_synthetic_not_a_real_secret",
      accountId: "acct_synthetic6d",
      livemode: false,
      StripeConstructor: SyntheticStripeConstructor,
    });
    expect(STRIPE_API_VERSION).toBe("2026-07-29.dahlia");
    expect(observed).toEqual([
      {
        secret: "sk_test_synthetic_not_a_real_secret",
        options: { apiVersion: "2026-07-29.dahlia", maxNetworkRetries: 0 },
      },
    ]);
  });

  it("creates with the exact request and disables SDK retries", async () => {
    const { sdk, provider } = setup();
    const request = exactCheckoutRequest();
    const result = await provider.createCheckoutSession(
      request,
      `checkout_attempt:${ids.attempt}`,
    );
    expect(sdk.checkout.sessions.create).toHaveBeenCalledWith(request, {
      idempotencyKey: `checkout_attempt:${ids.attempt}`,
      maxNetworkRetries: 0,
    });
    expect(result).toEqual({
      status: "open",
      session: {
        provider: "stripe",
        providerSessionId: "cs_test_synthetic6d",
        hostedUrl: "https://checkout.stripe.com/c/pay/cs_test_synthetic6d",
        clientReferenceId: ids.order,
        metadata: { orderId: ids.order, attemptId: ids.attempt },
        paymentIntentId: "pi_synthetic6d",
        amountTotal: 9_300,
        currency: "usd",
        mode: "payment",
        uiMode: "hosted_page",
        status: "open",
        paymentStatus: "unpaid",
        livemode: false,
        customerEmail: "synthetic.buyer@example.test",
        expiresAt: 1_787_662_800,
      },
    });
    expect(JSON.stringify(result)).not.toContain("must-not-retain");
  });

  it("forwards V2 inline merchandise and synthetic components without discounts or line metadata", async () => {
    const { sdk, provider } = setup();
    const request = exactCheckoutRequestV2();
    sdk.checkout.sessions.create.mockResolvedValueOnce(rawSession({
      amount_total: 4_976,
    }));

    await expect(provider.createCheckoutSession(
      request,
      `checkout_attempt:${ids.attempt}`,
    )).resolves.toMatchObject({ status: "open" });

    expect(sdk.checkout.sessions.create).toHaveBeenCalledWith(request, {
      idempotencyKey: `checkout_attempt:${ids.attempt}`,
      maxNetworkRetries: 0,
    });
    const sent = sdk.checkout.sessions.create.mock.calls[0]![0];
    expect(sent).toMatchObject({
      allow_promotion_codes: false,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: 3_676,
            product: "prod_synthetic_alpha",
          },
        },
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: 700,
            product_data: { name: "Shipping" },
          },
        },
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: 600,
            product_data: { name: "Sales tax" },
          },
        },
      ],
    });
    expect(sent).not.toHaveProperty("discounts");
    expect(sent).not.toHaveProperty("automatic_tax");
    for (const line of sent.line_items ?? []) {
      expect(line).not.toHaveProperty("metadata");
      expect(line).not.toHaveProperty("price");
      expect(line).not.toHaveProperty("adjustable_quantity");
    }
  });

  it("retrieves only a known ID while receiving the complete immutable expectation", async () => {
    const { sdk, provider } = setup();
    const request = exactCheckoutRequest();
    const result = await provider.retrieveCheckoutSession({
      knownProviderSessionId: "cs_test_synthetic6d",
      expectedRequest: request,
      expectedProviderContext: context,
    });
    expect(sdk.checkout.sessions.retrieve).toHaveBeenCalledWith(
      "cs_test_synthetic6d",
      undefined,
      { maxNetworkRetries: 0 },
    );
    expect(result.status).toBe("open");
  });

  it("normalizes string, expanded-object, and null expandable references", async () => {
    const { sdk, provider } = setup();
    sdk.checkout.sessions.create
      .mockResolvedValueOnce(rawSession({ payment_intent: "pi_string6d" }))
      .mockResolvedValueOnce(rawSession({ payment_intent: { id: "pi_object6d" } }))
      .mockResolvedValueOnce(rawSession({ payment_intent: null }));
    const request = exactCheckoutRequest();
    const results = await Promise.all([
      provider.createCheckoutSession(request, `checkout_attempt:${ids.attempt}`),
      provider.createCheckoutSession(request, `checkout_attempt:${ids.attempt}`),
      provider.createCheckoutSession(request, `checkout_attempt:${ids.attempt}`),
    ]);
    expect(results.map((result) => result.status === "open" ? result.session.paymentIntentId : "wrong")).toEqual([
      "pi_string6d",
      "pi_object6d",
      null,
    ]);
  });

  it("returns pending-event for matching complete responses and requires retrieval before expiry release", async () => {
    const { sdk, provider } = setup();
    sdk.checkout.sessions.create
      .mockResolvedValueOnce(rawSession({ status: "complete", payment_status: "paid" }))
      .mockResolvedValueOnce(rawSession({ status: "expired", url: null }));
    sdk.checkout.sessions.retrieve.mockResolvedValueOnce(
      rawSession({ status: "expired", url: null }),
    );
    const request = exactCheckoutRequest();
    await expect(
      provider.createCheckoutSession(request, `checkout_attempt:${ids.attempt}`),
    ).resolves.toMatchObject({ status: "provider_pending" });
    await expect(
      provider.createCheckoutSession(request, `checkout_attempt:${ids.attempt}`),
    ).resolves.toEqual({
      status: "provider_unknown",
      knownProviderSessionId: "cs_test_synthetic6d",
      evidenceCode: "create_requires_retrieve",
    });
    await expect(
      provider.retrieveCheckoutSession({
        knownProviderSessionId: "cs_test_synthetic6d",
        expectedRequest: request,
        expectedProviderContext: context,
      }),
    ).resolves.toMatchObject({ status: "verified_expired" });

    sdk.checkout.sessions.retrieve.mockResolvedValueOnce(
      rawSession({ status: "expired", payment_status: "paid", url: null }),
    );
    await expect(
      provider.retrieveCheckoutSession({
        knownProviderSessionId: "cs_test_synthetic6d",
        expectedRequest: request,
        expectedProviderContext: context,
      }),
    ).resolves.toMatchObject({ status: "provider_unknown" });
  });

  it("rejects untrusted URLs, mismatches, future enums, and mode/scope drift restrictively", async () => {
    const { sdk, provider } = setup();
    const request = exactCheckoutRequest();
    for (const raw of [
      rawSession({ url: "https://user:secret@checkout.stripe.com/pay/synthetic" }),
      rawSession({ url: "https://checkout.stripe.com.attacker.invalid/pay/synthetic" }),
      rawSession({ amount_total: 9_301 }),
      rawSession({ metadata: { orderId: ids.order, attemptId: ids.attempt, extra: "unsafe" } }),
      rawSession({ status: "future_status" }),
      rawSession({ payment_status: "future_status" }),
      rawSession({ payment_intent: { object: "payment_intent" } }),
    ]) {
      sdk.checkout.sessions.retrieve.mockResolvedValueOnce(raw);
      const result = await provider.retrieveCheckoutSession({
        knownProviderSessionId: "cs_test_synthetic6d",
        expectedRequest: request,
        expectedProviderContext: context,
      });
      expect(result).toMatchObject({ status: "provider_unknown" });
      expect(JSON.stringify(result)).not.toContain("attacker.invalid");
    }
    await expect(
      provider.retrieveCheckoutSession({
        knownProviderSessionId: "cs_test_synthetic6d",
        expectedRequest: request,
        expectedProviderContext: { ...context, scope: "stripe:acct_changed6d" },
      }),
    ).resolves.toEqual({
      status: "provider_unknown",
      knownProviderSessionId: "cs_test_synthetic6d",
      evidenceCode: "provider_context_mismatch",
    });
  });
});

describe("Stripe error and refund adaptation", () => {
  it("classifies only an unambiguous completed create 4xx as definite", () => {
    const cases = [
      [{ type: "StripeInvalidRequestError", statusCode: 400 }, "definite_rejection"],
      [{ type: "StripeIdempotencyError", statusCode: 400 }, "provider_unknown"],
      [{ statusCode: 409 }, "provider_unknown"],
      [{ statusCode: 500 }, "provider_unknown"],
      [{ type: "StripeConnectionError", code: "ETIMEDOUT" }, "provider_unknown"],
      [{ type: "StripeFutureError", statusCode: 400 }, "provider_unknown"],
      [{ type: "StripeAPIError", statusCode: 400 }, "provider_unknown"],
      [{ code: "ECONNRESET" }, "provider_unknown"],
      [new Error("synthetic unknown with private body"), "provider_unknown"],
    ] as const;
    for (const [error, status] of cases) {
      expect(classifyStripeProviderError(error, "create_checkout")).toMatchObject({ status });
    }
    expect(
      classifyStripeProviderError({ statusCode: 404 }, "retrieve_checkout"),
    ).toMatchObject({ status: "provider_unknown" });
  });

  it("creates and retrieves refunds with exact target, request key, finite status, and no raw retention", async () => {
    const { sdk, provider } = setup();
    const request = exactRefundRequest();
    const created = await provider.createRefund(
      request,
      request.providerIdempotencyKey,
    );
    expect(sdk.refunds.create).toHaveBeenCalledWith(
      {
        amount: 1_250,
        currency: "usd",
        payment_intent: "pi_synthetic6d",
        metadata: { orderId: ids.order, refundId: ids.refund },
      },
      {
        idempotencyKey: request.providerIdempotencyKey,
        maxNetworkRetries: 0,
      },
    );
    expect(created).toEqual({
      status: "normalized",
      refund: {
        provider: "stripe",
        providerRefundId: "re_synthetic6d",
        paymentIntentId: "pi_synthetic6d",
        chargeId: "ch_synthetic6d",
        amount: 1_250,
        currency: "usd",
        status: "pending",
        livemode: false,
      },
    });
    expect(JSON.stringify(created)).not.toContain("must-not-retain");

    sdk.refunds.retrieve.mockResolvedValueOnce(rawRefund({ status: "succeeded" }));
    await expect(
      provider.retrieveRefund({
        knownProviderRefundId: "re_synthetic6d",
        expectedRequest: request,
        expectedProviderContext: context,
      }),
    ).resolves.toMatchObject({ status: "normalized", refund: { status: "succeeded" } });
    expect(sdk.refunds.retrieve).toHaveBeenCalledWith(
      "re_synthetic6d",
      undefined,
      { maxNetworkRetries: 0 },
    );
  });

  it("makes malformed or future refund responses restrictive and never returns raw errors", async () => {
    const { sdk, provider } = setup();
    const request = exactRefundRequest();
    for (const raw of [
      rawRefund({ status: "future_status" }),
      rawRefund({ amount: 1_251 }),
      rawRefund({ payment_intent: "pi_other" }),
      rawRefund({ id: "re_other" }),
    ]) {
      sdk.refunds.retrieve.mockResolvedValueOnce(raw);
      await expect(
        provider.retrieveRefund({
          knownProviderRefundId: "re_synthetic6d",
          expectedRequest: request,
          expectedProviderContext: context,
        }),
      ).resolves.toMatchObject({ status: "provider_unknown" });
    }

    sdk.refunds.create.mockRejectedValueOnce({
      type: "StripeConnectionError",
      code: "ETIMEDOUT",
      message: "private provider body must-not-retain",
      requestId: "req_synthetic_safe6d",
    });
    const result = await provider.createRefund(request, request.providerIdempotencyKey);
    expect(result).toMatchObject({ status: "provider_unknown" });
    expect(JSON.stringify(result)).not.toContain("must-not-retain");
  });
});
