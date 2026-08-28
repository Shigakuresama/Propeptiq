import { sql, type SQLWrapper } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { products } from "./catalog";
import { checkoutAttempts, orders } from "./commerce";
import {
  affiliateCommissionStatusEnum,
  affiliatePayoutStateEnum,
  affiliateProfileStatusEnum,
  affiliatePromotionMethodEnum,
  growthAttributionProgramEnum,
  growthPolicyStatusEnum,
  growthTermsProgramEnum,
  referralCodeStatusEnum,
  referralConversionStatusEnum,
  rewardLedgerKindEnum,
  rewardRedemptionStateEnum,
} from "./enums";
import {
  createdAt,
  currency,
  money,
  nonblank,
  safeNonnegativeMoney,
  safePositiveMoney,
  sha256,
  updatedAt,
} from "./helpers";
import { users } from "./identity";

const safeSignedInteger = (column: SQLWrapper) =>
  sql`${column} between -9007199254740991 and 9007199254740991`;
const safeNonnegativeInteger = (column: SQLWrapper) =>
  sql`${column} between 0 and 9007199254740991`;
const safePositiveInteger = (column: SQLWrapper) =>
  sql`${column} between 1 and 9007199254740991`;

const points = (name: string) => bigint(name, { mode: "number" }).notNull();

export const loyaltyPolicies = pgTable(
  "loyalty_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    version: integer("version").notNull(),
    status: growthPolicyStatusEnum("status").default("draft").notNull(),
    pointsPerDollar: points("points_per_dollar"),
    redemptionMinorPerPoint: money("redemption_minor_per_point"),
    minimumRedemptionPoints: points("minimum_redemption_points"),
    maximumRedemptionBasisPoints: integer(
      "maximum_redemption_basis_points",
    ).notNull(),
    expiresAfterDays: integer("expires_after_days"),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("loyalty_policies_version_unique").on(table.version),
    unique("loyalty_policies_id_version_unique").on(table.id, table.version),
    uniqueIndex("loyalty_policies_current_active_unique")
      .on(table.status)
      .where(sql`${table.status} = 'active' and ${table.supersededAt} is null`),
    check("loyalty_policies_version_positive", sql`${table.version} > 0`),
    check(
      "loyalty_policies_points_per_dollar_safe",
      safePositiveInteger(table.pointsPerDollar),
    ),
    check(
      "loyalty_policies_redemption_minor_safe",
      safePositiveMoney(table.redemptionMinorPerPoint),
    ),
    check(
      "loyalty_policies_minimum_points_safe",
      safePositiveInteger(table.minimumRedemptionPoints),
    ),
    check(
      "loyalty_policies_maximum_basis_points",
      sql`${table.maximumRedemptionBasisPoints} between 1 and 10000`,
    ),
    check("loyalty_policies_v1_no_expiry", sql`${table.expiresAfterDays} is null`),
    check(
      "loyalty_policies_state_coherent",
      sql`(${table.status} = 'superseded') = (${table.supersededAt} is not null)`,
    ),
    check(
      "loyalty_policies_time_coherent",
      sql`${table.supersededAt} is null or ${table.supersededAt} > ${table.effectiveAt}`,
    ),
  ],
);

export const referralPolicies = pgTable(
  "referral_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    version: integer("version").notNull(),
    status: growthPolicyStatusEnum("status").default("draft").notNull(),
    attributionDays: integer("attribution_days").notNull(),
    referredDiscountBasisPoints: integer(
      "referred_discount_basis_points",
    ).notNull(),
    referredDiscountCapMinor: money("referred_discount_cap_minor"),
    referrerPointsPerDollar: points("referrer_points_per_dollar"),
    referrerRewardCapPoints: points("referrer_reward_cap_points"),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("referral_policies_version_unique").on(table.version),
    unique("referral_policies_id_version_unique").on(table.id, table.version),
    uniqueIndex("referral_policies_current_active_unique")
      .on(table.status)
      .where(sql`${table.status} = 'active' and ${table.supersededAt} is null`),
    check("referral_policies_version_positive", sql`${table.version} > 0`),
    check(
      "referral_policies_attribution_days_positive",
      sql`${table.attributionDays} > 0`,
    ),
    check(
      "referral_policies_discount_basis_points",
      sql`${table.referredDiscountBasisPoints} between 1 and 10000`,
    ),
    check(
      "referral_policies_discount_cap_safe",
      safePositiveMoney(table.referredDiscountCapMinor),
    ),
    check(
      "referral_policies_reward_rate_safe",
      safePositiveInteger(table.referrerPointsPerDollar),
    ),
    check(
      "referral_policies_reward_cap_safe",
      safePositiveInteger(table.referrerRewardCapPoints),
    ),
    check(
      "referral_policies_state_coherent",
      sql`(${table.status} = 'superseded') = (${table.supersededAt} is not null)`,
    ),
    check(
      "referral_policies_time_coherent",
      sql`${table.supersededAt} is null or ${table.supersededAt} > ${table.effectiveAt}`,
    ),
  ],
);

