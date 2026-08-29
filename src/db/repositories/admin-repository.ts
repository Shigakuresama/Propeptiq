import {
  MANUAL_REWARD_ADJUSTMENT_MAX_ABS_POINTS_V1,
  MANUAL_REWARD_ADJUSTMENT_REASONS_V1,
} from "@/admin/admin-service";
import { createHash } from "node:crypto";
import type {
  AdminRepository,
  AdminTransaction,
  GrowthPolicyKind,
  GrowthPolicyValues,
  ManualRewardAdjustmentReasonV1,
  PromotionRecord,
} from "@/admin/admin-service";
import type { ProductPublicationFacts } from "@/admin/admin-policy";
import type { BuyerStatus, ResearchPurpose } from "@/domain/eligibility";
import type { RateLimitStore } from "@/security/rate-limit";
import { parseNormalizedProviderEventV1 } from "@/commerce/provider-events";
import {
  hasExactCheckoutProviderArtifact,
  hasExactProviderEventEnvelopeIdentity,
} from "@/commerce/payment-authority";
import { runSerializableWithRetry } from "@/db/serializable-retry";
import { parseAffiliatePolicy } from "@/domain/affiliates";
import { parseReferralPolicy } from "@/domain/referrals";
import { parseLoyaltyPolicy } from "@/domain/rewards";

export type AdminSqlClient = Readonly<{
  query: <T extends object>(
    sql: string,
    params?: unknown[],
  ) => Promise<Readonly<{ rows: T[] }>>;
}>;

export type AdminTransactionRunner = <T>(
  work: (client: AdminSqlClient) => Promise<T>,
  options: Readonly<{ isolationLevel: "serializable" }>,
) => Promise<T>;

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid database timestamp");
  return date.toISOString();
}

function asSafeInteger(value: number | string | null): number | null {
  if (value === null) return null;
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) throw new Error("Database integer is unsafe");
  return numeric;
}

function requireSafeDatabaseInteger(value: number | string | null, field: string): number {
  const integer = asSafeInteger(value);
  if (integer === null) throw new Error(`Database ${field} is missing`);
  return integer;
}

type RewardAdjustmentAccountRow = {
  id: string;
  buyerUserId: string;
  pendingPoints: number | string;
  availablePoints: number | string;
};

type RewardAdjustmentLedgerRow = {
  id: string;
  rewardAccountId: string;
  buyerUserId: string;
  kind: string;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  pendingPointsDelta: number | string;
  availablePointsDelta: number | string;
  pendingPointsBalanceAfter: number | string;
  availablePointsBalanceAfter: number | string;
};

const rewardAdjustmentUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const rewardAdjustmentFingerprintPattern = /^[0-9a-f]{64}$/u;
const rewardAdjustmentIdempotencyNamespace = "admin_adjustment:";
const rewardAdjustmentRawIdempotencyMaxLength = 183;
const rewardAdjustmentLedgerProjection = `id::text AS id,
  reward_account_id::text AS "rewardAccountId",
  buyer_user_id::text AS "buyerUserId", kind,
  source_type AS "sourceType", source_id AS "sourceId",
  idempotency_key AS "idempotencyKey",
  pending_points_delta AS "pendingPointsDelta",
  available_points_delta AS "availablePointsDelta",
  pending_points_balance_after AS "pendingPointsBalanceAfter",
  available_points_balance_after AS "availablePointsBalanceAfter"`;

function validateRewardAdjustmentPortInput(input: Parameters<
  NonNullable<AdminTransaction["adjustRewardBalance"]>
>[0]): void {
  if (
    !rewardAdjustmentUuidPattern.test(input.entryId) ||
    !rewardAdjustmentUuidPattern.test(input.rewardAccountId) ||
    !Number.isSafeInteger(input.delta) ||
    input.delta === 0 ||
    Math.abs(input.delta) > MANUAL_REWARD_ADJUSTMENT_MAX_ABS_POINTS_V1 ||
    !MANUAL_REWARD_ADJUSTMENT_REASONS_V1.includes(input.reason) ||
    input.idempotencyKey.trim() !== input.idempotencyKey ||
    input.idempotencyKey.length < 16 ||
    input.idempotencyKey.length > rewardAdjustmentRawIdempotencyMaxLength ||
    /[\u0000-\u001f\u007f]/u.test(input.idempotencyKey) ||
    !rewardAdjustmentFingerprintPattern.test(input.fingerprint) ||
    !Number.isFinite(input.occurredAt.getTime())
  ) {
    throw new Error("Reward adjustment persistence input is invalid");
  }
}

function projectRewardAdjustmentLedger(
  row: RewardAdjustmentLedgerRow,
  reason: ManualRewardAdjustmentReasonV1,
) {
  return {
    status: "applied" as const,
    entryId: row.id,
    rewardAccountId: row.rewardAccountId,
    delta: requireSafeDatabaseInteger(row.availablePointsDelta, "reward adjustment delta"),
    reason,
    availablePointsBalanceAfter: requireSafeDatabaseInteger(
      row.availablePointsBalanceAfter,
      "reward adjustment balance",
    ),
  };
}

function assertExactRewardAdjustmentReplay(
  row: RewardAdjustmentLedgerRow,
  account: RewardAdjustmentAccountRow,
  input: Parameters<NonNullable<AdminTransaction["adjustRewardBalance"]>>[0],
  persistedIdempotencyKey: string,
): void {
  if (
    row.id !== input.entryId ||
    row.rewardAccountId !== input.rewardAccountId ||
    row.buyerUserId !== account.buyerUserId ||
    row.kind !== "admin_adjustment" ||
    row.sourceType !== "admin_adjustment" ||
    row.sourceId !== input.fingerprint ||
    row.idempotencyKey !== persistedIdempotencyKey ||
    requireSafeDatabaseInteger(row.pendingPointsDelta, "reward adjustment pending delta") !== 0 ||
    requireSafeDatabaseInteger(row.availablePointsDelta, "reward adjustment delta") !== input.delta ||
    requireSafeDatabaseInteger(
      row.pendingPointsBalanceAfter,
      "reward adjustment pending balance",
    ) !== requireSafeDatabaseInteger(account.pendingPoints, "reward account pending balance")
  ) {
    throw new Error("Reward adjustment idempotency fingerprint conflict");
  }
}

type ReferralCodeLifecycleRow = {
  id: string;
  status: "active" | "revoked";
  createdAt: Date | string;
  revokedAt: Date | string | null;
};

type SharedSetLifecycleRow = {
  id: string;
  ownerUserId: string;
  publicCode: string;
  label: string;
  active: boolean;
  updatedAt: Date | string;
  deactivatedAt: Date | string | null;
  itemCount: number | string;
};

type SharedSetDeactivationReceiptRow = {
  sharedSetId: string;
  kind: string;
  expectedUpdatedAt: Date | string;
  resultActive: boolean;
  resultUpdatedAt: Date | string;
  appliedAt: Date | string;
};

function validateReferralCodeRevocationInput(
  input: Parameters<NonNullable<AdminTransaction["revokeReferralCode"]>>[0],
): void {
  if (
    !rewardAdjustmentUuidPattern.test(input.referralCodeId) ||
    !Number.isFinite(input.expectedCreatedAt.getTime()) ||
    !Number.isFinite(input.revokedAt.getTime()) ||
    input.revokedAt.getTime() <= input.expectedCreatedAt.getTime()
  ) {
    throw new Error("Referral code revocation persistence input is invalid");
  }
}

function validateSharedSetDeactivationInput(
  input: Parameters<NonNullable<AdminTransaction["deactivateSharedSet"]>>[0],
): void {
  if (
    !rewardAdjustmentUuidPattern.test(input.sharedSetId) ||
    !Number.isFinite(input.expectedUpdatedAt.getTime()) ||
    !Number.isFinite(input.deactivatedAt.getTime()) ||
    input.deactivatedAt.getTime() <= input.expectedUpdatedAt.getTime()
  ) {
    throw new Error("Shared set deactivation persistence input is invalid");
  }
}

function sharedSetAdminDeactivationIdentity(input: Parameters<
  NonNullable<AdminTransaction["deactivateSharedSet"]>
>[0]): Readonly<{ idempotencyKey: string; payloadHash: string }> {
  const payloadHash = createHash("sha256").update(JSON.stringify({
    kind: "deactivate",
    sharedSetId: input.sharedSetId,
    expectedUpdatedAt: input.expectedUpdatedAt.toISOString(),
    deactivatedAt: input.deactivatedAt.toISOString(),
  }), "utf8").digest("hex");
  return Object.freeze({
    idempotencyKey: `admin_shared_set_deactivate:${payloadHash}`,
    payloadHash,
  });
}

type GrowthPolicyRow = {
  id: string;
  version: number | string;
  status: "draft" | "active" | "superseded";
  effectiveAt: Date | string;
  supersededAt: Date | string | null;
  pointsPerDollar?: number | string;
  redemptionMinorPerPoint?: number | string;
  minimumRedemptionPoints?: number | string;
  maximumRedemptionBasisPoints?: number | string;
  expiresAfterDays?: number | string | null;
  attributionDays?: number | string;
  referredDiscountBasisPoints?: number | string;
  referredDiscountCapMinor?: number | string;
  referrerPointsPerDollar?: number | string;
  referrerRewardCapPoints?: number | string;
  firstOrderCommissionBasisPoints?: number | string;
  reorderCommissionBasisPoints?: number | string;
  reorderWindowDays?: number | string;
  approvalDelayDays?: number | string;
  payoutThresholdMinor?: number | string;
  currency?: string;
};

function growthPolicyTable(kind: GrowthPolicyKind): string {
  if (kind === "loyalty") return "loyalty_policies";
  if (kind === "referral") return "referral_policies";
  return "affiliate_policies";
}

function growthPolicyProjection(kind: GrowthPolicyKind): string {
  const common = `id::text AS id, version, status,
    effective_at AS "effectiveAt", superseded_at AS "supersededAt"`;
  if (kind === "loyalty") {
    return `${common}, points_per_dollar AS "pointsPerDollar",
      redemption_minor_per_point AS "redemptionMinorPerPoint",
      minimum_redemption_points AS "minimumRedemptionPoints",
      maximum_redemption_basis_points AS "maximumRedemptionBasisPoints",
      expires_after_days AS "expiresAfterDays"`;
  }
  if (kind === "referral") {
    return `${common}, attribution_days AS "attributionDays",
      referred_discount_basis_points AS "referredDiscountBasisPoints",
      referred_discount_cap_minor AS "referredDiscountCapMinor",
      referrer_points_per_dollar AS "referrerPointsPerDollar",
      referrer_reward_cap_points AS "referrerRewardCapPoints"`;
  }
  return `${common}, attribution_days AS "attributionDays",
    first_order_commission_basis_points AS "firstOrderCommissionBasisPoints",
    reorder_commission_basis_points AS "reorderCommissionBasisPoints",
    reorder_window_days AS "reorderWindowDays",
    approval_delay_days AS "approvalDelayDays",
    payout_threshold_minor AS "payoutThresholdMinor", currency`;
}

