import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import type { VerifiedIdentity } from "@/auth/identity";
import { getRequestIdentity } from "@/auth/server";
import { authorizeOperation } from "@/domain/authorization";
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
