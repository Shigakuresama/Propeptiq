import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import type { VerifiedIdentity } from "@/auth/identity";
import { getRequestIdentity } from "@/auth/server";
import {
  authorizeOperation,
  type Principal,
} from "@/domain/authorization";
import { createPostgresRateLimitStore } from "@/db/repositories/rate-limit-store";
import type { GrowthTransactionRunner } from "@/db/repositories/growth-repository";
import { withRuntimeTransaction } from "@/db/runtime";
import type {
  AffiliateApplicationInput,
  AffiliateApplicationResult,
  AffiliatePromotionMethod,
} from "@/growth/affiliate-service";
import {
  AffiliateApplicationError,
  AffiliatePayoutError,
  createAffiliateService,
  createPostgresAffiliateApplicationTransaction,
} from "@/growth/affiliate-service";
import type {
  CustomerReferralEnrollmentInput,
  CustomerReferralEnrollmentResult,
} from "@/growth/referral-service";
import {
  createPostgresReferralEnrollmentTransaction,
  createReferralService,
} from "@/growth/referral-service";
import {
  createPostgresSharedSetMutationPort,
  createSharedSetService,
  deriveSharedSetCreateIdentity,
  SharedSetServiceError,
} from "@/growth/shared-set-service";
import { assertMutationOrigin } from "@/security/origin";
import {
  consumeFixedWindowLimit,
  createRateLimitScope,
  type RateLimitStore,
} from "@/security/rate-limit";

export type CustomerReferralEnrollmentActionResult = Readonly<{
  state: "success" | "error";
  code:
    | "enrolled"
    | "idempotent"
    | "identity"
    | "invalid"
    | "origin"
    | "rate_limit"
    | "unavailable";
  referralCode: string | null;
}>;

