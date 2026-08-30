import "server-only";

import { createHash } from "node:crypto";

import type { AdminReadResource, AdminReadSnapshotFor } from "@/admin/admin-read";
import type { AdminAuditEvent, GrowthPolicyKind } from "@/admin/admin-service";
import type { LocalGrowthDriverV1, LocalGrowthInspectionV1 } from "@/auth/local-driver-types";
import type { AffiliateApplicationAdminRepository } from "@/admin/affiliate-application-admin-service";
import type { AffiliatePayoutAdminRepository } from "@/admin/affiliate-payout-admin-service";
import { AffiliateAdminError, AffiliatePayoutError } from "@/growth/affiliate-service";
import type { AffiliateApplicationInput, AffiliateApplicationResult } from "@/growth/affiliate-service";
import type { CurrentGrowthTerms, GrowthTermsProgram } from "@/growth/policies";
import type { PublicGrowthProjection } from "@/growth/public-growth-server";
import type { OwnerGrowthSnapshot, RewardLedgerReadItem } from "@/growth/read-model";
import type { CustomerReferralEnrollmentInput, CustomerReferralEnrollmentResult } from "@/growth/referral-service";
import type { RewardsCheckoutAtomicPort } from "@/growth/rewards-service";

const LOCAL_GROWTH_EXPERIENCE_SENTINEL =
  "LOCAL_GROWTH_EXPERIENCE_TEST_ONLY_PROPEPTIQ_7A91D2";
const FIXED_NOW = "2026-08-27T12:00:00.000Z";
const GROWTH_OWNER_ID = "50000000-0000-4000-8000-000000000007";
const GROWTH_BUYER_ID = "50000000-0000-4000-8000-000000000008";
const BLOCKED_BUYER_ID = "50000000-0000-4000-8000-000000000002";
const LOYALTY_POLICY_ID = "6c000000-0000-4000-8000-000000000001";
const REFERRAL_POLICY_ID = "6c000000-0000-4000-8000-000000000002";
const AFFILIATE_POLICY_ID = "6c000000-0000-4000-8000-000000000003";
const REWARDS_TERMS_ID = "6c000000-0000-4000-8000-000000000004";
const PARTNER_TERMS_ID = "6c000000-0000-4000-8000-000000000005";
const REWARD_ACCOUNT_ID = "6c000000-0000-4000-8000-000000000006";
const REWARDS_ACCEPTANCE_ID = "6c000000-0000-4000-8000-000000000007";
const SEEDED_AFFILIATE_PROFILE_ID = "6c000000-0000-4000-8000-000000000008";
const SEEDED_AFFILIATE_CODE = "aff_LocalRuntimePartner01";
const SEEDED_REFERRAL_CODE = "ref_LocalRuntimeReferrer01";
const SHARED_SET_ID = "6c000000-0000-4000-8000-000000000009";
const SHARED_SET_CODE = "set_LocalRuntimeResearch01";
const COMMISSION_ID = "6c000000-0000-4000-8000-000000000010";

const rewardsTermsText = "Synthetic local rewards and referral terms for deterministic browser verification only.";
const partnerTermsText = "Synthetic local partner terms for deterministic browser verification only.";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

const rewardsTerms: CurrentGrowthTerms = Object.freeze({
  id: REWARDS_TERMS_ID,
  program: "customer_rewards_referrals",
  version: 1,
  contentHash: digest(rewardsTermsText),
  termsText: rewardsTermsText,
  effectiveAt: FIXED_NOW,
  supersededAt: null,
});
const partnerTerms: CurrentGrowthTerms = Object.freeze({
  id: PARTNER_TERMS_ID,
  program: "affiliate",
  version: 1,
  contentHash: digest(partnerTermsText),
  termsText: partnerTermsText,
  effectiveAt: FIXED_NOW,
  supersededAt: null,
});

type PolicyRecord = {
  id: string;
  version: number;
  status: "draft" | "active" | "retired";
  effectiveAt: string;
  supersededAt: string | null;
  values: Record<string, number | string | null>;
};

type AffiliateProfile = {
  id: string;
  userId: string;
  publicCode: string;
  status: "pending" | "active" | "rejected" | "suspended";
  version: number;
  publicChannel: string;
  promotionMethod: "website" | "social" | "email" | "other";
  createdAt: string;
  updatedAt: string;
};

