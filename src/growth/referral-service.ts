import type { VerifiedIdentity } from "@/auth/identity";
import { isVerifiedIdentityAt } from "@/auth/identity";
import {
  createPostgresGrowthRepository,
  GrowthPersistenceConflict,
  type GrowthSqlClient,
  type GrowthTransactionRunner,
} from "@/db/repositories/growth-repository";
import { runSerializableWithRetry } from "@/db/serializable-retry";
import {
  calculateReferralBenefit,
  type ReferralPolicy,
} from "@/domain/referrals";
import {
  verifyAttributionCookie,
  type AttributionEnvelopeV1,
  type AttributionEnvironment,
} from "@/growth/attribution-cookie";
import {
  loadCurrentGrowthTerms,
  loadCurrentReferralPolicy,
} from "@/growth/policies";

export type ReferralEnrollmentErrorCode =
  | "buyer_inactive"
  | "identity_unverified"
  | "invalid_input"
  | "persistence_conflict"
  | "terms_mismatch"
  | "terms_unavailable";

export class ReferralEnrollmentError extends Error {
  readonly code: ReferralEnrollmentErrorCode;

  constructor(code: ReferralEnrollmentErrorCode) {
    super(code);
    this.name = "ReferralEnrollmentError";
    this.code = code;
  }
}

export type ReferralEnrollmentTransactionInput = Readonly<{
  acceptanceId: string;
  referralCodeId: string;
  buyerUserId: string;
  termsVersionId: string;
  termsContentHash: string;
  code: string;
  acceptedAt: Date;
}>;

export type ReferralEnrollmentTransactionResult = Readonly<{
  status: "applied" | "idempotent";
  code: string;
  createdAt: string;
}>;

export type ReferralEnrollmentTransaction = (
  input: ReferralEnrollmentTransactionInput,
) => Promise<ReferralEnrollmentTransactionResult>;

export type ReferralCheckoutUnavailableReason =
  | "affiliate_conflict"
  | "attribution_invalid"
  | "buyer_already_referred"
  | "code_inactive"
  | "invalid_input"
  | "policy_unavailable"
  | "program_conflict"
  | "self_referral";

export type ReferralCandidateLookup = (input: Readonly<{
  buyerUserId: string;
  code: string;
  clickedAt: string;
  expiresAt: string;
  now: Date;
}>) => Promise<
  | Readonly<{
      status: "eligible";
      referralCodeId: string;
      referrerUserId: string;
      policy: ReferralPolicy;
    }>
  | Readonly<{
      status: "unavailable";
      reason: Exclude<
        ReferralCheckoutUnavailableReason,
        "attribution_invalid" | "invalid_input" | "program_conflict" | "self_referral"
      >;
    }>
>;

export type EligibleReferralCheckoutQuote = Readonly<{
  status: "eligible";
  code: string;
  referralCodeId: string;
  referrerUserId: string;
  clickedAt: string;
  expiresAt: string;
  referralPolicyId: string;
  referralPolicyVersion: number;
  referralDiscountMinor: number;
}>;

export type ReferralCheckoutQuote =
  | EligibleReferralCheckoutQuote
  | Readonly<{ status: "internal_conflict" }>
  | Readonly<{
      status: "unavailable";
      reason: ReferralCheckoutUnavailableReason;
    }>;

export class ReferralBindingConflict extends Error {
  constructor(message = "Authoritative referral binding conflict") {
    super(message);
    this.name = "ReferralBindingConflict";
  }
}

export type ReferralOrderBindingInput = Readonly<{
  attributionId: string;
  conversionId: string;
  buyerUserId: string;
  orderId: string;
  idempotencyKey: string;
  quote: EligibleReferralCheckoutQuote;
  referredDiscountMinor: number;
  boundAt: Date;
}>;

export type CustomerReferralEnrollmentInput = Readonly<{
  buyerUserId: string;
  buyerStatus: "active" | "review" | "blocked";
  identity: VerifiedIdentity;
  termsVersionId: string;
  termsContentHash: string;
}>;