type EnrollmentActor = Readonly<{
  buyerUserId: string;
  buyerStatus: "active" | "review" | "blocked";
  identity: VerifiedIdentity;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

function failure(
  code: Exclude<CustomerReferralEnrollmentActionResult["code"], "enrolled" | "idempotent">,
): CustomerReferralEnrollmentActionResult {
  return Object.freeze({ state: "error", code, referralCode: null });
}

function parseEnrollmentForm(formData: FormData): Readonly<{
  termsVersionId: string;
  termsContentHash: string;
}> | null {
  const suppliedKeys = [...formData.keys()].filter(
    (key) => !key.startsWith("$ACTION_"),
  );
  if (
    suppliedKeys.length !== 3 ||
    new Set(suppliedKeys).size !== 3 ||
    !suppliedKeys.includes("acceptCurrentTerms") ||
    !suppliedKeys.includes("termsVersionId") ||
    !suppliedKeys.includes("termsContentHash")
  ) {
    return null;
  }
  const acceptance = formData.get("acceptCurrentTerms");
  const termsVersionId = formData.get("termsVersionId");
  const termsContentHash = formData.get("termsContentHash");
  if (
    acceptance !== "yes" ||
    typeof termsVersionId !== "string" ||
    !UUID_PATTERN.test(termsVersionId) ||
    typeof termsContentHash !== "string" ||
    !SHA256_PATTERN.test(termsContentHash)
  ) {
    return null;
  }
  return Object.freeze({ termsVersionId, termsContentHash });
}

export function createCustomerReferralEnrollmentAction(dependencies: Readonly<{
  environment: Readonly<{
    APP_ENV: "local" | "preview" | "production";
    APP_ORIGIN?: string;
    RATE_LIMIT_SECRET: string;
  }>;
  clock: () => Date;
  limit?: number;
  rateLimitStore: RateLimitStore;
  loadActor: () => Promise<EnrollmentActor | null>;
  enrollCustomerReferral: (
    input: CustomerReferralEnrollmentInput,
  ) => Promise<CustomerReferralEnrollmentResult>;
}>) {
  return async function customerReferralEnrollmentAction(
    request: Request,
    formData: FormData,
  ): Promise<CustomerReferralEnrollmentActionResult> {
    try {
      assertMutationOrigin(request, dependencies.environment);
    } catch {
      return failure("origin");
    }
    const parsed = parseEnrollmentForm(formData);
    if (!parsed) return failure("invalid");
    const now = dependencies.clock();
    if (!Number.isFinite(now.getTime())) return failure("unavailable");
    const actor = await dependencies.loadActor();
    if (!actor) return failure("identity");

    let decision;
    try {
      decision = await consumeFixedWindowLimit({
        store: dependencies.rateLimitStore,
        scope: createRateLimitScope(
          actor.buyerUserId,
          "customer_referral.enroll",
          dependencies.environment.RATE_LIMIT_SECRET,
        ),
        limit: dependencies.limit ?? 5,
        windowMs: 60_000,
        now,
      });
    } catch {
      return failure("unavailable");
    }
    if (!decision.allowed) return failure("rate_limit");

    try {
      const result = await dependencies.enrollCustomerReferral({
        buyerUserId: actor.buyerUserId,
        buyerStatus: actor.buyerStatus,
        identity: actor.identity,
        termsVersionId: parsed.termsVersionId,
        termsContentHash: parsed.termsContentHash,
      });
      return Object.freeze({
        state: "success" as const,
        code: result.status,
        referralCode: result.code,
      });
    } catch {
      return failure("unavailable");
    }
  };
}

export async function enrollCustomerReferralAction(
  formData: FormData,
): Promise<CustomerReferralEnrollmentActionResult> {
  "use server";

  try {
    const requestIdentity = await getRequestIdentity();
    const environment = requestIdentity.environment;
    const identity = requestIdentity.identity;
    const principal = requestIdentity.principal;
    if (
      identity === null ||
      principal === null ||
      principal.clerkUserId !== identity.clerkUserId ||
      principal.buyerStatus === null ||
      environment.DATABASE_MODE === "disabled" ||
      environment.RATE_LIMIT_SECRET === undefined
    ) {
      return failure("identity");
    }
    const authorization = authorizeOperation({
      principal,
      operation: "referrals.create.self",
      resource: { relation: "owner", ownerActorId: principal.actorId },
    });
    if (!authorization.allowed) return failure("identity");

    const incoming = await headers();
    const suppliedOrigin = incoming.get("origin");
    const requestUrl = environment.APP_ORIGIN ?? suppliedOrigin ?? "http://localhost";
    const request = new Request(requestUrl, {
      method: "POST",
      headers: {
        ...(suppliedOrigin === null ? {} : { origin: suppliedOrigin }),
        ...(incoming.get("host") === null ? {} : { host: incoming.get("host")! }),
      },
    });
    const now = new Date();
    const runSerializableTransaction: GrowthTransactionRunner = (work, options) =>
      withRuntimeTransaction(environment, work, options);
    const enrollment = createPostgresReferralEnrollmentTransaction({
      runSerializableTransaction,
    });
    const service = createReferralService({
      clock: () => new Date(now),
      createAcceptanceId: randomUUID,
      createReferralCodeId: randomUUID,
      createReferralCode: () => `ref_${randomBytes(24).toString("base64url")}`,
      enrollInTransaction: enrollment,
    });
    const action = createCustomerReferralEnrollmentAction({
      environment: environment.APP_ORIGIN === undefined
        ? {
            APP_ENV: environment.APP_ENV,
            RATE_LIMIT_SECRET: environment.RATE_LIMIT_SECRET,
          }
        : {
            APP_ENV: environment.APP_ENV,
            APP_ORIGIN: environment.APP_ORIGIN,
            RATE_LIMIT_SECRET: environment.RATE_LIMIT_SECRET,
          },
      clock: () => new Date(now),
      rateLimitStore: {
        increment: (window) => withRuntimeTransaction(
          environment,
          (client) => createPostgresRateLimitStore(client).increment(window),
        ),
      },
      loadActor: async () => Object.freeze({
        buyerUserId: principal.actorId,
        buyerStatus: principal.buyerStatus!,
        identity,
      }),
      enrollCustomerReferral: service.enrollCustomerReferral,
    });
    const result = await action(request, formData);
    if (result.state === "success") revalidatePath("/account/referrals");
    return result;
  } catch {
    return failure("unavailable");
  }
}

export type AffiliateApplicationActionResult = Readonly<{
  state: "success" | "error";
  code:
    | "submitted"
    | "idempotent"
    | "conflict"
    | "identity"
    | "invalid"
    | "origin"
    | "rate_limit"
    | "unavailable";
  application: AffiliateApplicationResult["application"] | null;
}>;

type AffiliateApplicationActor = Readonly<{
  buyerUserId: string;
  buyerStatus: "active" | "review" | "blocked";
  identity: VerifiedIdentity;
  principal: Principal;
}>;

function affiliateFailure(
  code: Exclude<AffiliateApplicationActionResult["code"], "submitted" | "idempotent">,
): AffiliateApplicationActionResult {
  return Object.freeze({ state: "error", code, application: null });
}

function parseAffiliateApplicationForm(formData: FormData): Readonly<{
  publicChannel: string;
  promotionMethod: AffiliatePromotionMethod;
  termsVersionId: string;
  termsContentHash: string;
}> | null {
  const fields = [
    "publicChannel",
    "promotionMethod",
    "acceptCurrentTerms",
    "termsVersionId",
    "termsContentHash",
  ];
  const suppliedKeys = [...formData.keys()].filter(
    (key) => !key.startsWith("$ACTION_"),
  );
  if (
    suppliedKeys.length !== fields.length ||
    new Set(suppliedKeys).size !== fields.length ||
    !fields.every((field) => suppliedKeys.includes(field))
  ) {
    return null;
  }
  const publicChannel = formData.get("publicChannel");
  const promotionMethod = formData.get("promotionMethod");
  const acceptance = formData.get("acceptCurrentTerms");
  const termsVersionId = formData.get("termsVersionId");
  const termsContentHash = formData.get("termsContentHash");
  if (
    typeof publicChannel !== "string" ||
    publicChannel.length === 0 ||
    publicChannel.length > 200 ||
    publicChannel !== publicChannel.trim() ||
    (promotionMethod !== "website" &&
      promotionMethod !== "social" &&
      promotionMethod !== "email" &&
      promotionMethod !== "other") ||
    acceptance !== "yes" ||
    typeof termsVersionId !== "string" ||
    !UUID_PATTERN.test(termsVersionId) ||
    typeof termsContentHash !== "string" ||
    !SHA256_PATTERN.test(termsContentHash)
  ) {
    return null;
  }
  return Object.freeze({
    publicChannel,
    promotionMethod,
    termsVersionId,
    termsContentHash,
  });
}

function mapAffiliateApplicationError(error: unknown): AffiliateApplicationActionResult {
  if (!(error instanceof AffiliateApplicationError)) {
    return affiliateFailure("unavailable");
  }
  if (error.code === "buyer_inactive" || error.code === "identity_unverified") {
    return affiliateFailure("identity");
  }
  if (error.code === "idempotency_conflict") {
    return affiliateFailure("conflict");
  }
  if (
    error.code === "content_rejected" ||
    error.code === "invalid_channel" ||
    error.code === "invalid_input" ||
    error.code === "invalid_promotion_method" ||
    error.code === "terms_mismatch"
  ) {
    return affiliateFailure("invalid");
  }
  return affiliateFailure("unavailable");
}

export function createAffiliateApplicationAction(dependencies: Readonly<{
  environment: Readonly<{
    APP_ENV: "local" | "preview" | "production";
    APP_ORIGIN?: string;
    RATE_LIMIT_SECRET: string;
  }>;
  clock: () => Date;
  limit?: number;
  rateLimitStore: RateLimitStore;
  loadActor: () => Promise<AffiliateApplicationActor | null>;
  applyForAffiliate: (
    input: AffiliateApplicationInput,
  ) => Promise<AffiliateApplicationResult>;
}>) {
  return async function affiliateApplicationAction(
    request: Request,
    formData: FormData,
  ): Promise<AffiliateApplicationActionResult> {
    try {
      assertMutationOrigin(request, dependencies.environment);
    } catch {
      return affiliateFailure("origin");
    }
    const parsed = parseAffiliateApplicationForm(formData);
    if (!parsed) return affiliateFailure("invalid");
    const now = dependencies.clock();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      return affiliateFailure("unavailable");
    }
    const actor = await dependencies.loadActor();
    if (
      actor === null ||
      actor.buyerStatus !== "active" ||
      actor.principal.actorId !== actor.buyerUserId ||
      actor.principal.clerkUserId !== actor.identity.clerkUserId ||
      actor.principal.buyerStatus !== "active"
    ) {
      return affiliateFailure("identity");
    }
    const authorization = authorizeOperation({
      principal: actor.principal,
      operation: "affiliate.apply.self",
      resource: { relation: "owner", ownerActorId: actor.buyerUserId },
    });
    if (!authorization.allowed) return affiliateFailure("identity");

    try {
      const decision = await consumeFixedWindowLimit({
        store: dependencies.rateLimitStore,
        scope: createRateLimitScope(
          actor.buyerUserId,
          "affiliate.application.submit",
          dependencies.environment.RATE_LIMIT_SECRET,
        ),
        limit: dependencies.limit ?? 3,
        windowMs: 60_000,
        now,
      });
      if (!decision.allowed) return affiliateFailure("rate_limit");
    } catch {
      return affiliateFailure("unavailable");
    }

    try {
      const result = await dependencies.applyForAffiliate({
        buyerUserId: actor.buyerUserId,
        buyerStatus: actor.buyerStatus,
        identity: actor.identity,
        ...parsed,
      });
      return Object.freeze({
        state: "success" as const,
        code: result.status,
        application: Object.freeze({ ...result.application }),
      });
    } catch (error) {
      return mapAffiliateApplicationError(error);
    }
  };
}

