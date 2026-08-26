import { describe, expect, it } from "vitest";

import { LOCAL_PAYMENT_PROVIDER_SCOPE } from "@/commerce/checkout-ports";
import {
  buildProviderRefundRequestV1,
  buildStripeCheckoutRequestV1,
} from "@/commerce/provider-contracts";
import {
  createSyntheticLocalPaymentProvider,
  LOCAL_PAYMENT_PROVIDER_SENTINEL,
} from "local-payment-provider";

const ids = {
  order: "73000000-0000-4000-8000-000000000001",
  attempt: "73000000-0000-4000-8000-000000000002",
  product: "73000000-0000-4000-8000-000000000003",
  refund: "73000000-0000-4000-8000-000000000004",
} as const;

function checkoutRequest() {
  const result = buildStripeCheckoutRequestV1({
    provider: "local_test",
    providerRequestSchemaVersion: 1,
    orderId: ids.order,
    attemptId: ids.attempt,
    providerCustomerEmail: "synthetic.buyer@example.test",
    providerOrigin: "http://127.0.0.1:4631",
    providerExpiresAt: "2026-08-25T20:00:00.000Z",
    currency: "USD",
    destination: {
      recipientName: "Synthetic Buyer",
      line1: "100 Test Way",
      line2: null,
      city: "Los Angeles",
      stateCode: "CA",
      postalCode: "90001",
      countryCode: "US",
    },
    lines: [{
      productId: ids.product,
      productName: "Synthetic Product",
      packageForm: "sealed vial",
      purchasedQuantity: 1,
      postDiscountTotalMinor: 2_000,
    }],
    shippingMinor: 200,
    taxMinor: 180,
    totalMinor: 2_380,
  });
  if (!result.ok) throw new Error("invalid synthetic checkout fixture");
  return result.value;
}

function refundRequest() {
  const result = buildProviderRefundRequestV1({
    schemaVersion: 1,
    provider: "local_test",
    refundId: ids.refund,
    orderId: ids.order,
    requestedAmountMinor: 500,
    currency: "USD",
    paymentIntentId: "pi_local_synthetic",
    chargeId: null,
    providerIdempotencyKey: `refund_request:${ids.refund}`,
  });
  if (!result.ok) throw new Error("invalid synthetic refund fixture");
  return result.value;
}

describe("synthetic local payment provider", () => {
  it("is conspicuously synthetic and uses the fixed nonsecret local scope", () => {
    const harness = createSyntheticLocalPaymentProvider();
    expect(LOCAL_PAYMENT_PROVIDER_SENTINEL).toBe(
      "LOCAL_PAYMENT_PROVIDER_TEST_ONLY_PROPEPTIQ_6D_C8A13F",
    );
    expect(harness.provider.context).toEqual({
      provider: "local_test",
      livemode: false,
      scope: LOCAL_PAYMENT_PROVIDER_SCOPE,
    });
  });

  it("persists before a simulated connection loss and replays the same key exactly", async () => {
    const harness = createSyntheticLocalPaymentProvider();
    harness.control.nextCheckoutOutcome("persist_then_connection_loss");
    const request = checkoutRequest();
    const key = `checkout_attempt:${ids.attempt}`;
    await expect(harness.provider.createCheckoutSession(request, key)).resolves.toEqual({
      status: "provider_unknown",
      knownProviderSessionId: null,
      evidenceCode: "provider_transport_unknown",
    });
    const replay = await harness.provider.createCheckoutSession(request, key);
    expect(replay).toMatchObject({ status: "open" });
    if (replay.status === "open") {
      expect(replay.session.providerSessionId).toMatch(/^cs_local_synthetic_/u);
      expect(replay.session.hostedUrl).toBe(
        `http://127.0.0.1:4631/__synthetic_local_checkout/${replay.session.providerSessionId}`,
      );
    }
    await expect(
      harness.provider.createCheckoutSession(
        { ...request, customer_email: "changed@example.test" },
        key,
      ),
    ).resolves.toMatchObject({
      status: "provider_unknown",
      evidenceCode: "provider_sdk_unknown",
    });
  });

  it("retrieves known IDs with full context and models open, complete, and expired states", async () => {
    const harness = createSyntheticLocalPaymentProvider();
    const request = checkoutRequest();
    const created = await harness.provider.createCheckoutSession(
      request,
      `checkout_attempt:${ids.attempt}`,
    );
    if (created.status !== "open") throw new Error("expected synthetic open result");
    const sessionId = created.session.providerSessionId;
    harness.control.setCheckoutState(sessionId, "complete");
    await expect(harness.provider.retrieveCheckoutSession({
      knownProviderSessionId: sessionId,
      expectedRequest: request,
      expectedProviderContext: harness.provider.context,
    })).resolves.toMatchObject({ status: "provider_pending" });
    harness.control.setCheckoutState(sessionId, "expired");
    await expect(harness.provider.retrieveCheckoutSession({
      knownProviderSessionId: sessionId,
      expectedRequest: request,
      expectedProviderContext: harness.provider.context,
    })).resolves.toMatchObject({ status: "verified_expired" });
  });

  it("models definite rejection, idempotency, 409/5xx, timeout, and malformed outcomes conservatively", async () => {
    const request = checkoutRequest();
    const key = `checkout_attempt:${ids.attempt}`;
    const expected = [
      ["definite_4xx", "definite_rejection"],
      ["idempotency_conflict", "provider_unknown"],
      ["conflict_409", "provider_unknown"],
      ["server_5xx", "provider_unknown"],
      ["timeout", "provider_unknown"],
      ["malformed", "provider_unknown"],
    ] as const;
    for (const [outcome, status] of expected) {
      const harness = createSyntheticLocalPaymentProvider();
      harness.control.nextCheckoutOutcome(outcome);
      await expect(
        harness.provider.createCheckoutSession(request, key),
      ).resolves.toMatchObject({ status });
    }
  });

  it("models strict refund create, same-key retry, retrieval, and finite state transitions", async () => {
    const harness = createSyntheticLocalPaymentProvider();
    harness.control.nextRefundOutcome("persist_then_connection_loss");
    const request = refundRequest();
    await expect(
      harness.provider.createRefund(request, request.providerIdempotencyKey),
    ).resolves.toMatchObject({ status: "provider_unknown" });
    const replay = await harness.provider.createRefund(
      request,
      request.providerIdempotencyKey,
    );
    expect(replay).toMatchObject({ status: "normalized" });
    if (replay.status !== "normalized") return;
    harness.control.setRefundState(replay.refund.providerRefundId, "succeeded");
    await expect(harness.provider.retrieveRefund({
      knownProviderRefundId: replay.refund.providerRefundId,
      expectedRequest: request,
      expectedProviderContext: harness.provider.context,
    })).resolves.toMatchObject({
      status: "normalized",
      refund: { status: "succeeded" },
    });
    harness.control.setRefundState(replay.refund.providerRefundId, "future_status");
    await expect(harness.provider.retrieveRefund({
      knownProviderRefundId: replay.refund.providerRefundId,
      expectedRequest: request,
      expectedProviderContext: harness.provider.context,
    })).resolves.toMatchObject({ status: "provider_unknown" });
  });
});
