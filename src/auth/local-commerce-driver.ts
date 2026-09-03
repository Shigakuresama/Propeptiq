import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { BuyerProfileRecord } from "@/account/account-service";
import type { OrderDetail, OrderSummary } from "@/account/account-read";
import type { LocalCommerceDriverV1, LocalCommerceInspectionV1 } from "@/auth/local-driver-types";
import { projectAuthoritativeCheckoutPlan, projectLoadedCheckoutAttempt, type AuthoritativeCheckoutFacts, type AuthoritativeCheckoutPlan, type AuthoritativeVariantCheckoutFacts, type BrowserCheckoutQuote, type CheckoutRepository, type StoredCheckoutAttempt } from "@/commerce/checkout-service";
import type { ProviderPreparation, ShippingQuotePort, TaxQuotePort } from "@/commerce/checkout-ports";
import type { CheckoutSuccessReadModel } from "@/commerce/checkout-success-read";
import type { FulfillmentCommandRepository } from "@/commerce/fulfillment-service";
import { createSyntheticLocalPaymentProvider } from "local-payment-provider";
import { buildProviderRefundRequestV1 } from "@/commerce/provider-contracts";
import type { RefundClaimDescriptorV1, RefundCommandRepository } from "@/commerce/refund-service";
import {
  createRepositoryDurableCheckoutRequestV1,
  createRepositoryDurableCheckoutRequestV2,
  projectDurableCheckoutRequest,
  type DurableCheckoutRequest,
  type ProviderSessionRepository,
} from "@/db/repositories/provider-session-repository";
import type { BuyerStatus } from "@/domain/eligibility";
import type { PromotionRecord } from "@/domain/promotions";
import type {
  AppliedCheckoutRewards,
  RewardsCheckoutReservationResult,
} from "@/growth/rewards-service";
import type { RateLimitStore } from "@/security/rate-limit";
import { loadSyntheticDemoCatalogRecords } from "catalog-demo-fixtures";

const CURRENT_ATTESTATION_ID = "67000000-0000-4000-8000-000000000001";
const POLICY_ID_BY_STATE = Object.freeze({
  CA: "67000000-0000-4000-8000-000000000010",
  OR: "67000000-0000-4000-8000-000000000011",
  NV: "67000000-0000-4000-8000-000000000012",
});
const COMMAND_REFUND_ID = "68000000-0000-4000-8000-000000000001";
const COMMAND_REFUND_ORDER_ID = "68000000-0000-4000-8000-000000000002";
const COMMAND_PAYMENT_EVENT_ID = "68000000-0000-4000-8000-000000000003";
const COMMAND_FULFILLMENT_ORDER_ID = "68000000-0000-4000-8000-000000000004";
const SYNTHETIC_PROVIDER_PAYMENT_ID = "pi_local_synthetic_staff_refund";
const FIXED_NOW = "2026-08-26T12:00:00.000Z";
const LOCAL_AFFILIATE_CODE = "aff_LocalRuntimePartner01";
const LOCAL_AFFILIATE_PROFILE_ID = "6b000000-0000-4000-8000-000000000021";
const LOCAL_AFFILIATE_USER_ID = "6b000000-0000-4000-8000-000000000022";
const LOCAL_AFFILIATE_POLICY_ID = "6b000000-0000-4000-8000-000000000023";
const LOCAL_REFERRAL_CODE = "ref_LocalRuntimeReferrer01";
const LOCAL_REFERRAL_CODE_ID = "6b000000-0000-4000-8000-000000000031";
const LOCAL_REFERRER_USER_ID = "6b000000-0000-4000-8000-000000000032";
const LOCAL_REFERRAL_POLICY_ID = "6b000000-0000-4000-8000-000000000033";
const LOCAL_SHARED_SET_CODE = "set_LocalRuntimeResearch01";
/** Local/test-only canonical variant. Catalog fields are sourced from the synthetic demo records. */
const LOCAL_CANONICAL_VARIANT_FIXTURE = Object.freeze({
  variantId: "55000000-0000-4000-8000-000000000001",
  productId: "61000000-0000-4000-8000-000000000001",
  priceId: "62000000-0000-4000-8000-000000000001",
  lotId: "63000000-0000-4000-8000-000000000001",
  sku: "SYNTHETIC-ALPHA-5MG",
  variantLabel: "Synthetic 5 mg fixture",
  stripeProductId: "prod_synthetic_alpha",
  stripePriceId: "price_synthetic_alpha_5mg",
});
const LOCAL_GROWTH_POLICY_BUNDLE_SENTINEL =
  "LOCAL_GROWTH_POLICY_BUNDLE_TEST_ONLY_PROPEPTIQ_2PPD_1MPP_500MIN_2500MAX_30D_1000BP_2500CAP_5PPD_2500PTS_1000BP_500BP_180D_30D_5000USD_4F8C21";

type SharedFacts = Readonly<{
  loadProfile: (userId: string) => BuyerProfileRecord | null;
  hasCurrentAttestation: (userId: string) => boolean;
  loadEmail: (userId: string) => string | null;
  reserveCheckoutRewards: (input: Readonly<{
    buyerUserId: string;
    orderId: string;
    checkoutAttemptId: string;
    idempotencyKey: string;
    quote: AppliedCheckoutRewards;
    reservedAt: Date;
  }>) => Promise<RewardsCheckoutReservationResult>;
}>;

type AttemptRecord = {
  stored: StoredCheckoutAttempt;
  durable: DurableCheckoutRequest | null;
  providerPreparation: ProviderPreparation | null;
  providerSessionId: string | null;
};

type OrderRecord = {
  ownerUserId: string;
  destinationStateCode: string;
  success: CheckoutSuccessReadModel;
};

type ReviewRecord = {
  reviewRequestId: string;
  orderId: string;
  ownerUserId: string;
  snapshotHash: string;
};

type RefundRecord = {
  id: string;
  orderId: string;
  status: "requested" | "submitted" | "succeeded" | "failed" | "cancelled";
  amountMinor: number;
  confirmedAmountMinor: number | null;
  providerRefundId: string | null;
  attemptCount: number;
  requestedAt: string;
};

type CommandOrder = {
  state: "paid_on_hold" | "paid_pending_fulfillment" | "fulfilled";
  shipment: "pending" | "handed_off" | "delivered" | "exception";
  releaseState: "none" | "consumed";
  updatedAt: string;
};

type CommerceState = {
  artifactSentinels: readonly string[];
  revision: number;
  attempts: Map<string, AttemptRecord>;
  orders: Map<string, OrderRecord>;
  reviews: Map<string, ReviewRecord>;
  rateCounts: Map<string, number>;
  processedLocalEvents: Set<string>;
  paymentTransitionCount: number;
  refund: RefundRecord | null;
  commandOrder: CommandOrder | null;
  releaseCount: number;
  shipmentHandoffCount: number;
  deliveryCount: number;
  exceptionCount: number;
  effectCount: number;
  lastOrderUpdatedAt: string | null;
};