export async function submitAffiliateApplicationAction(
  formData: FormData,
): Promise<AffiliateApplicationActionResult> {
  "use server";

  try {
    const requestIdentity = await getRequestIdentity();
    const environment = requestIdentity.environment;
    const identity = requestIdentity.identity;
    const principal = requestIdentity.principal;
    if (
      identity === null ||
      principal === null ||
      principal.clerkUserId !== identity.clerkUserId ||
      principal.buyerStatus !== "active" ||
      environment.DATABASE_MODE === "disabled" ||
      environment.RATE_LIMIT_SECRET === undefined
    ) {
      return affiliateFailure("identity");
    }
    const authorization = authorizeOperation({
      principal,
      operation: "affiliate.apply.self",
      resource: { relation: "owner", ownerActorId: principal.actorId },
    });
    if (!authorization.allowed) return affiliateFailure("identity");

    const incoming = await headers();
    const suppliedOrigin = incoming.get("origin");
    const requestUrl = environment.APP_ORIGIN ?? suppliedOrigin ?? "http://localhost";
    const request = new Request(requestUrl, {
      method: "POST",
      headers: {
        ...(suppliedOrigin === null ? {} : { origin: suppliedOrigin }),
        ...(incoming.get("host") === null ? {} : { host: incoming.get("host")! }),
      },
    });
    const now = new Date();
    const runSerializableTransaction: GrowthTransactionRunner = (work, options) =>
      withRuntimeTransaction(environment, work, options);
    const service = createAffiliateService({
      clock: () => new Date(now),
      createAcceptanceId: randomUUID,
      createProfileId: randomUUID,
      createPublicCode: () => `aff_${randomBytes(24).toString("base64url")}`,
      publicationPolicy: Object.freeze({
        version: "affiliate-public-channel-v1",
        activeLotEvidenceIds: Object.freeze([]),
      }),
      applyInTransaction: createPostgresAffiliateApplicationTransaction({
        runSerializableTransaction,
      }),
    });
    const action = createAffiliateApplicationAction({
      environment: environment.APP_ORIGIN === undefined
        ? {
            APP_ENV: environment.APP_ENV,
            RATE_LIMIT_SECRET: environment.RATE_LIMIT_SECRET,
          }
        : {
            APP_ENV: environment.APP_ENV,
            APP_ORIGIN: environment.APP_ORIGIN,
            RATE_LIMIT_SECRET: environment.RATE_LIMIT_SECRET,
          },
      clock: () => new Date(now),
      rateLimitStore: {
        increment: (window) => withRuntimeTransaction(
          environment,
          (client) => createPostgresRateLimitStore(client).increment(window),
        ),
      },
      loadActor: async () => Object.freeze({
        buyerUserId: principal.actorId,
        buyerStatus: principal.buyerStatus!,
        identity,
        principal,
      }),
      applyForAffiliate: service.applyForAffiliate,
    });
    const result = await action(request, formData);
    if (result.state === "success") revalidatePath("/account/partner");
    return result;
  } catch {
    return affiliateFailure("unavailable");
  }
}

