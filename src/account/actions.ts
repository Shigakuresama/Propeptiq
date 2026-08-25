"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { completeBuyerAccount } from "@/account/account-service";
import { getRequestIdentity, getRequestRepositories } from "@/auth/server";
import { isVerifiedIdentityAt } from "@/auth/identity";
import { authorizeOperation } from "@/domain/authorization";
import type { ResearchPurpose } from "@/domain/eligibility";
import {
  consumeFixedWindowLimit,
  createRateLimitScope,
} from "@/security/rate-limit";

export type AccountActionState = Readonly<{
  state: "idle" | "success" | "error";
  code:
    | "idle"
    | "saved"
    | "identity"
    | "database"
    | "age"
    | "purpose"
    | "attestation"
    | "blocked"
    | "stale"
    | "rate_limit"
    | "invalid";
  message: string;
}>;

function safeFailure(error: unknown): AccountActionState {
  const message = error instanceof Error ? error.message : "";
  if (/rate limit/i.test(message)) return { state: "error", code: "rate_limit", message: "Too many account updates were attempted. Wait for the displayed retry window, then try again." };
  if (/blocked/i.test(message)) return { state: "error", code: "blocked", message: "This blocked account is read-only. Account facts cannot be changed." };
  if (/stale/i.test(message)) return { state: "error", code: "stale", message: "The account changed before this form was saved. Refresh and review the current facts." };
  if (/attestation|Exactly one current/i.test(message)) return { state: "error", code: "attestation", message: "One current attestation must be available and accepted before this update can be saved." };
  if (/identity|verified email/i.test(message)) return { state: "error", code: "identity", message: "A currently verified primary email is required. Refresh your identity session and try again." };
  if (/database/i.test(message)) return { state: "error", code: "database", message: "Account storage is unavailable, so the update failed closed." };
  return { state: "error", code: "invalid", message: "The account update was not accepted. Review each required fact and try again." };
}

const researchPurposes = new Set<ResearchPurpose>([
  "in_vitro",
  "analytical",
  "educational",
  "other_laboratory",
]);

export async function saveBuyerAccount(
  _previous: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  try {
    const request = await getRequestIdentity();
    const now = new Date();
    const repositories = getRequestRepositories(request);
    if (
      !request.identity ||
      !request.principal ||
      !repositories ||
      !request.environment.RATE_LIMIT_SECRET
    ) {
      throw new Error("Verified identity and database access are required");
    }
    if (!isVerifiedIdentityAt(request.identity, now)) {
      throw new Error("A currently verified email identity is required");
    }
    const access = authorizeOperation({
      principal: request.principal,
      operation: "account.update.self",
      resource: { relation: "owner", ownerActorId: request.principal.actorId },
    });
    if (!access.allowed) throw new Error("Account update is not permitted");
    const rate = await consumeFixedWindowLimit({
      store: repositories.adminRepository.rateLimitStore,
      scope: createRateLimitScope(
        request.principal.actorId,
        "account.update.self",
        request.environment.RATE_LIMIT_SECRET,
      ),
      limit: 10,
      windowMs: 60_000,
      now,
    });
    if (!rate.allowed) throw new Error("Account update limit reached");

    const purposeValue = formData.get("researchPurpose");
    const researchPurpose =
      typeof purposeValue === "string" &&
      researchPurposes.has(purposeValue as ResearchPurpose)
        ? (purposeValue as ResearchPurpose)
        : null;
    const existing = await repositories.loadAccount();
    if (!existing && formData.get("ageConfirmed21Plus") !== "yes") {
      return { state: "error", code: "age", message: "Confirm that you are at least 21 years old." };
    }
    if (!existing && researchPurpose === null) {
      return { state: "error", code: "purpose", message: "Select one structured laboratory research purpose." };
    }
    if (!existing && formData.get("acceptCurrentAttestation") !== "yes") {
      return { state: "error", code: "attestation", message: "Review and accept the single current research-use attestation." };
    }
    const organization = formData.get("organizationName");
    if (organization !== null && typeof organization !== "string") {
      throw new Error("Organization name is invalid");
    }
    await completeBuyerAccount(repositories.accountRepository, {
      identity: request.identity,
      input: {
        ageConfirmed21Plus: formData.get("ageConfirmed21Plus") === "yes",
        researchPurpose,
        organizationName: organization,
        acceptCurrentAttestation:
          formData.get("acceptCurrentAttestation") === "yes",
      },
      now,
      correlationId: randomUUID(),
    });
    revalidatePath("/checkout");
    revalidatePath("/account");
    return {
      state: "success",
      code: "saved",
      message: "Your verified account facts were saved.",
    };
  } catch (error) {
    return safeFailure(error);
  }
}
