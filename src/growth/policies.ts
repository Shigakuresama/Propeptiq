import { createHash } from "node:crypto";

import { parseAffiliatePolicy, type AffiliatePolicy } from "@/domain/affiliates";
import { parseReferralPolicy, type ReferralPolicy } from "@/domain/referrals";
import {
  parseLoyaltyPolicy,
  type GrowthProgramStatus,
  type LoyaltyPolicy,
} from "@/domain/rewards";

export type GrowthPolicySqlClient = Readonly<{
  query: <Row extends object>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<Readonly<{ rows: Row[] }>>;
}>;

export type GrowthTermsProgram = "customer_rewards_referrals" | "affiliate";

export type CurrentGrowthTerms = Readonly<{
  id: string;
  program: GrowthTermsProgram;
  version: number;
  contentHash: string;
  termsText: string;
  effectiveAt: string;
  supersededAt: string | null;
}>;

export type CurrentGrowthConfiguration = Readonly<{
  loyalty: LoyaltyPolicy;
  referral: ReferralPolicy;
  affiliate: AffiliatePolicy;
  terms: Readonly<{
    customerRewardsReferrals: CurrentGrowthTerms;
    affiliate: CurrentGrowthTerms;
  }>;
}>;

type PolicyStatus = "draft" | "active" | "superseded";

type PolicyBaseRow = {
  id: string;
  version: number | string;
  status: PolicyStatus;
  effectiveAt: Date | string;
  supersededAt: Date | string | null;
};

type LoyaltyRow = PolicyBaseRow & {
  pointsPerDollar: number | string;
  redemptionMinorPerPoint: number | string;
  minimumRedemptionPoints: number | string;
  maximumRedemptionBasisPoints: number | string;
  expiresAfterDays: number | string | null;
};

type ReferralRow = PolicyBaseRow & {
  attributionDays: number | string;
  referredDiscountBasisPoints: number | string;
  referredDiscountCapMinor: number | string;
  referrerPointsPerDollar: number | string;
  referrerRewardCapPoints: number | string;
};

type AffiliateRow = PolicyBaseRow & {
  attributionDays: number | string;
  firstOrderCommissionBasisPoints: number | string;
  reorderCommissionBasisPoints: number | string;
  reorderWindowDays: number | string;
  approvalDelayDays: number | string;
  payoutThresholdMinor: number | string;
  currency: string;
};

type TermsRow = {
  id: string;
  program: GrowthTermsProgram;
  version: number | string;
  contentHash: string;
  termsText: string;
  effectiveAt: Date | string;
  supersededAt: Date | string | null;
};

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid growth policy timestamp");
  return date.toISOString();
}

function nullableIso(value: Date | string | null): string | null {
  return value === null ? null : toIso(value);
}

function safeInteger(value: number | string | null): number | null {
  if (value === null) return null;
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) throw new Error("Unsafe growth policy integer");
  return numeric;
}

export function mapGrowthPolicyStatus(status: unknown): GrowthProgramStatus {
  switch (status) {
    case "draft":
      return "draft";
    case "active":
      return "active";
    case "superseded":
      return "retired";
    default:
      throw new Error("Unknown persistence growth policy status");
  }
}

function requireSingle<Row>(rows: readonly Row[], label: string): Row {
  if (rows.length !== 1) throw new Error(`Expected exactly one current ${label}`);
  return rows[0]!;
}

function policyBase(row: PolicyBaseRow) {
  return {
    id: row.id,
    version: safeInteger(row.version),
    status: mapGrowthPolicyStatus(row.status),
    effectiveAt: toIso(row.effectiveAt),
    supersededAt: nullableIso(row.supersededAt),
  };
}

export async function loadCurrentLoyaltyPolicy(
  client: GrowthPolicySqlClient,
  now: Date,
): Promise<LoyaltyPolicy> {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid current policy time");
  const result = await client.query<LoyaltyRow>(
    `SELECT id::text AS id, version, status,
            points_per_dollar AS "pointsPerDollar",
            redemption_minor_per_point AS "redemptionMinorPerPoint",
            minimum_redemption_points AS "minimumRedemptionPoints",
            maximum_redemption_basis_points AS "maximumRedemptionBasisPoints",
            expires_after_days AS "expiresAfterDays",
            effective_at AS "effectiveAt", superseded_at AS "supersededAt"
     FROM loyalty_policies
     WHERE status = 'active' AND effective_at <= $1::timestamptz
       AND (superseded_at IS NULL OR superseded_at > $1::timestamptz)
     ORDER BY effective_at DESC, version DESC`,
    [now.toISOString()],
  );
  const row = requireSingle(result.rows, "loyalty policy");
  const parsed = parseLoyaltyPolicy({
    ...policyBase(row),
    pointsPerDollar: safeInteger(row.pointsPerDollar),
    redemptionMinorPerPoint: safeInteger(row.redemptionMinorPerPoint),
    minimumRedemptionPoints: safeInteger(row.minimumRedemptionPoints),
    maximumRedemptionBasisPoints: safeInteger(row.maximumRedemptionBasisPoints),
    expiresAfterDays: safeInteger(row.expiresAfterDays),
  });
  if (!parsed.ok) throw new Error(`Invalid current loyalty policy: ${parsed.error.field}`);
  if (parsed.value.status !== "active") throw new Error("Current loyalty policy is not active");
  return parsed.value;
}