type LocalGrowthState = {
  revision: number;
  scenario: "active" | "inactive";
  rateCounts: Map<string, number>;
  rewardBalances: Map<string, number>;
  rewardReservations: Map<string, { buyerUserId: string; points: number }>;
  rewardLedger: Map<string, RewardLedgerReadItem[]>;
  referralCodes: Map<string, { id: string; code: string; status: "active" | "revoked"; createdAt: string; revokedAt: string | null }>;
  affiliateProfiles: Map<string, AffiliateProfile>;
  policies: Record<GrowthPolicyKind, PolicyRecord[]>;
  sharedSetActive: boolean;
  sharedSetUpdatedAt: string;
  payouts: Array<{
    id: string;
    affiliateProfileId: string;
    amountMinor: number;
    state: "pending" | "paid";
    version: number;
    commissionIds: string[];
    providerName: string | null;
    externalReference: string | null;
    paidAt: string | null;
    createdAt: string;
    idempotencyKey: string;
  }>;
};

function policyRecords(): LocalGrowthState["policies"] {
  return {
    loyalty: [{ id: LOYALTY_POLICY_ID, version: 1, status: "active", effectiveAt: FIXED_NOW, supersededAt: null, values: {
      pointsPerDollar: 2, redemptionMinorPerPoint: 1, minimumRedemptionPoints: 500,
      maximumRedemptionBasisPoints: 2500, expiresAfterDays: null,
    } }],
    referral: [{ id: REFERRAL_POLICY_ID, version: 1, status: "active", effectiveAt: FIXED_NOW, supersededAt: null, values: {
      attributionDays: 30, referredDiscountBasisPoints: 1000, referredDiscountCapMinor: 2500,
      referrerPointsPerDollar: 5, referrerRewardCapPoints: 2500,
    } }],
    affiliate: [{ id: AFFILIATE_POLICY_ID, version: 1, status: "active", effectiveAt: FIXED_NOW, supersededAt: null, values: {
      attributionDays: 30, firstOrderCommissionBasisPoints: 1000, reorderCommissionBasisPoints: 500,
      reorderWindowDays: 180, approvalDelayDays: 30, payoutThresholdMinor: 5000, currency: "USD",
    } }],
  };
}

function initialState(): LocalGrowthState {
  const seededCredit: RewardLedgerReadItem = Object.freeze({
    occurredAt: FIXED_NOW,
    kind: "admin_adjustment",
    reference: "ref:synthetic0",
    pendingPointsDelta: 0,
    availablePointsDelta: 2600,
    pendingPointsBalanceAfter: 0,
    availablePointsBalanceAfter: 2600,
  });
  const seededReversal: RewardLedgerReadItem = Object.freeze({
    occurredAt: "2026-08-27T12:05:00.000Z",
    kind: "refund_reversal",
    reference: "ref:synthetic-reversal",
    pendingPointsDelta: 0,
    availablePointsDelta: -100,
    pendingPointsBalanceAfter: 0,
    availablePointsBalanceAfter: 2500,
  });
  return {
    revision: 0,
    scenario: "active",
    rateCounts: new Map(),
    rewardBalances: new Map([[GROWTH_OWNER_ID, 2500], [GROWTH_BUYER_ID, 900], [BLOCKED_BUYER_ID, 700]]),
    rewardReservations: new Map(),
    rewardLedger: new Map([[GROWTH_OWNER_ID, [seededCredit, seededReversal]]]),
    referralCodes: new Map([[GROWTH_BUYER_ID, {
      id: "6c000000-0000-4000-8000-000000000011",
      code: SEEDED_REFERRAL_CODE,
      status: "active",
      createdAt: FIXED_NOW,
      revokedAt: null,
    }]]),
    affiliateProfiles: new Map([[GROWTH_BUYER_ID, {
      id: SEEDED_AFFILIATE_PROFILE_ID,
      userId: GROWTH_BUYER_ID,
      publicCode: SEEDED_AFFILIATE_CODE,
      status: "pending",
      version: 1,
      publicChannel: "@synthetic-laboratory-records",
      promotionMethod: "social",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    }]]),
    policies: policyRecords(),
    sharedSetActive: true,
    sharedSetUpdatedAt: FIXED_NOW,
    payouts: [],
  };
}