export const affiliatePolicies = pgTable(
  "affiliate_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    version: integer("version").notNull(),
    status: growthPolicyStatusEnum("status").default("draft").notNull(),
    attributionDays: integer("attribution_days").notNull(),
    firstOrderCommissionBasisPoints: integer(
      "first_order_commission_basis_points",
    ).notNull(),
    reorderCommissionBasisPoints: integer(
      "reorder_commission_basis_points",
    ).notNull(),
    reorderWindowDays: integer("reorder_window_days").notNull(),
    approvalDelayDays: integer("approval_delay_days").notNull(),
    payoutThresholdMinor: money("payout_threshold_minor"),
    currency: text("currency").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("affiliate_policies_version_unique").on(table.version),
    unique("affiliate_policies_id_version_unique").on(table.id, table.version),
    uniqueIndex("affiliate_policies_current_active_unique")
      .on(table.status)
      .where(sql`${table.status} = 'active' and ${table.supersededAt} is null`),
    check("affiliate_policies_version_positive", sql`${table.version} > 0`),
    check(
      "affiliate_policies_attribution_days_positive",
      sql`${table.attributionDays} > 0`,
    ),
    check(
      "affiliate_policies_first_order_basis_points",
      sql`${table.firstOrderCommissionBasisPoints} between 1 and 10000`,
    ),
    check(
      "affiliate_policies_reorder_basis_points",
      sql`${table.reorderCommissionBasisPoints} between 1 and 10000`,
    ),
    check(
      "affiliate_policies_windows_positive",
      sql`${table.reorderWindowDays} > 0 and ${table.approvalDelayDays} > 0`,
    ),
    check(
      "affiliate_policies_payout_threshold_safe",
      safePositiveMoney(table.payoutThresholdMinor),
    ),
    check(
      "affiliate_policies_currency_usd",
      sql`${currency(table.currency)} and ${table.currency} = 'USD'`,
    ),
    check(
      "affiliate_policies_state_coherent",
      sql`(${table.status} = 'superseded') = (${table.supersededAt} is not null)`,
    ),
    check(
      "affiliate_policies_time_coherent",
      sql`${table.supersededAt} is null or ${table.supersededAt} > ${table.effectiveAt}`,
    ),
  ],
);

export const growthTermsVersions = pgTable(
  "growth_terms_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    program: growthTermsProgramEnum("program").notNull(),
    version: integer("version").notNull(),
    contentHash: text("content_hash").notNull(),
    termsText: text("terms_text").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("growth_terms_versions_program_version_unique").on(
      table.program,
      table.version,
    ),
    unique("growth_terms_versions_id_program_hash_unique").on(
      table.id,
      table.program,
      table.contentHash,
    ),
    unique("growth_terms_versions_program_hash_unique").on(
      table.program,
      table.contentHash,
    ),
    uniqueIndex("growth_terms_versions_current_program_unique")
      .on(table.program)
      .where(sql`${table.supersededAt} is null`),
    check("growth_terms_versions_version_positive", sql`${table.version} > 0`),
    check("growth_terms_versions_hash_sha256", sha256(table.contentHash)),
    check("growth_terms_versions_text_nonblank", nonblank(table.termsText)),
    check(
      "growth_terms_versions_time_coherent",
      sql`${table.supersededAt} is null or ${table.supersededAt} > ${table.effectiveAt}`,
    ),
  ],
);

export const growthTermsAcceptances = pgTable(
  "growth_terms_acceptances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    program: growthTermsProgramEnum("program").notNull(),
    termsVersionId: uuid("terms_version_id").notNull(),
    contentHash: text("content_hash").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("growth_terms_acceptances_id_user_program_unique").on(
      table.id,
      table.userId,
      table.program,
    ),
    unique("growth_terms_acceptances_user_version_unique").on(
      table.userId,
      table.termsVersionId,
    ),
    foreignKey({
      columns: [table.termsVersionId, table.program, table.contentHash],
      foreignColumns: [
        growthTermsVersions.id,
        growthTermsVersions.program,
        growthTermsVersions.contentHash,
      ],
      name: "growth_terms_acceptances_exact_terms_fk",
    }).onDelete("restrict"),
    check("growth_terms_acceptances_hash_sha256", sha256(table.contentHash)),
  ],
);

