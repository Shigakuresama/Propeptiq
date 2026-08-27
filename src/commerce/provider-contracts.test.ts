import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildProviderRefundRequestV1,
  buildStripeCheckoutRequestV1,
  hashProviderCheckoutRequest,
  hashProviderRefundRequest,
} from "@/commerce/provider-contracts";

const ids = {
  order: "71000000-0000-4000-8000-000000000001",
  attempt: "71000000-0000-4000-8000-000000000002",
  productA: "71000000-0000-4000-8000-000000000003",
  productB: "71000000-0000-4000-8000-000000000004",
  refund: "71000000-0000-4000-8000-000000000005",
} as const;

const sha256 = async (value: string) =>
  createHash("sha256").update(value).digest("hex");

const checkoutFacts = {
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
    line2: "Suite 6D",
    city: "Los Angeles",
    stateCode: "CA",
    postalCode: "90001-1234",
    countryCode: "US",
  },
  lines: [
    {
      productId: ids.productB,
      productName: "Synthetic Beta",
      packageForm: "sealed kit",
      purchasedQuantity: 1,
      postDiscountTotalMinor: 2_500,
    },
    {
      productId: ids.productA,
      productName: "Synthetic Alpha",
      packageForm: "sealed vial",
      purchasedQuantity: 2,
      postDiscountTotalMinor: 8_000,
    },
  ],
  shippingMinor: 700,
  taxMinor: 825,
  totalMinor: 12_025,
} as const;

function checkoutRequest() {
  const built = buildStripeCheckoutRequestV1(checkoutFacts);
  if (!built.ok) throw new Error(`unexpected invalid fixture: ${built.error.field}`);
  return built.value;
}

describe("exact hosted Checkout request V1", () => {
  it("maps every authoritative fact into the exact card-only hosted request", () => {
    expect(checkoutRequest()).toEqual({
      ui_mode: "hosted_page",
      mode: "payment",
      payment_method_types: ["card"],
      success_url: `https://commerce.synthetic.example/checkout/success/${ids.order}`,
      cancel_url: "https://commerce.synthetic.example/checkout",
      client_reference_id: ids.order,
      customer_email: "synthetic.buyer@example.test",
      expires_at: 1_787_662_800,
      metadata: { orderId: ids.order, attemptId: ids.attempt },
      payment_intent_data: {
        metadata: { orderId: ids.order, attemptId: ids.attempt },
        shipping: {
          name: "Synthetic Researcher",
          address: {
            line1: "100 Test Way",
            line2: "Suite 6D",
            city: "Los Angeles",
            state: "CA",
            postal_code: "90001-1234",
            country: "US",
          },
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: 8_000,
            product_data: {
              name: "Synthetic Alpha · sealed vial · Qty 2",
            },
          },
        },
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: 2_500,
            product_data: {
              name: "Synthetic Beta · sealed kit · Qty 1",
            },
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
            unit_amount: 825,
            product_data: { name: "Sales tax" },
          },
        },
      ],
    });
    expect(checkoutRequest()).not.toHaveProperty("shipping_address_collection");
  });

  it("omits nullable line2 and zero components without changing exact totals", () => {
    const result = buildStripeCheckoutRequestV1({
      ...checkoutFacts,
      destination: { ...checkoutFacts.destination, line2: null },
      shippingMinor: 0,
      taxMinor: 0,
      totalMinor: 10_500,
    });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.value.line_items).toHaveLength(2);
    expect(
      result.value.payment_intent_data.shipping.address,
    ).not.toHaveProperty("line2");
  });

  it("accepts exactly 50 product lines plus two components and rejects the 51st", () => {
    const lines = Array.from({ length: 50 }, (_, index) => ({
      productId: `71000000-0000-4000-8${String(index).padStart(3, "0")}-000000000010`,
      productName: `Synthetic ${index}`,
      packageForm: "sealed vial",
      purchasedQuantity: 1,
      postDiscountTotalMinor: 100,
    }));
    const accepted = buildStripeCheckoutRequestV1({
      ...checkoutFacts,
      lines,
      shippingMinor: 1,
      taxMinor: 1,
      totalMinor: 5_002,
    });
    expect(accepted).toMatchObject({ ok: true });
    if (accepted.ok) expect(accepted.value.line_items).toHaveLength(52);
    expect(
      buildStripeCheckoutRequestV1({
        ...checkoutFacts,
        lines: [...lines, { ...lines[0]!, productId: ids.productA }],
        totalMinor: 5_102,
      }),
    ).toMatchObject({ ok: false });
  });

  it("fails closed for mismatched totals, unsafe values, duplicate lines, and caller keys", () => {
    for (const invalid of [
      { ...checkoutFacts, totalMinor: 12_024 },
      { ...checkoutFacts, totalMinor: 0, lines: [{ ...checkoutFacts.lines[0], postDiscountTotalMinor: 0 }], shippingMinor: 0, taxMinor: 0 },
      { ...checkoutFacts, shippingMinor: Number.MAX_SAFE_INTEGER, totalMinor: Number.MAX_SAFE_INTEGER },
      { ...checkoutFacts, currency: "EUR" },
      { ...checkoutFacts, lines: [checkoutFacts.lines[0], checkoutFacts.lines[0]] },
      { ...checkoutFacts, providerRequestSchemaVersion: 2 },
      { ...checkoutFacts, callerRedirectUrl: "https://attacker.invalid" },
    ] as const) {
      expect(buildStripeCheckoutRequestV1(invalid)).toMatchObject({ ok: false });
    }
  });

  it("rebuilds and hashes byte-equivalently while every replay fact remains binding", async () => {
    const first = checkoutRequest();
    const durableReload = buildStripeCheckoutRequestV1({
      ...checkoutFacts,
      lines: [...checkoutFacts.lines].reverse(),
      destination: { ...checkoutFacts.destination },
    });
    expect(durableReload).toEqual({ ok: true, value: first });

    const baseHash = await hashProviderCheckoutRequest(
      { provider: "stripe", providerRequestSchemaVersion: 1, request: first },
      sha256,
    );
    const variants = [
      { ...checkoutFacts, providerCustomerEmail: "changed@example.test" },
      { ...checkoutFacts, providerOrigin: "https://changed.synthetic.example" },
      { ...checkoutFacts, destination: { ...checkoutFacts.destination, line1: "101 Changed Way" } },
      { ...checkoutFacts, lines: [{ ...checkoutFacts.lines[0], postDiscountTotalMinor: 2_501 }, checkoutFacts.lines[1]], totalMinor: 12_026 },
      { ...checkoutFacts, providerExpiresAt: "2026-08-25T13:00:01.000Z" },
    ] as const;
    for (const variant of variants) {
      const rebuilt = buildStripeCheckoutRequestV1(variant);
      expect(rebuilt).toMatchObject({ ok: true });
      if (!rebuilt.ok) continue;
      await expect(
        hashProviderCheckoutRequest(
          { provider: "stripe", providerRequestSchemaVersion: 1, request: rebuilt.value },
          sha256,
        ),
      ).resolves.not.toBe(baseHash);
    }
    await expect(
      hashProviderCheckoutRequest(
        { provider: "stripe", providerRequestSchemaVersion: 2, request: first },
        sha256,
      ),
    ).resolves.not.toBe(baseHash);
  });
});

