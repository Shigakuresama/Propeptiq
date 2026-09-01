import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createCheckoutService, type AuthoritativeCheckoutFacts, type BrowserCheckoutQuote, type CheckoutRepository } from "@/commerce/checkout-service";
import type { CheckoutProviderResult, NormalizedCheckoutSessionV1, PaymentProvider, RefundProviderResult } from "@/commerce/payment-provider";
import { createProviderExecutionContextV1 } from "@/commerce/provider-context";
import {
  createProviderCheckoutOrchestrator,
  type ProviderCheckoutSessionRepository,
} from "@/commerce/provider-checkout-orchestration";
import { parseServerEnv } from "@/config/env-schema";
import type { DurableCheckoutRequestDataV1 } from "@/db/repositories/provider-session-repository";

const ids = {
  buyer: "76000000-0000-4000-8000-000000000001",
  key: "76000000-0000-4000-8000-000000000002",
  product: "76000000-0000-4000-8000-000000000003",
  group: "76000000-0000-4000-8000-000000000004",
  price: "76000000-0000-4000-8000-000000000005",
  lot: "76000000-0000-4000-8000-000000000006",
  policy: "76000000-0000-4000-8000-000000000007",
  attestation: "76000000-0000-4000-8000-000000000008",
  acceptance: "76000000-0000-4000-8000-000000000009",
  variantA: "76000000-0000-4000-8000-00000000000a",
  variantB: "76000000-0000-4000-8000-00000000000b",
  priceB: "76000000-0000-4000-8000-00000000000c",
  lotB: "76000000-0000-4000-8000-00000000000d",
} as const;
const now = new Date("2026-08-25T12:00:00.123Z");
const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");

function keyedUuid(label: string): string {
  const hex = createHash("sha256").update(`orchestration:${label}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const request = {
  items: [{ productId: ids.product, quantity: 2 }],
  destination: {
    recipientName: "Synthetic Buyer",
    line1: "100 Test Way",
    line2: null,
    city: "Los Angeles",
    stateCode: "CA",
    postalCode: "90001",
    countryCode: "US" as const,
  },
  promotionIds: [],
};

const facts: AuthoritativeCheckoutFacts = {
  buyer: {
    userId: ids.buyer,
    emailVerified: true,
    status: "active",
    currentAttestationVersionId: ids.attestation,
    currentAttestationVersion: 1,
    attestationAcceptanceId: ids.acceptance,
    acceptedAttestationVersionId: ids.attestation,
  },
  items: [{
    productId: ids.product,
    productName: "Synthetic Product",
    packageForm: "sealed vial",
    policyGroupId: ids.group,
    productActive: true,
    policyGroupActive: true,
    price: {
      id: ids.price,
      version: 1,
      amountMinor: 5_000,
      currency: "USD",
      effectiveAt: "2026-08-01T00:00:00.000Z",
      supersededAt: null,
    },
    destination: {
      status: "allowed",
      normalizedStateCode: "CA",
      ruleId: ids.policy,
      ruleVersion: "1",
      scope: "product",
    },
    eligibleLots: [{
      id: ids.lot,
      status: "released",
      receivedQuantity: 10,
      availableQuantity: 10,
      expiresAt: null,
    }],
  }],
  promotion: null,
};

function normalizedSession(
  exactRequest: Parameters<PaymentProvider["createCheckoutSession"]>[0],
  providerSessionId = "cs_local_synthetic_orchestration",
  state: "open" | "complete" | "expired" = "open",
): NormalizedCheckoutSessionV1 {
  return Object.freeze({
    provider: "local_test",
    providerSessionId,
    hostedUrl: state === "open" ? `http://127.0.0.1:3000/__synthetic_local_checkout/${providerSessionId}` : null,
    clientReferenceId: exactRequest.client_reference_id,
    metadata: exactRequest.metadata,
    paymentIntentId: state === "complete" ? "pi_local_synthetic_orchestration" : null,
    amountTotal: exactRequest.line_items.reduce((sum, line) => sum + line.price_data.unit_amount, 0),
    currency: "usd",
    mode: "payment",
    uiMode: "hosted_page",
    status: state,
    paymentStatus: state === "complete" ? "paid" : "unpaid",
    livemode: false,
    customerEmail: exactRequest.customer_email,
    expiresAt: exactRequest.expires_at,
  });
}

function providerWith(
  createResult: (request: Parameters<PaymentProvider["createCheckoutSession"]>[0]) => CheckoutProviderResult,
  retrieveResult?: (request: Parameters<PaymentProvider["retrieveCheckoutSession"]>[0]) => CheckoutProviderResult,
): PaymentProvider {
  return Object.freeze({
    context: Object.freeze({
      provider: "local_test" as const,
      livemode: false,
      scope: "local_test:synthetic-propeptiq-v1",
    }),
    createCheckoutSession: vi.fn(async (
      exactRequest: Parameters<PaymentProvider["createCheckoutSession"]>[0],
    ): Promise<CheckoutProviderResult> => createResult(exactRequest)),
    retrieveCheckoutSession: vi.fn(async (input): Promise<CheckoutProviderResult> =>
      retrieveResult?.(input) ?? Object.freeze({
        status: "provider_unknown" as const,
        knownProviderSessionId: input.knownProviderSessionId,
        evidenceCode: "provider_sdk_unknown" as const,
      })),
    createRefund: vi.fn(async (): Promise<RefundProviderResult> => ({
      status: "provider_unknown" as const,
      knownProviderRefundId: null,
      evidenceCode: "provider_sdk_unknown" as const,
    })),
    retrieveRefund: vi.fn(async (input): Promise<RefundProviderResult> => ({
      status: "provider_unknown" as const,
      knownProviderRefundId: input.knownProviderRefundId,
      evidenceCode: "provider_sdk_unknown" as const,
    })),
  });
}

async function localContext(
  provider: PaymentProvider,
  withOrigin = true,
  overrides: Readonly<{ email?: string; origin?: string }> = {},
) {
  const result = await createProviderExecutionContextV1({
    environment: parseServerEnv({
      APP_ENV: "local",
      ...(withOrigin
        ? { APP_ORIGIN: overrides.origin ?? "http://127.0.0.1:3000" }
        : {}),
      LOCAL_TEST_DRIVER: "enabled",
      LOCAL_TEST_SECRET: "orchestration-local-secret-at-least-32-chars",
      RATE_LIMIT_SECRET: "orchestration-rate-limit-at-least-32-chars",
    }),
    identity: {
      clerkUserId: "user_synthetic_orchestration",
      primaryEmail: overrides.email ?? "Synthetic.Buyer@Example.Test",
      emailVerifiedAt: "2026-08-25T11:00:00.000Z",
      mfaConfigured: false,
      secondFactorCompleted: false,
    },
    now,
    resolveDatabaseUsersByClerkId: async () => [ids.buyer],
    adapters: { stripe: null, localTest: provider },
  });
  if (!result.ok) throw new Error("invalid synthetic context");
  return result.context;
}