export const rewardAccounts = pgTable(
  "reward_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    buyerUserId: uuid("buyer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    pendingPoints: points("pending_points").default(0),
    availablePoints: points("available_points").default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("reward_accounts_buyer_unique").on(table.buyerUserId),
    unique("reward_accounts_id_buyer_unique").on(table.id, table.buyerUserId),
    check(
      "reward_accounts_pending_safe_nonnegative",
      safeNonnegativeInteger(table.pendingPoints),
    ),
    check(
      "reward_accounts_available_safe_signed",
      safeSignedInteger(table.availablePoints),
    ),
  ],
);

export const rewardLedgerEntries = pgTable(
  "reward_ledger_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    rewardAccountId: uuid("reward_account_id").notNull(),
    buyerUserId: uuid("buyer_user_id").notNull(),
    kind: rewardLedgerKindEnum("kind").notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    pendingPointsDelta: points("pending_points_delta"),
    availablePointsDelta: points("available_points_delta"),
    pendingPointsBalanceAfter: points("pending_points_balance_after"),
    availablePointsBalanceAfter: points("available_points_balance_after"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("reward_ledger_entries_idempotency_unique").on(
      table.idempotencyKey,
    ),
    unique("reward_ledger_entries_source_unique").on(
      table.kind,
      table.sourceType,
      table.sourceId,
    ),
    foreignKey({
      columns: [table.rewardAccountId, table.buyerUserId],
      foreignColumns: [rewardAccounts.id, rewardAccounts.buyerUserId],
      name: "reward_ledger_entries_account_buyer_fk",
    }).onDelete("restrict"),
    check(
      "reward_ledger_entries_idempotency_nonblank",
      nonblank(table.idempotencyKey),
    ),
    check("reward_ledger_entries_source_type_nonblank", nonblank(table.sourceType)),
    check("reward_ledger_entries_source_id_nonblank", nonblank(table.sourceId)),
    check(
      "reward_ledger_entries_pending_delta_safe",
      safeSignedInteger(table.pendingPointsDelta),
    ),
    check(
      "reward_ledger_entries_available_delta_safe",
      safeSignedInteger(table.availablePointsDelta),
    ),
    check(
      "reward_ledger_entries_nonzero_delta",
      sql`${table.pendingPointsDelta} <> 0 or ${table.availablePointsDelta} <> 0`,
    ),
    check(
      "reward_ledger_entries_pending_balance_safe",
      safeNonnegativeInteger(table.pendingPointsBalanceAfter),
    ),
    check(
      "reward_ledger_entries_available_balance_safe",
      safeSignedInteger(table.availablePointsBalanceAfter),
    ),
    index("reward_ledger_entries_account_occurred_idx").on(
      table.rewardAccountId,
      table.occurredAt,
    ),
  ],
);

export const rewardRedemptions = pgTable(
  "reward_redemptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    buyerUserId: uuid("buyer_user_id").notNull(),
    orderId: uuid("order_id").notNull(),
    checkoutAttemptId: uuid("checkout_attempt_id").notNull(),
    loyaltyPolicyId: uuid("loyalty_policy_id").notNull(),
    loyaltyPolicyVersion: integer("loyalty_policy_version").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    points: points("points"),
    amountMinor: money("amount_minor"),
    currency: text("currency").notNull(),
    state: rewardRedemptionStateEnum("state").default("reserved").notNull(),
    reservedAt: timestamp("reserved_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
  },
  (table) => [
    unique("reward_redemptions_idempotency_unique").on(table.idempotencyKey),
    uniqueIndex("reward_redemptions_active_attempt_unique")
      .on(table.checkoutAttemptId)
      .where(sql`${table.state} = 'reserved'`),
    foreignKey({
      columns: [table.orderId, table.buyerUserId],
      foreignColumns: [orders.id, orders.buyerUserId],
      name: "reward_redemptions_order_buyer_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.checkoutAttemptId, table.orderId],
      foreignColumns: [checkoutAttempts.id, checkoutAttempts.orderId],
      name: "reward_redemptions_attempt_order_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.loyaltyPolicyId, table.loyaltyPolicyVersion],
      foreignColumns: [loyaltyPolicies.id, loyaltyPolicies.version],
      name: "reward_redemptions_policy_version_fk",
    }).onDelete("restrict"),
    check("reward_redemptions_idempotency_nonblank", nonblank(table.idempotencyKey)),
    check("reward_redemptions_points_safe", safePositiveInteger(table.points)),
    check("reward_redemptions_amount_safe", safePositiveMoney(table.amountMinor)),
    check(
      "reward_redemptions_currency_usd",
      sql`${currency(table.currency)} and ${table.currency} = 'USD'`,
    ),
    check(
      "reward_redemptions_state_coherent",
      sql`(${table.state} = 'reserved' and ${table.consumedAt} is null and ${table.releasedAt} is null)
        or (${table.state} = 'consumed' and ${table.consumedAt} is not null and ${table.releasedAt} is null)
        or (${table.state} = 'released' and ${table.consumedAt} is null and ${table.releasedAt} is not null)`,
    ),
  ],
);

