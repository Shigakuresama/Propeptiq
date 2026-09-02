import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  createCheckoutIdentity,
  hashCheckoutRequest,
  hashReviewSnapshot,
} from "@/commerce/checkout-identity";
import {
  parseProviderPreparation,
  parseShippingQuoteResult,
  parseTaxQuoteResult,
} from "@/commerce/checkout-ports";

const ids = {
  buyer: "10000000-0000-4000-8000-000000000001",
  key: "10000000-0000-4000-8000-000000000002",
  order: "10000000-0000-4000-8000-000000000003",
  attempt: "10000000-0000-4000-8000-000000000004",
  product: "10000000-0000-4000-8000-000000000005",
  policy: "10000000-0000-4000-8000-000000000006",
  attestation: "10000000-0000-4000-8000-000000000007",
  item: "10000000-0000-4000-8000-000000000008",
  previousAttestation: "10000000-0000-4000-8000-000000000009",
} as const;

const sha256 = async (value: string) =>
  createHash("sha256").update(value).digest("hex");

describe("checkout identity contracts", () => {
  it("canonicalizes object keys while preserving array order", () => {
    expect(canonicalJson({ z: 1, a: { y: true, x: ["b", "a"] } })).toBe(
      '{"a":{"x":["b","a"],"y":true},"z":1}',
    );
  });

  it("binds request hashes to the canonical parsed request rather than key order", async () => {
    const left = {
      items: [{ productId: ids.product, quantity: 2 }],
      destination: {
        recipientName: "Synthetic Researcher",
        line1: "100 Test Way",
        line2: null,
        city: "Testville",
        stateCode: "CA",
        postalCode: "90001",
        countryCode: "US" as const,
      },
      promotionIds: [] as string[],
    };
    const right = {
      promotionIds: [] as string[],
      destination: { ...left.destination },
      items: [...left.items],
    };

    await expect(hashCheckoutRequest(left, sha256)).resolves.toBe(
      await hashCheckoutRequest(right, sha256),
    );
  });

  it("derives every stable identifier once and the provider-global key from the attempt", () => {
    const generated: string[] = [];
    const identity = createCheckoutIdentity({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      keyedUuid(label) {
        generated.push(label);
        if (label.endsWith(":order")) return ids.order;
        if (label.endsWith(":attempt")) return ids.attempt;
        return ids.item;
      },
    });

    expect(identity).toEqual({
      orderId: ids.order,
      attemptId: ids.attempt,
      providerIdempotencyKey: `checkout_attempt:${ids.attempt}`,
      keyedUuid: expect.any(Function),
    });
    expect(generated).toEqual([
      `${ids.buyer}:${ids.key}:order`,
      `${ids.buyer}:${ids.key}:attempt`,
    ]);
    expect(identity.keyedUuid("item:one")).toBe(ids.item);
  });

  it("binds order, destination, accepted attestation, and current attestation in review hashes", async () => {
    const base = {
      orderId: ids.order,
      buyerUserId: ids.buyer,
      buyerStatus: "review" as const,
      acceptedAttestationVersionId: ids.attestation,
      currentAttestationVersionId: ids.attestation,
      items: [{ productId: ids.product, quantity: 1 }],
      promotionIds: [] as string[],
      destination: {
        recipientName: "Synthetic Researcher",
        line1: "100 Test Way",
        line2: null,
        city: "Testville",
        stateCode: "CA",
        postalCode: "90001",
        countryCode: "US" as const,
      },
      reviewPolicies: [{ id: ids.policy, version: "1" }],
    };
    const original = await hashReviewSnapshot(base, sha256);
    const changedAddress = await hashReviewSnapshot(
      {
        ...base,
        destination: { ...base.destination, line1: "101 Test Way" },
      },
      sha256,
    );
    const changedOrder = await hashReviewSnapshot(
      { ...base, orderId: "10000000-0000-4000-8000-000000000099" },
      sha256,
    );
    const changedAcceptedAttestation = await hashReviewSnapshot(
      {
        ...base,
        acceptedAttestationVersionId: ids.previousAttestation,
      },
      sha256,
    );
    const changedCurrentAttestation = await hashReviewSnapshot(
      {
        ...base,
        currentAttestationVersionId: ids.previousAttestation,
      },
      sha256,
    );

    expect(original).toMatch(/^[0-9a-f]{64}$/);
    expect(changedAddress).not.toBe(original);
    expect(changedOrder).not.toBe(original);
    expect(changedAcceptedAttestation).not.toBe(original);
    expect(changedCurrentAttestation).not.toBe(original);
  });
});

