import { createHash } from "node:crypto";

import type { VerifiedIdentity } from "@/auth/identity";
import { isVerifiedIdentityAt } from "@/auth/identity";
import type {
  GrowthSqlClient,
  GrowthTransactionRunner,
} from "@/db/repositories/growth-repository";
import { runSerializableWithRetry } from "@/db/serializable-retry";
import {
  authorizeOperation,
  type Principal,
} from "@/domain/authorization";
import {
  scanPublicCopy,
  type PublicationPolicy,
} from "@/domain/content-policy";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const PUBLIC_CODE_PATTERN = /^aff_[A-Za-z0-9_-]{16,64}$/u;
const HANDLE_PATTERN = /^@[A-Za-z0-9_][A-Za-z0-9._-]{1,63}$/u;
const MAXIMUM_CHANNEL_LENGTH = 200;

export type AffiliatePromotionMethod = "website" | "social" | "email" | "other";
export type AffiliateProfileStatus = "pending" | "active" | "rejected" | "suspended";

export type AffiliateApplicationErrorCode =
  | "buyer_inactive"
  | "content_rejected"
  | "identity_unverified"
  | "idempotency_conflict"
  | "invalid_channel"
  | "invalid_input"
  | "invalid_promotion_method"
  | "persistence_conflict"
  | "terms_mismatch"
  | "terms_unavailable";

export class AffiliateApplicationError extends Error {
  readonly code: AffiliateApplicationErrorCode;

  constructor(code: AffiliateApplicationErrorCode) {
    super(code);
    this.name = "AffiliateApplicationError";
    this.code = code;
  }
}

export type AffiliateApplicationTransactionInput = Readonly<{
  acceptanceId: string;
  profileId: string;
  buyerUserId: string;
  publicCode: string;
  publicChannel: string;
  promotionMethod: AffiliatePromotionMethod;
  termsVersionId: string;
  termsContentHash: string;
  acceptedAt: Date;
}>;

export type AffiliateApplicationProfile = Readonly<{
  id: string;
  buyerUserId: string;
  publicCode: string;
  status: AffiliateProfileStatus;
  version: number;
  publicChannel: string;
  promotionMethod: AffiliatePromotionMethod;
  termsAcceptanceId: string;
  createdAt: string;
}>;

export type AffiliateApplicationTransactionResult = Readonly<{
  status: "applied" | "idempotent";
  profile: AffiliateApplicationProfile;
}>;

export type AffiliateApplicationTransaction = (
  input: AffiliateApplicationTransactionInput,
) => Promise<AffiliateApplicationTransactionResult>;

export type AffiliateApplicationInput = Readonly<{
  buyerUserId: string;
  buyerStatus: "active" | "review" | "blocked";
  identity: VerifiedIdentity;
  publicChannel: string;
  promotionMethod: AffiliatePromotionMethod;
  termsVersionId: string;
  termsContentHash: string;
}>;

export type AffiliateApplicationResult = Readonly<{
  status: "submitted" | "idempotent";
  application: Readonly<{
    publicCode: string;
    status: AffiliateProfileStatus;
    version: number;
    publicChannel: string;
    promotionMethod: AffiliatePromotionMethod;
    createdAt: string;
  }>;
}>;

export type AffiliateAdminErrorCode =
  | "audit_conflict"
  | "authorization_denied"
  | "invalid_input"
  | "invalid_transition"
  | "persistence_conflict"
  | "version_conflict";

export class AffiliateAdminError extends Error {
  readonly code: AffiliateAdminErrorCode;

  constructor(code: AffiliateAdminErrorCode) {
    super(code);
    this.name = "AffiliateAdminError";
    this.code = code;
  }
}

export type AffiliateAdminMutationTransactionInput = Readonly<{
  actorUserId: string;
  profileId: string;
  expectedVersion: number;
  targetStatus: "active" | "rejected" | "suspended";
  correlationId: string;
  mutatedAt: Date;
}>;

export type AffiliateAdminMutationTransactionResult = Readonly<{
  profile: Readonly<{
    id: string;
    status: "active" | "rejected" | "suspended";
    version: number;
    updatedAt: string;
  }>;
}>;