export const referralCodes = pgTable(
  "referral_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    status: referralCodeStatusEnum("status").default("active").notNull(),
    createdAt: createdAt(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    unique("referral_codes_code_unique").on(table.code),
    unique("referral_codes_id_owner_unique").on(table.id, table.ownerUserId),
    uniqueIndex("referral_codes_active_owner_unique")
      .on(table.ownerUserId)
      .where(sql`${table.status} = 'active'`),
    check(
      "referral_codes_opaque",
      sql`${table.code} ~ '^ref_[A-Za-z0-9_-]{16,64}$'`,
    ),
    check(
      "referral_codes_state_coherent",
      sql`(${table.status} = 'active' and ${table.revokedAt} is null)
        or (${table.status} = 'revoked' and ${table.revokedAt} is not null)`,
    ),
  ],
);

export const referralAttributions = pgTable(
  "referral_attributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    referralCodeId: uuid("referral_code_id").notNull(),
    referrerUserId: uuid("referrer_user_id").notNull(),
    referredUserId: uuid("referred_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    referralPolicyId: uuid("referral_policy_id").notNull(),
    referralPolicyVersion: integer("referral_policy_version").notNull(),
    clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    boundAt: timestamp("bound_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("referral_attributions_buyer_policy_unique").on(
      table.referredUserId,
      table.referralPolicyId,
    ),
    unique("referral_attributions_id_buyer_unique").on(
      table.id,
      table.referredUserId,
    ),
    unique("referral_attributions_id_buyer_policy_unique").on(
      table.id,
      table.referredUserId,
      table.referralPolicyId,
      table.referralPolicyVersion,
    ),
    foreignKey({
      columns: [table.referralCodeId, table.referrerUserId],
      foreignColumns: [referralCodes.id, referralCodes.ownerUserId],
      name: "referral_attributions_code_owner_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.referralPolicyId, table.referralPolicyVersion],
      foreignColumns: [referralPolicies.id, referralPolicies.version],
      name: "referral_attributions_policy_version_fk",
    }).onDelete("restrict"),
    check(
      "referral_attributions_not_self",
      sql`${table.referrerUserId} <> ${table.referredUserId}`,
    ),
    check(
      "referral_attributions_time_coherent",
      sql`${table.expiresAt} > ${table.clickedAt}
        and ${table.boundAt} >= ${table.clickedAt}
        and ${table.boundAt} <= ${table.expiresAt}`,
    ),
  ],
);

export const affiliateProfiles = pgTable(
  "affiliate_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    publicCode: text("public_code").notNull(),
    status: affiliateProfileStatusEnum("status").default("pending").notNull(),
    version: integer("version").default(1).notNull(),
    publicChannel: text("public_channel").notNull(),
    promotionMethod: affiliatePromotionMethodEnum("promotion_method").notNull(),
    termsAcceptanceId: uuid("terms_acceptance_id").notNull(),
    termsProgram: growthTermsProgramEnum("terms_program")
      .default("affiliate")
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("affiliate_profiles_user_unique").on(table.userId),
    unique("affiliate_profiles_public_code_unique").on(table.publicCode),
    unique("affiliate_profiles_id_user_unique").on(table.id, table.userId),
    foreignKey({
      columns: [table.termsAcceptanceId, table.userId, table.termsProgram],
      foreignColumns: [
        growthTermsAcceptances.id,
        growthTermsAcceptances.userId,
        growthTermsAcceptances.program,
      ],
      name: "affiliate_profiles_terms_acceptance_fk",
    }).onDelete("restrict"),
    check(
      "affiliate_profiles_public_code_opaque",
      sql`${table.publicCode} ~ '^aff_[A-Za-z0-9_-]{16,64}$'`,
    ),
    check("affiliate_profiles_channel_nonblank", nonblank(table.publicChannel)),
    check("affiliate_profiles_version_positive", sql`${table.version} > 0`),
    check(
      "affiliate_profiles_terms_program",
      sql`${table.termsProgram} = 'affiliate'`,
    ),
  ],
);

