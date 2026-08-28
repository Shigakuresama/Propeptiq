import {
  calculateEarnedPoints,
  calculateRewardRedemption,
  parseLoyaltyPolicy,
  type LoyaltyPolicy,
} from "@/domain/rewards";
import type { KeyedUuidGenerator } from "@/commerce/checkout-identity";
import {
  createPostgresGrowthRepository,
  GrowthPersistenceConflict,
  type GrowthSqlClient,
  type GrowthTransactionRunner,
} from "@/db/repositories/growth-repository";
import {
  loadCurrentGrowthTerms,
  loadCurrentLoyaltyPolicy,
} from "@/growth/policies";

export type RewardsUnavailableReason =
  | "policy_unavailable"
  | "terms_unavailable"
  | "acceptance_unavailable"
  | "below_minimum"
  | "redemption_cap_exceeded"
  | "insufficient_balance"
  | "negative_balance"
  | "invalid_request"
  | "configuration_unavailable";

export type RewardsCheckoutSnapshot =
  | Readonly<{
      status: "available";
      rewardAccountId: string;
      availablePoints: number;
      loyaltyPolicy: LoyaltyPolicy;
      terms: Readonly<{
        id: string;
        version: number;
        contentHash: string;
      }>;
      acceptance: Readonly<{
        id: string;
        termsVersionId: string;
        contentHash: string;
      }>;
    }>
  | Readonly<{
      status: "unavailable";
      reason:
        | "policy_unavailable"
        | "terms_unavailable"
        | "acceptance_unavailable"
        | "negative_balance";
    }>;

export type AppliedCheckoutRewards = Readonly<{
  status: "applied";
  rewardAccountId: string;
  loyaltyPolicyId: string;
  loyaltyPolicyVersion: number;
  termsVersionId: string;
  termsContentHash: string;
  redemptionPoints: number;
  redemptionMinor: number;
  maximumPoints: number;
  eligibleMerchandiseMinor: number;
  pendingBaseEarnPoints: number;
}>;

export type CheckoutRewardsQuote =
  | AppliedCheckoutRewards
  | Readonly<{ status: "unavailable"; reason: RewardsUnavailableReason }>;

export type RewardsCheckoutReservationResult =
  | Readonly<{ status: "reserved" | "idempotent" | "conflict" }>
  | Readonly<{
      status: "unavailable";
      reason: "insufficient_balance" | "negative_balance" | "terms_unavailable";
    }>;

export type RewardsCheckoutAtomicPort = Readonly<{
  loadCheckoutRewards: (input: Readonly<{
    buyerUserId: string;
    now: Date;
  }>) => Promise<RewardsCheckoutSnapshot>;
  reserveCheckoutRewards: (input: Readonly<{
    buyerUserId: string;
    rewardAccountId: string;
    orderId: string;
    checkoutAttemptId: string;
    loyaltyPolicyId: string;
    loyaltyPolicyVersion: number;
    termsVersionId: string;
    termsContentHash: string;
    idempotencyKey: string;
    redemptionPoints: number;
    redemptionMinor: number;
    reservedAt: Date;
  }>) => Promise<RewardsCheckoutReservationResult>;
}>;

type RewardsSqlClient = GrowthSqlClient;

type RewardAccountRow = {
  id: string;
  availablePoints: number | string;
};

type AcceptanceRow = {
  id: string;
  termsVersionId: string;
  contentHash: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

function unavailable(reason: RewardsUnavailableReason): CheckoutRewardsQuote {
  return Object.freeze({ status: "unavailable" as const, reason });
}

function validAvailableSnapshot(
  value: Extract<RewardsCheckoutSnapshot, { status: "available" }>,
): boolean {
  const parsedPolicy = parseLoyaltyPolicy(value.loyaltyPolicy);
  return (
    UUID_PATTERN.test(value.rewardAccountId) &&
    Number.isSafeInteger(value.availablePoints) &&
    parsedPolicy.ok &&
    parsedPolicy.value.status === "active" &&
    UUID_PATTERN.test(value.terms.id) &&
    Number.isSafeInteger(value.terms.version) &&
    value.terms.version > 0 &&
    SHA256_PATTERN.test(value.terms.contentHash) &&
    UUID_PATTERN.test(value.acceptance.id) &&
    value.acceptance.termsVersionId === value.terms.id &&
    value.acceptance.contentHash === value.terms.contentHash
  );
}

function safeInteger(value: number | string): number {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) throw new Error("Unsafe reward balance");
  return numeric;
}

async function loadCheckoutRewardsFromClient(
  client: RewardsSqlClient,
  input: Readonly<{ buyerUserId: string; now: Date; lockAccount: boolean }>,
): Promise<RewardsCheckoutSnapshot> {
  let loyaltyPolicy: LoyaltyPolicy;
  try {
    loyaltyPolicy = await loadCurrentLoyaltyPolicy(client, input.now);
  } catch {
    return Object.freeze({ status: "unavailable", reason: "policy_unavailable" });
  }

  let terms: Awaited<ReturnType<typeof loadCurrentGrowthTerms>>;
  try {
    terms = await loadCurrentGrowthTerms(
      client,
      "customer_rewards_referrals",
      input.now,
    );
  } catch {
    return Object.freeze({ status: "unavailable", reason: "terms_unavailable" });
  }

  const account = await client.query<RewardAccountRow>(
    `SELECT id::text AS id, available_points AS "availablePoints"
     FROM reward_accounts WHERE buyer_user_id = $1::uuid${
       input.lockAccount ? " FOR UPDATE" : ""
     }`,
    [input.buyerUserId],
  );
  if (account.rows.length !== 1) {
    return Object.freeze({ status: "unavailable", reason: "acceptance_unavailable" });
  }
  const availablePoints = safeInteger(account.rows[0]!.availablePoints);
  if (availablePoints < 0) {
    return Object.freeze({ status: "unavailable", reason: "negative_balance" });
  }

  const acceptance = await client.query<AcceptanceRow>(
    `SELECT id::text AS id, terms_version_id::text AS "termsVersionId",
            content_hash AS "contentHash"
     FROM growth_terms_acceptances
     WHERE user_id = $1::uuid
       AND program = 'customer_rewards_referrals'
       AND terms_version_id = $2::uuid
       AND content_hash = $3
       AND accepted_at <= $4::timestamptz${input.lockAccount ? " FOR UPDATE" : ""}`,
    [input.buyerUserId, terms.id, terms.contentHash, input.now.toISOString()],
  );
  if (acceptance.rows.length !== 1) {
    return Object.freeze({ status: "unavailable", reason: "acceptance_unavailable" });
  }

  return Object.freeze({
    status: "available",
    rewardAccountId: account.rows[0]!.id,
    availablePoints,
    loyaltyPolicy,
    terms: Object.freeze({
      id: terms.id,
      version: terms.version,
      contentHash: terms.contentHash,
    }),
    acceptance: Object.freeze({ ...acceptance.rows[0]! }),
  });
}