export type AffiliateAdminMutationTransaction = (
  input: AffiliateAdminMutationTransactionInput,
) => Promise<AffiliateAdminMutationTransactionResult>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPromotionMethod(value: unknown): value is AffiliatePromotionMethod {
  return value === "website" || value === "social" || value === "email" || value === "other";
}

function canonicalPublicChannel(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAXIMUM_CHANNEL_LENGTH ||
    value !== value.trim()
  ) {
    throw new AffiliateApplicationError("invalid_channel");
  }
  if (HANDLE_PATTERN.test(value)) return value;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.hostname.length === 0 ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0 ||
      parsed.toString() !== value
    ) {
      throw new AffiliateApplicationError("invalid_channel");
    }
    return value;
  } catch (error) {
    if (error instanceof AffiliateApplicationError) throw error;
    throw new AffiliateApplicationError("invalid_channel");
  }
}

function canonicalIsoAtOrBefore(value: unknown, upperBound: Date): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString() !== value ||
    parsed.getTime() > upperBound.getTime()
  ) {
    return null;
  }
  return value;
}

function iso(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new AffiliateApplicationError("persistence_conflict");
  }
  return parsed.toISOString();
}

type StoredProfileRow = {
  id: string;
  buyerUserId: string;
  publicCode: string;
  status: AffiliateProfileStatus;
  version: number;
  publicChannel: string;
  promotionMethod: AffiliatePromotionMethod;
  termsAcceptanceId: string;
  createdAt: Date | string;
};

const profileProjection = `id::text AS id, user_id::text AS "buyerUserId",
  public_code AS "publicCode", status, version,
  public_channel AS "publicChannel", promotion_method AS "promotionMethod",
  terms_acceptance_id::text AS "termsAcceptanceId", created_at AS "createdAt"`;

function projectStoredProfile(row: StoredProfileRow): AffiliateApplicationProfile {
  return Object.freeze({
    id: row.id,
    buyerUserId: row.buyerUserId,
    publicCode: row.publicCode,
    status: row.status,
    version: row.version,
    publicChannel: row.publicChannel,
    promotionMethod: row.promotionMethod,
    termsAcceptanceId: row.termsAcceptanceId,
    createdAt: iso(row.createdAt),
  });
}

function isCoherentAffiliateProfileState(
  status: unknown,
  version: unknown,
): status is AffiliateProfileStatus {
  return (
    (status === "pending" && version === 1) ||
    ((status === "active" || status === "rejected") && version === 2) ||
    (status === "suspended" && version === 3)
  );
}

function validTransactionInput(input: AffiliateApplicationTransactionInput): boolean {
  return (
    isRecord(input) &&
    UUID_PATTERN.test(input.acceptanceId) &&
    UUID_PATTERN.test(input.profileId) &&
    UUID_PATTERN.test(input.buyerUserId) &&
    PUBLIC_CODE_PATTERN.test(input.publicCode) &&
    isPromotionMethod(input.promotionMethod) &&
    UUID_PATTERN.test(input.termsVersionId) &&
    SHA256_PATTERN.test(input.termsContentHash) &&
    input.acceptedAt instanceof Date &&
    Number.isFinite(input.acceptedAt.getTime())
  );
}

