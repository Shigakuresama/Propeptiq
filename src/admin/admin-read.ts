export const ADMIN_READ_RESOURCE_REQUIREMENTS = Object.freeze({
  products: "catalog:publish",
  prices: "catalog:publish",
  "policy-groups": "catalog:publish",
  lots: "catalog:publish",
  coas: "catalog:publish",
  "analytical-claims": "catalog:publish",
  attestations: "catalog:publish",
  "destination-rules": "destination:manage",
  promotions: "promotion:manage",
  buyers: "review:decide",
  "review-requests": "review:decide",
  orders: "order:read:any",
  refunds: "refund:request",
  shipments: "fulfillment:release:consume",
  staff: "staff:manage",
  audit: "staff:manage",
  "loyalty-policies": "growth:manage",
  "referral-policies": "growth:manage",
  "affiliate-policies": "growth:manage",
  "reward-adjustments": "growth:manage",
  "referral-codes": "growth:manage",
  "shared-sets": "growth:manage",
} as const);

export type AdminReadResource = keyof typeof ADMIN_READ_RESOURCE_REQUIREMENTS;
export type AdminReadCapability =
  (typeof ADMIN_READ_RESOURCE_REQUIREMENTS)[AdminReadResource];

export const ADMIN_READ_LIMIT = 100 as const;

type Snapshot<Resource extends AdminReadResource, Item> = Readonly<{
  resource: Resource;
  limit: typeof ADMIN_READ_LIMIT;
  truncated: boolean;
  items: readonly Readonly<Item>[];
}>;

type ProductItem = {
  id: string;
  slug: string;
  name: string;
  packageForm: string;
  materialIdentity: string;
  policyGroupId: string;
  policyGroupName: string;
  status: "draft" | "active" | "retired";
  createdAt: string;
  updatedAt: string;
};

type PriceItem = {
  id: string;
  productId: string;
  productName: string;
  version: number;
  amountMinor: number;
  currency: string;
  effectiveAt: string;
  supersededAt: string | null;
  createdAt: string;
};

