import { describe, expect, it, vi } from "vitest";

import { buildProviderRefundRequestV1, buildStripeCheckoutRequestV1 } from "@/commerce/provider-contracts";
import {
  STRIPE_API_VERSION,
  classifyStripeProviderError,
  createRuntimeStripePaymentProvider,
  createStripePaymentProvider,
} from "@/commerce/stripe-payment-provider";

const ids = {
  order: "72000000-0000-4000-8000-000000000001",
  attempt: "72000000-0000-4000-8000-000000000002",
  product: "72000000-0000-4000-8000-000000000003",
  refund: "72000000-0000-4000-8000-000000000004",
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
        create: vi.fn(async () => rawSession()),
        retrieve: vi.fn(async () => rawSession()),
      },
    },
    refunds: {
      create: vi.fn(async () => rawRefund()),
      retrieve: vi.fn(async () => rawRefund()),
    },
  };
  return { sdk, provider: createStripePaymentProvider({ sdk, context }) };
}

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
