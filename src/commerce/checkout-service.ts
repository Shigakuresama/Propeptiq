import {
  canonicalReviewPolicies,
  createCheckoutIdentity,
  hashCanonicalEnvelope,
  hashCheckoutRequest,
  hashReviewSnapshot,
  isCanonicalUuid,
  type CheckoutIdentity,
  type KeyedUuidGenerator,
  type Sha256Hasher,
} from "@/commerce/checkout-identity";
import {
  parseProviderPreparation,
  parseRewardsCheckoutRequest,
  parseShippingQuoteResult,
  parseTaxQuoteResult,
  type ProviderPreparation,
  type ShippingQuote,
  type ShippingQuotePort,
  type TaxQuote,
  type TaxQuotePort,
  type RewardsCheckoutRequest,
} from "@/commerce/checkout-ports";
import type { CheckoutRequest } from "@/domain/checkout";
import {
  evaluateCheckout,
  type BuyerStatus,
  type CheckoutDecision,
  type DestinationResolution,
} from "@/domain/eligibility";
import {
  calculateOrderTotals,
  type MoneyPolicy,
  type OrderTotals,
} from "@/domain/money";
import {
  calculatePromotionDiscount,
  selectBestAcquisitionDiscount,
  type PromotionRecord,
} from "@/domain/promotions";
import type { OrderState } from "@/domain/orders";
import type {
  CheckoutRewardsQuote,
  AppliedCheckoutRewards,
  RewardsCheckoutReservationResult,
} from "@/growth/rewards-service";
import type {
  EligibleReferralCheckoutQuote,
  ReferralCheckoutQuote,
} from "@/growth/referral-service";
import type {
  AffiliateCheckoutQuote,
  EligibleAffiliateCheckoutQuote,
} from "@/growth/affiliate-service";

export type AuthoritativeLotFact = Readonly<{
  id: string;
  status: "released";
  receivedQuantity: number;
  availableQuantity: number;
  expiresAt: string | null;
}>;

export type AuthoritativeCheckoutItemFact = Readonly<{
  productId: string;
  productName: string;
  packageForm: string;
  policyGroupId: string;
  productActive: boolean;
  policyGroupActive: boolean;
  price: Readonly<{
    id: string;
    version: number;
    amountMinor: number;
    currency: "USD";
    effectiveAt: string;
    supersededAt: null;
  }>;
  destination: DestinationResolution;
  eligibleLots: readonly AuthoritativeLotFact[];
}>;

export type AuthoritativeCheckoutFacts = Readonly<{
  buyer: Readonly<{
    userId: string;
    emailVerified: boolean;
    status: BuyerStatus;
    currentAttestationVersionId: string;
    currentAttestationVersion: number;
    attestationAcceptanceId: string | null;
    acceptedAttestationVersionId: string | null;
  }>;
  items: readonly AuthoritativeCheckoutItemFact[];
  promotion: PromotionRecord | null;
}>;

export type BrowserCheckoutQuote = Readonly<{
  status: "ready" | "review_required";
  reviewRequired: boolean;
  reasons: readonly string[];
  currency: "USD";
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
  promotionDiscountMinor: number;
  referralDiscountMinor: number;
  rewardRedemptionPoints: number;
  rewardRedemptionMinor: number;
  pendingBaseEarnPoints: number;
  rewardsBenefitAvailable: boolean;
  rewardsUnavailableReason: string | null;
  lines: readonly Readonly<{
    productId: string;
    productName: string;
    packageForm: string;
    quantity: number;
    unitAmountMinor: number;
    subtotalMinor: number;
    discountMinor: number;
    totalMinor: number;
  }>[];
}>;

export type ExactReviewDecision = Readonly<{
  reviewRequestId: string;
  reviewSnapshotHash: string;
  outcome: "approved" | "rejected";
  coversBuyerReview: boolean;
  destinationPolicyIds: readonly string[];
}>;

export type CheckoutAttemptStatus =
  | "created"
  | "open"
  | "provider_unknown"
  | "completed"
  | "expired"
  | "failed";

export type StoredCheckoutAttempt = Readonly<{
  orderId: string;
  attemptId: string;
  requestHash: string;
  status: CheckoutAttemptStatus;
  orderState: OrderState;
  permitted: boolean;
  reviewRequired: boolean;
  hasReservations: boolean;
  quoteSnapshot: BrowserCheckoutQuote | null;
}>;

export type CheckoutLoadedResult = Readonly<{
  status: "loaded";
  orderId: string;
  attemptId: string;
  attemptStatus: CheckoutAttemptStatus;
  orderState: OrderState;
  quoteSnapshot: BrowserCheckoutQuote | null;
}>;