describe("strict quote and provider-preparation contracts", () => {
  const bindingHash = "a".repeat(64);

  it("accepts only exact ready shipping and tax shapes", () => {
    expect(
      parseShippingQuoteResult(
        {
          status: "ready",
          bindingHash,
          reference: "ship_synthetic",
          service: "Synthetic Ground",
          amountMinor: 700,
          currency: "USD",
        },
        { bindingHash, currency: "USD" },
      ),
    ).toMatchObject({ ok: true, value: { amountMinor: 700 } });
    expect(
      parseTaxQuoteResult(
        {
          status: "ready",
          bindingHash,
          reference: "tax_synthetic",
          amountMinor: 325,
          currency: "USD",
        },
        { bindingHash, currency: "USD" },
      ),
    ).toMatchObject({ ok: true, value: { amountMinor: 325 } });
  });

  it.each([
    { amountMinor: Number.MAX_SAFE_INTEGER + 1 },
    { reference: " " },
    { currency: "EUR" },
    { bindingHash: "b".repeat(64) },
    { unexpected: "browser controlled" },
  ])("rejects malformed or unbound shipping output %#", (change) => {
    const result = parseShippingQuoteResult(
      {
        status: "ready",
        bindingHash,
        reference: "ship_synthetic",
        service: "Synthetic Ground",
        amountMinor: 700,
        currency: "USD",
        ...change,
      },
      { bindingHash, currency: "USD" },
    );
    expect(result).toMatchObject({ ok: false });
  });

  it("allows only a stable non-PII unavailable reason and no extra fields", () => {
    expect(
      parseTaxQuoteResult(
        { status: "unavailable", reason: "temporarily_unavailable" },
        { bindingHash, currency: "USD" },
      ),
    ).toEqual({
      ok: true,
      value: { status: "unavailable", reason: "temporarily_unavailable" },
    });
    expect(
      parseTaxQuoteResult(
        {
          status: "unavailable",
          reason: "Customer at 100 Test Way is unavailable",
        },
        { bindingHash, currency: "USD" },
      ),
    ).toMatchObject({ ok: false });
  });

  it("rejects hidden or symbol quote fields outside the exact contract", () => {
    const hidden = {
      status: "ready",
      bindingHash,
      reference: "ship_synthetic",
      service: "Synthetic Ground",
      amountMinor: 700,
      currency: "USD",
    };
    Object.defineProperty(hidden, "hiddenMetadata", {
      enumerable: false,
      value: "not part of the contract",
    });
    const symbol = Symbol("provider-payload");
    const symbolBearing = {
      status: "ready",
      bindingHash,
      reference: "tax_synthetic",
      amountMinor: 325,
      currency: "USD",
      [symbol]: "not part of the contract",
    };

    expect(
      parseShippingQuoteResult(hidden, { bindingHash, currency: "USD" }),
    ).toMatchObject({ ok: false });
    expect(
      parseTaxQuoteResult(symbolBearing, { bindingHash, currency: "USD" }),
    ).toMatchObject({ ok: false });
  });

  it("validates every exact provider replay fact and rejects noncanonical authority", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    const preparation = {
      authority: "server_prepared_provider_request",
      provider: "local_test",
      providerIdempotencyKey: `checkout_attempt:${ids.attempt}`,
      providerRequestHash: "c".repeat(64),
      providerExpiresAt: "2026-08-25T12:30:00.000Z",
      providerCustomerEmail: "synthetic.buyer@example.test",
      providerOrigin: "http://127.0.0.1:3000",
      providerRequestSchemaVersion: 1,
      providerLivemode: false,
      providerScope: "local_test:synthetic-propeptiq-v1",
    } as const;

    expect(
      parseProviderPreparation(preparation, {
        attemptId: ids.attempt,
        now,
      }),
    ).toEqual({ ok: true, value: preparation });
    expect(
      parseProviderPreparation(
        { ...preparation, providerIdempotencyKey: ids.key },
        { attemptId: ids.attempt, now },
      ),
    ).toMatchObject({ ok: false });
    expect(
      parseProviderPreparation(
        { ...preparation, providerExpiresAt: "2026-08-25T12:29:59.999Z" },
        { attemptId: ids.attempt, now },
      ),
    ).toMatchObject({ ok: false });
    expect(
      parseProviderPreparation(
        { ...preparation, providerExpiresAt: "2026-08-26T12:00:00.001Z" },
        { attemptId: ids.attempt, now },
      ),
    ).toMatchObject({ ok: false });
    for (const invalid of [
      { ...preparation, providerExpiresAt: "2026-08-25T13:00:00.001Z" },
      { ...preparation, providerCustomerEmail: "Synthetic.Buyer@example.test" },
      { ...preparation, providerCustomerEmail: "synthetic.buyer@example.test " },
      { ...preparation, providerOrigin: "http://127.0.0.1:3000/checkout" },
      { ...preparation, providerOrigin: "http://research.example.test" },
      {
        ...preparation,
        provider: "stripe",
        providerOrigin: "https://127.0.0.2",
        providerScope: "stripe:acct_synthetic6d",
      },
      {
        ...preparation,
        provider: "stripe",
        providerOrigin: "https://commerce.local",
        providerScope: "stripe:acct_synthetic6d",
      },
      { ...preparation, providerRequestSchemaVersion: 2 },
      { ...preparation, providerLivemode: true },
      { ...preparation, providerScope: "stripe:acct_synthetic" },
      { ...preparation, unexpected: "caller authority" },
      Object.assign(Object.create({ inherited: "caller authority" }), preparation),
      {
        ...preparation,
        provider: "stripe",
        providerOrigin: "http://127.0.0.1:3000",
        providerScope: "stripe:acct_synthetic123",
      },
    ] as const) {
      expect(
        parseProviderPreparation(invalid, { attemptId: ids.attempt, now }),
      ).toMatchObject({ ok: false });
    }

    expect(
      parseProviderPreparation(
        {
          ...preparation,
          provider: "stripe",
          providerOrigin: "https://checkout.synthetic.example",
          providerScope: "stripe:acct_synthetic123",
          providerLivemode: true,
        },
        { attemptId: ids.attempt, now },
      ),
    ).toMatchObject({ ok: true });
  });

  it("accepts V2 only with an exact variant-safe provider binding snapshot", () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    const line = {
      variantId: ids.item,
      productId: ids.product,
      sku: "SYNTH-5MG",
      productName: "Synthetic Product",
      variantLabel: "5 mg",
      requestedQuantity: 2,
      netLineMinor: 3_680,
      baseUnitMinor: 2_000,
      currency: "USD",
      priceBookId: ids.policy,
      priceVersion: 3,
      stripeProductId: "prod_synthetic_parent",
      stripePriceId: "price_synthetic_5mg",
    } as const;
    const preparation = {
      authority: "server_prepared_provider_request",
      provider: "stripe",
      providerIdempotencyKey: `checkout_attempt:${ids.attempt}`,
      providerRequestHash: "d".repeat(64),
      providerExpiresAt: "2026-08-25T13:00:00.000Z",
      providerCustomerEmail: "synthetic.buyer@example.test",
      providerOrigin: "https://checkout.synthetic.example",
      providerRequestSchemaVersion: 2,
      providerBindingSnapshot: { schemaVersion: 2, lines: [line] },
      providerLivemode: false,
      providerScope: "stripe:acct_synthetic123",
    } as const;

    expect(parseProviderPreparation(preparation, {
      attemptId: ids.attempt,
      now,
    })).toEqual({ ok: true, value: preparation });
    for (const invalid of [
      { ...preparation, providerBindingSnapshot: undefined },
      {
        ...preparation,
        providerBindingSnapshot: {
          ...preparation.providerBindingSnapshot,
          unexpected: "caller authority",
        },
      },
      {
        ...preparation,
        providerBindingSnapshot: {
          schemaVersion: 2,
          lines: [{ ...line, stripePriceId: "not-a-price" }],
        },
      },
      {
        ...preparation,
        providerBindingSnapshot: { schemaVersion: 2, lines: [line, line] },
      },
      {
        ...preparation,
        providerRequestSchemaVersion: 1,
      },
    ] as const) {
      expect(parseProviderPreparation(invalid, {
        attemptId: ids.attempt,
        now,
      })).toMatchObject({ ok: false });
    }
  });
});