export const affiliateAttributions = pgTable(
  "affiliate_attributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    affiliateProfileId: uuid("affiliate_profile_id").notNull(),
    affiliateUserId: uuid("affiliate_user_id").notNull(),
    referredUserId: uuid("referred_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    affiliatePolicyId: uuid("affiliate_policy_id").notNull(),
    affiliatePolicyVersion: integer("affiliate_policy_version").notNull(),
    clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    boundAt: timestamp("bound_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("affiliate_attributions_buyer_policy_unique").on(
      table.referredUserId,
      table.affiliatePolicyId,
    ),
    unique("affiliate_attributions_id_profile_policy_unique").on(
      table.id,
      table.affiliateProfileId,
      table.affiliatePolicyId,
      table.affiliatePolicyVersion,
    ),
    unique("affiliate_attributions_id_buyer_policy_unique").on(
      table.id,
      table.referredUserId,
      table.affiliatePolicyId,
      table.affiliatePolicyVersion,
    ),
    unique("affiliate_attributions_commission_owner_unique").on(
      table.id,
      table.affiliateProfileId,
      table.referredUserId,
      table.affiliatePolicyId,
      table.affiliatePolicyVersion,
    ),
    foreignKey({
      columns: [table.affiliateProfileId, table.affiliateUserId],
      foreignColumns: [affiliateProfiles.id, affiliateProfiles.userId],
      name: "affiliate_attributions_profile_user_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.affiliatePolicyId, table.affiliatePolicyVersion],
      foreignColumns: [affiliatePolicies.id, affiliatePolicies.version],
      name: "affiliate_attributions_policy_version_fk",
    }).onDelete("restrict"),
    check(
      "affiliate_attributions_not_self",
      sql`${table.affiliateUserId} <> ${table.referredUserId}`,
    ),
    check(
      "affiliate_attributions_time_coherent",
      sql`${table.expiresAt} > ${table.clickedAt}
        and ${table.boundAt} >= ${table.clickedAt}
        and ${table.boundAt} <= ${table.expiresAt}`,
    ),
  ],
);

export const orderGrowthAttributions = pgTable(
  "order_growth_attributions",
  {
    orderId: uuid("order_id").primaryKey(),
    buyerUserId: uuid("buyer_user_id").notNull(),
    program: growthAttributionProgramEnum("program").notNull(),
    referralAttributionId: uuid("referral_attribution_id"),
    referralPolicyId: uuid("referral_policy_id"),
    referralPolicyVersion: integer("referral_policy_version"),
    affiliateAttributionId: uuid("affiliate_attribution_id"),
    affiliatePolicyId: uuid("affiliate_policy_id"),
    affiliatePolicyVersion: integer("affiliate_policy_version"),
    createdAt: createdAt(),
  },
  (table) => [
    unique("order_growth_attributions_referral_settlement_unique").on(
      table.orderId,
      table.buyerUserId,
      table.program,
      table.referralAttributionId,
      table.referralPolicyId,
      table.referralPolicyVersion,
    ),
    unique("order_growth_attributions_affiliate_settlement_unique").on(
      table.orderId,
      table.buyerUserId,
      table.program,
      table.affiliateAttributionId,
      table.affiliatePolicyId,
      table.affiliatePolicyVersion,
    ),
    foreignKey({
      columns: [table.orderId, table.buyerUserId],
      foreignColumns: [orders.id, orders.buyerUserId],
      name: "order_growth_attributions_order_buyer_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.referralAttributionId,
        table.buyerUserId,
        table.referralPolicyId,
        table.referralPolicyVersion,
      ],
      foreignColumns: [
        referralAttributions.id,
        referralAttributions.referredUserId,
        referralAttributions.referralPolicyId,
        referralAttributions.referralPolicyVersion,
      ],
      name: "order_growth_attributions_referral_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.affiliateAttributionId,
        table.buyerUserId,
        table.affiliatePolicyId,
        table.affiliatePolicyVersion,
      ],
      foreignColumns: [
        affiliateAttributions.id,
        affiliateAttributions.referredUserId,
        affiliateAttributions.affiliatePolicyId,
        affiliateAttributions.affiliatePolicyVersion,
      ],
      name: "order_growth_attributions_affiliate_fk",
    }).onDelete("restrict"),
    check(
      "order_growth_attributions_exact_program",
      sql`(${table.program} = 'customer_referral'
            and ${table.referralAttributionId} is not null
            and ${table.referralPolicyId} is not null
            and ${table.referralPolicyVersion} is not null
            and ${table.affiliateAttributionId} is null
            and ${table.affiliatePolicyId} is null
            and ${table.affiliatePolicyVersion} is null)
        or (${table.program} = 'affiliate'
            and ${table.affiliateAttributionId} is not null
            and ${table.affiliatePolicyId} is not null
            and ${table.affiliatePolicyVersion} is not null
            and ${table.referralAttributionId} is null
            and ${table.referralPolicyId} is null
            and ${table.referralPolicyVersion} is null)`,
    ),
  ],
);