export type CustomerReferralEnrollmentResult = Readonly<{
  status: "enrolled" | "idempotent";
  code: string;
  createdAt: string;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const REFERRAL_CODE_PATTERN = /^ref_[A-Za-z0-9_-]{16,64}$/u;

type BuyerEnrollmentRow = {
  id: string;
  status: "active" | "review" | "blocked";
  emailVerifiedAt: Date | string | null;
};

type ExistingAcceptanceRow = {
  id: string;
  termsVersionId: string;
  contentHash: string;
  acceptedAt: Date | string;
};

type ExistingCodeRow = {
  code: string;
  createdAt: Date | string;
};

function iso(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new ReferralEnrollmentError("persistence_conflict");
  }
  return parsed.toISOString();
}

function repositoryInTransaction(client: GrowthSqlClient) {
  return createPostgresGrowthRepository({
    runSerializableTransaction: async <Value>(
      work: (transactionClient: GrowthSqlClient) => Promise<Value>,
    ) => work(client),
  });
}

async function enrollWithPostgresClient(
  client: GrowthSqlClient,
  input: ReferralEnrollmentTransactionInput,
): Promise<ReferralEnrollmentTransactionResult> {
  if (
    !validGeneratedValues(input) ||
    !UUID_PATTERN.test(input.buyerUserId) ||
    !UUID_PATTERN.test(input.termsVersionId) ||
    !SHA256_PATTERN.test(input.termsContentHash) ||
    !Number.isFinite(input.acceptedAt.getTime())
  ) {
    throw new ReferralEnrollmentError("invalid_input");
  }

  const buyer = await client.query<BuyerEnrollmentRow>(
    `SELECT u.id::text AS id, bp.status,
            u.email_verified_at AS "emailVerifiedAt"
     FROM users u
     JOIN buyer_profiles bp ON bp.user_id = u.id
     WHERE u.id = $1::uuid
     FOR UPDATE OF u, bp`,
    [input.buyerUserId],
  );
  const buyerRow = buyer.rows[0];
  if (buyer.rows.length !== 1 || !buyerRow || buyerRow.status !== "active") {
    throw new ReferralEnrollmentError("buyer_inactive");
  }
  if (
    buyerRow.emailVerifiedAt === null ||
    iso(buyerRow.emailVerifiedAt) > input.acceptedAt.toISOString()
  ) {
    throw new ReferralEnrollmentError("identity_unverified");
  }

  let terms: Awaited<ReturnType<typeof loadCurrentGrowthTerms>>;
  try {
    terms = await loadCurrentGrowthTerms(
      client,
      "customer_rewards_referrals",
      input.acceptedAt,
    );
  } catch {
    throw new ReferralEnrollmentError("terms_unavailable");
  }
  if (
    terms.id !== input.termsVersionId ||
    terms.contentHash !== input.termsContentHash
  ) {
    throw new ReferralEnrollmentError("terms_mismatch");
  }

  const existingAcceptance = await client.query<ExistingAcceptanceRow>(
    `SELECT id::text AS id, terms_version_id::text AS "termsVersionId",
            content_hash AS "contentHash", accepted_at AS "acceptedAt"
     FROM growth_terms_acceptances
     WHERE user_id = $1::uuid
       AND program = 'customer_rewards_referrals'
       AND terms_version_id = $2::uuid
     ORDER BY id
     FOR UPDATE`,
    [input.buyerUserId, terms.id],
  );
  if (existingAcceptance.rows.length > 1) {
    throw new ReferralEnrollmentError("persistence_conflict");
  }
  const priorAcceptance = existingAcceptance.rows[0];
  if (
    priorAcceptance &&
    (priorAcceptance.termsVersionId !== terms.id ||
      priorAcceptance.contentHash !== terms.contentHash ||
      iso(priorAcceptance.acceptedAt) > input.acceptedAt.toISOString())
  ) {
    throw new ReferralEnrollmentError("terms_mismatch");
  }

  const existingCode = await client.query<ExistingCodeRow>(
    `SELECT code, created_at AS "createdAt"
     FROM referral_codes
     WHERE owner_user_id = $1::uuid AND status = 'active'
     ORDER BY id
     FOR UPDATE`,
    [input.buyerUserId],
  );
  if (existingCode.rows.length > 1) {
    throw new ReferralEnrollmentError("persistence_conflict");
  }

  const repository = repositoryInTransaction(client);
  let changed = false;
  try {
    if (!priorAcceptance) {
      await repository.recordGrowthTermsAcceptance({
        id: input.acceptanceId,
        userId: input.buyerUserId,
        program: "customer_rewards_referrals",
        termsVersionId: terms.id,
        contentHash: terms.contentHash,
        acceptedAt: input.acceptedAt,
      });
      changed = true;
    }

    const priorCode = existingCode.rows[0];
    if (priorCode) {
      const createdAt = iso(priorCode.createdAt);
      if (createdAt > input.acceptedAt.toISOString()) {
        throw new ReferralEnrollmentError("persistence_conflict");
      }
      return Object.freeze({
        status: changed ? "applied" : "idempotent",
        code: priorCode.code,
        createdAt,
      });
    }

    const inserted = await repository.recordReferralCode({
      id: input.referralCodeId,
      ownerUserId: input.buyerUserId,
      code: input.code,
      createdAt: input.acceptedAt,
    });
    return Object.freeze({
      status: "applied",
      code: inserted.referralCode.code,
      createdAt: inserted.referralCode.createdAt,
    });
  } catch (error) {
    if (error instanceof ReferralEnrollmentError) throw error;
    if (error instanceof GrowthPersistenceConflict) {
      throw new ReferralEnrollmentError("persistence_conflict");
    }
    throw error;
  }
}