function assertPersistedGrowthPolicy(kind: GrowthPolicyKind, row: GrowthPolicyRow): void {
  const common = {
    id: row.id,
    version: requireSafeDatabaseInteger(row.version, "growth policy version"),
    status: row.status === "superseded" ? "retired" : row.status,
    effectiveAt: toIso(row.effectiveAt),
    supersededAt: row.supersededAt === null ? null : toIso(row.supersededAt),
  };
  const candidate = kind === "loyalty"
    ? {
        ...common,
        pointsPerDollar: requireSafeDatabaseInteger(row.pointsPerDollar ?? null, "pointsPerDollar"),
        redemptionMinorPerPoint: requireSafeDatabaseInteger(row.redemptionMinorPerPoint ?? null, "redemptionMinorPerPoint"),
        minimumRedemptionPoints: requireSafeDatabaseInteger(row.minimumRedemptionPoints ?? null, "minimumRedemptionPoints"),
        maximumRedemptionBasisPoints: requireSafeDatabaseInteger(row.maximumRedemptionBasisPoints ?? null, "maximumRedemptionBasisPoints"),
        expiresAfterDays: row.expiresAfterDays ?? null,
      }
    : kind === "referral"
      ? {
          ...common,
          attributionDays: requireSafeDatabaseInteger(row.attributionDays ?? null, "attributionDays"),
          referredDiscountBasisPoints: requireSafeDatabaseInteger(row.referredDiscountBasisPoints ?? null, "referredDiscountBasisPoints"),
          referredDiscountCapMinor: requireSafeDatabaseInteger(row.referredDiscountCapMinor ?? null, "referredDiscountCapMinor"),
          referrerPointsPerDollar: requireSafeDatabaseInteger(row.referrerPointsPerDollar ?? null, "referrerPointsPerDollar"),
          referrerRewardCapPoints: requireSafeDatabaseInteger(row.referrerRewardCapPoints ?? null, "referrerRewardCapPoints"),
        }
      : {
          ...common,
          attributionDays: requireSafeDatabaseInteger(row.attributionDays ?? null, "attributionDays"),
          firstOrderCommissionBasisPoints: requireSafeDatabaseInteger(row.firstOrderCommissionBasisPoints ?? null, "firstOrderCommissionBasisPoints"),
          reorderCommissionBasisPoints: requireSafeDatabaseInteger(row.reorderCommissionBasisPoints ?? null, "reorderCommissionBasisPoints"),
          reorderWindowDays: requireSafeDatabaseInteger(row.reorderWindowDays ?? null, "reorderWindowDays"),
          approvalDelayDays: requireSafeDatabaseInteger(row.approvalDelayDays ?? null, "approvalDelayDays"),
          payoutThresholdMinor: requireSafeDatabaseInteger(row.payoutThresholdMinor ?? null, "payoutThresholdMinor"),
          currency: row.currency,
        };
  const parsed = kind === "loyalty"
    ? parseLoyaltyPolicy(candidate)
    : kind === "referral"
      ? parseReferralPolicy(candidate)
      : parseAffiliatePolicy(candidate);
  if (!parsed.ok) {
    throw new Error(`Persisted growth policy domain shape is invalid: ${parsed.error.field}`);
  }
}

async function insertGrowthPolicyDraft(
  client: AdminSqlClient,
  input: Readonly<{
    id: string;
    kind: GrowthPolicyKind;
    effectiveAt: Date;
    values: GrowthPolicyValues;
  }>,
  version: number,
): Promise<void> {
  const values = input.values as Readonly<Record<string, unknown>>;
  const effectiveAt = input.effectiveAt.toISOString();
  if (input.kind === "loyalty") {
    await client.query(
      `INSERT INTO loyalty_policies
        (id, version, status, points_per_dollar, redemption_minor_per_point,
         minimum_redemption_points, maximum_redemption_basis_points,
         expires_after_days, effective_at)
       VALUES ($1::uuid, $2, 'draft', $3, $4, $5, $6, $7, $8::timestamptz)`,
      [input.id, version, values.pointsPerDollar, values.redemptionMinorPerPoint,
        values.minimumRedemptionPoints, values.maximumRedemptionBasisPoints,
        values.expiresAfterDays, effectiveAt],
    );
    return;
  }
  if (input.kind === "referral") {
    await client.query(
      `INSERT INTO referral_policies
        (id, version, status, attribution_days, referred_discount_basis_points,
         referred_discount_cap_minor, referrer_points_per_dollar,
         referrer_reward_cap_points, effective_at)
       VALUES ($1::uuid, $2, 'draft', $3, $4, $5, $6, $7, $8::timestamptz)`,
      [input.id, version, values.attributionDays, values.referredDiscountBasisPoints,
        values.referredDiscountCapMinor, values.referrerPointsPerDollar,
        values.referrerRewardCapPoints, effectiveAt],
    );
    return;
  }
  await client.query(
    `INSERT INTO affiliate_policies
      (id, version, status, attribution_days, first_order_commission_basis_points,
       reorder_commission_basis_points, reorder_window_days, approval_delay_days,
       payout_threshold_minor, currency, effective_at)
     VALUES ($1::uuid, $2, 'draft', $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)`,
    [input.id, version, values.attributionDays,
      values.firstOrderCommissionBasisPoints, values.reorderCommissionBasisPoints,
      values.reorderWindowDays, values.approvalDelayDays,
      values.payoutThresholdMinor, values.currency, effectiveAt],
  );
}

type ProductRow = {
  productId: string;
  name: string;
  packageForm: string;
  materialIdentity: string;
  status: "draft" | "active" | "retired";
  updatedAt: Date | string;
  policyGroupActive: boolean;
  currentPriceMinor: number | string | null;
  releasedQuantity: number | string;
  hasAllowDestination: boolean;
};

type PromotionRow = {
  id: string;
  code: string;
  version: number | string;
  name: string;
  kind: PromotionRecord["kind"];
  status: PromotionRecord["status"];
  amountMinor: number | string | null;
  basisPoints: number | null;
  currency: string | null;
  configuration: unknown;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  updatedAt: Date | string;
};