function repositoryInCurrentTransaction(client: RewardsSqlClient) {
  return createPostgresGrowthRepository({
    runSerializableTransaction: async <Value>(
      work: (transactionClient: GrowthSqlClient) => Promise<Value>,
    ) => work(client),
  });
}

export async function reserveCheckoutRewardsInTransaction(
  client: RewardsSqlClient,
  input: Parameters<RewardsCheckoutAtomicPort["reserveCheckoutRewards"]>[0],
  keyedUuid: KeyedUuidGenerator,
): Promise<RewardsCheckoutReservationResult> {
  const snapshot = await loadCheckoutRewardsFromClient(client, {
    buyerUserId: input.buyerUserId,
    now: input.reservedAt,
    lockAccount: true,
  });
  if (snapshot.status === "unavailable") {
    if (snapshot.reason === "negative_balance") {
      return Object.freeze({ status: "unavailable", reason: "negative_balance" });
    }
    return Object.freeze({ status: "unavailable", reason: "terms_unavailable" });
  }
  if (
    snapshot.rewardAccountId !== input.rewardAccountId ||
    snapshot.loyaltyPolicy.id !== input.loyaltyPolicyId ||
    snapshot.loyaltyPolicy.version !== input.loyaltyPolicyVersion ||
    snapshot.terms.id !== input.termsVersionId ||
    snapshot.terms.contentHash !== input.termsContentHash
  ) {
    return Object.freeze({ status: "conflict" });
  }
  if (snapshot.availablePoints < input.redemptionPoints) {
    return Object.freeze({ status: "unavailable", reason: "insufficient_balance" });
  }

  const order = await client.query<{ merchandiseMinor: number | string }>(
    `SELECT COALESCE(sum(total_minor), 0) AS "merchandiseMinor"
     FROM order_items WHERE order_id = $1::uuid`,
    [input.orderId],
  );
  const postPromotionMerchandiseMinor =
    safeInteger(order.rows[0]?.merchandiseMinor ?? 0) + input.redemptionMinor;
  const exactQuote = calculateRewardRedemption({
    policy: snapshot.loyaltyPolicy,
    requestedPoints: input.redemptionPoints,
    availablePoints: snapshot.availablePoints,
    postPromotionMerchandiseMinor,
    currency: "USD",
  });
  if (
    !exactQuote.ok ||
    exactQuote.value.redemptionMinor !== input.redemptionMinor
  ) {
    return Object.freeze({ status: "conflict" });
  }

  const repository = repositoryInCurrentTransaction(client);
  try {
    const reservation = await repository.reserveRewardRedemption({
      id: keyedUuid("reward-redemption"),
      buyerUserId: input.buyerUserId,
      orderId: input.orderId,
      checkoutAttemptId: input.checkoutAttemptId,
      loyaltyPolicyId: input.loyaltyPolicyId,
      loyaltyPolicyVersion: input.loyaltyPolicyVersion,
      idempotencyKey: input.idempotencyKey,
      points: input.redemptionPoints,
      amountMinor: input.redemptionMinor,
      currency: "USD",
      reservedAt: input.reservedAt,
    });
    const ledger = await repository.appendRewardLedger({
      entryId: keyedUuid("reward-ledger:redemption-reserved"),
      rewardAccountId: input.rewardAccountId,
      buyerUserId: input.buyerUserId,
      kind: "redemption_reserved",
      sourceType: "checkout_attempt",
      sourceId: input.checkoutAttemptId,
      idempotencyKey: `reward-redemption-reserved:${input.checkoutAttemptId}`,
      pendingPointsDelta: 0,
      availablePointsDelta: -input.redemptionPoints,
      occurredAt: input.reservedAt,
    });
    return Object.freeze({
      status:
        reservation.status === "idempotent" && ledger.status === "idempotent"
          ? "idempotent"
          : "reserved",
    });
  } catch (error) {
    if (error instanceof GrowthPersistenceConflict) {
      return Object.freeze({ status: "conflict" });
    }
    throw error;
  }
}

export type CheckoutRewardReleaseResult =
  | "not_reserved"
  | "released"
  | "idempotent"
  | "conflict";