export type FactLoadResult =
  | Readonly<{ ok: true; value: AuthoritativeCheckoutFacts }>
  | Readonly<{ ok: false; reasons: readonly string[] }>;

export type CheckoutPrepareResult =
  | Readonly<{
      status: "prepared" | "review_required";
      orderId: string;
      attemptId: string;
      reviewRequestId: string | null;
      quote: BrowserCheckoutQuote;
    }>
  | Readonly<{ status: "review_rejected"; orderId: string; attemptId: string }>
  | Readonly<{ status: "facts_changed_retry" }>
  | Readonly<{ status: "idempotency_conflict" }>
  | CheckoutLoadedResult;

type DefiniteFailureReleaseCommon = Readonly<{
  authority: "authoritative_provider_terminal";
  providerEvidenceId: string;
  attemptId: string;
  orderId: string;
  provider: "stripe" | "local_test";
  providerIdempotencyKey: string;
}>;

export type DefiniteFailureReleaseInput =
  | (DefiniteFailureReleaseCommon &
      Readonly<{
        cause: "definite_rejection";
        targetAttemptStatus: "failed";
      }>)
  | (DefiniteFailureReleaseCommon &
      Readonly<{
        cause: "verified_expiry";
        providerSessionId: string;
        providerLivemode: boolean;
        providerScope: string;
        amountMinor: number;
        currency: "USD";
        targetAttemptStatus: "expired";
      }>);

export type DefiniteFailureReleaseResult = Readonly<{
  status: "released" | "already_released" | "payment_verified" | "conflict";
}>;

export type CheckoutRepository = Readonly<{
  findAttempt: (input: Readonly<{
    buyerUserId: string;
    idempotencyKey: string;
  }>) => Promise<StoredCheckoutAttempt | null>;
  loadFacts: (input: Readonly<{
    buyerUserId: string;
    request: CheckoutRequest;
    now: Date;
  }>) => Promise<FactLoadResult>;
  findExactReview: (input: Readonly<{
    orderId: string;
    buyerUserId: string;
    snapshotHash: string;
  }>) => Promise<ExactReviewDecision | null>;
  prepare: (
    plan: AuthoritativeCheckoutPlan,
    providerPreparation: ProviderPreparation | null,
  ) => Promise<CheckoutPrepareResult>;
  releaseDefiniteFailure: (
    input: DefiniteFailureReleaseInput,
  ) => Promise<DefiniteFailureReleaseResult>;
}>;

export type AuthoritativeCheckoutPlanData = Readonly<{
  identity: CheckoutIdentity;
  buyerUserId: string;
  idempotencyKey: string;
  request: RewardsCheckoutRequest;
  requestHash: string;
  authoritativeAt: Date;
  factsHash: string;
  facts: AuthoritativeCheckoutFacts;
  reviewSnapshotHash: string | null;
  exactReview: ExactReviewDecision | null;
  decision: CheckoutDecision;
  shippingQuote: ShippingQuote | null;
  taxQuote: TaxQuote | null;
  totals: OrderTotals | null;
  promotionDiscountMinor: number;
  referralDiscountMinor: number;
  selectedAcquisitionSource: "promotion" | "referral";
  promotionAllocations: readonly Readonly<{
    productId: string;
    discountMinor: number;
  }>[];
  rewardsQuote: CheckoutRewardsQuote | null;
  referralQuote: EligibleReferralCheckoutQuote | null;
  affiliateQuote: EligibleAffiliateCheckoutQuote | null;
  browserQuote: BrowserCheckoutQuote;
}>;

declare const opaquePlan: unique symbol;
export type AuthoritativeCheckoutPlan = AuthoritativeCheckoutPlanData & {
  readonly [opaquePlan]: true;
};

export type CheckoutQuoteResult =
  | Readonly<{ status: "invalid_request"; reason: "checkout_input_invalid" }>
  | Readonly<{ status: "idempotency_conflict" }>
  | Readonly<{ status: "internal_conflict" }>
  | Readonly<{ status: "denied"; reasons: readonly string[] }>
  | Readonly<{
      status: "quote_unavailable";
      component: "shipping" | "tax";
      reason: string;
    }>
  | Readonly<{ status: "quote_invalid"; component: "shipping" | "tax" }>
  | Readonly<{
      status: "quoted";
      quote: BrowserCheckoutQuote;
      plan: AuthoritativeCheckoutPlan;
    }>
  | Readonly<{
      status: "review_rejected";
      reasons: readonly string[];
      plan: AuthoritativeCheckoutPlan;
    }>
  | CheckoutLoadedResult;

