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
import type { CheckoutRewardsQuote } from "@/growth/rewards-service";
import type { ReferralCheckoutQuote } from "@/growth/referral-service";
import type { AffiliateCheckoutQuote } from "@/growth/affiliate-service";

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
  rewardAccount: "20000000-0000-4000-8000-000000000012",
  loyaltyPolicy: "20000000-0000-4000-8000-000000000013",
  growthTerms: "20000000-0000-4000-8000-000000000014",
  referralPolicy: "20000000-0000-4000-8000-000000000015",
  referralCode: "20000000-0000-4000-8000-000000000016",
  referrer: "20000000-0000-4000-8000-000000000017",
  affiliateProfile: "20000000-0000-4000-8000-000000000019",
  affiliatePolicy: "20000000-0000-4000-8000-000000000020",
  affiliateUser: "20000000-0000-4000-8000-000000000021",
  variant: "20000000-0000-4000-8000-000000000022",
  variant2: "20000000-0000-4000-8000-000000000023",
  promotion: "20000000-0000-4000-8000-000000000024",
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

function setup(
  overrides: Partial<AuthoritativeCheckoutFacts> = {},
  options: Readonly<{
    rewardsQuoteResult?: CheckoutRewardsQuote;
    referralQuoteResult?: ReferralCheckoutQuote;
    affiliateQuoteResult?: AffiliateCheckoutQuote;
    omitReferralService?: boolean;
  }> = {},
) {
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
  const rewardsService = {
    quoteCheckoutRewards: vi.fn(async () =>
      options.rewardsQuoteResult ?? {
        status: "unavailable" as const,
        reason: "configuration_unavailable" as const,
      },
    ),
    reserveCheckoutRewards: vi.fn(async () => ({ status: "reserved" as const })),
  };
  const referralService = {
    quoteCustomerReferral: vi.fn(async () =>
      options.referralQuoteResult ?? Object.freeze({
        status: "unavailable" as const,
        reason: "attribution_invalid" as const,
      })),
  };
  const affiliateService = {
    quoteAffiliateAttribution: vi.fn(async () =>
      options.affiliateQuoteResult ?? Object.freeze({
        status: "unavailable" as const,
        reason: "attribution_invalid" as const,
      })),
  };
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
    ...{
      rewardsService,
      ...(options.omitReferralService ? {} : { referralService }),
      affiliateService,
    },
  });
  return {
    service,
    repository,
    shippingQuote,
    taxQuote,
    rewardsService,
    referralService,
    affiliateService,
  };
}