async function applyWithPostgresClient(
  client: GrowthSqlClient,
  input: AffiliateApplicationTransactionInput,
): Promise<AffiliateApplicationTransactionResult> {
  if (!validTransactionInput(input)) {
    throw new AffiliateApplicationError("invalid_input");
  }
  const publicChannel = canonicalPublicChannel(input.publicChannel);
  const acceptedAt = input.acceptedAt.toISOString();

  type BuyerRow = {
    id: string;
    status: "active" | "review" | "blocked";
    emailVerifiedAt: Date | string | null;
  };
  const buyer = await client.query<BuyerRow>(
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
    throw new AffiliateApplicationError("buyer_inactive");
  }
  if (buyerRow.emailVerifiedAt === null || iso(buyerRow.emailVerifiedAt) > acceptedAt) {
    throw new AffiliateApplicationError("identity_unverified");
  }

  const existingProfiles = await client.query<StoredProfileRow>(
    `SELECT ${profileProjection}
     FROM affiliate_profiles
     WHERE id = $1::uuid OR user_id = $2::uuid OR public_code = $3
     ORDER BY id
     FOR UPDATE`,
    [input.profileId, input.buyerUserId, input.publicCode],
  );
  if (existingProfiles.rows.length > 1) {
    throw new AffiliateApplicationError("idempotency_conflict");
  }
  const existingProfile = existingProfiles.rows[0];
  if (existingProfile) {
    if (
      existingProfile.buyerUserId !== input.buyerUserId ||
      !UUID_PATTERN.test(existingProfile.id) ||
      !PUBLIC_CODE_PATTERN.test(existingProfile.publicCode) ||
      !isCoherentAffiliateProfileState(existingProfile.status, existingProfile.version) ||
      existingProfile.publicChannel !== publicChannel ||
      existingProfile.promotionMethod !== input.promotionMethod ||
      !UUID_PATTERN.test(existingProfile.termsAcceptanceId)
    ) {
      throw new AffiliateApplicationError("idempotency_conflict");
    }
    type AcceptanceRow = {
      id: string;
      buyerUserId: string;
      program: string;
      termsVersionId: string;
      contentHash: string;
      acceptedAt: Date | string;
      termsContentHash: string;
      termsText: string;
    };
    const acceptances = await client.query<AcceptanceRow>(
      `SELECT a.id::text AS id, a.user_id::text AS "buyerUserId",
              a.program, a.terms_version_id::text AS "termsVersionId",
              a.content_hash AS "contentHash", a.accepted_at AS "acceptedAt",
              t.content_hash AS "termsContentHash", t.terms_text AS "termsText"
       FROM growth_terms_acceptances a
       JOIN growth_terms_versions t
         ON t.id = a.terms_version_id AND t.program = a.program
       WHERE a.id = $1::uuid OR a.id = $2::uuid
       ORDER BY a.id
       FOR UPDATE OF a, t`,
      [existingProfile.termsAcceptanceId, input.acceptanceId],
    );
    const acceptanceRow = acceptances.rows[0];
    const computedAcceptedHash = acceptanceRow
      ? createHash("sha256").update(acceptanceRow.termsText).digest("hex")
      : null;
    if (
      acceptances.rows.length !== 1 ||
      !acceptanceRow ||
      acceptanceRow.id !== existingProfile.termsAcceptanceId ||
      acceptanceRow.buyerUserId !== input.buyerUserId ||
      acceptanceRow.program !== "affiliate" ||
      acceptanceRow.termsVersionId !== input.termsVersionId ||
      acceptanceRow.contentHash !== computedAcceptedHash ||
      acceptanceRow.termsContentHash !== computedAcceptedHash ||
      input.termsContentHash !== computedAcceptedHash ||
      iso(acceptanceRow.acceptedAt) > acceptedAt
    ) {
      throw new AffiliateApplicationError("idempotency_conflict");
    }
    return Object.freeze({
      status: "idempotent",
      profile: projectStoredProfile(existingProfile),
    });
  }

  type TermsRow = {
    id: string;
    contentHash: string;
    termsText: string;
  };
  const currentTerms = await client.query<TermsRow>(
    `SELECT id::text AS id, content_hash AS "contentHash",
            terms_text AS "termsText"
     FROM growth_terms_versions
     WHERE program = 'affiliate'
       AND effective_at <= $1::timestamptz
       AND (superseded_at IS NULL OR superseded_at > $1::timestamptz)
     ORDER BY effective_at DESC, version DESC, id
     FOR UPDATE`,
    [acceptedAt],
  );
  const terms = currentTerms.rows[0];
  if (currentTerms.rows.length !== 1 || !terms) {
    throw new AffiliateApplicationError("terms_unavailable");
  }
  const computedHash = createHash("sha256").update(terms.termsText).digest("hex");
  if (
    terms.id !== input.termsVersionId ||
    terms.contentHash !== computedHash ||
    input.termsContentHash !== computedHash
  ) {
    throw new AffiliateApplicationError("terms_mismatch");
  }

  const existingAcceptances = await client.query<{ id: string }>(
    `SELECT id::text AS id
     FROM growth_terms_acceptances
     WHERE id = $1::uuid OR (user_id = $2::uuid AND program = 'affiliate')
     ORDER BY id
     FOR UPDATE`,
    [input.acceptanceId, input.buyerUserId],
  );
  if (existingAcceptances.rows.length !== 0) {
    throw new AffiliateApplicationError("idempotency_conflict");
  }

  await client.query(
    `INSERT INTO growth_terms_acceptances
       (id, user_id, program, terms_version_id, content_hash, accepted_at)
     VALUES ($1::uuid, $2::uuid, 'affiliate', $3::uuid, $4, $5::timestamptz)`,
    [input.acceptanceId, input.buyerUserId, terms.id, computedHash, acceptedAt],
  );
  const inserted = await client.query<StoredProfileRow>(
    `INSERT INTO affiliate_profiles
       (id, user_id, public_code, status, version, public_channel,
        promotion_method, terms_acceptance_id, terms_program, created_at,
        updated_at)
     VALUES ($1::uuid, $2::uuid, $3, 'pending', 1, $4,
             $5::affiliate_promotion_method, $6::uuid, 'affiliate',
             $7::timestamptz, $7::timestamptz)
     RETURNING ${profileProjection}`,
    [input.profileId, input.buyerUserId, input.publicCode, publicChannel,
      input.promotionMethod, input.acceptanceId, acceptedAt],
  );
  const insertedProfile = inserted.rows[0];
  if (!insertedProfile) {
    throw new AffiliateApplicationError("persistence_conflict");
  }
  return Object.freeze({
    status: "applied",
    profile: projectStoredProfile(insertedProfile),
  });
}

