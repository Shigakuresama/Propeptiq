import { pgEnum } from "drizzle-orm/pg-core";

export const buyerStatusEnum = pgEnum("buyer_status", [
  "active",
  "review",
  "blocked",
]);
export const researchPurposeEnum = pgEnum("research_purpose", [
  "in_vitro",
  "analytical",
  "educational",
  "other_laboratory",
]);
export const productStatusEnum = pgEnum("product_status", [
  "draft",
  "active",
  "retired",
]);
export const lotStatusEnum = pgEnum("lot_status", [
  "draft",
  "quarantined",
  "released",
  "exhausted",
  "recalled",
]);
export const destinationScopeKindEnum = pgEnum("destination_scope_kind", [
  "product",
  "policy_group",
]);
export const destinationResultEnum = pgEnum("destination_result", [
  "allowed",
  "review",
  "blocked",
]);
export const promotionKindEnum = pgEnum("promotion_kind", [
  "discount",
  "bundle",
  "subscription",
  "loyalty",
  "cross_sell",
]);
export const promotionStatusEnum = pgEnum("promotion_status", [
  "draft",
  "active",
  "retired",
]);
export const promotionTargetKindEnum = pgEnum("promotion_target_kind", [
  "product",
  "policy_group",
]);
export const orderStateEnum = pgEnum("order_state", [
  "draft",
  "eligibility_review",
  "compliance_hold",
  "ready_for_checkout",
  "checkout_pending",
  "payment_failed",
  "paid_pending_fulfillment",
  "paid_pending_settlement",
  "paid_on_hold",
  "ready_for_fulfillment",
  "fulfillment_in_progress",
  "fulfilled",
  "cancelled",
]);
export const checkoutAttemptStatusEnum = pgEnum("checkout_attempt_status", [
  "created",
  "open",
  "provider_unknown",
  "completed",
  "expired",
  "failed",
]);
export const checkoutGateResultEnum = pgEnum("checkout_gate_result", [
  "pass",
  "review",
  "blocked",
]);
export const providerEventStatusEnum = pgEnum("provider_event_status", [
  "pending",
  "processing",
  "processed",
  "failed",
  "deferred",
  "conflict",
]);
export const paymentEventTypeEnum = pgEnum("payment_event_type", [
  "payment_verified",
  "payment_failed",
  "refund_verified",
  "dispute_recorded",
  "dispute_resolved",
  "unreconciled_refund_observed",
]);
export const reservationStateEnum = pgEnum("reservation_state", [
  "active",
  "released",
  "consumed",
  "expired",
]);
export const inventoryEventTypeEnum = pgEnum("inventory_event_type", [
  "receipt",
  "reservation",
  "release",
  "consume",
  "adjustment",
]);
export const refundStatusEnum = pgEnum("refund_status", [
  "requested",
  "submitted",
  "succeeded",
  "failed",
  "cancelled",
]);
export const refundOriginEnum = pgEnum("refund_origin", [
  "staff_requested",
  "provider_observed",
]);
export const reviewOutcomeEnum = pgEnum("review_outcome", [
  "approved",
  "rejected",
]);
export const fulfillmentReleaseStateEnum = pgEnum(
  "fulfillment_release_state",
  ["issued", "revoked", "expired", "consumed"],
);
export const shipmentStateEnum = pgEnum("shipment_state", [
  "pending",
  "handed_off",
  "delivered",
  "exception",
]);
export const growthPolicyStatusEnum = pgEnum("growth_policy_status", [
  "draft",
  "active",
  "superseded",
]);
export const growthTermsProgramEnum = pgEnum("growth_terms_program", [
  "customer_rewards_referrals",
  "affiliate",
]);
export const rewardLedgerKindEnum = pgEnum("reward_ledger_kind", [
  "order_earned_pending",
  "order_earned_available",
  "referral_earned_pending",
  "referral_earned_available",
  "redemption_reserved",
  "redemption_consumed",
  "redemption_released",
  "refund_reversal",
  "chargeback_reversal",
  "admin_adjustment",
]);
export const rewardRedemptionStateEnum = pgEnum("reward_redemption_state", [
  "reserved",
  "consumed",
  "released",
]);
export const referralCodeStatusEnum = pgEnum("referral_code_status", [
  "active",
  "revoked",
]);
export const referralConversionStatusEnum = pgEnum(
  "referral_conversion_status",
  ["pending", "qualified", "reversed"],
);
export const affiliateProfileStatusEnum = pgEnum("affiliate_profile_status", [
  "pending",
  "active",
  "rejected",
  "suspended",
]);
export const affiliatePromotionMethodEnum = pgEnum(
  "affiliate_promotion_method",
  ["website", "social", "email", "other"],
);
export const affiliateCommissionStatusEnum = pgEnum(
  "affiliate_commission_status",
  ["pending", "approved", "paid", "reversed"],
);
export const affiliatePayoutStateEnum = pgEnum("affiliate_payout_state", [
  "pending",
  "paid",
  "cancelled",
]);
export const growthAttributionProgramEnum = pgEnum(
  "growth_attribution_program",
  ["customer_referral", "affiliate"],
);