describe("authoritative checkout service", () => {
  it("fails closed when a signed attribution cookie has no referral composition", async () => {
    const { service, repository, shippingQuote, taxQuote } = setup({}, {
      omitReferralService: true,
    });

    await expect(service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      attributionCookie: "signed-attribution-cookie",
      request,
    })).resolves.toEqual({ status: "internal_conflict" });
    expect(repository.prepare).not.toHaveBeenCalled();
    expect(shippingQuote).not.toHaveBeenCalled();
    expect(taxQuote).not.toHaveBeenCalled();
  });

  it("keeps an eligible affiliate snapshot private and does not change checkout totals", async () => {
    const affiliateQuoteResult = Object.freeze({
      status: "eligible" as const,
      code: "aff_6BOpaqueAttribution9",
      affiliateProfileId: ids.affiliateProfile,
      affiliateUserId: ids.affiliateUser,
      existingAttributionId: null,
      clickedAt: "2026-08-20T12:00:00.000Z",
      expiresAt: "2026-09-19T12:00:00.000Z",
      affiliatePolicyId: ids.affiliatePolicy,
      affiliatePolicyVersion: 1,
    });
    const { service, affiliateService } = setup({}, { affiliateQuoteResult });

    const result = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      attributionCookie: "signed-affiliate-cookie",
      request,
    });

    expect(result.status).toBe("quoted");
    if (result.status !== "quoted") throw new Error("expected affiliate quote");
    expect(affiliateService.quoteAffiliateAttribution).toHaveBeenCalledWith({
      buyerUserId: ids.buyer,
      attributionCookie: "signed-affiliate-cookie",
      now,
    });
    expect(result.quote).toMatchObject({
      subtotalMinor: 10_000,
      promotionDiscountMinor: 0,
      referralDiscountMinor: 0,
      totalMinor: 11_025,
    });
    expect(result.quote).not.toHaveProperty("affiliate");
    expect(result.quote).not.toHaveProperty("commission");
    expect(result.plan.affiliateQuote).toEqual(affiliateQuoteResult);
  });

  it("continues only for explicit affiliate ineligibility and fails closed for lookup conflict", async () => {
    const explicitlyIneligible = setup({}, {
      affiliateQuoteResult: Object.freeze({
        status: "unavailable" as const,
        reason: "profile_inactive" as const,
      }),
    });
    await expect(explicitlyIneligible.service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      attributionCookie: "signed-inactive-affiliate-cookie",
      request,
    })).resolves.toMatchObject({ status: "quoted" });

    const lookupConflict = setup({}, {
      affiliateQuoteResult: Object.freeze({
        status: "internal_conflict" as const,
      }) as unknown as AffiliateCheckoutQuote,
    });
    await expect(lookupConflict.service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      attributionCookie: "signed-affiliate-cookie",
      request,
    })).resolves.toEqual({ status: "internal_conflict" });
  });

  it("fails closed when customer-referral and affiliate programs are both eligible", async () => {
    const referralQuoteResult = Object.freeze({
      status: "eligible" as const,
      code: "ref_5BCheckoutOpaque",
      referralCodeId: ids.referralCode,
      referrerUserId: ids.referrer,
      clickedAt: "2026-08-20T12:00:00.000Z",
      expiresAt: "2026-09-19T12:00:00.000Z",
      referralPolicyId: ids.referralPolicy,
      referralPolicyVersion: 1,
      referralDiscountMinor: 1_000,
    });
    const affiliateQuoteResult = Object.freeze({
      status: "eligible" as const,
      code: "aff_6BOpaqueAttribution9",
      affiliateProfileId: ids.affiliateProfile,
      affiliateUserId: ids.affiliateUser,
      existingAttributionId: null,
      clickedAt: "2026-08-20T12:00:00.000Z",
      expiresAt: "2026-09-19T12:00:00.000Z",
      affiliatePolicyId: ids.affiliatePolicy,
      affiliatePolicyVersion: 1,
    });
    const { service } = setup({}, { referralQuoteResult, affiliateQuoteResult });
    await expect(service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      attributionCookie: "incoherent-cookie",
      request,
    })).resolves.toEqual({ status: "internal_conflict" });
  });
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

  it("accepts only requested reward points and projects a server-authoritative redemption row", async () => {
    const rewardsQuoteResult = Object.freeze({
      status: "applied" as const,
      rewardAccountId: ids.rewardAccount,
      loyaltyPolicyId: ids.loyaltyPolicy,
      loyaltyPolicyVersion: 1,
      termsVersionId: ids.growthTerms,
      termsContentHash: "a".repeat(64),
      redemptionPoints: 2_000,
      redemptionMinor: 2_000,
      maximumPoints: 2_500,
      eligibleMerchandiseMinor: 8_000,
      pendingBaseEarnPoints: 160,
    });
    const { service, rewardsService, shippingQuote, taxQuote } = setup(
      {},
      { rewardsQuoteResult },
    );

    const result = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: { ...request, rewardRedemptionPoints: 2_000 },
    });

    expect(result.status).toBe("quoted");
    if (result.status !== "quoted") throw new Error("expected rewards quote");
    expect(rewardsService.quoteCheckoutRewards).toHaveBeenCalledWith({
      buyerUserId: ids.buyer,
      requestedPoints: 2_000,
      postPromotionMerchandiseMinor: 10_000,
      currency: "USD",
      now,
    });
    expect(shippingQuote).toHaveBeenCalledWith(
      expect.objectContaining({
        merchandiseTotalMinor: 8_000,
        items: [
          {
            productId: ids.product,
            quantity: 2,
            netAmountMinor: 8_000,
          },
        ],
      }),
    );
    expect(taxQuote).toHaveBeenCalledWith(
      expect.objectContaining({ merchandiseTotalMinor: 8_000 }),
    );
    expect(result.quote).toMatchObject({
      currency: "USD",
      subtotalMinor: 10_000,
      promotionDiscountMinor: 0,
      referralDiscountMinor: 0,
      rewardRedemptionPoints: 2_000,
      rewardRedemptionMinor: 2_000,
      discountMinor: 2_000,
      shippingMinor: 700,
      taxMinor: 325,
      totalMinor: 9_025,
      pendingBaseEarnPoints: 160,
      rewardsBenefitAvailable: true,
      rewardsUnavailableReason: null,
    });
  });

  it("applies the greater referral acquisition discount and then caps points against the post-referral merchandise", async () => {
    const referralQuoteResult = Object.freeze({
      status: "eligible" as const,
      code: "ref_5BCheckoutOpaque",
      referralCodeId: ids.referralCode,
      referrerUserId: ids.referrer,
      clickedAt: "2026-08-20T12:00:00.000Z",
      expiresAt: "2026-09-19T12:00:00.000Z",
      referralPolicyId: ids.referralPolicy,
      referralPolicyVersion: 1,
      referralDiscountMinor: 2_500,
    });
    const promotion = Object.freeze({
      authority: "server_resolved_promotion" as const,
      id: "20000000-0000-4000-8000-000000000018",
      version: 1,
      code: "SYNTHETIC1000",
      name: "Synthetic acquisition promotion",
      kind: "discount" as const,
      status: "active" as const,
      currentlyEffective: true,
      amountMinor: 1_000,
      currency: "USD",
      basisPoints: null,
      targetProductIds: [ids.product],
      targetPolicyGroupIds: [],
    });
    const rewardsQuoteResult = Object.freeze({
      status: "applied" as const,
      rewardAccountId: ids.rewardAccount,
      loyaltyPolicyId: ids.loyaltyPolicy,
      loyaltyPolicyVersion: 1,
      termsVersionId: ids.growthTerms,
      termsContentHash: "a".repeat(64),
      redemptionPoints: 1_000,
      redemptionMinor: 1_000,
      maximumPoints: 1_875,
      eligibleMerchandiseMinor: 7_500,
      pendingBaseEarnPoints: 130,
    });
    const { service, referralService, rewardsService } = setup(
      { promotion },
      { referralQuoteResult, rewardsQuoteResult },
    );

    const result = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      attributionCookie: "signed-referral-cookie",
      request: {
        ...request,
        promotionIds: [promotion.id],
        rewardRedemptionPoints: 1_000,
      },
    });

    expect(result.status).toBe("quoted");
    if (result.status !== "quoted") throw new Error("expected referral quote");
    expect(referralService.quoteCustomerReferral).toHaveBeenCalledWith({
      buyerUserId: ids.buyer,
      attributionCookie: "signed-referral-cookie",
      merchandiseSubtotalMinor: 10_000,
      currency: "USD",
      now,
    });
    expect(rewardsService.quoteCheckoutRewards).toHaveBeenCalledWith({
      buyerUserId: ids.buyer,
      requestedPoints: 1_000,
      postPromotionMerchandiseMinor: 7_500,
      currency: "USD",
      now,
    });
    expect(result.quote).toMatchObject({
      subtotalMinor: 10_000,
      promotionDiscountMinor: 0,
      referralDiscountMinor: 2_500,
      rewardRedemptionMinor: 1_000,
      discountMinor: 3_500,
      totalMinor: 7_525,
    });
    expect(JSON.stringify(result.quote)).not.toContain(ids.referrer);
    expect(projectAuthoritativeCheckoutPlan(result.plan)?.referralQuote).toEqual(
      referralQuoteResult,
    );
  });

  it("projects a referral acquisition discount when no points redemption was requested", async () => {
    const referralQuoteResult = Object.freeze({
      status: "eligible" as const,
      code: "ref_5BCheckoutOpaque",
      referralCodeId: ids.referralCode,
      referrerUserId: ids.referrer,
      clickedAt: "2026-08-20T12:00:00.000Z",
      expiresAt: "2026-09-19T12:00:00.000Z",
      referralPolicyId: ids.referralPolicy,
      referralPolicyVersion: 1,
      referralDiscountMinor: 1_000,
    });
    const { service } = setup({}, { referralQuoteResult });

    const result = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      attributionCookie: "signed-referral-cookie",
      request,
    });

    expect(result.status).toBe("quoted");
    if (result.status !== "quoted") throw new Error("expected referral quote");
    expect(result.quote).toMatchObject({
      promotionDiscountMinor: 0,
      referralDiscountMinor: 1_000,
      rewardRedemptionPoints: 0,
      rewardRedemptionMinor: 0,
      pendingBaseEarnPoints: 0,
      rewardsBenefitAvailable: false,
      rewardsUnavailableReason: "not_requested",
      discountMinor: 1_000,
    });
  });

  it("keeps ordinary checkout available with no growth write when current rewards terms are unavailable", async () => {
    const { service, rewardsService } = setup(
      {},
      {
        rewardsQuoteResult: Object.freeze({
          status: "unavailable" as const,
          reason: "terms_unavailable" as const,
        }),
      },
    );

    const result = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: { ...request, rewardRedemptionPoints: 500 },
    });

    expect(result.status).toBe("quoted");
    if (result.status !== "quoted") throw new Error("expected fallback quote");
    expect(result.quote).toMatchObject({
      subtotalMinor: 10_000,
      promotionDiscountMinor: 0,
      referralDiscountMinor: 0,
      rewardRedemptionPoints: 0,
      rewardRedemptionMinor: 0,
      discountMinor: 0,
      totalMinor: 11_025,
      pendingBaseEarnPoints: 0,
      rewardsBenefitAvailable: false,
      rewardsUnavailableReason: "terms_unavailable",
    });
    expect(rewardsService.reserveCheckoutRewards).not.toHaveBeenCalled();
  });

  it.each([
    ["rewardRedemptionRate", 0.01],
    ["availableRewardPoints", 50_000],
    ["rewardRedemptionMinor", 500],
    ["pendingBaseEarnPoints", 999_999],
    ["loyaltyPolicyId", ids.loyaltyPolicy],
    ["loyaltyPolicyVersion", 99],
    ["rewardLedgerId", ids.rewardAccount],
    ["totalMinor", 1],
  ] as const)(
    "rejects browser-supplied rewards authority field %s before any server work",
    async (field, value) => {
      const { service, repository, rewardsService, shippingQuote, taxQuote } = setup();
      await expect(
        service.quote({
          buyerUserId: ids.buyer,
          idempotencyKey: ids.key,
          paymentProviderAvailable: true,
          request: {
            ...request,
            rewardRedemptionPoints: 500,
            [field]: value,
          },
        }),
      ).resolves.toEqual({
        status: "invalid_request",
        reason: "checkout_input_invalid",
      });
      expect(repository.findAttempt).not.toHaveBeenCalled();
      expect(repository.loadFacts).not.toHaveBeenCalled();
      expect(rewardsService.quoteCheckoutRewards).not.toHaveBeenCalled();
      expect(shippingQuote).not.toHaveBeenCalled();
      expect(taxQuote).not.toHaveBeenCalled();
    },
  );

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
      promotionDiscountMinor: 0,
      referralDiscountMinor: 0,
      rewardRedemptionPoints: 0,
      rewardRedemptionMinor: 0,
      pendingBaseEarnPoints: 0,
      rewardsBenefitAvailable: false,
      rewardsUnavailableReason: "not_requested",
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
        promotionDiscountMinor: 0,
        referralDiscountMinor: 0,
        rewardRedemptionPoints: 0,
        rewardRedemptionMinor: 0,
        pendingBaseEarnPoints: 0,
        rewardsBenefitAvailable: false,
        rewardsUnavailableReason: "not_requested",
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

