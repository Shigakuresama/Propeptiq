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
  parseLegacyRewardsCheckoutRequest,
  parseProviderPreparation,
  parseRewardsCheckoutQuoteRequest,
  parseRewardsCheckoutRequest,
  parseShippingQuoteResult,
  parseTaxQuoteResult,
  type LegacyRewardsCheckoutRequest,
  type ProviderPreparation,
  type ShippingQuote,
  type ShippingQuotePort,
  type TaxQuote,
  type TaxQuotePort,
  type RewardsCheckoutQuoteRequest,
} from "@/commerce/checkout-ports";
import { buildSafeCartPreview, type SafeCartPreview } from "@/cart/preview";
import {
  resolveUnreconciledActiveConfiguredAutomaticPromotions,
  STOREFRONT_PROMOTIONS,
} from "@/config/storefront-promotions";
import type {
  CheckoutQuoteRequest,
  CheckoutUnavailable,
  PriceChanged,
} from "@/domain/checkout";
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
import {
  calculateVariantLinePrice,
  isStorefrontPromotionActive,
  promotionApplies,
  quantityDiscountBps,
  resolveEffectiveDiscount,
  type StorefrontPromotion,
} from "@/domain/storefront-pricing";
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

export type AuthoritativeAutomaticPromotion = StorefrontPromotion &
  Readonly<{
    recordId: string;
    campaignKey: string;
    version: number;
  }>;

export type AuthoritativeVariantCheckoutItemFact = Readonly<{
  variantId: string;
  productId: string;
  sku: string;
  variantLabel: string;
  productName: string;
  packageForm: string;
  policyGroupId: string;
  productActive: boolean;
  policyGroupActive: boolean;
  variantActive: boolean;
  availabilityRevision: string;
  inventoryRevision: string;
  price: Readonly<{
    id: string;
    version: number;
    status: "pending" | "active" | "unavailable";
    amountMinor: number;
    currency: string;
    effectiveAt: string;
  }>;
  stripeProductId: string | null;
  stripePriceId: string | null;
  destination: DestinationResolution;
  eligibleLots: readonly AuthoritativeLotFact[];
}>;

export type AuthoritativeVariantCheckoutFacts = Readonly<{
  buyer: AuthoritativeCheckoutFacts["buyer"];
  items: readonly AuthoritativeVariantCheckoutItemFact[];
  automaticPromotions: readonly AuthoritativeAutomaticPromotion[];
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
    productId?: string;
    variantId?: string;
    sku?: string;
    variantLabel?: string;
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
  pricingRevision: string | null;
}>;

export type CheckoutLoadedResult = Readonly<{
  status: "loaded";
  orderId: string;
  attemptId: string;
  attemptStatus: CheckoutAttemptStatus;
  orderState: OrderState;
  quoteSnapshot: BrowserCheckoutQuote | null;
  pricingRevision: string | null;
}>;

export type FactLoadResult =
  | Readonly<{ ok: true; value: AuthoritativeCheckoutFacts }>
  | Readonly<{ ok: false; reasons: readonly string[] }>;

export type VariantFactLoadResult =
  | Readonly<{ ok: true; value: AuthoritativeVariantCheckoutFacts }>
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
    request: LegacyRewardsCheckoutRequest;
    now: Date;
  }>) => Promise<FactLoadResult>;
  loadVariantFacts?: (input: Readonly<{
    buyerUserId: string;
    request: CheckoutQuoteRequest;
    now: Date;
  }>) => Promise<VariantFactLoadResult>;
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

export type LegacyAuthoritativeCheckoutPlanData = Readonly<{
  kind: "legacy_product";
  identity: CheckoutIdentity;
  buyerUserId: string;
  idempotencyKey: string;
  request: LegacyRewardsCheckoutRequest;
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

export type AuthoritativeVariantLinePrice = Readonly<{
  variantId: string;
  productId: string;
  sku: string;
  variantLabel: string;
  quantity: number;
  baseUnitMinor: number;
  effectiveUnitMinor: number;
  lineSubtotalMinor: number;
  lineSavingsMinor: number;
  appliedPromotionIds: readonly string[];
  priceId: string;
  priceVersion: number;
  stripeProductId: string;
  stripePriceId: string;
}>;

export type AuthoritativeVariantCheckoutPlanData = Readonly<{
  kind: "canonical_variant";
  identity: CheckoutIdentity;
  buyerUserId: string;
  idempotencyKey: string;
  request: RewardsCheckoutQuoteRequest;
  acknowledgedPricingRevision: string | null;
  pricingRevision: string;
  requestHash: string;
  authoritativeAt: Date;
  factsHash: string;
  facts: AuthoritativeVariantCheckoutFacts;
  effectiveLines: readonly AuthoritativeVariantLinePrice[];
  activeAutomaticPromotions: readonly Readonly<{
    id: string;
    version: number;
  }>[];
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
    variantId: string;
    discountMinor: number;
  }>[];
  rewardsQuote: CheckoutRewardsQuote | null;
  referralQuote: EligibleReferralCheckoutQuote | null;
  affiliateQuote: EligibleAffiliateCheckoutQuote | null;
  browserQuote: BrowserCheckoutQuote;
}>;