function projection(state: LocalGrowthState): PublicGrowthProjection {
  const active = (kind: GrowthPolicyKind) => state.policies[kind].find((item) => item.status === "active")!;
  const loyalty = active("loyalty");
  const referral = active("referral");
  const affiliate = active("affiliate");
  return Object.freeze({
    loyalty: Object.freeze({ id: loyalty.id, version: loyalty.version, status: "active", ...loyalty.values, effectiveAt: loyalty.effectiveAt, supersededAt: null }) as PublicGrowthProjection["loyalty"],
    referral: Object.freeze({ id: referral.id, version: referral.version, status: "active", ...referral.values, effectiveAt: referral.effectiveAt, supersededAt: null }) as PublicGrowthProjection["referral"],
    affiliate: Object.freeze({ id: affiliate.id, version: affiliate.version, status: "active", ...affiliate.values, effectiveAt: affiliate.effectiveAt, supersededAt: null }) as PublicGrowthProjection["affiliate"],
    terms: Object.freeze({ rewards: rewardsTerms, partner: partnerTerms }),
  });
}

function inspection(state: LocalGrowthState): LocalGrowthInspectionV1 {
  return Object.freeze({
    schemaVersion: 1,
    revision: state.revision,
    scenario: state.scenario,
    rewardReservationCount: state.rewardReservations.size,
    rewardLedgerCount: [...state.rewardLedger.values()].reduce((sum, items) => sum + items.length, 0),
    referralCodeCount: state.referralCodes.size,
    affiliateProfileCount: state.affiliateProfiles.size,
    payoutCount: state.payouts.length,
  });
}

function emptyPage<Item>(items: readonly Item[]) {
  return Object.freeze({ items: Object.freeze([...items]), totalCount: items.length, page: Object.freeze({ limit: 25, offset: 0, hasMore: false }) });
}

function ownerSnapshot(state: LocalGrowthState, ownerUserId: string): OwnerGrowthSnapshot {
  const balance = state.rewardBalances.get(ownerUserId);
  const referral = state.referralCodes.get(ownerUserId) ?? null;
  const affiliate = state.affiliateProfiles.get(ownerUserId) ?? null;
  const ledger = state.rewardLedger.get(ownerUserId) ?? [];
  const ownsSet = ownerUserId === GROWTH_OWNER_ID;
  return Object.freeze({
    rewards: balance === undefined ? null : Object.freeze({
      pendingPoints: 0,
      availablePoints: balance,
      usdEquivalentMinor: balance,
      minimumRedemptionProgress: Object.freeze({ currentPoints: Math.min(balance, 500), requiredPoints: 500 }),
      ledger: emptyPage(ledger),
    }),
    referrals: Object.freeze({
      code: referral?.code ?? null,
      status: referral?.status ?? null,
      counts: Object.freeze({ attributed: 0, pending: 0, qualified: 0, reversed: 0 }),
      rewardPointsTotal: 0,
      conversions: emptyPage([]),
    }),
    sharedSets: emptyPage(ownsSet ? [{ code: SHARED_SET_CODE, label: "Synthetic analytical reference set", active: state.sharedSetActive, itemCount: 3, updatedAt: state.sharedSetUpdatedAt }] : []),
    affiliate: affiliate === null ? null : Object.freeze({
      publicCode: affiliate.publicCode,
      status: affiliate.status,
      publicChannel: affiliate.publicChannel,
      promotionMethod: affiliate.promotionMethod,
      attributedCount: 0,
      commissionTotalsMinor: Object.freeze({ pending: 0, approved: affiliate.status === "active" ? 6000 : 0, paid: state.payouts.some((payout) => payout.state === "paid" && payout.affiliateProfileId === affiliate.id) ? 6000 : 0, reversed: 0 }),
      payoutTotalsMinor: Object.freeze({ pending: state.payouts.filter((payout) => payout.state === "pending" && payout.affiliateProfileId === affiliate.id).reduce((sum, payout) => sum + payout.amountMinor, 0), paid: state.payouts.filter((payout) => payout.state === "paid" && payout.affiliateProfileId === affiliate.id).reduce((sum, payout) => sum + payout.amountMinor, 0) }),
    }),
  });
}