export function createPostgresAffiliateApplicationTransaction(
  dependencies: Readonly<{
    runSerializableTransaction: GrowthTransactionRunner;
    retrySleep?: (
      retryNumber: 1 | 2,
      sqlState: "40001" | "40P01",
    ) => Promise<void>;
  }>,
): AffiliateApplicationTransaction {
  return (input) => runSerializableWithRetry(
    () => dependencies.runSerializableTransaction(
      (client) => applyWithPostgresClient(client, input),
      { isolationLevel: "serializable" },
    ),
    dependencies.retrySleep === undefined
      ? {}
      : { sleep: dependencies.retrySleep },
  ).catch((error: unknown) => {
    if (error instanceof AffiliateApplicationError) throw error;
    throw new AffiliateApplicationError("persistence_conflict");
  });
}

function validateTransactionResult(
  result: AffiliateApplicationTransactionResult,
  input: AffiliateApplicationTransactionInput,
): AffiliateApplicationTransactionResult {
  if (
    !isRecord(result) ||
    (result.status !== "applied" && result.status !== "idempotent") ||
    !isRecord(result.profile) ||
    result.profile.buyerUserId !== input.buyerUserId ||
    !UUID_PATTERN.test(result.profile.id) ||
    !PUBLIC_CODE_PATTERN.test(result.profile.publicCode) ||
    !isCoherentAffiliateProfileState(result.profile.status, result.profile.version) ||
    result.profile.publicChannel !== input.publicChannel ||
    result.profile.promotionMethod !== input.promotionMethod ||
    !UUID_PATTERN.test(result.profile.termsAcceptanceId) ||
    canonicalIsoAtOrBefore(result.profile.createdAt, input.acceptedAt) === null
  ) {
    throw new AffiliateApplicationError("persistence_conflict");
  }
  if (
    result.status === "applied" &&
    (result.profile.status !== "pending" ||
      result.profile.version !== 1 ||
      result.profile.id !== input.profileId ||
      result.profile.publicCode !== input.publicCode ||
      result.profile.termsAcceptanceId !== input.acceptanceId)
  ) {
    throw new AffiliateApplicationError("persistence_conflict");
  }
  return result;
}

function exactApplicationInput(value: unknown): AffiliateApplicationInput {
  if (!isRecord(value)) throw new AffiliateApplicationError("invalid_input");
  const keys = Object.keys(value);
  const expected = [
    "buyerUserId",
    "buyerStatus",
    "identity",
    "publicChannel",
    "promotionMethod",
    "termsVersionId",
    "termsContentHash",
  ];
  if (keys.length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) {
    throw new AffiliateApplicationError("invalid_input");
  }
  return value as AffiliateApplicationInput;
}