export type AuthoritativeCheckoutPlanData =
  | LegacyAuthoritativeCheckoutPlanData
  | AuthoritativeVariantCheckoutPlanData;

declare const opaquePlan: unique symbol;
export type AuthoritativeCheckoutPlan = AuthoritativeCheckoutPlanData & {
  readonly [opaquePlan]: true;
};

export type CheckoutQuoteResult =
  | Readonly<{ status: "invalid_request"; reason: "checkout_input_invalid" }>
  | CheckoutUnavailable
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
      pricingRevision?: string;
      cart?: SafeCartPreview;
      plan: AuthoritativeCheckoutPlan;
    }>
  | Readonly<{
      status: "review_rejected";
      reasons: readonly string[];
      plan: AuthoritativeCheckoutPlan;
    }>
  | CheckoutLoadedResult;

export type CheckoutSessionQuoteResult = CheckoutQuoteResult | PriceChanged;

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
    pricingRevision: attempt.pricingRevision,
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
  request: LegacyRewardsCheckoutRequest,
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

function isVariantFactsValid(
  facts: AuthoritativeVariantCheckoutFacts,
  request: CheckoutQuoteRequest,
  buyerUserId: string,
  now: Date,
): boolean {
  if (
    facts.buyer.userId !== buyerUserId ||
    typeof facts.buyer.emailVerified !== "boolean" ||
    !buyerStatuses.has(facts.buyer.status) ||
    !isCanonicalUuid(facts.buyer.currentAttestationVersionId) ||
    !safePositive(facts.buyer.currentAttestationVersion) ||
    facts.items.length !== request.items.length ||
    !Array.isArray(facts.automaticPromotions)
  ) return false;
  const requested = new Map(request.items.map((item) => [item.variantId, item.quantity]));
  const seen = new Set<string>();
  for (const item of facts.items) {
    if (
      !isCanonicalUuid(item.variantId) ||
      !isCanonicalUuid(item.productId) ||
      seen.has(item.variantId) ||
      !requested.has(item.variantId) ||
      !isCanonicalUuid(item.policyGroupId) ||
      !isCanonicalUuid(item.price.id) ||
      !safePositive(item.price.version) ||
      !Number.isSafeInteger(item.price.amountMinor) ||
      item.price.amountMinor < 0 ||
      !["pending", "active", "unavailable"].includes(item.price.status) ||
      typeof item.price.currency !== "string" ||
      item.price.currency.trim() !== item.price.currency ||
      item.price.currency.length < 3 ||
      item.price.currency.length > 8 ||
      toIso(item.price.effectiveAt) === null ||
      new Date(item.price.effectiveAt).getTime() > now.getTime() ||
      ![item.sku, item.variantLabel, item.productName, item.packageForm,
        item.availabilityRevision, item.inventoryRevision].every(
          (value) => typeof value === "string" && value.trim() === value && value.length > 0,
        ) ||
      typeof item.productActive !== "boolean" ||
      typeof item.policyGroupActive !== "boolean" ||
      typeof item.variantActive !== "boolean" ||
      (item.stripeProductId !== null &&
        (typeof item.stripeProductId !== "string" || item.stripeProductId.trim() === "")) ||
      (item.stripePriceId !== null &&
        (typeof item.stripePriceId !== "string" || item.stripePriceId.trim() === "")) ||
      item.destination.normalizedStateCode !== request.destination.stateCode
    ) return false;
    seen.add(item.variantId);
    const lots = new Set<string>();
    for (const lot of item.eligibleLots) {
      if (
        !isCanonicalUuid(lot.id) || lots.has(lot.id) || lot.status !== "released" ||
        !safePositive(lot.receivedQuantity) || !safePositive(lot.availableQuantity) ||
        lot.availableQuantity > lot.receivedQuantity ||
        (lot.expiresAt !== null &&
          (toIso(lot.expiresAt) === null || new Date(lot.expiresAt).getTime() <= now.getTime()))
      ) return false;
      lots.add(lot.id);
    }
  }
  const promotionKeys = new Set<string>();
  for (const promotion of facts.automaticPromotions) {
    const key = `${promotion.id}:${promotion.version}`;
    if (
      promotionKeys.has(key) ||
      typeof promotion.id !== "string" || promotion.id.trim() === "" ||
      !isCanonicalUuid(promotion.recordId) ||
      typeof promotion.campaignKey !== "string" || promotion.campaignKey.trim() === "" ||
      !safePositive(promotion.version) ||
      promotion.applicationMode !== "automatic"
    ) return false;
    promotionKeys.add(key);
  }
  return true;
}

