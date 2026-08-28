import { createHash } from "node:crypto";

import { runSerializableWithRetry } from "@/db/serializable-retry";

export type GrowthSqlClient = Readonly<{
  query: <Row extends object>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<Readonly<{ rows: Row[] }>>;
}>;

export type GrowthTransactionRunner = <Value>(
  work: (client: GrowthSqlClient) => Promise<Value>,
  options: Readonly<{ isolationLevel: "serializable" }>,
) => Promise<Value>;

export type RewardLedgerKind =
  | "order_earned_pending"
  | "order_earned_available"
  | "referral_earned_pending"
  | "referral_earned_available"
  | "redemption_reserved"
  | "redemption_consumed"
  | "redemption_released"
  | "refund_reversal"
  | "chargeback_reversal"
  | "admin_adjustment";

export type RewardLedgerAppendInput = Readonly<{
  entryId: string;
  rewardAccountId: string;
  buyerUserId: string;
  kind: RewardLedgerKind;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  pendingPointsDelta: number;
  availablePointsDelta: number;
  occurredAt: Date;
}>;

export type RewardLedgerEntry = Readonly<{
  id: string;
  rewardAccountId: string;
  buyerUserId: string;
  kind: RewardLedgerKind;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  pendingPointsDelta: number;
  availablePointsDelta: number;
  pendingPointsBalanceAfter: number;
  availablePointsBalanceAfter: number;
  occurredAt: string;
}>;

export type RewardLedgerAppendResult = Readonly<{
  status: "applied" | "idempotent";
  entry: RewardLedgerEntry;
}>;

export type RewardRedemptionReservationInput = Readonly<{
  id: string;
  buyerUserId: string;
  orderId: string;
  checkoutAttemptId: string;
  loyaltyPolicyId: string;
  loyaltyPolicyVersion: number;
  idempotencyKey: string;
  points: number;
  amountMinor: number;
  currency: "USD";
  reservedAt: Date;
}>;

export type RewardRedemptionRecord = Readonly<{
  id: string;
  buyerUserId: string;
  orderId: string;
  checkoutAttemptId: string;
  loyaltyPolicyId: string;
  loyaltyPolicyVersion: number;
  idempotencyKey: string;
  points: number;
  amountMinor: number;
  currency: "USD";
  state: "reserved" | "consumed" | "released";
  reservedAt: string;
}>;

type PersistenceResult<Key extends string, Value> = Readonly<{
  status: "applied" | "idempotent";
}> & Readonly<Record<Key, Value>>;

export type ReferralConversionRecord = Readonly<{
  id: string;
  status: "pending" | "qualified" | "reversed";
  qualifiedAt: string | null;
  reversedAt: string | null;
}>;

export type SharedSetMutationRecord = Readonly<{
  code: string;
  label: string;
  active: boolean;
  itemCount: number;
  updatedAt: string;
}>;

export type AffiliateCommissionRecord = Readonly<{
  id: string;
  affiliateProfileId: string;
  affiliateAttributionId: string;
  buyerUserId: string;
  orderId: string;
  affiliatePolicyId: string;
  affiliatePolicyVersion: number;
  idempotencyKey: string;
  grossCommissionMinor: number;
  reversedCommissionMinor: number;
  status: "pending" | "approved" | "paid" | "reversed";
  updatedAt: string;
}>;

export class GrowthPersistenceConflict extends Error {
  readonly code = "growth_persistence_conflict";

  constructor(message = "Growth persistence payload conflict") {
    super(message);
    this.name = "GrowthPersistenceConflict";
  }
}

export type GrowthRepository = Readonly<{
  appendRewardLedger: (
    input: RewardLedgerAppendInput,
  ) => Promise<RewardLedgerAppendResult>;
  reserveRewardRedemption: (
    input: RewardRedemptionReservationInput,
  ) => Promise<PersistenceResult<"reservation", RewardRedemptionRecord>>;
  qualifyReferralConversion: (input: Readonly<{
    conversionId: string;
    idempotencyKey: string;
    qualifiedAt: Date;
  }>) => Promise<PersistenceResult<"conversion", ReferralConversionRecord>>;
  reverseReferralConversion: (input: Readonly<{
    conversionId: string;
    idempotencyKey: string;
    reversedAt: Date;
  }>) => Promise<PersistenceResult<"conversion", ReferralConversionRecord>>;
  replaceSharedResearchSet: (input: Readonly<{
    setId: string;
    ownerUserId: string;
    idempotencyKey: string;
    expectedUpdatedAt: Date;
    updatedAt: Date;
    label: string;
    items: readonly Readonly<{ productId: string; quantity: number }>[];
  }>) => Promise<PersistenceResult<"set", SharedSetMutationRecord>>;
  deactivateSharedResearchSet: (input: Readonly<{
    setId: string;
    ownerUserId: string;
    idempotencyKey: string;
    expectedUpdatedAt: Date;
    deactivatedAt: Date;
  }>) => Promise<PersistenceResult<"set", SharedSetMutationRecord>>;
  recordAffiliateCommission: (input: Readonly<{
    id: string;
    affiliateProfileId: string;
    affiliateAttributionId: string;
    buyerUserId: string;
    orderId: string;
    affiliatePolicyId: string;
    affiliatePolicyVersion: number;
    idempotencyKey: string;
    grossCommissionMinor: number;
    createdAt: Date;
  }>) => Promise<PersistenceResult<"commission", AffiliateCommissionRecord>>;
  reverseAffiliateCommission: (input: Readonly<{
    commissionId: string;
    idempotencyKey: string;
    reversedCommissionMinor: number;
    reversedAt: Date;
  }>) => Promise<PersistenceResult<"commission", AffiliateCommissionRecord>>;
  recordGrowthTermsAcceptance: (input: Readonly<{
    id: string;
    userId: string;
    program: "customer_rewards_referrals" | "affiliate";
    termsVersionId: string;
    contentHash: string;
    acceptedAt: Date;
  }>) => Promise<PersistenceResult<"acceptance", Readonly<{
    id: string; program: "customer_rewards_referrals" | "affiliate";
    termsVersionId: string; contentHash: string; acceptedAt: string;
  }>>>;
  recordReferralCode: (input: Readonly<{
    id: string; ownerUserId: string; code: string; createdAt: Date;
  }>) => Promise<PersistenceResult<"referralCode", Readonly<{
    code: string; status: "active" | "revoked"; createdAt: string;
  }>>>;
  createSharedResearchSet: (input: Readonly<{
    id: string; ownerUserId: string; publicCode: string; label: string;
    items: readonly Readonly<{ productId: string; quantity: number }>[];
    createdAt: Date;
  }>) => Promise<PersistenceResult<"set", SharedSetMutationRecord>>;
  recordAffiliateProfile: (input: Readonly<{
    id: string; userId: string; publicCode: string; publicChannel: string;
    promotionMethod: "website" | "social" | "email" | "other";
    termsAcceptanceId: string; createdAt: Date;
  }>) => Promise<PersistenceResult<"profile", Readonly<{
    publicCode: string; status: "pending" | "active" | "rejected" | "suspended";
    publicChannel: string; promotionMethod: "website" | "social" | "email" | "other";
    createdAt: string;
  }>>>;
}>;

type AccountRow = {
  id: string;
  buyerUserId: string;
  pendingPoints: number | string;
  availablePoints: number | string;
};

