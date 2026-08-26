import {
  isAuthoritativeCheckoutDecision,
  type CheckoutDecision,
} from "@/domain/eligibility";
import {
  isAuthoritativeFulfillmentDecision,
  type FulfillmentDecision,
} from "@/domain/fulfillment";
import type { Result } from "@/domain/result";

export type OrderState =
  | "draft"
  | "eligibility_review"
  | "compliance_hold"
  | "ready_for_checkout"
  | "checkout_pending"
  | "payment_failed"
  | "paid_pending_fulfillment"
  | "paid_on_hold"
  | "ready_for_fulfillment"
  | "fulfillment_in_progress"
  | "fulfilled"
  | "cancelled";

export type OrderSnapshot = Readonly<{
  orderId: string;
  state: OrderState;
  paymentEvidenceId: string | null;
  reviewRequestId: string | null;
  fulfillmentReleaseVersion: number | null;
  lastFulfillmentReleaseVersion: number;
  carrierHandoffAt: string | null;
}>;

export type OrderEvent =
  | Readonly<{ type: "start_eligibility" }>
  | Readonly<{ type: "place_compliance_hold" }>
  | Readonly<{ type: "resume_eligibility" }>
  | Readonly<{ type: "eligibility_passed"; decision: CheckoutDecision }>
  | Readonly<{ type: "begin_checkout" }>
  | Readonly<{
      type: "checkout_closed";
      source: "verified_provider_event" | "provider_retrieval";
      reason: "payment_failed" | "checkout_expired";
      providerEvidenceId: string;
    }>
  | Readonly<{
      type: "payment_verified";
      source: "verified_provider_event";
      paymentEvidenceId: string;
      reservationDisposition: "active" | "authoritatively_released";
    }>
  | Readonly<{
      type: "payment_disputed";
      source: "verified_provider_event";
      providerEvidenceId: string;
    }>
  | Readonly<{
      type: "provider_financial_hold";
      source: "verified_provider_event";
      providerEvidenceId: string;
    }>
  | Readonly<{
      type: "post_payment_hold";
      decision: FulfillmentDecision;
    }>
  | Readonly<{
      type: "clear_fulfillment_hold";
      decision: FulfillmentDecision;
    }>
  | Readonly<{
      type: "release_for_fulfillment";
      decision: FulfillmentDecision;
      paymentEvidenceId: string;
      fulfillmentReleaseVersion: number;
    }>
  | Readonly<{
      type: "begin_fulfillment";
      now: string;
      decision: FulfillmentDecision;
      release: FulfillmentReleaseSnapshot;
    }>
  | Readonly<{
      type: "carrier_handoff";
      carrierHandoffAt: string;
      recordedAt: string;
      consumedRelease: FulfillmentReleaseSnapshot;
    }>
  | Readonly<{ type: "cancel" }>;

export type TransitionError = Readonly<{
  code:
    | "invalid_transition"
    | "invalid_snapshot"
    | "missing_payment_evidence"
    | "invalid_fulfillment_decision"
    | "invalid_release"
    | "carrier_handoff_already_occurred"
    | "invalid_carrier_handoff"
    | "payment_mismatch"
    | "invalid_amount"
    | "refund_exceeds_balance"
    | "missing_refund_evidence"
    | "eligibility_not_passed"
    | "release_not_current"
    | "release_already_consumed";
  state: string;
  event: string;
}>;

export type PaymentState =
  | "unpaid"
  | "paid"
  | "refund_pending"
  | "partially_refunded"
  | "refunded"
  | "disputed";

export type PaymentSnapshot = Readonly<{
  state: PaymentState;
  currency: string;
  orderAmountMinor: number;
  paidAmountMinor: number;
  refundedAmountMinor: number;
  pendingRefundAmountMinor: number;
}>;