export async function releaseCheckoutRewardsInTransaction(
  client: RewardsSqlClient,
  input: Readonly<{
    buyerUserId: string;
    orderId: string;
    checkoutAttemptId: string;
    releasedAt: Date;
  }>,
  keyedUuid: KeyedUuidGenerator,
): Promise<CheckoutRewardReleaseResult> {
  type RedemptionRow = {
    id: string;
    buyerUserId: string;
    orderId: string;
    state: "reserved" | "consumed" | "released";
    points: number | string;
  };
  const loaded = await client.query<RedemptionRow>(
    `SELECT id::text AS id, buyer_user_id::text AS "buyerUserId",
            order_id::text AS "orderId", state, points
     FROM reward_redemptions
     WHERE checkout_attempt_id = $1::uuid FOR UPDATE`,
    [input.checkoutAttemptId],
  );
  if (loaded.rows.length === 0) return "not_reserved";
  if (loaded.rows.length !== 1) return "conflict";
  const redemption = loaded.rows[0]!;
  if (
    redemption.buyerUserId !== input.buyerUserId ||
    redemption.orderId !== input.orderId
  ) {
    return "conflict";
  }
  if (redemption.state === "consumed") return "conflict";
  if (redemption.state === "released") return "idempotent";

  const account = await client.query<{ id: string }>(
    `SELECT id::text AS id FROM reward_accounts
     WHERE buyer_user_id = $1::uuid FOR UPDATE`,
    [input.buyerUserId],
  );
  if (account.rows.length !== 1) return "conflict";
  const updated = await client.query<{ id: string }>(
    `UPDATE reward_redemptions SET state = 'released', released_at = $2::timestamptz
     WHERE id = $1::uuid AND state = 'reserved' RETURNING id::text AS id`,
    [redemption.id, input.releasedAt.toISOString()],
  );
  if (updated.rows.length !== 1) return "conflict";
  const points = safeInteger(redemption.points);
  try {
    await repositoryInCurrentTransaction(client).appendRewardLedger({
      entryId: keyedUuid(`reward-ledger:redemption-released:${redemption.id}`),
      rewardAccountId: account.rows[0]!.id,
      buyerUserId: input.buyerUserId,
      kind: "redemption_released",
      sourceType: "reward_redemption",
      sourceId: redemption.id,
      idempotencyKey: `reward-redemption-released:${redemption.id}`,
      pendingPointsDelta: 0,
      availablePointsDelta: points,
      occurredAt: input.releasedAt,
    });
  } catch (error) {
    if (error instanceof GrowthPersistenceConflict) return "conflict";
    throw error;
  }
  return "released";
}

export function createPostgresRewardsCheckoutAtomicPort(dependencies: Readonly<{
  client: RewardsSqlClient;
  runSerializableTransaction: GrowthTransactionRunner;
  keyedUuid: KeyedUuidGenerator;
}>): RewardsCheckoutAtomicPort {
  return Object.freeze({
    loadCheckoutRewards(input) {
      return loadCheckoutRewardsFromClient(dependencies.client, {
        ...input,
        lockAccount: false,
      });
    },
    reserveCheckoutRewards(input) {
      const scopedUuid: KeyedUuidGenerator = (label) =>
        dependencies.keyedUuid(
          `${input.buyerUserId}:${input.idempotencyKey}:${label}`,
        );
      return dependencies.runSerializableTransaction(
        (client) => reserveCheckoutRewardsInTransaction(client, input, scopedUuid),
        { isolationLevel: "serializable" },
      );
    },
  });
}

export type RewardsLifecycleResult = Readonly<{
  status: "applied" | "idempotent";
}>;

async function reconcileVerifiedPaymentInTransaction(
  client: RewardsSqlClient,
  input: Readonly<{
    paymentEventId: string;
    orderId: string;
    occurredAt: Date;
    now: Date;
  }>,
  keyedUuid: KeyedUuidGenerator,
): Promise<RewardsLifecycleResult> {
  const order = await client.query<{ buyerUserId: string; currency: string }>(
    `SELECT buyer_user_id::text AS "buyerUserId", currency
     FROM orders WHERE id = $1::uuid FOR UPDATE`,
    [input.orderId],
  );
  if (order.rows.length !== 1 || order.rows[0]!.currency !== "USD") {
    throw new Error("Verified reward order is unavailable");
  }
  const buyerUserId = order.rows[0]!.buyerUserId;
  const redemption = await client.query<{
    id: string;
    state: "reserved" | "consumed" | "released";
    loyaltyPolicyId: string;
    loyaltyPolicyVersion: number | string;
  }>(
    `SELECT id::text AS id, state,
            loyalty_policy_id::text AS "loyaltyPolicyId",
            loyalty_policy_version AS "loyaltyPolicyVersion"
     FROM reward_redemptions WHERE order_id = $1::uuid FOR UPDATE`,
    [input.orderId],
  );

  let rewardAccountId: string;
  let loyaltyPolicy: LoyaltyPolicy;
  if (redemption.rows.length === 1) {
    if (redemption.rows[0]!.state === "released") {
      throw new Error("Verified payment conflicts with released points");
    }
    const account = await client.query<RewardAccountRow>(
      `SELECT id::text AS id, available_points AS "availablePoints"
       FROM reward_accounts WHERE buyer_user_id = $1::uuid FOR UPDATE`,
      [buyerUserId],
    );
    if (account.rows.length !== 1) throw new Error("Reward account is unavailable");
    rewardAccountId = account.rows[0]!.id;
    const policy = await client.query<{
      id: string;
      version: number | string;
      pointsPerDollar: number | string;
      redemptionMinorPerPoint: number | string;
      minimumRedemptionPoints: number | string;
      maximumRedemptionBasisPoints: number | string;
      expiresAfterDays: number | string | null;
      effectiveAt: Date | string;
    }>(
      `SELECT id::text AS id, version,
              points_per_dollar AS "pointsPerDollar",
              redemption_minor_per_point AS "redemptionMinorPerPoint",
              minimum_redemption_points AS "minimumRedemptionPoints",
              maximum_redemption_basis_points AS "maximumRedemptionBasisPoints",
              expires_after_days AS "expiresAfterDays",
              effective_at AS "effectiveAt"
       FROM loyalty_policies WHERE id = $1::uuid AND version = $2`,
      [
        redemption.rows[0]!.loyaltyPolicyId,
        safeInteger(redemption.rows[0]!.loyaltyPolicyVersion),
      ],
    );
    if (policy.rows.length !== 1) throw new Error("Checkout reward policy is unavailable");
    const row = policy.rows[0]!;
    const parsed = parseLoyaltyPolicy({
      id: row.id,
      version: safeInteger(row.version),
      status: "active",
      pointsPerDollar: safeInteger(row.pointsPerDollar),
      redemptionMinorPerPoint: safeInteger(row.redemptionMinorPerPoint),
      minimumRedemptionPoints: safeInteger(row.minimumRedemptionPoints),
      maximumRedemptionBasisPoints: safeInteger(row.maximumRedemptionBasisPoints),
      expiresAfterDays:
        row.expiresAfterDays === null ? null : safeInteger(row.expiresAfterDays),
      effectiveAt: new Date(row.effectiveAt).toISOString(),
      supersededAt: null,
    });
    if (!parsed.ok) throw new Error("Checkout reward policy is corrupt");
    loyaltyPolicy = parsed.value;
  } else if (redemption.rows.length === 0) {
    const snapshot = await loadCheckoutRewardsFromClient(client, {
      buyerUserId,
      now: input.now,
      lockAccount: true,
    });
    if (snapshot.status !== "available") {
      if (snapshot.reason !== "negative_balance") {
        return Object.freeze({ status: "idempotent" });
      }
      const policy = await loadCurrentLoyaltyPolicy(client, input.now);
      const terms = await loadCurrentGrowthTerms(
        client,
        "customer_rewards_referrals",
        input.now,
      );
      const acceptance = await client.query<{ id: string }>(
        `SELECT id::text AS id FROM growth_terms_acceptances
         WHERE user_id = $1::uuid
           AND program = 'customer_rewards_referrals'
           AND terms_version_id = $2::uuid AND content_hash = $3
           AND accepted_at <= $4::timestamptz
         FOR UPDATE`,
        [buyerUserId, terms.id, terms.contentHash, input.now.toISOString()],
      );
      if (acceptance.rows.length !== 1) return Object.freeze({ status: "idempotent" });
      const account = await client.query<RewardAccountRow>(
        `SELECT id::text AS id, available_points AS "availablePoints"
         FROM reward_accounts WHERE buyer_user_id = $1::uuid FOR UPDATE`,
        [buyerUserId],
      );
      if (account.rows.length !== 1) return Object.freeze({ status: "idempotent" });
      rewardAccountId = account.rows[0]!.id;
      loyaltyPolicy = policy;
    } else {
      rewardAccountId = snapshot.rewardAccountId;
      loyaltyPolicy = snapshot.loyaltyPolicy;
    }
  } else {
    throw new Error("Duplicate order reward redemption");
  }

  const merchandise = await client.query<{ amountMinor: number | string }>(
    `SELECT COALESCE(sum(total_minor), 0) AS "amountMinor"
     FROM order_items WHERE order_id = $1::uuid`,
    [input.orderId],
  );
  const earned = calculateEarnedPoints({
    policy: loyaltyPolicy,
    merchandiseSubtotalMinor: safeInteger(merchandise.rows[0]?.amountMinor ?? 0),
    promotionDiscountMinor: 0,
    referralDiscountMinor: 0,
    redeemedPoints: 0,
    taxMinor: 0,
    shippingMinor: 0,
  });
  if (!earned.ok) throw new Error("Verified reward earn calculation failed");

  let applied = false;
  if (redemption.rows[0]?.state === "reserved") {
    const consumed = await client.query<{ id: string }>(
      `UPDATE reward_redemptions SET state = 'consumed', consumed_at = $2::timestamptz
       WHERE id = $1::uuid AND state = 'reserved' RETURNING id::text AS id`,
      [redemption.rows[0].id, input.occurredAt.toISOString()],
    );
    if (consumed.rows.length !== 1) throw new Error("Reward redemption consume conflict");
    applied = true;
  }
  if (earned.value.earnedPoints > 0) {
    const ledger = await repositoryInCurrentTransaction(client).appendRewardLedger({
      entryId: keyedUuid(`reward-ledger:order-earned-pending:${input.paymentEventId}`),
      rewardAccountId,
      buyerUserId,
      kind: "order_earned_pending",
      sourceType: "payment_event",
      sourceId: input.paymentEventId,
      idempotencyKey: `reward-order-earned-pending:${input.paymentEventId}`,
      pendingPointsDelta: earned.value.earnedPoints,
      availablePointsDelta: 0,
      occurredAt: input.occurredAt,
    });
    applied ||= ledger.status === "applied";
  }
  return Object.freeze({ status: applied ? "applied" : "idempotent" });
}