export const referralConversions = pgTable(
  "referral_conversions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    referralAttributionId: uuid("referral_attribution_id").notNull(),
    referredUserId: uuid("referred_user_id").notNull(),
    firstOrderId: uuid("first_order_id").notNull(),
    program: growthAttributionProgramEnum("program")
      .default("customer_referral")
      .notNull(),
    referralPolicyId: uuid("referral_policy_id").notNull(),
    referralPolicyVersion: integer("referral_policy_version").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    referredDiscountMinor: money("referred_discount_minor"),
    referrerRewardPoints: points("referrer_reward_points"),
    status: referralConversionStatusEnum("status").default("pending").notNull(),
    createdAt: createdAt(),
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
  },
  (table) => [
    unique("referral_conversions_attribution_unique").on(
      table.referralAttributionId,
    ),
    unique("referral_conversions_first_order_unique").on(table.firstOrderId),
    unique("referral_conversions_idempotency_unique").on(table.idempotencyKey),
    foreignKey({
      columns: [
        table.referralAttributionId,
        table.referredUserId,
        table.referralPolicyId,
        table.referralPolicyVersion,
      ],
      foreignColumns: [
        referralAttributions.id,
        referralAttributions.referredUserId,
        referralAttributions.referralPolicyId,
        referralAttributions.referralPolicyVersion,
      ],
      name: "referral_conversions_attribution_policy_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.firstOrderId, table.referredUserId],
      foreignColumns: [orders.id, orders.buyerUserId],
      name: "referral_conversions_order_buyer_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.firstOrderId,
        table.referredUserId,
        table.program,
        table.referralAttributionId,
        table.referralPolicyId,
        table.referralPolicyVersion,
      ],
      foreignColumns: [
        orderGrowthAttributions.orderId,
        orderGrowthAttributions.buyerUserId,
        orderGrowthAttributions.program,
        orderGrowthAttributions.referralAttributionId,
        orderGrowthAttributions.referralPolicyId,
        orderGrowthAttributions.referralPolicyVersion,
      ],
      name: "referral_conversions_order_growth_fk",
    }).onDelete("restrict"),
    check(
      "referral_conversions_customer_program",
      sql`${table.program} = 'customer_referral'`,
    ),
    check(
      "referral_conversions_idempotency_nonblank",
      nonblank(table.idempotencyKey),
    ),
    check(
      "referral_conversions_discount_safe",
      safeNonnegativeMoney(table.referredDiscountMinor),
    ),
    check(
      "referral_conversions_reward_safe",
      safeNonnegativeInteger(table.referrerRewardPoints),
    ),
    check(
      "referral_conversions_state_coherent",
      sql`(${table.status} = 'pending' and ${table.qualifiedAt} is null and ${table.reversedAt} is null)
        or (${table.status} = 'qualified' and ${table.qualifiedAt} is not null and ${table.reversedAt} is null)
        or (${table.status} = 'reversed' and ${table.reversedAt} is not null)`,
    ),
  ],
);