export type PaymentEvent =
  | Readonly<{
      type: "verified_payment";
      source: "verified_provider_event";
      amountMinor: number;
      currency: string;
      providerEvidenceId: string;
    }>
  | Readonly<{
      type: "refund_requested";
      amountMinor: number;
      currency: string;
      requestId: string;
    }>
  | Readonly<{
      type: "verified_refund";
      source: "verified_provider_event";
      cumulativeRefundedAmountMinor: number;
      currency: string;
      providerEvidenceId: string;
    }>
  | Readonly<{
      type: "dispute_recorded";
      source: "verified_provider_event";
      providerEvidenceId: string;
    }>;

export type FulfillmentReleaseState =
  | "absent"
  | "issued"
  | "revoked"
  | "expired"
  | "consumed";

export type FulfillmentReleaseSnapshot = Readonly<{
  orderId: string;
  state: FulfillmentReleaseState;
  version: number | null;
  lastVersion: number;
  paymentEvidenceId: string | null;
  reviewRequestId: string | null;
  expiresAt: string | null;
}>;

export type FulfillmentReleaseEvent =
  | Readonly<{
      type: "issue";
      now: string;
      decision: FulfillmentDecision;
      version: number;
      paymentEvidenceId: string;
      expiresAt: string;
    }>
  | Readonly<{ type: "revoke"; reasonCode: string }>
  | Readonly<{ type: "expire"; now: string }>
  | Readonly<{
      type: "consume";
      now: string;
      decision: FulfillmentDecision;
    }>;

export type RequiredOrderIncident = "inventory_conflict";

export type OrderTransition = Readonly<{
  snapshot: OrderSnapshot;
  requiredIncidents: readonly RequiredOrderIncident[];
}>;