async function reconcileReferralPaymentInTransaction(
  client: RewardsSqlClient,
  input: Readonly<{
    paymentEventId: string;
    orderId: string;
    occurredAt: Date;
  }>,
  keyedUuid: KeyedUuidGenerator,
): Promise<RewardsLifecycleResult> {
  const conversion = await client.query<{
    id: string;
    idempotencyKey: string;
    referrerUserId: string;
    rewardPoints: number | string;
  }>(
    `SELECT rc.id::text AS id, rc.idempotency_key AS "idempotencyKey",
            ra.referrer_user_id::text AS "referrerUserId",
            rc.referrer_reward_points AS "rewardPoints"
     FROM referral_conversions rc
     JOIN referral_attributions ra ON ra.id = rc.referral_attribution_id
     JOIN order_growth_attributions oga
       ON oga.order_id = rc.first_order_id
      AND oga.program = 'customer_referral'
      AND oga.referral_attribution_id = rc.referral_attribution_id
      AND oga.referral_policy_id = rc.referral_policy_id
      AND oga.referral_policy_version = rc.referral_policy_version
     WHERE rc.first_order_id = $1::uuid
     FOR UPDATE OF rc, ra, oga`,
    [input.orderId],
  );
  if (conversion.rows.length === 0) {
    return Object.freeze({ status: "idempotent" });
  }
  if (conversion.rows.length !== 1) {
    throw new Error("Referral payment conversion is incoherent");
  }
  const row = conversion.rows[0]!;
  const points = safeInteger(row.rewardPoints);
  let applied = false;
  if (points > 0) {
    const ledger = await repositoryInCurrentTransaction(client).appendRewardLedger({
      entryId: keyedUuid(`reward-ledger:referral-earned-pending:${row.id}`),
      rewardAccountId: keyedUuid(`reward-account:${row.referrerUserId}`),
      buyerUserId: row.referrerUserId,
      kind: "referral_earned_pending",
      sourceType: "referral_conversion",
      sourceId: row.id,
      idempotencyKey: `reward-referral-earned-pending:${row.id}`,
      pendingPointsDelta: points,
      availablePointsDelta: 0,
      occurredAt: input.occurredAt,
    });
    applied = ledger.status === "applied";
  }
  const qualified = await repositoryInCurrentTransaction(client)
    .qualifyReferralConversion({
      conversionId: row.id,
      idempotencyKey: row.idempotencyKey,
      qualifiedAt: input.occurredAt,
    });
  applied ||= qualified.status === "applied";
  return Object.freeze({ status: applied ? "applied" : "idempotent" });
}