type PromotionTargetRow = {
  targetKind: "product" | "policy_group";
  targetId: string;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonicalTargets(targets: readonly PromotionTargetRow[]): string {
  return targets
    .toSorted((left, right) =>
      left.targetKind.localeCompare(right.targetKind) ||
      left.targetId.localeCompare(right.targetId),
    )
    .map(({ targetKind, targetId }) => `${targetKind}:${targetId}`)
    .join("|");
}

type BuyerFactsRow = {
  userId: string;
  clerkUserId: string;
  status: BuyerStatus;
  updatedAt: Date | string;
  ageConfirmed21Plus: boolean;
  researchPurpose: ResearchPurpose | null;
};

async function referencedPromotionProductsAreValid(
  client: AdminSqlClient,
  promotionId: string,
  kind: PromotionRecord["kind"],
  configuration: unknown,
): Promise<boolean> {
  if (kind === "bundle" || kind === "cross_sell") {
    if (typeof configuration !== "object" || configuration === null) return false;
    const productIds = Reflect.get(configuration, "productIds");
    const minimum = kind === "bundle" ? 2 : 1;
    if (
      !Array.isArray(productIds) ||
      productIds.length < minimum ||
      productIds.some(
        (id) =>
          typeof id !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
      ) ||
      new Set(productIds).size !== productIds.length
    ) {
      return false;
    }
    const result = await client.query<{ count: number | string }>(
      `
        SELECT count(*) AS count
        FROM products p
        JOIN product_policy_groups pg ON pg.id = p.policy_group_id AND pg.active = true
        WHERE p.id = ANY($1::uuid[]) AND p.status = 'active'
          AND EXISTS (
            SELECT 1 FROM product_prices pp
            WHERE pp.product_id = p.id AND pp.amount_minor > 0
              AND pp.effective_at <= CURRENT_TIMESTAMP AND pp.superseded_at IS NULL
          )
          AND EXISTS (
            SELECT 1 FROM lots l
            WHERE l.product_id = p.id AND l.status = 'released' AND l.available_quantity > 0
              AND (l.manufactured_at IS NULL OR l.manufactured_at <= CURRENT_TIMESTAMP)
              AND (l.expires_at IS NULL OR l.expires_at > CURRENT_TIMESTAMP)
          )
          AND EXISTS (
            SELECT 1 FROM destination_policies dp
            WHERE dp.active = true AND dp.result = 'allowed'
              AND dp.effective_at <= CURRENT_TIMESTAMP AND dp.superseded_at IS NULL
              AND ((dp.scope_kind = 'product' AND dp.product_id = p.id)
                OR (dp.scope_kind = 'policy_group' AND dp.policy_group_id = p.policy_group_id))
          )
          AND NOT EXISTS (
            SELECT 1 FROM analytical_claims ac
            LEFT JOIN lots evidence_lot
              ON evidence_lot.id = ac.lot_id AND evidence_lot.product_id = ac.product_id
            LEFT JOIN coa_documents evidence_coa
              ON evidence_coa.id = ac.coa_document_id AND evidence_coa.lot_id = ac.lot_id
            WHERE ac.product_id = p.id AND ac.active = true
              AND NOT (
                evidence_lot.status = 'released'
                AND evidence_lot.available_quantity > 0
                AND (evidence_lot.manufactured_at IS NULL OR evidence_lot.manufactured_at <= CURRENT_TIMESTAMP)
                AND (evidence_lot.expires_at IS NULL OR evidence_lot.expires_at > CURRENT_TIMESTAMP)
                AND evidence_coa.active = true
                AND evidence_coa.public = true
              )
          )
      `,
      [productIds],
    );
    if (asSafeInteger(result.rows[0]?.count ?? 0) !== productIds.length) return false;
  }

  const targets = await client.query<{ valid: boolean }>(
    `
      SELECT count(*) > 0 AND COALESCE(bool_and(
        CASE pt.target_kind
          WHEN 'product' THEN EXISTS (
            SELECT 1 FROM products p
            JOIN product_policy_groups pg ON pg.id = p.policy_group_id AND pg.active = true
            WHERE p.id = pt.product_id AND p.status = 'active'
          )
          WHEN 'policy_group' THEN EXISTS (
            SELECT 1 FROM product_policy_groups pg
            WHERE pg.id = pt.policy_group_id AND pg.active = true
          )
          ELSE false
        END
      ), false) AS valid
      FROM promotion_targets pt
      WHERE pt.promotion_id = $1::uuid
    `,
    [promotionId],
  );
  return targets.rows[0]?.valid === true;
}

function transactionFor(client: AdminSqlClient): AdminTransaction {
  return {
    async assertActorAuthority(input) {
      const result = await client.query<{ authorized: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM users u
            JOIN staff_roles sr ON sr.user_id = u.id
              AND sr.capability = $3 AND sr.revoked_at IS NULL
            LEFT JOIN buyer_profiles bp ON bp.user_id = u.id
            WHERE u.id = $1::uuid AND u.clerk_id = $2
              AND (bp.status IS NULL OR bp.status <> 'blocked')
          ) AS authorized
        `,
        [input.actorUserId, input.clerkUserId, input.capability],
      );
      if (result.rows[0]?.authorized !== true) {
        throw new Error(`Persisted ${input.capability} capability is required`);
      }
    },

    async adjustRewardBalance(input) {
      validateRewardAdjustmentPortInput(input);
      const persistedIdempotencyKey =
        `${rewardAdjustmentIdempotencyNamespace}${input.idempotencyKey}`;
      const accounts = await client.query<RewardAdjustmentAccountRow>(
        `SELECT id::text AS id, buyer_user_id::text AS "buyerUserId",
                pending_points AS "pendingPoints", available_points AS "availablePoints"
         FROM reward_accounts WHERE id = $1::uuid FOR UPDATE`,
        [input.rewardAccountId],
      );
      if (accounts.rows.length !== 1 || accounts.rows[0]?.id !== input.rewardAccountId) {
        throw new Error("Reward account is missing or unavailable");
      }
      const account = accounts.rows[0];
      const prior = await client.query<RewardAdjustmentLedgerRow>(
        `SELECT ${rewardAdjustmentLedgerProjection}
         FROM reward_ledger_entries
         WHERE source_type = 'admin_adjustment' AND idempotency_key = $1
         FOR UPDATE`,
        [persistedIdempotencyKey],
      );
      if (prior.rows.length > 1) throw new Error("Reward adjustment idempotency conflict");
      if (prior.rows[0]) {
        assertExactRewardAdjustmentReplay(
          prior.rows[0],
          account,
          input,
          persistedIdempotencyKey,
        );
        return {
          ...projectRewardAdjustmentLedger(prior.rows[0], input.reason),
          status: "idempotent",
        };
      }

      const pendingBefore = requireSafeDatabaseInteger(
        account.pendingPoints,
        "reward account pending balance",
      );
      const availableBefore = requireSafeDatabaseInteger(
        account.availablePoints,
        "reward account available balance",
      );
      const availableAfter = availableBefore + input.delta;
      if (!Number.isSafeInteger(availableAfter)) {
        throw new Error("Reward account balance overflow is unsafe");
      }
      const inserted = await client.query<RewardAdjustmentLedgerRow>(
        `INSERT INTO reward_ledger_entries
           (id, reward_account_id, buyer_user_id, kind, source_type, source_id,
            idempotency_key, pending_points_delta, available_points_delta,
            pending_points_balance_after, available_points_balance_after, occurred_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'admin_adjustment',
                 'admin_adjustment', $4, $5, 0, $6, $7, $8, $9::timestamptz)
         ON CONFLICT DO NOTHING
         RETURNING ${rewardAdjustmentLedgerProjection}`,
        [
          input.entryId,
          input.rewardAccountId,
          account.buyerUserId,
          input.fingerprint,
          persistedIdempotencyKey,
          input.delta,
          pendingBefore,
          availableAfter,
          input.occurredAt.toISOString(),
        ],
      );
      const insertedRow = inserted.rows[0];
      if (inserted.rows.length !== 1 || !insertedRow) {
        const collision = await client.query<RewardAdjustmentLedgerRow>(
          `SELECT ${rewardAdjustmentLedgerProjection}
           FROM reward_ledger_entries
           WHERE source_type = 'admin_adjustment' AND idempotency_key = $1
           FOR UPDATE`,
          [persistedIdempotencyKey],
        );
        if (collision.rows.length === 1 && collision.rows[0]) {
          assertExactRewardAdjustmentReplay(
            collision.rows[0],
            account,
            input,
            persistedIdempotencyKey,
          );
          return {
            ...projectRewardAdjustmentLedger(collision.rows[0], input.reason),
            status: "idempotent",
          };
        }
        throw new Error("Reward adjustment idempotency or fingerprint conflict");
      }
      const updated = await client.query<{ id: string }>(
        `UPDATE reward_accounts
         SET available_points = $3, updated_at = $4::timestamptz
         WHERE id = $1::uuid AND buyer_user_id = $2::uuid
           AND pending_points = $5 AND available_points = $6
         RETURNING id::text AS id`,
        [
          input.rewardAccountId,
          account.buyerUserId,
          availableAfter,
          input.occurredAt.toISOString(),
          pendingBefore,
          availableBefore,
        ],
      );
      if (updated.rows.length !== 1 || updated.rows[0]?.id !== input.rewardAccountId) {
        throw new Error("Stale reward account balance conflict");
      }
      return projectRewardAdjustmentLedger(insertedRow, input.reason);
    },

    async revokeReferralCode(input) {
      validateReferralCodeRevocationInput(input);
      const expectedCreatedAt = input.expectedCreatedAt.toISOString();
      const revokedAt = input.revokedAt.toISOString();
      const loaded = await client.query<ReferralCodeLifecycleRow>(
        `SELECT id::text AS id, status, created_at AS "createdAt",
                revoked_at AS "revokedAt"
         FROM referral_codes WHERE id = $1::uuid FOR UPDATE`,
        [input.referralCodeId],
      );
      if (loaded.rows.length !== 1 || loaded.rows[0]?.id !== input.referralCodeId) {
        throw new Error("Referral code is missing or unavailable");
      }
      const row = loaded.rows[0];
      if (toIso(row.createdAt) !== expectedCreatedAt) {
        throw new Error("Stale referral code revocation");
      }
      if (row.status === "revoked") {
        if (row.revokedAt === null || toIso(row.revokedAt) !== revokedAt) {
          throw new Error("Stale referral code revocation");
        }
        return {
          status: "idempotent" as const,
          referralCodeId: row.id,
          createdAt: expectedCreatedAt,
          revokedAt,
        };
      }
      if (row.status !== "active" || row.revokedAt !== null) {
        throw new Error("Referral code lifecycle state is invalid");
      }
      const updated = await client.query<ReferralCodeLifecycleRow>(
        `UPDATE referral_codes
         SET status = 'revoked', revoked_at = $3::timestamptz
         WHERE id = $1::uuid AND status = 'active' AND revoked_at IS NULL
           AND created_at = $2::timestamptz
         RETURNING id::text AS id, status, created_at AS "createdAt",
                   revoked_at AS "revokedAt"`,
        [input.referralCodeId, expectedCreatedAt, revokedAt],
      );
      const result = updated.rows[0];
      if (
        updated.rows.length !== 1 ||
        !result ||
        result.id !== input.referralCodeId ||
        result.status !== "revoked" ||
        toIso(result.createdAt) !== expectedCreatedAt ||
        result.revokedAt === null ||
        toIso(result.revokedAt) !== revokedAt
      ) {
        throw new Error("Stale referral code revocation");
      }
      return {
        status: "applied" as const,
        referralCodeId: result.id,
        createdAt: expectedCreatedAt,
        revokedAt,
      };
    },

    async deactivateSharedSet(input) {
      validateSharedSetDeactivationInput(input);
      const expectedUpdatedAt = input.expectedUpdatedAt.toISOString();
      const deactivatedAt = input.deactivatedAt.toISOString();
      const identity = sharedSetAdminDeactivationIdentity(input);
      const receipt = await client.query<SharedSetDeactivationReceiptRow>(
        `SELECT shared_set_id::text AS "sharedSetId", kind,
                expected_updated_at AS "expectedUpdatedAt",
                result_active AS "resultActive",
                result_updated_at AS "resultUpdatedAt", applied_at AS "appliedAt"
         FROM shared_research_set_mutations
         WHERE idempotency_key = $1 FOR UPDATE`,
        [identity.idempotencyKey],
      );
      if (receipt.rows.length > 1) throw new Error("Shared set deactivation receipt conflict");
      if (receipt.rows[0]) {
        const prior = receipt.rows[0];
        if (
          prior.sharedSetId !== input.sharedSetId ||
          prior.kind !== "deactivate" ||
          toIso(prior.expectedUpdatedAt) !== expectedUpdatedAt ||
          prior.resultActive !== false ||
          toIso(prior.resultUpdatedAt) !== deactivatedAt ||
          toIso(prior.appliedAt) !== deactivatedAt
        ) {
          throw new Error("Shared set deactivation receipt conflict");
        }
        return {
          status: "idempotent" as const,
          sharedSetId: prior.sharedSetId,
          active: false as const,
          updatedAt: deactivatedAt,
          deactivatedAt,
        };
      }

      const loaded = await client.query<SharedSetLifecycleRow>(
        `SELECT s.id::text AS id, s.owner_user_id::text AS "ownerUserId",
                s.public_code AS "publicCode", s.label, s.active,
                s.updated_at AS "updatedAt", s.deactivated_at AS "deactivatedAt",
                (SELECT count(*) FROM shared_research_set_items i
                 WHERE i.shared_set_id = s.id) AS "itemCount"
         FROM shared_research_sets s WHERE s.id = $1::uuid FOR UPDATE`,
        [input.sharedSetId],
      );
      if (loaded.rows.length !== 1 || loaded.rows[0]?.id !== input.sharedSetId) {
        throw new Error("Shared set is missing or unavailable");
      }
      const row = loaded.rows[0];
      const itemCount = requireSafeDatabaseInteger(row.itemCount, "shared set item count");
      if (
        !row.active ||
        row.deactivatedAt !== null ||
        toIso(row.updatedAt) !== expectedUpdatedAt
      ) {
        throw new Error("Stale shared set deactivation");
      }
      if (itemCount < 2 || itemCount > 8) {
        throw new Error("Shared set item history is invalid");
      }
      const updated = await client.query<{
        id: string;
        active: boolean;
        updatedAt: Date | string;
        deactivatedAt: Date | string | null;
      }>(
        `UPDATE shared_research_sets
         SET active = false, deactivated_at = $3::timestamptz,
             updated_at = $3::timestamptz
         WHERE id = $1::uuid AND active = true AND deactivated_at IS NULL
           AND updated_at = $2::timestamptz
         RETURNING id::text AS id, active, updated_at AS "updatedAt",
                   deactivated_at AS "deactivatedAt"`,
        [input.sharedSetId, expectedUpdatedAt, deactivatedAt],
      );
      const result = updated.rows[0];
      if (
        updated.rows.length !== 1 ||
        !result ||
        result.id !== input.sharedSetId ||
        result.active !== false ||
        toIso(result.updatedAt) !== deactivatedAt ||
        result.deactivatedAt === null ||
        toIso(result.deactivatedAt) !== deactivatedAt
      ) {
        throw new Error("Stale shared set deactivation");
      }
      await client.query(
        `INSERT INTO shared_research_set_mutations
          (idempotency_key, shared_set_id, owner_user_id, kind,
           expected_updated_at, payload_hash, result_public_code, result_label,
           result_active, result_item_count, result_updated_at, applied_at)
         VALUES ($1, $2::uuid, $3::uuid, 'deactivate', $4::timestamptz,
                 $5, $6, $7, false, $8, $9::timestamptz, $9::timestamptz)`,
        [
          identity.idempotencyKey,
          input.sharedSetId,
          row.ownerUserId,
          expectedUpdatedAt,
          identity.payloadHash,
          row.publicCode,
          row.label,
          itemCount,
          deactivatedAt,
        ],
      );
      return {
        status: "applied" as const,
        sharedSetId: result.id,
        active: false as const,
        updatedAt: deactivatedAt,
        deactivatedAt,
      };
    },

    async createGrowthPolicyDraft(input) {
      const table = growthPolicyTable(input.kind);
      const latest = await client.query<{ version: number | string }>(
        `SELECT version FROM ${table} ORDER BY version DESC LIMIT 1 FOR UPDATE`,
      );
      const priorVersion = latest.rows[0]
        ? requireSafeDatabaseInteger(latest.rows[0].version, "growth policy version")
        : 0;
      const version = priorVersion + 1;
      if (!Number.isSafeInteger(version)) throw new Error("Growth policy version is unsafe");
      await insertGrowthPolicyDraft(client, input, version);
      return { id: input.id, kind: input.kind, version, status: "draft" };
    },

    async activateGrowthPolicy(input) {
      const table = growthPolicyTable(input.kind);
      const candidateResult = await client.query<GrowthPolicyRow>(
        `SELECT ${growthPolicyProjection(input.kind)} FROM ${table}
         WHERE id = $1::uuid AND version = $2 AND status = 'draft'
           AND superseded_at IS NULL
         FOR UPDATE`,
        [input.id, input.expectedVersion],
      );
      const candidate = candidateResult.rows[0];
      if (!candidate) throw new Error("Stale growth policy activation rejected");
      assertPersistedGrowthPolicy(input.kind, candidate);

      const effectiveAt = toIso(candidate.effectiveAt);
      if (new Date(effectiveAt).getTime() < input.now.getTime()) {
        throw new Error("Growth policy effective window overlaps elapsed time");
      }
      const priorOverlap = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM ${table}
         WHERE status = 'superseded' AND superseded_at > $1::timestamptz
         LIMIT 1 FOR UPDATE`,
        [effectiveAt],
      );
      if (priorOverlap.rows.length > 0) {
        throw new Error("Growth policy effective window overlaps a prior policy");
      }
      const active = await client.query<{ id: string; effectiveAt: Date | string }>(
        `SELECT id::text AS id, effective_at AS "effectiveAt" FROM ${table}
         WHERE status = 'active' AND superseded_at IS NULL
         FOR UPDATE`,
      );
      if (active.rows.length > 1) throw new Error("Multiple active growth policies are invalid");
      const prior = active.rows[0];
      if (prior) {
        if (new Date(toIso(prior.effectiveAt)).getTime() >= new Date(effectiveAt).getTime()) {
          throw new Error("Growth policy effective windows overlap");
        }
        const retired = await client.query<{ id: string }>(
          `UPDATE ${table} SET status = 'superseded', superseded_at = $2::timestamptz
           WHERE id = $1::uuid AND status = 'active' AND superseded_at IS NULL
           RETURNING id::text AS id`,
          [prior.id, effectiveAt],
        );
        if (retired.rows.length !== 1) {
          throw new Error("Stale active growth policy retirement rejected");
        }
      }
      const activated = await client.query<{ id: string; version: number | string }>(
        `UPDATE ${table} SET status = 'active'
         WHERE id = $1::uuid AND version = $2 AND status = 'draft'
           AND superseded_at IS NULL
         RETURNING id::text AS id, version`,
        [input.id, input.expectedVersion],
      );
      const row = activated.rows[0];
      if (!row || activated.rows.length !== 1) {
        throw new Error("Stale growth policy activation rejected");
      }
      return {
        id: row.id,
        kind: input.kind,
        version: requireSafeDatabaseInteger(row.version, "growth policy version"),
        status: "active",
      };
    },

    async savePolicyGroup(input) {
      const result = input.policyGroupId === null
        ? await client.query<{
            id: string;
            active: boolean;
            updatedAt: Date | string;
          }>(
            `
              INSERT INTO product_policy_groups
                (slug, name, active, created_at, updated_at)
              VALUES ($1, $2, false, $3::timestamptz, $3::timestamptz)
              RETURNING id::text AS id, active, updated_at AS "updatedAt"
            `,
            [input.slug, input.name, input.now.toISOString()],
          )
        : await client.query<{
            id: string;
            active: boolean;
            updatedAt: Date | string;
          }>(
            `
              UPDATE product_policy_groups
              SET slug = $2, name = $3, updated_at = $4::timestamptz
              WHERE id = $1::uuid AND active = false
                AND updated_at = $5::timestamptz
              RETURNING id::text AS id, active, updated_at AS "updatedAt"
            `,
            [
              input.policyGroupId,
              input.slug,
              input.name,
              input.now.toISOString(),
              input.expectedUpdatedAt,
            ],
          );
      const row = result.rows[0];
      if (!row) throw new Error("Stale policy-group draft write rejected");
      return { ...row, updatedAt: toIso(row.updatedAt) };
    },

    async setPolicyGroupActive(input) {
      const result = await client.query<{
        id: string;
        active: boolean;
        updatedAt: Date | string;
      }>(
        `
          UPDATE product_policy_groups
          SET active = $2, updated_at = $3::timestamptz
          WHERE id = $1::uuid AND active <> $2
            AND updated_at = $4::timestamptz
          RETURNING id::text AS id, active, updated_at AS "updatedAt"
        `,
        [
          input.policyGroupId,
          input.active,
          input.now.toISOString(),
          input.expectedUpdatedAt,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Stale policy-group lifecycle write rejected");
      return { ...row, updatedAt: toIso(row.updatedAt) };
    },

    async saveProductDraft(input) {
      const result = input.productId === null
        ? await client.query<{ id: string; updatedAt: Date | string }>(
            `
              INSERT INTO products
                (slug, name, package_form, material_identity, policy_group_id,
                 status, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5::uuid, 'draft',
                      $6::timestamptz, $6::timestamptz)
              RETURNING id::text AS id, updated_at AS "updatedAt"
            `,
            [
              input.slug,
              input.name,
              input.packageForm,
              input.materialIdentity,
              input.policyGroupId,
              input.now.toISOString(),
            ],
          )
        : await client.query<{ id: string; updatedAt: Date | string }>(
            `
              UPDATE products
              SET slug = $2, name = $3, package_form = $4,
                  material_identity = $5, policy_group_id = $6::uuid,
                  updated_at = $7::timestamptz
              WHERE id = $1::uuid AND status = 'draft'
                AND updated_at = $8::timestamptz
              RETURNING id::text AS id, updated_at AS "updatedAt"
            `,
            [
              input.productId,
              input.slug,
              input.name,
              input.packageForm,
              input.materialIdentity,
              input.policyGroupId,
              input.now.toISOString(),
              input.expectedUpdatedAt,
            ],
          );
      const row = result.rows[0];
      if (!row) throw new Error("Stale product draft write rejected");
      return { ...row, updatedAt: toIso(row.updatedAt) };
    },

    async supersedeProductPrice(input) {
      const product = await client.query<{ status: "draft" | "active" | "retired" }>(
        `SELECT status FROM products WHERE id = $1::uuid FOR UPDATE`,
        [input.productId],
      );
      if (!product.rows[0] || product.rows[0].status === "retired") {
        throw new Error("A non-retired product is required for pricing");
      }
      const prices = await client.query<{
        id: string;
        version: number | string;
        effectiveAt: Date | string;
        supersededAt: Date | string | null;
      }>(
        `
          SELECT id::text AS id, version, effective_at AS "effectiveAt",
                 superseded_at AS "supersededAt"
          FROM product_prices
          WHERE product_id = $1::uuid
          ORDER BY version
          FOR UPDATE
        `,
        [input.productId],
      );
      const current = prices.rows.filter((price) => price.supersededAt === null);
      if (current.length > 1) throw new Error("Product price has ambiguous current versions");
      if (current[0]) {
        if (new Date(current[0].effectiveAt).getTime() >= input.now.getTime()) {
          throw new Error("A current price cannot be superseded at or before its effective time");
        }
        const changed = await client.query<{ id: string }>(
          `
            UPDATE product_prices SET superseded_at = $2::timestamptz
            WHERE id = $1::uuid AND superseded_at IS NULL
            RETURNING id::text AS id
          `,
          [current[0].id, input.now.toISOString()],
        );
        if (changed.rows.length !== 1) throw new Error("Stale price supersession rejected");
      }
      const version = prices.rows.reduce(
        (maximum, price) => Math.max(maximum, asSafeInteger(price.version) ?? 0),
        0,
      ) + 1;
      const inserted = await client.query<{ id: string; version: number }>(
        `
          INSERT INTO product_prices
            (product_id, version, amount_minor, currency, effective_at, created_at)
          VALUES ($1::uuid, $2, $3, $4, $5::timestamptz, $5::timestamptz)
          RETURNING id::text AS id, version
        `,
        [
          input.productId,
          version,
          input.amountMinor,
          input.currency,
          input.now.toISOString(),
        ],
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("Price supersession failed");
      return row;
    },

    async saveLotDraft(input) {
      const result = input.lotId === null
        ? await client.query<{ id: string; updatedAt: Date | string }>(
            `
              INSERT INTO lots
                (product_id, supplier_name, supplier_lot_code, analytical_method,
                 received_quantity, available_quantity, manufactured_at, expires_at,
                 status, created_at, updated_at)
              SELECT $1::uuid, $2, $3, $4, $5, $6,
                     $7::timestamptz, $8::timestamptz, 'draft',
                     $9::timestamptz, $9::timestamptz
              FROM products WHERE id = $1::uuid AND status <> 'retired'
              RETURNING id::text AS id, updated_at AS "updatedAt"
            `,
            [
              input.productId,
              input.supplierName,
              input.supplierLotCode,
              input.analyticalMethod,
              input.receivedQuantity,
              input.availableQuantity,
              input.manufacturedAt,
              input.expiresAt,
              input.now.toISOString(),
            ],
          )
        : await client.query<{ id: string; updatedAt: Date | string }>(
            `
              UPDATE lots l
              SET product_id = $2::uuid, supplier_name = $3,
                  supplier_lot_code = $4, analytical_method = $5,
                  received_quantity = $6, available_quantity = $7,
                  manufactured_at = $8::timestamptz,
                  expires_at = $9::timestamptz,
                  updated_at = $10::timestamptz
              FROM products p
              WHERE l.id = $1::uuid AND l.status = 'draft'
                AND l.updated_at = $11::timestamptz
                AND p.id = $2::uuid AND p.status <> 'retired'
              RETURNING l.id::text AS id, l.updated_at AS "updatedAt"
            `,
            [
              input.lotId,
              input.productId,
              input.supplierName,
              input.supplierLotCode,
              input.analyticalMethod,
              input.receivedQuantity,
              input.availableQuantity,
              input.manufacturedAt,
              input.expiresAt,
              input.now.toISOString(),
              input.expectedUpdatedAt,
            ],
          );
      const row = result.rows[0];
      if (!row) throw new Error("Stale lot draft write rejected");
      return { ...row, updatedAt: toIso(row.updatedAt) };
    },

    async setLotStatus(input) {
      const locked = await client.query<{
        status: "draft" | "quarantined" | "released" | "exhausted" | "recalled";
        availableQuantity: number | string;
        productStatus: "draft" | "active" | "retired";
        updatedAt: Date | string;
      }>(
        `
          SELECT l.status, l.available_quantity AS "availableQuantity",
                 p.status AS "productStatus", l.updated_at AS "updatedAt"
          FROM lots l JOIN products p ON p.id = l.product_id
          WHERE l.id = $1::uuid FOR UPDATE OF l, p
        `,
        [input.lotId],
      );
      const row = locked.rows[0];
      if (!row || toIso(row.updatedAt) !== toIso(input.expectedUpdatedAt)) {
        throw new Error("Stale lot lifecycle write rejected");
      }
      const available = asSafeInteger(row.availableQuantity) ?? -1;
      const transitionAllowed =
        (input.status === "released" &&
          (row.status === "draft" || row.status === "quarantined") &&
          row.productStatus !== "retired" && available > 0) ||
        (input.status === "quarantined" &&
          (row.status === "draft" || row.status === "released")) ||
        (input.status === "exhausted" && row.status === "released" && available === 0) ||
        (input.status === "recalled" &&
          (row.status === "draft" || row.status === "quarantined" || row.status === "released"));
      if (!transitionAllowed) throw new Error("Lot lifecycle transition is not permitted");
      const updated = await client.query<{
        id: string;
        status: string;
        updatedAt: Date | string;
      }>(
        `
          UPDATE lots SET status = $2::lot_status, updated_at = $3::timestamptz
          WHERE id = $1::uuid AND updated_at = $4::timestamptz
            AND ($2::lot_status <> 'released' OR manufactured_at IS NULL OR manufactured_at <= $3::timestamptz)
            AND ($2::lot_status <> 'released' OR expires_at IS NULL OR expires_at > $3::timestamptz)
          RETURNING id::text AS id, status, updated_at AS "updatedAt"
        `,
        [input.lotId, input.status, input.now.toISOString(), input.expectedUpdatedAt],
      );
      const changed = updated.rows[0];
      if (!changed) throw new Error("Stale lot lifecycle write rejected");
      return { ...changed, updatedAt: toIso(changed.updatedAt) };
    },

    async getLotPublicationFacts(lotId) {
      const result = await client.query<{
        id: string;
        supplierLotCode: string;
        analyticalMethod: string | null;
        manufacturedAt: Date | string | null;
        expiresAt: Date | string | null;
        status: "draft" | "quarantined" | "released" | "exhausted" | "recalled";
        updatedAt: Date | string;
      }>(
        `
          SELECT id::text AS id, supplier_lot_code AS "supplierLotCode",
                 analytical_method AS "analyticalMethod",
                 manufactured_at AS "manufacturedAt", expires_at AS "expiresAt", status,
                 updated_at AS "updatedAt"
          FROM lots WHERE id = $1::uuid
          FOR UPDATE
        `,
        [lotId],
      );
      const row = result.rows[0];
      return row
        ? {
            ...row,
            manufacturedAt: row.manufacturedAt ? toIso(row.manufacturedAt) : null,
            expiresAt: row.expiresAt ? toIso(row.expiresAt) : null,
            updatedAt: toIso(row.updatedAt),
          }
        : null;
    },

    async saveCoaDraft(input) {
      const result = input.coaDocumentId === null
        ? await client.query<{ id: string; active: boolean; public: boolean }>(
            `
              INSERT INTO coa_documents
                (lot_id, storage_key, evidence_hash, issued_at, active, public)
              VALUES ($1::uuid, $2, $3, $4::timestamptz, false, false)
              RETURNING id::text AS id, active, public
            `,
            [input.lotId, input.storageKey, input.evidenceHash, input.issuedAt],
          )
        : await client.query<{ id: string; active: boolean; public: boolean }>(
            `
              UPDATE coa_documents
              SET lot_id = $2::uuid, storage_key = $3, evidence_hash = $4,
                  issued_at = $5::timestamptz
              WHERE id = $1::uuid AND active = false AND public = false
                AND storage_key = $6 AND evidence_hash = $7
              RETURNING id::text AS id, active, public
            `,
            [
              input.coaDocumentId,
              input.lotId,
              input.storageKey,
              input.evidenceHash,
              input.issuedAt,
              input.expectedStorageKey,
              input.expectedEvidenceHash,
            ],
          );
      const row = result.rows[0];
      if (!row) throw new Error("Stale COA draft manifest write rejected");
      return row;
    },

    async setCoaActive(input) {
      const result = await client.query<{ id: string; active: boolean }>(
        `
          UPDATE coa_documents
          SET active = $2, public = CASE WHEN $2 THEN public ELSE false END
          WHERE id = $1::uuid AND active <> $2
            AND storage_key = $3 AND evidence_hash = $4
          RETURNING id::text AS id, active
        `,
        [
          input.coaDocumentId,
          input.active,
          input.expectedStorageKey,
          input.expectedEvidenceHash,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Stale COA lifecycle write rejected");
      return row;
    },

    async saveAnalyticalClaimDraft(input) {
      const result = input.claimId === null
        ? await client.query<{ id: string; updatedAt: Date | string }>(
            `
              INSERT INTO analytical_claims
                (product_id, lot_id, coa_document_id, text, active,
                 created_at, updated_at)
              VALUES ($1::uuid, $2::uuid, $3::uuid, $4, false,
                      $5::timestamptz, $5::timestamptz)
              RETURNING id::text AS id, updated_at AS "updatedAt"
            `,
            [
              input.productId,
              input.lotId,
              input.coaDocumentId,
              input.text,
              input.now.toISOString(),
            ],
          )
        : await client.query<{ id: string; updatedAt: Date | string }>(
            `
              UPDATE analytical_claims
              SET product_id = $2::uuid, lot_id = $3::uuid,
                  coa_document_id = $4::uuid, text = $5,
                  updated_at = $6::timestamptz
              WHERE id = $1::uuid AND active = false
                AND updated_at = $7::timestamptz
              RETURNING id::text AS id, updated_at AS "updatedAt"
            `,
            [
              input.claimId,
              input.productId,
              input.lotId,
              input.coaDocumentId,
              input.text,
              input.now.toISOString(),
              input.expectedUpdatedAt,
            ],
          );
      const row = result.rows[0];
      if (!row) throw new Error("Stale analytical-claim draft write rejected");
      return { ...row, updatedAt: toIso(row.updatedAt) };
    },

    async getAnalyticalClaimPublicationFacts(claimId) {
      const result = await client.query<{
        id: string;
        text: string;
        evidenceId: string;
        evidenceValid: boolean;
        active: boolean;
        updatedAt: Date | string;
      }>(
        `
          SELECT ac.id::text AS id, ac.text,
                 ac.coa_document_id::text AS "evidenceId", ac.active,
                 ac.updated_at AS "updatedAt",
                 (l.status = 'released' AND l.available_quantity > 0
                   AND (l.manufactured_at IS NULL OR l.manufactured_at <= CURRENT_TIMESTAMP)
                   AND (l.expires_at IS NULL OR l.expires_at > CURRENT_TIMESTAMP)
                   AND c.active = true AND c.public = true) AS "evidenceValid"
          FROM analytical_claims ac
          JOIN lots l ON l.id = ac.lot_id AND l.product_id = ac.product_id
          JOIN coa_documents c ON c.id = ac.coa_document_id AND c.lot_id = ac.lot_id
          WHERE ac.id = $1::uuid
          FOR UPDATE OF ac, l, c
        `,
        [claimId],
      );
      const row = result.rows[0];
      return row ? { ...row, updatedAt: toIso(row.updatedAt) } : null;
    },

    async setAnalyticalClaimActive(input) {
      const result = await client.query<{
        id: string;
        active: boolean;
        updatedAt: Date | string;
      }>(
        `
          UPDATE analytical_claims
          SET active = $2, updated_at = $3::timestamptz
          WHERE id = $1::uuid AND active <> $2
            AND updated_at = $4::timestamptz
          RETURNING id::text AS id, active, updated_at AS "updatedAt"
        `,
        [
          input.claimId,
          input.active,
          input.now.toISOString(),
          input.expectedUpdatedAt,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Stale analytical-claim lifecycle write rejected");
      return { ...row, updatedAt: toIso(row.updatedAt) };
    },

    async savePromotionDraft(input) {
      if (input.promotionId === null) {
        const result = await client.query<{
          id: string;
          version: number | string;
          updatedAt: Date | string;
        }>(
          `
            INSERT INTO promotions
              (code, version, name, kind, status, amount_minor, basis_points,
               currency, configuration, starts_at, ends_at,
               created_at, updated_at)
            VALUES ($1, 1, $2, $3::promotion_kind, 'draft', $4, $5, $6,
                    $7::jsonb, $8::timestamptz, $9::timestamptz,
                    $10::timestamptz, $10::timestamptz)
            RETURNING id::text AS id, version, updated_at AS "updatedAt"
          `,
          [
            input.code,
            input.name,
            input.kind,
            input.amountMinor,
            input.basisPoints,
            input.currency,
            JSON.stringify(input.configuration),
            input.startsAt?.toISOString() ?? null,
            input.endsAt?.toISOString() ?? null,
            input.now.toISOString(),
          ],
        );
        const row = result.rows[0];
        if (!row) throw new Error("Promotion draft creation failed");
        for (const target of input.targets) {
          await client.query(
            `
              INSERT INTO promotion_targets
                (promotion_id, target_kind, product_id, policy_group_id)
              VALUES
                ($1::uuid, $2::promotion_target_kind,
                 CASE WHEN $2 = 'product' THEN $3::uuid ELSE NULL END,
                 CASE WHEN $2 = 'policy_group' THEN $3::uuid ELSE NULL END)
            `,
            [row.id, target.targetKind, target.targetId],
          );
        }
        return {
          id: row.id,
          version: asSafeInteger(row.version)!,
          updatedAt: toIso(row.updatedAt),
          changed: true,
        };
      }

      const currentResult = await client.query<PromotionRow>(
        `
          SELECT id::text AS id, code, version, name, kind, status,
                 amount_minor AS "amountMinor", basis_points AS "basisPoints",
                 currency, configuration, starts_at AS "startsAt",
                 ends_at AS "endsAt", updated_at AS "updatedAt"
          FROM promotions WHERE id = $1::uuid
          FOR UPDATE
        `,
        [input.promotionId],
      );
      const current = currentResult.rows[0];
      const currentVersion = current ? asSafeInteger(current.version) : null;
      if (!current || currentVersion === null || currentVersion !== input.expectedVersion) {
        throw new Error("Stale promotion draft write rejected");
      }
      if (current.status !== "draft") {
        throw new Error("Only draft promotion terms can be edited");
      }
      const targetResult = await client.query<PromotionTargetRow>(
        `
          SELECT target_kind AS "targetKind",
                 COALESCE(product_id, policy_group_id)::text AS "targetId"
          FROM promotion_targets
          WHERE promotion_id = $1::uuid
          ORDER BY target_kind, COALESCE(product_id, policy_group_id)::text
        `,
        [input.promotionId],
      );
      const unchanged =
        current.code === input.code &&
        current.name === input.name &&
        current.kind === input.kind &&
        asSafeInteger(current.amountMinor) === input.amountMinor &&
        current.basisPoints === input.basisPoints &&
        current.currency === input.currency &&
        canonicalJson(current.configuration) === canonicalJson(input.configuration) &&
        (current.startsAt === null ? null : toIso(current.startsAt)) ===
          (input.startsAt?.toISOString() ?? null) &&
        (current.endsAt === null ? null : toIso(current.endsAt)) ===
          (input.endsAt?.toISOString() ?? null) &&
        canonicalTargets(targetResult.rows) === canonicalTargets(input.targets);
      if (unchanged) {
        return {
          id: current.id,
          version: currentVersion,
          updatedAt: toIso(current.updatedAt),
          changed: false,
        };
      }

      const result = await client.query<{
        id: string;
        version: number | string;
        updatedAt: Date | string;
      }>(
        `
          UPDATE promotions
          SET code = $2, name = $3, kind = $4::promotion_kind,
              amount_minor = $5, basis_points = $6, currency = $7,
              configuration = $8::jsonb, starts_at = $9::timestamptz,
              ends_at = $10::timestamptz, version = version + 1,
              updated_at = $11::timestamptz
          WHERE id = $1::uuid AND status = 'draft' AND version = $12
          RETURNING id::text AS id, version, updated_at AS "updatedAt"
        `,
        [
          input.promotionId,
          input.code,
          input.name,
          input.kind,
          input.amountMinor,
          input.basisPoints,
          input.currency,
          JSON.stringify(input.configuration),
          input.startsAt?.toISOString() ?? null,
          input.endsAt?.toISOString() ?? null,
          input.now.toISOString(),
          input.expectedVersion,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Stale promotion draft write rejected");
      await client.query(`DELETE FROM promotion_targets WHERE promotion_id = $1::uuid`, [row.id]);
      for (const target of input.targets) {
        await client.query(
          `
            INSERT INTO promotion_targets
              (promotion_id, target_kind, product_id, policy_group_id)
            VALUES
              ($1::uuid, $2::promotion_target_kind,
               CASE WHEN $2 = 'product' THEN $3::uuid ELSE NULL END,
               CASE WHEN $2 = 'policy_group' THEN $3::uuid ELSE NULL END)
          `,
          [row.id, target.targetKind, target.targetId],
        );
      }
      return {
        id: row.id,
        version: asSafeInteger(row.version)!,
        updatedAt: toIso(row.updatedAt),
        changed: true,
      };
    },

    async getProductPublicationFacts(productId) {
      const result = await client.query<ProductRow>(
        `
          SELECT p.id::text AS "productId", p.name,
                 p.package_form AS "packageForm",
                 p.material_identity AS "materialIdentity", p.status,
                 p.updated_at AS "updatedAt", pg.active AS "policyGroupActive",
                 (
                   SELECT CASE
                     WHEN count(*) = 1 AND min(pp.currency) = 'USD'
                       THEN min(pp.amount_minor)
                     ELSE NULL
                   END
                   FROM product_prices pp
                   WHERE pp.product_id = p.id
                     AND pp.effective_at <= CURRENT_TIMESTAMP
                     AND pp.superseded_at IS NULL
                 ) AS "currentPriceMinor",
                 COALESCE((
                   SELECT sum(l.available_quantity)
                   FROM lots l
                   WHERE l.product_id = p.id
                      AND l.status = 'released'
                      AND l.available_quantity > 0
                      AND (l.manufactured_at IS NULL OR l.manufactured_at <= CURRENT_TIMESTAMP)
                      AND (l.expires_at IS NULL OR l.expires_at > CURRENT_TIMESTAMP)
                 ), 0) AS "releasedQuantity",
                 EXISTS (
                   SELECT 1 FROM destination_policies dp
                   WHERE dp.active = true AND dp.result = 'allowed'
                     AND dp.effective_at <= CURRENT_TIMESTAMP
                     AND dp.superseded_at IS NULL
                     AND ((dp.scope_kind = 'product' AND dp.product_id = p.id)
                       OR (dp.scope_kind = 'policy_group' AND dp.policy_group_id = p.policy_group_id))
                 ) AS "hasAllowDestination"
          FROM products p
          JOIN product_policy_groups pg ON pg.id = p.policy_group_id
          WHERE p.id = $1::uuid
        `,
        [productId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const evidence = await client.query<{ id: string }>(
        `
          SELECT c.id::text AS id
          FROM coa_documents c
          JOIN lots l ON l.id = c.lot_id
          WHERE l.product_id = $1::uuid AND l.status = 'released'
            AND l.available_quantity > 0 AND c.active = true AND c.public = true
            AND (l.manufactured_at IS NULL OR l.manufactured_at <= CURRENT_TIMESTAMP)
            AND (l.expires_at IS NULL OR l.expires_at > CURRENT_TIMESTAMP)
          ORDER BY c.created_at, c.id
        `,
        [productId],
      );
      const claims = await client.query<{
        id: string;
        text: string;
        evidenceId: string | null;
      }>(
        `
          SELECT ac.id::text AS id, ac.text,
                  CASE WHEN l.status = 'released' AND l.available_quantity > 0
                             AND (l.manufactured_at IS NULL OR l.manufactured_at <= CURRENT_TIMESTAMP)
                             AND (l.expires_at IS NULL OR l.expires_at > CURRENT_TIMESTAMP)
                             AND c.active = true AND c.public = true
                      THEN ac.coa_document_id::text ELSE NULL END AS "evidenceId"
          FROM analytical_claims ac
          LEFT JOIN lots l ON l.id = ac.lot_id AND l.product_id = ac.product_id
          LEFT JOIN coa_documents c ON c.id = ac.coa_document_id AND c.lot_id = ac.lot_id
          WHERE ac.product_id = $1::uuid AND ac.active = true
          ORDER BY ac.created_at, ac.id
        `,
        [productId],
      );
      return {
        productId: row.productId,
        name: row.name,
        packageForm: row.packageForm,
        materialIdentity: row.materialIdentity,
        status: row.status,
        updatedAt: toIso(row.updatedAt),
        policyGroupActive: row.policyGroupActive,
        currentPriceMinor: asSafeInteger(row.currentPriceMinor),
        releasedQuantity: asSafeInteger(row.releasedQuantity) ?? 0,
        hasAllowDestination: row.hasAllowDestination,
        activeEvidenceIds: evidence.rows.map((entry) => entry.id),
        claims: claims.rows.map((claim) => ({
          id: claim.id,
          text: claim.text,
          lotEvidenceIds: claim.evidenceId === null ? [] : [claim.evidenceId],
        })),
      } satisfies ProductPublicationFacts & {
        status: ProductRow["status"];
        updatedAt: string;
      };
    },

    async setProductStatus(productId, status, expectedUpdatedAt, now) {
      const result = await client.query<{
        id: string;
        status: "active" | "retired";
        updatedAt: Date | string;
      }>(
        `
          UPDATE products
          SET status = $2::product_status, updated_at = $3::timestamptz
          WHERE id = $1::uuid AND updated_at = $4::timestamptz
            AND (($2::product_status = 'active' AND status = 'draft')
              OR ($2::product_status = 'retired' AND status <> 'retired'))
          RETURNING id::text AS id, status, updated_at AS "updatedAt"
        `,
        [productId, status, now.toISOString(), expectedUpdatedAt],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Stale product write rejected");
      return { ...row, updatedAt: toIso(row.updatedAt) };
    },

    async getPromotion(promotionId) {
      const result = await client.query<PromotionRow>(
        `
          SELECT id::text AS id, code, version, name, kind, status,
                 amount_minor AS "amountMinor", basis_points AS "basisPoints",
                 currency, configuration, starts_at AS "startsAt",
                 ends_at AS "endsAt", updated_at AS "updatedAt"
          FROM promotions WHERE id = $1::uuid
        `,
        [promotionId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        ...row,
        version: asSafeInteger(row.version)!,
        amountMinor: asSafeInteger(row.amountMinor),
        startsAt: row.startsAt === null ? null : toIso(row.startsAt),
        endsAt: row.endsAt === null ? null : toIso(row.endsAt),
        updatedAt: toIso(row.updatedAt),
        referencedProductsValid: await referencedPromotionProductsAreValid(
          client,
          row.id,
          row.kind,
          row.configuration,
        ),
      };
    },

    async setPromotionStatus(
      promotionId,
      status,
      expectedVersion,
      expectedUpdatedAt,
      now,
    ) {
      const result = await client.query<{
        id: string;
        status: "active" | "retired";
        version: number | string;
        updatedAt: Date | string;
      }>(
        `
          UPDATE promotions
          SET status = $2::promotion_status, updated_at = $3::timestamptz
          WHERE id = $1::uuid AND updated_at = $4::timestamptz
            AND version = $5
            AND (($2::promotion_status = 'active' AND status = 'draft')
              OR ($2::promotion_status = 'retired' AND status <> 'retired'))
          RETURNING id::text AS id, status, version, updated_at AS "updatedAt"
        `,
        [promotionId, status, now.toISOString(), expectedUpdatedAt, expectedVersion],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Stale promotion write rejected");
      return {
        ...row,
        version: asSafeInteger(row.version)!,
        updatedAt: toIso(row.updatedAt),
      };
    },

    async getCoaDocument(coaDocumentId) {
      const result = await client.query<{
        id: string;
        storageKey: string;
        evidenceHash: string;
        active: boolean;
        public: boolean;
      }>(
        `
          SELECT id::text AS id, storage_key AS "storageKey",
                 evidence_hash AS "evidenceHash", active, public
          FROM coa_documents WHERE id = $1::uuid
          FOR UPDATE
        `,
        [coaDocumentId],
      );
      return result.rows[0] ?? null;
    },

    async setCoaPublic(input) {
      const result = await client.query<{ id: string; public: true }>(
        `
          UPDATE coa_documents SET public = true
          WHERE id = $1::uuid AND active = true AND public = false
            AND storage_key = $2 AND evidence_hash = $3
          RETURNING id::text AS id, public
        `,
        [input.coaDocumentId, input.expectedStorageKey, input.expectedEvidenceHash],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Stale COA manifest publication rejected");
      return row;
    },

    async insertAttestationVersion(input) {
      const current = await client.query<{
        id: string;
        effectiveAt: Date | string;
      }>(
        `
          SELECT id::text AS id, effective_at AS "effectiveAt"
          FROM attestation_versions
          WHERE superseded_at IS NULL
          ORDER BY effective_at DESC
          FOR UPDATE
        `,
      );
      if (current.rows.length > 1) {
        throw new Error("Attestation policy has ambiguous current versions");
      }
      const previous = current.rows[0];
      const versions = await client.query<{ version: number | string }>(
        `SELECT COALESCE(max(version), 0) AS version FROM attestation_versions`,
      );
      const nextVersion = (asSafeInteger(versions.rows[0]?.version ?? 0) ?? 0) + 1;
      if (previous) {
        await client.query(
          `UPDATE attestation_versions SET superseded_at = $2::timestamptz WHERE id = $1::uuid AND superseded_at IS NULL`,
          [previous.id, input.now.toISOString()],
        );
      }
      const result = await client.query<{ id: string; version: number }>(
        `
          INSERT INTO attestation_versions
            (version, content_hash, policy_text, effective_at, created_at)
          VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz)
          RETURNING id::text AS id, version
        `,
        [
          nextVersion,
          input.contentHash,
          input.policyText,
          input.now.toISOString(),
          input.now.toISOString(),
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Attestation publication failed");
      return row;
    },

    async supersedeDestination(input) {
      const targetColumn = input.scopeKind === "product" ? "product_id" : "policy_group_id";
      const current = await client.query<{ id: string; version: number; effectiveAt: Date | string }>(
        `
          SELECT id::text AS id, version, effective_at AS "effectiveAt"
          FROM destination_policies
          WHERE scope_kind = $1::destination_scope_kind
            AND ${targetColumn} = $2::uuid AND state_code = $3 AND active = true
          FOR UPDATE
        `,
        [input.scopeKind, input.targetId, input.stateCode],
      );
      if (current.rows.length > 1) throw new Error("Destination policy has ambiguous active versions");
      const previous = current.rows[0];
      const versions = await client.query<{ version: number | string }>(
        `
          SELECT COALESCE(max(version), 0) AS version
          FROM destination_policies
          WHERE scope_kind = $1::destination_scope_kind
            AND ${targetColumn} = $2::uuid AND state_code = $3
        `,
        [input.scopeKind, input.targetId, input.stateCode],
      );
      const nextVersion = (asSafeInteger(versions.rows[0]?.version ?? 0) ?? 0) + 1;
      if (previous) {
        const changed = await client.query<{ id: string }>(
          `
            UPDATE destination_policies
            SET active = false, superseded_at = $2::timestamptz
            WHERE id = $1::uuid AND active = true AND superseded_at IS NULL
            RETURNING id::text AS id
          `,
          [previous.id, input.now.toISOString()],
        );
        if (changed.rows.length !== 1) throw new Error("Stale destination supersession rejected");
      }
      const result = await client.query<{ id: string; version: number }>(
        `
          INSERT INTO destination_policies
            (scope_kind, product_id, policy_group_id, state_code, result,
             version, active, effective_at, created_at)
          VALUES
            ($1::destination_scope_kind,
             CASE WHEN $1 = 'product' THEN $2::uuid ELSE NULL END,
             CASE WHEN $1 = 'policy_group' THEN $2::uuid ELSE NULL END,
             $3, $4::destination_result, $5, true, $6::timestamptz, $7::timestamptz)
          RETURNING id::text AS id, version
        `,
        [
          input.scopeKind,
          input.targetId,
          input.stateCode,
          input.result,
          nextVersion,
          input.now.toISOString(),
          input.now.toISOString(),
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Destination supersession failed");
      return row;
    },

    async getBuyerReactivationFacts(userId) {
      const result = await client.query<BuyerFactsRow>(
        `
          SELECT bp.user_id::text AS "userId", bp.status,
                 bp.updated_at AS "updatedAt",
                 u.clerk_id AS "clerkUserId",
                 bp.age_confirmed_at IS NOT NULL AS "ageConfirmed21Plus",
                 bp.research_purpose AS "researchPurpose"
          FROM buyer_profiles bp JOIN users u ON u.id = bp.user_id
          WHERE bp.user_id = $1::uuid
          FOR UPDATE
        `,
        [userId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const current = await client.query<{ id: string; version: number }>(
        `
          SELECT id::text AS id, version FROM attestation_versions
          WHERE effective_at <= CURRENT_TIMESTAMP
            AND (superseded_at IS NULL OR superseded_at > CURRENT_TIMESTAMP)
          ORDER BY version DESC
        `,
      );
      const attestation = current.rows.length === 1 ? current.rows[0]! : null;
      const acceptance = attestation
        ? await client.query<{ accepted: boolean }>(
            `
              SELECT EXISTS (
                SELECT 1 FROM attestation_acceptances
                WHERE user_id = $1::uuid AND attestation_version_id = $2::uuid
              ) AS accepted
            `,
            [userId, attestation.id],
          )
        : { rows: [{ accepted: false }] };
      return {
        ...row,
        updatedAt: toIso(row.updatedAt),
        acceptedCurrentAttestation: acceptance.rows[0]?.accepted === true,
        currentAttestationVersion: attestation ? String(attestation.version) : null,
      };
    },

    async setBuyerStatus(userId, status, expectedUpdatedAt, now) {
      const result = await client.query<{
        userId: string;
        status: BuyerStatus;
        updatedAt: Date | string;
      }>(
        `
          UPDATE buyer_profiles
          SET status = $2::buyer_status, updated_at = $3::timestamptz
          WHERE user_id = $1::uuid AND updated_at = $4::timestamptz
          RETURNING user_id::text AS "userId", status, updated_at AS "updatedAt"
        `,
        [userId, status, now.toISOString(), expectedUpdatedAt],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Stale buyer status write rejected");
      return { ...row, updatedAt: toIso(row.updatedAt) };
    },

    async decideReview(input) {
      const result = await client.query<{
        id: string;
        outcome: "approved" | "rejected" | null;
        coversBuyerReview: boolean | null;
        buyerReviewRequired: boolean;
      }>(
        `
          SELECT id::text AS id, outcome,
                 covers_buyer_review AS "coversBuyerReview",
                 buyer_review_required AS "buyerReviewRequired"
          FROM review_requests WHERE id = $1::uuid FOR UPDATE
        `,
        [input.reviewRequestId],
      );
      const current = result.rows[0];
      if (!current) throw new Error("Review request does not exist");
      const derivedCoverage = input.outcome === "approved" && current.buyerReviewRequired;
      if (current.outcome !== null) {
        if (
          current.outcome !== input.outcome ||
          current.coversBuyerReview !== derivedCoverage
        ) {
          throw new Error("Review was already decided differently");
        }
        return {
          id: current.id,
          outcome: current.outcome,
          coversBuyerReview: current.coversBuyerReview,
          changed: false,
        };
      }
      const updated = await client.query<{ id: string }>(
        `
          UPDATE review_requests
          SET outcome = $2::review_outcome, decided_by_user_id = $3::uuid,
              decided_at = $4::timestamptz, covers_buyer_review = $5
          WHERE id = $1::uuid AND outcome IS NULL
          RETURNING id::text AS id
        `,
        [
          input.reviewRequestId,
          input.outcome,
          input.actorUserId,
          input.now.toISOString(),
          derivedCoverage,
        ],
      );
      if (updated.rows.length !== 1) throw new Error("Stale review decision rejected");
      await client.query(
        `
          UPDATE review_request_destination_policies
          SET covered = $2
          WHERE review_request_id = $1::uuid
        `,
        [input.reviewRequestId, input.outcome === "approved"],
      );
      return {
        id: current.id,
        outcome: input.outcome,
        coversBuyerReview: derivedCoverage,
        changed: true,
      };
    },

    async getRefundEligibility(orderId, idempotencyKey) {
      type RefundOrderRow = {
        id: string;
        buyerUserId: string;
        state: string;
        currency: string;
        totalMinor: number | string;
      };
      const lockedOrder = await client.query<RefundOrderRow>(
        `SELECT id::text AS id, buyer_user_id::text AS "buyerUserId", state,
                currency, total_minor AS "totalMinor"
         FROM orders WHERE id = $1::uuid FOR UPDATE`,
        [orderId],
      );
      if (lockedOrder.rows.length !== 1) return null;
      const order = lockedOrder.rows[0]!;
      const invalidAuthority = () => ({
        orderId,
        orderState: order.state,
        currency: order.currency,
        verifiedPaidMinor: 0,
        refundedMinor: 0,
        outstandingRequested: false,
        provider: null,
        verifiedPaymentEventId: null,
      });
      if (
        order.state !== "paid_pending_fulfillment" &&
        order.state !== "paid_on_hold"
      ) {
        return invalidAuthority();
      }

      type RefundPaymentRow = {
        id: string;
        providerEventDatabaseId: string;
        providerEventExternalId: string;
        eventType: string;
        providerPaymentId: string | null;
        idempotencyKey: string;
        amountMinor: number | string;
        currency: string;
        provider: string;
        providerEventStatus: string;
        sourceLivemode: boolean;
        normalizedPayload: unknown;
      };
      const paymentRows = await client.query<RefundPaymentRow>(
        `
          SELECT pe.id::text AS id,
                 pe.provider_event_id::text AS "providerEventDatabaseId",
                 pre.provider_event_id AS "providerEventExternalId",
                 pe.event_type AS "eventType",
                 pe.provider_payment_id AS "providerPaymentId",
                 pe.idempotency_key AS "idempotencyKey",
                 pe.amount_minor AS "amountMinor", pe.currency,
                 pre.provider, pre.status AS "providerEventStatus",
                 pre.livemode AS "sourceLivemode",
                 pre.normalized_payload AS "normalizedPayload"
          FROM payment_events pe
          JOIN provider_events pre ON pre.id = pe.provider_event_id
          WHERE pe.order_id = $1::uuid
          ORDER BY pe.id FOR UPDATE OF pe
        `,
        [orderId],
      );
      const verifiedPayments = paymentRows.rows.filter(
        (row) => row.eventType === "payment_verified",
      );
      if (verifiedPayments.length !== 1) return invalidAuthority();
      const payment = verifiedPayments[0]!;
      const verifiedPaidMinor = asSafeInteger(payment.amountMinor);
      const source = parseNormalizedProviderEventV1(payment.normalizedPayload);
      if (
        (payment.provider !== "stripe" && payment.provider !== "local_test") ||
        payment.providerEventStatus !== "processed" ||
        payment.providerPaymentId === null ||
        verifiedPaidMinor === null ||
        verifiedPaidMinor <= 0 ||
        verifiedPaidMinor !== asSafeInteger(order.totalMinor) ||
        payment.currency !== order.currency ||
        payment.idempotencyKey !==
          `${payment.provider}:payment_intent:${payment.providerPaymentId}` ||
        source === null ||
        source.kind !== "checkout_session" ||
        !hasExactProviderEventEnvelopeIdentity(
          payment.providerEventExternalId,
          source,
        ) ||
        source.orderId !== order.id ||
        source.paymentIntentId !== payment.providerPaymentId ||
        source.amountMinor !== verifiedPaidMinor ||
        source.currency !== order.currency.toLowerCase() ||
        source.paymentStatus !== "paid" ||
        source.sessionStatus !== "complete" ||
        source.livemode !== payment.sourceLivemode
      ) {
        return invalidAuthority();
      }
      type SourceAttemptRow = {
        id: string;
        orderId: string;
        buyerUserId: string;
        status: string;
        provider: string | null;
        providerRequestId: string | null;
        providerSessionId: string | null;
        providerLivemode: boolean | null;
        providerScope: string | null;
        providerRequestHash: string | null;
        providerRequestSchemaVersion: number | string | null;
      };
      const attempts = await client.query<SourceAttemptRow>(
        `SELECT id::text AS id, order_id::text AS "orderId",
                buyer_user_id::text AS "buyerUserId", status, provider,
                provider_request_id AS "providerRequestId",
                provider_session_id AS "providerSessionId",
                provider_livemode AS "providerLivemode",
                provider_scope AS "providerScope",
                provider_request_hash AS "providerRequestHash",
                provider_request_schema_version AS "providerRequestSchemaVersion"
         FROM checkout_attempts WHERE id = $1::uuid`,
        [source.attemptId],
      );
      const attempt = attempts.rows[0];
      if (
        attempts.rows.length !== 1 ||
        attempt === undefined ||
        attempt.id !== source.attemptId ||
        attempt.orderId !== order.id ||
        attempt.buyerUserId !== order.buyerUserId ||
        attempt.status !== "completed" ||
        attempt.provider !== payment.provider ||
        attempt.providerRequestId !== `checkout_attempt:${source.attemptId}` ||
        attempt.providerSessionId !== source.sessionId ||
        attempt.providerLivemode !== source.livemode ||
        !hasExactCheckoutProviderArtifact({
          providerRequestHash: attempt.providerRequestHash,
          providerRequestSchemaVersion: attempt.providerRequestSchemaVersion,
        }) ||
        typeof attempt.providerScope !== "string" ||
        attempt.providerScope.trim() !== attempt.providerScope ||
        attempt.providerScope.length === 0
      ) {
        return invalidAuthority();
      }

      type RefundEligibilityRow = {
        id: string;
        orderId: string;
        requestedByUserId: string | null;
        verifiedPaymentEventId: string;
        provider: string;
        providerEventId: string | null;
        providerRefundId: string | null;
        idempotencyKey: string;
        requestedAmountMinor: number | string;
        confirmedAmountMinor: number | string | null;
        currency: string;
        status: "requested" | "submitted" | "succeeded" | "failed" | "cancelled";
        origin: "staff_requested" | "provider_observed";
        sourceProvider: string | null;
        sourceProviderEventId: string | null;
        sourceStatus: string | null;
        sourceLivemode: boolean | null;
        normalizedPayload: unknown;
      };
      const refunds = await client.query<RefundEligibilityRow>(
        `
          SELECT r.id::text AS id, r.order_id::text AS "orderId",
                 r.requested_by_user_id::text AS "requestedByUserId",
                 r.verified_payment_event_id::text AS "verifiedPaymentEventId",
                 r.provider, r.provider_event_id::text AS "providerEventId",
                 r.provider_refund_id AS "providerRefundId",
                 r.idempotency_key AS "idempotencyKey",
                 r.requested_amount_minor AS "requestedAmountMinor",
                 r.confirmed_amount_minor AS "confirmedAmountMinor",
                 r.currency, r.status, r.origin,
                 pre.provider AS "sourceProvider", pre.status AS "sourceStatus",
                 pre.provider_event_id AS "sourceProviderEventId",
                 pre.livemode AS "sourceLivemode",
                 pre.normalized_payload AS "normalizedPayload"
          FROM refunds r
          LEFT JOIN provider_events pre ON pre.id = r.provider_event_id
          WHERE r.order_id = $1::uuid
          ORDER BY r.id FOR UPDATE OF r
        `,
        [orderId],
      );
      let refundedMinor = 0;
      let outstandingRequested = false;
      for (const refund of refunds.rows) {
        const requested = asSafeInteger(refund.requestedAmountMinor);
        if (
          refund.orderId !== order.id ||
          refund.verifiedPaymentEventId !== payment.id ||
          refund.provider !== payment.provider ||
          refund.currency !== order.currency ||
          requested === null ||
          requested <= 0 ||
          (refund.origin === "staff_requested" && refund.requestedByUserId === null) ||
          (refund.origin === "provider_observed" && refund.requestedByUserId !== null)
        ) {
          return invalidAuthority();
        }
        if (
          (refund.status === "requested" || refund.status === "submitted") &&
          refund.idempotencyKey !== idempotencyKey
        ) {
          outstandingRequested = true;
        }
        if (refund.status !== "succeeded") continue;
        const confirmed = asSafeInteger(refund.confirmedAmountMinor);
        const event = parseNormalizedProviderEventV1(refund.normalizedPayload);
        if (
          confirmed === null ||
          confirmed !== requested ||
          refund.providerEventId === null ||
          refund.providerRefundId === null ||
          refund.sourceProvider !== payment.provider ||
          refund.sourceStatus !== "processed" ||
          refund.sourceLivemode !== source.livemode ||
          event === null ||
          event.kind !== "refund" ||
          !hasExactProviderEventEnvelopeIdentity(
            refund.sourceProviderEventId,
            event,
          ) ||
          event.status !== "succeeded" ||
          event.providerRefundId !== refund.providerRefundId ||
          event.paymentIntentId !== payment.providerPaymentId ||
          event.amountMinor !== confirmed ||
          event.currency !== order.currency.toLowerCase() ||
          event.livemode !== source.livemode ||
          (refund.origin === "staff_requested"
            ? event.orderId !== order.id || event.refundRequestId !== refund.id
            : event.orderId !== null || event.refundRequestId !== null)
        ) {
          return invalidAuthority();
        }
        refundedMinor += confirmed;
        if (!Number.isSafeInteger(refundedMinor) || refundedMinor > verifiedPaidMinor) {
          return invalidAuthority();
        }
      }
      return {
        orderId,
        orderState: order.state,
        currency: payment.currency,
        verifiedPaidMinor,
        refundedMinor,
        outstandingRequested,
        provider: payment.provider,
        verifiedPaymentEventId: payment.id,
      };
    },

    async insertRefundRequest(input) {
      const existing = await client.query<{
        id: string;
        orderId: string;
        requestedByUserId: string;
        verifiedPaymentEventId: string;
        provider: string;
        requestedAmountMinor: number | string;
        currency: string;
        reasonRedacted: string | null;
        status: "requested" | "submitted" | "succeeded" | "failed" | "cancelled";
        origin: "staff_requested" | "provider_observed";
      }>(
        `
          SELECT id::text AS id, order_id::text AS "orderId",
                 requested_by_user_id::text AS "requestedByUserId",
                 verified_payment_event_id::text AS "verifiedPaymentEventId", provider,
                 requested_amount_minor AS "requestedAmountMinor", currency,
                  reason_redacted AS "reasonRedacted", status, origin
          FROM refunds WHERE idempotency_key = $1 FOR UPDATE
        `,
        [input.idempotencyKey],
      );
      const prior = existing.rows[0];
      if (prior) {
        const same =
          prior.orderId === input.orderId &&
          prior.requestedByUserId === input.requestedByUserId &&
          prior.verifiedPaymentEventId === input.verifiedPaymentEventId &&
          prior.provider === input.provider &&
          asSafeInteger(prior.requestedAmountMinor) === input.requestedAmountMinor &&
          prior.currency === input.currency &&
          prior.reasonRedacted === input.reasonRedacted &&
          prior.origin === "staff_requested";
        if (!same) throw new Error("Refund idempotency key was already used differently");
        return { id: prior.id, status: prior.status, provider: prior.provider, changed: false };
      }
      const result = await client.query<{
        id: string;
        status: "requested";
        provider: string;
      }>(
        `
          INSERT INTO refunds
            (order_id, requested_by_user_id, verified_payment_event_id,
             provider, provider_event_id,
             idempotency_key, requested_amount_minor, currency,
             status, reason_redacted, requested_at)
          VALUES
            ($1::uuid, $2::uuid, $3::uuid, $4, NULL, $5, $6, $7,
             'requested', $8, $9::timestamptz)
          RETURNING id::text AS id, status, provider
        `,
        [
          input.orderId,
          input.requestedByUserId,
          input.verifiedPaymentEventId,
          input.provider,
          input.idempotencyKey,
          input.requestedAmountMinor,
          input.currency,
          input.reasonRedacted,
          input.now.toISOString(),
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Refund request insertion failed");
      return { ...row, changed: true };
    },

    async getShipmentEligibility(orderId) {
      const orderResult = await client.query<{
        orderId: string;
        orderState: string;
      }>(
        `
          SELECT id::text AS "orderId", state::text AS "orderState"
          FROM orders WHERE id = $1::uuid
          FOR UPDATE
        `,
        [orderId],
      );
      const order = orderResult.rows[0];
      if (!order) return null;
      const shipmentResult = await client.query<{
        releaseId: string | null;
        releaseState: "issued" | "revoked" | "expired" | "consumed" | null;
        releaseExpiresAt: Date | string | null;
        shipmentState: "pending" | "handed_off" | "delivered" | "exception" | null;
        shipmentUpdatedAt: Date | string | null;
      }>(
        `
          SELECT fr.id::text AS "releaseId",
                 fr.state AS "releaseState", fr.expires_at AS "releaseExpiresAt",
                 s.state AS "shipmentState", s.updated_at AS "shipmentUpdatedAt"
          FROM shipments s
          LEFT JOIN fulfillment_releases fr ON fr.id = s.fulfillment_release_id
          WHERE s.order_id = $1::uuid
          FOR UPDATE OF s
        `,
        [orderId],
      );
      const row = shipmentResult.rows[0];
      if (!row) {
        return {
          ...order,
          releaseId: null,
          releaseState: null,
          releaseExpiresAt: null,
          shipmentState: null,
          shipmentUpdatedAt: null,
        };
      }
      return {
        ...order,
        ...row,
        releaseExpiresAt:
          row.releaseExpiresAt === null ? null : toIso(row.releaseExpiresAt),
        shipmentUpdatedAt:
          row.shipmentUpdatedAt === null ? null : toIso(row.shipmentUpdatedAt),
      };
    },

    async upsertPendingShipment(input) {
      const result =
        input.expectedUpdatedAt === null
          ? await client.query<{ id: string; state: "pending" }>(
              `
                INSERT INTO shipments
                  (order_id, fulfillment_release_id, carrier, tracking_reference,
                   state, created_at, updated_at)
                VALUES ($1::uuid, NULL, $2, $3, 'pending', $4::timestamptz, $4::timestamptz)
                ON CONFLICT (order_id) DO NOTHING
                RETURNING id::text AS id, state
              `,
              [
                input.orderId,
                input.carrier,
                input.trackingReference,
                input.now.toISOString(),
              ],
            )
          : await client.query<{ id: string; state: "pending" }>(
              `
                UPDATE shipments
                SET carrier = $2, tracking_reference = $3, updated_at = $4::timestamptz
                WHERE order_id = $1::uuid AND fulfillment_release_id IS NULL
                  AND state = 'pending' AND updated_at = $5::timestamptz
                RETURNING id::text AS id, state
              `,
              [
                input.orderId,
                input.carrier,
                input.trackingReference,
                input.now.toISOString(),
                input.expectedUpdatedAt,
              ],
            );
      const row = result.rows[0];
      if (!row) throw new Error("Stale shipment metadata write rejected");
      return row;
    },

    async changeCapability(input) {
      const actor = await client.query<{ authorized: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1 FROM staff_roles
            WHERE user_id = $1::uuid AND capability = 'staff:manage'
              AND revoked_at IS NULL
          ) AS authorized
        `,
        [input.actorUserId],
      );
      if (actor.rows[0]?.authorized !== true) {
        throw new Error("Persisted staff:manage capability is required");
      }
      if (input.enabled) {
        const existing = await client.query<{ id: string }>(
          `
            SELECT id::text AS id FROM staff_roles
            WHERE user_id = $1::uuid AND capability = $2 AND revoked_at IS NULL
            FOR UPDATE
          `,
          [input.userId, input.capability],
        );
        if (existing.rows.length > 0) return { changed: false };
        await client.query(
          `
            INSERT INTO staff_roles
              (user_id, capability, granted_by_user_id, grant_correlation_id, granted_at)
            VALUES ($1::uuid, $2, $3::uuid, $4, $5::timestamptz)
          `,
          [
            input.userId,
            input.capability,
            input.actorUserId,
            input.correlationId,
            input.now.toISOString(),
          ],
        );
        return { changed: true };
      }
      const result = await client.query<{ id: string }>(
        `
          UPDATE staff_roles
          SET revoked_by_user_id = $3::uuid, revoke_correlation_id = $4,
              revoked_at = $5::timestamptz
          WHERE user_id = $1::uuid AND capability = $2 AND revoked_at IS NULL
          RETURNING id::text AS id
        `,
        [
          input.userId,
          input.capability,
          input.actorUserId,
          input.correlationId,
          input.now.toISOString(),
        ],
      );
      return { changed: result.rows.length === 1 };
    },

    async appendAudit(event) {
      await client.query(
        `
          INSERT INTO admin_audit
            (actor_user_id, action, resource_type, resource_id,
             correlation_id, metadata)
          VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb)
        `,
        [
          event.actorUserId,
          event.action,
          event.resourceType,
          event.resourceId,
          event.correlationId,
          JSON.stringify(event.metadata),
        ],
      );
    },
  };
}

export function createPostgresAdminRepository(
  runTransaction: AdminTransactionRunner,
  rateLimitStore: RateLimitStore,
): AdminRepository {
  return {
    rateLimitStore,
    transaction(work) {
      return runTransaction((client) => work(transactionFor(client)), {
        isolationLevel: "serializable",
      });
    },
    retrySerializableTransaction(work) {
      return runSerializableWithRetry(() =>
        runTransaction((client) => work(transactionFor(client)), {
          isolationLevel: "serializable",
        }),
      );
    },
  };
}