function setup(reviewRequired = false) {
  const trace: string[] = [];
  let durable: DurableCheckoutRequestDataV1 | null = null;
  let quoteSnapshot: BrowserCheckoutQuote | null = null;
  let failNextCas = false;
  const releaseDefiniteFailure = vi.fn(async (input) => {
    if (durable !== null) {
      durable = { ...durable, attemptStatus: input.targetAttemptStatus };
    }
    return { status: "released" as const };
  });
  const checkoutRepository: CheckoutRepository = {
    findAttempt: vi.fn(async () => durable === null ? null : ({
      orderId: durable.orderId,
      attemptId: durable.attemptId,
      requestHash: durable.requestHash,
      status: durable.attemptStatus,
      orderState: durable.orderState,
      permitted: true,
      reviewRequired: false,
      hasReservations: true,
      quoteSnapshot,
      pricingRevision: null,
    })),
    loadFacts: vi.fn(async () => ({
      ok: true as const,
      value: reviewRequired
        ? { ...facts, buyer: { ...facts.buyer, status: "review" as const } }
        : facts,
    })),
    findExactReview: vi.fn(async () => null),
    prepare: vi.fn(async (plan, preparation) => {
      trace.push("prepare:begin");
      quoteSnapshot = plan.browserQuote;
      if (preparation === null) {
        trace.push("prepare:end");
        return {
          status: "review_required" as const,
          orderId: plan.identity.orderId,
          attemptId: plan.identity.attemptId,
          reviewRequestId: keyedUuid("orchestration:review"),
          quote: plan.browserQuote,
        };
      }
      durable = {
        buyerUserId: plan.buyerUserId,
        idempotencyKey: plan.idempotencyKey,
        orderId: plan.identity.orderId,
        attemptId: plan.identity.attemptId,
        requestHash: plan.requestHash,
        attemptStatus: "created",
        orderState: "checkout_pending",
        provider: preparation.provider,
        providerIdempotencyKey: preparation.providerIdempotencyKey,
        providerSessionId: null,
        providerRequestHash: preparation.providerRequestHash,
        providerExpiresAt: preparation.providerExpiresAt,
        providerCustomerEmail: preparation.providerCustomerEmail,
        providerOrigin: preparation.providerOrigin,
        providerRequestSchemaVersion: preparation.providerRequestSchemaVersion,
        providerLivemode: preparation.providerLivemode,
        providerScope: preparation.providerScope,
        currency: "USD",
        destination: plan.request.destination,
        lines: plan.browserQuote.lines.map((line: BrowserCheckoutQuote["lines"][number]) => ({
          productId: line.productId,
          productName: line.productName,
          packageForm: line.packageForm,
          purchasedQuantity: line.quantity,
          postDiscountTotalMinor: line.totalMinor,
        })),
        shippingMinor: plan.browserQuote.shippingMinor,
        taxMinor: plan.browserQuote.taxMinor,
        totalMinor: plan.browserQuote.totalMinor,
      };
      trace.push("prepare:end");
      return {
        status: "prepared" as const,
        orderId: plan.identity.orderId,
        attemptId: plan.identity.attemptId,
        reviewRequestId: null,
        quote: plan.browserQuote,
      };
    }),
    releaseDefiniteFailure,
  };
  const checkoutService = createCheckoutService({
    repository: checkoutRepository,
    shippingQuotePort: { quoteShipping: async (input) => ({
      status: "ready", bindingHash: input.bindingHash, reference: "ship_synthetic",
      service: "Synthetic Ground", amountMinor: 700, currency: "USD",
    }) },
    taxQuotePort: { quoteTax: async (input) => ({
      status: "ready", bindingHash: input.bindingHash, reference: "tax_synthetic",
      amountMinor: 325, currency: "USD",
    }) },
    sha256,
    clock: () => new Date(now),
    keyedUuid,
    moneyPolicy: {
      allowedCurrencies: ["USD"], maximumLineCount: 50,
      maximumQuantityPerLine: 25, maximumOrderAmountMinor: 1_000_000,
    },
  });
  const sessions: ProviderCheckoutSessionRepository = {
    load: vi.fn(async () => durable as never),
    recordOpen: vi.fn(async (_loaded, providerSessionId) => {
      trace.push("cas:begin");
      if (failNextCas) {
        failNextCas = false;
        trace.push("cas:failed");
        throw new Error("synthetic database failure");
      }
      durable = { ...durable!, attemptStatus: "open", providerSessionId };
      trace.push("cas:end");
      return { status: "applied" as const };
    }),
    recordUnknown: vi.fn(async (_loaded, input) => {
      trace.push("cas:begin");
      durable = {
        ...durable!,
        attemptStatus: "provider_unknown",
        providerSessionId: durable!.providerSessionId ?? input.knownProviderSessionId,
      };
      trace.push("cas:end");
      return { status: "applied" as const };
    }),
  };
  const orchestrator = createProviderCheckoutOrchestrator({
    checkoutService,
    providerSessionRepository: sessions,
    releaseDefiniteFailure,
    sha256,
  });
  return {
    orchestrator,
    checkoutRepository,
    sessions,
    releaseDefiniteFailure,
    trace,
    failNextCas: () => { failNextCas = true; },
    getDurable: () => durable,
    setDurable: (value: DurableCheckoutRequestDataV1) => { durable = value; },
  };
}

