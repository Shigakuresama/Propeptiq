import { createHash } from "node:crypto";

import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { hashCheckoutRequest } from "@/commerce/checkout-identity";
import {
  createCheckoutService,
  projectAuthoritativeCheckoutPlan,
  type AuthoritativeCheckoutFacts,
  type CheckoutAttemptStatus,
  type CheckoutLoadedResult,
  type CheckoutPrepareResult,
  type CheckoutQuoteResult,
  type CheckoutRepository,
  type DefiniteFailureReleaseResult,
  type FactLoadResult,
} from "@/commerce/checkout-service";

const ids = {
  buyer: "20000000-0000-4000-8000-000000000001",
  key: "20000000-0000-4000-8000-000000000002",
  order: "20000000-0000-4000-8000-000000000003",
  attempt: "20000000-0000-4000-8000-000000000004",
  product: "20000000-0000-4000-8000-000000000005",
  group: "20000000-0000-4000-8000-000000000006",
  price: "20000000-0000-4000-8000-000000000007",
  lot: "20000000-0000-4000-8000-000000000008",
  policy: "20000000-0000-4000-8000-000000000009",
  attestation: "20000000-0000-4000-8000-000000000010",
  acceptance: "20000000-0000-4000-8000-000000000011",
} as const;

const now = new Date("2026-08-25T12:00:00.000Z");
const request = {
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
  items: [
    {
      productId: ids.product,
      productName: "Synthetic Reference A",
      packageForm: "Sealed test unit",
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
      eligibleLots: [
        {
          id: ids.lot,
          status: "released",
          receivedQuantity: 10,
          availableQuantity: 10,
          expiresAt: "2026-12-01T00:00:00.000Z",
        },
      ],
    },
  ],
  promotion: null,
};

const sha256 = async (value: string) =>
  createHash("sha256").update(value).digest("hex");

function setup(overrides: Partial<AuthoritativeCheckoutFacts> = {}) {
  const repository: CheckoutRepository = {
    findAttempt: vi.fn(async () => null),
    loadFacts: vi.fn(
      async (): Promise<FactLoadResult> => ({
        ok: true,
        value: { ...facts, ...overrides },
      }),
    ),
    findExactReview: vi.fn(async () => null),
    prepare: vi.fn(
      async (plan): Promise<CheckoutPrepareResult> => ({
        status: plan.decision.reviewRequired ? "review_required" : "prepared",
        orderId: plan.identity.orderId,
        attemptId: plan.identity.attemptId,
        reviewRequestId: plan.decision.reviewRequired
          ? plan.identity.keyedUuid(`review:${plan.reviewSnapshotHash}`)
          : null,
        quote: plan.browserQuote,
      }),
    ),
    releaseDefiniteFailure: vi.fn(
      async (): Promise<DefiniteFailureReleaseResult> => ({ status: "released" }),
    ),
  };
  const shippingQuote = vi.fn(
    async (input: { bindingHash: string }): Promise<unknown> => ({
      status: "ready",
      bindingHash: input.bindingHash,
      reference: "ship_synthetic",
      service: "Synthetic Ground",
      amountMinor: 700,
      currency: "USD",
    }),
  );
  const taxQuote = vi.fn(
    async (input: { bindingHash: string }): Promise<unknown> => ({
      status: "ready",
      bindingHash: input.bindingHash,
      reference: "tax_synthetic",
      amountMinor: 325,
      currency: "USD",
    }),
  );
  const keyed = new Map<string, string>([
    [`${ids.buyer}:${ids.key}:order`, ids.order],
    [`${ids.buyer}:${ids.key}:attempt`, ids.attempt],
  ]);
  let suffix = 100;
  const service = createCheckoutService({
    repository,
    shippingQuotePort: { quoteShipping: shippingQuote },
    taxQuotePort: { quoteTax: taxQuote },
    sha256,
    clock: () => new Date(now),
    keyedUuid(label) {
      const known = keyed.get(label);
      if (known) return known;
      suffix += 1;
      return `20000000-0000-4000-8000-${suffix.toString().padStart(12, "0")}`;
    },
    moneyPolicy: {
      allowedCurrencies: ["USD"],
      maximumLineCount: 50,
      maximumQuantityPerLine: 25,
      maximumOrderAmountMinor: 1_000_000,
    },
  });
  return { service, repository, shippingQuote, taxQuote };
}

