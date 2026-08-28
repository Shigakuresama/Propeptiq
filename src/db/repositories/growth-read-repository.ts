import { loadCurrentLoyaltyPolicy } from "@/growth/policies";
import {
  deepFreezeGrowthReadModel,
  redactGrowthReference,
  type OwnerGrowthSnapshot,
} from "@/growth/read-model";

export type GrowthReadSqlClient = Readonly<{
  query: <Row extends object>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<Readonly<{ rows: Row[] }>>;
}>;

export type GrowthReadTransactionRunner = <Value>(
  work: (client: GrowthReadSqlClient) => Promise<Value>,
  options: Readonly<{ isolationLevel: "serializable"; readOnly: true }>,
) => Promise<Value>;

export type GrowthReadRepository = Readonly<{
  readOwnerSnapshot: (input: Readonly<{
    ownerUserId: string;
    now: Date;
  }>) => Promise<OwnerGrowthSnapshot>;
}>;

function safeInteger(value: number | string): number {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) throw new Error("Unsafe growth read integer");
  return numeric;
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid growth read timestamp");
  return date.toISOString();
}

async function loadRewards(
  client: GrowthReadSqlClient,
  ownerUserId: string,
  now: Date,
): Promise<OwnerGrowthSnapshot["rewards"]> {
  const policy = await loadCurrentLoyaltyPolicy(client, now);
  const account = await client.query<{
    pendingPoints: number | string;
    availablePoints: number | string;
  }>(
    `SELECT pending_points AS "pendingPoints", available_points AS "availablePoints"
     FROM reward_accounts WHERE buyer_user_id = $1::uuid`,
    [ownerUserId],
  );
  if (account.rows.length === 0) return null;
  if (account.rows.length !== 1) throw new Error("Owner reward account is incoherent");
  const ledger = await client.query<{
    occurredAt: Date | string;
    kind: string;
    sourceId: string;
    pendingPointsDelta: number | string;
    availablePointsDelta: number | string;
    pendingPointsBalanceAfter: number | string;
    availablePointsBalanceAfter: number | string;
  }>(
    `SELECT le.occurred_at AS "occurredAt", le.kind, le.source_id AS "sourceId",
            le.pending_points_delta AS "pendingPointsDelta",
            le.available_points_delta AS "availablePointsDelta",
            le.pending_points_balance_after AS "pendingPointsBalanceAfter",
            le.available_points_balance_after AS "availablePointsBalanceAfter"
     FROM reward_ledger_entries le
     JOIN reward_accounts ra ON ra.id = le.reward_account_id
       AND ra.buyer_user_id = le.buyer_user_id
     WHERE ra.buyer_user_id = $1::uuid
     ORDER BY le.occurred_at DESC, le.id DESC`,
    [ownerUserId],
  );
  const pendingPoints = safeInteger(account.rows[0]!.pendingPoints);
  const availablePoints = safeInteger(account.rows[0]!.availablePoints);
  return {
    pendingPoints,
    availablePoints,
    usdEquivalentMinor: availablePoints * policy.redemptionMinorPerPoint,
    minimumRedemptionProgress: {
      currentPoints: Math.min(
        policy.minimumRedemptionPoints,
        Math.max(0, availablePoints),
      ),
      requiredPoints: policy.minimumRedemptionPoints,
    },
    ledger: ledger.rows.map((row) => ({
      occurredAt: toIso(row.occurredAt),
      kind: row.kind,
      reference: redactGrowthReference(row.sourceId),
      pendingPointsDelta: safeInteger(row.pendingPointsDelta),
      availablePointsDelta: safeInteger(row.availablePointsDelta),
      pendingPointsBalanceAfter: safeInteger(row.pendingPointsBalanceAfter),
      availablePointsBalanceAfter: safeInteger(row.availablePointsBalanceAfter),
    })),
  };
}

async function loadReferrals(
  client: GrowthReadSqlClient,
  ownerUserId: string,
): Promise<OwnerGrowthSnapshot["referrals"]> {
  const codes = await client.query<{ code: string; status: "active" | "revoked" }>(
    `SELECT code, status FROM referral_codes
     WHERE owner_user_id = $1::uuid
     ORDER BY (status = 'active') DESC, created_at DESC, id DESC`,
    [ownerUserId],
  );
  const summary = await client.query<{
    attributed: number | string;
    pending: number | string;
    qualified: number | string;
    reversed: number | string;
    rewardPointsTotal: number | string;
  }>(
    `SELECT count(ra.id)::int AS attributed,
            count(rc.id) FILTER (WHERE rc.status = 'pending')::int AS pending,
            count(rc.id) FILTER (WHERE rc.status = 'qualified')::int AS qualified,
            count(rc.id) FILTER (WHERE rc.status = 'reversed')::int AS reversed,
            coalesce(sum(rc.referrer_reward_points), 0) AS "rewardPointsTotal"
     FROM referral_attributions ra
     LEFT JOIN referral_conversions rc ON rc.referral_attribution_id = ra.id
     WHERE ra.referrer_user_id = $1::uuid`,
    [ownerUserId],
  );
  const conversions = await client.query<{
    reference: string;
    status: "pending" | "qualified" | "reversed";
    rewardPoints: number | string;
    occurredAt: Date | string;
  }>(
    `SELECT rc.id::text AS reference, rc.status,
            rc.referrer_reward_points AS "rewardPoints",
            rc.created_at AS "occurredAt"
     FROM referral_conversions rc
     JOIN referral_attributions ra ON ra.id = rc.referral_attribution_id
     WHERE ra.referrer_user_id = $1::uuid
     ORDER BY rc.created_at DESC, rc.id DESC`,
    [ownerUserId],
  );
  const row = summary.rows[0]!;
  return {
    code: codes.rows[0]?.code ?? null,
    status: codes.rows[0]?.status ?? null,
    counts: {
      attributed: safeInteger(row.attributed),
      pending: safeInteger(row.pending),
      qualified: safeInteger(row.qualified),
      reversed: safeInteger(row.reversed),
    },
    rewardPointsTotal: safeInteger(row.rewardPointsTotal),
    conversions: conversions.rows.map((conversion) => ({
      reference: redactGrowthReference(conversion.reference),
      status: conversion.status,
      rewardPoints: safeInteger(conversion.rewardPoints),
      occurredAt: toIso(conversion.occurredAt),
    })),
  };
}