export function createPostgresReferralEnrollmentTransaction(
  dependencies: Readonly<{
    runSerializableTransaction: GrowthTransactionRunner;
    retrySleep?: (
      retryNumber: 1 | 2,
      sqlState: "40001" | "40P01",
    ) => Promise<void>;
  }>,
): ReferralEnrollmentTransaction {
  return (input) =>
    runSerializableWithRetry(
      () => dependencies.runSerializableTransaction(
        (client) => enrollWithPostgresClient(client, input),
        { isolationLevel: "serializable" },
      ),
      dependencies.retrySleep === undefined
        ? {}
        : { sleep: dependencies.retrySleep },
    );
}

function validGeneratedValues(input: Readonly<{
  acceptanceId: string;
  referralCodeId: string;
  code: string;
}>): boolean {
  return (
    UUID_PATTERN.test(input.acceptanceId) &&
    UUID_PATTERN.test(input.referralCodeId) &&
    REFERRAL_CODE_PATTERN.test(input.code)
  );
}

function referralUnavailable(
  reason: ReferralCheckoutUnavailableReason,
): ReferralCheckoutQuote {
  return Object.freeze({ status: "unavailable", reason });
}

export function createReferralCheckoutService(dependencies: Readonly<{
  verifyCookie: (
    value: string,
    now: Date,
  ) => AttributionEnvelopeV1 | null;
  loadCandidate: ReferralCandidateLookup;
}>) {
  return Object.freeze({
    async quoteCustomerReferral(input: Readonly<{
      buyerUserId: string;
      attributionCookie: string;
      merchandiseSubtotalMinor: number;
      currency: "USD";
      now: Date;
    }>): Promise<ReferralCheckoutQuote> {
      if (
        !UUID_PATTERN.test(input.buyerUserId) ||
        typeof input.attributionCookie !== "string" ||
        input.attributionCookie.length === 0 ||
        !Number.isSafeInteger(input.merchandiseSubtotalMinor) ||
        input.merchandiseSubtotalMinor < 0 ||
        input.currency !== "USD" ||
        !Number.isFinite(input.now.getTime())
      ) {
        return referralUnavailable("invalid_input");
      }
      const envelope = dependencies.verifyCookie(
        input.attributionCookie,
        input.now,
      );
      if (!envelope) return referralUnavailable("attribution_invalid");
      if (envelope.program !== "customer_referral") {
        return referralUnavailable("program_conflict");
      }

      let candidate: Awaited<ReturnType<ReferralCandidateLookup>>;
      try {
        candidate = await dependencies.loadCandidate({
          buyerUserId: input.buyerUserId,
          code: envelope.code,
          clickedAt: envelope.issuedAt,
          expiresAt: envelope.expiresAt,
          now: input.now,
        });
      } catch {
        return Object.freeze({ status: "internal_conflict" });
      }
      if (candidate.status === "unavailable") {
        return referralUnavailable(candidate.reason);
      }
      if (candidate.referrerUserId === input.buyerUserId) {
        return referralUnavailable("self_referral");
      }
      const benefit = calculateReferralBenefit({
        policy: candidate.policy,
        referral: {
          code: envelope.code,
          referrerActorId: candidate.referrerUserId,
          status: "active",
        },
        attribution: {
          program: "customer_referral",
          code: envelope.code,
          clickedAt: envelope.issuedAt,
        },
        buyerActorId: input.buyerUserId,
        isFirstEligibleOrder: true,
        buyerPreviouslyRewarded: false,
        preReferralMerchandiseMinor: input.merchandiseSubtotalMinor,
        postDiscountMerchandiseMinor: input.merchandiseSubtotalMinor,
        currency: input.currency,
      });
      if (!benefit.ok) return referralUnavailable("policy_unavailable");
      return Object.freeze({
        status: "eligible",
        code: envelope.code,
        referralCodeId: candidate.referralCodeId,
        referrerUserId: candidate.referrerUserId,
        clickedAt: envelope.issuedAt,
        expiresAt: envelope.expiresAt,
        referralPolicyId: candidate.policy.id,
        referralPolicyVersion: candidate.policy.version,
        referralDiscountMinor: benefit.value.discountMinor,
      });
    },
  });
}