async function reconcileReferralDeliveryInTransaction(
  client: RewardsSqlClient,
  input: Readonly<{ orderId: string; deliveredAt: Date }>,
  keyedUuid: KeyedUuidGenerator,
): Promise<RewardsLifecycleResult> {
  const pending = await client.query<{
    conversionId: string;
    rewardAccountId: string;
    referrerUserId: string;
    earnedPoints: number | string;
  }>(
    `SELECT rc.id::text AS "conversionId",
            le.reward_account_id::text AS "rewardAccountId",
            le.buyer_user_id::text AS "referrerUserId",
            le.pending_points_delta AS "earnedPoints"
     FROM referral_conversions rc
     JOIN reward_ledger_entries le
       ON le.source_id = rc.id::text
      AND le.source_type = 'referral_conversion'
      AND le.kind = 'referral_earned_pending'
     WHERE rc.first_order_id = $1::uuid AND rc.status = 'qualified'
     FOR UPDATE OF rc, le`,
    [input.orderId],
  );
  if (pending.rows.length === 0) return Object.freeze({ status: "idempotent" });
  if (pending.rows.length !== 1) {
    throw new Error("Referral pending reward is incoherent");
  }
  const row = pending.rows[0]!;
  const reversed = await client.query<{ points: number | string }>(
    `SELECT COALESCE(-sum(pending_points_delta), 0) AS points
     FROM reward_ledger_entries
     WHERE reward_account_id = $1::uuid
       AND source_type = 'referral_payment_event'
       AND kind IN ('refund_reversal', 'chargeback_reversal')
       AND source_id IN (
         SELECT id::text FROM payment_events WHERE order_id = $2::uuid
       )`,
    [row.rewardAccountId, input.orderId],
  );
  const remaining = safeInteger(row.earnedPoints) -
    safeInteger(reversed.rows[0]?.points ?? 0);
  if (remaining < 0) throw new Error("Referral reversal exceeds pending reward");
  if (remaining === 0) return Object.freeze({ status: "idempotent" });
  const ledger = await repositoryInCurrentTransaction(client).appendRewardLedger({
    entryId: keyedUuid(`reward-ledger:referral-earned-available:${row.conversionId}`),
    rewardAccountId: row.rewardAccountId,
    buyerUserId: row.referrerUserId,
    kind: "referral_earned_available",
    sourceType: "referral_conversion",
    sourceId: row.conversionId,
    idempotencyKey: `reward-referral-earned-available:${row.conversionId}`,
    pendingPointsDelta: -remaining,
    availablePointsDelta: remaining,
    occurredAt: input.deliveredAt,
  });
  return Object.freeze({
    status: ledger.status === "applied" ? "applied" : "idempotent",
  });
}

function combineLifecycleResults(
  ...results: readonly RewardsLifecycleResult[]
): RewardsLifecycleResult {
  return Object.freeze({
    status: results.some((result) => result.status === "applied")
      ? "applied"
      : "idempotent",
  });
}