function variantUnavailableReason(
  fact: AuthoritativeVariantCheckoutItemFact,
  quantity: number,
): CheckoutUnavailable["reasons"][number]["code"] | null {
  if (fact.price.currency !== "USD") return "invalid_currency";
  if (fact.price.status === "pending" || fact.price.amountMinor === 0) {
    return "pricing_coming_soon";
  }
  if (fact.stripeProductId === null || fact.stripePriceId === null) {
    return "payment_mapping_missing";
  }
  const availableQuantity = fact.eligibleLots.reduce(
    (sum, lot) => sum + lot.availableQuantity,
    0,
  );
  if (
    fact.price.status !== "active" || !fact.variantActive || !fact.productActive ||
    !fact.policyGroupActive || fact.destination.status === "unavailable" ||
    availableQuantity < quantity
  ) return "unavailable";
  return null;
}

export function canonicalActiveAutomaticPromotionIdentities(
  facts: AuthoritativeVariantCheckoutFacts,
  request: CheckoutQuoteRequest,
  at: Date,
): readonly Readonly<{ id: string; version: number }>[] {
  const requestedVariants = new Set(request.items.map((item) => item.variantId));
  const identities = facts.automaticPromotions.flatMap((promotion) => {
    if (
      promotion.applicationMode !== "automatic" ||
      !isStorefrontPromotionActive(promotion, at) ||
      !facts.items.some((item) =>
        requestedVariants.has(item.variantId) &&
        promotionApplies(promotion, {
          variantId: item.variantId,
          productId: item.productId,
        }),
      )
    ) return [];
    return [{ id: promotion.id, version: promotion.version }];
  });
  return Object.freeze(
    [...new Map(identities.map((identity) => [
      `${identity.id}:${identity.version}`,
      Object.freeze(identity),
    ])).values()].toSorted((left, right) =>
      left.id.localeCompare(right.id) || left.version - right.version,
    ),
  );
}