const orderStates = new Set<OrderState>([
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

const paymentStates = new Set<PaymentState>([
  "unpaid",
  "paid",
  "refund_pending",
  "partially_refunded",
  "refunded",
  "disputed",
]);

const releaseStates = new Set<FulfillmentReleaseState>([
  "absent",
  "issued",
  "revoked",
  "expired",
  "consumed",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPermittedCheckoutDecision(
  value: unknown,
): value is CheckoutDecision {
  return (
    isAuthoritativeCheckoutDecision(value) &&
    value.permitted === true &&
    value.reviewRequired === false
  );
}

function isPermittedFulfillmentDecision(
  value: unknown,
): value is FulfillmentDecision {
  return (
    isAuthoritativeFulfillmentDecision(value) &&
    value.permitted === true &&
    value.reasons.length === 0 &&
    isNonBlankString(value.verifiedPaymentEventId)
  );
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isValidOrderSnapshot(value: unknown): value is OrderSnapshot {
  if (
    !isRecord(value) ||
    !isNonBlankString(value.orderId) ||
    !orderStates.has(value.state as OrderState)
  ) {
    return false;
  }
  if (
    !isNonnegativeSafeInteger(value.lastFulfillmentReleaseVersion) ||
    !(
      value.paymentEvidenceId === null ||
      isNonBlankString(value.paymentEvidenceId)
    ) ||
    !(value.reviewRequestId === null || isNonBlankString(value.reviewRequestId)) ||
    !(
      value.fulfillmentReleaseVersion === null ||
      isPositiveSafeInteger(value.fulfillmentReleaseVersion)
    ) ||
    !(value.carrierHandoffAt === null || isCanonicalInstant(value.carrierHandoffAt))
  ) {
    return false;
  }

  const state = value.state as OrderState;
  const isPrePaymentState = [
    "draft",
    "eligibility_review",
    "compliance_hold",
    "ready_for_checkout",
    "checkout_pending",
    "payment_failed",
    "cancelled",
  ].includes(state);
  if (isPrePaymentState) {
    return (
      value.paymentEvidenceId === null &&
      value.reviewRequestId === null &&
      value.fulfillmentReleaseVersion === null &&
      value.lastFulfillmentReleaseVersion === 0 &&
      value.carrierHandoffAt === null
    );
  }

  if (state === "paid_pending_fulfillment" || state === "paid_on_hold") {
    return (
      isNonBlankString(value.paymentEvidenceId) &&
      value.reviewRequestId === null &&
      value.fulfillmentReleaseVersion === null &&
      value.carrierHandoffAt === null
    );
  }

  const releaseIsBound =
    isNonBlankString(value.paymentEvidenceId) &&
    (value.reviewRequestId === null || isNonBlankString(value.reviewRequestId)) &&
    isPositiveSafeInteger(value.fulfillmentReleaseVersion) &&
    value.fulfillmentReleaseVersion === value.lastFulfillmentReleaseVersion;

  if (state === "ready_for_fulfillment" || state === "fulfillment_in_progress") {
    return releaseIsBound && value.carrierHandoffAt === null;
  }

  return state === "fulfilled" && releaseIsBound && isCanonicalInstant(value.carrierHandoffAt);
}

function isValidPaymentSnapshot(value: unknown): value is PaymentSnapshot {
  if (
    !isRecord(value) ||
    !paymentStates.has(value.state as PaymentState) ||
    typeof value.currency !== "string" ||
    !/^[A-Z]{3}$/.test(value.currency) ||
    !isNonnegativeSafeInteger(value.orderAmountMinor) ||
    !isNonnegativeSafeInteger(value.paidAmountMinor) ||
    !isNonnegativeSafeInteger(value.refundedAmountMinor) ||
    !isNonnegativeSafeInteger(value.pendingRefundAmountMinor)
  ) {
    return false;
  }

  const state = value.state as PaymentState;
  const paidAmountIsExact = value.paidAmountMinor === value.orderAmountMinor;
  const refundIsWithinPaid = value.refundedAmountMinor <= value.paidAmountMinor;
  if (state === "unpaid") {
    return (
      value.paidAmountMinor === 0 &&
      value.refundedAmountMinor === 0 &&
      value.pendingRefundAmountMinor === 0
    );
  }
  if (!paidAmountIsExact || !refundIsWithinPaid) return false;
  if (state === "paid") {
    return value.refundedAmountMinor === 0 && value.pendingRefundAmountMinor === 0;
  }
  if (state === "refund_pending") {
    return (
      value.pendingRefundAmountMinor > 0 &&
      value.pendingRefundAmountMinor <=
        value.paidAmountMinor - value.refundedAmountMinor
    );
  }
  if (state === "partially_refunded") {
    return (
      value.refundedAmountMinor > 0 &&
      value.refundedAmountMinor < value.paidAmountMinor &&
      value.pendingRefundAmountMinor === 0
    );
  }
  if (state === "refunded") {
    return (
      value.refundedAmountMinor === value.paidAmountMinor &&
      value.pendingRefundAmountMinor === 0
    );
  }
  return value.refundedAmountMinor < value.paidAmountMinor && value.pendingRefundAmountMinor === 0;
}

function isValidFulfillmentReleaseSnapshot(
  value: unknown,
): value is FulfillmentReleaseSnapshot {
  if (
    !isRecord(value) ||
    !isNonBlankString(value.orderId) ||
    !releaseStates.has(value.state as FulfillmentReleaseState) ||
    !isNonnegativeSafeInteger(value.lastVersion) ||
    !(value.version === null || isPositiveSafeInteger(value.version)) ||
    !(
      value.paymentEvidenceId === null ||
      isNonBlankString(value.paymentEvidenceId)
    ) ||
    !(value.reviewRequestId === null || isNonBlankString(value.reviewRequestId)) ||
    !(value.expiresAt === null || isCanonicalInstant(value.expiresAt))
  ) {
    return false;
  }

  const state = value.state as FulfillmentReleaseState;
  if (state === "issued" || state === "consumed") {
    return (
      isPositiveSafeInteger(value.version) &&
      value.version === value.lastVersion &&
      isNonBlankString(value.paymentEvidenceId) &&
      isCanonicalInstant(value.expiresAt)
    );
  }

  if (state === "revoked" || state === "expired") {
    return (
      value.version === null &&
      value.paymentEvidenceId === null &&
      value.reviewRequestId === null &&
      value.expiresAt === null &&
      value.lastVersion > 0
    );
  }

  return (
    value.version === null &&
    value.paymentEvidenceId === null &&
    value.reviewRequestId === null &&
    value.expiresAt === null &&
    (state !== "absent" || value.lastVersion === 0)
  );
}

export function transitionOrder(
  snapshot: OrderSnapshot,
  event: OrderEvent,
): Result<OrderTransition, TransitionError> {
  const snapshotState =
    isRecord(snapshot) && typeof snapshot.state === "string"
      ? snapshot.state
      : "unknown";
  const eventType =
    isRecord(event) && typeof event.type === "string"
      ? event.type
      : "unknown";
  const succeed = (
    state: OrderState,
    changes: Partial<OrderSnapshot> = {},
    requiredIncidents: readonly RequiredOrderIncident[] = [],
  ): Result<OrderTransition, TransitionError> =>
    Object.freeze({
      ok: true,
      value: Object.freeze({
        snapshot: Object.freeze({ ...snapshot, ...changes, state }),
        requiredIncidents: Object.freeze([...new Set(requiredIncidents)]),
      }),
    });
  const fail = (
    code: TransitionError["code"] = "invalid_transition",
  ): Result<OrderTransition, TransitionError> =>
    Object.freeze({
      ok: false,
      error: Object.freeze({ code, state: snapshotState, event: eventType }),
    });

  // A corrupted/missing durable payment projection must be quarantinable, but
  // it must never become usable as release, clear-hold, or handoff authority.
  // This event-scoped admission is deliberately narrower than snapshot
  // validity: only an authoritative denied decision with no claimed payment
  // evidence may move/retain the pre-handoff order on hold.
  const unbackedPaidHoldProjection =
    isRecord(snapshot) &&
    (snapshot.state === "paid_pending_fulfillment" ||
      snapshot.state === "paid_on_hold") &&
    isNonBlankString(snapshot.orderId) &&
    snapshot.paymentEvidenceId === null &&
    snapshot.reviewRequestId === null &&
    snapshot.fulfillmentReleaseVersion === null &&
    isNonnegativeSafeInteger(snapshot.lastFulfillmentReleaseVersion) &&
    snapshot.carrierHandoffAt === null;
  const deniedHoldDecision =
    isRecord(event) &&
    event.type === "post_payment_hold" &&
    isAuthoritativeFulfillmentDecision(event.decision) &&
    event.decision.permitted === false &&
    event.decision.orderId === snapshot.orderId &&
    event.decision.verifiedPaymentEventId === null;
  if (unbackedPaidHoldProjection && deniedHoldDecision) {
    return succeed("paid_on_hold", {
      paymentEvidenceId: null,
      reviewRequestId: null,
      fulfillmentReleaseVersion: null,
      carrierHandoffAt: null,
    });
  }

  if (!isValidOrderSnapshot(snapshot)) {
    return fail("invalid_snapshot");
  }
  if (!isRecord(event) || typeof event.type !== "string") {
    return fail("invalid_transition");
  }

  if (snapshot.state === "draft" && event.type === "start_eligibility") {
    return succeed("eligibility_review");
  }
  if (
    snapshot.state === "eligibility_review" &&
    event.type === "place_compliance_hold"
  ) {
    return succeed("compliance_hold");
  }
  if (
    snapshot.state === "compliance_hold" &&
    event.type === "resume_eligibility"
  ) {
    return succeed("eligibility_review");
  }
  if (
    snapshot.state === "eligibility_review" &&
    event.type === "eligibility_passed" &&
    isPermittedCheckoutDecision(event.decision)
  ) {
    return succeed("ready_for_checkout");
  }
  if (
    snapshot.state === "ready_for_checkout" &&
    event.type === "begin_checkout"
  ) {
    return succeed("checkout_pending");
  }
  if (
    snapshot.state === "checkout_pending" &&
    event.type === "checkout_closed"
  ) {
    if (
      !["verified_provider_event", "provider_retrieval"].includes(
        event.source,
      ) ||
      !isNonBlankString(event.providerEvidenceId)
    ) {
      return fail("missing_payment_evidence");
    }
    if (!["payment_failed", "checkout_expired"].includes(event.reason)) {
      return fail("invalid_transition");
    }
    return succeed("payment_failed");
  }
  if (
    (snapshot.state === "checkout_pending" ||
      snapshot.state === "payment_failed" ||
      snapshot.state === "cancelled") &&
    event.type === "payment_verified"
  ) {
    if (
      event.source !== "verified_provider_event" ||
      !isNonBlankString(event.paymentEvidenceId)
    ) {
      return fail("missing_payment_evidence");
    }
    if (
      event.reservationDisposition !== "active" &&
      event.reservationDisposition !== "authoritatively_released"
    ) {
      return fail("invalid_transition");
    }
    if (
      snapshot.state === "cancelled" &&
      event.reservationDisposition !== "authoritatively_released"
    ) {
      return fail("invalid_transition");
    }
    if (event.reservationDisposition === "authoritatively_released") {
      return succeed(
        "paid_on_hold",
        { paymentEvidenceId: event.paymentEvidenceId },
        ["inventory_conflict"],
      );
    }
    return succeed("paid_pending_fulfillment", {
      paymentEvidenceId: event.paymentEvidenceId,
    });
  }
  if (
    (snapshot.state === "paid_pending_fulfillment" ||
      snapshot.state === "paid_on_hold" ||
      snapshot.state === "ready_for_fulfillment" ||
      snapshot.state === "fulfillment_in_progress") &&
    event.type === "payment_disputed"
  ) {
    if (
      event.source !== "verified_provider_event" ||
      !isNonBlankString(event.providerEvidenceId)
    ) {
      return fail("missing_payment_evidence");
    }
    return succeed("paid_on_hold", {
      reviewRequestId: null,
      fulfillmentReleaseVersion: null,
    });
  }
  if (
    (snapshot.state === "paid_pending_fulfillment" ||
      snapshot.state === "paid_on_hold" ||
      snapshot.state === "ready_for_fulfillment" ||
      snapshot.state === "fulfillment_in_progress") &&
    event.type === "provider_financial_hold"
  ) {
    if (
      event.source !== "verified_provider_event" ||
      !isNonBlankString(event.providerEvidenceId)
    ) {
      return fail("missing_payment_evidence");
    }
    return succeed("paid_on_hold", {
      reviewRequestId: null,
      fulfillmentReleaseVersion: null,
    });
  }
  if (
    (snapshot.state === "paid_pending_fulfillment" ||
      snapshot.state === "paid_on_hold" ||
      snapshot.state === "ready_for_fulfillment" ||
      snapshot.state === "fulfillment_in_progress") &&
    event.type === "post_payment_hold"
  ) {
    if (
      !isAuthoritativeFulfillmentDecision(event.decision) ||
      event.decision.orderId !== snapshot.orderId ||
      event.decision.permitted
    ) {
      return fail("invalid_fulfillment_decision");
    }
    if (
      event.decision.verifiedPaymentEventId !== null &&
      event.decision.verifiedPaymentEventId !== snapshot.paymentEvidenceId
    ) {
      return fail("payment_mismatch");
    }
    return succeed("paid_on_hold", {
      reviewRequestId: null,
      fulfillmentReleaseVersion: null,
    });
  }
  if (
    snapshot.state === "paid_on_hold" &&
    event.type === "clear_fulfillment_hold"
  ) {
    if (
      !isPermittedFulfillmentDecision(event.decision) ||
      event.decision.orderId !== snapshot.orderId
    ) {
      return fail("invalid_fulfillment_decision");
    }
    if (event.decision.verifiedPaymentEventId !== snapshot.paymentEvidenceId) {
      return fail("payment_mismatch");
    }
    return succeed("paid_pending_fulfillment", {
      reviewRequestId: null,
      fulfillmentReleaseVersion: null,
    });
  }
  if (
    snapshot.state === "paid_pending_fulfillment" &&
    event.type === "release_for_fulfillment"
  ) {
    if (
      !isPermittedFulfillmentDecision(event.decision) ||
      event.decision.orderId !== snapshot.orderId
    ) {
      return fail("invalid_fulfillment_decision");
    }
    if (
      !isNonBlankString(event.paymentEvidenceId) ||
      event.paymentEvidenceId !== snapshot.paymentEvidenceId ||
      event.decision.verifiedPaymentEventId !== snapshot.paymentEvidenceId
    ) {
      return fail("payment_mismatch");
    }
    if (
      !Number.isSafeInteger(event.fulfillmentReleaseVersion) ||
      event.fulfillmentReleaseVersion <= snapshot.lastFulfillmentReleaseVersion
    ) {
      return fail("invalid_release");
    }
    return succeed("ready_for_fulfillment", {
      reviewRequestId: event.decision.reviewRequestId,
      fulfillmentReleaseVersion: event.fulfillmentReleaseVersion,
      lastFulfillmentReleaseVersion: event.fulfillmentReleaseVersion,
    });
  }
  if (
    snapshot.state === "ready_for_fulfillment" &&
    event.type === "begin_fulfillment"
  ) {
    if (
      !isPermittedFulfillmentDecision(event.decision) ||
      event.decision.orderId !== snapshot.orderId
    ) {
      return fail("invalid_fulfillment_decision");
    }
    if (!isCanonicalInstant(event.now)) return fail("invalid_release");
    if (!isValidFulfillmentReleaseSnapshot(event.release)) {
      return fail("invalid_release");
    }
    if (
      event.release.state !== "issued" ||
      event.release.orderId !== snapshot.orderId ||
      snapshot.fulfillmentReleaseVersion === null ||
      event.release.version !== snapshot.fulfillmentReleaseVersion ||
      event.release.paymentEvidenceId !== snapshot.paymentEvidenceId ||
      event.release.reviewRequestId !== snapshot.reviewRequestId ||
      event.decision.verifiedPaymentEventId !== snapshot.paymentEvidenceId ||
      event.decision.reviewRequestId !== snapshot.reviewRequestId ||
      new Date(event.now).getTime() >=
        new Date(event.release.expiresAt ?? "").getTime()
    ) {
      return fail("invalid_release");
    }
    return succeed("fulfillment_in_progress");
  }
  if (
    snapshot.state === "fulfillment_in_progress" &&
    event.type === "carrier_handoff"
  ) {
    const parsedHandoff = new Date(event.carrierHandoffAt);
    const parsedRecordedAt = new Date(event.recordedAt);
    const consumedRelease = event.consumedRelease;
    if (
      !isCanonicalInstant(event.carrierHandoffAt) ||
      !isCanonicalInstant(event.recordedAt) ||
      parsedHandoff.getTime() > parsedRecordedAt.getTime() ||
      !isValidFulfillmentReleaseSnapshot(consumedRelease) ||
      consumedRelease.state !== "consumed" ||
      consumedRelease.orderId !== snapshot.orderId ||
      consumedRelease.version !== snapshot.fulfillmentReleaseVersion ||
      consumedRelease.paymentEvidenceId !== snapshot.paymentEvidenceId ||
      consumedRelease.reviewRequestId !== snapshot.reviewRequestId
    ) {
      return fail("invalid_carrier_handoff");
    }
    return succeed("fulfilled", {
      carrierHandoffAt: event.carrierHandoffAt,
    });
  }

  if (
    event.type === "cancel" &&
    ["draft", "eligibility_review", "compliance_hold", "payment_failed"].includes(
      snapshot.state,
    )
  ) {
    return succeed("cancelled");
  }

  return fail();
}

export function transitionPayment(
  snapshot: PaymentSnapshot,
  event: PaymentEvent,
): Result<PaymentSnapshot, TransitionError> {
  const snapshotState =
    isRecord(snapshot) && typeof snapshot.state === "string"
      ? snapshot.state
      : "unknown";
  const eventType =
    isRecord(event) && typeof event.type === "string"
      ? event.type
      : "unknown";
  const fail = (code: TransitionError["code"]) =>
    Object.freeze({
      ok: false as const,
      error: Object.freeze({
        code,
        state: snapshotState,
        event: eventType,
      }),
    });

  if (!isValidPaymentSnapshot(snapshot)) {
    return fail("invalid_snapshot");
  }
  if (!isRecord(event) || typeof event.type !== "string") {
    return fail("invalid_transition");
  }

  if (
    (snapshot.state === "unpaid" || snapshot.state === "paid") &&
    event.type === "verified_payment"
  ) {
    if (
      event.source !== "verified_provider_event" ||
      !isNonBlankString(event.providerEvidenceId)
    ) {
      return fail("missing_payment_evidence");
    }
    if (!Number.isSafeInteger(event.amountMinor) || event.amountMinor < 0) {
      return fail("invalid_amount");
    }
    if (
      event.currency !== snapshot.currency ||
      event.amountMinor !== snapshot.orderAmountMinor
    ) {
      return fail("payment_mismatch");
    }
    if (snapshot.state === "paid") {
      return Object.freeze({ ok: true, value: snapshot });
    }
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        ...snapshot,
        state: "paid",
        paidAmountMinor: event.amountMinor,
      }),
    });
  }

  if (
    (snapshot.state === "paid" ||
      snapshot.state === "partially_refunded") &&
    event.type === "refund_requested"
  ) {
    if (!isNonBlankString(event.requestId)) {
      return fail("missing_refund_evidence");
    }
    if (!Number.isSafeInteger(event.amountMinor) || event.amountMinor <= 0) {
      return fail("invalid_amount");
    }
    if (event.currency !== snapshot.currency) {
      return fail("payment_mismatch");
    }
    const refundableAmount =
      snapshot.paidAmountMinor - snapshot.refundedAmountMinor;
    if (
      !Number.isSafeInteger(refundableAmount) ||
      event.amountMinor > refundableAmount
    ) {
      return fail("refund_exceeds_balance");
    }
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        ...snapshot,
        state: "refund_pending",
        pendingRefundAmountMinor: event.amountMinor,
      }),
    });
  }

  if (snapshot.state === "refund_pending" && event.type === "verified_refund") {
    if (
      event.source !== "verified_provider_event" ||
      !isNonBlankString(event.providerEvidenceId)
    ) {
      return fail("missing_refund_evidence");
    }
    if (
      !Number.isSafeInteger(event.cumulativeRefundedAmountMinor) ||
      event.cumulativeRefundedAmountMinor <= snapshot.refundedAmountMinor
    ) {
      return fail("invalid_amount");
    }
    if (
      event.currency !== snapshot.currency ||
      event.cumulativeRefundedAmountMinor !==
        snapshot.refundedAmountMinor + snapshot.pendingRefundAmountMinor
    ) {
      return fail("payment_mismatch");
    }
    if (event.cumulativeRefundedAmountMinor > snapshot.paidAmountMinor) {
      return fail("refund_exceeds_balance");
    }

    return Object.freeze({
      ok: true,
      value: Object.freeze({
        ...snapshot,
        state:
          event.cumulativeRefundedAmountMinor === snapshot.paidAmountMinor
            ? "refunded"
            : "partially_refunded",
        refundedAmountMinor: event.cumulativeRefundedAmountMinor,
        pendingRefundAmountMinor: 0,
      }),
    });
  }

  if (
    (snapshot.state === "paid" || snapshot.state === "partially_refunded") &&
    event.type === "dispute_recorded"
  ) {
    if (
      event.source !== "verified_provider_event" ||
      !isNonBlankString(event.providerEvidenceId)
    ) {
      return fail("missing_payment_evidence");
    }

    return Object.freeze({
      ok: true,
      value: Object.freeze({ ...snapshot, state: "disputed" }),
    });
  }

  return fail("invalid_transition");
}