async function reconcileEarnReversalInTransaction(
  client: RewardsSqlClient,
  input: Readonly<{
    paymentEventId: string;
    orderId: string;
    eventType: "refund_verified" | "dispute_recorded";
    occurredAt: Date;
  }>,
  keyedUuid: KeyedUuidGenerator,
): Promise<RewardsLifecycleResult> {
  const base = await client.query<{
    rewardAccountId: string;
    buyerUserId: string;
    earnedPoints: number | string;
  }>(
    `SELECT reward_account_id::text AS "rewardAccountId",
            buyer_user_id::text AS "buyerUserId",
            pending_points_delta AS "earnedPoints"
     FROM reward_ledger_entries
     WHERE kind = 'order_earned_pending'
       AND source_id IN (
         SELECT id::text FROM payment_events
         WHERE order_id = $1::uuid AND event_type = 'payment_verified'
       )
     FOR UPDATE`,
    [input.orderId],
  );
  if (base.rows.length === 0) return Object.freeze({ status: "idempotent" });
  if (base.rows.length !== 1) throw new Error("Order earn ledger is incoherent");
  const earnedPoints = safeInteger(base.rows[0]!.earnedPoints);
  const merchandise = await client.query<{ amountMinor: number | string }>(
    `SELECT COALESCE(sum(total_minor), 0) AS "amountMinor"
     FROM order_items WHERE order_id = $1::uuid`,
    [input.orderId],
  );
  const eligibleMinor = safeInteger(merchandise.rows[0]?.amountMinor ?? 0);
  if (eligibleMinor <= 0) return Object.freeze({ status: "idempotent" });
  const financial = await client.query<{
    refundedMinor: number | string;
    disputedMinor: number | string;
  }>(
    `SELECT
       COALESCE(sum(amount_minor) FILTER (WHERE event_type = 'refund_verified'), 0)
         AS "refundedMinor",
       COALESCE(max(amount_minor) FILTER (WHERE event_type = 'dispute_recorded'), 0)
         AS "disputedMinor"
     FROM payment_events WHERE order_id = $1::uuid`,
    [input.orderId],
  );
  const cumulativeLoss = Math.min(
    eligibleMinor,
    Math.max(
      safeInteger(financial.rows[0]?.refundedMinor ?? 0),
      safeInteger(financial.rows[0]?.disputedMinor ?? 0),
    ),
  );
  const targetReversal = Math.floor((earnedPoints * cumulativeLoss) / eligibleMinor);
  const prior = await client.query<{ reversedPoints: number | string }>(
    `SELECT COALESCE(-sum(pending_points_delta + available_points_delta), 0)
              AS "reversedPoints"
     FROM reward_ledger_entries
     WHERE reward_account_id = $1::uuid
       AND kind IN ('refund_reversal', 'chargeback_reversal')
       AND source_id IN (
         SELECT id::text FROM payment_events WHERE order_id = $2::uuid
       )`,
    [base.rows[0]!.rewardAccountId, input.orderId],
  );
  const incremental = targetReversal - safeInteger(prior.rows[0]?.reversedPoints ?? 0);
  if (incremental <= 0) return Object.freeze({ status: "idempotent" });
  const delivered = await client.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM reward_ledger_entries
       WHERE kind = 'order_earned_available'
         AND source_id = $1
     ) AS exists`,
    [input.orderId],
  );
  const isDelivered = delivered.rows[0]?.exists === true;
  const kind = input.eventType === "refund_verified"
    ? "refund_reversal" as const
    : "chargeback_reversal" as const;
  const ledger = await repositoryInCurrentTransaction(client).appendRewardLedger({
    entryId: keyedUuid(`reward-ledger:${kind}:${input.paymentEventId}`),
    rewardAccountId: base.rows[0]!.rewardAccountId,
    buyerUserId: base.rows[0]!.buyerUserId,
    kind,
    sourceType: "payment_event",
    sourceId: input.paymentEventId,
    idempotencyKey: `reward-${kind}:${input.paymentEventId}`,
    pendingPointsDelta: isDelivered ? 0 : -incremental,
    availablePointsDelta: isDelivered ? -incremental : 0,
    occurredAt: input.occurredAt,
  });
  return Object.freeze({ status: ledger.status === "applied" ? "applied" : "idempotent" });
}

async function reconcileReferralReversalInTransaction(
  client: RewardsSqlClient,
  input: Readonly<{
    paymentEventId: string;
    orderId: string;
    eventType: "refund_verified" | "dispute_recorded";
    occurredAt: Date;
  }>,
  keyedUuid: KeyedUuidGenerator,
): Promise<RewardsLifecycleResult> {
  const conversion = await client.query<{
    id: string;
    idempotencyKey: string;
    referrerUserId: string;
    rewardAccountId: string;
    rewardPoints: number | string;
    status: "qualified" | "reversed";
  }>(
    `SELECT rc.id::text AS id, rc.idempotency_key AS "idempotencyKey",
            ra.referrer_user_id::text AS "referrerUserId",
            acc.id::text AS "rewardAccountId",
            rc.referrer_reward_points AS "rewardPoints", rc.status
     FROM referral_conversions rc
     JOIN referral_attributions ra ON ra.id = rc.referral_attribution_id
     JOIN reward_accounts acc ON acc.buyer_user_id = ra.referrer_user_id
     WHERE rc.first_order_id = $1::uuid AND rc.status IN ('qualified', 'reversed')
     FOR UPDATE OF rc, ra, acc`,
    [input.orderId],
  );
  if (conversion.rows.length === 0) return Object.freeze({ status: "idempotent" });
  if (conversion.rows.length !== 1) {
    throw new Error("Referral reversal conversion is incoherent");
  }
  const row = conversion.rows[0]!;
  const rewardPoints = safeInteger(row.rewardPoints);
  if (rewardPoints === 0) {
    return Object.freeze({ status: "idempotent" });
  }
  const merchandise = await client.query<{ amountMinor: number | string }>(
    `SELECT COALESCE(sum(total_minor), 0) AS "amountMinor"
     FROM order_items WHERE order_id = $1::uuid`,
    [input.orderId],
  );
  const eligibleMinor = safeInteger(merchandise.rows[0]?.amountMinor ?? 0);
  if (eligibleMinor <= 0) return Object.freeze({ status: "idempotent" });
  const financial = await client.query<{
    refundedMinor: number | string;
    disputedMinor: number | string;
  }>(
    `SELECT
       COALESCE(sum(amount_minor) FILTER (WHERE event_type = 'refund_verified'), 0)
         AS "refundedMinor",
       COALESCE(max(amount_minor) FILTER (WHERE event_type = 'dispute_recorded'), 0)
         AS "disputedMinor"
     FROM payment_events WHERE order_id = $1::uuid`,
    [input.orderId],
  );
  const cumulativeLoss = Math.min(
    eligibleMinor,
    Math.max(
      safeInteger(financial.rows[0]?.refundedMinor ?? 0),
      safeInteger(financial.rows[0]?.disputedMinor ?? 0),
    ),
  );
  const target = Math.floor((rewardPoints * cumulativeLoss) / eligibleMinor);
  const prior = await client.query<{ points: number | string }>(
    `SELECT COALESCE(-sum(pending_points_delta + available_points_delta), 0)
              AS points
     FROM reward_ledger_entries
     WHERE reward_account_id = $1::uuid
       AND source_type = 'referral_payment_event'
       AND kind IN ('refund_reversal', 'chargeback_reversal')
       AND source_id IN (
         SELECT id::text FROM payment_events WHERE order_id = $2::uuid
       )`,
    [row.rewardAccountId, input.orderId],
  );
  const reversedPoints = safeInteger(prior.rows[0]?.points ?? 0);
  if (row.status === "reversed") {
    if (target !== rewardPoints || reversedPoints !== rewardPoints) {
      throw new Error("Reversed referral conversion is incoherent");
    }
    return Object.freeze({ status: "idempotent" });
  }
  const incremental = target - reversedPoints;
  let applied = false;
  if (incremental > 0) {
    const delivered = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM reward_ledger_entries
         WHERE kind = 'referral_earned_available'
           AND source_type = 'referral_conversion' AND source_id = $1
       ) AS exists`,
      [row.id],
    );
    const isDelivered = delivered.rows[0]?.exists === true;
    const kind = input.eventType === "refund_verified"
      ? "refund_reversal" as const
      : "chargeback_reversal" as const;
    const ledger = await repositoryInCurrentTransaction(client).appendRewardLedger({
      entryId: keyedUuid(`reward-ledger:referral-${kind}:${input.paymentEventId}`),
      rewardAccountId: row.rewardAccountId,
      buyerUserId: row.referrerUserId,
      kind,
      sourceType: "referral_payment_event",
      sourceId: input.paymentEventId,
      idempotencyKey: `reward-referral-${kind}:${input.paymentEventId}`,
      pendingPointsDelta: isDelivered ? 0 : -incremental,
      availablePointsDelta: isDelivered ? -incremental : 0,
      occurredAt: input.occurredAt,
    });
    applied = ledger.status === "applied";
  }
  if (target === rewardPoints) {
    const reversed = await repositoryInCurrentTransaction(client)
      .reverseReferralConversion({
        conversionId: row.id,
        idempotencyKey: row.idempotencyKey,
        reversedAt: input.occurredAt,
      });
    applied ||= reversed.status === "applied";
  }
  return Object.freeze({ status: applied ? "applied" : "idempotent" });
}