function safeVariantCart(
  facts: AuthoritativeVariantCheckoutFacts,
  request: CheckoutQuoteRequest,
  effectiveLines: readonly Readonly<{
    variantId: string;
    effectiveUnitMinor: number;
    lineSubtotalMinor: number;
  }>[],
): SafeCartPreview {
  const lineByVariant = new Map(effectiveLines.map((line) => [line.variantId, line]));
  const factByVariant = new Map(facts.items.map((item) => [item.variantId, item]));
  return buildSafeCartPreview(request.items.map((requested) => {
    const fact = factByVariant.get(requested.variantId)!;
    const line = lineByVariant.get(requested.variantId)!;
    return {
      variantId: requested.variantId,
      quantity: requested.quantity,
      available: variantUnavailableReason(fact, requested.quantity) === null,
      name: fact.productName,
      packageForm: fact.packageForm,
      variantLabel: fact.variantLabel,
      sku: fact.sku,
      unitAmountMinor: line.effectiveUnitMinor,
      lineSubtotalMinor: line.lineSubtotalMinor,
      currency: fact.price.currency,
    };
  }));
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
  configuredPromotions?: unknown;
}>) {
  async function quoteCanonicalVariant(
    input: Readonly<{
      buyerUserId: string;
      idempotencyKey: string;
      paymentProviderAvailable: boolean;
      attributionCookie?: string | null;
    }>,
    request: RewardsCheckoutQuoteRequest,
    acknowledgedPricingRevision: string | null,
  ): Promise<CheckoutSessionQuoteResult> {
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
      if (existing.requestHash !== requestHash) return { status: "idempotency_conflict" };
      if (existing.orderId !== identity.orderId || existing.attemptId !== identity.attemptId) {
        return { status: "internal_conflict" };
      }
      const mutableReview = existing.status === "created" &&
        existing.orderState === "eligibility_review" && !existing.permitted &&
        existing.reviewRequired && !existing.hasReservations;
      if (!mutableReview) return projectLoadedCheckoutAttempt(existing);
    }

    if (dependencies.repository.loadVariantFacts === undefined) {
      return { status: "internal_conflict" };
    }
    const loaded = await dependencies.repository.loadVariantFacts({
      buyerUserId: input.buyerUserId,
      request,
      now: authoritativeAt,
    });
    if (!loaded.ok) {
      if (loaded.reasons.includes("variant_catalog_incomplete")) {
        return Object.freeze({
          status: "CHECKOUT_UNAVAILABLE" as const,
          reasons: Object.freeze(request.items.map((item) => Object.freeze({
            variantId: item.variantId,
            code: "unavailable" as const,
          }))),
        });
      }
      return { status: "denied", reasons: Object.freeze([...loaded.reasons]) };
    }
    const facts = loaded.value;
    if (!isVariantFactsValid(facts, request, input.buyerUserId, authoritativeAt)) {
      return { status: "denied", reasons: ["authoritative_facts_invalid"] };
    }

    const unreconciled =
      resolveUnreconciledActiveConfiguredAutomaticPromotions(
        dependencies.configuredPromotions ?? STOREFRONT_PROMOTIONS,
        facts.automaticPromotions,
        authoritativeAt,
      );
    if (unreconciled === null) {
      return Object.freeze({
        status: "CHECKOUT_UNAVAILABLE" as const,
        reasons: Object.freeze(request.items.map((item) => Object.freeze({
          variantId: item.variantId,
          code: "pricing_coming_soon" as const,
        }))),
      });
    }

    const factByVariant = new Map(facts.items.map((fact) => [fact.variantId, fact]));
    const unreconciledReasons = request.items.flatMap((requested) => {
      const fact = factByVariant.get(requested.variantId)!;
      const affected = unreconciled.some((promotion) =>
        promotionApplies(promotion, {
          productId: fact.productId,
          variantId: fact.variantId,
        }),
      );
      return affected
        ? [Object.freeze({
            variantId: fact.variantId,
            code: "pricing_coming_soon" as const,
          })]
        : [];
    });
    if (unreconciledReasons.length > 0) {
      return Object.freeze({
        status: "CHECKOUT_UNAVAILABLE" as const,
        reasons: Object.freeze(unreconciledReasons),
      });
    }

    const activeByVariant = new Map<string, AuthoritativeAutomaticPromotion[]>();
    const priced = [] as Array<Readonly<{
      variantId: string;
      effectiveUnitMinor: number;
      lineSubtotalMinor: number;
      lineSavingsMinor: number;
      appliedPromotionIds: readonly string[];
      activePromotions: readonly AuthoritativeAutomaticPromotion[];
    }>>;
    try {
      for (const requested of request.items) {
        const fact = factByVariant.get(requested.variantId)!;
        const active = facts.automaticPromotions.filter((promotion) =>
          promotion.applicationMode === "automatic" &&
          isStorefrontPromotionActive(promotion, authoritativeAt) &&
          promotionApplies(promotion, {
            variantId: fact.variantId,
            productId: fact.productId,
          }),
        );
        activeByVariant.set(fact.variantId, active);
        const effectiveDiscount = resolveEffectiveDiscount({
          quantityDiscountBps: quantityDiscountBps(requested.quantity),
          eligiblePromotions: active.map((promotion) => ({
            id: promotion.id,
            discountBps: promotion.discountBps!,
          })),
        });
        const line = calculateVariantLinePrice({
          variantId: fact.variantId,
          baseUnitMinor: fact.price.amountMinor,
          quantity: requested.quantity,
          priceStatus: fact.price.status,
          effectiveDiscount,
        });
        priced.push(Object.freeze({
          variantId: fact.variantId,
          effectiveUnitMinor: line.effectiveUnitMinor,
          lineSubtotalMinor: line.lineSubtotalMinor,
          lineSavingsMinor: line.lineSavingsMinor,
          appliedPromotionIds: line.appliedPromotionIds,
          activePromotions: Object.freeze(active),
        }));
      }
    } catch {
      return { status: "denied", reasons: ["authoritative_facts_invalid"] };
    }

    const pricingRevision = await hashCanonicalEnvelope({
      schemaVersion: 1,
      kind: "canonical_variant_pricing_revision",
      lines: request.items.map((requested) => {
        const fact = factByVariant.get(requested.variantId)!;
        const line = priced.find((candidate) => candidate.variantId === requested.variantId)!;
        return {
          variantId: fact.variantId,
          productId: fact.productId,
          sku: fact.sku,
          priceBookId: fact.price.id,
          priceVersion: fact.price.version,
          baseUnitMinor: fact.price.amountMinor,
          currency: fact.price.currency,
          availabilityRevision: fact.availabilityRevision,
          inventoryRevision: fact.inventoryRevision,
          quantity: requested.quantity,
          activeAutomaticPromotions: line.activePromotions.map((promotion) => ({
            id: promotion.id,
            recordId: promotion.recordId,
            version: promotion.version,
          })),
          effectiveUnitMinor: line.effectiveUnitMinor,
          effectiveLineMinor: line.lineSubtotalMinor,
          appliedPromotionIds: line.appliedPromotionIds,
          stripeProductId: fact.stripeProductId,
          stripePriceId: fact.stripePriceId,
        };
      }),
    }, dependencies.sha256);
    const cart = safeVariantCart(facts, request, priced);
    if (
      acknowledgedPricingRevision !== null &&
      acknowledgedPricingRevision !== pricingRevision
    ) {
      return Object.freeze({ status: "PRICE_CHANGED", pricingRevision, cart });
    }

    const unavailableReasons = request.items.flatMap((requested) => {
      const code = variantUnavailableReason(
        factByVariant.get(requested.variantId)!,
        requested.quantity,
      );
      return code === null
        ? []
        : [Object.freeze({ variantId: requested.variantId, code })];
    });
    if (unavailableReasons.length > 0) {
      return Object.freeze({
        status: "CHECKOUT_UNAVAILABLE" as const,
        reasons: Object.freeze(unavailableReasons),
      });
    }

    const effectiveLines: AuthoritativeVariantLinePrice[] = priced.map((line) => {
      const fact = factByVariant.get(line.variantId)!;
      const quantity = request.items.find((item) => item.variantId === line.variantId)!.quantity;
      return Object.freeze({
        variantId: fact.variantId,
        productId: fact.productId,
        sku: fact.sku,
        variantLabel: fact.variantLabel,
        quantity,
        baseUnitMinor: fact.price.amountMinor,
        effectiveUnitMinor: line.effectiveUnitMinor,
        lineSubtotalMinor: line.lineSubtotalMinor,
        lineSavingsMinor: line.lineSavingsMinor,
        appliedPromotionIds: line.appliedPromotionIds,
        priceId: fact.price.id,
        priceVersion: fact.price.version,
        stripeProductId: fact.stripeProductId!,
        stripePriceId: fact.stripePriceId!,
      });
    });
    const activePromotionIdentities = canonicalActiveAutomaticPromotionIdentities(
      facts,
      request,
      authoritativeAt,
    );
    const reviewNeeded = facts.buyer.acceptedAttestationVersionId !== null &&
      facts.buyer.acceptedAttestationVersionId === facts.buyer.currentAttestationVersionId &&
      (facts.buyer.status === "review" ||
        facts.items.some((item) => item.destination.status === "review"));
    const reviewSnapshotHash = reviewNeeded
      ? await hashReviewSnapshot({
          orderId: identity.orderId,
          buyerUserId: input.buyerUserId,
          buyerStatus: facts.buyer.status,
          acceptedAttestationVersionId: facts.buyer.acceptedAttestationVersionId!,
          currentAttestationVersionId: facts.buyer.currentAttestationVersionId,
          items: request.items,
          automaticPromotions: activePromotionIdentities,
          destination: request.destination,
          reviewPolicies: canonicalReviewPolicies(
            facts.items.filter((item) => item.destination.status === "review").map((item) => ({
              id: item.destination.ruleId!,
              version: item.destination.ruleVersion!,
            })),
          ),
        }, dependencies.sha256)
      : null;
    const exactReview = reviewSnapshotHash === null
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
        active: item.productActive && item.policyGroupActive && item.variantActive,
        catalogComplete: true,
        destination: item.destination,
        inventoryAvailable: item.eligibleLots.reduce(
          (sum, lot) => sum + lot.availableQuantity,
          0,
        ) >= request.items.find((candidate) => candidate.variantId === item.variantId)!.quantity,
      })),
      paymentProviderAvailable: input.paymentProviderAvailable,
      reviewSnapshotHash,
      reviewDecision: exactReview === null ? null : {
        reviewSnapshotHash: exactReview.reviewSnapshotHash,
        outcome: exactReview.outcome,
        coversBuyerReview: exactReview.coversBuyerReview,
        destinationRuleIds: exactReview.destinationPolicyIds,
      },
    });
    if (!decision.permitted && !decision.reviewRequired) {
      return { status: "denied", reasons: decision.reasons };
    }

    const factsHash = await hashCanonicalEnvelope({
      schemaVersion: 2,
      kind: "authoritative_variant_checkout_facts",
      request,
      pricingRevision,
      facts,
      effectiveLines,
    }, dependencies.sha256);
    const grossSubtotalMinor = effectiveLines.reduce(
      (sum, line) => sum + line.baseUnitMinor * line.quantity,
      0,
    );
    if (typeof input.attributionCookie === "string" && dependencies.referralService === undefined) {
      return { status: "internal_conflict" };
    }
    const referralResult = typeof input.attributionCookie === "string" && dependencies.referralService
      ? await dependencies.referralService.quoteCustomerReferral({
          buyerUserId: input.buyerUserId,
          attributionCookie: input.attributionCookie,
          merchandiseSubtotalMinor: grossSubtotalMinor,
          currency: "USD",
          now: authoritativeAt,
        })
      : null;
    if (referralResult?.status === "internal_conflict") return { status: "internal_conflict" };
    const referralQuote = referralResult?.status === "eligible" ? referralResult : null;
    if (typeof input.attributionCookie === "string" && dependencies.affiliateService === undefined) {
      return { status: "internal_conflict" };
    }
    const affiliateResult = typeof input.attributionCookie === "string" && dependencies.affiliateService
      ? await dependencies.affiliateService.quoteAffiliateAttribution({
          buyerUserId: input.buyerUserId,
          attributionCookie: input.attributionCookie,
          now: authoritativeAt,
        })
      : null;
    if (affiliateResult?.status === "internal_conflict") return { status: "internal_conflict" };
    const affiliateQuote = affiliateResult?.status === "eligible" ? affiliateResult : null;
    if (referralQuote !== null && affiliateQuote !== null) return { status: "internal_conflict" };

    const storefrontSavingsMinor = effectiveLines.reduce(
      (sum, line) => sum + line.lineSavingsMinor,
      0,
    );
    const acquisition = selectBestAcquisitionDiscount({
      candidates: [
        { source: "promotion", discountMinor: storefrontSavingsMinor },
        ...(referralQuote === null ? [] : [{
          source: "referral" as const,
          discountMinor: referralQuote.referralDiscountMinor,
        }]),
      ],
    });
    if (!acquisition.ok) return { status: "internal_conflict" };
    const promotionDiscountMinor = acquisition.value.source === "promotion"
      ? acquisition.value.discountMinor : 0;
    const referralDiscountMinor = acquisition.value.source === "referral"
      ? acquisition.value.discountMinor : 0;
    const acquisitionByVariant = new Map<string, number>();
    if (acquisition.value.source === "promotion") {
      for (const line of effectiveLines) acquisitionByVariant.set(line.variantId, line.lineSavingsMinor);
    } else {
      let remaining = referralDiscountMinor;
      for (const line of effectiveLines.toSorted((left, right) => left.variantId.localeCompare(right.variantId))) {
        const gross = line.baseUnitMinor * line.quantity;
        const allocated = Math.min(remaining, gross);
        acquisitionByVariant.set(line.variantId, allocated);
        remaining -= allocated;
      }
      if (remaining !== 0) return { status: "internal_conflict" };
    }
    const postAcquisitionLines = effectiveLines.map((line) => ({
      productId: line.variantId,
      quantity: line.quantity,
      netAmountMinor: line.baseUnitMinor * line.quantity -
        (acquisitionByVariant.get(line.variantId) ?? 0),
    }));
    const postAcquisitionMinor = postAcquisitionLines.reduce(
      (sum, line) => sum + line.netAmountMinor,
      0,
    );
    const rewardsQuote = Object.hasOwn(request, "rewardRedemptionPoints")
      ? dependencies.rewardsService === undefined
        ? Object.freeze({ status: "unavailable" as const, reason: "configuration_unavailable" as const })
        : await dependencies.rewardsService.quoteCheckoutRewards({
            buyerUserId: input.buyerUserId,
            requestedPoints: request.rewardRedemptionPoints!,
            postPromotionMerchandiseMinor: postAcquisitionMinor,
            currency: "USD",
            now: authoritativeAt,
          })
      : null;
    const rewardRedemptionMinor = rewardsQuote?.status === "applied"
      ? rewardsQuote.redemptionMinor : 0;
    let remainingReward = rewardRedemptionMinor;
    const rewardByVariant = new Map<string, number>();
    for (const line of postAcquisitionLines.toSorted((left, right) => left.productId.localeCompare(right.productId))) {
      const allocated = Math.min(remainingReward, line.netAmountMinor);
      rewardByVariant.set(line.productId, allocated);
      remainingReward -= allocated;
    }
    if (remainingReward !== 0) return { status: "internal_conflict" };
    const merchandiseLines = postAcquisitionLines.map((line) => ({
      ...line,
      netAmountMinor: line.netAmountMinor - (rewardByVariant.get(line.productId) ?? 0),
    }));
    const merchandiseTotalMinor = merchandiseLines.reduce((sum, line) => sum + line.netAmountMinor, 0);
    const shippingBindingHash = await hashCanonicalEnvelope({
      schemaVersion: 2,
      kind: "shipping_quote_binding",
      factsHash,
      destination: request.destination,
      items: merchandiseLines,
      merchandiseTotalMinor,
      currency: "USD",
    }, dependencies.sha256);
    const parsedShipping = parseShippingQuoteResult(
      await dependencies.shippingQuotePort.quoteShipping({
        schemaVersion: 1,
        bindingHash: shippingBindingHash,
        items: merchandiseLines,
        merchandiseTotalMinor,
        currency: "USD",
        destination: request.destination,
      }),
      { bindingHash: shippingBindingHash, currency: "USD" },
    );
    if (!parsedShipping.ok) return { status: "quote_invalid", component: "shipping" };
    if (parsedShipping.value.status === "unavailable") {
      return { status: "quote_unavailable", component: "shipping", reason: parsedShipping.value.reason };
    }
    const shippingQuote = parsedShipping.value;
    const taxBindingHash = await hashCanonicalEnvelope({
      schemaVersion: 2,
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
    }, dependencies.sha256);
    const parsedTax = parseTaxQuoteResult(
      await dependencies.taxQuotePort.quoteTax({
        schemaVersion: 1,
        bindingHash: taxBindingHash,
        items: merchandiseLines,
        merchandiseTotalMinor,
        shippingMinor: shippingQuote.amountMinor,
        shippingReference: shippingQuote.reference,
        shippingService: shippingQuote.service,
        currency: "USD",
        destination: request.destination,
      }),
      { bindingHash: taxBindingHash, currency: "USD" },
    );
    if (!parsedTax.ok) return { status: "quote_invalid", component: "tax" };
    if (parsedTax.value.status === "unavailable") {
      return { status: "quote_unavailable", component: "tax", reason: parsedTax.value.reason };
    }
    const taxQuote = parsedTax.value;
    const priceLines = effectiveLines.map((line) => ({
      authority: "server_resolved_price" as const,
      productId: line.variantId,
      priceBookId: line.priceId,
      priceVersion: String(line.priceVersion),
      unitAmountMinor: line.baseUnitMinor,
      currency: "USD" as const,
      quantity: line.quantity,
    }));
    const totalsResult = calculateOrderTotals({
      lines: priceLines,
      discount: {
        authority: "server_calculated_discount",
        amountMinor: promotionDiscountMinor + referralDiscountMinor + rewardRedemptionMinor,
        currency: "USD",
        allocations: priceLines.map((line) => ({
          productId: line.productId,
          discountMinor: (acquisitionByVariant.get(line.productId) ?? 0) +
            (rewardByVariant.get(line.productId) ?? 0),
        })),
      },
      shipping: { authority: "server_resolved_shipping", amountMinor: shippingQuote.amountMinor, currency: "USD" },
      tax: { authority: "server_calculated_tax", amountMinor: taxQuote.amountMinor, currency: "USD" },
    }, dependencies.moneyPolicy);
    if (!totalsResult.ok) return { status: "denied", reasons: [`money_${totalsResult.error.code}`] };
    const totalByVariant = new Map(totalsResult.value.lines.map((line) => [line.productId, line]));
    const rewardsProjection = rewardsQuote === null
      ? {
          rewardRedemptionPoints: 0,
          rewardRedemptionMinor: 0,
          pendingBaseEarnPoints: 0,
          rewardsBenefitAvailable: false,
          rewardsUnavailableReason: "not_requested",
        }
      : rewardsQuote.status === "applied"
        ? {
            rewardRedemptionPoints: rewardsQuote.redemptionPoints,
            rewardRedemptionMinor: rewardsQuote.redemptionMinor,
            pendingBaseEarnPoints: rewardsQuote.pendingBaseEarnPoints,
            rewardsBenefitAvailable: true,
            rewardsUnavailableReason: null,
          }
        : {
            rewardRedemptionPoints: 0,
            rewardRedemptionMinor: 0,
            pendingBaseEarnPoints: 0,
            rewardsBenefitAvailable: false,
            rewardsUnavailableReason: rewardsQuote.reason,
          };
    const quote: BrowserCheckoutQuote = Object.freeze({
      status: decision.reviewRequired ? "review_required" : "ready",
      reviewRequired: decision.reviewRequired,
      reasons: Object.freeze([...decision.reasons]),
      currency: "USD",
      subtotalMinor: totalsResult.value.subtotalMinor,
      discountMinor: totalsResult.value.discountMinor,
      shippingMinor: totalsResult.value.shippingMinor,
      taxMinor: totalsResult.value.taxMinor,
      totalMinor: totalsResult.value.totalMinor,
      promotionDiscountMinor,
      referralDiscountMinor,
      ...rewardsProjection,
      lines: Object.freeze(effectiveLines.map((line) => {
        const fact = factByVariant.get(line.variantId)!;
        const total = totalByVariant.get(line.variantId)!;
        return Object.freeze({
          productId: fact.productId,
          variantId: fact.variantId,
          sku: fact.sku,
          variantLabel: fact.variantLabel,
          productName: fact.productName,
          packageForm: fact.packageForm,
          quantity: line.quantity,
          unitAmountMinor: line.baseUnitMinor,
          subtotalMinor: total.subtotalMinor,
          discountMinor: total.discountMinor,
          totalMinor: total.totalMinor,
        });
      })),
    });
    const plan = makePlan({
      kind: "canonical_variant",
      identity,
      buyerUserId: input.buyerUserId,
      idempotencyKey: input.idempotencyKey,
      request,
      acknowledgedPricingRevision,
      pricingRevision,
      requestHash,
      authoritativeAt,
      factsHash,
      facts,
      effectiveLines: Object.freeze(effectiveLines),
      activeAutomaticPromotions: Object.freeze(activePromotionIdentities),
      reviewSnapshotHash,
      exactReview,
      decision,
      shippingQuote,
      taxQuote,
      totals: totalsResult.value,
      promotionDiscountMinor,
      referralDiscountMinor,
      selectedAcquisitionSource: acquisition.value.source,
      promotionAllocations: Object.freeze(
        acquisition.value.source === "promotion"
          ? effectiveLines.map((line) => Object.freeze({
              productId: line.productId,
              variantId: line.variantId,
              discountMinor: line.lineSavingsMinor,
            }))
          : [],
      ),
      rewardsQuote,
      referralQuote,
      affiliateQuote,
      browserQuote: quote,
    });
    return resultWithOpaquePlan({
      status: "quoted" as const,
      pricingRevision,
      cart,
      quote,
    }, plan);
  }

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
      const parsedVariant = parseRewardsCheckoutQuoteRequest(input.request);
      if (parsedVariant.ok) {
        const variantResult = await quoteCanonicalVariant(input, parsedVariant.value, null);
        return variantResult.status === "PRICE_CHANGED"
          ? { status: "internal_conflict" }
          : variantResult;
      }
      const parsed = parseLegacyRewardsCheckoutRequest(input.request);
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
              kind: "legacy_product",
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
        kind: "legacy_product",
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

    async quoteForSession(input: Readonly<{
      buyerUserId: string;
      idempotencyKey: string;
      paymentProviderAvailable: boolean;
      attributionCookie?: string | null;
      request: unknown;
    }>): Promise<CheckoutSessionQuoteResult> {
      if (
        !isCanonicalUuid(input.buyerUserId) ||
        !isCanonicalUuid(input.idempotencyKey) ||
        typeof input.paymentProviderAvailable !== "boolean" ||
        (input.attributionCookie !== undefined &&
          input.attributionCookie !== null &&
          (typeof input.attributionCookie !== "string" ||
            input.attributionCookie.length === 0 ||
            input.attributionCookie.length > 2_048))
      ) {
        return { status: "invalid_request", reason: "checkout_input_invalid" };
      }
      const parsedSession = parseRewardsCheckoutRequest(input.request);
      const parsedQuote = parseRewardsCheckoutQuoteRequest(input.request);
      if (!parsedSession.ok && !parsedQuote.ok) {
        return { status: "invalid_request", reason: "checkout_input_invalid" };
      }
      let parsed: RewardsCheckoutQuoteRequest;
      let acknowledgedPricingRevision: string | null;
      if (parsedSession.ok) {
        parsed = parsedSession.value;
        acknowledgedPricingRevision = parsedSession.value.pricingRevision;
      } else {
        if (!parsedQuote.ok) {
          return { status: "invalid_request", reason: "checkout_input_invalid" };
        }
        parsed = parsedQuote.value;
        acknowledgedPricingRevision = null;
      }
      const request: RewardsCheckoutQuoteRequest = Object.freeze({
        items: parsed.items,
        destination: parsed.destination,
        ...(Object.hasOwn(parsed, "rewardRedemptionPoints")
          ? { rewardRedemptionPoints: parsed.rewardRedemptionPoints }
          : {}),
      });
      return quoteCanonicalVariant(
        input,
        request,
        acknowledgedPricingRevision,
      );
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