export function createPostgresReferralCandidateLookup(dependencies: Readonly<{
  client: GrowthSqlClient;
}>): ReferralCandidateLookup {
  return async (input) => {
    if (
      !UUID_PATTERN.test(input.buyerUserId) ||
      !REFERRAL_CODE_PATTERN.test(input.code) ||
      !Number.isFinite(input.now.getTime())
    ) {
      return Object.freeze({ status: "unavailable", reason: "policy_unavailable" });
    }
    const clickedAt = new Date(input.clickedAt);
    const expiresAt = new Date(input.expiresAt);
    const maximumWindow = 30 * 24 * 60 * 60 * 1_000;
    if (
      !Number.isFinite(clickedAt.getTime()) ||
      !Number.isFinite(expiresAt.getTime()) ||
      clickedAt.toISOString() !== input.clickedAt ||
      expiresAt.toISOString() !== input.expiresAt ||
      clickedAt > input.now ||
      expiresAt <= input.now ||
      expiresAt.getTime() - clickedAt.getTime() > maximumWindow ||
      input.now.getTime() - clickedAt.getTime() > maximumWindow
    ) {
      return Object.freeze({ status: "unavailable", reason: "code_inactive" });
    }

    let policy: ReferralPolicy;
    try {
      policy = await loadCurrentReferralPolicy(dependencies.client, input.now);
    } catch {
      return Object.freeze({ status: "unavailable", reason: "policy_unavailable" });
    }
    if (
      input.now.getTime() - clickedAt.getTime() >
      policy.attributionDays * 24 * 60 * 60 * 1_000
    ) {
      return Object.freeze({ status: "unavailable", reason: "code_inactive" });
    }

    const code = await dependencies.client.query<{
      id: string;
      ownerUserId: string;
    }>(
      `SELECT rc.id::text AS id, rc.owner_user_id::text AS "ownerUserId"
       FROM referral_codes rc
       JOIN buyer_profiles bp ON bp.user_id = rc.owner_user_id
       WHERE rc.code = $1 AND rc.status = 'active' AND bp.status = 'active'
       ORDER BY rc.id
       LIMIT 2`,
      [input.code],
    );
    if (code.rows.length !== 1) {
      return Object.freeze({ status: "unavailable", reason: "code_inactive" });
    }

    const conflicts = await dependencies.client.query<{
      referralCount: number | string;
      affiliateCount: number | string;
      qualifiedOrderCount: number | string;
    }>(
      `SELECT
         (SELECT count(*) FROM referral_attributions
          WHERE referred_user_id = $1::uuid) AS "referralCount",
         (SELECT count(*) FROM affiliate_attributions
          WHERE referred_user_id = $1::uuid) AS "affiliateCount",
         (SELECT count(*) FROM orders
          WHERE buyer_user_id = $1::uuid
            AND state IN ('ready_for_checkout', 'checkout_pending',
              'paid_pending_fulfillment', 'paid_on_hold',
              'ready_for_fulfillment', 'fulfillment_in_progress', 'fulfilled'))
           AS "qualifiedOrderCount"`,
      [input.buyerUserId],
    );
    const conflict = conflicts.rows[0];
    if (!conflict) {
      return Object.freeze({ status: "unavailable", reason: "policy_unavailable" });
    }
    if (Number(conflict.affiliateCount) > 0) {
      return Object.freeze({ status: "unavailable", reason: "affiliate_conflict" });
    }
    if (
      Number(conflict.referralCount) > 0 ||
      Number(conflict.qualifiedOrderCount) > 0
    ) {
      return Object.freeze({
        status: "unavailable",
        reason: "buyer_already_referred",
      });
    }

    return Object.freeze({
      status: "eligible",
      referralCodeId: code.rows[0]!.id,
      referrerUserId: code.rows[0]!.ownerUserId,
      policy,
    });
  };
}