const variantRequest = {
  items: [{ variantId: ids.variant, quantity: 2 }],
  destination: request.destination,
};

const variantFacts = Object.freeze({
  buyer: facts.buyer,
  items: Object.freeze([Object.freeze({
    variantId: ids.variant,
    productId: ids.product,
    sku: "TEST-ALPHA-5MG",
    variantLabel: "5 mg test fixture",
    productName: "Synthetic Reference A",
    packageForm: "Sealed test unit",
    policyGroupId: ids.group,
    productActive: true,
    policyGroupActive: true,
    variantActive: true,
    availabilityRevision: "variant-revision-1",
    inventoryRevision: "inventory-revision-1",
    price: Object.freeze({
      id: ids.price,
      version: 1,
      status: "active" as const,
      amountMinor: 5_000,
      currency: "USD",
      effectiveAt: "2026-08-01T00:00:00.000Z",
    }),
    stripeProductId: "prod_synthetic_task5",
    stripePriceId: "price_synthetic_task5",
    destination: facts.items[0]!.destination,
    eligibleLots: facts.items[0]!.eligibleLots,
  })]),
  automaticPromotions: Object.freeze([]),
});

function automaticPromotion(change: Record<string, unknown> = {}) {
  return Object.freeze({
    recordId: ids.promotion,
    campaignKey: "winter30",
    version: 1,
    id: "winter30",
    displayName: "Winter Sale",
    displayCode: "WINTER30",
    discountBps: 3_000,
    enabled: true,
    startAt: null,
    endAt: null,
    timezone: "America/Los_Angeles",
    scope: Object.freeze({ kind: "sitewide" as const }),
    applicationMode: "automatic" as const,
    ...change,
  });
}