async function reconcileFailedPaymentInTransaction(
  client: RewardsSqlClient,
  input: Readonly<{ orderId: string; occurredAt: Date }>,
  keyedUuid: KeyedUuidGenerator,
): Promise<RewardsLifecycleResult> {
  const order = await client.query<{ buyerUserId: string; attemptId: string }>(
    `SELECT o.buyer_user_id::text AS "buyerUserId",
            a.id::text AS "attemptId"
     FROM orders o
     JOIN checkout_attempts a ON a.order_id = o.id
     WHERE o.id = $1::uuid FOR UPDATE OF o, a`,
    [input.orderId],
  );
  if (order.rows.length !== 1) throw new Error("Failed reward checkout is unavailable");
  const released = await releaseCheckoutRewardsInTransaction(
    client,
    {
      buyerUserId: order.rows[0]!.buyerUserId,
      orderId: input.orderId,
      checkoutAttemptId: order.rows[0]!.attemptId,
      releasedAt: input.occurredAt,
    },
    keyedUuid,
  );
  if (released === "conflict") throw new Error("Failed reward release conflicts");
  return Object.freeze({
    status: released === "released" ? "applied" : "idempotent",
  });
}

export function createPostgresRewardsLifecycleService(dependencies: Readonly<{
  client: RewardsSqlClient;
  runSerializableTransaction: GrowthTransactionRunner;
  keyedUuid: KeyedUuidGenerator;
}>) {
  return Object.freeze({
    reconcileProcessedProviderEvent(input: Readonly<{
      provider: "stripe";
      providerEventId: string;
      now: Date;
    }>): Promise<RewardsLifecycleResult> {
      return dependencies.runSerializableTransaction(async (client) => {
        const providerEvent = await client.query<{ id: string; status: string }>(
          `SELECT id::text AS id, status FROM provider_events
           WHERE provider = $1 AND provider_event_id = $2 FOR UPDATE`,
          [input.provider, input.providerEventId],
        );
        if (providerEvent.rows.length !== 1 || providerEvent.rows[0]!.status !== "processed") {
          throw new Error("Provider reward event is not processed");
        }
        const payments = await client.query<{
          id: string;
          orderId: string;
          eventType: string;
          occurredAt: Date | string;
        }>(
          `SELECT id::text AS id, order_id::text AS "orderId",
                  event_type AS "eventType", occurred_at AS "occurredAt"
           FROM payment_events WHERE provider_event_id = $1::uuid
           ORDER BY id FOR UPDATE`,
          [providerEvent.rows[0]!.id],
        );
        if (payments.rows.length === 0) return Object.freeze({ status: "idempotent" });
        if (payments.rows.length !== 1) throw new Error("Provider reward journal is incoherent");
        const payment = payments.rows[0]!;
        const occurredAt = new Date(payment.occurredAt);
        if (payment.eventType === "payment_verified") {
          const base = await reconcileVerifiedPaymentInTransaction(client, {
            paymentEventId: payment.id,
            orderId: payment.orderId,
            occurredAt,
            now: input.now,
          }, dependencies.keyedUuid);
          const referral = await reconcileReferralPaymentInTransaction(client, {
            paymentEventId: payment.id,
            orderId: payment.orderId,
            occurredAt,
          }, dependencies.keyedUuid);
          return combineLifecycleResults(base, referral);
        }
        if (payment.eventType === "payment_failed") {
          return reconcileFailedPaymentInTransaction(client, {
            orderId: payment.orderId,
            occurredAt,
          }, dependencies.keyedUuid);
        }
        if (
          payment.eventType === "refund_verified" ||
          payment.eventType === "dispute_recorded"
        ) {
          const base = await reconcileEarnReversalInTransaction(client, {
            paymentEventId: payment.id,
            orderId: payment.orderId,
            eventType: payment.eventType,
            occurredAt,
          }, dependencies.keyedUuid);
          const referral = await reconcileReferralReversalInTransaction(client, {
            paymentEventId: payment.id,
            orderId: payment.orderId,
            eventType: payment.eventType,
            occurredAt,
          }, dependencies.keyedUuid);
          return combineLifecycleResults(base, referral);
        }
        return Object.freeze({ status: "idempotent" });
      }, { isolationLevel: "serializable" });
    },

    reconcileDeliveredOrder(input: Readonly<{
      orderId: string;
      now: Date;
    }>): Promise<RewardsLifecycleResult> {
      return dependencies.runSerializableTransaction(async (client) => {
        const shipment = await client.query<{ deliveredAt: Date | string }>(
          `SELECT delivered_at AS "deliveredAt" FROM shipments
           WHERE order_id = $1::uuid AND state = 'delivered' FOR UPDATE`,
          [input.orderId],
        );
        if (shipment.rows.length !== 1) throw new Error("Reward delivery is not verified");
        const deliveredAt = new Date(shipment.rows[0]!.deliveredAt);
        const referral = await reconcileReferralDeliveryInTransaction(client, {
          orderId: input.orderId,
          deliveredAt,
        }, dependencies.keyedUuid);
        const pending = await client.query<{
          rewardAccountId: string;
          buyerUserId: string;
          earnedPoints: number | string;
        }>(
          `SELECT reward_account_id::text AS "rewardAccountId",
                  buyer_user_id::text AS "buyerUserId",
                  pending_points_delta AS "earnedPoints"
           FROM reward_ledger_entries
           WHERE kind = 'order_earned_pending'
             AND source_id IN (
               SELECT id::text FROM payment_events
               WHERE order_id = $1::uuid AND event_type = 'payment_verified'
             ) FOR UPDATE`,
          [input.orderId],
        );
        if (pending.rows.length === 0) return referral;
        if (pending.rows.length !== 1) throw new Error("Reward pending earn is incoherent");
        const earnedPoints = safeInteger(pending.rows[0]!.earnedPoints);
        const reversed = await client.query<{ reversedPoints: number | string }>(
          `SELECT COALESCE(-sum(pending_points_delta), 0) AS "reversedPoints"
           FROM reward_ledger_entries
           WHERE reward_account_id = $1::uuid
             AND kind IN ('refund_reversal', 'chargeback_reversal')
             AND source_id IN (
               SELECT id::text FROM payment_events WHERE order_id = $2::uuid
             )`,
          [pending.rows[0]!.rewardAccountId, input.orderId],
        );
        const remainingPoints =
          earnedPoints - safeInteger(reversed.rows[0]?.reversedPoints ?? 0);
        if (remainingPoints < 0) throw new Error("Reward reversal exceeds pending earn");
        if (remainingPoints === 0) return referral;
        const ledger = await repositoryInCurrentTransaction(client).appendRewardLedger({
          entryId: dependencies.keyedUuid(`reward-ledger:order-earned-available:${input.orderId}`),
          rewardAccountId: pending.rows[0]!.rewardAccountId,
          buyerUserId: pending.rows[0]!.buyerUserId,
          kind: "order_earned_available",
          sourceType: "shipment",
          sourceId: input.orderId,
          idempotencyKey: `reward-order-earned-available:${input.orderId}`,
          pendingPointsDelta: -remainingPoints,
          availablePointsDelta: remainingPoints,
          occurredAt: deliveredAt,
        });
        return combineLifecycleResults(referral, Object.freeze({
          status: ledger.status === "applied" ? "applied" : "idempotent",
        }));
      }, { isolationLevel: "serializable" });
    },
  });
}