type AffiliatePayoutActionPayout = Readonly<{
  id: string;
  affiliateProfileId: string;
  affiliatePolicyId: string;
  affiliatePolicyVersion: number;
  amountMinor: number;
  currency: "USD";
  state: "pending" | "paid";
  version: number;
  commissionCount: number;
  providerName: string | null;
  externalReference: string | null;
  createdAt: string;
  paidAt: string | null;
}>;

export type AffiliatePayoutActionResult = Readonly<{
  state: "success" | "error";
  code:
    | "created"
    | "paid"
    | "idempotent"
    | "threshold"
    | "ineligible"
    | "conflict"
    | "identity"
    | "invalid"
    | "origin"
    | "unavailable";
  payout: AffiliatePayoutActionPayout | null;
}>;

function payoutActionFailure(
  code: Exclude<AffiliatePayoutActionResult["code"], "created" | "paid" | "idempotent">,
): AffiliatePayoutActionResult {
  return Object.freeze({ state: "error", code, payout: null });
}

function exactPayoutFields(formData: FormData, fields: readonly string[]): boolean {
  const supplied = [...formData.keys()].filter((key) => !key.startsWith("$ACTION_"));
  return supplied.length === fields.length && new Set(supplied).size === fields.length &&
    fields.every((field) => supplied.includes(field));
}