type PolicyGroupItem = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type LotItem = {
  id: string;
  productId: string;
  productName: string;
  supplierName: string;
  supplierLotCode: string;
  analyticalMethod: string | null;
  receivedQuantity: number;
  availableQuantity: number;
  status: "draft" | "quarantined" | "released" | "exhausted" | "recalled";
  manufacturedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CoaItem = {
  id: string;
  lotId: string;
  productId: string;
  supplierLotCode: string;
  evidenceHash: string;
  public: boolean;
  active: boolean;
  issuedAt: string | null;
  createdAt: string;
  rowVersion: string;
};

type AnalyticalClaimItem = {
  id: string;
  productId: string;
  productName: string;
  lotId: string;
  supplierLotCode: string;
  coaDocumentId: string;
  evidenceHash: string;
  text: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type AttestationItem = {
  id: string;
  version: number;
  contentHash: string;
  policyText: string;
  effectiveAt: string;
  supersededAt: string | null;
  createdAt: string;
};

type DestinationRuleItem = {
  id: string;
  scopeKind: "product" | "policy_group";
  productId: string | null;
  policyGroupId: string | null;
  targetLabel: string;
  stateCode: string;
  result: "allowed" | "review" | "blocked";
  version: number;
  active: boolean;
  effectiveAt: string;
  supersededAt: string | null;
  createdAt: string;
};

export type SafePromotionConfiguration =
  | Readonly<{ kind: "discount" }>
  | Readonly<{ kind: "bundle" | "cross_sell"; productIds: readonly string[] }>
  | Readonly<{ kind: "subscription"; interval: "month" | "year"; intervalCount: number }>
  | Readonly<{ kind: "loyalty"; pointsPerDollar: number }>
  | Readonly<{ kind: "invalid" }>;

type PromotionItem = {
  id: string;
  code: string;
  version: number;
  name: string;
  kind: "discount" | "bundle" | "subscription" | "loyalty" | "cross_sell";
  status: "draft" | "active" | "retired";
  amountMinor: number | null;
  basisPoints: number | null;
  currency: string | null;
  configuration: SafePromotionConfiguration;
  targets: readonly Readonly<{
    kind: "product" | "policy_group";
    id: string;
  }>[];
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type BuyerItem = {
  userId: string;
  status: "active" | "review" | "blocked";
  emailVerifiedAt: string | null;
  ageConfirmedAt: string | null;
  researchPurpose: "in_vitro" | "analytical" | "educational" | "other_laboratory" | null;
  organizationName: string | null;
  createdAt: string;
  updatedAt: string;
};

type ReviewRequestItem = {
  id: string;
  userId: string;
  orderId: string;
  snapshotHash: string;
  buyerStatusSnapshot: "active" | "review" | "blocked";
  attestationVersionId: string;
  attestationVersion: number;
  destinationStateCode: string;
  buyerReviewRequired: boolean;
  destinationReviewRequired: boolean;
  outcome: "approved" | "rejected" | null;
  decidedByUserId: string | null;
  decidedAt: string | null;
  coversBuyerReview: boolean | null;
  createdAt: string;
};

type OrderItem = {
  id: string;
  buyerUserId: string;
  buyerStatusSnapshot: "active" | "review" | "blocked";
  attestationAcceptanceId: string;
  attestationVersion: number;
  destinationStateCode: string;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  shippingMinor: number;
  totalMinor: number;
  state: string;
  itemCount: number;
  verifiedPaymentEventCount: number;
  paymentState: "pending_verification" | "paid" | "failed";
  refundState: "none" | "pending" | "partial" | "full" | "failed";
  holdState: "none" | "active";
  currentReleaseState: "issued" | "revoked" | "expired" | "consumed" | null;
  releaseVersion: number | null;
  shipmentState: "pending" | "handed_off" | "delivered" | "exception" | null;
  providerExecutionBoundary: "task6_managed";
  createdAt: string;
  updatedAt: string;
};

type RefundItem = {
  id: string;
  orderId: string;
  requestedByUserId: string | null;
  verifiedPaymentEventId: string;
  provider: string;
  requestedAmountMinor: number;
  confirmedAmountMinor: number | null;
  currency: string;
  status: "requested" | "submitted" | "succeeded" | "failed" | "cancelled";
  reasonRedacted: string | null;
  requestedAt: string;
  confirmedAt: string | null;
  providerRefundRecorded: boolean;
  providerExecutionBoundary: "task6_managed";
};

type ShipmentItem = {
  id: string;
  orderId: string;
  fulfillmentReleaseId: string | null;
  releaseState: "issued" | "revoked" | "expired" | "consumed" | null;
  releaseVersion: number | null;
  releaseExpiresAt: string | null;
  carrier: string;
  trackingReference: string;
  state: "pending" | "handed_off" | "delivered" | "exception";
  handedOffAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  handoffConfirmationBoundary: "task6_managed";
};

type StaffItem = {
  roleId: string;
  userId: string;
  capability: string | null;
  recognizedCapability: boolean;
  active: boolean;
  grantedByUserId: string | null;
  grantedAt: string;
  revokedByUserId: string | null;
  revokedAt: string | null;
};

type AuditItem = {
  id: string;
  actorKind: "user" | "service";
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  correlationId: string;
  occurredAt: string;
};

type GrowthPolicyLifecycleItem = {
  id: string;
  version: number;
  status: "draft" | "active" | "retired";
  effectiveAt: string;
  retiredAt: string | null;
};

type LoyaltyPolicyItem = GrowthPolicyLifecycleItem & {
  pointsPerDollar: number;
  redemptionMinorPerPoint: number;
  minimumRedemptionPoints: number;
  maximumRedemptionBasisPoints: number;
  expiresAfterDays: null;
};

type ReferralPolicyItem = GrowthPolicyLifecycleItem & {
  attributionDays: number;
  referredDiscountBasisPoints: number;
  referredDiscountCapMinor: number;
  referrerPointsPerDollar: number;
  referrerRewardCapPoints: number;
};

type AffiliatePolicyItem = GrowthPolicyLifecycleItem & {
  attributionDays: number;
  firstOrderCommissionBasisPoints: number;
  reorderCommissionBasisPoints: number;
  reorderWindowDays: number;
  approvalDelayDays: number;
  payoutThresholdMinor: number;
  currency: "USD";
};

type RewardAdjustmentItem = {
  rewardAccountId: string;
  pendingPoints: number;
  availablePoints: number;
  recentAdjustments: readonly Readonly<{
    adjustmentId: string;
    delta: number;
    occurredAt: string;
  }>[];
};

type ReferralCodeItem = {
  referralCodeId: string;
  code: string;
  status: "active" | "revoked";
  createdAt: string;
  revokedAt: string | null;
};

type SharedSetItem = {
  sharedSetId: string;
  publicCode: string;
  label: string;
  active: boolean;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  deactivatedAt: string | null;
};

export type AdminReadSnapshot =
  | Snapshot<"products", ProductItem>
  | Snapshot<"prices", PriceItem>
  | Snapshot<"policy-groups", PolicyGroupItem>
  | Snapshot<"lots", LotItem>
  | Snapshot<"coas", CoaItem>
  | Snapshot<"analytical-claims", AnalyticalClaimItem>
  | Snapshot<"attestations", AttestationItem>
  | Snapshot<"destination-rules", DestinationRuleItem>
  | Snapshot<"promotions", PromotionItem>
  | Snapshot<"buyers", BuyerItem>
  | Snapshot<"review-requests", ReviewRequestItem>
  | Snapshot<"orders", OrderItem>
  | Snapshot<"refunds", RefundItem>
  | Snapshot<"shipments", ShipmentItem>
  | Snapshot<"staff", StaffItem>
  | Snapshot<"audit", AuditItem>
  | Snapshot<"loyalty-policies", LoyaltyPolicyItem>
  | Snapshot<"referral-policies", ReferralPolicyItem>
  | Snapshot<"affiliate-policies", AffiliatePolicyItem>
  | Snapshot<"reward-adjustments", RewardAdjustmentItem>
  | Snapshot<"referral-codes", ReferralCodeItem>
  | Snapshot<"shared-sets", SharedSetItem>;

export type AdminReadSnapshotFor<Resource extends AdminReadResource> = Extract<
  AdminReadSnapshot,
  Readonly<{ resource: Resource }>
>;

export function isAdminReadResource(value: string): value is AdminReadResource {
  return Object.hasOwn(ADMIN_READ_RESOURCE_REQUIREMENTS, value);
}

export function requiredAdminReadCapability(
  resource: AdminReadResource,
): AdminReadCapability {
  return ADMIN_READ_RESOURCE_REQUIREMENTS[resource];
}