describe("provider Checkout orchestration", () => {
  it("returns canonical PRICE_CHANGED before preparation, reservation, or provider creation", async () => {
    const provider = providerWith((exactRequest) => ({
      status: "open",
      session: normalizedSession(exactRequest),
    }));
    const prepare = vi.fn();
    const quoteForSession = vi.fn(async () => ({
      status: "PRICE_CHANGED" as const,
      pricingRevision: "b".repeat(64),
      cart: {
        items: [{
          variantId: ids.product,
          quantity: 2,
          available: true,
          name: "Synthetic changed variant",
          packageForm: "Synthetic sealed vial",
          variantLabel: "5 mg test fixture",
          sku: "SYNTHETIC-5MG",
          unitAmountMinor: 3500,
          lineSubtotalMinor: 7000,
          currency: "USD",
        }],
        subtotalMinor: 7000,
        currency: "USD",
        taxMinor: null,
        shippingMinor: null,
        finalDiscountMinor: null,
      },
    }));
    const sessions = {
      load: vi.fn(),
      recordOpen: vi.fn(),
      recordUnknown: vi.fn(),
    };
    const orchestrator = createProviderCheckoutOrchestrator({
      checkoutService: {
        quote: vi.fn(),
        quoteForSession,
        prepare,
      },
      providerSessionRepository: sessions,
      releaseDefiniteFailure: vi.fn(),
      sha256,
    });
    const context = await localContext(provider);
    const canonicalRequest = {
      items: [{ variantId: ids.product, quantity: 2 }],
      destination: request.destination,
      pricingRevision: "a".repeat(64),
    };
    await expect(orchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: canonicalRequest,
    })).resolves.toMatchObject({
      status: "PRICE_CHANGED",
      pricingRevision: "b".repeat(64),
    });
    expect(quoteForSession).toHaveBeenCalledTimes(1);
    expect(prepare).not.toHaveBeenCalled();
    expect(sessions.load).not.toHaveBeenCalled();
    expect(provider.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("prepares once, calls the provider outside transactions, and exactly recovers a DB failure", async () => {
    let trace: string[] = [];
    const provider = providerWith((exactRequest) => {
      trace.push("provider:create");
      return { status: "open", session: normalizedSession(exactRequest) };
    });
    const fixture = setup();
    trace = fixture.trace;
    fixture.failNextCas();
    const context = await localContext(provider);
    await expect(fixture.orchestrator.start({ context, idempotencyKey: ids.key, request })).resolves.toEqual({
      status: "provider_unknown",
    });
    const changedContext = await localContext(provider, true, {
      email: "Changed.Identity@Example.Test",
      origin: "http://127.0.0.1:4000",
    });
    await expect(fixture.orchestrator.start({ context: changedContext, idempotencyKey: ids.key, request })).resolves.toMatchObject({
      status: "open",
      orderId: expect.any(String),
      url: expect.stringContaining("/__synthetic_local_checkout/"),
      expiresAt: "2026-08-25T13:00:00.000Z",
    });
    expect(provider.createCheckoutSession).toHaveBeenCalledTimes(2);
    expect(vi.mocked(provider.createCheckoutSession).mock.calls[0]).toEqual(
      vi.mocked(provider.createCheckoutSession).mock.calls[1],
    );
    expect(checkoutRepositoryPrepareCalls(fixture.checkoutRepository)).toBe(1);
    expect(trace).toEqual([
      "prepare:begin", "prepare:end", "provider:create", "cas:begin", "cas:failed",
      "provider:create", "cas:begin", "cas:end",
    ]);
  });

  it("uses complete expected request/context for known-ID retrieval and releases only retrieved expiry", async () => {
    let exactCreatedRequest: Parameters<PaymentProvider["createCheckoutSession"]>[0] | null = null;
    let retrieves = 0;
    const provider = providerWith(
      (exactRequest) => {
        exactCreatedRequest = exactRequest;
        return {
          status: "provider_unknown",
          knownProviderSessionId: "cs_local_synthetic_known",
          evidenceCode: "create_requires_retrieve",
        };
      },
      (input) => {
        retrieves += 1;
        expect(input.expectedRequest).toEqual(exactCreatedRequest);
        expect(input.expectedProviderContext).toEqual(provider.context);
        const state = retrieves === 1 ? "complete" : "expired";
        return state === "complete"
          ? { status: "provider_pending", session: normalizedSession(input.expectedRequest, input.knownProviderSessionId, state) }
          : { status: "verified_expired", session: normalizedSession(input.expectedRequest, input.knownProviderSessionId, state) };
      },
    );
    const fixture = setup();
    const context = await localContext(provider);
    await expect(fixture.orchestrator.start({ context, idempotencyKey: ids.key, request })).resolves.toEqual({ status: "provider_unknown" });
    const recoveryWithoutOrigin = await localContext(provider, false);
    await expect(fixture.orchestrator.start({ context: recoveryWithoutOrigin, idempotencyKey: ids.key, request })).resolves.toEqual({
      status: "provider_pending",
      orderId: expect.any(String),
    });
    await expect(fixture.orchestrator.start({ context: recoveryWithoutOrigin, idempotencyKey: ids.key, request })).resolves.toEqual({
      status: "expired",
      orderId: expect.any(String),
    });
    expect(provider.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(provider.retrieveCheckoutSession).toHaveBeenCalledTimes(2);
    const durable = fixture.getDurable();
    if (durable === null) throw new Error("expected durable checkout request");
    expect(fixture.releaseDefiniteFailure).toHaveBeenCalledWith(expect.objectContaining({
      authority: "authoritative_provider_terminal",
      cause: "verified_expiry",
      providerEvidenceId: "cs_local_synthetic_known",
      providerSessionId: "cs_local_synthetic_known",
      providerLivemode: false,
      providerScope: "local_test:synthetic-propeptiq-v1",
      amountMinor: durable.totalMinor,
      currency: "USD",
      targetAttemptStatus: "expired",
    }));
  });

  it("releases only a definite create rejection and keeps every ambiguous result unknown", async () => {
    const definite = providerWith(() => ({
      status: "definite_rejection",
      evidenceCode: "create_rejected_4xx",
      providerRequestId: null,
    }));
    const definiteFixture = setup();
    const definiteContext = await localContext(definite);
    await expect(definiteFixture.orchestrator.start({ context: definiteContext, idempotencyKey: ids.key, request })).resolves.toMatchObject({ status: "failed" });
    expect(definiteFixture.releaseDefiniteFailure).toHaveBeenCalledWith(expect.objectContaining({ cause: "definite_rejection" }));

    const unknown = providerWith(() => ({
      status: "provider_unknown",
      knownProviderSessionId: null,
      evidenceCode: "provider_transport_unknown",
    }));
    const unknownFixture = setup();
    const unknownContext = await localContext(unknown);
    await expect(unknownFixture.orchestrator.start({ context: unknownContext, idempotencyKey: ids.key, request })).resolves.toEqual({ status: "provider_unknown" });
    expect(unknownFixture.releaseDefiniteFailure).not.toHaveBeenCalled();
    expect(unknownFixture.sessions.recordUnknown).toHaveBeenCalled();
  });

  it("makes missing trusted origin an ordinary zero-write/provider-call denial", async () => {
    const provider = providerWith((exactRequest) => ({ status: "open", session: normalizedSession(exactRequest) }));
    const fixture = setup();
    const context = await localContext(provider, false);
    await expect(fixture.orchestrator.start({ context, idempotencyKey: ids.key, request })).resolves.toEqual({ status: "unavailable" });
    expect(fixture.checkoutRepository.prepare).not.toHaveBeenCalled();
    expect(provider.createCheckoutSession).not.toHaveBeenCalled();
    expect(fixture.sessions.load).not.toHaveBeenCalled();
  });

  it("prepares review-required plans with null provider authority and makes no provider call", async () => {
    const provider = providerWith((exactRequest) => ({
      status: "open",
      session: normalizedSession(exactRequest),
    }));
    const fixture = setup(true);
    const context = await localContext(provider);
    await expect(
      fixture.orchestrator.start({ context, idempotencyKey: ids.key, request }),
    ).resolves.toMatchObject({ status: "review_required", orderId: expect.any(String) });
    expect(fixture.checkoutRepository.prepare).toHaveBeenCalledWith(
      expect.any(Object),
      null,
    );
    expect(provider.createCheckoutSession).not.toHaveBeenCalled();
    expect(fixture.sessions.load).not.toHaveBeenCalled();
  });

  it("returns terminal loaded outcomes without provider calls and fences mode/scope drift", async () => {
    const provider = providerWith((exactRequest) => ({ status: "open", session: normalizedSession(exactRequest) }));
    const fixture = setup();
    const context = await localContext(provider);
    await fixture.orchestrator.start({ context, idempotencyKey: ids.key, request });
    fixture.setDurable({ ...fixture.getDurable()!, attemptStatus: "completed" });
    await expect(fixture.orchestrator.start({ context, idempotencyKey: ids.key, request })).resolves.toMatchObject({ status: "provider_pending" });
    expect(provider.createCheckoutSession).toHaveBeenCalledTimes(1);

    fixture.setDurable({ ...fixture.getDurable()!, attemptStatus: "provider_unknown", providerScope: "local_test:changed-scope" });
    await expect(fixture.orchestrator.start({ context, idempotencyKey: ids.key, request })).resolves.toEqual({ status: "provider_unknown" });
    expect(provider.retrieveCheckoutSession).not.toHaveBeenCalled();
  });
});

function checkoutRepositoryPrepareCalls(repository: CheckoutRepository): number {
  return vi.mocked(repository.prepare).mock.calls.length;
}

async function stripeContext(provider: PaymentProvider) {
  const result = await createProviderExecutionContextV1({
    environment: parseServerEnv({
      APP_ENV: "preview",
      APP_ORIGIN: "https://commerce.synthetic.example",
      PAYMENTS_MODE: "test",
      STRIPE_ACCOUNT_ID: "acct_synthetic6d",
      STRIPE_SECRET_KEY: "sk_test_synthetic_not_a_real_secret",
      STRIPE_WEBHOOK_SECRET: "whsec_synthetic_not_a_real_secret",
    }),
    identity: {
      clerkUserId: "user_synthetic_orchestration",
      primaryEmail: "Synthetic.Buyer@Example.Test",
      emailVerifiedAt: "2026-08-25T11:00:00.000Z",
      mfaConfigured: false,
      secondFactorCompleted: false,
    },
    now,
    resolveDatabaseUsersByClerkId: async () => [ids.buyer],
    adapters: { stripe: provider, localTest: null },
  });
  if (!result.ok) throw new Error("invalid synthetic Stripe context");
  return result.context;
}

function stripeProviderWith(
  createResult: (request: Parameters<PaymentProvider["createCheckoutSession"]>[0]) => CheckoutProviderResult,
  retrieveResult?: (request: Parameters<PaymentProvider["retrieveCheckoutSession"]>[0]) => CheckoutProviderResult,
): PaymentProvider {
  return Object.freeze({
    context: Object.freeze({
      provider: "stripe" as const,
      livemode: false,
      scope: "stripe:acct_synthetic6d",
    }),
    createCheckoutSession: vi.fn(async (exactRequest) => createResult(exactRequest)),
    retrieveCheckoutSession: vi.fn(async (input) =>
      retrieveResult?.(input) ?? Object.freeze({
        status: "provider_unknown" as const,
        knownProviderSessionId: input.knownProviderSessionId,
        evidenceCode: "provider_sdk_unknown" as const,
      })),
    createRefund: vi.fn(async (): Promise<RefundProviderResult> => ({
      status: "provider_unknown",
      knownProviderRefundId: null,
      evidenceCode: "provider_sdk_unknown",
    })),
    retrieveRefund: vi.fn(async (input): Promise<RefundProviderResult> => ({
      status: "provider_unknown",
      knownProviderRefundId: input.knownProviderRefundId,
      evidenceCode: "provider_sdk_unknown",
    })),
  });
}

function canonicalSetup(
  provider: PaymentProvider,
  verifyStatus: "verified" | "unavailable" = "verified",
  shippingAmountMinor = 700,
) {
  const trace: string[] = [];
  let durable: Record<string, unknown> | null = null;
  let stored: null | Readonly<{
    orderId: string;
    attemptId: string;
    requestHash: string;
    status: "created" | "open" | "provider_unknown";
    orderState: "checkout_pending";
    permitted: true;
    reviewRequired: false;
    hasReservations: true;
    quoteSnapshot: BrowserCheckoutQuote;
    pricingRevision: string;
  }> = null;
  const canonicalFacts = Object.freeze({
    buyer: facts.buyer,
    items: Object.freeze([
      Object.freeze({
        variantId: ids.variantB,
        productId: ids.product,
        sku: "SYNTH-B",
        variantLabel: "10 mg",
        productName: "Synthetic Product",
        packageForm: "sealed vial",
        policyGroupId: ids.group,
        productActive: true,
        policyGroupActive: true,
        variantActive: true,
        availabilityRevision: "variant-b-revision-1",
        inventoryRevision: "inventory-b-revision-1",
        price: Object.freeze({
          id: ids.priceB,
          version: 4,
          status: "active" as const,
          amountMinor: 2_500,
          currency: "USD",
          effectiveAt: "2026-08-01T00:00:00.000Z",
        }),
        stripeProductId: "prod_synthetic_parent",
        stripePriceId: "price_synthetic_b",
        destination: facts.items[0]!.destination,
        eligibleLots: Object.freeze([{ ...facts.items[0]!.eligibleLots[0]!, id: ids.lotB }]),
      }),
      Object.freeze({
        variantId: ids.variantA,
        productId: ids.product,
        sku: "SYNTH-A",
        variantLabel: "5 mg",
        productName: "Synthetic Product",
        packageForm: "sealed vial",
        policyGroupId: ids.group,
        productActive: true,
        policyGroupActive: true,
        variantActive: true,
        availabilityRevision: "variant-a-revision-1",
        inventoryRevision: "inventory-a-revision-1",
        price: Object.freeze({
          id: ids.price,
          version: 3,
          status: "active" as const,
          amountMinor: 2_000,
          currency: "USD",
          effectiveAt: "2026-08-01T00:00:00.000Z",
        }),
        stripeProductId: "prod_synthetic_parent",
        stripePriceId: "price_synthetic_a",
        destination: facts.items[0]!.destination,
        eligibleLots: facts.items[0]!.eligibleLots,
      }),
    ]),
    automaticPromotions: Object.freeze([]),
  });
  const checkoutRepository = {
    findAttempt: vi.fn(async () => stored),
    loadVariantFacts: vi.fn(async () => ({ ok: true as const, value: canonicalFacts })),
    loadProviderCreateVariantFacts: vi.fn(async () => ({
      ok: true as const,
      value: canonicalFacts,
    })),
    findExactReview: vi.fn(async () => null),
    prepare: vi.fn(async (plan, preparation) => {
      trace.push("prepare");
      if (preparation === null) return { status: "facts_changed_retry" as const };
      stored = {
        orderId: plan.identity.orderId,
        attemptId: plan.identity.attemptId,
        requestHash: plan.requestHash,
        status: "created",
        orderState: "checkout_pending",
        permitted: true,
        reviewRequired: false,
        hasReservations: true,
        quoteSnapshot: plan.browserQuote,
        pricingRevision: plan.pricingRevision,
      };
      durable = {
        buyerUserId: plan.buyerUserId,
        idempotencyKey: plan.idempotencyKey,
        orderId: plan.identity.orderId,
        attemptId: plan.identity.attemptId,
        requestHash: plan.requestHash,
        attemptStatus: "created",
        orderState: "checkout_pending",
        provider: preparation.provider,
        providerIdempotencyKey: preparation.providerIdempotencyKey,
        providerSessionId: null,
        providerRequestHash: preparation.providerRequestHash,
        providerExpiresAt: preparation.providerExpiresAt,
        providerCustomerEmail: preparation.providerCustomerEmail,
        providerOrigin: preparation.providerOrigin,
        providerRequestSchemaVersion: preparation.providerRequestSchemaVersion,
        providerLivemode: preparation.providerLivemode,
        providerScope: preparation.providerScope,
        providerBindingSnapshot: preparation.providerBindingSnapshot,
        currency: "USD",
        destination: plan.request.destination,
        lines: preparation.providerBindingSnapshot?.lines ?? [],
        shippingMinor: plan.totals!.shippingMinor,
        taxMinor: plan.totals!.taxMinor,
        totalMinor: plan.totals!.totalMinor,
      };
      return {
        status: "prepared" as const,
        orderId: plan.identity.orderId,
        attemptId: plan.identity.attemptId,
        reviewRequestId: null,
        quote: plan.browserQuote,
      };
    }),
    releaseDefiniteFailure: vi.fn(async () => ({ status: "released" as const })),
  };
  const checkoutService = createCheckoutService({
    repository: checkoutRepository as never,
    configuredPromotions: Object.freeze([]),
    shippingQuotePort: { quoteShipping: async (input) => ({
      status: "ready", bindingHash: input.bindingHash, reference: "ship_canonical",
      service: "Synthetic Ground", amountMinor: shippingAmountMinor, currency: "USD",
    }) },
    taxQuotePort: { quoteTax: async (input) => ({
      status: "ready", bindingHash: input.bindingHash, reference: "tax_canonical",
      amountMinor: 325, currency: "USD",
    }) },
    sha256,
    clock: () => new Date(now),
    keyedUuid,
    moneyPolicy: {
      allowedCurrencies: ["USD"], maximumLineCount: 50,
      maximumQuantityPerLine: 25, maximumOrderAmountMinor: 1_000_000,
    },
  });
  const bindingVerifier = {
    verifyBindings: vi.fn(async () => {
      trace.push("verify");
      return { status: verifyStatus } as const;
    }),
  };
  const sessions = {
    load: vi.fn<ProviderCheckoutSessionRepository["load"]>(
      async () => durable as never,
    ),
    recordOpen: vi.fn(async (_loaded, providerSessionId) => {
      trace.push("cas:open");
      durable = { ...durable!, attemptStatus: "open", providerSessionId };
      stored = { ...stored!, status: "open" };
      return { status: "applied" as const };
    }),
    recordUnknown: vi.fn(async (_loaded, input) => {
      trace.push("cas:unknown");
      durable = {
        ...durable!,
        attemptStatus: "provider_unknown",
        providerSessionId: durable!.providerSessionId ?? input.knownProviderSessionId,
      };
      stored = { ...stored!, status: "provider_unknown" };
      return { status: "applied" as const };
    }),
  };
  const orchestrator = createProviderCheckoutOrchestrator({
    checkoutService,
    providerSessionRepository: sessions,
    releaseDefiniteFailure: checkoutRepository.releaseDefiniteFailure,
    bindingVerifier,
    sha256,
  });
  const quoteRequest = {
    items: [
      { variantId: ids.variantB, quantity: 1 },
      { variantId: ids.variantA, quantity: 2 },
    ],
    destination: request.destination,
  };
  return {
    orchestrator,
    checkoutService,
    checkoutRepository,
    bindingVerifier,
    sessions,
    trace,
    quoteRequest,
    getDurable: () => durable,
  };
}

describe("canonical variant provider state machine", () => {
  it("fails unavailable before preparation, reservation, durable creation, or Session creation", async () => {
    const provider = stripeProviderWith((exactRequest) => ({
      status: "open",
      session: {
        ...normalizedSession(exactRequest),
        provider: "stripe",
        hostedUrl: "https://checkout.stripe.com/c/pay/cs_test_synthetic",
      },
    }));
    const fixture = canonicalSetup(provider, "unavailable");
    const context = await stripeContext(provider);
    const quote = await fixture.checkoutService.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: fixture.quoteRequest,
    });
    if (quote.status !== "quoted") throw new Error(`unexpected quote ${quote.status}`);
    await expect(fixture.orchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: { ...fixture.quoteRequest, pricingRevision: quote.pricingRevision },
    })).resolves.toEqual({ status: "unavailable" });
    expect(fixture.bindingVerifier.verifyBindings).toHaveBeenCalledTimes(1);
    expect(fixture.checkoutRepository.prepare).not.toHaveBeenCalled();
    expect(fixture.sessions.load).not.toHaveBeenCalled();
    expect(provider.createCheckoutSession).not.toHaveBeenCalled();
    expect(fixture.getDurable()).toBeNull();
  });

  it("keeps same-parent variants distinct through V2 preparation, durable replay, and inline Session creation", async () => {
    const provider = stripeProviderWith((exactRequest) => {
      expect(exactRequest).toMatchObject({
        allow_promotion_codes: false,
        line_items: [
          { quantity: 1, price_data: { product: "prod_synthetic_parent", unit_amount: 3_680 } },
          { quantity: 1, price_data: { product: "prod_synthetic_parent", unit_amount: 2_500 } },
          { quantity: 1, price_data: { product_data: { name: "Shipping" }, unit_amount: 700 } },
          { quantity: 1, price_data: { product_data: { name: "Sales tax" }, unit_amount: 325 } },
        ],
      });
      return {
        status: "open",
        session: {
          ...normalizedSession(exactRequest),
          provider: "stripe",
          hostedUrl: "https://checkout.stripe.com/c/pay/cs_test_synthetic",
        },
      };
    });
    const fixture = canonicalSetup(provider);
    const context = await stripeContext(provider);
    const quote = await fixture.checkoutService.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: fixture.quoteRequest,
    });
    if (quote.status !== "quoted") throw new Error(`unexpected quote ${quote.status}`);
    await expect(fixture.orchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: { ...fixture.quoteRequest, pricingRevision: quote.pricingRevision },
    })).resolves.toMatchObject({ status: "open" });
    expect(fixture.trace.slice(0, 2)).toEqual(["verify", "prepare"]);
    expect(fixture.checkoutRepository.prepare).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        providerRequestSchemaVersion: 2,
        providerBindingSnapshot: {
          schemaVersion: 2,
          lines: [
            expect.objectContaining({ variantId: ids.variantA, productId: ids.product }),
            expect.objectContaining({ variantId: ids.variantB, productId: ids.product }),
          ],
        },
      }),
    );
    expect(provider.createCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it("retrieves a known V2 Session without rechecking mutable catalog bindings", async () => {
    const provider = stripeProviderWith(
      () => ({
        status: "provider_unknown",
        knownProviderSessionId: "cs_test_synthetic_known_v2",
        evidenceCode: "create_requires_retrieve",
      }),
      (input) => ({
        status: "open",
        session: {
          ...normalizedSession(
            input.expectedRequest,
            input.knownProviderSessionId,
          ),
          provider: "stripe",
          hostedUrl: "https://checkout.stripe.com/c/pay/cs_test_synthetic_known_v2",
        },
      }),
    );
    const fixture = canonicalSetup(provider);
    const context = await stripeContext(provider);
    const quote = await fixture.checkoutService.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: fixture.quoteRequest,
    });
    if (quote.status !== "quoted") throw new Error(`unexpected quote ${quote.status}`);
    const exactRequest = {
      ...fixture.quoteRequest,
      pricingRevision: quote.pricingRevision,
    };

    await expect(fixture.orchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: exactRequest,
    })).resolves.toEqual({ status: "provider_unknown" });
    vi.mocked(fixture.bindingVerifier.verifyBindings).mockResolvedValue({
      status: "unavailable",
    });
    await expect(fixture.orchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: exactRequest,
    })).resolves.toMatchObject({ status: "open", orderId: expect.any(String) });

    expect(fixture.bindingVerifier.verifyBindings).toHaveBeenCalledTimes(2);
    expect(provider.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(provider.retrieveCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it("retains a no-ID V2 outcome as unknown when replay-time bindings drift", async () => {
    const provider = stripeProviderWith(() => ({
      status: "provider_unknown",
      knownProviderSessionId: null,
      evidenceCode: "provider_transport_unknown",
    }));
    const fixture = canonicalSetup(provider);
    const context = await stripeContext(provider);
    const quote = await fixture.checkoutService.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: fixture.quoteRequest,
    });
    if (quote.status !== "quoted") throw new Error(`unexpected quote ${quote.status}`);
    const exactRequest = {
      ...fixture.quoteRequest,
      pricingRevision: quote.pricingRevision,
    };

    await expect(fixture.orchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: exactRequest,
    })).resolves.toEqual({ status: "provider_unknown" });
    vi.mocked(fixture.bindingVerifier.verifyBindings).mockResolvedValue({
      status: "unavailable",
    });
    await expect(fixture.orchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: exactRequest,
    })).resolves.toEqual({ status: "provider_unknown" });

    expect(fixture.bindingVerifier.verifyBindings).toHaveBeenCalledTimes(3);
    expect(provider.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(provider.retrieveCheckoutSession).not.toHaveBeenCalled();
    expect(fixture.sessions.recordUnknown).toHaveBeenCalledTimes(2);
    expect(fixture.checkoutRepository.releaseDefiniteFailure).not.toHaveBeenCalled();
    expect(fixture.getDurable()).toMatchObject({
      attemptStatus: "provider_unknown",
      providerSessionId: null,
    });
  });

  it("fences a providerless V2 replay through the fresh guard before another create", async () => {
    const provider = stripeProviderWith(() => ({
      status: "provider_unknown",
      knownProviderSessionId: null,
      evidenceCode: "provider_transport_unknown",
    }));
    const fixture = canonicalSetup(provider);
    const context = await stripeContext(provider);
    const quote = await fixture.checkoutService.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: fixture.quoteRequest,
    });
    if (quote.status !== "quoted" || quote.pricingRevision === undefined) {
      throw new Error("expected initial canonical quote");
    }
    const sessionRequest = {
      ...fixture.quoteRequest,
      pricingRevision: quote.pricingRevision,
    };
    await expect(fixture.orchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: sessionRequest,
    })).resolves.toEqual({ status: "provider_unknown" });
    expect(provider.createCheckoutSession).toHaveBeenCalledTimes(1);

    const guard = vi.fn(async () => ({
      status: "CHECKOUT_UNAVAILABLE" as const,
      reasons: Object.freeze([Object.freeze({
        variantId: ids.variantA,
        code: "pricing_coming_soon" as const,
      })]),
    }));
    const guarded = createProviderCheckoutOrchestrator({
      checkoutService: Object.freeze({
        ...fixture.checkoutService,
        revalidateCanonicalForProviderCreate: guard,
      }),
      providerSessionRepository: fixture.sessions,
      releaseDefiniteFailure: fixture.checkoutRepository.releaseDefiniteFailure,
      bindingVerifier: fixture.bindingVerifier,
      sha256,
    });

    await expect(guarded.start({
      context,
      idempotencyKey: ids.key,
      request: sessionRequest,
    })).resolves.toEqual({
      status: "CHECKOUT_UNAVAILABLE",
      reasons: [{ variantId: ids.variantA, code: "pricing_coming_soon" }],
    });
    expect(guard).toHaveBeenCalledTimes(1);
    expect(guard).toHaveBeenCalledWith({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: sessionRequest,
      expectedStoredPricingRevision: quote.pricingRevision,
    });
    expect(provider.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(provider.retrieveCheckoutSession).not.toHaveBeenCalled();
  });

  it("calls a successful fresh guard exactly once and reloads once before the first V2 create", async () => {
    const provider = stripeProviderWith((exactRequest) => ({
      status: "open",
      session: {
        ...normalizedSession(exactRequest),
        provider: "stripe",
        hostedUrl: "https://checkout.stripe.com/c/pay/cs_test_synthetic_guarded",
      },
    }));
    const fixture = canonicalSetup(provider);
    const context = await stripeContext(provider);
    const quote = await fixture.checkoutService.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: fixture.quoteRequest,
    });
    if (quote.status !== "quoted" || quote.pricingRevision === undefined) {
      throw new Error("expected initial canonical quote");
    }
    const realGuard = fixture.checkoutService.revalidateCanonicalForProviderCreate;
    const guard = vi.fn((input: Parameters<typeof realGuard>[0]) => realGuard(input));
    const orchestrator = createProviderCheckoutOrchestrator({
      checkoutService: Object.freeze({
        ...fixture.checkoutService,
        revalidateCanonicalForProviderCreate: guard,
      }),
      providerSessionRepository: fixture.sessions,
      releaseDefiniteFailure: fixture.checkoutRepository.releaseDefiniteFailure,
      bindingVerifier: fixture.bindingVerifier,
      sha256,
    });
    const sessionRequest = {
      ...fixture.quoteRequest,
      pricingRevision: quote.pricingRevision,
    };

    await expect(orchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: sessionRequest,
    })).resolves.toMatchObject({ status: "open" });
    expect(guard).toHaveBeenCalledTimes(1);
    expect(guard).toHaveBeenCalledWith({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: sessionRequest,
      expectedStoredPricingRevision: quote.pricingRevision,
    });
    expect(fixture.sessions.load).toHaveBeenCalledTimes(2);
    expect(provider.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(provider.retrieveCheckoutSession).not.toHaveBeenCalled();
  });

  it("fails a providerless V2 replay closed when the fresh guard port is absent", async () => {
    const provider = stripeProviderWith(() => ({
      status: "provider_unknown",
      knownProviderSessionId: null,
      evidenceCode: "provider_transport_unknown",
    }));
    const fixture = canonicalSetup(provider);
    const context = await stripeContext(provider);
    const quote = await fixture.checkoutService.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: fixture.quoteRequest,
    });
    if (quote.status !== "quoted" || quote.pricingRevision === undefined) {
      throw new Error("expected initial canonical quote");
    }
    const sessionRequest = {
      ...fixture.quoteRequest,
      pricingRevision: quote.pricingRevision,
    };
    await fixture.orchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: sessionRequest,
    });
    const withoutGuard = createProviderCheckoutOrchestrator({
      checkoutService: {
        quote: fixture.checkoutService.quote,
        quoteForSession: fixture.checkoutService.quoteForSession,
        prepare: fixture.checkoutService.prepare,
      },
      providerSessionRepository: fixture.sessions,
      releaseDefiniteFailure: fixture.checkoutRepository.releaseDefiniteFailure,
      bindingVerifier: fixture.bindingVerifier,
      sha256,
    });

    await expect(withoutGuard.start({
      context,
      idempotencyKey: ids.key,
      request: sessionRequest,
    })).resolves.toEqual({ status: "conflict" });
    expect(provider.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(provider.retrieveCheckoutSession).not.toHaveBeenCalled();
  });

  it.each([
    [
      "null guard result",
      async () => null,
      { status: "conflict" as const },
    ],
    [
      "undefined guard result",
      async () => undefined,
      { status: "conflict" as const },
    ],
    [
      "primitive guard result",
      async () => 7,
      { status: "conflict" as const },
    ],
    [
      "array guard result",
      async () => ["quoted"],
      { status: "conflict" as const },
    ],
    [
      "unknown guard status",
      async () => ({ status: "synthetic_unknown" }),
      { status: "conflict" as const },
    ],
    [
      "throwing guard status getter",
      async () => Object.defineProperty({}, "status", {
        get() {
          throw new Error("synthetic hostile getter");
        },
      }),
      { status: "conflict" as const },
    ],
    [
      "revoked guard proxy",
      async () => {
        const proxy = Proxy.revocable({ status: "quoted" }, {});
        proxy.revoke();
        return proxy.proxy;
      },
      { status: "conflict" as const },
    ],
    [
      "thrown guard",
      async () => { throw new Error("synthetic guard failure"); },
      { status: "conflict" as const },
    ],
    [
      "malformed price change",
      async () => ({
        status: "PRICE_CHANGED",
        pricingRevision: "e".repeat(64),
        cart: { items: [] },
      }),
      { status: "conflict" as const },
    ],
    [
      "malformed unavailable reasons",
      async () => ({ status: "CHECKOUT_UNAVAILABLE", reasons: [] }),
      { status: "conflict" as const },
    ],
    [
      "invalid request",
      async () => ({
        status: "invalid_request",
        reason: "checkout_input_invalid",
      }),
      { status: "invalid" as const },
    ],
    [
      "provider unavailable denial",
      async () => ({
        status: "denied",
        reasons: ["payment_provider_unavailable"],
      }),
      { status: "unavailable" as const },
    ],
    [
      "other denial",
      async () => ({ status: "denied", reasons: ["buyer_blocked"] }),
      { status: "invalid" as const },
    ],
    [
      "invalid shipping quote",
      async () => ({ status: "quote_invalid", component: "shipping" }),
      { status: "unavailable" as const },
    ],
    [
      "unavailable tax quote",
      async () => ({
        status: "quote_unavailable",
        component: "tax",
        reason: "synthetic_unavailable",
      }),
      { status: "unavailable" as const },
    ],
    [
      "loaded replay success",
      async () => ({ status: "loaded" }),
      { status: "conflict" as const },
    ],
  ])("maps a %s without making another provider call", async (
    _label,
    guardOperation,
    expected,
  ) => {
    const provider = stripeProviderWith(() => ({
      status: "provider_unknown",
      knownProviderSessionId: null,
      evidenceCode: "provider_transport_unknown",
    }));
    const fixture = canonicalSetup(provider);
    const context = await stripeContext(provider);
    const quote = await fixture.checkoutService.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: fixture.quoteRequest,
    });
    if (quote.status !== "quoted" || quote.pricingRevision === undefined) {
      throw new Error("expected initial canonical quote");
    }
    const sessionRequest = {
      ...fixture.quoteRequest,
      pricingRevision: quote.pricingRevision,
    };
    await fixture.orchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: sessionRequest,
    });
    const guard = vi.fn(guardOperation);
    const orchestrator = createProviderCheckoutOrchestrator({
      checkoutService: Object.freeze({
        ...fixture.checkoutService,
        revalidateCanonicalForProviderCreate: guard as never,
      }),
      providerSessionRepository: fixture.sessions,
      releaseDefiniteFailure: fixture.checkoutRepository.releaseDefiniteFailure,
      bindingVerifier: fixture.bindingVerifier,
      sha256,
    });

    await expect(orchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: sessionRequest,
    })).resolves.toEqual(expected);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(provider.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(provider.retrieveCheckoutSession).not.toHaveBeenCalled();
  });

  it("returns PRICE_CHANGED when a fresh full provider request differs from the durable request", async () => {
    const provider = stripeProviderWith(() => ({
      status: "provider_unknown",
      knownProviderSessionId: null,
      evidenceCode: "provider_transport_unknown",
    }));
    const fixture = canonicalSetup(provider);
    const context = await stripeContext(provider);
    const quote = await fixture.checkoutService.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: fixture.quoteRequest,
    });
    if (quote.status !== "quoted" || quote.pricingRevision === undefined) {
      throw new Error("expected initial canonical quote");
    }
    const sessionRequest = {
      ...fixture.quoteRequest,
      pricingRevision: quote.pricingRevision,
    };
    await fixture.orchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: sessionRequest,
    });

    const changed = canonicalSetup(provider, "verified", 701);
    const changedQuote = await changed.checkoutService.quoteForSession({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: sessionRequest,
    });
    if (changedQuote.status !== "quoted") {
      throw new Error("expected changed fresh quote");
    }
    const malformedGuardResult = {
      status: changedQuote.status,
      quote: changedQuote.quote,
      pricingRevision: changedQuote.pricingRevision,
      cart: { items: [] },
    };
    Object.defineProperty(malformedGuardResult, "plan", {
      enumerable: false,
      value: changedQuote.plan,
    });
    const malformedGuard = vi.fn(async () => malformedGuardResult);
    const malformedOrchestrator = createProviderCheckoutOrchestrator({
      checkoutService: Object.freeze({
        ...fixture.checkoutService,
        revalidateCanonicalForProviderCreate: malformedGuard as never,
      }),
      providerSessionRepository: fixture.sessions,
      releaseDefiniteFailure: fixture.checkoutRepository.releaseDefiniteFailure,
      bindingVerifier: fixture.bindingVerifier,
      sha256,
    });
    await expect(malformedOrchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: sessionRequest,
    })).resolves.toEqual({ status: "conflict" });
    expect(malformedGuard).toHaveBeenCalledTimes(1);

    const guard = vi.fn(async () => changedQuote);
    const orchestrator = createProviderCheckoutOrchestrator({
      checkoutService: Object.freeze({
        ...fixture.checkoutService,
        revalidateCanonicalForProviderCreate: guard,
      }),
      providerSessionRepository: fixture.sessions,
      releaseDefiniteFailure: fixture.checkoutRepository.releaseDefiniteFailure,
      bindingVerifier: fixture.bindingVerifier,
      sha256,
    });

    await expect(orchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: sessionRequest,
    })).resolves.toEqual({
      status: "PRICE_CHANGED",
      pricingRevision: quote.pricingRevision,
      cart: changedQuote.cart,
    });
    expect(guard).toHaveBeenCalledTimes(1);
    expect(provider.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(provider.retrieveCheckoutSession).not.toHaveBeenCalled();
  });

  it("uses a post-guard known-session transition for retrieval instead of another create", async () => {
    const provider = stripeProviderWith(
      () => ({
        status: "provider_unknown",
        knownProviderSessionId: null,
        evidenceCode: "provider_transport_unknown",
      }),
      (input) => ({
        status: "open",
        session: {
          ...normalizedSession(input.expectedRequest, input.knownProviderSessionId),
          provider: "stripe",
          hostedUrl: "https://checkout.stripe.com/c/pay/cs_test_synthetic_reloaded",
        },
      }),
    );
    const fixture = canonicalSetup(provider);
    const context = await stripeContext(provider);
    const quote = await fixture.checkoutService.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: fixture.quoteRequest,
    });
    if (quote.status !== "quoted" || quote.pricingRevision === undefined) {
      throw new Error("expected initial canonical quote");
    }
    const sessionRequest = {
      ...fixture.quoteRequest,
      pricingRevision: quote.pricingRevision,
    };
    await fixture.orchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: sessionRequest,
    });
    const providerless = fixture.getDurable();
    if (providerless === null) throw new Error("expected durable V2 replay");
    let loads = 0;
    vi.mocked(fixture.sessions.load).mockReset().mockImplementation(async () => {
      loads += 1;
      return loads === 1
        ? providerless as never
        : {
            ...providerless,
            attemptStatus: "open",
            providerSessionId: "cs_test_synthetic_reloaded",
          } as never;
    });

    await expect(fixture.orchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: sessionRequest,
    })).resolves.toMatchObject({ status: "open" });
    expect(fixture.sessions.load).toHaveBeenCalledTimes(2);
    expect(provider.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(provider.retrieveCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["completed terminal", "completed" as const, { status: "provider_pending" as const }],
    ["expired terminal", "expired" as const, { status: "expired" as const }],
    ["failed terminal", "failed" as const, { status: "failed" as const }],
    ["missing", null, { status: "conflict" as const }],
  ])("fails safe or preserves a %s post-guard reload", async (_label, reloadedStatus, expected) => {
    const provider = stripeProviderWith(() => ({
      status: "provider_unknown",
      knownProviderSessionId: null,
      evidenceCode: "provider_transport_unknown",
    }));
    const fixture = canonicalSetup(provider);
    const context = await stripeContext(provider);
    const quote = await fixture.checkoutService.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: fixture.quoteRequest,
    });
    if (quote.status !== "quoted" || quote.pricingRevision === undefined) {
      throw new Error("expected initial canonical quote");
    }
    const sessionRequest = {
      ...fixture.quoteRequest,
      pricingRevision: quote.pricingRevision,
    };
    await fixture.orchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: sessionRequest,
    });
    const providerless = fixture.getDurable();
    if (providerless === null) throw new Error("expected durable V2 replay");
    vi.mocked(fixture.sessions.load).mockReset()
      .mockResolvedValueOnce(providerless as never)
      .mockResolvedValueOnce(reloadedStatus === null
        ? null
        : {
            ...providerless,
            attemptStatus: reloadedStatus,
            orderState: "paid_pending_fulfillment",
          } as never);

    await expect(fixture.orchestrator.start({
      context,
      idempotencyKey: ids.key,
      request: sessionRequest,
    })).resolves.toMatchObject(expected);
    expect(provider.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(provider.retrieveCheckoutSession).not.toHaveBeenCalled();
  });
});