function boundedActionText(value: FormDataEntryValue | null, maximum: number): value is string {
  return typeof value === "string" && value === value.trim() && value.length > 0 &&
    value.length <= maximum && !/[\p{Cc}\p{Cf}]/u.test(value);
}

function mapPayoutActionError(error: unknown): AffiliatePayoutActionResult {
  if (!(error instanceof AffiliatePayoutError)) return payoutActionFailure("unavailable");
  if (error.code === "authorization_denied") return payoutActionFailure("identity");
  if (error.code === "invalid_input") return payoutActionFailure("invalid");
  if (error.code === "profile_ineligible") return payoutActionFailure("ineligible");
  if (error.code === "threshold_not_met") return payoutActionFailure("threshold");
  if (error.code === "idempotency_conflict" || error.code === "version_conflict" ||
      error.code === "invalid_transition") return payoutActionFailure("conflict");
  return payoutActionFailure("unavailable");
}

function payoutPrincipalAllowed(principal: Principal | null): principal is Principal {
  if (principal === null) return false;
  return authorizeOperation({
    principal,
    operation: "affiliate.payout",
    resource: { relation: "capability_only" },
  }).allowed;
}

export function createAffiliatePayoutBatchAction(dependencies: Readonly<{
  environment: Readonly<{ APP_ENV: "local" | "preview" | "production"; APP_ORIGIN?: string }>;
  loadPrincipal: () => Promise<Principal | null>;
  createBatch: (input: Readonly<{
    principal: Principal;
    profileId: string;
    idempotencyKey: string;
    correlationId: string;
  }>) => Promise<Readonly<{
    status: "created" | "idempotent";
    payout: AffiliatePayoutActionPayout;
  }>>;
}>) {
  return async (request: Request, formData: FormData): Promise<AffiliatePayoutActionResult> => {
    try {
      assertMutationOrigin(request, dependencies.environment);
    } catch {
      return payoutActionFailure("origin");
    }
    const fields = ["profileId", "idempotencyKey", "correlationId"] as const;
    if (!exactPayoutFields(formData, fields)) return payoutActionFailure("invalid");
    const profileId = formData.get("profileId");
    const idempotencyKey = formData.get("idempotencyKey");
    const correlationId = formData.get("correlationId");
    if (typeof profileId !== "string" || !UUID_PATTERN.test(profileId) ||
        !boundedActionText(idempotencyKey, 200) ||
        !boundedActionText(correlationId, 200) || correlationId.length < 16) {
      return payoutActionFailure("invalid");
    }
    const principal = await dependencies.loadPrincipal();
    if (!payoutPrincipalAllowed(principal)) return payoutActionFailure("identity");
    try {
      const result = await dependencies.createBatch({
        principal, profileId, idempotencyKey, correlationId,
      });
      return Object.freeze({
        state: "success" as const,
        code: result.status,
        payout: Object.freeze({ ...result.payout }),
      });
    } catch (error) {
      return mapPayoutActionError(error);
    }
  };
}