describe("authoritative checkout service", () => {
  it("strictly reparses unknown input before any repository or quote call", async () => {
    const { service, repository, shippingQuote, taxQuote } = setup();
    await expect(
      service.quote({
        buyerUserId: ids.buyer,
        idempotencyKey: ids.key,
        paymentProviderAvailable: true,
        request: { ...request, totalMinor: 9 },
      }),
    ).resolves.toEqual({
      status: "invalid_request",
      reason: "checkout_input_invalid",
    });
    expect(repository.findAttempt).not.toHaveBeenCalled();
    expect(repository.loadFacts).not.toHaveBeenCalled();
    expect(shippingQuote).not.toHaveBeenCalled();
    expect(taxQuote).not.toHaveBeenCalled();
  });

  it("quotes shipping then tax from authoritative facts with zero writes and a PII-free projection", async () => {
    const { service, repository, shippingQuote, taxQuote } = setup();
    const result = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request,
    });

    expect(result.status).toBe("quoted");
    if (result.status !== "quoted") throw new Error("expected quote");
    expect(result.quote).toEqual({
      status: "ready",
      reviewRequired: false,
      reasons: [],
      currency: "USD",
      subtotalMinor: 10_000,
      discountMinor: 0,
      shippingMinor: 700,
      taxMinor: 325,
      totalMinor: 11_025,
      lines: [
        {
          productId: ids.product,
          productName: "Synthetic Reference A",
          packageForm: "Sealed test unit",
          quantity: 2,
          unitAmountMinor: 5_000,
          subtotalMinor: 10_000,
          discountMinor: 0,
          totalMinor: 10_000,
        },
      ],
    });
    expect(shippingQuote).toHaveBeenCalledTimes(1);
    expect(taxQuote).toHaveBeenCalledTimes(1);
    expect(taxQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        shippingMinor: 700,
        shippingReference: "ship_synthetic",
        shippingService: "Synthetic Ground",
      }),
    );
    expect(shippingQuote.mock.invocationCallOrder[0]).toBeLessThan(
      taxQuote.mock.invocationCallOrder[0]!,
    );
    expect(repository.prepare).not.toHaveBeenCalled();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Synthetic Researcher");
    expect(serialized).not.toContain("100 Test Way");
    expect(serialized).not.toContain("ship_synthetic");
    expect(serialized).not.toContain("tax_synthetic");
    expect(() => JSON.stringify(result.plan)).toThrow(/never be serialized/i);
  });

  it("returns explicit review with truthful totals but still performs no write", async () => {
    const { service, repository } = setup({
      buyer: { ...facts.buyer, status: "review" },
    });
    const result = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request,
    });
    expect(result).toMatchObject({
      status: "quoted",
      quote: {
        status: "review_required",
        reviewRequired: true,
        reasons: ["buyer_review_required"],
        totalMinor: 11_025,
      },
    });
    expect(repository.prepare).not.toHaveBeenCalled();
  });

  it("denies hard gates before quote calls and writes nothing", async () => {
    const { service, repository, shippingQuote, taxQuote } = setup({
      buyer: { ...facts.buyer, status: "blocked" },
    });
    await expect(
      service.quote({
        buyerUserId: ids.buyer,
        idempotencyKey: ids.key,
        paymentProviderAvailable: true,
        request,
      }),
    ).resolves.toEqual({ status: "denied", reasons: ["buyer_blocked"] });
    expect(shippingQuote).not.toHaveBeenCalled();
    expect(taxQuote).not.toHaveBeenCalled();
    expect(repository.prepare).not.toHaveBeenCalled();
  });

  it("treats quote unavailability and malformed quote output as zero-write retryable results", async () => {
    const { service, repository, shippingQuote, taxQuote } = setup();
    shippingQuote.mockResolvedValueOnce({
      status: "unavailable",
      reason: "temporarily_unavailable",
    });
    await expect(
      service.quote({
        buyerUserId: ids.buyer,
        idempotencyKey: ids.key,
        paymentProviderAvailable: true,
        request,
      }),
    ).resolves.toEqual({
      status: "quote_unavailable",
      component: "shipping",
      reason: "temporarily_unavailable",
    });
    expect(taxQuote).not.toHaveBeenCalled();
    expect(repository.prepare).not.toHaveBeenCalled();

    shippingQuote.mockResolvedValueOnce({
      status: "ready",
      bindingHash: "bad",
      reference: "ship_synthetic",
      service: "Synthetic Ground",
      amountMinor: 700,
      currency: "USD",
    });
    await expect(
      service.quote({
        buyerUserId: ids.buyer,
        idempotencyKey: "20000000-0000-4000-8000-000000000099",
        paymentProviderAvailable: true,
        request,
      }),
    ).resolves.toEqual({
      status: "quote_invalid",
      component: "shipping",
    });
    expect(repository.prepare).not.toHaveBeenCalled();
  });

  it("requires the opaque plan and exact provider preparation only for a permitted mutation", async () => {
    const { service, repository } = setup();
    await expect(
      service.prepare({} as never, {
        authority: "server_prepared_provider_request",
        provider: "local_test",
        providerIdempotencyKey: `checkout_attempt:${ids.attempt}`,
        providerRequestHash: "c".repeat(64),
        providerExpiresAt: "2026-08-25T13:00:00.000Z",
        providerCustomerEmail: "synthetic.buyer@example.test",
        providerOrigin: "http://127.0.0.1:3000",
        providerRequestSchemaVersion: 1,
        providerLivemode: false,
        providerScope: "local_test:synthetic-propeptiq-v1",
      }),
    ).resolves.toEqual({ status: "invalid_plan" });

    const quoted = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request,
    });
    if (quoted.status !== "quoted") throw new Error("expected quote");
    expect(projectAuthoritativeCheckoutPlan({ ...quoted.plan })).toBeNull();
    expect(projectAuthoritativeCheckoutPlan(quoted.plan)).toBe(quoted.plan);
    expect(() => JSON.stringify(quoted.plan)).toThrow(
      "Authoritative checkout plans must never be serialized",
    );
    await expect(service.prepare(quoted.plan, null)).resolves.toEqual({
      status: "invalid_provider_preparation",
    });
    await expect(
      service.prepare(quoted.plan, {
        authority: "server_prepared_provider_request",
        provider: "local_test",
        providerIdempotencyKey: `checkout_attempt:${ids.attempt}`,
        providerRequestHash: "c".repeat(64),
        providerExpiresAt: "2026-08-25T13:00:00.000Z",
        providerCustomerEmail: "synthetic.buyer@example.test",
        providerOrigin: "http://127.0.0.1:3000",
        providerRequestSchemaVersion: 1,
        providerLivemode: false,
        providerScope: "local_test:synthetic-propeptiq-v1",
      }),
    ).resolves.toMatchObject({
      status: "prepared",
      orderId: ids.order,
      attemptId: ids.attempt,
    });
    expect(repository.prepare).toHaveBeenCalledTimes(1);
  });

  it("returns a same-buyer key conflict before fact or quote work", async () => {
    const { service, repository, shippingQuote } = setup();
    vi.mocked(repository.findAttempt).mockResolvedValueOnce({
      orderId: ids.order,
      attemptId: ids.attempt,
      requestHash: "f".repeat(64),
      status: "created",
      orderState: "eligibility_review",
      permitted: false,
      reviewRequired: true,
      hasReservations: false,
      quoteSnapshot: null,
    });
    await expect(
      service.quote({
        buyerUserId: ids.buyer,
        idempotencyKey: ids.key,
        paymentProviderAvailable: true,
        request,
      }),
    ).resolves.toEqual({ status: "idempotency_conflict" });
    expect(repository.loadFacts).not.toHaveBeenCalled();
    expect(shippingQuote).not.toHaveBeenCalled();
  });

  it.each([
    { attemptStatus: "failed", orderState: "cancelled" },
    { attemptStatus: "provider_unknown", orderState: "checkout_pending" },
  ] as const)(
    "projects $attemptStatus replay as an explicit frozen attempt outcome, not a fresh quote",
    async ({ attemptStatus, orderState }) => {
      const { service, repository, shippingQuote, taxQuote } = setup();
      const quoteSnapshot = {
        status: "ready" as const,
        reviewRequired: false,
        reasons: [] as string[],
        currency: "USD" as const,
        subtotalMinor: 10_000,
        discountMinor: 0,
        shippingMinor: 700,
        taxMinor: 325,
        totalMinor: 11_025,
        lines: [] as const,
      };
      vi.mocked(repository.findAttempt).mockResolvedValueOnce({
        orderId: ids.order,
        attemptId: ids.attempt,
        requestHash: await hashCheckoutRequest(request, sha256),
        status: attemptStatus,
        orderState,
        permitted: true,
        reviewRequired: false,
        hasReservations: attemptStatus === "provider_unknown",
        quoteSnapshot,
      });

      const replay: CheckoutQuoteResult = await service.quote({
        buyerUserId: ids.buyer,
        idempotencyKey: ids.key,
        paymentProviderAvailable: true,
        request,
      });

      expect(replay).toEqual({
        status: "loaded",
        orderId: ids.order,
        attemptId: ids.attempt,
        attemptStatus,
        orderState,
        quoteSnapshot,
      });
      expect(Reflect.ownKeys(replay).toSorted()).toEqual(
        [
          "attemptId",
          "attemptStatus",
          "orderId",
          "orderState",
          "quoteSnapshot",
          "status",
        ].toSorted(),
      );
      expect(Object.isFrozen(replay)).toBe(true);
      expect(replay).not.toHaveProperty("quote");
      if (replay.status !== "loaded") throw new Error("expected loaded replay");
      expectTypeOf(replay).toEqualTypeOf<CheckoutLoadedResult>();
      expectTypeOf(replay.attemptStatus).toEqualTypeOf<CheckoutAttemptStatus>();
      expect(repository.loadFacts).not.toHaveBeenCalled();
      expect(shippingQuote).not.toHaveBeenCalled();
      expect(taxQuote).not.toHaveBeenCalled();
    },
  );
});
