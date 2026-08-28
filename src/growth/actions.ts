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