function setupVariant(
  factChanges: Record<string, unknown> = {},
  options: Readonly<{
    referralDiscountMinor?: number;
    rewardsQuoteResult?: CheckoutRewardsQuote;
  }> = {},
) {
  const loadedFacts = Object.freeze({ ...variantFacts, ...factChanges });
  const repository = {
    findAttempt: vi.fn(async () => null),
    loadVariantFacts: vi.fn(async () => ({ ok: true as const, value: loadedFacts })),
    findExactReview: vi.fn(async () => null),
    prepare: vi.fn(async (plan: { decision: { reviewRequired: boolean }; identity: { orderId: string; attemptId: string }; browserQuote: unknown }) => ({
      status: plan.decision.reviewRequired ? "review_required" as const : "prepared" as const,
      orderId: plan.identity.orderId,
      attemptId: plan.identity.attemptId,
      reviewRequestId: null,
      quote: plan.browserQuote,
    })),
    releaseDefiniteFailure: vi.fn(async () => ({ status: "released" as const })),
  };
  const shippingQuote = vi.fn(async (input: { bindingHash: string }) => ({
    status: "ready" as const,
    bindingHash: input.bindingHash,
    reference: "ship_variant_synthetic",
    service: "Synthetic Ground",
    amountMinor: 700,
    currency: "USD" as const,
  }));
  const taxQuote = vi.fn(async (input: { bindingHash: string }) => ({
    status: "ready" as const,
    bindingHash: input.bindingHash,
    reference: "tax_variant_synthetic",
    amountMinor: 325,
    currency: "USD" as const,
  }));
  const referralService = {
    quoteCustomerReferral: vi.fn(async () => options.referralDiscountMinor === undefined
      ? Object.freeze({ status: "unavailable" as const, reason: "attribution_invalid" as const })
      : Object.freeze({
          status: "eligible" as const,
          code: "ref_task5_variant",
          referralCodeId: ids.referralCode,
          referrerUserId: ids.referrer,
          clickedAt: "2026-08-20T12:00:00.000Z",
          expiresAt: "2026-09-19T12:00:00.000Z",
          referralPolicyId: ids.referralPolicy,
          referralPolicyVersion: 1,
          referralDiscountMinor: options.referralDiscountMinor,
        })),
  };
  const rewardsService = {
    quoteCheckoutRewards: vi.fn(async () => options.rewardsQuoteResult ?? Object.freeze({
      status: "unavailable" as const,
      reason: "configuration_unavailable" as const,
    })),
    reserveCheckoutRewards: vi.fn(async () => ({ status: "reserved" as const })),
  };
  const service = createCheckoutService({
    repository: repository as never,
    shippingQuotePort: { quoteShipping: shippingQuote },
    taxQuotePort: { quoteTax: taxQuote },
    sha256,
    clock: () => new Date(now),
    keyedUuid(label) {
      if (label.endsWith(":order")) return ids.order;
      if (label.endsWith(":attempt")) return ids.attempt;
      return "20000000-0000-4000-8000-000000000099";
    },
    moneyPolicy: {
      allowedCurrencies: ["USD"],
      maximumLineCount: 50,
      maximumQuantityPerLine: 25,
      maximumOrderAmountMinor: 1_000_000,
    },
    referralService,
    affiliateService: {
      quoteAffiliateAttribution: vi.fn(async () => Object.freeze({
        status: "unavailable" as const,
        reason: "attribution_invalid" as const,
      })),
    },
    rewardsService,
  });
  return { service, repository, shippingQuote, taxQuote, rewardsService };
}