export function createAffiliatePayoutPaidAction(dependencies: Readonly<{
  environment: Readonly<{ APP_ENV: "local" | "preview" | "production"; APP_ORIGIN?: string }>;
  loadPrincipal: () => Promise<Principal | null>;
  markPaid: (input: Readonly<{
    principal: Principal;
    payoutId: string;
    expectedVersion: number;
    idempotencyKey: string;
    providerName: string;
    externalReference: string;
    correlationId: string;
  }>) => Promise<Readonly<{
    status: "paid" | "idempotent";
    payout: AffiliatePayoutActionPayout;
  }>>;
}>) {
  return async (request: Request, formData: FormData): Promise<AffiliatePayoutActionResult> => {
    try {
      assertMutationOrigin(request, dependencies.environment);
    } catch {
      return payoutActionFailure("origin");
    }
    const fields = ["payoutId", "expectedVersion", "idempotencyKey", "providerName",
      "externalReference", "correlationId"] as const;
    if (!exactPayoutFields(formData, fields)) return payoutActionFailure("invalid");
    const payoutId = formData.get("payoutId");
    const expectedVersionText = formData.get("expectedVersion");
    const idempotencyKey = formData.get("idempotencyKey");
    const providerName = formData.get("providerName");
    const externalReference = formData.get("externalReference");
    const correlationId = formData.get("correlationId");
    const expectedVersion = typeof expectedVersionText === "string" && /^[1-9][0-9]*$/u.test(expectedVersionText)
      ? Number(expectedVersionText)
      : Number.NaN;
    if (typeof payoutId !== "string" || !UUID_PATTERN.test(payoutId) ||
        !Number.isSafeInteger(expectedVersion) ||
        !boundedActionText(idempotencyKey, 200) ||
        !boundedActionText(providerName, 120) ||
        !boundedActionText(externalReference, 200) ||
        !boundedActionText(correlationId, 200) || correlationId.length < 16) {
      return payoutActionFailure("invalid");
    }
    const principal = await dependencies.loadPrincipal();
    if (!payoutPrincipalAllowed(principal)) return payoutActionFailure("identity");
    try {
      const result = await dependencies.markPaid({
        principal, payoutId, expectedVersion, idempotencyKey, providerName,
        externalReference, correlationId,
      });
      return Object.freeze({
        state: "success" as const,
        code: result.status,
        payout: Object.freeze({ ...result.payout }),
      });
    } catch (error) {
      return mapPayoutActionError(error);
    }
  };
}

type SharedSetService = ReturnType<typeof createSharedSetService>;
type SharedSetMutationKind = "create" | "update" | "deactivate";

export type SharedSetActionResult = Readonly<{
  state: "success" | "error";
  code:
    | "created"
    | "updated"
    | "deactivated"
    | "idempotent"
    | "conflict"
    | "identity"
    | "invalid"
    | "origin"
    | "rate_limit"
    | "unavailable";
  set: Readonly<{
    code: string;
    label: string;
    active: boolean;
    itemCount: number;
    updatedAt: string;
  }> | null;
}>;

type SharedSetActionActor = Readonly<{
  buyerUserId: string;
  buyerStatus: "active" | "review" | "blocked";
  principal: Principal;
}>;

function sharedSetFailure(
  code: Exclude<
    SharedSetActionResult["code"],
    "created" | "updated" | "deactivated" | "idempotent"
  >,
): SharedSetActionResult {
  return Object.freeze({ state: "error", code, set: null });
}