export const affiliatePayouts = pgTable(
  "affiliate_payouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    affiliateProfileId: uuid("affiliate_profile_id")
      .notNull()
      .references(() => affiliateProfiles.id, { onDelete: "restrict" }),
    affiliatePolicyId: uuid("affiliate_policy_id").notNull(),
    affiliatePolicyVersion: integer("affiliate_policy_version").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    amountMinor: money("amount_minor"),
    currency: text("currency").notNull(),
    state: affiliatePayoutStateEnum("state").default("pending").notNull(),
    version: integer("version").default(1).notNull(),
    paidIdempotencyKey: text("paid_idempotency_key"),
    externalProvider: text("external_provider"),
    externalReference: text("external_reference"),
    createdAt: createdAt(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (table) => [
    unique("affiliate_payouts_idempotency_unique").on(table.idempotencyKey),
    unique("affiliate_payouts_paid_idempotency_unique").on(
      table.paidIdempotencyKey,
    ),
    unique("affiliate_payouts_id_profile_unique").on(
      table.id,
      table.affiliateProfileId,
    ),
    unique("affiliate_payouts_id_profile_policy_unique").on(
      table.id,
      table.affiliateProfileId,
      table.affiliatePolicyId,
      table.affiliatePolicyVersion,
    ),
    foreignKey({
      columns: [table.affiliatePolicyId, table.affiliatePolicyVersion],
      foreignColumns: [affiliatePolicies.id, affiliatePolicies.version],
      name: "affiliate_payouts_policy_version_fk",
    }).onDelete("restrict"),
    check("affiliate_payouts_idempotency_nonblank", nonblank(table.idempotencyKey)),
    check("affiliate_payouts_amount_safe", safePositiveMoney(table.amountMinor)),
    check("affiliate_payouts_version_positive", sql`${table.version} > 0`),
    check(
      "affiliate_payouts_paid_idempotency_nonblank",
      sql`${table.paidIdempotencyKey} is null or ${nonblank(table.paidIdempotencyKey)}`,
    ),
    check(
      "affiliate_payouts_currency_usd",
      sql`${currency(table.currency)} and ${table.currency} = 'USD'`,
    ),
    check(
      "affiliate_payouts_external_evidence_coherent",
      sql`(${table.state} = 'pending' and ${table.externalProvider} is null
            and ${table.externalReference} is null and ${table.paidAt} is null)
        or (${table.state} = 'paid' and ${table.externalProvider} is not null
            and ${nonblank(table.externalProvider)}
            and char_length(${table.externalProvider}) <= 120
            and ${table.externalReference} is not null
            and ${nonblank(table.externalReference)}
            and char_length(${table.externalReference}) <= 200
            and ${table.paidAt} is not null)`,
    ),
  ],
);

export const affiliateCommissions = pgTable(
  "affiliate_commissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    affiliateProfileId: uuid("affiliate_profile_id").notNull(),
    affiliateAttributionId: uuid("affiliate_attribution_id").notNull(),
    buyerUserId: uuid("buyer_user_id").notNull(),
    orderId: uuid("order_id").notNull(),
    program: growthAttributionProgramEnum("program")
      .default("affiliate")
      .notNull(),
    affiliatePolicyId: uuid("affiliate_policy_id").notNull(),
    affiliatePolicyVersion: integer("affiliate_policy_version").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    grossCommissionMinor: money("gross_commission_minor"),
    reversedCommissionMinor: money("reversed_commission_minor").default(0),
    status: affiliateCommissionStatusEnum("status").default("pending").notNull(),
    approvalEligibleAt: timestamp("approval_eligible_at", { withTimezone: true }),
    payoutId: uuid("payout_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("affiliate_commissions_order_unique").on(table.orderId),
    unique("affiliate_commissions_idempotency_unique").on(table.idempotencyKey),
    foreignKey({
      columns: [
        table.affiliateAttributionId,
        table.affiliateProfileId,
        table.buyerUserId,
        table.affiliatePolicyId,
        table.affiliatePolicyVersion,
      ],
      foreignColumns: [
        affiliateAttributions.id,
        affiliateAttributions.affiliateProfileId,
        affiliateAttributions.referredUserId,
        affiliateAttributions.affiliatePolicyId,
        affiliateAttributions.affiliatePolicyVersion,
      ],
      name: "affiliate_commissions_attribution_policy_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.orderId, table.buyerUserId],
      foreignColumns: [orders.id, orders.buyerUserId],
      name: "affiliate_commissions_order_buyer_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.orderId,
        table.buyerUserId,
        table.program,
        table.affiliateAttributionId,
        table.affiliatePolicyId,
        table.affiliatePolicyVersion,
      ],
      foreignColumns: [
        orderGrowthAttributions.orderId,
        orderGrowthAttributions.buyerUserId,
        orderGrowthAttributions.program,
        orderGrowthAttributions.affiliateAttributionId,
        orderGrowthAttributions.affiliatePolicyId,
        orderGrowthAttributions.affiliatePolicyVersion,
      ],
      name: "affiliate_commissions_order_growth_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.payoutId,
        table.affiliateProfileId,
        table.affiliatePolicyId,
        table.affiliatePolicyVersion,
      ],
      foreignColumns: [
        affiliatePayouts.id,
        affiliatePayouts.affiliateProfileId,
        affiliatePayouts.affiliatePolicyId,
        affiliatePayouts.affiliatePolicyVersion,
      ],
      name: "affiliate_commissions_payout_policy_fk",
    }).onDelete("restrict"),
    check(
      "affiliate_commissions_idempotency_nonblank",
      nonblank(table.idempotencyKey),
    ),
    check(
      "affiliate_commissions_affiliate_program",
      sql`${table.program} = 'affiliate'`,
    ),
    check(
      "affiliate_commissions_amounts_safe",
      sql`${safePositiveMoney(table.grossCommissionMinor)}
        and ${safeNonnegativeMoney(table.reversedCommissionMinor)}
        and ${table.reversedCommissionMinor} <= ${table.grossCommissionMinor}`,
    ),
    check(
      "affiliate_commissions_payout_coherent",
      sql`(${table.status} in ('pending','reversed') and ${table.payoutId} is null)
        or (${table.status} = 'approved')
        or (${table.status} = 'paid' and ${table.payoutId} is not null)`,
    ),
    check(
      "affiliate_commissions_approval_eligibility_after_creation",
      sql`${table.approvalEligibleAt} is null or ${table.approvalEligibleAt} > ${table.createdAt}`,
    ),
  ],
);