describe("exact provider refund request V1", () => {
  const refundFacts = {
    schemaVersion: 1,
    provider: "stripe",
    refundId: ids.refund,
    orderId: ids.order,
    requestedAmountMinor: 1_250,
    currency: "USD",
    paymentIntentId: "pi_synthetic_6d",
    chargeId: null,
    providerIdempotencyKey: `refund_request:${ids.refund}`,
  } as const;

  it("derives exact target, amount, currency, metadata, key, and stable hash", async () => {
    const built = buildProviderRefundRequestV1(refundFacts);
    expect(built).toEqual({
      ok: true,
      value: {
        schemaVersion: 1,
        provider: "stripe",
        refundId: ids.refund,
        orderId: ids.order,
        amountMinor: 1_250,
        currency: "usd",
        paymentIntentId: "pi_synthetic_6d",
        chargeId: null,
        metadata: { orderId: ids.order, refundId: ids.refund },
        providerIdempotencyKey: `refund_request:${ids.refund}`,
      },
    });
    if (!built.ok) return;
    const reloaded = buildProviderRefundRequestV1({ ...refundFacts });
    expect(reloaded).toEqual(built);
    await expect(hashProviderRefundRequest(built.value, sha256)).resolves.toMatch(
      /^[a-f0-9]{64}$/u,
    );
  });

  it("requires exactly one server-selected target and positive safe USD amount", () => {
    for (const invalid of [
      { ...refundFacts, paymentIntentId: null, chargeId: null },
      { ...refundFacts, chargeId: "ch_synthetic_6d" },
      { ...refundFacts, paymentIntentId: null, chargeId: "" },
      { ...refundFacts, requestedAmountMinor: 0 },
      { ...refundFacts, requestedAmountMinor: Number.MAX_SAFE_INTEGER + 1 },
      { ...refundFacts, currency: "EUR" },
      { ...refundFacts, providerIdempotencyKey: "caller-key" },
      { ...refundFacts, metadata: { caller: "authority" } },
    ] as const) {
      expect(buildProviderRefundRequestV1(invalid)).toMatchObject({ ok: false });
    }
  });
});