export async function loadCurrentReferralPolicy(
  client: GrowthPolicySqlClient,
  now: Date,
): Promise<ReferralPolicy> {
  const result = await client.query<ReferralRow>(
    `SELECT id::text AS id, version, status, attribution_days AS "attributionDays",
            referred_discount_basis_points AS "referredDiscountBasisPoints",
            referred_discount_cap_minor AS "referredDiscountCapMinor",
            referrer_points_per_dollar AS "referrerPointsPerDollar",
            referrer_reward_cap_points AS "referrerRewardCapPoints",
            effective_at AS "effectiveAt", superseded_at AS "supersededAt"
     FROM referral_policies
     WHERE status = 'active' AND effective_at <= $1::timestamptz
       AND (superseded_at IS NULL OR superseded_at > $1::timestamptz)
     ORDER BY effective_at DESC, version DESC`,
    [now.toISOString()],
  );
  const row = requireSingle(result.rows, "referral policy");
  const parsed = parseReferralPolicy({
    ...policyBase(row),
    attributionDays: safeInteger(row.attributionDays),
    referredDiscountBasisPoints: safeInteger(row.referredDiscountBasisPoints),
    referredDiscountCapMinor: safeInteger(row.referredDiscountCapMinor),
    referrerPointsPerDollar: safeInteger(row.referrerPointsPerDollar),
    referrerRewardCapPoints: safeInteger(row.referrerRewardCapPoints),
  });
  if (!parsed.ok) throw new Error(`Invalid current referral policy: ${parsed.error.field}`);
  if (parsed.value.status !== "active") throw new Error("Current referral policy is not active");
  return parsed.value;
}

async function loadCurrentAffiliatePolicy(
  client: GrowthPolicySqlClient,
  now: Date,
): Promise<AffiliatePolicy> {
  const result = await client.query<AffiliateRow>(
    `SELECT id::text AS id, version, status, attribution_days AS "attributionDays",
            first_order_commission_basis_points AS "firstOrderCommissionBasisPoints",
            reorder_commission_basis_points AS "reorderCommissionBasisPoints",
            reorder_window_days AS "reorderWindowDays",
            approval_delay_days AS "approvalDelayDays",
            payout_threshold_minor AS "payoutThresholdMinor", currency,
            effective_at AS "effectiveAt", superseded_at AS "supersededAt"
     FROM affiliate_policies
     WHERE status = 'active' AND effective_at <= $1::timestamptz
       AND (superseded_at IS NULL OR superseded_at > $1::timestamptz)
     ORDER BY effective_at DESC, version DESC`,
    [now.toISOString()],
  );
  const row = requireSingle(result.rows, "affiliate policy");
  const parsed = parseAffiliatePolicy({
    ...policyBase(row),
    attributionDays: safeInteger(row.attributionDays),
    firstOrderCommissionBasisPoints: safeInteger(row.firstOrderCommissionBasisPoints),
    reorderCommissionBasisPoints: safeInteger(row.reorderCommissionBasisPoints),
    reorderWindowDays: safeInteger(row.reorderWindowDays),
    approvalDelayDays: safeInteger(row.approvalDelayDays),
    payoutThresholdMinor: safeInteger(row.payoutThresholdMinor),
    currency: row.currency,
  });
  if (!parsed.ok) throw new Error(`Invalid current affiliate policy: ${parsed.error.field}`);
  if (parsed.value.status !== "active") throw new Error("Current affiliate policy is not active");
  return parsed.value;
}

export async function loadCurrentGrowthTerms(
  client: GrowthPolicySqlClient,
  program: GrowthTermsProgram,
  now: Date,
): Promise<CurrentGrowthTerms> {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid current terms time");
  const result = await client.query<TermsRow>(
    `SELECT id::text AS id, program, version, content_hash AS "contentHash",
            terms_text AS "termsText", effective_at AS "effectiveAt",
            superseded_at AS "supersededAt"
     FROM growth_terms_versions
     WHERE program = $1::growth_terms_program
       AND effective_at <= $2::timestamptz
       AND (superseded_at IS NULL OR superseded_at > $2::timestamptz)
     ORDER BY effective_at DESC, version DESC`,
    [program, now.toISOString()],
  );
  const row = requireSingle(result.rows, `${program} terms`);
  if (row.program !== program) throw new Error("Growth terms program mismatch");
  const version = safeInteger(row.version);
  if (version === null || version <= 0 || row.termsText.trim().length === 0) {
    throw new Error(`Invalid current ${program} terms`);
  }
  const computedHash = createHash("sha256").update(row.termsText, "utf8").digest("hex");
  if (computedHash !== row.contentHash) throw new Error("Growth terms hash mismatch");
  return deepFreeze({
    id: row.id,
    program: row.program,
    version,
    contentHash: row.contentHash,
    termsText: row.termsText,
    effectiveAt: toIso(row.effectiveAt),
    supersededAt: nullableIso(row.supersededAt),
  });
}

export async function loadCurrentGrowthConfiguration(
  client: GrowthPolicySqlClient,
  now: Date,
): Promise<CurrentGrowthConfiguration> {
  const loyalty = await loadCurrentLoyaltyPolicy(client, now);
  const referral = await loadCurrentReferralPolicy(client, now);
  const affiliate = await loadCurrentAffiliatePolicy(client, now);
  const customerRewardsReferrals = await loadCurrentGrowthTerms(
    client,
    "customer_rewards_referrals",
    now,
  );
  const affiliateTerms = await loadCurrentGrowthTerms(client, "affiliate", now);
  return deepFreeze({
    loyalty,
    referral,
    affiliate,
    terms: { customerRewardsReferrals, affiliate: affiliateTerms },
  });
}
