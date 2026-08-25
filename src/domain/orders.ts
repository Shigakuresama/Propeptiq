import type { GateStatus } from "@/domain/eligibility";
import type { Result } from "@/domain/result";

export type OrderState =
  | "draft"
  | "eligibility_review"
  | "compliance_hold"
  | "ready_for_checkout"
  | "checkout_pending"
  | "payment_failed"
  | "paid_pending_clearance"
  | "paid_on_hold"
  | "ready_for_fulfillment"
  | "fulfillment_in_progress"
  | "fulfilled"
  | "cancelled";

export type OrderSnapshot = Readonly<{
  state: OrderState;
  paymentEvidenceId: string | null;
  clearanceEvidenceId: string | null;
  fulfillmentReleaseVersion: number | null;
  lastFulfillmentReleaseVersion: number;
  carrierHandoffAt: string | null;
}>;

export type OrderEvent =
  | Readonly<{ type: "start_eligibility" }>
  | Readonly<{ type: "place_compliance_hold" }>
  | Readonly<{ type: "resume_eligibility" }>
  | Readonly<{ type: "eligibility_passed"; decision: GateStatus }>
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
    }>
  | Readonly<{
      type: "payment_disputed";
      source: "verified_provider_event";
      providerEvidenceId: string;
    }>
  | Readonly<{
      type: "post_payment_hold";
      decision: GateStatus;
    }>
  | Readonly<{
      type: "release_for_fulfillment";
      decision: "pass";
      paymentEvidenceId: string;
      clearanceEvidenceId: string;
      fulfillmentReleaseVersion: number;
    }>
  | Readonly<{
      type: "begin_fulfillment";
      now: string;
      paymentVerified: boolean;
      eligibilityDecision: GateStatus;
      release: FulfillmentReleaseSnapshot;
    }>
  | Readonly<{
      type: "clearance_revoked";
      beforeCarrierHandoff: boolean;
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
    | "missing_clearance_evidence"
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
  state: FulfillmentReleaseState;
  version: number | null;
  lastVersion: number;
  paymentEvidenceId: string | null;
  clearanceEvidenceId: string | null;
  expiresAt: string | null;
}>;

export type FulfillmentReleaseEvent =
  | Readonly<{
      type: "issue";
      now: string;
      paymentVerified: boolean;
      eligibilityDecision: GateStatus;
      version: number;
      paymentEvidenceId: string;
      clearanceEvidenceId: string;
      expiresAt: string;
    }>
  | Readonly<{ type: "revoke"; reasonCode: string }>
  | Readonly<{ type: "expire"; now: string }>
  | Readonly<{
      type: "consume";
      now: string;
      atomicEligibilityRecheck: GateStatus;
    }>;

const orderStates = new Set<OrderState>([
  "draft",
  "eligibility_review",
  "compliance_hold",
  "ready_for_checkout",
  "checkout_pending",
  "payment_failed",
  "paid_pending_clearance",
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
  if (!isRecord(value) || !orderStates.has(value.state as OrderState)) {
    return false;
  }
  if (
    !isNonnegativeSafeInteger(value.lastFulfillmentReleaseVersion) ||
    !(
      value.paymentEvidenceId === null ||
      isNonBlankString(value.paymentEvidenceId)
    ) ||
    !(
      value.clearanceEvidenceId === null ||
      isNonBlankString(value.clearanceEvidenceId)
    ) ||
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
      value.clearanceEvidenceId === null &&
      value.fulfillmentReleaseVersion === null &&
      value.lastFulfillmentReleaseVersion === 0 &&
      value.carrierHandoffAt === null
    );
  }

  if (state === "paid_pending_clearance" || state === "paid_on_hold") {
    return (
      isNonBlankString(value.paymentEvidenceId) &&
      value.clearanceEvidenceId === null &&
      value.fulfillmentReleaseVersion === null &&
      value.carrierHandoffAt === null
    );
  }

  const releaseIsBound =
    isNonBlankString(value.paymentEvidenceId) &&
    isNonBlankString(value.clearanceEvidenceId) &&
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
    !releaseStates.has(value.state as FulfillmentReleaseState) ||
    !isNonnegativeSafeInteger(value.lastVersion) ||
    !(value.version === null || isPositiveSafeInteger(value.version)) ||
    !(
      value.paymentEvidenceId === null ||
      isNonBlankString(value.paymentEvidenceId)
    ) ||
    !(
      value.clearanceEvidenceId === null ||
      isNonBlankString(value.clearanceEvidenceId)
    ) ||
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
      isNonBlankString(value.clearanceEvidenceId) &&
      isCanonicalInstant(value.expiresAt)
    );
  }

  return (
    value.version === null &&
    value.paymentEvidenceId === null &&
    value.clearanceEvidenceId === null &&
    value.expiresAt === null &&
    (state !== "absent" || value.lastVersion === 0)
  );
}