function policySnapshot<Resource extends "loyalty-policies" | "referral-policies" | "affiliate-policies">(
  state: LocalGrowthState,
  resource: Resource,
): AdminReadSnapshotFor<Resource> {
  const kind = resource.replace("-policies", "") as GrowthPolicyKind;
  return {
    resource,
    limit: 100,
    truncated: false,
    items: state.policies[kind].map((item) => ({
      id: item.id,
      version: item.version,
      status: item.status,
      effectiveAt: item.effectiveAt,
      retiredAt: item.supersededAt,
      ...item.values,
    })),
  } as AdminReadSnapshotFor<Resource>;
}

export function createLocalGrowthDriverV1(dependencies: Readonly<{
  appendAudit: (event: AdminAuditEvent) => void;
}>): LocalGrowthDriverV1 {
  const stateKey = Symbol.for("propeptiq.local-growth-driver-state.v1");
  const host = process as NodeJS.Process & { [key: symbol]: LocalGrowthState | undefined };
  const state = host[stateKey] ?? initialState();
  host[stateKey] = state;
  const bump = () => { state.revision += 1; };
  const activeProjection = () => projection(state);

  const rateLimitStore = Object.freeze({
    async increment(window: { scopeHash: string; windowStart: Date }) {
      const key = `${window.scopeHash}:${window.windowStart.toISOString()}`;
      const count = (state.rateCounts.get(key) ?? 0) + 1;
      state.rateCounts.set(key, count);
      return count;
    },
  });

  const rewardsAtomicPort: RewardsCheckoutAtomicPort = Object.freeze({
    async loadCheckoutRewards({ buyerUserId }) {
      const availablePoints = state.rewardBalances.get(buyerUserId);
      if (state.scenario !== "active" || availablePoints === undefined) {
        return Object.freeze({ status: "unavailable", reason: "acceptance_unavailable" });
      }
      return Object.freeze({
        status: "available",
        rewardAccountId: REWARD_ACCOUNT_ID,
        availablePoints,
        loyaltyPolicy: activeProjection().loyalty!,
        terms: Object.freeze({ id: rewardsTerms.id, version: rewardsTerms.version, contentHash: rewardsTerms.contentHash }),
        acceptance: Object.freeze({ id: REWARDS_ACCEPTANCE_ID, termsVersionId: rewardsTerms.id, contentHash: rewardsTerms.contentHash }),
      });
    },
    async reserveCheckoutRewards(input) {
      const key = `${input.buyerUserId}:${input.idempotencyKey}`;
      const existing = state.rewardReservations.get(key);
      if (existing) {
        return existing.points === input.redemptionPoints
          ? Object.freeze({ status: "idempotent" })
          : Object.freeze({ status: "conflict" });
      }
      const balance = state.rewardBalances.get(input.buyerUserId);
      if (balance === undefined || balance < input.redemptionPoints) {
        return Object.freeze({ status: "unavailable", reason: "insufficient_balance" });
      }
      state.rewardBalances.set(input.buyerUserId, balance - input.redemptionPoints);
      state.rewardReservations.set(key, { buyerUserId: input.buyerUserId, points: input.redemptionPoints });
      const ledger = state.rewardLedger.get(input.buyerUserId) ?? [];
      ledger.push(Object.freeze({
        occurredAt: input.reservedAt.toISOString(),
        kind: "redemption_reserved",
        reference: `ref:${digest(input.checkoutAttemptId).slice(0, 10)}`,
        pendingPointsDelta: 0,
        availablePointsDelta: -input.redemptionPoints,
        pendingPointsBalanceAfter: 0,
        availablePointsBalanceAfter: balance - input.redemptionPoints,
      }));
      state.rewardLedger.set(input.buyerUserId, ledger);
      bump();
      return Object.freeze({ status: "reserved" });
    },
  });

  const adminTransactionMethods: LocalGrowthDriverV1["adminTransactionMethods"] = {
    async createGrowthPolicyDraft(input) {
      const records = state.policies[input.kind];
      const version = Math.max(0, ...records.map((item) => item.version)) + 1;
      records.push({ id: input.id, version, status: "draft", effectiveAt: input.effectiveAt.toISOString(), supersededAt: null, values: { ...input.values } });
      bump();
      return Object.freeze({ id: input.id, kind: input.kind, version, status: "draft" });
    },
    async activateGrowthPolicy(input) {
      const records = state.policies[input.kind];
      const draft = records.find((item) => item.id === input.id && item.status === "draft");
      if (!draft || draft.version !== input.expectedVersion) throw new Error("Growth policy version_conflict");
      for (const record of records) {
        if (record.status === "active") {
          record.status = "retired";
          record.supersededAt = input.now.toISOString();
        }
      }
      draft.status = "active";
      bump();
      return Object.freeze({ id: draft.id, kind: input.kind, version: draft.version, status: "active" });
    },
    async adjustRewardBalance(input) {
      const owner = [...state.rewardBalances.keys()].find(() => input.rewardAccountId === REWARD_ACCOUNT_ID);
      if (!owner) throw new Error("Reward account unavailable");
      const ledger = state.rewardLedger.get(owner) ?? [];
      const reference = `ref:${digest(input.idempotencyKey).slice(0, 10)}`;
      const prior = ledger.find((item) => item.reference === reference);
      if (prior) {
        if (prior.availablePointsDelta !== input.delta) {
          throw new Error("Reward adjustment idempotency conflict");
        }
        return Object.freeze({ status: "idempotent", entryId: input.entryId, rewardAccountId: input.rewardAccountId, delta: input.delta, availablePointsBalanceAfter: prior.availablePointsBalanceAfter, reason: input.reason });
      }
      const balance = state.rewardBalances.get(owner)! + input.delta;
      if (balance < 0) throw new Error("Reward balance cannot be negative");
      state.rewardBalances.set(owner, balance);
      ledger.push(Object.freeze({ occurredAt: input.occurredAt.toISOString(), kind: "admin_adjustment", reference, pendingPointsDelta: 0, availablePointsDelta: input.delta, pendingPointsBalanceAfter: 0, availablePointsBalanceAfter: balance }));
      state.rewardLedger.set(owner, ledger);
      bump();
      return Object.freeze({ status: "applied", entryId: input.entryId, rewardAccountId: input.rewardAccountId, delta: input.delta, availablePointsBalanceAfter: balance, reason: input.reason });
    },
    async revokeReferralCode(input) {
      const entry = [...state.referralCodes.entries()].find(([, value]) => value.id === input.referralCodeId);
      if (!entry || entry[1].createdAt !== input.expectedCreatedAt.toISOString()) throw new Error("Referral code version_conflict");
      if (entry[1].status === "revoked") return Object.freeze({ status: "idempotent", referralCodeId: entry[1].id, createdAt: entry[1].createdAt, revokedAt: entry[1].revokedAt! });
      entry[1].status = "revoked";
      entry[1].revokedAt = input.revokedAt.toISOString();
      bump();
      return Object.freeze({ status: "applied", referralCodeId: entry[1].id, createdAt: entry[1].createdAt, revokedAt: entry[1].revokedAt });
    },
    async deactivateSharedSet(input) {
      if (input.sharedSetId !== SHARED_SET_ID || input.expectedUpdatedAt.toISOString() !== state.sharedSetUpdatedAt) throw new Error("Shared set version_conflict");
      if (!state.sharedSetActive) return Object.freeze({ status: "idempotent", sharedSetId: SHARED_SET_ID, active: false, updatedAt: state.sharedSetUpdatedAt, deactivatedAt: state.sharedSetUpdatedAt });
      state.sharedSetActive = false;
      state.sharedSetUpdatedAt = input.deactivatedAt.toISOString();
      bump();
      return Object.freeze({ status: "applied", sharedSetId: SHARED_SET_ID, active: false, updatedAt: state.sharedSetUpdatedAt, deactivatedAt: state.sharedSetUpdatedAt });
    },
  };

  const affiliateApplicationAdminRepository: AffiliateApplicationAdminRepository = Object.freeze({
    rateLimitStore,
    async mutateInTransaction(input) {
      const profile = [...state.affiliateProfiles.values()].find((item) => item.id === input.profileId);
      if (!profile) throw new AffiliateAdminError("invalid_input");
      if (profile.version !== input.expectedVersion) throw new AffiliateAdminError("version_conflict");
      const permitted = (profile.status === "pending" && (input.targetStatus === "active" || input.targetStatus === "rejected")) || (profile.status === "active" && input.targetStatus === "suspended");
      if (!permitted) throw new AffiliateAdminError("invalid_transition");
      profile.status = input.targetStatus;
      profile.version += 1;
      profile.updatedAt = input.mutatedAt.toISOString();
      dependencies.appendAudit({ actorUserId: input.actorUserId, action: `growth.affiliate.${input.targetStatus}`, resourceType: "affiliate_profile", resourceId: profile.id, correlationId: input.correlationId, metadata: Object.freeze({ status: input.targetStatus, version: profile.version }) });
      bump();
      return Object.freeze({ profile: Object.freeze({ id: profile.id, status: profile.status, version: profile.version, updatedAt: profile.updatedAt }) });
    },
  });

  const affiliatePayoutAdminRepository: AffiliatePayoutAdminRepository = Object.freeze({
    rateLimitStore,
    async createInTransaction(input) {
      const profile = [...state.affiliateProfiles.values()].find((item) => item.id === input.profileId);
      if (!profile || profile.status !== "active") throw new AffiliatePayoutError("profile_ineligible");
      const existing = state.payouts.find((item) => item.idempotencyKey === input.idempotencyKey);
      if (existing) return Object.freeze({ status: "idempotent", payout: Object.freeze({ ...existing, affiliatePolicyId: AFFILIATE_POLICY_ID, affiliatePolicyVersion: 1, currency: "USD" as const }) });
      if (state.payouts.some((item) => item.commissionIds.includes(COMMISSION_ID))) throw new AffiliatePayoutError("threshold_not_met");
      const payout = { id: input.payoutId, affiliateProfileId: profile.id, amountMinor: 6000, state: "pending" as const, version: 1, commissionIds: [COMMISSION_ID], providerName: null, externalReference: null, paidAt: null, createdAt: input.createdAt.toISOString(), idempotencyKey: input.idempotencyKey };
      state.payouts.push(payout);
      dependencies.appendAudit({ actorUserId: input.actorUserId, action: "growth.affiliate_payout.created", resourceType: "affiliate_payout", resourceId: payout.id, correlationId: input.correlationId, metadata: Object.freeze({ amountMinor: payout.amountMinor, currency: "USD", commissionCount: 1 }) });
      bump();
      return Object.freeze({ status: "applied", payout: Object.freeze({ ...payout, affiliatePolicyId: AFFILIATE_POLICY_ID, affiliatePolicyVersion: 1, currency: "USD" as const }) });
    },
    async markPaidInTransaction(input) {
      const payout = state.payouts.find((item) => item.id === input.payoutId);
      if (!payout) throw new AffiliatePayoutError("invalid_input");
      if (payout.version !== input.expectedVersion) throw new AffiliatePayoutError("version_conflict");
      if (payout.state === "paid") return Object.freeze({ status: "idempotent", payout: Object.freeze({ ...payout, affiliatePolicyId: AFFILIATE_POLICY_ID, affiliatePolicyVersion: 1, currency: "USD" as const }) });
      payout.state = "paid";
      payout.version += 1;
      payout.providerName = input.providerName;
      payout.externalReference = input.externalReference;
      payout.paidAt = input.paidAt.toISOString();
      dependencies.appendAudit({ actorUserId: input.actorUserId, action: "growth.affiliate_payout.paid", resourceType: "affiliate_payout", resourceId: payout.id, correlationId: input.correlationId, metadata: Object.freeze({ state: "paid", externalEvidenceRecorded: true }) });
      bump();
      return Object.freeze({ status: "applied", payout: Object.freeze({ ...payout, affiliatePolicyId: AFFILIATE_POLICY_ID, affiliatePolicyVersion: 1, currency: "USD" as const }) });
    },
  });

  function readAdminSnapshot<Resource extends AdminReadResource>(resource: Resource): AdminReadSnapshotFor<Resource> | null {
    const base = { limit: 100 as const, truncated: false };
    if (resource === "loyalty-policies" || resource === "referral-policies" || resource === "affiliate-policies") return policySnapshot(state, resource) as AdminReadSnapshotFor<Resource>;
    if (resource === "reward-adjustments") return { ...base, resource, items: [{ rewardAccountId: REWARD_ACCOUNT_ID, pendingPoints: 0, availablePoints: state.rewardBalances.get(GROWTH_OWNER_ID) ?? 0, recentAdjustments: (state.rewardLedger.get(GROWTH_OWNER_ID) ?? []).filter((item) => item.kind === "admin_adjustment").map((item, index) => ({ adjustmentId: `local-adjustment-${index + 1}`, delta: item.availablePointsDelta, occurredAt: item.occurredAt })) }] } as unknown as AdminReadSnapshotFor<Resource>;
    if (resource === "referral-codes") return { ...base, resource, items: [...state.referralCodes.values()].map((item) => ({ referralCodeId: item.id, code: item.code, status: item.status, createdAt: item.createdAt, revokedAt: item.revokedAt })) } as unknown as AdminReadSnapshotFor<Resource>;
    if (resource === "referral-conversions") return { ...base, resource, items: [] } as unknown as AdminReadSnapshotFor<Resource>;
    if (resource === "shared-sets") return { ...base, resource, items: [{ sharedSetId: SHARED_SET_ID, publicCode: SHARED_SET_CODE, label: "Synthetic analytical reference set", active: state.sharedSetActive, itemCount: 3, createdAt: FIXED_NOW, updatedAt: state.sharedSetUpdatedAt, deactivatedAt: state.sharedSetActive ? null : state.sharedSetUpdatedAt }] } as unknown as AdminReadSnapshotFor<Resource>;
    if (resource === "affiliate-applications") return { ...base, resource, items: [...state.affiliateProfiles.values()].map((profile) => ({ affiliateProfileId: profile.id, publicCode: profile.publicCode, status: profile.status, version: profile.version, publicChannel: profile.publicChannel, promotionMethod: profile.promotionMethod, createdAt: profile.createdAt, updatedAt: profile.updatedAt })) } as unknown as AdminReadSnapshotFor<Resource>;
    if (resource === "commissions") return { ...base, resource, items: [{ commissionId: COMMISSION_ID, affiliateProfileId: SEEDED_AFFILIATE_PROFILE_ID, affiliatePolicyVersion: 1, grossCommissionMinor: 6000, reversedCommissionMinor: 0, netCommissionMinor: 6000, status: state.payouts.length > 0 ? "paid" : "approved", approvalEligibleAt: FIXED_NOW, payoutId: state.payouts[0]?.id ?? null, createdAt: FIXED_NOW, updatedAt: FIXED_NOW }] } as unknown as AdminReadSnapshotFor<Resource>;
    if (resource === "payouts") return { ...base, resource, items: state.payouts.map((payout) => ({ payoutId: payout.id, affiliateProfileId: payout.affiliateProfileId, affiliatePolicyVersion: 1, amountMinor: payout.amountMinor, currency: "USD", state: payout.state, version: payout.version, commissionCount: payout.commissionIds.length, externalEvidenceRecorded: payout.externalReference !== null, createdAt: payout.createdAt, paidAt: payout.paidAt })) } as unknown as AdminReadSnapshotFor<Resource>;
    return null;
  }

  return Object.freeze({
    publicProjection() {
      return state.scenario === "inactive"
        ? Object.freeze({ status: "inactive" as const, syntheticLocal: true as const })
        : Object.freeze({ status: "active" as const, projection: activeProjection(), syntheticLocal: true as const });
    },
    ownerSnapshot: (ownerUserId) => ownerSnapshot(state, ownerUserId),
    currentTerms(program: GrowthTermsProgram) { return program === "affiliate" ? partnerTerms : rewardsTerms; },
    rewardsAtomicPort,
    rateLimitStore,
    async enrollCustomerReferral(input: CustomerReferralEnrollmentInput): Promise<CustomerReferralEnrollmentResult> {
      const existing = state.referralCodes.get(input.buyerUserId);
      if (existing) return Object.freeze({ status: "idempotent", code: existing.code, createdAt: existing.createdAt });
      const code = `ref_LocalOwner${digest(input.buyerUserId).slice(0, 16)}`;
      state.referralCodes.set(input.buyerUserId, { id: "6c000000-0000-4000-8000-000000000012", code, status: "active", createdAt: FIXED_NOW, revokedAt: null });
      bump();
      return Object.freeze({ status: "enrolled", code, createdAt: FIXED_NOW });
    },
    async applyForAffiliate(input: AffiliateApplicationInput): Promise<AffiliateApplicationResult> {
      const existing = state.affiliateProfiles.get(input.buyerUserId);
      if (existing) return Object.freeze({ status: "idempotent", application: Object.freeze({ publicCode: existing.publicCode, status: existing.status, version: existing.version, publicChannel: existing.publicChannel, promotionMethod: existing.promotionMethod, createdAt: existing.createdAt }) });
      const profile: AffiliateProfile = { id: "6c000000-0000-4000-8000-000000000013", userId: input.buyerUserId, publicCode: `aff_LocalOwner${digest(input.buyerUserId).slice(0, 16)}`, status: "pending", version: 1, publicChannel: input.publicChannel, promotionMethod: input.promotionMethod, createdAt: FIXED_NOW, updatedAt: FIXED_NOW };
      state.affiliateProfiles.set(input.buyerUserId, profile);
      bump();
      return Object.freeze({ status: "submitted", application: Object.freeze({ publicCode: profile.publicCode, status: profile.status, version: profile.version, publicChannel: profile.publicChannel, promotionMethod: profile.promotionMethod, createdAt: profile.createdAt }) });
    },
    async referralLandingLookup({ code, now }) {
      return state.scenario === "active" && code === SEEDED_REFERRAL_CODE && Number.isFinite(now.getTime())
        ? Object.freeze({ program: "customer_referral", code, attributionDays: 30 })
        : null;
    },
    async affiliateLandingLookup({ code, now }) {
      const profile = [...state.affiliateProfiles.values()].find((item) => item.publicCode === code);
      return state.scenario === "active" && profile?.status === "active" && Number.isFinite(now.getTime())
        ? Object.freeze({ program: "affiliate", code, attributionDays: 30 })
        : null;
    },
    resolvePublicSharedSet(code) {
      if (state.scenario !== "active" || !state.sharedSetActive || code !== SHARED_SET_CODE) return Object.freeze({ status: "unavailable" });
      return Object.freeze({ status: "available", syntheticLocal: true, set: Object.freeze({ code: SHARED_SET_CODE, label: "Synthetic analytical reference set", items: Object.freeze([
        Object.freeze({ productId: "61000000-0000-4000-8000-000000000001", quantity: 2, slug: "synthetic-reference-alpha", name: "Synthetic Reference Alpha — Demo Only", packageForm: "10 mg · sealed research vial" }),
        Object.freeze({ productId: "61000000-0000-4000-8000-000000000002", quantity: 1, slug: "synthetic-reference-beta", name: "Synthetic Reference Beta — Demo Only", packageForm: "5 mg · sealed research vial" }),
      ]), omittedItemCount: 1, omissionNotice: "One saved product is no longer available in the current public catalog and was omitted." }) });
    },
    ownerSharedSetWorkspace(ownerUserId) {
      if (ownerUserId !== GROWTH_OWNER_ID) return Object.freeze({ status: "unavailable" });
      return Object.freeze({ status: "available", syntheticLocal: true, products: Object.freeze([
        Object.freeze({ id: "61000000-0000-4000-8000-000000000001", name: "Synthetic Reference Alpha — Demo Only", packageForm: "10 mg · sealed research vial" }),
        Object.freeze({ id: "61000000-0000-4000-8000-000000000002", name: "Synthetic Reference Beta — Demo Only", packageForm: "5 mg · sealed research vial" }),
      ]), sets: Object.freeze([{ code: SHARED_SET_CODE, label: "Synthetic analytical reference set", active: state.sharedSetActive, itemCount: 3, updatedAt: state.sharedSetUpdatedAt, items: Object.freeze([
        Object.freeze({ productId: "61000000-0000-4000-8000-000000000001", quantity: 2 }),
        Object.freeze({ productId: "61000000-0000-4000-8000-000000000002", quantity: 1 }),
      ]) }]) });
    },
    readAdminSnapshot,
    adminTransactionMethods,
    affiliateApplicationAdminRepository,
    affiliatePayoutAdminRepository,
    reset(scenario = "active") {
      const fresh = initialState();
      fresh.scenario = scenario;
      Object.assign(state, fresh);
      host[stateKey] = state;
      return inspection(state);
    },
    inspect: () => inspection(state),
    captureState: () => structuredClone(state),
    restoreState(snapshot) {
      Object.assign(state, structuredClone(snapshot as LocalGrowthState));
      host[stateKey] = state;
    },
  });
}

void LOCAL_GROWTH_EXPERIENCE_SENTINEL;