export const sharedResearchSets = pgTable(
  "shared_research_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    publicCode: text("public_code").notNull(),
    label: text("label").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  },
  (table) => [
    unique("shared_research_sets_public_code_unique").on(table.publicCode),
    unique("shared_research_sets_id_owner_unique").on(table.id, table.ownerUserId),
    check(
      "shared_research_sets_public_code_opaque",
      sql`${table.publicCode} ~ '^set_[A-Za-z0-9_-]{16,64}$'`,
    ),
    check(
      "shared_research_sets_label_bounds",
      sql`char_length(${table.label}) between 1 and 120 and ${nonblank(table.label)}
        and ${table.label} !~ '[[:cntrl:]]'`,
    ),
    check(
      "shared_research_sets_state_coherent",
      sql`(${table.active} = true and ${table.deactivatedAt} is null)
        or (${table.active} = false and ${table.deactivatedAt} is not null)`,
    ),
    index("shared_research_sets_owner_active_idx").on(
      table.ownerUserId,
      table.active,
    ),
  ],
);

export const sharedResearchSetMutations = pgTable(
  "shared_research_set_mutations",
  {
    idempotencyKey: text("idempotency_key").primaryKey(),
    sharedSetId: uuid("shared_set_id").notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    kind: text("kind").notNull(),
    expectedUpdatedAt: timestamp("expected_updated_at", { withTimezone: true })
      .notNull(),
    payloadHash: text("payload_hash").notNull(),
    resultPublicCode: text("result_public_code").notNull(),
    resultLabel: text("result_label").notNull(),
    resultActive: boolean("result_active").notNull(),
    resultItemCount: integer("result_item_count").notNull(),
    resultUpdatedAt: timestamp("result_updated_at", { withTimezone: true })
      .notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.sharedSetId, table.ownerUserId],
      foreignColumns: [sharedResearchSets.id, sharedResearchSets.ownerUserId],
      name: "shared_research_set_mutations_set_owner_fk",
    }).onDelete("restrict"),
    check(
      "shared_research_set_mutations_idempotency_opaque",
      sql`char_length(${table.idempotencyKey}) between 16 and 200
        and ${nonblank(table.idempotencyKey)}
        and ${table.idempotencyKey} !~ '[[:cntrl:]]'`,
    ),
    check(
      "shared_research_set_mutations_kind_valid",
      sql`${table.kind} in ('replace', 'deactivate')`,
    ),
    check(
      "shared_research_set_mutations_payload_hash_sha256",
      sha256(table.payloadHash),
    ),
    check(
      "shared_research_set_mutations_result_code_opaque",
      sql`${table.resultPublicCode} ~ '^set_[A-Za-z0-9_-]{16,64}$'`,
    ),
    check(
      "shared_research_set_mutations_result_label_bounds",
      sql`char_length(${table.resultLabel}) between 1 and 120
        and ${nonblank(table.resultLabel)} and ${table.resultLabel} !~ '[[:cntrl:]]'`,
    ),
    check(
      "shared_research_set_mutations_result_item_count_bounds",
      sql`${table.resultItemCount} between 2 and 8`,
    ),
    check(
      "shared_research_set_mutations_result_coherent",
      sql`(${table.kind} = 'replace' and ${table.resultActive} = true)
        or (${table.kind} = 'deactivate' and ${table.resultActive} = false)`,
    ),
    check(
      "shared_research_set_mutations_time_coherent",
      sql`${table.resultUpdatedAt} > ${table.expectedUpdatedAt}
        and ${table.appliedAt} = ${table.resultUpdatedAt}`,
    ),
    index("shared_research_set_mutations_set_owner_idx").on(
      table.sharedSetId,
      table.ownerUserId,
    ),
  ],
);

export const sharedResearchSetItems = pgTable(
  "shared_research_set_items",
  {
    sharedSetId: uuid("shared_set_id")
      .notNull()
      .references(() => sharedResearchSets.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({
      name: "shared_research_set_items_pk",
      columns: [table.sharedSetId, table.productId],
    }),
    check(
      "shared_research_set_items_quantity_bounds",
      sql`${table.quantity} between 1 and 25`,
    ),
  ],
);