export function transitionOrder(
  snapshot: OrderSnapshot,
  event: OrderEvent,
): Result<OrderSnapshot, TransitionError> {
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
  ): Result<OrderSnapshot, TransitionError> =>
    Object.freeze({
      ok: true,
      value: Object.freeze({ ...snapshot, ...changes, state }),
    });
  const fail = (
    code: TransitionError["code"] = "invalid_transition",
  ): Result<OrderSnapshot, TransitionError> =>
    Object.freeze({
      ok: false,
      error: Object.freeze({ code, state: snapshotState, event: eventType }),
    });

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
    event.decision === "pass"
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
    snapshot.state === "checkout_pending" &&
    event.type === "payment_verified"
  ) {
    if (
      event.source !== "verified_provider_event" ||
      !isNonBlankString(event.paymentEvidenceId)
    ) {
      return fail("missing_payment_evidence");
    }
    return succeed("paid_pending_clearance", {
      paymentEvidenceId: event.paymentEvidenceId,
    });
  }
  if (
    (snapshot.state === "paid_pending_clearance" ||
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
      clearanceEvidenceId: null,
      fulfillmentReleaseVersion: null,
    });
  }
  if (
    (snapshot.state === "paid_pending_clearance" ||
      snapshot.state === "paid_on_hold") &&
    event.type === "release_for_fulfillment"
  ) {
    if (event.decision !== "pass") {
      return fail("eligibility_not_passed");
    }
    if (
      !isNonBlankString(event.paymentEvidenceId) ||
      event.paymentEvidenceId !== snapshot.paymentEvidenceId
    ) {
      return fail("missing_payment_evidence");
    }
    if (!isNonBlankString(event.clearanceEvidenceId)) {
      return fail("missing_clearance_evidence");
    }
    if (
      !Number.isSafeInteger(event.fulfillmentReleaseVersion) ||
      event.fulfillmentReleaseVersion <= snapshot.lastFulfillmentReleaseVersion
    ) {
      return fail("invalid_release");
    }
    return succeed("ready_for_fulfillment", {
      clearanceEvidenceId: event.clearanceEvidenceId,
      fulfillmentReleaseVersion: event.fulfillmentReleaseVersion,
      lastFulfillmentReleaseVersion: event.fulfillmentReleaseVersion,
    });
  }

  if (
    snapshot.state === "paid_pending_clearance" &&
    event.type === "post_payment_hold" &&
    ["manual_review", "blocked", "unknown"].includes(event.decision)
  ) {
    return succeed("paid_on_hold", {
      clearanceEvidenceId: null,
      fulfillmentReleaseVersion: null,
    });
  }
  if (
    snapshot.state === "ready_for_fulfillment" &&
    event.type === "begin_fulfillment"
  ) {
    const fulfillmentCheck = canFulfill({
      paymentVerified: event.paymentVerified,
      eligibilityDecision: event.eligibilityDecision,
      release: event.release,
      now: event.now,
    });
    if (!fulfillmentCheck.ok) {
      return fail(fulfillmentCheck.error.code);
    }
    if (
      snapshot.fulfillmentReleaseVersion === null ||
      event.release.version !== snapshot.fulfillmentReleaseVersion ||
      event.release.paymentEvidenceId !== snapshot.paymentEvidenceId ||
      event.release.clearanceEvidenceId !== snapshot.clearanceEvidenceId
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
      consumedRelease.version !== snapshot.fulfillmentReleaseVersion ||
      consumedRelease.paymentEvidenceId !== snapshot.paymentEvidenceId ||
      consumedRelease.clearanceEvidenceId !== snapshot.clearanceEvidenceId
    ) {
      return fail("invalid_carrier_handoff");
    }
    return succeed("fulfilled", {
      carrierHandoffAt: event.carrierHandoffAt,
    });
  }

  if (
    (snapshot.state === "ready_for_fulfillment" ||
      snapshot.state === "fulfillment_in_progress") &&
    event.type === "clearance_revoked"
  ) {
    if (typeof event.beforeCarrierHandoff !== "boolean") {
      return fail("invalid_transition");
    }
    if (!event.beforeCarrierHandoff || snapshot.carrierHandoffAt !== null) {
      return fail("carrier_handoff_already_occurred");
    }
    return succeed("paid_on_hold", {
      clearanceEvidenceId: null,
      fulfillmentReleaseVersion: null,
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
    snapshot.state === "unpaid" &&
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
      event.paymentVerified !== true ||
      !isNonBlankString(event.paymentEvidenceId)
    ) {
      return fail("missing_payment_evidence");
    }
    if (
      event.eligibilityDecision !== "pass" ||
      !isNonBlankString(event.clearanceEvidenceId)
    ) {
      return fail("missing_clearance_evidence");
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
        state: "issued",
        version: event.version,
        lastVersion: event.version,
        paymentEvidenceId: event.paymentEvidenceId,
        clearanceEvidenceId: event.clearanceEvidenceId,
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
        clearanceEvidenceId: null,
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
        clearanceEvidenceId: null,
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
    if (event.atomicEligibilityRecheck !== "pass") {
      return fail("eligibility_not_passed");
    }

    const now = new Date(event.now);
    const expiration = new Date(snapshot.expiresAt ?? "");
    if (
      !Number.isFinite(now.getTime()) ||
      now.toISOString() !== event.now ||
      !Number.isFinite(expiration.getTime()) ||
      now.getTime() >= expiration.getTime() ||
      snapshot.version === null ||
      snapshot.paymentEvidenceId === null ||
      snapshot.clearanceEvidenceId === null
    ) {
      return fail("release_not_current");
    }
    return Object.freeze({
      ok: true,
      value: Object.freeze({ ...snapshot, state: "consumed" }),
    });
  }

  return fail("invalid_transition");
}

export type FulfillmentCheckInput = Readonly<{
  paymentVerified: boolean;
  eligibilityDecision: GateStatus;
  release: FulfillmentReleaseSnapshot;
  now: string;
}>;

export function canFulfill(
  input: FulfillmentCheckInput,
): Result<true, TransitionError> {
  const release = isRecord(input) ? input.release : null;
  const releaseState =
    isRecord(release) && typeof release.state === "string"
      ? release.state
      : "unknown";
  const fail = (code: TransitionError["code"]): Result<true, TransitionError> =>
    Object.freeze({
      ok: false,
      error: Object.freeze({
        code,
        state: releaseState,
        event: "fulfill",
      }),
    });

  if (!isRecord(input) || !isValidFulfillmentReleaseSnapshot(release)) {
    return fail("invalid_snapshot");
  }
  if (input.release.state !== "issued") {
    return fail("release_not_current");
  }

  if (
    input.paymentVerified !== true ||
    !isNonBlankString(input.release.paymentEvidenceId)
  ) {
    return fail("missing_payment_evidence");
  }
  if (
    input.eligibilityDecision !== "pass" ||
    !isNonBlankString(input.release.clearanceEvidenceId)
  ) {
    return fail("eligibility_not_passed");
  }

  const now = new Date(input.now);
  const expiration = new Date(input.release.expiresAt ?? "");
  if (
    input.release.version === null ||
    !Number.isFinite(now.getTime()) ||
    now.toISOString() !== input.now ||
    !Number.isFinite(expiration.getTime()) ||
    now.getTime() >= expiration.getTime()
  ) {
    return fail("release_not_current");
  }

  return Object.freeze({ ok: true, value: true });
}