function exactFormValues(
  formData: FormData,
  fields: readonly string[],
): Readonly<Record<string, string>> | null {
  const suppliedKeys = [...formData.keys()].filter(
    (key) => !key.startsWith("$ACTION_"),
  );
  if (
    suppliedKeys.length !== fields.length ||
    new Set(suppliedKeys).size !== fields.length ||
    !fields.every((field) => suppliedKeys.includes(field))
  ) {
    return null;
  }
  const values: Record<string, string> = {};
  for (const field of fields) {
    const value = formData.get(field);
    if (typeof value !== "string") return null;
    values[field] = value;
  }
  return Object.freeze(values);
}

function parseSharedSetForm(
  kind: SharedSetMutationKind,
  formData: FormData,
): Readonly<Record<string, unknown>> | null {
  const fields = kind === "create"
    ? ["idempotencyKey", "label", "items"]
    : kind === "update"
      ? ["code", "expectedUpdatedAt", "idempotencyKey", "label", "items"]
      : ["code", "expectedUpdatedAt", "idempotencyKey"];
  const values = exactFormValues(formData, fields);
  if (!values) return null;
  if (kind === "deactivate") return values;
  try {
    return Object.freeze({ ...values, items: JSON.parse(values.items!) as unknown });
  } catch {
    return null;
  }
}

function mapSharedSetActionError(error: unknown): SharedSetActionResult {
  if (!(error instanceof SharedSetServiceError)) {
    return sharedSetFailure("unavailable");
  }
  if (
    error.code === "version_conflict" ||
    error.code === "idempotency_conflict" ||
    error.code === "owner_conflict"
  ) {
    return sharedSetFailure("conflict");
  }
  if (
    error.code === "invalid_code" ||
    error.code === "invalid_input" ||
    error.code === "invalid_items" ||
    error.code === "invalid_label" ||
    error.code === "product_unavailable" ||
    error.code === "unexpected_field"
  ) {
    return sharedSetFailure("invalid");
  }
  if (error.code === "buyer_inactive") return sharedSetFailure("identity");
  return sharedSetFailure("unavailable");
}

export function createSharedSetMutationAction(dependencies: Readonly<{
  environment: Readonly<{
    APP_ENV: "local" | "preview" | "production";
    APP_ORIGIN?: string;
    RATE_LIMIT_SECRET: string;
  }>;
  clock: () => Date;
  limit?: number;
  rateLimitStore: RateLimitStore;
  loadActor: () => Promise<SharedSetActionActor | null>;
  service: Pick<SharedSetService, "createSet" | "updateSet" | "deactivateSet">;
}>) {
  return async function sharedSetMutationAction(
    request: Request,
    kind: SharedSetMutationKind,
    formData: FormData,
  ): Promise<SharedSetActionResult> {
    try {
      assertMutationOrigin(request, dependencies.environment);
    } catch {
      return sharedSetFailure("origin");
    }
    const parsed = parseSharedSetForm(kind, formData);
    if (!parsed) return sharedSetFailure("invalid");
    const now = dependencies.clock();
    if (!Number.isFinite(now.getTime())) return sharedSetFailure("unavailable");
    const actor = await dependencies.loadActor();
    if (
      actor === null ||
      actor.buyerStatus !== "active" ||
      actor.principal.actorId !== actor.buyerUserId ||
      actor.principal.buyerStatus !== "active"
    ) {
      return sharedSetFailure("identity");
    }
    const authorization = authorizeOperation({
      principal: actor.principal,
      operation: "referrals.create.self",
      resource: { relation: "owner", ownerActorId: actor.buyerUserId },
    });
    if (!authorization.allowed) return sharedSetFailure("identity");

    try {
      const decision = await consumeFixedWindowLimit({
        store: dependencies.rateLimitStore,
        scope: createRateLimitScope(
          actor.buyerUserId,
          `shared_set.${kind}`,
          dependencies.environment.RATE_LIMIT_SECRET,
        ),
        limit: dependencies.limit ?? 10,
        windowMs: 60_000,
        now,
      });
      if (!decision.allowed) return sharedSetFailure("rate_limit");
    } catch {
      return sharedSetFailure("unavailable");
    }

    const serviceInput = Object.freeze({
      ownerUserId: actor.buyerUserId,
      buyerStatus: actor.buyerStatus,
      ...parsed,
    });
    try {
      const result = kind === "create"
        ? await dependencies.service.createSet(serviceInput)
        : kind === "update"
          ? await dependencies.service.updateSet(serviceInput)
          : await dependencies.service.deactivateSet(serviceInput);
      return Object.freeze({
        state: "success" as const,
        code: result.status,
        set: Object.freeze({
          code: result.set.code,
          label: result.set.label,
          active: result.set.active,
          itemCount: result.set.itemCount,
          updatedAt: result.set.updatedAt,
        }),
      });
    } catch (error) {
      return mapSharedSetActionError(error);
    }
  };
}

