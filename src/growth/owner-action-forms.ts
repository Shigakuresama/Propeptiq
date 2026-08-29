import "server-only";

import { getRequestIdentity } from "@/auth/server";
import { withRuntimeTransaction } from "@/db/runtime";
import type {
  AffiliateApplicationActionResult,
  CustomerReferralEnrollmentActionResult,
} from "@/growth/actions";
import {
  enrollCustomerReferralAction,
  submitAffiliateApplicationAction,
} from "@/growth/actions";
import { loadCurrentGrowthTerms, type GrowthTermsProgram } from "@/growth/policies";

type CurrentTermsAuthority = Readonly<{ id: string; contentHash: string }>;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

function exactBrowserFields(formData: FormData, expected: readonly string[]): boolean {
  const supplied = [...formData.keys()].filter((key) => !key.startsWith("$ACTION_"));
  return supplied.length === expected.length &&
    new Set(supplied).size === expected.length &&
    expected.every((field) => supplied.includes(field));
}

function validTerms(terms: CurrentTermsAuthority): boolean {
  return UUID_PATTERN.test(terms.id) && SHA256_PATTERN.test(terms.contentHash);
}

export function createOwnerReferralActivationAction(dependencies: Readonly<{
  loadCurrentTerms: () => Promise<CurrentTermsAuthority>;
  runAuthoritativeAction: (formData: FormData) => Promise<CustomerReferralEnrollmentActionResult>;
}>) {
  return async function ownerReferralActivationAction(
    formData: FormData,
  ): Promise<CustomerReferralEnrollmentActionResult> {
    const invalid = () => Object.freeze({
      state: "error" as const,
      code: "invalid" as const,
      referralCode: null,
    });
    if (!exactBrowserFields(formData, ["acceptCurrentTerms", "termsVersionId"])) {
      return invalid();
    }
    const acceptance = formData.get("acceptCurrentTerms");
    const termsVersionId = formData.get("termsVersionId");
    if (acceptance !== "yes" || typeof termsVersionId !== "string" || !UUID_PATTERN.test(termsVersionId)) {
      return invalid();
    }
    try {
      const terms = await dependencies.loadCurrentTerms();
      if (!validTerms(terms) || terms.id !== termsVersionId) return invalid();
      const trustedForm = new FormData();
      trustedForm.set("acceptCurrentTerms", "yes");
      trustedForm.set("termsVersionId", terms.id);
      trustedForm.set("termsContentHash", terms.contentHash);
      return await dependencies.runAuthoritativeAction(trustedForm);
    } catch {
      return Object.freeze({ state: "error", code: "unavailable", referralCode: null });
    }
  };
}

export function createOwnerAffiliateApplicationAction(dependencies: Readonly<{
  loadCurrentTerms: () => Promise<CurrentTermsAuthority>;
  runAuthoritativeAction: (formData: FormData) => Promise<AffiliateApplicationActionResult>;
}>) {
  return async function ownerAffiliateApplicationAction(
    formData: FormData,
  ): Promise<AffiliateApplicationActionResult> {
    const invalid = () => Object.freeze({
      state: "error" as const,
      code: "invalid" as const,
      application: null,
    });
    const fields = ["publicChannel", "promotionMethod", "acceptCurrentTerms", "termsVersionId"];
    if (!exactBrowserFields(formData, fields)) return invalid();
    const publicChannel = formData.get("publicChannel");
    const promotionMethod = formData.get("promotionMethod");
    const acceptance = formData.get("acceptCurrentTerms");
    const termsVersionId = formData.get("termsVersionId");
    if (
      typeof publicChannel !== "string" ||
      publicChannel.length === 0 ||
      publicChannel.length > 200 ||
      publicChannel !== publicChannel.trim() ||
      (promotionMethod !== "website" && promotionMethod !== "social" && promotionMethod !== "email" && promotionMethod !== "other") ||
      acceptance !== "yes" ||
      typeof termsVersionId !== "string" ||
      !UUID_PATTERN.test(termsVersionId)
    ) {
      return invalid();
    }
    try {
      const terms = await dependencies.loadCurrentTerms();
      if (!validTerms(terms) || terms.id !== termsVersionId) return invalid();
      const trustedForm = new FormData();
      trustedForm.set("publicChannel", publicChannel);
      trustedForm.set("promotionMethod", promotionMethod);
      trustedForm.set("acceptCurrentTerms", "yes");
      trustedForm.set("termsVersionId", terms.id);
      trustedForm.set("termsContentHash", terms.contentHash);
      return await dependencies.runAuthoritativeAction(trustedForm);
    } catch {
      return Object.freeze({ state: "error", code: "unavailable", application: null });
    }
  };
}

async function currentTerms(program: GrowthTermsProgram): Promise<CurrentTermsAuthority> {
  const request = await getRequestIdentity();
  if (request.environment.DATABASE_MODE === "disabled") {
    throw new Error("Growth terms unavailable");
  }
  const terms = await withRuntimeTransaction(request.environment, (client) =>
    loadCurrentGrowthTerms(client, program, new Date()),
  );
  return Object.freeze({ id: terms.id, contentHash: terms.contentHash });
}

export async function activateOwnerReferralAction(
  formData: FormData,
): Promise<CustomerReferralEnrollmentActionResult> {
  "use server";
  return createOwnerReferralActivationAction({
    loadCurrentTerms: () => currentTerms("customer_rewards_referrals"),
    runAuthoritativeAction: enrollCustomerReferralAction,
  })(formData);
}

export async function applyOwnerAffiliateAction(
  formData: FormData,
): Promise<AffiliateApplicationActionResult> {
  "use server";
  return createOwnerAffiliateApplicationAction({
    loadCurrentTerms: () => currentTerms("affiliate"),
    runAuthoritativeAction: submitAffiliateApplicationAction,
  })(formData);
}