export function createAffiliateService(dependencies: Readonly<{
  clock: () => Date;
  createAcceptanceId: () => string;
  createProfileId: () => string;
  createPublicCode: () => string;
  publicationPolicy: PublicationPolicy;
  applyInTransaction: AffiliateApplicationTransaction;
}>) {
  return Object.freeze({
    async applyForAffiliate(input: unknown): Promise<AffiliateApplicationResult> {
      const exact = exactApplicationInput(input);
      const acceptedAt = dependencies.clock();
      if (!(acceptedAt instanceof Date) || !Number.isFinite(acceptedAt.getTime())) {
        throw new AffiliateApplicationError("invalid_input");
      }
      if (exact.buyerStatus !== "active") {
        throw new AffiliateApplicationError("buyer_inactive");
      }
      if (!isRecord(exact.identity) || !isVerifiedIdentityAt(exact.identity, acceptedAt)) {
        throw new AffiliateApplicationError("identity_unverified");
      }
      if (!isPromotionMethod(exact.promotionMethod)) {
        throw new AffiliateApplicationError("invalid_promotion_method");
      }
      if (
        typeof exact.publicChannel !== "string" ||
        exact.publicChannel.length === 0 ||
        exact.publicChannel.length > MAXIMUM_CHANNEL_LENGTH ||
        exact.publicChannel !== exact.publicChannel.trim()
      ) {
        throw new AffiliateApplicationError("invalid_channel");
      }
      if (
        !scanPublicCopy(
          { text: exact.publicChannel, claims: [] },
          dependencies.publicationPolicy,
        ).publishable
      ) {
        throw new AffiliateApplicationError("content_rejected");
      }
      const publicChannel = canonicalPublicChannel(exact.publicChannel);
      if (
        typeof exact.buyerUserId !== "string" ||
        !UUID_PATTERN.test(exact.buyerUserId) ||
        typeof exact.termsVersionId !== "string" ||
        !UUID_PATTERN.test(exact.termsVersionId) ||
        typeof exact.termsContentHash !== "string" ||
        !SHA256_PATTERN.test(exact.termsContentHash)
      ) {
        throw new AffiliateApplicationError("invalid_input");
      }

      const generated = Object.freeze({
        acceptanceId: dependencies.createAcceptanceId(),
        profileId: dependencies.createProfileId(),
        publicCode: dependencies.createPublicCode(),
      });
      if (
        !UUID_PATTERN.test(generated.acceptanceId) ||
        !UUID_PATTERN.test(generated.profileId) ||
        !PUBLIC_CODE_PATTERN.test(generated.publicCode)
      ) {
        throw new AffiliateApplicationError("invalid_input");
      }

      const transactionInput = Object.freeze({
        ...generated,
        buyerUserId: exact.buyerUserId,
        publicChannel,
        promotionMethod: exact.promotionMethod,
        termsVersionId: exact.termsVersionId,
        termsContentHash: exact.termsContentHash,
        acceptedAt: new Date(acceptedAt),
      });
      const result = validateTransactionResult(
        await dependencies.applyInTransaction(transactionInput),
        transactionInput,
      );
      const application = Object.freeze({
        publicCode: result.profile.publicCode,
        status: result.profile.status,
        version: result.profile.version,
        publicChannel: result.profile.publicChannel,
        promotionMethod: result.profile.promotionMethod,
        createdAt: result.profile.createdAt,
      });
      return Object.freeze({
        status: result.status === "applied" ? "submitted" : "idempotent",
        application,
      });
    },
  });
}

const CORRELATION_PATTERN = /^[^\p{Cc}\p{Cf}]{16,200}$/u;

function authorizeGrowthAdmin(principal: Principal): void {
  const decision = authorizeOperation({
    principal,
    operation: "growth.manage",
    resource: { relation: "capability_only" },
  });
  if (!decision.allowed) {
    throw new AffiliateAdminError("authorization_denied");
  }
}