export function transitionFulfillmentRelease(
  snapshot: FulfillmentReleaseSnapshot,
  event: FulfillmentReleaseEvent,
): Result<FulfillmentReleaseSnapshot, TransitionError> {
  const snapshotState =
    isRecord(snapshot) && typeof snapshot.state === "string"
      ? snapshot.state
      : "unknown";
  const eventType =
    isRecord(event) && typeof event.type === "string"
      ? event.type
      : "unknown";
  const fail = (code: TransitionError["code"]) =>
    Object.freeze({
      ok: false as const,
      error: Object.freeze({
        code,
        state: snapshotState,
        event: eventType,
      }),
    });

  if (!isValidFulfillmentReleaseSnapshot(snapshot)) {
    return fail("invalid_snapshot");
  }
  if (!isRecord(event) || typeof event.type !== "string") {
    return fail("invalid_transition");
  }

  if (
    (snapshot.state === "absent" ||
      snapshot.state === "revoked" ||
      snapshot.state === "expired") &&
    event.type === "issue"
  ) {
    if (
      !isPermittedFulfillmentDecision(event.decision) ||
      event.decision.orderId !== snapshot.orderId
    ) {
      return fail("invalid_fulfillment_decision");
    }
    if (!isNonBlankString(event.paymentEvidenceId)) {
      return fail("missing_payment_evidence");
    }
    if (event.decision.verifiedPaymentEventId !== event.paymentEvidenceId) {
      return fail("payment_mismatch");
    }
    if (
      !Number.isSafeInteger(event.version) ||
      event.version <= snapshot.lastVersion
    ) {
      return fail("invalid_release");
    }
    const now = new Date(event.now);
    const expiration = new Date(event.expiresAt);
    if (
      !isCanonicalInstant(event.now) ||
      !Number.isFinite(expiration.getTime()) ||
      expiration.toISOString() !== event.expiresAt ||
      expiration.getTime() <= now.getTime()
    ) {
      return fail("invalid_release");
    }

    return Object.freeze({
      ok: true,
      value: Object.freeze({
        orderId: snapshot.orderId,
        state: "issued",
        version: event.version,
        lastVersion: event.version,
        paymentEvidenceId: event.paymentEvidenceId,
        reviewRequestId: event.decision.reviewRequestId,
        expiresAt: event.expiresAt,
      }),
    });
  }

  if (snapshot.state === "issued" && event.type === "revoke") {
    if (!isNonBlankString(event.reasonCode)) {
      return fail("invalid_release");
    }
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        ...snapshot,
        state: "revoked",
        version: null,
        paymentEvidenceId: null,
        reviewRequestId: null,
        expiresAt: null,
      }),
    });
  }

  if (snapshot.state === "issued" && event.type === "expire") {
    const now = new Date(event.now);
    const expiration = new Date(snapshot.expiresAt ?? "");
    if (
      !Number.isFinite(now.getTime()) ||
      now.toISOString() !== event.now ||
      !Number.isFinite(expiration.getTime()) ||
      now.getTime() < expiration.getTime()
    ) {
      return fail("release_not_current");
    }
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        ...snapshot,
        state: "expired",
        version: null,
        paymentEvidenceId: null,
        reviewRequestId: null,
        expiresAt: null,
      }),
    });
  }

  if (event.type === "consume") {
    if (snapshot.state === "consumed") {
      return fail("release_already_consumed");
    }
    if (snapshot.state !== "issued") {
      return fail("release_not_current");
    }
    if (
      !isPermittedFulfillmentDecision(event.decision) ||
      event.decision.orderId !== snapshot.orderId
    ) {
      return fail("invalid_fulfillment_decision");
    }

    const now = new Date(event.now);
    const expiration = new Date(snapshot.expiresAt ?? "");
    if (
      !Number.isFinite(now.getTime()) ||
      now.toISOString() !== event.now ||
      !Number.isFinite(expiration.getTime()) ||
      now.getTime() >= expiration.getTime() ||
      snapshot.version === null ||
      snapshot.paymentEvidenceId === null
    ) {
      return fail("release_not_current");
    }
    if (event.decision.verifiedPaymentEventId !== snapshot.paymentEvidenceId) {
      return fail("payment_mismatch");
    }
    if (event.decision.reviewRequestId !== snapshot.reviewRequestId) {
      return fail("invalid_release");
    }
    return Object.freeze({
      ok: true,
      value: Object.freeze({ ...snapshot, state: "consumed" }),
    });
  }

  return fail("invalid_transition");
}