describe("authoritative canonical variant quote lifecycle", () => {
  it.each([
    ["disabled", automaticPromotion({ enabled: false }), 9_200],
    ["scheduled", automaticPromotion({ startAt: "2026-08-25T12:00:00.001Z" }), 9_200],
    ["expired", automaticPromotion({ endAt: now.toISOString() }), 9_200],
    ["partial scope", automaticPromotion({ scope: { kind: "variants", variantIds: [ids.variant2] } }), 9_200],
    ["active inclusive start", automaticPromotion({ startAt: now.toISOString() }), 7_000],
  ] as const)("resolves %s promotion only from server time and scope", async (_label, promotion, expectedSubtotal) => {
    const { service } = setupVariant({ automaticPromotions: [promotion] });
    const result = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: variantRequest,
    });
    expect(result).toMatchObject({
      status: "quoted",
      quote: { lines: [{ totalMinor: expectedSubtotal }] },
    });
  });

  it("chooses the best overlapping promotion deterministically", async () => {
    const { service } = setupVariant({
      automaticPromotions: [
        automaticPromotion({ id: "spring20", campaignKey: "spring20", discountBps: 2_000 }),
        automaticPromotion(),
      ],
    });
    const result = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: variantRequest,
    });
    expect(result).toMatchObject({
      status: "quoted",
      quote: { promotionDiscountMinor: 3_000, discountMinor: 3_000 },
    });
  });

  it.each([
    ["pending price", { price: { ...variantFacts.items[0]!.price, status: "pending", amountMinor: 0 } }, "pricing_coming_soon"],
    ["zero price", { price: { ...variantFacts.items[0]!.price, amountMinor: 0 } }, "pricing_coming_soon"],
    ["missing mapping", { stripePriceId: null }, "payment_mapping_missing"],
    ["invalid currency", { price: { ...variantFacts.items[0]!.price, currency: "EUR" } }, "invalid_currency"],
    ["unavailable inventory", { eligibleLots: [], inventoryRevision: "inventory-revision-2" }, "unavailable"],
  ] as const)("returns CHECKOUT_UNAVAILABLE for %s before quotes or writes", async (_label, change, code) => {
    const { service, repository, shippingQuote, taxQuote } = setupVariant({
      items: [{ ...variantFacts.items[0]!, ...change }],
    });
    await expect(service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: variantRequest,
    })).resolves.toEqual({
      status: "CHECKOUT_UNAVAILABLE",
      reasons: [{ variantId: ids.variant, code }],
    });
    expect(shippingQuote).not.toHaveBeenCalled();
    expect(taxQuote).not.toHaveBeenCalled();
    expect(repository.prepare).not.toHaveBeenCalled();
  });

  it("returns PRICE_CHANGED with refreshed safe cart before reservation on a stale session", async () => {
    const first = setupVariant({ automaticPromotions: [automaticPromotion()] });
    const quoted = await first.service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: variantRequest,
    });
    expect(quoted.status).toBe("quoted");
    if (quoted.status !== "quoted") throw new Error("expected initial quote");

    const changed = setupVariant({
      items: [{
        ...variantFacts.items[0]!,
        price: { ...variantFacts.items[0]!.price, version: 2, amountMinor: 6_000 },
      }],
      automaticPromotions: [automaticPromotion()],
    });
    const result = await (changed.service as unknown as { quoteForSession: (input: unknown) => Promise<unknown> }).quoteForSession({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      request: { ...variantRequest, pricingRevision: quoted.pricingRevision },
    });
    expect(result).toMatchObject({
      status: "PRICE_CHANGED",
      pricingRevision: expect.stringMatching(/^[0-9a-f]{64}$/u),
      cart: {
        items: [{ variantId: ids.variant, unitAmountMinor: 4_200 }],
      },
    });
    expect(changed.repository.prepare).not.toHaveBeenCalled();
  });

  it("does not trust a claimed inactive WINTER30 or a mixed claimed product/variant relationship", async () => {
    const { service, repository } = setupVariant({
      automaticPromotions: [automaticPromotion({ enabled: false })],
    });
    for (const hostile of [
      { ...variantRequest, promotionIds: ["winter30"] },
      { ...variantRequest, items: [{ variantId: ids.variant, productId: ids.product, quantity: 2 }] },
    ]) {
      await expect(service.quote({
        buyerUserId: ids.buyer,
        idempotencyKey: ids.key,
        paymentProviderAvailable: true,
        request: hostile,
      })).resolves.toEqual({ status: "invalid_request", reason: "checkout_input_invalid" });
    }
    expect(repository.loadVariantFacts).not.toHaveBeenCalled();
  });

  it.each([
    [2_000, 3_000, 0],
    [4_000, 0, 4_000],
  ] as const)("selects one storefront/referral winner at %i referral minor", async (referralMinor, promotionMinor, referralExpected) => {
    const rewardsQuoteResult = Object.freeze({
      status: "applied" as const,
      rewardAccountId: ids.rewardAccount,
      loyaltyPolicyId: ids.loyaltyPolicy,
      loyaltyPolicyVersion: 1,
      termsVersionId: ids.growthTerms,
      termsContentHash: "a".repeat(64),
      redemptionPoints: 500,
      redemptionMinor: 500,
      maximumPoints: 1_000,
      eligibleMerchandiseMinor: 6_000,
      pendingBaseEarnPoints: 100,
    });
    const { service } = setupVariant(
      { automaticPromotions: [automaticPromotion()] },
      { referralDiscountMinor: referralMinor, rewardsQuoteResult },
    );
    const result = await service.quote({
      buyerUserId: ids.buyer,
      idempotencyKey: ids.key,
      paymentProviderAvailable: true,
      attributionCookie: "signed-referral-cookie",
      request: { ...variantRequest, rewardRedemptionPoints: 500 },
    });
    expect(result).toMatchObject({
      status: "quoted",
      quote: {
        promotionDiscountMinor: promotionMinor,
        referralDiscountMinor: referralExpected,
        rewardRedemptionMinor: 500,
        discountMinor: Math.max(3_000, referralMinor) + 500,
      },
    });
    if (result.status !== "quoted") throw new Error("expected acquisition quote");
    expect(projectAuthoritativeCheckoutPlan(result.plan)?.rewardsQuote).toMatchObject({
      status: "applied",
      redemptionPoints: 500,
    });
  });
});
