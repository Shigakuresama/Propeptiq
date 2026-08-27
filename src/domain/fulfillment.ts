export const FULFILLMENT_DENIAL_CODES = Object.freeze([
  "fulfillment_input_invalid",
  "payment_unverified",
  "refund_pending",
  "payment_refunded",
  "payment_disputed",
  "order_hold_active",
  "buyer_blocked",
  "buyer_review_not_covered",
  "product_inactive",
  "destination_not_allowed",
  "destination_review_not_covered",
  "inventory_reservation_missing",
  "reserved_lot_unavailable",
  "shipment_metadata_missing",
  "fulfillment_unavailable",
] as const);

export type FulfillmentDenialCode =
  (typeof FULFILLMENT_DENIAL_CODES)[number];

export type FulfillmentInput = Readonly<{
  orderId: string;
  verifiedPaymentEventId: string | null;
  refundPending: boolean;
  confirmedRefundAmountMinor: number;
  paymentDisputed: boolean;
  orderHoldActive: boolean;
  buyerStatus: "active" | "review" | "blocked";
  buyerReviewCovered: boolean;
  productsActive: boolean;
  destinationStatus: "allowed" | "review" | "blocked" | "unavailable";
  destinationReviewCovered: boolean;
  inventoryReservationsComplete: boolean;
  reservedLotsAvailable: boolean;
  shipmentMetadataPresent: boolean;
  fulfillmentCapabilityEnabled: boolean;
  reviewRequestId: string | null;
}>;

export type FulfillmentDecision = Readonly<{
  permitted: boolean;
  reasons: readonly FulfillmentDenialCode[];
  orderId: string;
  verifiedPaymentEventId: string | null;
  reviewRequestId: string | null;
}>;

const authoritativeDecisions = new WeakSet<object>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function authoritativeDecision(
  value: Omit<FulfillmentDecision, "reasons"> & {
    reasons: FulfillmentDenialCode[];
  },
): FulfillmentDecision {
  const decision = Object.freeze({
    ...value,
    reasons: Object.freeze([...new Set(value.reasons)]),
  });
  authoritativeDecisions.add(decision);
  return decision;
}

function invalidDecision(input: unknown): FulfillmentDecision {
  return authoritativeDecision({
    permitted: false,
    reasons: ["fulfillment_input_invalid"],
    orderId:
      isRecord(input) && isNonBlankString(input.orderId) ? input.orderId : "",
    verifiedPaymentEventId: null,
    reviewRequestId: null,
  });
}

export function evaluateFulfillment(input: FulfillmentInput): FulfillmentDecision {
  if (
    !isRecord(input) ||
    !isNonBlankString(input.orderId) ||
    !(
      input.verifiedPaymentEventId === null ||
      isNonBlankString(input.verifiedPaymentEventId)
    ) ||
    typeof input.refundPending !== "boolean" ||
    !Number.isSafeInteger(input.confirmedRefundAmountMinor) ||
    input.confirmedRefundAmountMinor < 0 ||
    typeof input.paymentDisputed !== "boolean" ||
    typeof input.orderHoldActive !== "boolean" ||
    !["active", "review", "blocked"].includes(input.buyerStatus as string) ||
    typeof input.buyerReviewCovered !== "boolean" ||
    typeof input.productsActive !== "boolean" ||
    !["allowed", "review", "blocked", "unavailable"].includes(
      input.destinationStatus as string,
    ) ||
    typeof input.destinationReviewCovered !== "boolean" ||
    typeof input.inventoryReservationsComplete !== "boolean" ||
    typeof input.reservedLotsAvailable !== "boolean" ||
    typeof input.shipmentMetadataPresent !== "boolean" ||
    typeof input.fulfillmentCapabilityEnabled !== "boolean" ||
    !(input.reviewRequestId === null || isNonBlankString(input.reviewRequestId))
  ) {
    return invalidDecision(input);
  }

  const buyerReviewCovered =
    input.buyerStatus === "review" && input.buyerReviewCovered;
  const destinationReviewCovered =
    input.destinationStatus === "review" && input.destinationReviewCovered;
  const usesCoveredReview = buyerReviewCovered || destinationReviewCovered;
  if (
    (input.buyerStatus !== "review" && input.buyerReviewCovered) ||
    (input.destinationStatus !== "review" &&
      input.destinationReviewCovered) ||
    (usesCoveredReview && !isNonBlankString(input.reviewRequestId)) ||
    (!usesCoveredReview && input.reviewRequestId !== null)
  ) {
    return invalidDecision(input);
  }

  const reasons: FulfillmentDenialCode[] = [];
  if (input.verifiedPaymentEventId === null) reasons.push("payment_unverified");
  if (input.refundPending) reasons.push("refund_pending");
  if (input.confirmedRefundAmountMinor > 0) reasons.push("payment_refunded");
  if (input.paymentDisputed) reasons.push("payment_disputed");
  if (input.orderHoldActive) reasons.push("order_hold_active");
  if (input.buyerStatus === "blocked") {
    reasons.push("buyer_blocked");
  } else if (input.buyerStatus === "review" && !input.buyerReviewCovered) {
    reasons.push("buyer_review_not_covered");
  }
  if (!input.productsActive) reasons.push("product_inactive");
  if (
    input.destinationStatus === "blocked" ||
    input.destinationStatus === "unavailable"
  ) {
    reasons.push("destination_not_allowed");
  } else if (
    input.destinationStatus === "review" &&
    !input.destinationReviewCovered
  ) {
    reasons.push("destination_review_not_covered");
  }
  if (!input.inventoryReservationsComplete) {
    reasons.push("inventory_reservation_missing");
  }
  if (!input.reservedLotsAvailable) reasons.push("reserved_lot_unavailable");
  if (!input.shipmentMetadataPresent) reasons.push("shipment_metadata_missing");
  if (!input.fulfillmentCapabilityEnabled) {
    reasons.push("fulfillment_unavailable");
  }

  return authoritativeDecision({
    permitted: reasons.length === 0 && input.verifiedPaymentEventId !== null,
    reasons,
    orderId: input.orderId,
    verifiedPaymentEventId: input.verifiedPaymentEventId,
    reviewRequestId: usesCoveredReview ? input.reviewRequestId : null,
  });
}

export function isAuthoritativeFulfillmentDecision(
  value: unknown,
): value is FulfillmentDecision {
  return isRecord(value) && authoritativeDecisions.has(value);
}
