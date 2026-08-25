import { pgEnum } from "drizzle-orm/pg-core";

export const actorStatusEnum = pgEnum("actor_status", [
  "active",
  "suspended",
  "deleted",
]);
export const organizationKindEnum = pgEnum("organization_kind", [
  "buyer",
  "internal",
]);
export const organizationStatusEnum = pgEnum("organization_status", [
  "draft",
  "active",
  "suspended",
  "closed",
]);
export const membershipStatusEnum = pgEnum("membership_status", [
  "invited",
  "active",
  "suspended",
  "revoked",
]);
export const applicationStatusEnum = pgEnum("application_status", [
  "draft",
  "submitted",
  "manual_review",
  "approved",
  "rejected",
  "suspended",
  "expired",
]);
export const attestationContextEnum = pgEnum("attestation_context", [
  "application",
  "checkout",
]);
export const decisionOutcomeEnum = pgEnum("decision_outcome", [
  "approved",
  "rejected",
  "suspended",
  "expired",
  "revoked",
]);
export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "approved",
  "rejected",
]);
export const privateObjectKindEnum = pgEnum("private_object_kind", [
  "application_evidence",
  "coa",
  "product_media",
]);
export const scanStatusEnum = pgEnum("scan_status", [
  "pending",
  "passed",
  "failed",
  "unavailable",
]);
export const categoryStatusEnum = pgEnum("category_status", [
  "draft",
  "active",
  "retired",
]);
export const productStatusEnum = pgEnum("product_status", [
  "draft",
  "active",
  "retired",
]);
export const productVersionStatusEnum = pgEnum("product_version_status", [
  "draft",
  "approved",
  "published",
  "superseded",
]);
export const lotStatusEnum = pgEnum("lot_status", [
  "draft",
  "quarantined",
  "released",
  "exhausted",
  "recalled",
]);
export const jurisdictionClassEnum = pgEnum("jurisdiction_class", [
  "state",
  "district",
  "territory",
]);
export const jurisdictionDecisionEnum = pgEnum("jurisdiction_decision", [
  "allowed",
  "manual_review",
  "blocked",
  "unknown",
]);
export const gateKeyEnum = pgEnum("gate_key", [
  "buyer_verification",
  "catalog_approval",
  "product_jurisdiction",
  "payment_provider",
  "tax",
  "shipping",
  "inventory_lot",
  "compliance_clearance",
  "launch_control",
]);
export const gateStatusEnum = pgEnum("gate_status", [
  "pass",
  "manual_review",
  "blocked",
  "unknown",
]);
export const complianceCaseStateEnum = pgEnum("compliance_case_state", [
  "open",
  "approved",
  "rejected",
  "expired",
  "closed",
]);
export const cartStatusEnum = pgEnum("cart_status", [
  "active",
  "converted",
  "abandoned",
]);
export const orderStateEnum = pgEnum("order_state", [
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
export const inventoryEventTypeEnum = pgEnum("inventory_event_type", [
  "receipt",
  "reservation",
  "release",
  "adjustment",
  "fulfillment",
]);
export const reservationStateEnum = pgEnum("reservation_state", [
  "active",
  "released",
  "consumed",
  "expired",
]);
export const checkoutAttemptStatusEnum = pgEnum("checkout_attempt_status", [
  "created",
  "open",
  "completed",
  "expired",
  "failed",
]);
export const providerEventStateEnum = pgEnum("provider_event_state", [
  "pending",
  "processing",
  "processed",
  "failed",
  "dead_letter",
]);
export const paymentEventTypeEnum = pgEnum("payment_event_type", [
  "payment_verified",
  "payment_failed",
  "refund_verified",
  "dispute_recorded",
]);
export const refundStatusEnum = pgEnum("refund_status", [
  "requested",
  "submitted",
  "succeeded",
  "failed",
  "cancelled",
]);
export const releaseEventTypeEnum = pgEnum("release_event_type", [
  "issued",
  "revoked",
  "expired",
  "consumed",
]);
export const shipmentStateEnum = pgEnum("shipment_state", [
  "pending",
  "handed_off",
  "delivered",
  "exception",
]);
export const outboxStatusEnum = pgEnum("outbox_status", [
  "pending",
  "processing",
  "sent",
  "failed",
  "dead_letter",
]);
export const launchGateStateEnum = pgEnum("launch_gate_state", [
  "closed",
  "open",
  "manual_review",
  "unknown",
]);
export const idempotencyStatusEnum = pgEnum("idempotency_status", [
  "in_progress",
  "completed",
  "failed",
]);