async function loadSharedSets(
  client: GrowthReadSqlClient,
  ownerUserId: string,
): Promise<OwnerGrowthSnapshot["sharedSets"]> {
  const result = await client.query<{
    code: string;
    label: string;
    active: boolean;
    itemCount: number | string;
    updatedAt: Date | string;
  }>(
    `SELECT s.public_code AS code, s.label, s.active,
            count(i.product_id)::int AS "itemCount", s.updated_at AS "updatedAt"
     FROM shared_research_sets s
     LEFT JOIN shared_research_set_items i ON i.shared_set_id = s.id
     WHERE s.owner_user_id = $1::uuid
     GROUP BY s.id
     ORDER BY s.updated_at DESC, s.id DESC`,
    [ownerUserId],
  );
  return result.rows.map((row) => ({
    code: row.code,
    label: row.label,
    active: row.active,
    itemCount: safeInteger(row.itemCount),
    updatedAt: toIso(row.updatedAt),
  }));
}

async function loadAffiliate(
  client: GrowthReadSqlClient,
  ownerUserId: string,
): Promise<OwnerGrowthSnapshot["affiliate"]> {
  const profiles = await client.query<{
    id: string;
    publicCode: string;
    status: "pending" | "active" | "rejected" | "suspended";
    publicChannel: string;
    promotionMethod: "website" | "social" | "email" | "other";
  }>(
    `SELECT id::text AS id, public_code AS "publicCode", status,
            public_channel AS "publicChannel", promotion_method AS "promotionMethod"
     FROM affiliate_profiles WHERE user_id = $1::uuid`,
    [ownerUserId],
  );
  if (profiles.rows.length === 0) return null;
  if (profiles.rows.length !== 1) throw new Error("Owner affiliate profile is incoherent");
  const profile = profiles.rows[0]!;
  const attributions = await client.query<{ total: number | string }>(
    `SELECT count(*)::int AS total FROM affiliate_attributions
     WHERE affiliate_profile_id = $1::uuid AND affiliate_user_id = $2::uuid`,
    [profile.id, ownerUserId],
  );
  const commissions = await client.query<{
    pending: number | string;
    approved: number | string;
    paid: number | string;
    reversed: number | string;
  }>(
    `SELECT
       coalesce(sum(gross_commission_minor - reversed_commission_minor)
         FILTER (WHERE status = 'pending'), 0) AS pending,
       coalesce(sum(gross_commission_minor - reversed_commission_minor)
         FILTER (WHERE status = 'approved'), 0) AS approved,
       coalesce(sum(gross_commission_minor - reversed_commission_minor)
         FILTER (WHERE status = 'paid'), 0) AS paid,
       coalesce(sum(reversed_commission_minor)
         FILTER (WHERE status = 'reversed'), 0) AS reversed
     FROM affiliate_commissions WHERE affiliate_profile_id = $1::uuid`,
    [profile.id],
  );
  const payouts = await client.query<{ pending: number | string; paid: number | string }>(
    `SELECT coalesce(sum(amount_minor) FILTER (WHERE state = 'pending'), 0) AS pending,
            coalesce(sum(amount_minor) FILTER (WHERE state = 'paid'), 0) AS paid
     FROM affiliate_payouts WHERE affiliate_profile_id = $1::uuid`,
    [profile.id],
  );
  const commission = commissions.rows[0]!;
  const payout = payouts.rows[0]!;
  return {
    publicCode: profile.publicCode,
    status: profile.status,
    publicChannel: profile.publicChannel,
    promotionMethod: profile.promotionMethod,
    attributedCount: safeInteger(attributions.rows[0]!.total),
    commissionTotalsMinor: {
      pending: safeInteger(commission.pending),
      approved: safeInteger(commission.approved),
      paid: safeInteger(commission.paid),
      reversed: safeInteger(commission.reversed),
    },
    payoutTotalsMinor: {
      pending: safeInteger(payout.pending),
      paid: safeInteger(payout.paid),
    },
  };
}

export function createPostgresGrowthReadRepository(
  runReadTransaction: GrowthReadTransactionRunner,
): GrowthReadRepository {
  return Object.freeze({
    readOwnerSnapshot(input) {
      if (!Number.isFinite(input.now.getTime())) throw new Error("Invalid owner read time");
      return runReadTransaction(
        async (client) => {
          await client.query("SET TRANSACTION READ ONLY");
          const rewards = await loadRewards(client, input.ownerUserId, input.now);
          const referrals = await loadReferrals(client, input.ownerUserId);
          const sharedSets = await loadSharedSets(client, input.ownerUserId);
          const affiliate = await loadAffiliate(client, input.ownerUserId);
          return deepFreezeGrowthReadModel({ rewards, referrals, sharedSets, affiliate });
        },
        { isolationLevel: "serializable", readOnly: true },
      );
    },
  });
}