function parseAdminInput(
  value: unknown,
  kind: "decision" | "suspension",
): Readonly<{
  principal: Principal;
  profileId: string;
  expectedVersion: number;
  correlationId: string;
  targetStatus: "active" | "rejected" | "suspended";
}> {
  if (!isRecord(value)) throw new AffiliateAdminError("invalid_input");
  const expectedKeys = kind === "decision"
    ? ["principal", "profileId", "expectedVersion", "decision", "correlationId"]
    : ["principal", "profileId", "expectedVersion", "correlationId"];
  const keys = Object.keys(value);
  if (
    keys.length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(value, key)) ||
    !UUID_PATTERN.test(String(value.profileId ?? "")) ||
    !Number.isSafeInteger(value.expectedVersion) ||
    (value.expectedVersion as number) < 1 ||
    typeof value.correlationId !== "string" ||
    value.correlationId !== value.correlationId.trim() ||
    !CORRELATION_PATTERN.test(value.correlationId)
  ) {
    throw new AffiliateAdminError("invalid_input");
  }
  const targetStatus = kind === "suspension" ? "suspended" : value.decision;
  if (targetStatus !== "active" && targetStatus !== "rejected" && targetStatus !== "suspended") {
    throw new AffiliateAdminError("invalid_input");
  }
  return Object.freeze({
    principal: value.principal as Principal,
    profileId: value.profileId as string,
    expectedVersion: value.expectedVersion as number,
    correlationId: value.correlationId,
    targetStatus,
  });
}

function projectAdminMutation(
  result: AffiliateAdminMutationTransactionResult,
  expected: Readonly<{
    profileId: string;
    expectedVersion: number;
    targetStatus: "active" | "rejected" | "suspended";
    mutatedAt: Date;
  }>,
) {
  if (
    !isRecord(result) ||
    !isRecord(result.profile) ||
    result.profile.id !== expected.profileId ||
    result.profile.status !== expected.targetStatus ||
    result.profile.version !== expected.expectedVersion + 1 ||
    canonicalIsoAtOrBefore(result.profile.updatedAt, expected.mutatedAt) === null
  ) {
    throw new AffiliateAdminError("persistence_conflict");
  }
  return Object.freeze({
    status: result.profile.status,
    version: result.profile.version,
    updatedAt: result.profile.updatedAt,
  });
}

export function createAffiliateAdminService(dependencies: Readonly<{
  clock: () => Date;
  mutateInTransaction: AffiliateAdminMutationTransaction;
}>) {
  async function mutate(value: unknown, kind: "decision" | "suspension") {
    const parsed = parseAdminInput(value, kind);
    authorizeGrowthAdmin(parsed.principal);
    const mutatedAt = dependencies.clock();
    if (!(mutatedAt instanceof Date) || !Number.isFinite(mutatedAt.getTime())) {
      throw new AffiliateAdminError("invalid_input");
    }
    const result = await dependencies.mutateInTransaction(Object.freeze({
      actorUserId: parsed.principal.actorId,
      profileId: parsed.profileId,
      expectedVersion: parsed.expectedVersion,
      targetStatus: parsed.targetStatus,
      correlationId: parsed.correlationId,
      mutatedAt: new Date(mutatedAt),
    }));
    return projectAdminMutation(result, {
      profileId: parsed.profileId,
      expectedVersion: parsed.expectedVersion,
      targetStatus: parsed.targetStatus,
      mutatedAt,
    });
  }

  return Object.freeze({
    decideApplication(input: unknown) {
      return mutate(input, "decision");
    },
    suspendAffiliate(input: unknown) {
      return mutate(input, "suspension");
    },
  });
}

function validAdminTransactionInput(
  input: AffiliateAdminMutationTransactionInput,
): boolean {
  return (
    isRecord(input) &&
    UUID_PATTERN.test(input.actorUserId) &&
    UUID_PATTERN.test(input.profileId) &&
    Number.isSafeInteger(input.expectedVersion) &&
    input.expectedVersion > 0 &&
    (input.targetStatus === "active" ||
      input.targetStatus === "rejected" ||
      input.targetStatus === "suspended") &&
    input.correlationId === input.correlationId.trim() &&
    CORRELATION_PATTERN.test(input.correlationId) &&
    input.mutatedAt instanceof Date &&
    Number.isFinite(input.mutatedAt.getTime())
  );
}