async function runSharedSetMutationAction(
  kind: SharedSetMutationKind,
  formData: FormData,
): Promise<SharedSetActionResult> {
  "use server";

  try {
    const requestIdentity = await getRequestIdentity();
    const environment = requestIdentity.environment;
    const principal = requestIdentity.principal;
    if (
      requestIdentity.identity === null ||
      principal === null ||
      principal.clerkUserId !== requestIdentity.identity.clerkUserId ||
      principal.buyerStatus !== "active" ||
      environment.DATABASE_MODE === "disabled" ||
      environment.RATE_LIMIT_SECRET === undefined
    ) {
      return sharedSetFailure("identity");
    }

    const incoming = await headers();
    const suppliedOrigin = incoming.get("origin");
    const requestUrl = environment.APP_ORIGIN ?? suppliedOrigin ?? "http://localhost";
    const request = new Request(requestUrl, {
      method: "POST",
      headers: {
        ...(suppliedOrigin === null ? {} : { origin: suppliedOrigin }),
        ...(incoming.get("host") === null ? {} : { host: incoming.get("host")! }),
      },
    });
    const now = new Date();
    const runSerializableTransaction: GrowthTransactionRunner = (work, options) =>
      withRuntimeTransaction(environment, work, options);
    const service = createSharedSetService({
      clock: () => new Date(now),
      deriveCreateIdentity: ({ ownerUserId, idempotencyKey }) =>
        deriveSharedSetCreateIdentity({
          ownerUserId,
          idempotencyKey,
          secret: environment.RATE_LIMIT_SECRET!,
        }),
      mutate: createPostgresSharedSetMutationPort({
        runSerializableTransaction,
      }),
    });
    const action = createSharedSetMutationAction({
      environment: environment.APP_ORIGIN === undefined
        ? {
            APP_ENV: environment.APP_ENV,
            RATE_LIMIT_SECRET: environment.RATE_LIMIT_SECRET,
          }
        : {
            APP_ENV: environment.APP_ENV,
            APP_ORIGIN: environment.APP_ORIGIN,
            RATE_LIMIT_SECRET: environment.RATE_LIMIT_SECRET,
          },
      clock: () => new Date(now),
      rateLimitStore: {
        increment: (window) => withRuntimeTransaction(
          environment,
          (client) => createPostgresRateLimitStore(client).increment(window),
        ),
      },
      loadActor: async () => Object.freeze({
        buyerUserId: principal.actorId,
        buyerStatus: principal.buyerStatus!,
        principal,
      }),
      service,
    });
    const result = await action(request, kind, formData);
    if (result.state === "success") {
      revalidatePath("/research-sets");
      revalidatePath("/account/referrals");
      revalidatePath(`/sets/${result.set!.code}`);
    }
    return result;
  } catch {
    return sharedSetFailure("unavailable");
  }
}

export async function createSharedResearchSetAction(
  formData: FormData,
): Promise<SharedSetActionResult> {
  "use server";
  return runSharedSetMutationAction("create", formData);
}

export async function updateSharedResearchSetAction(
  formData: FormData,
): Promise<SharedSetActionResult> {
  "use server";
  return runSharedSetMutationAction("update", formData);
}

export async function deactivateSharedResearchSetAction(
  formData: FormData,
): Promise<SharedSetActionResult> {
  "use server";
  return runSharedSetMutationAction("deactivate", formData);
}