export function createPostgresReferralCheckoutService(dependencies: Readonly<{
  client: GrowthSqlClient;
  environment: AttributionEnvironment;
  secret: string;
}>) {
  return createReferralCheckoutService({
    verifyCookie(value, now) {
      return verifyAttributionCookie(value, {
        environment: dependencies.environment,
        now,
        secret: dependencies.secret,
      });
    },
    loadCandidate: createPostgresReferralCandidateLookup({
      client: dependencies.client,
    }),
  });
}

function safeDatabaseInteger(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new ReferralBindingConflict();
  return parsed;
}

/**
 * Revalidates and binds a private customer referral inside the caller's
 * serializable checkout transaction. No referrer data is projected from this
 * boundary; the quote remains an opaque, server-owned checkout-plan value.
 */
export async function bindCustomerReferralOrderInTransaction(
  client: GrowthSqlClient,
  input: ReferralOrderBindingInput,
): Promise<void> {
  if (
    !UUID_PATTERN.test(input.attributionId) ||
    !UUID_PATTERN.test(input.conversionId) ||
    !UUID_PATTERN.test(input.buyerUserId) ||
    !UUID_PATTERN.test(input.orderId) ||
    input.idempotencyKey.trim().length === 0 ||
    input.idempotencyKey.length > 200 ||
    !Number.isSafeInteger(input.referredDiscountMinor) ||
    input.referredDiscountMinor < 0 ||
    !Number.isFinite(input.boundAt.getTime())
  ) {
    throw new ReferralBindingConflict();
  }

  const clickedAt = new Date(input.quote.clickedAt);
  const expiresAt = new Date(input.quote.expiresAt);
  if (
    !Number.isFinite(clickedAt.getTime()) ||
    !Number.isFinite(expiresAt.getTime()) ||
    clickedAt.toISOString() !== input.quote.clickedAt ||
    expiresAt.toISOString() !== input.quote.expiresAt ||
    clickedAt > input.boundAt ||
    expiresAt <= input.boundAt
  ) {
    throw new ReferralBindingConflict();
  }

  let policy: ReferralPolicy;
  try {
    policy = await loadCurrentReferralPolicy(client, input.boundAt);
  } catch {
    throw new ReferralBindingConflict();
  }
  if (
    policy.id !== input.quote.referralPolicyId ||
    policy.version !== input.quote.referralPolicyVersion ||
    input.boundAt.getTime() - clickedAt.getTime() >
      policy.attributionDays * 24 * 60 * 60 * 1_000
  ) {
    throw new ReferralBindingConflict();
  }

  const code = await client.query<{
    id: string;
    ownerUserId: string;
    code: string;
  }>(
    `SELECT rc.id::text AS id, rc.owner_user_id::text AS "ownerUserId", rc.code
     FROM referral_codes rc
     JOIN buyer_profiles bp ON bp.user_id = rc.owner_user_id
     WHERE rc.id = $1::uuid AND rc.code = $2 AND rc.status = 'active'
       AND bp.status = 'active'
     FOR UPDATE OF rc, bp`,
    [input.quote.referralCodeId, input.quote.code],
  );
  const codeRow = code.rows[0];
  if (
    code.rows.length !== 1 ||
    !codeRow ||
    codeRow.ownerUserId !== input.quote.referrerUserId ||
    codeRow.ownerUserId === input.buyerUserId
  ) {
    throw new ReferralBindingConflict();
  }

  const conflicts = await client.query<{ kind: string }>(
    `SELECT 'referral' AS kind FROM referral_attributions
       WHERE referred_user_id = $1::uuid
     UNION ALL
     SELECT 'affiliate' AS kind FROM affiliate_attributions
       WHERE referred_user_id = $1::uuid
     UNION ALL
     SELECT 'order' AS kind FROM orders
       WHERE buyer_user_id = $1::uuid AND id <> $2::uuid
         AND state IN ('ready_for_checkout', 'checkout_pending',
           'paid_pending_fulfillment', 'paid_on_hold',
           'ready_for_fulfillment', 'fulfillment_in_progress', 'fulfilled')`,
    [input.buyerUserId, input.orderId],
  );
  if (conflicts.rows.length > 0) throw new ReferralBindingConflict();

  const merchandise = await client.query<{
    grossMinor: number | string;
    netMinor: number | string;
  }>(
    `SELECT coalesce(sum(subtotal_minor), 0) AS "grossMinor",
            coalesce(sum(total_minor), 0) AS "netMinor"
     FROM order_items WHERE order_id = $1::uuid`,
    [input.orderId],
  );
  const merchandiseRow = merchandise.rows[0];
  if (!merchandiseRow) throw new ReferralBindingConflict();
  const grossMinor = safeDatabaseInteger(merchandiseRow.grossMinor);
  const netMinor = safeDatabaseInteger(merchandiseRow.netMinor);
  const benefit = calculateReferralBenefit({
    policy,
    referral: {
      code: input.quote.code,
      referrerActorId: codeRow.ownerUserId,
      status: "active",
    },
    attribution: {
      program: "customer_referral",
      code: input.quote.code,
      clickedAt: input.quote.clickedAt,
    },
    buyerActorId: input.buyerUserId,
    isFirstEligibleOrder: true,
    buyerPreviouslyRewarded: false,
    preReferralMerchandiseMinor: grossMinor,
    postDiscountMerchandiseMinor: netMinor,
    currency: "USD",
  });
  if (
    !benefit.ok ||
    benefit.value.discountMinor !== input.quote.referralDiscountMinor ||
    (input.referredDiscountMinor !== 0 &&
      input.referredDiscountMinor !== benefit.value.discountMinor)
  ) {
    throw new ReferralBindingConflict();
  }

  await client.query(
    `INSERT INTO referral_attributions
       (id, referral_code_id, referrer_user_id, referred_user_id,
        referral_policy_id, referral_policy_version, clicked_at, expires_at, bound_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6,
             $7::timestamptz, $8::timestamptz, $9::timestamptz)`,
    [input.attributionId, input.quote.referralCodeId, codeRow.ownerUserId,
      input.buyerUserId, policy.id, policy.version, input.quote.clickedAt,
      input.quote.expiresAt, input.boundAt.toISOString()],
  );
  await client.query(
    `INSERT INTO order_growth_attributions
       (order_id, buyer_user_id, program, referral_attribution_id,
        referral_policy_id, referral_policy_version, created_at)
     VALUES ($1::uuid, $2::uuid, 'customer_referral', $3::uuid,
             $4::uuid, $5, $6::timestamptz)`,
    [input.orderId, input.buyerUserId, input.attributionId, policy.id,
      policy.version, input.boundAt.toISOString()],
  );
  await client.query(
    `INSERT INTO referral_conversions
       (id, referral_attribution_id, referred_user_id, first_order_id,
        program, referral_policy_id, referral_policy_version, idempotency_key,
        referred_discount_minor, referrer_reward_points, status, created_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'customer_referral',
             $5::uuid, $6, $7, $8, $9, 'pending', $10::timestamptz)`,
    [input.conversionId, input.attributionId, input.buyerUserId, input.orderId,
      policy.id, policy.version, input.idempotencyKey,
      input.referredDiscountMinor, benefit.value.referrerRewardPoints,
      input.boundAt.toISOString()],
  );
}