async function mutateAdminWithPostgresClient(
  client: GrowthSqlClient,
  input: AffiliateAdminMutationTransactionInput,
): Promise<AffiliateAdminMutationTransactionResult> {
  if (!validAdminTransactionInput(input)) {
    throw new AffiliateAdminError("invalid_input");
  }
  type CurrentRow = {
    id: string;
    status: "pending" | "active" | "rejected" | "suspended";
    version: number;
  };
  const current = await client.query<CurrentRow>(
    `SELECT id::text AS id, status, version
     FROM affiliate_profiles
     WHERE id = $1::uuid
     FOR UPDATE`,
    [input.profileId],
  );
  const currentProfile = current.rows[0];
  if (
    current.rows.length !== 1 ||
    !currentProfile ||
    currentProfile.version !== input.expectedVersion
  ) {
    throw new AffiliateAdminError("version_conflict");
  }
  const allowed =
    (currentProfile.status === "pending" &&
      (input.targetStatus === "active" || input.targetStatus === "rejected")) ||
    (currentProfile.status === "active" && input.targetStatus === "suspended");
  if (!allowed) {
    throw new AffiliateAdminError("invalid_transition");
  }
  type UpdatedRow = {
    id: string;
    status: "active" | "rejected" | "suspended";
    version: number;
    updatedAt: Date | string;
  };
  const updated = await client.query<UpdatedRow>(
    `UPDATE affiliate_profiles
     SET status = $2::affiliate_profile_status,
         version = version + 1,
         updated_at = $3::timestamptz
     WHERE id = $1::uuid
       AND status = $4::affiliate_profile_status
       AND version = $5
     RETURNING id::text AS id, status, version, updated_at AS "updatedAt"`,
    [input.profileId, input.targetStatus, input.mutatedAt.toISOString(),
      currentProfile.status, input.expectedVersion],
  );
  const updatedProfile = updated.rows[0];
  if (
    updated.rows.length !== 1 ||
    !updatedProfile ||
    updatedProfile.version !== input.expectedVersion + 1
  ) {
    throw new AffiliateAdminError("version_conflict");
  }

  const action = input.targetStatus === "suspended"
    ? "affiliate.suspended"
    : `affiliate.application.${input.targetStatus}`;
  const metadata = Object.freeze({
    fromStatus: currentProfile.status,
    toStatus: input.targetStatus,
    fromVersion: currentProfile.version,
    toVersion: updatedProfile.version,
  });
  try {
    const audit = await client.query<{ id: string }>(
      `INSERT INTO admin_audit
         (actor_user_id, service_identity, action, resource_type, resource_id,
          correlation_id, metadata, occurred_at)
       VALUES ($1::uuid, NULL, $2, 'affiliate_profile', $3, $4,
               $5::jsonb, $6::timestamptz)
       RETURNING id::text AS id`,
      [input.actorUserId, action, input.profileId, input.correlationId,
        JSON.stringify(metadata), input.mutatedAt.toISOString()],
    );
    if (audit.rows.length !== 1 || !audit.rows[0]) {
      throw new AffiliateAdminError("audit_conflict");
    }
  } catch (error) {
    if (error instanceof AffiliateAdminError) throw error;
    throw new AffiliateAdminError("audit_conflict");
  }
  return Object.freeze({
    profile: Object.freeze({
      id: updatedProfile.id,
      status: updatedProfile.status,
      version: updatedProfile.version,
      updatedAt: iso(updatedProfile.updatedAt),
    }),
  });
}

export function createPostgresAffiliateAdminMutationTransaction(
  dependencies: Readonly<{
    runSerializableTransaction: GrowthTransactionRunner;
    retrySleep?: (
      retryNumber: 1 | 2,
      sqlState: "40001" | "40P01",
    ) => Promise<void>;
  }>,
): AffiliateAdminMutationTransaction {
  return (input) => runSerializableWithRetry(
    () => dependencies.runSerializableTransaction(
      (client) => mutateAdminWithPostgresClient(client, input),
      { isolationLevel: "serializable" },
    ),
    dependencies.retrySleep === undefined
      ? {}
      : { sleep: dependencies.retrySleep },
  ).catch((error: unknown) => {
    if (error instanceof AffiliateAdminError) throw error;
    throw new AffiliateAdminError("persistence_conflict");
  });
}