const plans = new WeakSet<object>();
const buyerStatuses = new Set<BuyerStatus>(["active", "review", "blocked"]);
const checkoutAttemptStatuses = new Set<CheckoutAttemptStatus>([
  "created",
  "open",
  "provider_unknown",
  "completed",
  "expired",
  "failed",
]);
const checkoutOrderStates = new Set<OrderState>([
  "draft",
  "eligibility_review",
  "compliance_hold",
  "ready_for_checkout",
  "checkout_pending",
  "payment_failed",
  "paid_pending_fulfillment",
  "paid_on_hold",
  "ready_for_fulfillment",
  "fulfillment_in_progress",
  "fulfilled",
  "cancelled",
]);

export function projectLoadedCheckoutAttempt(
  attempt: StoredCheckoutAttempt,
): CheckoutLoadedResult {
  if (
    !checkoutAttemptStatuses.has(attempt.status) ||
    !checkoutOrderStates.has(attempt.orderState)
  ) {
    throw new Error("Stored checkout attempt has an invalid persisted state");
  }
  return Object.freeze({
    status: "loaded" as const,
    orderId: attempt.orderId,
    attemptId: attempt.attemptId,
    attemptStatus: attempt.status,
    orderState: attempt.orderState,
    quoteSnapshot: attempt.quoteSnapshot,
  });
}

function toIso(value: string): string | null {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value
    ? value
    : null;
}