export function createRewardsService(dependencies: Readonly<{
  atomicPort: RewardsCheckoutAtomicPort;
}>) {
  return Object.freeze({
    async quoteCheckoutRewards(input: Readonly<{
      buyerUserId: string;
      requestedPoints: number;
      postPromotionMerchandiseMinor: number;
      currency: "USD";
      now: Date;
    }>): Promise<CheckoutRewardsQuote> {
      if (
        !UUID_PATTERN.test(input.buyerUserId) ||
        !Number.isSafeInteger(input.requestedPoints) ||
        input.requestedPoints <= 0 ||
        !Number.isSafeInteger(input.postPromotionMerchandiseMinor) ||
        input.postPromotionMerchandiseMinor < 0 ||
        input.currency !== "USD" ||
        !Number.isFinite(input.now.getTime())
      ) {
        return unavailable("invalid_request");
      }
      const snapshot = await dependencies.atomicPort.loadCheckoutRewards({
        buyerUserId: input.buyerUserId,
        now: input.now,
      });
      if (snapshot.status === "unavailable") return unavailable(snapshot.reason);
      if (!validAvailableSnapshot(snapshot)) return unavailable("configuration_unavailable");

      const redemption = calculateRewardRedemption({
        policy: snapshot.loyaltyPolicy,
        requestedPoints: input.requestedPoints,
        availablePoints: snapshot.availablePoints,
        postPromotionMerchandiseMinor: input.postPromotionMerchandiseMinor,
        currency: input.currency,
      });
      if (!redemption.ok) {
        const reason = redemption.error.code;
        if (
          reason === "below_minimum" ||
          reason === "redemption_cap_exceeded" ||
          reason === "insufficient_balance" ||
          reason === "negative_balance"
        ) {
          return unavailable(reason);
        }
        return unavailable("configuration_unavailable");
      }
      const earned = calculateEarnedPoints({
        policy: snapshot.loyaltyPolicy,
        merchandiseSubtotalMinor: input.postPromotionMerchandiseMinor,
        promotionDiscountMinor: 0,
        referralDiscountMinor: 0,
        redeemedPoints: redemption.value.redemptionPoints,
        taxMinor: 0,
        shippingMinor: 0,
      });
      if (!earned.ok) return unavailable("configuration_unavailable");
      return Object.freeze({
        status: "applied" as const,
        rewardAccountId: snapshot.rewardAccountId,
        loyaltyPolicyId: snapshot.loyaltyPolicy.id,
        loyaltyPolicyVersion: snapshot.loyaltyPolicy.version,
        termsVersionId: snapshot.terms.id,
        termsContentHash: snapshot.terms.contentHash,
        redemptionPoints: redemption.value.redemptionPoints,
        redemptionMinor: redemption.value.redemptionMinor,
        maximumPoints: redemption.value.maximumPoints,
        eligibleMerchandiseMinor: earned.value.eligibleMerchandiseMinor,
        pendingBaseEarnPoints: earned.value.earnedPoints,
      });
    },

    async reserveCheckoutRewards(input: Readonly<{
      buyerUserId: string;
      orderId: string;
      checkoutAttemptId: string;
      idempotencyKey: string;
      quote: AppliedCheckoutRewards;
      reservedAt: Date;
    }>): Promise<RewardsCheckoutReservationResult> {
      if (
        !UUID_PATTERN.test(input.buyerUserId) ||
        !UUID_PATTERN.test(input.orderId) ||
        !UUID_PATTERN.test(input.checkoutAttemptId) ||
        input.idempotencyKey.trim() !== input.idempotencyKey ||
        input.idempotencyKey.length < 16 ||
        input.idempotencyKey.length > 200 ||
        input.quote.status !== "applied" ||
        !Number.isFinite(input.reservedAt.getTime())
      ) {
        return Object.freeze({ status: "conflict" as const });
      }
      return dependencies.atomicPort.reserveCheckoutRewards({
        buyerUserId: input.buyerUserId,
        rewardAccountId: input.quote.rewardAccountId,
        orderId: input.orderId,
        checkoutAttemptId: input.checkoutAttemptId,
        loyaltyPolicyId: input.quote.loyaltyPolicyId,
        loyaltyPolicyVersion: input.quote.loyaltyPolicyVersion,
        termsVersionId: input.quote.termsVersionId,
        termsContentHash: input.quote.termsContentHash,
        idempotencyKey: input.idempotencyKey,
        redemptionPoints: input.quote.redemptionPoints,
        redemptionMinor: input.quote.redemptionMinor,
        reservedAt: input.reservedAt,
      });
    },
  });
}