type LedgerRow = {
  id: string;
  rewardAccountId: string;
  buyerUserId: string;
  kind: RewardLedgerKind;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  pendingPointsDelta: number | string;
  availablePointsDelta: number | string;
  pendingPointsBalanceAfter: number | string;
  availablePointsBalanceAfter: number | string;
  occurredAt: Date | string;
};

type RedemptionRow = {
  id: string;
  buyerUserId: string;
  orderId: string;
  checkoutAttemptId: string;
  loyaltyPolicyId: string;
  loyaltyPolicyVersion: number | string;
  idempotencyKey: string;
  points: number | string;
  amountMinor: number | string;
  currency: "USD";
  state: "reserved" | "consumed" | "released";
  reservedAt: Date | string;
};

type ReferralConversionRow = {
  id: string;
  idempotencyKey: string;
  status: "pending" | "qualified" | "reversed";
  qualifiedAt: Date | string | null;
  reversedAt: Date | string | null;
};

type SharedSetRow = {
  code: string;
  label: string;
  active: boolean;
  updatedAt: Date | string;
  deactivatedAt: Date | string | null;
};

type SharedSetMutationReceiptRow = {
  idempotencyKey: string;
  sharedSetId: string;
  ownerUserId: string;
  kind: "replace" | "deactivate";
  expectedUpdatedAt: Date | string;
  payloadHash: string;
  resultPublicCode: string;
  resultLabel: string;
  resultActive: boolean;
  resultItemCount: number | string;
  resultUpdatedAt: Date | string;
  appliedAt: Date | string;
};