function safePositive(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isFactsValid(
  facts: AuthoritativeCheckoutFacts,
  request: CheckoutRequest,
  buyerUserId: string,
  now: Date,
): boolean {
  if (
    facts.buyer.userId !== buyerUserId ||
    typeof facts.buyer.emailVerified !== "boolean" ||
    !buyerStatuses.has(facts.buyer.status) ||
    !isCanonicalUuid(facts.buyer.currentAttestationVersionId) ||
    !safePositive(facts.buyer.currentAttestationVersion) ||
    (facts.buyer.attestationAcceptanceId !== null &&
      !isCanonicalUuid(facts.buyer.attestationAcceptanceId)) ||
    (facts.buyer.acceptedAttestationVersionId !== null &&
      !isCanonicalUuid(facts.buyer.acceptedAttestationVersionId)) ||
    facts.items.length !== request.items.length
  ) {
    return false;
  }

  const requested = new Map(
    request.items.map((item) => [item.productId, item.quantity]),
  );
  const seen = new Set<string>();
  for (const item of facts.items) {
    if (
      !isCanonicalUuid(item.productId) ||
      seen.has(item.productId) ||
      !requested.has(item.productId) ||
      !isCanonicalUuid(item.policyGroupId) ||
      typeof item.productName !== "string" ||
      item.productName.trim() === "" ||
      typeof item.packageForm !== "string" ||
      item.packageForm.trim() === "" ||
      typeof item.productActive !== "boolean" ||
      typeof item.policyGroupActive !== "boolean" ||
      !isCanonicalUuid(item.price.id) ||
      !safePositive(item.price.version) ||
      !safePositive(item.price.amountMinor) ||
      item.price.currency !== "USD" ||
      toIso(item.price.effectiveAt) === null ||
      new Date(item.price.effectiveAt).getTime() > now.getTime() ||
      item.price.supersededAt !== null ||
      item.destination.normalizedStateCode !== request.destination.stateCode ||
      (item.destination.status !== "unavailable" &&
        (!isCanonicalUuid(item.destination.ruleId) ||
          item.destination.ruleVersion === null ||
          item.destination.ruleVersion.trim() === ""))
    ) {
      return false;
    }
    seen.add(item.productId);
    const lotIds = new Set<string>();
    for (const lot of item.eligibleLots) {
      if (
        !isCanonicalUuid(lot.id) ||
        lotIds.has(lot.id) ||
        lot.status !== "released" ||
        !safePositive(lot.receivedQuantity) ||
        !safePositive(lot.availableQuantity) ||
        lot.availableQuantity > lot.receivedQuantity ||
        (lot.expiresAt !== null &&
          (toIso(lot.expiresAt) === null ||
            new Date(lot.expiresAt).getTime() <= now.getTime()))
      ) {
        return false;
      }
      lotIds.add(lot.id);
    }
  }
  if (facts.promotion === null) return request.promotionIds.length === 0;
  return (
    request.promotionIds.length === 1 &&
    facts.promotion.id === request.promotionIds[0]
  );
}

function reviewPolicies(facts: AuthoritativeCheckoutFacts) {
  return canonicalReviewPolicies(
    facts.items
      .filter((item) => item.destination.status === "review")
      .map((item) => ({
        id: item.destination.ruleId!,
        version: item.destination.ruleVersion!,
      })),
  );
}

function browserQuote(
  decision: CheckoutDecision,
  facts: AuthoritativeCheckoutFacts,
  totals: OrderTotals,
  promotionDiscountMinor: number,
  referralDiscountMinor: number,
  rewardsQuote: CheckoutRewardsQuote | null,
): BrowserCheckoutQuote {
  const byProduct = new Map(facts.items.map((item) => [item.productId, item]));
  const rewardsProjection =
    rewardsQuote === null
      ? {
          promotionDiscountMinor,
          referralDiscountMinor,
          rewardRedemptionPoints: 0,
          rewardRedemptionMinor: 0,
          pendingBaseEarnPoints: 0,
          rewardsBenefitAvailable: false,
          rewardsUnavailableReason: "not_requested",
        }
      : rewardsQuote.status === "applied"
        ? {
            promotionDiscountMinor,
            referralDiscountMinor,
            rewardRedemptionPoints: rewardsQuote.redemptionPoints,
            rewardRedemptionMinor: rewardsQuote.redemptionMinor,
            pendingBaseEarnPoints: rewardsQuote.pendingBaseEarnPoints,
            rewardsBenefitAvailable: true,
            rewardsUnavailableReason: null,
          }
        : {
            promotionDiscountMinor,
            referralDiscountMinor,
            rewardRedemptionPoints: 0,
            rewardRedemptionMinor: 0,
            pendingBaseEarnPoints: 0,
            rewardsBenefitAvailable: false,
            rewardsUnavailableReason: rewardsQuote.reason,
          };
  return Object.freeze({
    status: decision.reviewRequired ? "review_required" : "ready",
    reviewRequired: decision.reviewRequired,
    reasons: Object.freeze([...decision.reasons]),
    currency: "USD",
    subtotalMinor: totals.subtotalMinor,
    discountMinor: totals.discountMinor,
    shippingMinor: totals.shippingMinor,
    taxMinor: totals.taxMinor,
    totalMinor: totals.totalMinor,
    ...rewardsProjection,
    lines: Object.freeze(
      totals.lines.map((line) => {
        const fact = byProduct.get(line.productId)!;
        return Object.freeze({
          productId: line.productId,
          productName: fact.productName,
          packageForm: fact.packageForm,
          quantity: line.quantity,
          unitAmountMinor: line.unitAmountMinor,
          subtotalMinor: line.subtotalMinor,
          discountMinor: line.discountMinor,
          totalMinor: line.totalMinor,
        });
      }),
    ),
  });
}

function makePlan(data: AuthoritativeCheckoutPlanData): AuthoritativeCheckoutPlan {
  const planRecord = { ...data };
  Object.defineProperty(planRecord, "toJSON", {
    enumerable: false,
    value() {
      throw new Error("Authoritative checkout plans must never be serialized");
    },
  });
  const plan = Object.freeze(planRecord) as AuthoritativeCheckoutPlan;
  plans.add(plan);
  return plan;
}

export function projectAuthoritativeCheckoutPlan(
  value: unknown,
): AuthoritativeCheckoutPlanData | null {
  return typeof value === "object" && value !== null && plans.has(value)
    ? (value as AuthoritativeCheckoutPlanData)
    : null;
}

function resultWithOpaquePlan<
  Base extends Readonly<Record<string, unknown>>,
>(base: Base, plan: AuthoritativeCheckoutPlan): Base & {
  readonly plan: AuthoritativeCheckoutPlan;
} {
  const result = { ...base } as Base & {
    readonly plan: AuthoritativeCheckoutPlan;
  };
  Object.defineProperty(result, "plan", {
    enumerable: false,
    value: plan,
  });
  return Object.freeze(result);
}

export function createCheckoutService(dependencies: Readonly<{
  repository: CheckoutRepository;
  shippingQuotePort: ShippingQuotePort;
  taxQuotePort: TaxQuotePort;
  sha256: Sha256Hasher;
  clock: () => Date;
  keyedUuid: KeyedUuidGenerator;
  moneyPolicy: MoneyPolicy;
  rewardsService?: Readonly<{
    quoteCheckoutRewards: (input: Readonly<{
      buyerUserId: string;
      requestedPoints: number;
      postPromotionMerchandiseMinor: number;
      currency: "USD";
      now: Date;
    }>) => Promise<CheckoutRewardsQuote>;
    reserveCheckoutRewards: (input: Readonly<{
      buyerUserId: string;
      orderId: string;
      checkoutAttemptId: string;
      idempotencyKey: string;
      quote: AppliedCheckoutRewards;
      reservedAt: Date;
    }>) => Promise<RewardsCheckoutReservationResult>;
  }>;
  referralService?: Readonly<{
    quoteCustomerReferral: (input: Readonly<{
      buyerUserId: string;
      attributionCookie: string;
      merchandiseSubtotalMinor: number;
      currency: "USD";
      now: Date;
    }>) => Promise<ReferralCheckoutQuote>;
  }>;
  affiliateService?: Readonly<{
    quoteAffiliateAttribution: (input: Readonly<{
      buyerUserId: string;
      attributionCookie: string;
      now: Date;
    }>) => Promise<AffiliateCheckoutQuote>;
  }>;
}>) {
  return Object.freeze({
    async quote(input: Readonly<{
      buyerUserId: string;
      idempotencyKey: string;
      paymentProviderAvailable: boolean;
      attributionCookie?: string | null;
      request: unknown;
    }>): Promise<CheckoutQuoteResult> {
      if (
        !isCanonicalUuid(input.buyerUserId) ||
        !isCanonicalUuid(input.idempotencyKey) ||
        typeof input.paymentProviderAvailable !== "boolean"
        || (input.attributionCookie !== undefined &&
          input.attributionCookie !== null &&
          (typeof input.attributionCookie !== "string" ||
            input.attributionCookie.length === 0 ||
            input.attributionCookie.length > 2_048))
      ) {
        return { status: "invalid_request", reason: "checkout_input_invalid" };
      }
      const parsed = parseRewardsCheckoutRequest(input.request);
      if (!parsed.ok) {
        return { status: "invalid_request", reason: "checkout_input_invalid" };
      }
      const request = parsed.value;
      const authoritativeAt = dependencies.clock();
      if (!Number.isFinite(authoritativeAt.getTime())) {
        return { status: "internal_conflict" };
      }
      const identity = createCheckoutIdentity({
        buyerUserId: input.buyerUserId,
        idempotencyKey: input.idempotencyKey,
        keyedUuid: dependencies.keyedUuid,
      });
      const requestHash = await hashCheckoutRequest(request, dependencies.sha256);
      const existing = await dependencies.repository.findAttempt({
        buyerUserId: input.buyerUserId,
        idempotencyKey: input.idempotencyKey,
      });
      if (existing !== null) {
        if (existing.requestHash !== requestHash) {
          return { status: "idempotency_conflict" };
        }
        if (
          existing.orderId !== identity.orderId ||
          existing.attemptId !== identity.attemptId
        ) {
          return { status: "internal_conflict" };
        }
        const mutableReview =
          existing.status === "created" &&
          existing.orderState === "eligibility_review" &&
          !existing.permitted &&
          existing.reviewRequired &&
          !existing.hasReservations;
        if (!mutableReview) {
          return projectLoadedCheckoutAttempt(existing);
        }
      }

      const loaded = await dependencies.repository.loadFacts({
        buyerUserId: input.buyerUserId,
        request,
        now: authoritativeAt,
      });
      if (!loaded.ok) {
        return { status: "denied", reasons: Object.freeze([...loaded.reasons]) };
      }
      const facts = loaded.value;
      if (!isFactsValid(facts, request, input.buyerUserId, authoritativeAt)) {
        return { status: "denied", reasons: ["authoritative_facts_invalid"] };
      }

      const promotionResult = calculatePromotionDiscount({
        currency: "USD",
        lines: facts.items.map((item) => ({
          authority: "server_resolved_price" as const,
          productId: item.productId,
          policyGroupId: item.policyGroupId,
          grossSubtotalMinor:
            item.price.amountMinor *
            request.items.find((candidate) => candidate.productId === item.productId)!
              .quantity,
        })),
        promotions: facts.promotion === null ? [] : [facts.promotion],
      });
      if (!promotionResult.ok) {
        return {
          status: "denied",
          reasons: Object.freeze([`promotion_${promotionResult.error.code}`]),
        };
      }

      const reviewNeeded =
        facts.buyer.acceptedAttestationVersionId !== null &&
        facts.buyer.acceptedAttestationVersionId ===
          facts.buyer.currentAttestationVersionId &&
        (facts.buyer.status === "review" ||
          facts.items.some((item) => item.destination.status === "review"));
      const reviewSnapshotHash = reviewNeeded
        ? await hashReviewSnapshot(
            {
              orderId: identity.orderId,
              buyerUserId: input.buyerUserId,
              buyerStatus: facts.buyer.status,
              acceptedAttestationVersionId:
                facts.buyer.acceptedAttestationVersionId!,
              currentAttestationVersionId:
                facts.buyer.currentAttestationVersionId,
              items: request.items,
              promotionIds: request.promotionIds,
              destination: request.destination,
              reviewPolicies: reviewPolicies(facts),
            },
            dependencies.sha256,
          )
        : null;
      const exactReview =
        reviewSnapshotHash === null
          ? null
          : await dependencies.repository.findExactReview({
              orderId: identity.orderId,
              buyerUserId: input.buyerUserId,
              snapshotHash: reviewSnapshotHash,
            });

      const decision = evaluateCheckout({
        authenticated: true,
        buyerStatus: facts.buyer.emailVerified ? facts.buyer.status : null,
        acceptedAttestationVersion: facts.buyer.acceptedAttestationVersionId,
        currentAttestationVersion: facts.buyer.currentAttestationVersionId,
        items: facts.items.map((item) => ({
          productId: item.productId,
          active: item.productActive && item.policyGroupActive,
          catalogComplete: true,
          destination: item.destination,
          inventoryAvailable:
            item.eligibleLots.reduce(
              (sum, lot) => sum + lot.availableQuantity,
              0,
            ) >=
            request.items.find((candidate) => candidate.productId === item.productId)!
              .quantity,
        })),
        paymentProviderAvailable: input.paymentProviderAvailable,
        reviewSnapshotHash,
        reviewDecision:
          exactReview === null
            ? null
            : {
                reviewSnapshotHash: exactReview.reviewSnapshotHash,
                outcome: exactReview.outcome,
                coversBuyerReview: exactReview.coversBuyerReview,
                destinationRuleIds: exactReview.destinationPolicyIds,
              },
      });
      if (!decision.permitted && !decision.reviewRequired) {
        if (
          decision.reasons.length === 1 &&
          decision.reasons[0] === "review_rejected" &&
          exactReview !== null
        ) {
          const emptyQuote = Object.freeze({
            status: "review_required" as const,
            reviewRequired: true,
            reasons: Object.freeze([...decision.reasons]),
            currency: "USD" as const,
            subtotalMinor: 0,
            discountMinor: 0,
            shippingMinor: 0,
            taxMinor: 0,
            totalMinor: 0,
            promotionDiscountMinor: 0,
            referralDiscountMinor: 0,
            rewardRedemptionPoints: 0,
            rewardRedemptionMinor: 0,
            pendingBaseEarnPoints: 0,
            rewardsBenefitAvailable: false,
            rewardsUnavailableReason: "checkout_not_permitted",
            lines: Object.freeze([]),
          });
          const factsHash = await hashCanonicalEnvelope(
            {
              schemaVersion: 1,
              kind: "authoritative_checkout_facts",
              authoritativeAt: authoritativeAt.toISOString(),
              request,
              facts,
            },
            dependencies.sha256,
          );
          const plan = makePlan({
              identity,
              buyerUserId: input.buyerUserId,
              idempotencyKey: input.idempotencyKey,
              request,
              requestHash,
              authoritativeAt,
              factsHash,
              facts,
              reviewSnapshotHash,
              exactReview,
              decision,
              shippingQuote: null,
              taxQuote: null,
              totals: null,
              promotionDiscountMinor: 0,
              referralDiscountMinor: 0,
              selectedAcquisitionSource: "promotion",
              promotionAllocations: Object.freeze([]),
              rewardsQuote: null,
              referralQuote: null,
              affiliateQuote: null,
              browserQuote: emptyQuote,
            });
          return resultWithOpaquePlan(
            {
              status: "review_rejected" as const,
              reasons: decision.reasons,
            },
            plan,
          );
        }
        return { status: "denied", reasons: decision.reasons };
      }

      const factsHash = await hashCanonicalEnvelope(
        {
          schemaVersion: 1,
          kind: "authoritative_checkout_facts",
          authoritativeAt: authoritativeAt.toISOString(),
          request,
          facts,
        },
        dependencies.sha256,
      );
      const priceLines = facts.items.map((item) => ({
        authority: "server_resolved_price" as const,
        productId: item.productId,
        priceBookId: item.price.id,
        priceVersion: String(item.price.version),
        unitAmountMinor: item.price.amountMinor,
        currency: item.price.currency,
        quantity: request.items.find(
          (candidate) => candidate.productId === item.productId,
        )!.quantity,
      }));
      const merchandiseSubtotalMinor = priceLines.reduce(
        (sum, line) => sum + line.unitAmountMinor * line.quantity,
        0,
      );
      if (
        typeof input.attributionCookie === "string" &&
        dependencies.referralService === undefined
      ) {
        return { status: "internal_conflict" };
      }
      const referralResult =
        typeof input.attributionCookie === "string" &&
        dependencies.referralService !== undefined
          ? await dependencies.referralService.quoteCustomerReferral({
              buyerUserId: input.buyerUserId,
              attributionCookie: input.attributionCookie,
              merchandiseSubtotalMinor,
              currency: "USD",
              now: authoritativeAt,
            })
          : null;
      if (referralResult?.status === "internal_conflict") {
        return { status: "internal_conflict" };
      }
      const referralQuote =
        referralResult?.status === "eligible" ? referralResult : null;
      const affiliateResult =
        typeof input.attributionCookie === "string"
          ? dependencies.affiliateService === undefined
            ? null
            : await dependencies.affiliateService.quoteAffiliateAttribution({
              buyerUserId: input.buyerUserId,
              attributionCookie: input.attributionCookie,
              now: authoritativeAt,
            })
          : null;
      if (
        typeof input.attributionCookie === "string" &&
        dependencies.affiliateService === undefined
      ) {
        return { status: "internal_conflict" };
      }
      if (affiliateResult?.status === "internal_conflict") {
        return { status: "internal_conflict" };
      }
      const affiliateQuote =
        affiliateResult?.status === "eligible" ? affiliateResult : null;
      if (referralQuote !== null && affiliateQuote !== null) {
        return { status: "internal_conflict" };
      }
      const acquisition = selectBestAcquisitionDiscount({
        candidates: [
          {
            source: "promotion",
            discountMinor: promotionResult.value.discountMinor,
          },
          ...(referralQuote === null
            ? []
            : [{
                source: "referral" as const,
                discountMinor: referralQuote.referralDiscountMinor,
              }]),
        ],
      });
      if (!acquisition.ok) return { status: "internal_conflict" };
      const promotionDiscountMinor =
        acquisition.value.source === "promotion"
          ? acquisition.value.discountMinor
          : 0;
      const referralDiscountMinor =
        acquisition.value.source === "referral"
          ? acquisition.value.discountMinor
          : 0;
      const acquisitionAllocationByProduct = new Map<string, number>();
      if (acquisition.value.source === "promotion") {
        for (const allocation of promotionResult.value.allocations) {
          acquisitionAllocationByProduct.set(
            allocation.productId,
            allocation.discountMinor,
          );
        }
      } else {
        let remaining = referralDiscountMinor;
        for (const line of priceLines.toSorted((left, right) =>
          left.productId.localeCompare(right.productId))) {
          const gross = line.unitAmountMinor * line.quantity;
          const allocated = Math.min(remaining, gross);
          acquisitionAllocationByProduct.set(line.productId, allocated);
          remaining -= allocated;
        }
        if (remaining !== 0) return { status: "internal_conflict" };
      }
      const postPromotionLines = priceLines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        netAmountMinor:
          line.unitAmountMinor * line.quantity -
          (acquisitionAllocationByProduct.get(line.productId) ?? 0),
      }));
      const postPromotionMerchandiseMinor = postPromotionLines.reduce(
        (sum, line) => sum + line.netAmountMinor,
        0,
      );
      const rewardsQuote = Object.hasOwn(request, "rewardRedemptionPoints")
        ? dependencies.rewardsService === undefined
          ? Object.freeze({
              status: "unavailable" as const,
              reason: "configuration_unavailable" as const,
            })
          : await dependencies.rewardsService.quoteCheckoutRewards({
              buyerUserId: input.buyerUserId,
              requestedPoints: request.rewardRedemptionPoints!,
              postPromotionMerchandiseMinor,
              currency: "USD",
              now: authoritativeAt,
            })
        : null;
      const rewardRedemptionMinor =
        rewardsQuote?.status === "applied" ? rewardsQuote.redemptionMinor : 0;
      let remainingRewardMinor = rewardRedemptionMinor;
      const rewardAllocationByProduct = new Map<string, number>();
      for (const line of postPromotionLines.toSorted((left, right) =>
        left.productId.localeCompare(right.productId))) {
        const allocated = Math.min(remainingRewardMinor, line.netAmountMinor);
        rewardAllocationByProduct.set(line.productId, allocated);
        remainingRewardMinor -= allocated;
      }
      if (remainingRewardMinor !== 0) {
        return { status: "internal_conflict" };
      }
      const merchandiseLines = postPromotionLines.map((line) => ({
        ...line,
        netAmountMinor:
          line.netAmountMinor - (rewardAllocationByProduct.get(line.productId) ?? 0),
      }));
      const merchandiseTotalMinor = merchandiseLines.reduce(
        (sum, line) => sum + line.netAmountMinor,
        0,
      );
      const shippingBindingHash = await hashCanonicalEnvelope(
        {
          schemaVersion: 1,
          kind: "shipping_quote_binding",
          factsHash,
          destination: request.destination,
          items: merchandiseLines,
          merchandiseTotalMinor,
          currency: "USD",
        },
        dependencies.sha256,
      );
      const rawShipping = await dependencies.shippingQuotePort.quoteShipping({
        schemaVersion: 1,
        bindingHash: shippingBindingHash,
        items: merchandiseLines,
        merchandiseTotalMinor,
        currency: "USD",
        destination: request.destination,
      });
      const parsedShipping = parseShippingQuoteResult(rawShipping, {
        bindingHash: shippingBindingHash,
        currency: "USD",
      });
      if (!parsedShipping.ok) {
        return { status: "quote_invalid", component: "shipping" };
      }
      if (parsedShipping.value.status === "unavailable") {
        return {
          status: "quote_unavailable",
          component: "shipping",
          reason: parsedShipping.value.reason,
        };
      }
      const shippingQuote = parsedShipping.value;
      const taxBindingHash = await hashCanonicalEnvelope(
        {
          schemaVersion: 1,
          kind: "tax_quote_binding",
          factsHash,
          destination: request.destination,
          items: merchandiseLines,
          merchandiseTotalMinor,
          shipping: {
            amountMinor: shippingQuote.amountMinor,
            reference: shippingQuote.reference,
            service: shippingQuote.service,
          },
          currency: "USD",
        },
        dependencies.sha256,
      );
      const rawTax = await dependencies.taxQuotePort.quoteTax({
        schemaVersion: 1,
        bindingHash: taxBindingHash,
        items: merchandiseLines,
        merchandiseTotalMinor,
        shippingMinor: shippingQuote.amountMinor,
        shippingReference: shippingQuote.reference,
        shippingService: shippingQuote.service,
        currency: "USD",
        destination: request.destination,
      });
      const parsedTax = parseTaxQuoteResult(rawTax, {
        bindingHash: taxBindingHash,
        currency: "USD",
      });
      if (!parsedTax.ok) return { status: "quote_invalid", component: "tax" };
      if (parsedTax.value.status === "unavailable") {
        return {
          status: "quote_unavailable",
          component: "tax",
          reason: parsedTax.value.reason,
        };
      }
      const taxQuote = parsedTax.value;
      const totalsResult = calculateOrderTotals(
        {
          lines: priceLines,
          discount: {
            authority: "server_calculated_discount",
            amountMinor:
              promotionDiscountMinor + referralDiscountMinor + rewardRedemptionMinor,
            currency: "USD",
            allocations: priceLines.map((line) => ({
              productId: line.productId,
              discountMinor:
                (acquisitionAllocationByProduct.get(line.productId) ?? 0) +
                (rewardAllocationByProduct.get(line.productId) ?? 0),
            })),
          },
          shipping: {
            authority: "server_resolved_shipping",
            amountMinor: shippingQuote.amountMinor,
            currency: "USD",
          },
          tax: {
            authority: "server_calculated_tax",
            amountMinor: taxQuote.amountMinor,
            currency: "USD",
          },
        },
        dependencies.moneyPolicy,
      );
      if (!totalsResult.ok) {
        return {
          status: "denied",
          reasons: [`money_${totalsResult.error.code}`],
        };
      }
      const quote = browserQuote(
        decision,
        facts,
        totalsResult.value,
        promotionDiscountMinor,
        referralDiscountMinor,
        rewardsQuote,
      );
      const plan = makePlan({
        identity,
        buyerUserId: input.buyerUserId,
        idempotencyKey: input.idempotencyKey,
        request,
        requestHash,
        authoritativeAt,
        factsHash,
        facts,
        reviewSnapshotHash,
        exactReview,
        decision,
        shippingQuote,
        taxQuote,
        totals: totalsResult.value,
        promotionDiscountMinor,
        referralDiscountMinor,
        selectedAcquisitionSource: acquisition.value.source,
        promotionAllocations:
          acquisition.value.source === "promotion"
            ? promotionResult.value.allocations
            : Object.freeze([]),
        rewardsQuote,
        referralQuote,
        affiliateQuote,
        browserQuote: quote,
      });
      return resultWithOpaquePlan({ status: "quoted" as const, quote }, plan);
    },

    async prepare(
      plan: AuthoritativeCheckoutPlan,
      providerPreparation: unknown,
    ): Promise<
      | CheckoutPrepareResult
      | Readonly<{
          status: "invalid_plan" | "invalid_provider_preparation";
        }>
    > {
      if (
        typeof plan !== "object" ||
        plan === null ||
        !plans.has(plan as object)
      ) {
        return { status: "invalid_plan" };
      }
      if (plan.decision.permitted) {
        const parsed = parseProviderPreparation(providerPreparation, {
          attemptId: plan.identity.attemptId,
          now: plan.authoritativeAt,
        });
        if (!parsed.ok) return { status: "invalid_provider_preparation" };
        return dependencies.repository.prepare(plan, parsed.value);
      }
      if (providerPreparation !== null) {
        return { status: "invalid_provider_preparation" };
      }
      return dependencies.repository.prepare(plan, null);
    },
  });
}