function initialState(): CommerceState {
  return {
    artifactSentinels: Object.freeze([
      LOCAL_GROWTH_POLICY_BUNDLE_SENTINEL,
      LOCAL_SHARED_SET_CODE,
    ]),
    revision: 0,
    attempts: new Map(),
    orders: new Map(),
    reviews: new Map(),
    rateCounts: new Map(),
    processedLocalEvents: new Set(),
    paymentTransitionCount: 0,
    refund: null,
    commandOrder: null,
    releaseCount: 0,
    shipmentHandoffCount: 0,
    deliveryCount: 0,
    exceptionCount: 0,
    effectCount: 0,
    lastOrderUpdatedAt: null,
  };
}

type LocalCommerceProcessState = {
  state: CommerceState;
  providerHarness: ReturnType<typeof createSyntheticLocalPaymentProvider>;
};

const localCommerceProcessStateKey = Symbol.for("propeptiq.local-commerce-state.v1");

function processState(): LocalCommerceProcessState {
  const localProcess = process as NodeJS.Process & {
    [key: symbol]: LocalCommerceProcessState | undefined;
  };
  const existing = localProcess[localCommerceProcessStateKey];
  if (existing !== undefined) return existing;
  const created = {
    state: initialState(),
    providerHarness: createSyntheticLocalPaymentProvider(),
  };
  localProcess[localCommerceProcessStateKey] = created;
  return created;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function attemptKey(buyerUserId: string, idempotencyKey: string): string {
  return `${buyerUserId}:${idempotencyKey}`;
}

function nextInstant(state: CommerceState): string {
  return new Date(new Date(FIXED_NOW).getTime() + (state.revision + 1) * 1_000).toISOString();
}

function bump(state: CommerceState, orderUpdated = false): void {
  const instant = nextInstant(state);
  state.revision += 1;
  if (orderUpdated) state.lastOrderUpdatedAt = instant;
}

function cloneQuote(quote: BrowserCheckoutQuote): BrowserCheckoutQuote {
  return Object.freeze({
    ...quote,
    reasons: Object.freeze([...quote.reasons]),
    lines: Object.freeze(quote.lines.map((line) => Object.freeze({ ...line }))),
  });
}

function inspection(state: CommerceState): LocalCommerceInspectionV1 {
  return Object.freeze({
    schemaVersion: 1,
    revision: state.revision,
    orderCount: state.orders.size + (state.commandOrder === null ? 0 : 2),
    attemptCount: state.attempts.size,
    providerSessionCount: [...state.attempts.values()].filter((attempt) => attempt.providerSessionId !== null).length,
    reviewRequestCount: state.reviews.size,
    reservationCount: [...state.attempts.values()].filter((attempt) => attempt.stored.hasReservations).length,
    paymentTransitionCount: state.paymentTransitionCount,
    refundCount: state.refund === null ? 0 : 1,
    releaseCount: state.releaseCount,
    shipmentHandoffCount: state.shipmentHandoffCount,
    deliveryCount: state.deliveryCount,
    exceptionCount: state.exceptionCount,
    effectCount: state.effectCount,
    lastOrderUpdatedAt: state.lastOrderUpdatedAt,
  });
}

function promotionRecord(id: string): PromotionRecord | null {
  const records = loadSyntheticDemoCatalogRecords();
  const record = records.promotions.find((candidate) => candidate.id === id);
  if (!record) return null;
  return Object.freeze({
    authority: "server_resolved_promotion",
    id: record.id,
    version: record.version,
    code: record.code,
    name: record.name,
    kind: record.kind,
    status: record.status,
    currentlyEffective: record.status === "active",
    amountMinor: record.amountMinor,
    currency: record.currency,
    basisPoints: record.basisPoints,
    targetProductIds: Object.freeze(records.promotionTargets.filter((target) => target.promotionId === record.id && target.productId !== null).map((target) => target.productId!)),
    targetPolicyGroupIds: Object.freeze(records.promotionTargets.filter((target) => target.promotionId === record.id && target.policyGroupId !== null).map((target) => target.policyGroupId!)),
  });
}

function successFromPlan(plan: NonNullable<ReturnType<typeof projectAuthoritativeCheckoutPlan>>): CheckoutSuccessReadModel {
  const quote = plan.browserQuote;
  return Object.freeze({
    orderId: plan.identity.orderId,
    state: "checkout_pending",
    currency: "USD",
    subtotalMinor: quote.subtotalMinor,
    discountMinor: quote.discountMinor,
    shippingMinor: quote.shippingMinor,
    taxMinor: quote.taxMinor,
    totalMinor: quote.totalMinor,
    paymentState: "pending_verification",
    refundState: "none",
    holdState: "none",
    releaseState: "none",
    shipmentState: "none",
    createdAt: plan.authoritativeAt.toISOString(),
    updatedAt: plan.authoritativeAt.toISOString(),
    items: Object.freeze(quote.lines.map((line) => Object.freeze({
      id: plan.identity.keyedUuid(`order-item:${line.productId ?? line.variantId}`),
      productName: line.productName,
      packageForm: line.packageForm,
      quantity: line.quantity,
      unitAmountMinor: line.unitAmountMinor,
      subtotalMinor: line.subtotalMinor,
      discountMinor: line.discountMinor,
      totalMinor: line.totalMinor,
    }))),
  });
}

function orderDetail(model: CheckoutSuccessReadModel, destinationStateCode: string): OrderDetail {
  return Object.freeze({
    id: model.orderId,
    state: model.state,
    currency: model.currency,
    totalMinor: model.totalMinor,
    paymentState: model.paymentState,
    refundState: model.refundState,
    holdState: model.holdState,
    releaseState: model.releaseState,
    shipmentState: model.shipmentState,
    createdAt: model.createdAt,
    destinationStateCode,
    items: Object.freeze(model.items.map((item) => Object.freeze({
      id: item.id,
      productName: item.productName,
      packageForm: item.packageForm,
      quantity: item.quantity,
      unitAmountMinor: item.unitAmountMinor,
      totalMinor: item.totalMinor,
    }))),
  });
}

function ensureCommandFixtures(state: CommerceState): void {
  if (state.commandOrder !== null && state.refund !== null) return;
  state.refund = {
    id: COMMAND_REFUND_ID,
    orderId: COMMAND_REFUND_ORDER_ID,
    status: "requested",
    amountMinor: 500,
    confirmedAmountMinor: null,
    providerRefundId: null,
    attemptCount: 0,
    requestedAt: FIXED_NOW,
  };
  state.commandOrder = {
    state: "paid_on_hold",
    shipment: "pending",
    releaseState: "none",
    updatedAt: FIXED_NOW,
  };
  bump(state, true);
}

export function createLocalCommerceDriverV1(
  shared: SharedFacts,
  configuredInternalEventSecret: () => string | null,
): LocalCommerceDriverV1 {
  const process = processState();
  const state = process.state;
  const providerHarness = process.providerHarness;

  const checkoutRepository: CheckoutRepository = Object.freeze({
    async findAttempt(input) {
      return state.attempts.get(attemptKey(input.buyerUserId, input.idempotencyKey))?.stored ?? null;
    },
    async loadFacts(input) {
      const profile = shared.loadProfile(input.buyerUserId);
      const records = loadSyntheticDemoCatalogRecords();
      if (profile === null) return Object.freeze({ ok: false as const, reasons: Object.freeze(["account_required"]) });
      const items: Array<AuthoritativeCheckoutFacts["items"][number]> = [];
      for (const requested of input.request.items) {
        const product = records.products.find((candidate) => candidate.id === requested.productId);
        const price = records.prices.find((candidate) => candidate.productId === requested.productId && candidate.supersededAt === null);
        const lots = records.lots.filter((candidate) => candidate.productId === requested.productId && candidate.status === "released");
        if (
          !product ||
          !price ||
          typeof price.amountMinor !== "number" ||
          !Number.isSafeInteger(price.amountMinor) ||
          price.amountMinor <= 0
        ) {
          return Object.freeze({
            ok: false as const,
            reasons: Object.freeze(["product_catalog_incomplete"]),
          });
        }
        const policyId = Object.hasOwn(POLICY_ID_BY_STATE, input.request.destination.stateCode)
          ? POLICY_ID_BY_STATE[input.request.destination.stateCode as keyof typeof POLICY_ID_BY_STATE]
          : null;
        const destinationStatus = input.request.destination.stateCode === "CA"
          ? "allowed"
          : input.request.destination.stateCode === "OR"
            ? "review"
            : input.request.destination.stateCode === "NV"
              ? "blocked"
              : "unavailable";
        items.push(Object.freeze({
          productId: product.id,
          productName: product.name,
          packageForm: product.packageForm,
          policyGroupId: product.policyGroupId,
          productActive: product.status === "active",
          policyGroupActive: true,
          price: Object.freeze({
            ...price,
            amountMinor: price.amountMinor,
            currency: "USD" as const,
            supersededAt: null,
          }),
          destination: Object.freeze({
            status: destinationStatus,
            normalizedStateCode: input.request.destination.stateCode,
            ruleId: policyId,
            ruleVersion: policyId === null ? null : "1",
            scope: policyId === null ? null : "product",
          }),
          eligibleLots: Object.freeze(lots.map((lot) => Object.freeze({
            id: lot.id,
            status: "released" as const,
            receivedQuantity: lot.availableQuantity,
            availableQuantity: lot.availableQuantity,
            expiresAt: lot.expiresAt,
          }))),
        }));
      }
      let promotion: PromotionRecord | null = null;
      if (input.request.promotionIds.length === 1) {
        promotion = promotionRecord(input.request.promotionIds[0]!);
        if (promotion === null) return Object.freeze({ ok: false as const, reasons: Object.freeze(["promotion_unavailable"]) });
      }
      return Object.freeze({
        ok: true as const,
        value: Object.freeze({
          buyer: Object.freeze({
            userId: input.buyerUserId,
            emailVerified: shared.loadEmail(input.buyerUserId) !== null,
            status: profile.status as BuyerStatus,
            currentAttestationVersionId: CURRENT_ATTESTATION_ID,
            currentAttestationVersion: 1,
            attestationAcceptanceId: shared.hasCurrentAttestation(input.buyerUserId)
              ? "67000000-0000-4000-8000-000000000002"
              : null,
            acceptedAttestationVersionId: shared.hasCurrentAttestation(input.buyerUserId)
              ? CURRENT_ATTESTATION_ID
              : null,
          }),
          items: Object.freeze(items),
          promotion,
        }),
      });
    },
    async loadVariantFacts(input) {
      const profile = shared.loadProfile(input.buyerUserId);
      if (profile === null) {
        return Object.freeze({
          ok: false as const,
          reasons: Object.freeze(["account_required"]),
        });
      }
      if (input.request.items.some(
        (item) => item.variantId !== LOCAL_CANONICAL_VARIANT_FIXTURE.variantId,
      )) {
        return Object.freeze({
          ok: false as const,
          reasons: Object.freeze(["variant_catalog_incomplete"]),
        });
      }

      const records = loadSyntheticDemoCatalogRecords();
      const product = records.products.find(
        (candidate) => candidate.id === LOCAL_CANONICAL_VARIANT_FIXTURE.productId,
      );
      const price = records.prices.find(
        (candidate) =>
          candidate.id === LOCAL_CANONICAL_VARIANT_FIXTURE.priceId &&
          candidate.productId === LOCAL_CANONICAL_VARIANT_FIXTURE.productId &&
          candidate.supersededAt === null,
      );
      const lots = records.lots.filter(
        (candidate) =>
          candidate.id === LOCAL_CANONICAL_VARIANT_FIXTURE.lotId &&
          candidate.productId === LOCAL_CANONICAL_VARIANT_FIXTURE.productId &&
          candidate.status === "released" &&
          (candidate.expiresAt === null ||
            new Date(candidate.expiresAt).getTime() > input.now.getTime()),
      );
      if (
        !product ||
        !price ||
        typeof price.amountMinor !== "number" ||
        !Number.isSafeInteger(price.amountMinor) ||
        price.amountMinor <= 0
      ) {
        return Object.freeze({
          ok: false as const,
          reasons: Object.freeze(["variant_catalog_incomplete"]),
        });
      }

      const policyId = Object.hasOwn(
        POLICY_ID_BY_STATE,
        input.request.destination.stateCode,
      )
        ? POLICY_ID_BY_STATE[
          input.request.destination.stateCode as keyof typeof POLICY_ID_BY_STATE
        ]
        : null;
      const destinationStatus = input.request.destination.stateCode === "CA"
        ? "allowed"
        : input.request.destination.stateCode === "OR"
          ? "review"
          : input.request.destination.stateCode === "NV"
            ? "blocked"
            : "unavailable";
      const item: AuthoritativeVariantCheckoutFacts["items"][number] = Object.freeze({
        variantId: LOCAL_CANONICAL_VARIANT_FIXTURE.variantId,
        productId: product.id,
        sku: LOCAL_CANONICAL_VARIANT_FIXTURE.sku,
        variantLabel: LOCAL_CANONICAL_VARIANT_FIXTURE.variantLabel,
        productName: product.name,
        packageForm: product.packageForm,
        policyGroupId: product.policyGroupId,
        productActive: product.status === "active",
        policyGroupActive: true,
        variantActive: true,
        availabilityRevision:
          `local-test:${product.id}:${price.id}:${price.version}:active`,
        inventoryRevision:
          `local-test:${lots.map((lot) => `${lot.id}:${lot.availableQuantity}`).join(",")}`,
        price: Object.freeze({
          id: price.id,
          version: price.version,
          status: "active" as const,
          amountMinor: price.amountMinor,
          currency: price.currency,
          effectiveAt: price.effectiveAt,
        }),
        stripeProductId: LOCAL_CANONICAL_VARIANT_FIXTURE.stripeProductId,
        stripePriceId: LOCAL_CANONICAL_VARIANT_FIXTURE.stripePriceId,
        destination: Object.freeze({
          status: destinationStatus,
          normalizedStateCode: input.request.destination.stateCode,
          ruleId: policyId,
          ruleVersion: policyId === null ? null : "1",
          scope: policyId === null ? null : "product",
        }),
        eligibleLots: Object.freeze(lots.map((lot) => Object.freeze({
          id: lot.id,
          status: "released" as const,
          receivedQuantity: lot.availableQuantity,
          availableQuantity: lot.availableQuantity,
          expiresAt: lot.expiresAt,
        }))),
      });
      return Object.freeze({
        ok: true as const,
        value: Object.freeze({
          buyer: Object.freeze({
            userId: input.buyerUserId,
            emailVerified: shared.loadEmail(input.buyerUserId) !== null,
            status: profile.status as BuyerStatus,
            currentAttestationVersionId: CURRENT_ATTESTATION_ID,
            currentAttestationVersion: 1,
            attestationAcceptanceId: shared.hasCurrentAttestation(input.buyerUserId)
              ? "67000000-0000-4000-8000-000000000002"
              : null,
            acceptedAttestationVersionId: shared.hasCurrentAttestation(input.buyerUserId)
              ? CURRENT_ATTESTATION_ID
              : null,
          }),
          items: Object.freeze(input.request.items.map(() => item)),
          automaticPromotions: Object.freeze([]),
        }),
      });
    },
    async loadProviderCreateVariantFacts(input) {
      const conflict = () => Object.freeze({
        ok: false as const,
        reasons: Object.freeze(["provider_create_authority_conflict"]),
      });
      const record = state.attempts.get(
        attemptKey(input.buyerUserId, input.idempotencyKey),
      );
      const order = state.orders.get(input.orderId);
      if (
        record === undefined ||
        order === undefined ||
        order.ownerUserId !== input.buyerUserId ||
        record.stored.orderId !== input.orderId ||
        record.stored.attemptId !== input.attemptId ||
        record.stored.pricingRevision !== input.expectedStoredPricingRevision ||
        (record.stored.status !== "created" &&
          record.stored.status !== "provider_unknown") ||
        record.stored.orderState !== "checkout_pending" ||
        !record.stored.permitted ||
        record.stored.reviewRequired ||
        !record.stored.hasReservations ||
        record.providerSessionId !== null ||
        record.durable === null ||
        record.providerPreparation === null ||
        record.providerPreparation.providerRequestSchemaVersion !== 2 ||
        record.durable.providerRequestSchemaVersion !== 2 ||
        record.durable.buyerUserId !== input.buyerUserId ||
        record.durable.idempotencyKey !== input.idempotencyKey ||
        record.durable.orderId !== input.orderId ||
        record.durable.attemptId !== input.attemptId ||
        record.durable.attemptStatus !== record.stored.status ||
        record.durable.orderState !== "checkout_pending" ||
        record.durable.providerSessionId !== null ||
        record.durable.providerExpiresAt !==
          record.providerPreparation.providerExpiresAt ||
        new Date(record.durable.providerExpiresAt).getTime() <= input.now.getTime()
      ) return conflict();

      const lines = record.durable.providerBindingSnapshot.lines;
      const byVariant = new Map(lines.map((line) => [line.variantId, line]));
      if (byVariant.size !== lines.length ||
        lines.length !== input.request.items.length) return conflict();
      for (const requested of input.request.items) {
        const line = byVariant.get(requested.variantId);
        if (line === undefined ||
          line.requestedQuantity !== requested.quantity) return conflict();
      }

      // This local-only test double reuses the same canonical catalog builder,
      // then projects aggregate reservation coverage from its durable V2 lines.
      // Production uses per-lot database reservation rows instead.
      const loaded = await checkoutRepository.loadVariantFacts!({
        buyerUserId: input.buyerUserId,
        request: input.request,
        now: input.now,
      });
      if (!loaded.ok) return loaded;
      return Object.freeze({
        ok: true as const,
        value: Object.freeze({
          ...loaded.value,
          items: Object.freeze(loaded.value.items.map((item) => {
            const line = byVariant.get(item.variantId)!;
            const lot = item.eligibleLots[0];
            return Object.freeze({
              ...item,
              inventoryRevision:
                `local-test:reservation:${input.attemptId}:${item.variantId}:` +
                `${line.requestedQuantity}:${record.durable!.providerExpiresAt}`,
              eligibleLots: lot === undefined
                ? Object.freeze([])
                : Object.freeze([Object.freeze({
                    ...lot,
                    receivedQuantity: Math.max(
                      lot.receivedQuantity,
                      line.requestedQuantity,
                    ),
                    availableQuantity: line.requestedQuantity,
                  })]),
            });
          })),
        }),
      });
    },
    async findExactReview(input) {
      const review = state.reviews.get(input.snapshotHash);
      if (!review || review.orderId !== input.orderId || review.ownerUserId !== input.buyerUserId) return null;
      return null;
    },
    async prepare(planValue: AuthoritativeCheckoutPlan, providerPreparation: ProviderPreparation | null) {
      const plan = projectAuthoritativeCheckoutPlan(planValue);
      if (plan === null) return Object.freeze({ status: "facts_changed_retry" as const });
      const key = attemptKey(plan.buyerUserId, plan.idempotencyKey);
      const existing = state.attempts.get(key);
      if (existing) {
        if (existing.stored.requestHash !== plan.requestHash) return Object.freeze({ status: "idempotency_conflict" as const });
        if (existing.stored.reviewRequired && existing.stored.orderState === "eligibility_review") {
          return Object.freeze({
            status: "review_required" as const,
            orderId: existing.stored.orderId,
            attemptId: existing.stored.attemptId,
            reviewRequestId: [...state.reviews.values()].find((review) => review.orderId === existing.stored.orderId)?.reviewRequestId ?? null,
            quote: cloneQuote(existing.stored.quoteSnapshot!),
          });
        }
        return projectLoadedCheckoutAttempt(existing.stored);
      }
      if (!plan.decision.permitted) {
        if (!plan.decision.reviewRequired || plan.reviewSnapshotHash === null || providerPreparation !== null) {
          return Object.freeze({ status: "facts_changed_retry" as const });
        }
        const reviewRequestId = plan.identity.keyedUuid("review-request");
        const stored: StoredCheckoutAttempt = Object.freeze({
          orderId: plan.identity.orderId,
          attemptId: plan.identity.attemptId,
          requestHash: plan.requestHash,
          status: "created",
          orderState: "eligibility_review",
          permitted: false,
          reviewRequired: true,
          hasReservations: false,
          quoteSnapshot: cloneQuote(plan.browserQuote),
          pricingRevision:
            plan.kind === "canonical_variant" ? plan.pricingRevision : null,
        });
        state.attempts.set(key, { stored, durable: null, providerPreparation: null, providerSessionId: null });
        state.reviews.set(plan.reviewSnapshotHash, { reviewRequestId, orderId: plan.identity.orderId, ownerUserId: plan.buyerUserId, snapshotHash: plan.reviewSnapshotHash });
        state.orders.set(plan.identity.orderId, { ownerUserId: plan.buyerUserId, destinationStateCode: plan.request.destination.stateCode, success: Object.freeze({ ...successFromPlan(plan), state: "eligibility_review" }) });
        bump(state, true);
        return Object.freeze({ status: "review_required" as const, orderId: plan.identity.orderId, attemptId: plan.identity.attemptId, reviewRequestId, quote: cloneQuote(plan.browserQuote) });
      }
      if (providerPreparation === null || plan.totals === null) return Object.freeze({ status: "facts_changed_retry" as const });
      if (plan.rewardsQuote?.status === "applied") {
        const rewardsReservation = await shared.reserveCheckoutRewards({
          buyerUserId: plan.buyerUserId,
          orderId: plan.identity.orderId,
          checkoutAttemptId: plan.identity.attemptId,
          idempotencyKey: plan.idempotencyKey,
          quote: plan.rewardsQuote,
          reservedAt: plan.authoritativeAt,
        });
        if (rewardsReservation.status === "conflict" || rewardsReservation.status === "unavailable") {
          return Object.freeze({ status: "facts_changed_retry" as const });
        }
      }
      const success = successFromPlan(plan);
      const stored: StoredCheckoutAttempt = Object.freeze({
        orderId: plan.identity.orderId,
        attemptId: plan.identity.attemptId,
        requestHash: plan.requestHash,
        status: "created",
        orderState: "checkout_pending",
        permitted: true,
        reviewRequired: false,
        hasReservations: true,
        quoteSnapshot: cloneQuote(plan.browserQuote),
        pricingRevision:
          plan.kind === "canonical_variant" ? plan.pricingRevision : null,
      });
      const durableCommon = {
        buyerUserId: plan.buyerUserId,
        idempotencyKey: plan.idempotencyKey,
        orderId: plan.identity.orderId,
        attemptId: plan.identity.attemptId,
        requestHash: plan.requestHash,
        attemptStatus: "created" as const,
        orderState: "checkout_pending" as const,
        provider: providerPreparation.provider,
        providerIdempotencyKey: providerPreparation.providerIdempotencyKey,
        providerSessionId: null,
        providerRequestHash: providerPreparation.providerRequestHash,
        providerExpiresAt: providerPreparation.providerExpiresAt,
        providerCustomerEmail: providerPreparation.providerCustomerEmail,
        providerOrigin: providerPreparation.providerOrigin,
        providerLivemode: providerPreparation.providerLivemode,
        providerScope: providerPreparation.providerScope,
        currency: "USD" as const,
        destination: plan.request.destination,
        shippingMinor: plan.totals.shippingMinor,
        taxMinor: plan.totals.taxMinor,
        totalMinor: plan.totals.totalMinor,
      };
      const durable = plan.kind === "canonical_variant"
        ? providerPreparation.providerRequestSchemaVersion !== 2
          ? null
          : createRepositoryDurableCheckoutRequestV2({
              ...durableCommon,
              providerRequestSchemaVersion: 2,
              providerBindingSnapshot: providerPreparation.providerBindingSnapshot,
            })
        : providerPreparation.providerRequestSchemaVersion !== 1
          ? null
          : createRepositoryDurableCheckoutRequestV1({
              ...durableCommon,
              providerRequestSchemaVersion: 1,
              lines: Object.freeze(plan.browserQuote.lines.map((line) => Object.freeze({
                productId: line.productId!,
                productName: line.productName,
                packageForm: line.packageForm,
                purchasedQuantity: line.quantity,
                postDiscountTotalMinor: line.totalMinor,
              }))),
            });
      if (durable === null) return Object.freeze({ status: "facts_changed_retry" as const });
      state.attempts.set(key, { stored, durable, providerPreparation, providerSessionId: null });
      state.orders.set(plan.identity.orderId, { ownerUserId: plan.buyerUserId, destinationStateCode: plan.request.destination.stateCode, success });
      bump(state, true);
      return Object.freeze({ status: "prepared" as const, orderId: plan.identity.orderId, attemptId: plan.identity.attemptId, reviewRequestId: null, quote: cloneQuote(plan.browserQuote) });
    },
    async releaseDefiniteFailure(input) {
      const record = [...state.attempts.values()].find((candidate) => candidate.stored.attemptId === input.attemptId && candidate.stored.orderId === input.orderId);
      if (!record) return Object.freeze({ status: "conflict" as const });
      if (!record.stored.hasReservations) return Object.freeze({ status: "already_released" as const });
      record.stored = Object.freeze({ ...record.stored, status: input.targetAttemptStatus, orderState: "cancelled", hasReservations: false });
      const order = state.orders.get(input.orderId);
      if (order) order.success = Object.freeze({ ...order.success, state: "cancelled", paymentState: input.targetAttemptStatus === "failed" ? "failed" : order.success.paymentState, updatedAt: nextInstant(state) });
      bump(state, true);
      return Object.freeze({ status: "released" as const });
    },
  });

  const providerSessionRepository: ProviderSessionRepository = Object.freeze({
    async load(input) {
      return state.attempts.get(attemptKey(input.buyerUserId, input.idempotencyKey))?.durable ?? null;
    },
    async recordOpen(value, providerSessionId) {
      const durable = projectDurableCheckoutRequest(value);
      if (durable === null) return Object.freeze({ status: "conflict" as const });
      const record = state.attempts.get(attemptKey(durable.buyerUserId, durable.idempotencyKey));
      if (!record || record.stored.orderState !== "checkout_pending") return Object.freeze({ status: "nonpayable" as const });
      if (record.providerSessionId !== null && record.providerSessionId !== providerSessionId) return Object.freeze({ status: "conflict" as const });
      const already = record.providerSessionId === providerSessionId && record.stored.status === "open";
      record.providerSessionId = providerSessionId;
      record.stored = Object.freeze({ ...record.stored, status: "open" });
      record.durable = durable.providerRequestSchemaVersion === 1
        ? createRepositoryDurableCheckoutRequestV1({ ...durable, providerSessionId, attemptStatus: "open" })
        : createRepositoryDurableCheckoutRequestV2({ ...durable, providerSessionId, attemptStatus: "open" });
      if (!already) bump(state);
      return Object.freeze({ status: already ? "idempotent" as const : "applied" as const });
    },
    async recordUnknown(value, input) {
      const durable = projectDurableCheckoutRequest(value);
      if (durable === null) return Object.freeze({ status: "conflict" as const });
      const record = state.attempts.get(attemptKey(durable.buyerUserId, durable.idempotencyKey));
      if (!record) return Object.freeze({ status: "conflict" as const });
      const known = record.providerSessionId ?? input.knownProviderSessionId;
      if (record.providerSessionId !== null && input.knownProviderSessionId !== null && record.providerSessionId !== input.knownProviderSessionId) return Object.freeze({ status: "conflict" as const });
      const already = record.stored.status === "provider_unknown" && record.providerSessionId === known;
      record.providerSessionId = known;
      record.stored = Object.freeze({ ...record.stored, status: "provider_unknown" });
      record.durable = durable.providerRequestSchemaVersion === 1
        ? createRepositoryDurableCheckoutRequestV1({ ...durable, providerSessionId: known, attemptStatus: "provider_unknown" })
        : createRepositoryDurableCheckoutRequestV2({ ...durable, providerSessionId: known, attemptStatus: "provider_unknown" });
      if (!already) bump(state);
      return Object.freeze({ status: already ? "idempotent" as const : "applied" as const });
    },
  });

  const shippingQuotePort: ShippingQuotePort = Object.freeze({
    async quoteShipping(request) {
      if (request.destination.stateCode === "DE") return Object.freeze({ status: "unavailable", reason: "unsupported_destination" });
      return Object.freeze({ status: "ready", bindingHash: request.bindingHash, reference: "synthetic-local-shipping", service: "Synthetic local test only", amountMinor: 500, currency: "USD" });
    },
  });
  const taxQuotePort: TaxQuotePort = Object.freeze({
    async quoteTax(request) {
      if (request.destination.stateCode === "DE") return Object.freeze({ status: "unavailable", reason: "unsupported_destination" });
      return Object.freeze({ status: "ready", bindingHash: request.bindingHash, reference: "synthetic-local-tax", amountMinor: 321, currency: "USD" });
    },
  });
  const rateLimitStore: RateLimitStore = Object.freeze({
    async increment(window) {
      const key = `${window.scopeHash}:${window.windowStart.toISOString()}`;
      const next = (state.rateCounts.get(key) ?? 0) + 1;
      state.rateCounts.set(key, next);
      return next;
    },
  });

  const refundRepository: RefundCommandRepository = Object.freeze({
    async claim(input) {
      ensureCommandFixtures(state);
      const refund = state.refund!;
      if (input.refundId !== refund.id) return Object.freeze({ status: "ineligible" as const });
      if (refund.status === "succeeded" || refund.status === "failed" || refund.status === "cancelled") return Object.freeze({ status: "terminal" as const, refundStatus: refund.status });
      const built = buildProviderRefundRequestV1({
        schemaVersion: 1,
        provider: input.expectedProviderContext.provider,
        refundId: refund.id,
        orderId: refund.orderId,
        requestedAmountMinor: refund.amountMinor,
        currency: "USD",
        paymentIntentId: SYNTHETIC_PROVIDER_PAYMENT_ID,
        chargeId: null,
        providerIdempotencyKey: `refund_request:${refund.id}`,
      });
      if (!built.ok) return Object.freeze({ status: "conflict" as const });
      const firstSubmission = refund.status === "requested";
      refund.attemptCount += 1;
      refund.status = "submitted";
      if (firstSubmission) bump(state);
      const descriptor: RefundClaimDescriptorV1 = Object.freeze({
        operation: refund.providerRefundId === null ? "create" : "retrieve",
        ...(refund.providerRefundId === null ? {} : { knownProviderRefundId: refund.providerRefundId }),
        actorUserId: input.actorUserId,
        actorClerkUserId: input.actorClerkUserId,
        refundId: refund.id,
        orderId: refund.orderId,
        verifiedPaymentEventId: COMMAND_PAYMENT_EVENT_ID,
        request: built.value,
        requestHash: sha256(JSON.stringify(built.value)),
        expectedAttempt: refund.attemptCount,
        expectedProviderContext: input.expectedProviderContext,
      });
      return Object.freeze({ status: "call_required" as const, descriptor });
    },
    async applyResult(input) {
      const refund = state.refund;
      if (!refund || input.descriptor.refundId !== refund.id || input.descriptor.expectedAttempt !== refund.attemptCount) return Object.freeze({ status: "stale" as const });
      if (input.result.kind === "provider_unknown") {
        refund.providerRefundId = input.result.providerRefundId;
        return Object.freeze({ status: "submitted" as const });
      }
      if (input.result.kind === "definite_rejection") {
        refund.status = "failed";
        bump(state);
        return Object.freeze({ status: "failed" as const });
      }
      refund.providerRefundId = input.result.providerRefundId;
      if (input.result.status === "failed") {
        refund.status = "failed";
        bump(state);
        return Object.freeze({ status: "failed" as const });
      }
      if (input.result.status === "canceled") {
        refund.status = "cancelled";
        bump(state);
        return Object.freeze({ status: "cancelled" as const });
      }
      return Object.freeze({ status: input.result.status === "succeeded" ? "awaiting_signed_event" as const : "submitted" as const });
    },
  });

  const fulfillmentRepository: FulfillmentCommandRepository = Object.freeze({
    async clearHold(input) {
      ensureCommandFixtures(state);
      if (input.orderId !== COMMAND_FULFILLMENT_ORDER_ID) return Object.freeze({ status: "ineligible" as const });
      const order = state.commandOrder!;
      if (order.state !== "paid_on_hold") return Object.freeze({ status: "already_clear" as const });
      order.state = "paid_pending_fulfillment";
      order.updatedAt = nextInstant(state);
      bump(state, true);
      return Object.freeze({ status: "cleared" as const });
    },
    async handoff(input) {
      ensureCommandFixtures(state);
      if (input.orderId !== COMMAND_FULFILLMENT_ORDER_ID) return Object.freeze({ status: "ineligible" as const });
      const order = state.commandOrder!;
      if (order.shipment !== "pending") return Object.freeze({ status: "already_handed_off" as const });
      if (order.state !== "paid_pending_fulfillment") return Object.freeze({ status: "held" as const, reasons: Object.freeze(["order_hold_active"]) });
      order.state = "fulfilled";
      order.shipment = "handed_off";
      order.releaseState = "consumed";
      order.updatedAt = nextInstant(state);
      state.releaseCount += 1;
      state.shipmentHandoffCount += 1;
      state.effectCount += 1;
      bump(state, true);
      return Object.freeze({ status: "handed_off" as const });
    },
    async transitionShipment(input) {
      ensureCommandFixtures(state);
      if (input.orderId !== COMMAND_FULFILLMENT_ORDER_ID) return Object.freeze({ status: "ineligible" as const });
      const order = state.commandOrder!;
      if (input.action === "deliver") {
        if (order.shipment === "delivered") return Object.freeze({ status: "already_delivered" as const });
        if (order.shipment !== "handed_off") return Object.freeze({ status: "ineligible" as const });
        order.shipment = "delivered";
        order.updatedAt = nextInstant(state);
        state.deliveryCount += 1;
        bump(state, true);
        return Object.freeze({ status: "delivered" as const });
      }
      if (order.shipment === "exception") return Object.freeze({ status: "already_exception" as const });
      if (order.shipment !== "handed_off") return Object.freeze({ status: "ineligible" as const });
      order.shipment = "exception";
      order.updatedAt = nextInstant(state);
      state.exceptionCount += 1;
      bump(state, true);
      return Object.freeze({ status: "exception" as const });
    },
  });

  function hostedRecord(input: Readonly<{ ownerUserId: string; sessionId: string }>) {
    const attempt = [...state.attempts.values()].find(
      (candidate) => candidate.providerSessionId === input.sessionId,
    );
    const durable = attempt?.durable
      ? projectDurableCheckoutRequest(attempt.durable)
      : null;
    const order = durable === null ? null : state.orders.get(durable.orderId) ?? null;
    if (
      attempt === undefined ||
      durable === null ||
      order === null ||
      durable.buyerUserId !== input.ownerUserId ||
      order.ownerUserId !== input.ownerUserId ||
      durable.providerSessionId !== input.sessionId
    ) {
      return null;
    }
    return { attempt, durable, order };
  }

  function openHostedRecord(input: Readonly<{ ownerUserId: string; sessionId: string }>) {
    const hosted = hostedRecord(input);
    if (hosted === null) return null;
    const provider = providerHarness.control.checkoutState(input.sessionId);
    const expiresAt = new Date(hosted.durable.providerExpiresAt).getTime();
    if (
      hosted.attempt.stored.status !== "open" ||
      hosted.attempt.stored.orderState !== "checkout_pending" ||
      hosted.durable.attemptStatus !== "open" ||
      hosted.durable.orderState !== "checkout_pending" ||
      hosted.order.success.state !== "checkout_pending" ||
      hosted.order.success.paymentState !== "pending_verification" ||
      provider === null ||
      provider.state !== "open" ||
      provider.expiresAt !== hosted.durable.providerExpiresAt ||
      !Number.isFinite(expiresAt) ||
      Date.now() >= expiresAt
    ) {
      return null;
    }
    return hosted;
  }

  const driver: LocalCommerceDriverV1 = Object.freeze({
    checkoutRepository,
    cartPreviewSource() {
      const records = loadSyntheticDemoCatalogRecords();
      const product = records.products.find(
        (candidate) => candidate.id === LOCAL_CANONICAL_VARIANT_FIXTURE.productId,
      );
      const price = records.prices.find(
        (candidate) =>
          candidate.id === LOCAL_CANONICAL_VARIANT_FIXTURE.priceId &&
          candidate.productId === LOCAL_CANONICAL_VARIANT_FIXTURE.productId &&
          candidate.supersededAt === null,
      );
      if (
        !product ||
        !price ||
        typeof price.amountMinor !== "number" ||
        !Number.isSafeInteger(price.amountMinor) ||
        price.amountMinor <= 0
      ) {
        return Object.freeze({ variants: Object.freeze([]) });
      }
      const availableQuantity = records.lots
        .filter((lot) =>
          lot.id === LOCAL_CANONICAL_VARIANT_FIXTURE.lotId &&
          lot.productId === product.id &&
          lot.status === "released" &&
          (lot.expiresAt === null || new Date(lot.expiresAt).getTime() > Date.now()))
        .reduce((total, lot) => total + lot.availableQuantity, 0);
      return Object.freeze({
        variants: Object.freeze([Object.freeze({
          variantId: LOCAL_CANONICAL_VARIANT_FIXTURE.variantId,
          productId: product.id,
          name: product.name,
          packageForm: product.packageForm,
          variantLabel: LOCAL_CANONICAL_VARIANT_FIXTURE.variantLabel,
          sku: LOCAL_CANONICAL_VARIANT_FIXTURE.sku,
          baseUnitMinor: price.amountMinor,
          currency: "USD" as const,
          priceStatus: "active" as const,
          availability: availableQuantity > 0 ? "available" as const : "unavailable" as const,
          availableQuantity,
          checkoutReady: true,
          eligiblePromotions: Object.freeze([]),
        })]),
      });
    },
    providerSessionRepository,
    paymentProvider: providerHarness.provider,
    shippingQuotePort,
    taxQuotePort,
    async affiliateCandidateLookup(input) {
      if (input.code !== LOCAL_AFFILIATE_CODE) {
        return Object.freeze({ status: "unavailable" as const, reason: "profile_inactive" as const });
      }
      if (shared.loadProfile(input.buyerUserId)?.status !== "active") {
        return Object.freeze({ status: "unavailable" as const, reason: "buyer_ineligible" as const });
      }
      return Object.freeze({
        status: "eligible" as const,
        code: LOCAL_AFFILIATE_CODE,
        affiliateProfileId: LOCAL_AFFILIATE_PROFILE_ID,
        affiliateUserId: LOCAL_AFFILIATE_USER_ID,
        existingAttributionId: null,
        clickedAt: input.clickedAt,
        expiresAt: input.expiresAt,
        affiliatePolicyId: LOCAL_AFFILIATE_POLICY_ID,
        affiliatePolicyVersion: 1,
      });
    },
    async referralCandidateLookup(input) {
      if (input.code !== LOCAL_REFERRAL_CODE) {
        return Object.freeze({ status: "unavailable" as const, reason: "code_inactive" as const });
      }
      if (shared.loadProfile(input.buyerUserId)?.status !== "active") {
        return Object.freeze({ status: "unavailable" as const, reason: "policy_unavailable" as const });
      }
      return Object.freeze({
        status: "eligible" as const,
        referralCodeId: LOCAL_REFERRAL_CODE_ID,
        referrerUserId: LOCAL_REFERRER_USER_ID,
        policy: Object.freeze({
          id: LOCAL_REFERRAL_POLICY_ID,
          version: 1,
          status: "active" as const,
          attributionDays: 30 as const,
          referredDiscountBasisPoints: 1_000,
          referredDiscountCapMinor: 2_500,
          referrerPointsPerDollar: 5,
          referrerRewardCapPoints: 2_500,
          effectiveAt: "2026-08-01T00:00:00.000Z",
          supersededAt: null,
        }),
      });
    },
    rateLimitStore,
    refundRepository,
    fulfillmentRepository,
    reset() {
      Object.assign(state, initialState());
      providerHarness.control.reset();
      return inspection(state);
    },
    inspect: () => inspection(state),
    loadSyntheticHostedSession(input) {
      const existing = hostedRecord(input);
      const replayed = existing !== null &&
        state.processedLocalEvents.has(`local-event:${input.sessionId}`) &&
        existing.order.success.paymentState === "paid";
      const hosted = replayed ? existing : openHostedRecord(input);
      return hosted === null
        ? null
        : Object.freeze({
            orderId: hosted.durable.orderId,
            sessionId: input.sessionId,
            totalMinor: hosted.durable.totalMinor,
            currency: "USD",
          });
    },
    returnWithoutEvent(input) {
      const hosted = openHostedRecord(input);
      return hosted
        ? Object.freeze({ status: "pending" as const, orderId: hosted.durable.orderId })
        : null;
    },
    completeWithInternallySignedEvent(input) {
      const eventId = `local-event:${input.sessionId}`;
      const existing = hostedRecord(input);
      if (existing === null) return null;
      if (state.processedLocalEvents.has(eventId)) {
        return existing.order.success.paymentState === "paid"
          ? Object.freeze({ status: "paid" as const, orderId: existing.durable.orderId })
          : null;
      }
      const hosted = openHostedRecord(input);
      const configuredSecret = configuredInternalEventSecret();
      if (
        hosted === null ||
        typeof input.secret !== "string" ||
        input.secret.length < 32 ||
        typeof configuredSecret !== "string" ||
        configuredSecret.length < 32
      ) return null;
      const payload = JSON.stringify({ schemaVersion: 1, eventId, sessionId: input.sessionId, orderId: hosted.durable.orderId, amountMinor: hosted.durable.totalMinor, currency: "USD" });
      const signature = createHmac("sha256", input.secret).update(payload).digest();
      const verified = createHmac("sha256", configuredSecret).update(payload).digest();
      if (signature.byteLength !== verified.byteLength || !timingSafeEqual(signature, verified)) return null;
      state.processedLocalEvents.add(eventId);
      state.paymentTransitionCount += 1;
      hosted.order.success = Object.freeze({ ...hosted.order.success, state: "paid_pending_fulfillment", paymentState: "paid", updatedAt: nextInstant(state) });
      hosted.attempt.stored = Object.freeze({ ...hosted.attempt.stored, status: "completed", orderState: "paid_pending_fulfillment" });
      hosted.attempt.durable = hosted.durable.providerRequestSchemaVersion === 1
        ? createRepositoryDurableCheckoutRequestV1({ ...hosted.durable, attemptStatus: "completed", orderState: "paid_pending_fulfillment" })
        : createRepositoryDurableCheckoutRequestV2({ ...hosted.durable, attemptStatus: "completed", orderState: "paid_pending_fulfillment" });
      providerHarness.control.setCheckoutState(input.sessionId, "complete");
      bump(state, true);
      return Object.freeze({ status: "paid" as const, orderId: hosted.durable.orderId });
    },
    loadSuccess(ownerUserId, orderId) {
      const order = state.orders.get(orderId);
      return order?.ownerUserId === ownerUserId ? order.success : null;
    },
    listOrders(ownerUserId): readonly OrderSummary[] {
      return Object.freeze([...state.orders.values()]
        .filter((order) => order.ownerUserId === ownerUserId)
        .map((order) => Object.freeze({
          id: order.success.orderId,
          state: order.success.state,
          currency: order.success.currency,
          totalMinor: order.success.totalMinor,
          paymentState: order.success.paymentState,
          refundState: order.success.refundState,
          holdState: order.success.holdState,
          releaseState: order.success.releaseState,
          shipmentState: order.success.shipmentState,
          createdAt: order.success.createdAt,
        })));
    },
    loadOrder(ownerUserId, orderId) {
      const order = state.orders.get(orderId);
      return order?.ownerUserId === ownerUserId ? orderDetail(order.success, order.destinationStateCode) : null;
    },
    commandTargets() {
      ensureCommandFixtures(state);
      return Object.freeze({ refundId: COMMAND_REFUND_ID, fulfillmentOrderId: COMMAND_FULFILLMENT_ORDER_ID });
    },
    adminSnapshotItems(resource) {
      ensureCommandFixtures(state);
      if (resource === "orders") {
        return Object.freeze([
          Object.freeze({
            id: COMMAND_REFUND_ORDER_ID, buyerUserId: "50000000-0000-4000-8000-000000000004", buyerStatusSnapshot: "active", attestationAcceptanceId: "67000000-0000-4000-8000-000000000002", attestationVersion: 1,
            destinationStateCode: "CA", currency: "USD", subtotalMinor: 2400, discountMinor: 0, taxMinor: 0, shippingMinor: 0, totalMinor: 2400, state: "paid_pending_fulfillment", itemCount: 1,
            verifiedPaymentEventCount: 1, paymentState: "paid", holdState: "none",
            refundState: state.refund!.status === "requested" || state.refund!.status === "submitted" ? "pending" : state.refund!.status === "succeeded" ? "full" : "failed",
            currentReleaseState: null, releaseVersion: null, shipmentState: null,
            providerExecutionBoundary: "task6_managed", createdAt: FIXED_NOW, updatedAt: FIXED_NOW,
          }),
          Object.freeze({
            id: COMMAND_FULFILLMENT_ORDER_ID, buyerUserId: "50000000-0000-4000-8000-000000000004", buyerStatusSnapshot: "active", attestationAcceptanceId: "67000000-0000-4000-8000-000000000002", attestationVersion: 1,
            destinationStateCode: "CA", currency: "USD", subtotalMinor: 2400, discountMinor: 0, taxMinor: 0, shippingMinor: 0, totalMinor: 2400, state: state.commandOrder!.state, itemCount: 1,
            verifiedPaymentEventCount: 1, paymentState: "paid", holdState: state.commandOrder!.state === "paid_on_hold" ? "active" : "none", refundState: "none", currentReleaseState: state.commandOrder!.releaseState === "none" ? null : "consumed", releaseVersion: state.commandOrder!.releaseState === "none" ? null : 1, shipmentState: state.commandOrder!.shipment,
            providerExecutionBoundary: "task6_managed", createdAt: FIXED_NOW, updatedAt: state.commandOrder!.updatedAt,
          }),
        ]);
      }
      if (resource === "refunds") {
        return Object.freeze([Object.freeze({
          id: state.refund!.id, orderId: state.refund!.orderId, requestedByUserId: "50000000-0000-4000-8000-000000000003", verifiedPaymentEventId: COMMAND_PAYMENT_EVENT_ID,
          provider: "local_test", requestedAmountMinor: state.refund!.amountMinor, confirmedAmountMinor: state.refund!.confirmedAmountMinor, currency: "USD", status: state.refund!.status,
          reasonRedacted: "Synthetic local test only", requestedAt: state.refund!.requestedAt, confirmedAt: null, providerRefundRecorded: state.refund!.providerRefundId !== null, providerExecutionBoundary: "task6_managed",
        })]);
      }
      return Object.freeze([Object.freeze({
        id: "68000000-0000-4000-8000-000000000006", orderId: COMMAND_FULFILLMENT_ORDER_ID,
        fulfillmentReleaseId: state.commandOrder!.releaseState === "none" ? null : "68000000-0000-4000-8000-000000000007",
        releaseState: state.commandOrder!.releaseState === "none" ? null : "consumed", releaseVersion: state.commandOrder!.releaseState === "none" ? null : 1, releaseExpiresAt: state.commandOrder!.releaseState === "none" ? null : "2026-08-26T12:05:00.000Z",
        carrier: "SYNTHETIC LOCAL TEST ONLY", trackingReference: "SYNTHETIC-NOT-A-CARRIER-TRACKING-ID", state: state.commandOrder!.shipment,
        handedOffAt: state.commandOrder!.shipment === "pending" ? null : state.commandOrder!.updatedAt,
        deliveredAt: state.commandOrder!.shipment === "delivered" ? state.commandOrder!.updatedAt : null,
        createdAt: FIXED_NOW, updatedAt: state.commandOrder!.updatedAt, handoffConfirmationBoundary: "task6_managed",
      })]);
    },
  });
  return driver;
}