type CommissionRow = {
  id: string;
  affiliateProfileId: string;
  affiliateAttributionId: string;
  buyerUserId: string;
  orderId: string;
  affiliatePolicyId: string;
  affiliatePolicyVersion: number | string;
  idempotencyKey: string;
  grossCommissionMinor: number | string;
  reversedCommissionMinor: number | string;
  status: "pending" | "approved" | "paid" | "reversed";
  createdAt: Date | string;
  updatedAt: Date | string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ledgerKinds = new Set<RewardLedgerKind>([
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

function nonblank(value: string): boolean {
  return value.trim() === value && value.length > 0 && !/[\u0000-\u001f\u007f]/u.test(value);
}

function boundedOpaqueIdempotencyKey(value: string): boolean {
  return value.length >= 16 && value.length <= 200 && nonblank(value);
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeInteger(value: number | string): number {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) throw new GrowthPersistenceConflict("Unsafe growth integer");
  return numeric;
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new GrowthPersistenceConflict("Invalid growth timestamp");
  return date.toISOString();
}

function validateInput(input: RewardLedgerAppendInput): void {
  if (
    !uuidPattern.test(input.entryId) ||
    !uuidPattern.test(input.rewardAccountId) ||
    !uuidPattern.test(input.buyerUserId) ||
    !ledgerKinds.has(input.kind) ||
    !nonblank(input.sourceType) ||
    !nonblank(input.sourceId) ||
    !nonblank(input.idempotencyKey) ||
    !Number.isSafeInteger(input.pendingPointsDelta) ||
    !Number.isSafeInteger(input.availablePointsDelta) ||
    (input.pendingPointsDelta === 0 && input.availablePointsDelta === 0) ||
    !Number.isFinite(input.occurredAt.getTime())
  ) {
    throw new GrowthPersistenceConflict("Invalid reward ledger payload");
  }
}

function projectLedger(row: LedgerRow): RewardLedgerEntry {
  return Object.freeze({
    id: row.id,
    rewardAccountId: row.rewardAccountId,
    buyerUserId: row.buyerUserId,
    kind: row.kind,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    idempotencyKey: row.idempotencyKey,
    pendingPointsDelta: safeInteger(row.pendingPointsDelta),
    availablePointsDelta: safeInteger(row.availablePointsDelta),
    pendingPointsBalanceAfter: safeInteger(row.pendingPointsBalanceAfter),
    availablePointsBalanceAfter: safeInteger(row.availablePointsBalanceAfter),
    occurredAt: toIso(row.occurredAt),
  });
}

function exactPayload(entry: RewardLedgerEntry, input: RewardLedgerAppendInput): boolean {
  return (
    entry.id === input.entryId &&
    entry.rewardAccountId === input.rewardAccountId &&
    entry.buyerUserId === input.buyerUserId &&
    entry.kind === input.kind &&
    entry.sourceType === input.sourceType &&
    entry.sourceId === input.sourceId &&
    entry.idempotencyKey === input.idempotencyKey &&
    entry.pendingPointsDelta === input.pendingPointsDelta &&
    entry.availablePointsDelta === input.availablePointsDelta &&
    entry.occurredAt === input.occurredAt.toISOString()
  );
}

async function findLedgerByKey(
  client: GrowthSqlClient,
  idempotencyKey: string,
): Promise<RewardLedgerEntry | null> {
  const result = await client.query<LedgerRow>(
    `SELECT id::text AS id, reward_account_id::text AS "rewardAccountId",
            buyer_user_id::text AS "buyerUserId", kind,
            source_type AS "sourceType", source_id AS "sourceId",
            idempotency_key AS "idempotencyKey",
            pending_points_delta AS "pendingPointsDelta",
            available_points_delta AS "availablePointsDelta",
            pending_points_balance_after AS "pendingPointsBalanceAfter",
            available_points_balance_after AS "availablePointsBalanceAfter",
            occurred_at AS "occurredAt"
     FROM reward_ledger_entries
     WHERE idempotency_key = $1
     FOR UPDATE`,
    [idempotencyKey],
  );
  if (result.rows.length > 1) throw new GrowthPersistenceConflict("Duplicate reward ledger key");
  return result.rows[0] ? projectLedger(result.rows[0]) : null;
}

async function appendInTransaction(
  client: GrowthSqlClient,
  input: RewardLedgerAppendInput,
): Promise<RewardLedgerAppendResult> {
  validateInput(input);
  await client.query(
    `INSERT INTO reward_accounts (id, buyer_user_id, pending_points, available_points)
     VALUES ($1::uuid, $2::uuid, 0, 0)
     ON CONFLICT (buyer_user_id) DO NOTHING`,
    [input.rewardAccountId, input.buyerUserId],
  );
  const accountResult = await client.query<AccountRow>(
    `SELECT id::text AS id, buyer_user_id::text AS "buyerUserId",
            pending_points AS "pendingPoints", available_points AS "availablePoints"
     FROM reward_accounts WHERE buyer_user_id = $1::uuid FOR UPDATE`,
    [input.buyerUserId],
  );
  if (accountResult.rows.length !== 1) {
    throw new GrowthPersistenceConflict("Reward account projection is incoherent");
  }
  const account = accountResult.rows[0]!;
  if (account.id !== input.rewardAccountId || account.buyerUserId !== input.buyerUserId) {
    throw new GrowthPersistenceConflict("Reward account identity conflict");
  }

  const prior = await findLedgerByKey(client, input.idempotencyKey);
  if (prior !== null) {
    if (!exactPayload(prior, input)) throw new GrowthPersistenceConflict();
    return Object.freeze({ status: "idempotent", entry: prior });
  }

  const pendingBefore = safeInteger(account.pendingPoints);
  const availableBefore = safeInteger(account.availablePoints);
  const pendingAfter = pendingBefore + input.pendingPointsDelta;
  const availableAfter = availableBefore + input.availablePointsDelta;
  if (
    !Number.isSafeInteger(pendingAfter) ||
    !Number.isSafeInteger(availableAfter) ||
    pendingAfter < 0
  ) {
    throw new GrowthPersistenceConflict("Reward balance projection conflict");
  }

  const inserted = await client.query<LedgerRow>(
    `INSERT INTO reward_ledger_entries
       (id, reward_account_id, buyer_user_id, kind, source_type, source_id,
        idempotency_key, pending_points_delta, available_points_delta,
        pending_points_balance_after, available_points_balance_after, occurred_at)
     VALUES
       ($1::uuid, $2::uuid, $3::uuid, $4::reward_ledger_kind, $5, $6,
        $7, $8, $9, $10, $11, $12::timestamptz)
     ON CONFLICT DO NOTHING
     RETURNING id::text AS id, reward_account_id::text AS "rewardAccountId",
               buyer_user_id::text AS "buyerUserId", kind,
               source_type AS "sourceType", source_id AS "sourceId",
               idempotency_key AS "idempotencyKey",
               pending_points_delta AS "pendingPointsDelta",
               available_points_delta AS "availablePointsDelta",
               pending_points_balance_after AS "pendingPointsBalanceAfter",
               available_points_balance_after AS "availablePointsBalanceAfter",
               occurred_at AS "occurredAt"`,
    [
      input.entryId,
      input.rewardAccountId,
      input.buyerUserId,
      input.kind,
      input.sourceType,
      input.sourceId,
      input.idempotencyKey,
      input.pendingPointsDelta,
      input.availablePointsDelta,
      pendingAfter,
      availableAfter,
      input.occurredAt.toISOString(),
    ],
  );
  if (inserted.rows.length !== 1) {
    const collision = await findLedgerByKey(client, input.idempotencyKey);
    if (collision !== null && exactPayload(collision, input)) {
      return Object.freeze({ status: "idempotent", entry: collision });
    }
    throw new GrowthPersistenceConflict("Reward ledger uniqueness conflict");
  }
  const entry = projectLedger(inserted.rows[0]!);
  const projected = await client.query<AccountRow>(
    `UPDATE reward_accounts
     SET pending_points = $2, available_points = $3, updated_at = $4::timestamptz
     WHERE id = $1::uuid AND pending_points = $5 AND available_points = $6
     RETURNING id::text AS id, buyer_user_id::text AS "buyerUserId",
               pending_points AS "pendingPoints", available_points AS "availablePoints"`,
    [
      input.rewardAccountId,
      pendingAfter,
      availableAfter,
      input.occurredAt.toISOString(),
      pendingBefore,
      availableBefore,
    ],
  );
  if (projected.rows.length !== 1) {
    throw new GrowthPersistenceConflict("Reward account projection conflict");
  }
  return Object.freeze({ status: "applied", entry });
}

function projectRedemption(row: RedemptionRow): RewardRedemptionRecord {
  return Object.freeze({
    id: row.id,
    buyerUserId: row.buyerUserId,
    orderId: row.orderId,
    checkoutAttemptId: row.checkoutAttemptId,
    loyaltyPolicyId: row.loyaltyPolicyId,
    loyaltyPolicyVersion: safeInteger(row.loyaltyPolicyVersion),
    idempotencyKey: row.idempotencyKey,
    points: safeInteger(row.points),
    amountMinor: safeInteger(row.amountMinor),
    currency: row.currency,
    state: row.state,
    reservedAt: toIso(row.reservedAt),
  });
}

const redemptionProjection = `id::text AS id, buyer_user_id::text AS "buyerUserId",
  order_id::text AS "orderId", checkout_attempt_id::text AS "checkoutAttemptId",
  loyalty_policy_id::text AS "loyaltyPolicyId",
  loyalty_policy_version AS "loyaltyPolicyVersion",
  idempotency_key AS "idempotencyKey", points, amount_minor AS "amountMinor",
  currency, state, reserved_at AS "reservedAt"`;

function exactRedemption(
  record: RewardRedemptionRecord,
  input: RewardRedemptionReservationInput,
): boolean {
  return record.id === input.id &&
    record.buyerUserId === input.buyerUserId &&
    record.orderId === input.orderId &&
    record.checkoutAttemptId === input.checkoutAttemptId &&
    record.loyaltyPolicyId === input.loyaltyPolicyId &&
    record.loyaltyPolicyVersion === input.loyaltyPolicyVersion &&
    record.idempotencyKey === input.idempotencyKey &&
    record.points === input.points &&
    record.amountMinor === input.amountMinor &&
    record.currency === input.currency &&
    record.reservedAt === input.reservedAt.toISOString();
}

async function reserveRedemptionInTransaction(
  client: GrowthSqlClient,
  input: RewardRedemptionReservationInput,
): Promise<PersistenceResult<"reservation", RewardRedemptionRecord>> {
  if (
    [input.id, input.buyerUserId, input.orderId, input.checkoutAttemptId, input.loyaltyPolicyId]
      .some((value) => !uuidPattern.test(value)) ||
    !Number.isSafeInteger(input.loyaltyPolicyVersion) || input.loyaltyPolicyVersion <= 0 ||
    !Number.isSafeInteger(input.points) || input.points <= 0 ||
    !Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 ||
    input.currency !== "USD" || !nonblank(input.idempotencyKey) ||
    !Number.isFinite(input.reservedAt.getTime())
  ) throw new GrowthPersistenceConflict("Invalid reward redemption payload");
  const existing = await client.query<RedemptionRow>(
    `SELECT ${redemptionProjection} FROM reward_redemptions
     WHERE idempotency_key = $1 FOR UPDATE`,
    [input.idempotencyKey],
  );
  if (existing.rows[0]) {
    const reservation = projectRedemption(existing.rows[0]);
    if (!exactRedemption(reservation, input)) throw new GrowthPersistenceConflict();
    return Object.freeze({ status: "idempotent", reservation });
  }
  const inserted = await client.query<RedemptionRow>(
    `INSERT INTO reward_redemptions
       (id, buyer_user_id, order_id, checkout_attempt_id, loyalty_policy_id,
        loyalty_policy_version, idempotency_key, points, amount_minor, currency,
        state, reserved_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7,
             $8, $9, $10, 'reserved', $11::timestamptz)
     ON CONFLICT DO NOTHING RETURNING ${redemptionProjection}`,
    [input.id, input.buyerUserId, input.orderId, input.checkoutAttemptId,
      input.loyaltyPolicyId, input.loyaltyPolicyVersion, input.idempotencyKey,
      input.points, input.amountMinor, input.currency, input.reservedAt.toISOString()],
  );
  if (!inserted.rows[0]) throw new GrowthPersistenceConflict("Reward redemption uniqueness conflict");
  return Object.freeze({ status: "applied", reservation: projectRedemption(inserted.rows[0]) });
}

function projectConversion(row: ReferralConversionRow): ReferralConversionRecord {
  return Object.freeze({
    id: row.id,
    status: row.status,
    qualifiedAt: row.qualifiedAt === null ? null : toIso(row.qualifiedAt),
    reversedAt: row.reversedAt === null ? null : toIso(row.reversedAt),
  });
}

async function transitionReferralConversion(
  client: GrowthSqlClient,
  input: Readonly<{
    conversionId: string;
    idempotencyKey: string;
    at: Date;
    target: "qualified" | "reversed";
  }>,
): Promise<PersistenceResult<"conversion", ReferralConversionRecord>> {
  if (!uuidPattern.test(input.conversionId) || !nonblank(input.idempotencyKey) ||
      !Number.isFinite(input.at.getTime())) {
    throw new GrowthPersistenceConflict("Invalid referral lifecycle payload");
  }
  const loaded = await client.query<ReferralConversionRow>(
    `SELECT id::text AS id, idempotency_key AS "idempotencyKey", status,
            qualified_at AS "qualifiedAt", reversed_at AS "reversedAt"
     FROM referral_conversions WHERE id = $1::uuid FOR UPDATE`,
    [input.conversionId],
  );
  const row = loaded.rows[0];
  if (!row || row.idempotencyKey !== input.idempotencyKey) throw new GrowthPersistenceConflict();
  const current = projectConversion(row);
  const at = input.at.toISOString();
  if (input.target === "qualified") {
    if (current.status === "qualified" && current.qualifiedAt === at) {
      return Object.freeze({ status: "idempotent", conversion: current });
    }
    if (current.status !== "pending") throw new GrowthPersistenceConflict();
    const updated = await client.query<ReferralConversionRow>(
      `UPDATE referral_conversions SET status = 'qualified', qualified_at = $2::timestamptz
       WHERE id = $1::uuid AND status = 'pending'
       RETURNING id::text AS id, idempotency_key AS "idempotencyKey", status,
                 qualified_at AS "qualifiedAt", reversed_at AS "reversedAt"`,
      [input.conversionId, at],
    );
    if (!updated.rows[0]) throw new GrowthPersistenceConflict();
    return Object.freeze({ status: "applied", conversion: projectConversion(updated.rows[0]) });
  }
  if (current.status === "reversed" && current.reversedAt === at) {
    return Object.freeze({ status: "idempotent", conversion: current });
  }
  if (current.status === "reversed") throw new GrowthPersistenceConflict();
  const updated = await client.query<ReferralConversionRow>(
    `UPDATE referral_conversions SET status = 'reversed', reversed_at = $2::timestamptz
     WHERE id = $1::uuid AND status IN ('pending', 'qualified')
     RETURNING id::text AS id, idempotency_key AS "idempotencyKey", status,
               qualified_at AS "qualifiedAt", reversed_at AS "reversedAt"`,
    [input.conversionId, at],
  );
  if (!updated.rows[0]) throw new GrowthPersistenceConflict();
  return Object.freeze({ status: "applied", conversion: projectConversion(updated.rows[0]) });
}

function canonicalItems(items: readonly Readonly<{ productId: string; quantity: number }>[]) {
  if (items.length < 2 || items.length > 8) throw new GrowthPersistenceConflict("Invalid shared set items");
  const result = items.map((item) => {
    if (!uuidPattern.test(item.productId) || !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 || item.quantity > 25) {
      throw new GrowthPersistenceConflict("Invalid shared set item");
    }
    return { productId: item.productId, quantity: item.quantity };
  }).sort((left, right) => left.productId.localeCompare(right.productId));
  if (new Set(result.map(({ productId }) => productId)).size !== result.length) {
    throw new GrowthPersistenceConflict("Duplicate shared set item");
  }
  return result;
}

async function loadSharedSetMutation(
  client: GrowthSqlClient,
  setId: string,
  ownerUserId: string,
): Promise<{ row: SharedSetRow; items: Array<{ productId: string; quantity: number }> }> {
  const sets = await client.query<SharedSetRow>(
    `SELECT public_code AS code, label, active, updated_at AS "updatedAt",
            deactivated_at AS "deactivatedAt"
     FROM shared_research_sets WHERE id = $1::uuid AND owner_user_id = $2::uuid
     FOR UPDATE`,
    [setId, ownerUserId],
  );
  if (!sets.rows[0]) throw new GrowthPersistenceConflict("Shared set owner conflict");
  const items = await client.query<{ productId: string; quantity: number | string }>(
    `SELECT product_id::text AS "productId", quantity
     FROM shared_research_set_items WHERE shared_set_id = $1::uuid
     ORDER BY product_id FOR UPDATE`,
    [setId],
  );
  return {
    row: sets.rows[0],
    items: items.rows.map((item) => ({ productId: item.productId, quantity: safeInteger(item.quantity) })),
  };
}

function projectSet(row: SharedSetRow, itemCount: number): SharedSetMutationRecord {
  return Object.freeze({
    code: row.code,
    label: row.label,
    active: row.active,
    itemCount,
    updatedAt: toIso(row.updatedAt),
  });
}

function exactItems(
  left: readonly Readonly<{ productId: string; quantity: number }>[],
  right: readonly Readonly<{ productId: string; quantity: number }>[],
): boolean {
  return left.length === right.length && left.every((item, index) =>
    item.productId === right[index]!.productId && item.quantity === right[index]!.quantity);
}

const sharedSetReceiptProjection = `idempotency_key AS "idempotencyKey",
  shared_set_id::text AS "sharedSetId", owner_user_id::text AS "ownerUserId", kind,
  expected_updated_at AS "expectedUpdatedAt", payload_hash AS "payloadHash",
  result_public_code AS "resultPublicCode", result_label AS "resultLabel",
  result_active AS "resultActive", result_item_count AS "resultItemCount",
  result_updated_at AS "resultUpdatedAt", applied_at AS "appliedAt"`;

function sharedSetPayloadHash(payload: Readonly<Record<string, unknown>>): string {
  return sha256Text(JSON.stringify(payload));
}

async function loadSharedSetReceipt(
  client: GrowthSqlClient,
  idempotencyKey: string,
): Promise<SharedSetMutationReceiptRow | null> {
  const receipt = await client.query<SharedSetMutationReceiptRow>(
    `SELECT ${sharedSetReceiptProjection}
     FROM shared_research_set_mutations
     WHERE idempotency_key = $1 FOR UPDATE`,
    [idempotencyKey],
  );
  if (receipt.rows.length > 1) throw new GrowthPersistenceConflict("Duplicate shared set receipt");
  return receipt.rows[0] ?? null;
}

function projectSharedSetReceipt(row: SharedSetMutationReceiptRow): SharedSetMutationRecord {
  const updatedAt = toIso(row.resultUpdatedAt);
  if (toIso(row.appliedAt) !== updatedAt) {
    throw new GrowthPersistenceConflict("Malformed shared set receipt");
  }
  return Object.freeze({
    code: row.resultPublicCode,
    label: row.resultLabel,
    active: row.resultActive,
    itemCount: safeInteger(row.resultItemCount),
    updatedAt,
  });
}

function replaySharedSetReceipt(
  row: SharedSetMutationReceiptRow,
  expected: Readonly<{
    idempotencyKey: string;
    sharedSetId: string;
    ownerUserId: string;
    kind: "replace" | "deactivate";
    expectedUpdatedAt: string;
    payloadHash: string;
    resultLabel?: string;
    resultActive: boolean;
    resultItemCount?: number;
    resultUpdatedAt: string;
  }>,
): PersistenceResult<"set", SharedSetMutationRecord> {
  const projected = projectSharedSetReceipt(row);
  if (row.idempotencyKey !== expected.idempotencyKey ||
      row.sharedSetId !== expected.sharedSetId || row.ownerUserId !== expected.ownerUserId ||
      row.kind !== expected.kind || toIso(row.expectedUpdatedAt) !== expected.expectedUpdatedAt ||
      row.payloadHash !== expected.payloadHash || projected.active !== expected.resultActive ||
      projected.updatedAt !== expected.resultUpdatedAt ||
      (expected.resultLabel !== undefined && projected.label !== expected.resultLabel) ||
      (expected.resultItemCount !== undefined && projected.itemCount !== expected.resultItemCount)) {
    throw new GrowthPersistenceConflict("Shared set mutation receipt conflict");
  }
  return Object.freeze({ status: "idempotent", set: projected });
}

async function appendSharedSetReceipt(
  client: GrowthSqlClient,
  input: Readonly<{
    idempotencyKey: string;
    sharedSetId: string;
    ownerUserId: string;
    kind: "replace" | "deactivate";
    expectedUpdatedAt: string;
    payloadHash: string;
    result: SharedSetMutationRecord;
  }>,
): Promise<void> {
  const inserted = await client.query<{ idempotencyKey: string }>(
    `INSERT INTO shared_research_set_mutations
       (idempotency_key, shared_set_id, owner_user_id, kind, expected_updated_at,
        payload_hash, result_public_code, result_label, result_active,
        result_item_count, result_updated_at, applied_at, created_at)
     VALUES ($1, $2::uuid, $3::uuid, $4, $5::timestamptz, $6, $7, $8, $9,
             $10, $11::timestamptz, $11::timestamptz, $11::timestamptz)
     RETURNING idempotency_key AS "idempotencyKey"`,
    [input.idempotencyKey, input.sharedSetId, input.ownerUserId, input.kind,
      input.expectedUpdatedAt, input.payloadHash, input.result.code, input.result.label,
      input.result.active, input.result.itemCount, input.result.updatedAt],
  );
  if (inserted.rows[0]?.idempotencyKey !== input.idempotencyKey) {
    throw new GrowthPersistenceConflict("Shared set receipt append conflict");
  }
}

async function replaceSharedSetInTransaction(
  client: GrowthSqlClient,
  input: Parameters<GrowthRepository["replaceSharedResearchSet"]>[0],
): Promise<PersistenceResult<"set", SharedSetMutationRecord>> {
  if (!uuidPattern.test(input.setId) || !uuidPattern.test(input.ownerUserId) ||
      !boundedOpaqueIdempotencyKey(input.idempotencyKey) ||
      input.label.trim() !== input.label || input.label.length < 1 || input.label.length > 120 ||
      !Number.isFinite(input.expectedUpdatedAt.getTime()) || !Number.isFinite(input.updatedAt.getTime()) ||
      input.updatedAt <= input.expectedUpdatedAt) {
    throw new GrowthPersistenceConflict("Invalid shared set mutation");
  }
  const desired = canonicalItems(input.items);
  const expectedUpdatedAt = input.expectedUpdatedAt.toISOString();
  const resultUpdatedAt = input.updatedAt.toISOString();
  const payloadHash = sharedSetPayloadHash({
    kind: "replace",
    setId: input.setId,
    ownerUserId: input.ownerUserId,
    expectedUpdatedAt,
    updatedAt: resultUpdatedAt,
    label: input.label,
    items: desired,
  });
  const receipt = await loadSharedSetReceipt(client, input.idempotencyKey);
  if (receipt) {
    return replaySharedSetReceipt(receipt, {
      idempotencyKey: input.idempotencyKey,
      sharedSetId: input.setId,
      ownerUserId: input.ownerUserId,
      kind: "replace",
      expectedUpdatedAt,
      payloadHash,
      resultLabel: input.label,
      resultActive: true,
      resultItemCount: desired.length,
      resultUpdatedAt,
    });
  }
  const loaded = await loadSharedSetMutation(client, input.setId, input.ownerUserId);
  const currentUpdatedAt = toIso(loaded.row.updatedAt);
  if (!loaded.row.active || currentUpdatedAt !== expectedUpdatedAt) {
    throw new GrowthPersistenceConflict("Stale shared set mutation");
  }
  await client.query(`DELETE FROM shared_research_set_items WHERE shared_set_id = $1::uuid`, [input.setId]);
  for (const item of desired) {
    await client.query(
      `INSERT INTO shared_research_set_items (shared_set_id, product_id, quantity, created_at)
       VALUES ($1::uuid, $2::uuid, $3, $4::timestamptz)`,
      [input.setId, item.productId, item.quantity, input.updatedAt.toISOString()],
    );
  }
  const updated = await client.query<SharedSetRow>(
    `UPDATE shared_research_sets SET label = $3, updated_at = $4::timestamptz
     WHERE id = $1::uuid AND owner_user_id = $2::uuid
       AND active = true AND updated_at = $5::timestamptz
     RETURNING public_code AS code, label, active, updated_at AS "updatedAt",
               deactivated_at AS "deactivatedAt"`,
    [input.setId, input.ownerUserId, input.label, resultUpdatedAt, expectedUpdatedAt],
  );
  if (!updated.rows[0]) throw new GrowthPersistenceConflict("Stale shared set mutation");
  const result = projectSet(updated.rows[0], desired.length);
  await appendSharedSetReceipt(client, {
    idempotencyKey: input.idempotencyKey,
    sharedSetId: input.setId,
    ownerUserId: input.ownerUserId,
    kind: "replace",
    expectedUpdatedAt,
    payloadHash,
    result,
  });
  return Object.freeze({ status: "applied", set: result });
}

async function deactivateSharedSetInTransaction(
  client: GrowthSqlClient,
  input: Parameters<GrowthRepository["deactivateSharedResearchSet"]>[0],
): Promise<PersistenceResult<"set", SharedSetMutationRecord>> {
  if (!uuidPattern.test(input.setId) || !uuidPattern.test(input.ownerUserId) ||
      !boundedOpaqueIdempotencyKey(input.idempotencyKey) ||
      !Number.isFinite(input.expectedUpdatedAt.getTime()) ||
      !Number.isFinite(input.deactivatedAt.getTime()) ||
      input.deactivatedAt <= input.expectedUpdatedAt) {
    throw new GrowthPersistenceConflict("Invalid shared set deactivation");
  }
  const expectedUpdatedAt = input.expectedUpdatedAt.toISOString();
  const resultUpdatedAt = input.deactivatedAt.toISOString();
  const payloadHash = sharedSetPayloadHash({
    kind: "deactivate",
    setId: input.setId,
    ownerUserId: input.ownerUserId,
    expectedUpdatedAt,
    deactivatedAt: resultUpdatedAt,
  });
  const receipt = await loadSharedSetReceipt(client, input.idempotencyKey);
  if (receipt) {
    return replaySharedSetReceipt(receipt, {
      idempotencyKey: input.idempotencyKey,
      sharedSetId: input.setId,
      ownerUserId: input.ownerUserId,
      kind: "deactivate",
      expectedUpdatedAt,
      payloadHash,
      resultActive: false,
      resultUpdatedAt,
    });
  }
  const loaded = await loadSharedSetMutation(client, input.setId, input.ownerUserId);
  if (!loaded.row.active || toIso(loaded.row.updatedAt) !== expectedUpdatedAt) {
    throw new GrowthPersistenceConflict("Stale shared set deactivation");
  }
  const updated = await client.query<SharedSetRow>(
    `UPDATE shared_research_sets
     SET active = false, deactivated_at = $3::timestamptz, updated_at = $3::timestamptz
     WHERE id = $1::uuid AND owner_user_id = $2::uuid AND active = true
       AND updated_at = $4::timestamptz
     RETURNING public_code AS code, label, active, updated_at AS "updatedAt",
               deactivated_at AS "deactivatedAt"`,
    [input.setId, input.ownerUserId, resultUpdatedAt, expectedUpdatedAt],
  );
  if (!updated.rows[0]) throw new GrowthPersistenceConflict("Stale shared set deactivation");
  const result = projectSet(updated.rows[0], loaded.items.length);
  await appendSharedSetReceipt(client, {
    idempotencyKey: input.idempotencyKey,
    sharedSetId: input.setId,
    ownerUserId: input.ownerUserId,
    kind: "deactivate",
    expectedUpdatedAt,
    payloadHash,
    result,
  });
  return Object.freeze({ status: "applied", set: result });
}

const commissionProjection = `id::text AS id,
  affiliate_profile_id::text AS "affiliateProfileId",
  affiliate_attribution_id::text AS "affiliateAttributionId",
  buyer_user_id::text AS "buyerUserId", order_id::text AS "orderId",
  affiliate_policy_id::text AS "affiliatePolicyId",
  affiliate_policy_version AS "affiliatePolicyVersion",
  idempotency_key AS "idempotencyKey",
  gross_commission_minor AS "grossCommissionMinor",
  reversed_commission_minor AS "reversedCommissionMinor", status,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

function projectCommission(row: CommissionRow): AffiliateCommissionRecord {
  return Object.freeze({
    id: row.id,
    affiliateProfileId: row.affiliateProfileId,
    affiliateAttributionId: row.affiliateAttributionId,
    buyerUserId: row.buyerUserId,
    orderId: row.orderId,
    affiliatePolicyId: row.affiliatePolicyId,
    affiliatePolicyVersion: safeInteger(row.affiliatePolicyVersion),
    idempotencyKey: row.idempotencyKey,
    grossCommissionMinor: safeInteger(row.grossCommissionMinor),
    reversedCommissionMinor: safeInteger(row.reversedCommissionMinor),
    status: row.status,
    updatedAt: toIso(row.updatedAt),
  });
}

async function recordCommissionInTransaction(
  client: GrowthSqlClient,
  input: Parameters<GrowthRepository["recordAffiliateCommission"]>[0],
): Promise<PersistenceResult<"commission", AffiliateCommissionRecord>> {
  if ([input.id, input.affiliateProfileId, input.affiliateAttributionId,
    input.buyerUserId, input.orderId, input.affiliatePolicyId]
      .some((value) => !uuidPattern.test(value)) ||
      !Number.isSafeInteger(input.affiliatePolicyVersion) || input.affiliatePolicyVersion <= 0 ||
      !Number.isSafeInteger(input.grossCommissionMinor) || input.grossCommissionMinor <= 0 ||
      !nonblank(input.idempotencyKey) || !Number.isFinite(input.createdAt.getTime())) {
    throw new GrowthPersistenceConflict("Invalid affiliate commission payload");
  }
  const existing = await client.query<CommissionRow>(
    `SELECT ${commissionProjection} FROM affiliate_commissions
     WHERE idempotency_key = $1 FOR UPDATE`,
    [input.idempotencyKey],
  );
  if (existing.rows[0]) {
    const commission = projectCommission(existing.rows[0]);
    if (commission.id !== input.id ||
        commission.affiliateProfileId !== input.affiliateProfileId ||
        commission.affiliateAttributionId !== input.affiliateAttributionId ||
        commission.buyerUserId !== input.buyerUserId ||
        commission.orderId !== input.orderId ||
        commission.affiliatePolicyId !== input.affiliatePolicyId ||
        commission.affiliatePolicyVersion !== input.affiliatePolicyVersion ||
        commission.grossCommissionMinor !== input.grossCommissionMinor ||
        toIso(existing.rows[0].createdAt) !== input.createdAt.toISOString()) {
      throw new GrowthPersistenceConflict();
    }
    return Object.freeze({ status: "idempotent", commission });
  }
  const inserted = await client.query<CommissionRow>(
    `INSERT INTO affiliate_commissions
       (id, affiliate_profile_id, affiliate_attribution_id, buyer_user_id,
        order_id, affiliate_policy_id, affiliate_policy_version, idempotency_key,
        gross_commission_minor, reversed_commission_minor, status, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid,
             $7, $8, $9, 0, 'pending', $10::timestamptz, $10::timestamptz)
     ON CONFLICT DO NOTHING RETURNING ${commissionProjection}`,
    [input.id, input.affiliateProfileId, input.affiliateAttributionId,
      input.buyerUserId, input.orderId, input.affiliatePolicyId,
      input.affiliatePolicyVersion, input.idempotencyKey,
      input.grossCommissionMinor, input.createdAt.toISOString()],
  );
  if (!inserted.rows[0]) throw new GrowthPersistenceConflict("Affiliate commission uniqueness conflict");
  return Object.freeze({ status: "applied", commission: projectCommission(inserted.rows[0]) });
}

async function reverseCommissionInTransaction(
  client: GrowthSqlClient,
  input: Parameters<GrowthRepository["reverseAffiliateCommission"]>[0],
): Promise<PersistenceResult<"commission", AffiliateCommissionRecord>> {
  if (!uuidPattern.test(input.commissionId) || !nonblank(input.idempotencyKey) ||
      !Number.isSafeInteger(input.reversedCommissionMinor) ||
      input.reversedCommissionMinor < 0 || !Number.isFinite(input.reversedAt.getTime())) {
    throw new GrowthPersistenceConflict("Invalid affiliate commission reversal");
  }
  const loaded = await client.query<CommissionRow>(
    `SELECT ${commissionProjection} FROM affiliate_commissions
     WHERE id = $1::uuid FOR UPDATE`,
    [input.commissionId],
  );
  const row = loaded.rows[0];
  if (!row || row.idempotencyKey !== input.idempotencyKey ||
      input.reversedCommissionMinor > safeInteger(row.grossCommissionMinor)) {
    throw new GrowthPersistenceConflict();
  }
  const current = projectCommission(row);
  if (current.status === "reversed") {
    if (current.reversedCommissionMinor !== input.reversedCommissionMinor ||
        current.updatedAt !== input.reversedAt.toISOString()) {
      throw new GrowthPersistenceConflict();
    }
    return Object.freeze({ status: "idempotent", commission: current });
  }
  if (current.status === "paid" || row.status === "approved") {
    throw new GrowthPersistenceConflict("Settled affiliate commission cannot be reversed here");
  }
  const updated = await client.query<CommissionRow>(
    `UPDATE affiliate_commissions
     SET status = 'reversed', reversed_commission_minor = $2,
         updated_at = $3::timestamptz
     WHERE id = $1::uuid AND status = 'pending' AND payout_id IS NULL
     RETURNING ${commissionProjection}`,
    [input.commissionId, input.reversedCommissionMinor, input.reversedAt.toISOString()],
  );
  if (!updated.rows[0]) throw new GrowthPersistenceConflict();
  return Object.freeze({ status: "applied", commission: projectCommission(updated.rows[0]) });
}

async function recordTermsAcceptanceInTransaction(
  client: GrowthSqlClient,
  input: Parameters<GrowthRepository["recordGrowthTermsAcceptance"]>[0],
) {
  if (![input.id, input.userId, input.termsVersionId].every((value) => uuidPattern.test(value)) ||
      (input.program !== "customer_rewards_referrals" && input.program !== "affiliate") ||
      !/^[0-9a-f]{64}$/u.test(input.contentHash) ||
      !Number.isFinite(input.acceptedAt.getTime())) {
    throw new GrowthPersistenceConflict("Invalid growth terms acceptance");
  }
  type TermsRow = {
    id: string;
    program: typeof input.program;
    contentHash: string;
    termsText: string;
    effectiveAt: Date | string;
    supersededAt: Date | string | null;
  };
  const currentTerms = await client.query<TermsRow>(
    `SELECT id::text AS id, program, content_hash AS "contentHash",
            terms_text AS "termsText", effective_at AS "effectiveAt",
            superseded_at AS "supersededAt"
     FROM growth_terms_versions
     WHERE program = $1::growth_terms_program
       AND effective_at <= $2::timestamptz
       AND (superseded_at IS NULL OR superseded_at > $2::timestamptz)
     ORDER BY effective_at DESC, version DESC, id
     FOR UPDATE`,
    [input.program, input.acceptedAt.toISOString()],
  );
  const terms = currentTerms.rows[0];
  if (currentTerms.rows.length !== 1 || !terms || terms.id !== input.termsVersionId ||
      terms.program !== input.program || terms.termsText.trim().length === 0 ||
      !/^[0-9a-f]{64}$/u.test(terms.contentHash) ||
      toIso(terms.effectiveAt) > input.acceptedAt.toISOString() ||
      (terms.supersededAt !== null && toIso(terms.supersededAt) <= input.acceptedAt.toISOString())) {
    throw new GrowthPersistenceConflict("Exact current growth terms unavailable");
  }
  const computedContentHash = sha256Text(terms.termsText);
  if (computedContentHash !== terms.contentHash || input.contentHash !== computedContentHash) {
    throw new GrowthPersistenceConflict("Growth terms content hash mismatch");
  }
  type Row = { id: string; userId: string; program: typeof input.program;
    termsVersionId: string; contentHash: string; acceptedAt: Date | string };
  const projection = `id::text AS id, user_id::text AS "userId", program,
    terms_version_id::text AS "termsVersionId", content_hash AS "contentHash",
    accepted_at AS "acceptedAt"`;
  const existing = await client.query<Row>(
    `SELECT ${projection} FROM growth_terms_acceptances
     WHERE id = $1::uuid OR (user_id = $2::uuid AND terms_version_id = $3::uuid)
     ORDER BY id FOR UPDATE`,
    [input.id, input.userId, input.termsVersionId],
  );
  if (existing.rows.length > 0) {
    const row = existing.rows[0]!;
    if (existing.rows.length !== 1 || row.id !== input.id || row.userId !== input.userId ||
        row.program !== input.program || row.termsVersionId !== input.termsVersionId ||
        row.contentHash !== computedContentHash || toIso(row.acceptedAt) !== input.acceptedAt.toISOString()) {
      throw new GrowthPersistenceConflict();
    }
    return Object.freeze({ status: "idempotent" as const, acceptance: Object.freeze({
      id: row.id, program: row.program, termsVersionId: row.termsVersionId,
      contentHash: row.contentHash, acceptedAt: toIso(row.acceptedAt),
    }) });
  }
  const inserted = await client.query<Row>(
    `INSERT INTO growth_terms_acceptances
       (id, user_id, program, terms_version_id, content_hash, accepted_at)
     VALUES ($1::uuid, $2::uuid, $3::growth_terms_program, $4::uuid, $5, $6::timestamptz)
     ON CONFLICT DO NOTHING RETURNING ${projection}`,
    [input.id, input.userId, input.program, input.termsVersionId,
      computedContentHash, input.acceptedAt.toISOString()],
  );
  if (!inserted.rows[0]) throw new GrowthPersistenceConflict("Growth terms acceptance conflict");
  const row = inserted.rows[0];
  return Object.freeze({ status: "applied" as const, acceptance: Object.freeze({
    id: row.id, program: row.program, termsVersionId: row.termsVersionId,
    contentHash: row.contentHash, acceptedAt: toIso(row.acceptedAt),
  }) });
}

async function recordReferralCodeInTransaction(
  client: GrowthSqlClient,
  input: Parameters<GrowthRepository["recordReferralCode"]>[0],
) {
  if (!uuidPattern.test(input.id) || !uuidPattern.test(input.ownerUserId) ||
      !/^ref_[A-Za-z0-9_-]{16,64}$/u.test(input.code) ||
      !Number.isFinite(input.createdAt.getTime())) {
    throw new GrowthPersistenceConflict("Invalid referral code payload");
  }
  type Row = { id: string; ownerUserId: string; code: string;
    status: "active" | "revoked"; createdAt: Date | string };
  const projection = `id::text AS id, owner_user_id::text AS "ownerUserId",
    code, status, created_at AS "createdAt"`;
  const existing = await client.query<Row>(
    `SELECT ${projection} FROM referral_codes
     WHERE id = $1::uuid OR code = $3
        OR (owner_user_id = $2::uuid AND status = 'active')
     ORDER BY id FOR UPDATE`,
    [input.id, input.ownerUserId, input.code],
  );
  if (existing.rows.length > 0) {
    const row = existing.rows[0]!;
    if (existing.rows.length !== 1 || row.id !== input.id || row.ownerUserId !== input.ownerUserId ||
        row.code !== input.code || row.status !== "active" ||
        toIso(row.createdAt) !== input.createdAt.toISOString()) throw new GrowthPersistenceConflict();
    return Object.freeze({ status: "idempotent" as const, referralCode: Object.freeze({
      code: row.code, status: row.status, createdAt: toIso(row.createdAt),
    }) });
  }
  const inserted = await client.query<Row>(
    `INSERT INTO referral_codes (id, owner_user_id, code, status, created_at)
     VALUES ($1::uuid, $2::uuid, $3, 'active', $4::timestamptz)
     ON CONFLICT DO NOTHING RETURNING ${projection}`,
    [input.id, input.ownerUserId, input.code, input.createdAt.toISOString()],
  );
  if (!inserted.rows[0]) throw new GrowthPersistenceConflict("Referral code uniqueness conflict");
  const row = inserted.rows[0];
  return Object.freeze({ status: "applied" as const, referralCode: Object.freeze({
    code: row.code, status: row.status, createdAt: toIso(row.createdAt),
  }) });
}

async function createSharedSetInTransaction(
  client: GrowthSqlClient,
  input: Parameters<GrowthRepository["createSharedResearchSet"]>[0],
): Promise<PersistenceResult<"set", SharedSetMutationRecord>> {
  if (!uuidPattern.test(input.id) || !uuidPattern.test(input.ownerUserId) ||
      !/^set_[A-Za-z0-9_-]{16,64}$/u.test(input.publicCode) ||
      input.label.trim() !== input.label || input.label.length < 1 || input.label.length > 120 ||
      !Number.isFinite(input.createdAt.getTime())) {
    throw new GrowthPersistenceConflict("Invalid shared set creation");
  }
  const desired = canonicalItems(input.items);
  type Row = SharedSetRow & { id: string; ownerUserId: string; createdAt: Date | string };
  const projection = `id::text AS id, owner_user_id::text AS "ownerUserId",
    public_code AS code, label, active, created_at AS "createdAt",
    updated_at AS "updatedAt", deactivated_at AS "deactivatedAt"`;
  const existing = await client.query<Row>(
    `SELECT ${projection} FROM shared_research_sets
     WHERE id = $1::uuid OR public_code = $2 ORDER BY id FOR UPDATE`,
    [input.id, input.publicCode],
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    const loaded = row.id === input.id
      ? await loadSharedSetMutation(client, input.id, input.ownerUserId)
      : null;
    if (existing.rows.length !== 1 || loaded === null || row.ownerUserId !== input.ownerUserId ||
        row.code !== input.publicCode || row.label !== input.label || !row.active ||
        toIso(row.createdAt) !== input.createdAt.toISOString() ||
        toIso(row.updatedAt) !== input.createdAt.toISOString() ||
        !exactItems(loaded.items, desired)) throw new GrowthPersistenceConflict();
    return Object.freeze({ status: "idempotent", set: projectSet(row, desired.length) });
  }
  const inserted = await client.query<Row>(
    `INSERT INTO shared_research_sets
       (id, owner_user_id, public_code, label, active, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, $3, $4, true, $5::timestamptz, $5::timestamptz)
     ON CONFLICT DO NOTHING RETURNING ${projection}`,
    [input.id, input.ownerUserId, input.publicCode, input.label, input.createdAt.toISOString()],
  );
  if (!inserted.rows[0]) throw new GrowthPersistenceConflict("Shared set uniqueness conflict");
  for (const item of desired) {
    await client.query(
      `INSERT INTO shared_research_set_items (shared_set_id, product_id, quantity, created_at)
       VALUES ($1::uuid, $2::uuid, $3, $4::timestamptz)`,
      [input.id, item.productId, item.quantity, input.createdAt.toISOString()],
    );
  }
  return Object.freeze({ status: "applied", set: projectSet(inserted.rows[0], desired.length) });
}

async function recordAffiliateProfileInTransaction(
  client: GrowthSqlClient,
  input: Parameters<GrowthRepository["recordAffiliateProfile"]>[0],
) {
  if (![input.id, input.userId, input.termsAcceptanceId].every((value) => uuidPattern.test(value)) ||
      !/^aff_[A-Za-z0-9_-]{16,64}$/u.test(input.publicCode) ||
      !nonblank(input.publicChannel) || input.publicChannel.length > 500 ||
      !["website", "social", "email", "other"].includes(input.promotionMethod) ||
      !Number.isFinite(input.createdAt.getTime())) {
    throw new GrowthPersistenceConflict("Invalid affiliate profile payload");
  }
  type Row = { id: string; userId: string; publicCode: string;
    status: "pending" | "active" | "rejected" | "suspended";
    publicChannel: string; promotionMethod: typeof input.promotionMethod;
    termsAcceptanceId: string; createdAt: Date | string };
  const projection = `id::text AS id, user_id::text AS "userId",
    public_code AS "publicCode", status, public_channel AS "publicChannel",
    promotion_method AS "promotionMethod",
    terms_acceptance_id::text AS "termsAcceptanceId", created_at AS "createdAt"`;
  const existing = await client.query<Row>(
    `SELECT ${projection} FROM affiliate_profiles
     WHERE id = $1::uuid OR user_id = $2::uuid OR public_code = $3
     ORDER BY id FOR UPDATE`,
    [input.id, input.userId, input.publicCode],
  );
  const project = (row: Row) => Object.freeze({ publicCode: row.publicCode,
    status: row.status, publicChannel: row.publicChannel,
    promotionMethod: row.promotionMethod, createdAt: toIso(row.createdAt) });
  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (existing.rows.length !== 1 || row.id !== input.id || row.userId !== input.userId ||
        row.publicCode !== input.publicCode || row.status !== "pending" ||
        row.publicChannel !== input.publicChannel || row.promotionMethod !== input.promotionMethod ||
        row.termsAcceptanceId !== input.termsAcceptanceId ||
        toIso(row.createdAt) !== input.createdAt.toISOString()) throw new GrowthPersistenceConflict();
    return Object.freeze({ status: "idempotent" as const, profile: project(row) });
  }
  const inserted = await client.query<Row>(
    `INSERT INTO affiliate_profiles
       (id, user_id, public_code, status, public_channel, promotion_method,
        terms_acceptance_id, terms_program, created_at, updated_at)
     VALUES ($1::uuid, $2::uuid, $3, 'pending', $4, $5::affiliate_promotion_method,
             $6::uuid, 'affiliate', $7::timestamptz, $7::timestamptz)
     ON CONFLICT DO NOTHING RETURNING ${projection}`,
    [input.id, input.userId, input.publicCode, input.publicChannel,
      input.promotionMethod, input.termsAcceptanceId, input.createdAt.toISOString()],
  );
  if (!inserted.rows[0]) throw new GrowthPersistenceConflict("Affiliate profile uniqueness conflict");
  return Object.freeze({ status: "applied" as const, profile: project(inserted.rows[0]) });
}

export function createPostgresGrowthRepository(dependencies: Readonly<{
  runSerializableTransaction: GrowthTransactionRunner;
  retrySleep?: (
    retryNumber: 1 | 2,
    sqlState: "40001" | "40P01",
  ) => Promise<void>;
}>): GrowthRepository {
  const transaction = <Value>(work: (client: GrowthSqlClient) => Promise<Value>) =>
    runSerializableWithRetry(
      () => dependencies.runSerializableTransaction(work, { isolationLevel: "serializable" }),
      dependencies.retrySleep === undefined ? {} : { sleep: dependencies.retrySleep },
    );
  return Object.freeze({
    appendRewardLedger(input) {
      return transaction((client) => appendInTransaction(client, input));
    },
    reserveRewardRedemption(input) {
      return transaction((client) => reserveRedemptionInTransaction(client, input));
    },
    qualifyReferralConversion(input) {
      return transaction((client) => transitionReferralConversion(client, {
        conversionId: input.conversionId,
        idempotencyKey: input.idempotencyKey,
        at: input.qualifiedAt,
        target: "qualified",
      }));
    },
    reverseReferralConversion(input) {
      return transaction((client) => transitionReferralConversion(client, {
        conversionId: input.conversionId,
        idempotencyKey: input.idempotencyKey,
        at: input.reversedAt,
        target: "reversed",
      }));
    },
    replaceSharedResearchSet(input) {
      return transaction((client) => replaceSharedSetInTransaction(client, input));
    },
    deactivateSharedResearchSet(input) {
      return transaction((client) => deactivateSharedSetInTransaction(client, input));
    },
    recordAffiliateCommission(input) {
      return transaction((client) => recordCommissionInTransaction(client, input));
    },
    reverseAffiliateCommission(input) {
      return transaction((client) => reverseCommissionInTransaction(client, input));
    },
    recordGrowthTermsAcceptance(input) {
      return transaction((client) => recordTermsAcceptanceInTransaction(client, input));
    },
    recordReferralCode(input) {
      return transaction((client) => recordReferralCodeInTransaction(client, input));
    },
    createSharedResearchSet(input) {
      return transaction((client) => createSharedSetInTransaction(client, input));
    },
    recordAffiliateProfile(input) {
      return transaction((client) => recordAffiliateProfileInTransaction(client, input));
    },
  });
}