export function createReferralService(dependencies: Readonly<{
  clock: () => Date;
  createAcceptanceId: () => string;
  createReferralCodeId: () => string;
  createReferralCode: () => string;
  enrollInTransaction: ReferralEnrollmentTransaction;
}>) {
  return Object.freeze({
    async enrollCustomerReferral(
      input: CustomerReferralEnrollmentInput,
    ): Promise<CustomerReferralEnrollmentResult> {
      const acceptedAt = dependencies.clock();
      if (!Number.isFinite(acceptedAt.getTime())) {
        throw new ReferralEnrollmentError("invalid_input");
      }
      if (input.buyerStatus !== "active") {
        throw new ReferralEnrollmentError("buyer_inactive");
      }
      if (!isVerifiedIdentityAt(input.identity, acceptedAt)) {
        throw new ReferralEnrollmentError("identity_unverified");
      }
      if (
        !UUID_PATTERN.test(input.buyerUserId) ||
        !UUID_PATTERN.test(input.termsVersionId) ||
        !SHA256_PATTERN.test(input.termsContentHash)
      ) {
        throw new ReferralEnrollmentError("invalid_input");
      }

      const generated = Object.freeze({
        acceptanceId: dependencies.createAcceptanceId(),
        referralCodeId: dependencies.createReferralCodeId(),
        code: dependencies.createReferralCode(),
      });
      if (!validGeneratedValues(generated)) {
        throw new ReferralEnrollmentError("invalid_input");
      }

      const result = await dependencies.enrollInTransaction({
        ...generated,
        buyerUserId: input.buyerUserId,
        termsVersionId: input.termsVersionId,
        termsContentHash: input.termsContentHash,
        acceptedAt,
      });
      if (
        (result.status !== "applied" && result.status !== "idempotent") ||
        !REFERRAL_CODE_PATTERN.test(result.code) ||
        !Number.isFinite(new Date(result.createdAt).getTime()) ||
        new Date(result.createdAt).toISOString() !== result.createdAt ||
        result.createdAt > acceptedAt.toISOString()
      ) {
        throw new ReferralEnrollmentError("invalid_input");
      }
      return Object.freeze({
        status: result.status === "applied" ? "enrolled" : "idempotent",
        code: result.code,
        createdAt: result.createdAt,
      });
    },
  });
}
