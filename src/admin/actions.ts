"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { resourceBySlug, adminGate } from "@/admin/access";
import {
  decideAffiliateApplication,
  suspendAffiliateApplication,
} from "@/admin/affiliate-application-admin-service";
import {
  createAffiliatePayoutBatch,
  recordAffiliatePayoutPaid,
} from "@/admin/affiliate-payout-admin-service";
import {
  adjustRewardBalance,
  activateProduct,
  activateGrowthPolicy,
  activatePromotion,
  changeBuyerStatus,
  changeStaffCapability,
  createGrowthPolicyDraft,
  deactivateSharedSet,
  decideReviewRequest,
  publishAttestationVersion,
  publishCoaDocument,
  requestRefundIntent,
  revokeReferralCode,
  retireProduct,
  retirePromotion,
  saveAnalyticalClaimDraft,
  saveCoaDraft,
  saveLotDraft,
  savePendingShipmentMetadata,
  savePolicyGroup,
  saveProductDraft,
  savePromotionDraft,
  setAnalyticalClaimLifecycle,
  setCoaLifecycle,
  setLotLifecycle,
  setPolicyGroupLifecycle,
  supersedeDestinationPolicy,
  supersedeProductPrice,
  MANUAL_REWARD_ADJUSTMENT_MAX_ABS_POINTS_V1,
  MANUAL_REWARD_ADJUSTMENT_REASONS_V1,
  type AdminCommandContext,
  type GrowthPolicyKind,
  type GrowthPolicyValues,
  type ManualRewardAdjustmentReasonV1,
  type PromotionTargetInput,
} from "@/admin/admin-service";
import {
  getRequestIdentity,
  getRequestRepositories,
  loadTargetVerifiedIdentity,
} from "@/auth/server";
import { isCanonicalUuid } from "@/commerce/checkout-identity";
import { createStaffCommerceServerRuntime } from "@/commerce/server-runtime";
import { isCapability } from "@/domain/authorization";
import type { BuyerStatus } from "@/domain/eligibility";
import { assertMutationOrigin } from "@/security/origin";

type TrustedAdmin = Readonly<{
  request: Awaited<ReturnType<typeof getRequestIdentity>>;
  repositories: NonNullable<ReturnType<typeof getRequestRepositories>>;
  context: AdminCommandContext;
}>;

async function trustedAdmin(resourceSlug: string): Promise<TrustedAdmin> {
  const request = await getRequestIdentity();
  const resource = resourceBySlug(resourceSlug);
  const repositories = getRequestRepositories(request);
  if (!resource || !repositories || !request.environment.RATE_LIMIT_SECRET) {
    throw new Error("Admin dependency unavailable");
  }
  const gate = adminGate(request, resource);
  if (!gate.allowed) throw new Error("Admin authorization denied");
  return {
    request,
    repositories,
    context: {
      principal: request.principal,
      identity: request.identity,
      now: new Date(),
      correlationId: randomUUID(),
      rateLimitSecret: request.environment.RATE_LIMIT_SECRET,
    },
  };
}

async function trustedGrowthAdmin(resourceSlug: string): Promise<TrustedAdmin> {
  const request = await getRequestIdentity();
  const appOrigin = request.environment.APP_ORIGIN;
  if (!appOrigin) throw new Error("Admin dependency unavailable");
  const incomingHeaders = await headers();
  assertMutationOrigin(
    new Request(appOrigin, {
      method: "POST",
      headers: incomingHeaders,
    }),
    { APP_ENV: request.environment.APP_ENV, APP_ORIGIN: appOrigin },
  );
  const resource = resourceBySlug(resourceSlug);
  const repositories = getRequestRepositories(request);
  if (!resource || !repositories || !request.environment.RATE_LIMIT_SECRET) {
    throw new Error("Admin dependency unavailable");
  }
  const gate = adminGate(request, resource);
  if (!gate.allowed) throw new Error("Admin authorization denied");
  return {
    request,
    repositories,
    context: {
      principal: request.principal,
      identity: request.identity,
      now: new Date(),
      correlationId: randomUUID(),
      rateLimitSecret: request.environment.RATE_LIMIT_SECRET,
    },
  };
}

function value(formData: FormData, name: string): string {
  const candidate = formData.get(name);
  if (typeof candidate !== "string") throw new Error(`${name} is required`);
  return candidate;
}

function integer(formData: FormData, name: string): number {
  const parsed = Number(value(formData, name));
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} is invalid`);
  return parsed;
}

function canonicalInteger(formData: FormData, name: string): number {
  const supplied = value(formData, name);
  if (!/^(?:0|[1-9]\d*)$/u.test(supplied)) throw new Error(`${name} is invalid`);
  const parsed = Number(supplied);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} is invalid`);
  return parsed;
}

function signedCanonicalInteger(formData: FormData, name: string): number {
  const supplied = value(formData, name);
  if (!/^-?(?:0|[1-9]\d*)$/u.test(supplied)) throw new Error(`${name} is invalid`);
  const parsed = Number(supplied);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} is invalid`);
  return parsed;
}

function exactFormFields(formData: FormData, expected: readonly string[]): void {
  const actual = [...formData.keys()].toSorted();
  const allowed = [...expected].toSorted();
  if (
    actual.length !== allowed.length ||
    actual.some((name, index) => name !== allowed[index])
  ) {
    throw new Error("Growth policy form is malformed");
  }
}

const canonicalV4UuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function canonicalV4Uuid(formData: FormData, name: string): string {
  const supplied = formData.get(name);
  if (typeof supplied !== "string" || !canonicalV4UuidPattern.test(supplied)) {
    throw new Error(`${name} is invalid`);
  }
  return supplied;
}

function canonicalTimestamp(formData: FormData, name: string): string {
  const supplied = formData.get(name);
  if (typeof supplied !== "string") throw new Error(`${name} is invalid`);
  const parsed = new Date(supplied);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== supplied) {
    throw new Error(`${name} is invalid`);
  }
  return supplied;
}

function canonicalUtcFormInstant(formData: FormData, name: string): string {
  const supplied = value(formData, name);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(supplied)) {
    const canonical = `${supplied}:00.000Z`;
    const parsed = new Date(canonical);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== canonical) {
      throw new Error(`${name} is invalid`);
    }
    return canonical;
  }
  return canonicalTimestamp(formData, name);
}

const policyValueFields = {
  loyalty: [
    "pointsPerDollar",
    "redemptionMinorPerPoint",
    "minimumRedemptionPoints",
    "maximumRedemptionBasisPoints",
  ],
  referral: [
    "attributionDays",
    "referredDiscountBasisPoints",
    "referredDiscountCapMinor",
    "referrerPointsPerDollar",
    "referrerRewardCapPoints",
  ],
  affiliate: [
    "attributionDays",
    "firstOrderCommissionBasisPoints",
    "reorderCommissionBasisPoints",
    "reorderWindowDays",
    "approvalDelayDays",
    "payoutThresholdMinor",
    "currency",
  ],
} as const satisfies Readonly<Record<GrowthPolicyKind, readonly string[]>>;

function policyValues(formData: FormData, kind: GrowthPolicyKind): GrowthPolicyValues {
  if (kind === "loyalty") {
    return {
      pointsPerDollar: canonicalInteger(formData, "pointsPerDollar"),
      redemptionMinorPerPoint: canonicalInteger(formData, "redemptionMinorPerPoint"),
      minimumRedemptionPoints: canonicalInteger(formData, "minimumRedemptionPoints"),
      maximumRedemptionBasisPoints: canonicalInteger(formData, "maximumRedemptionBasisPoints"),
      expiresAfterDays: null,
    };
  }
  if (kind === "referral") {
    return {
      attributionDays: canonicalInteger(formData, "attributionDays"),
      referredDiscountBasisPoints: canonicalInteger(formData, "referredDiscountBasisPoints"),
      referredDiscountCapMinor: canonicalInteger(formData, "referredDiscountCapMinor"),
      referrerPointsPerDollar: canonicalInteger(formData, "referrerPointsPerDollar"),
      referrerRewardCapPoints: canonicalInteger(formData, "referrerRewardCapPoints"),
    };
  }
  return {
    attributionDays: canonicalInteger(formData, "attributionDays"),
    firstOrderCommissionBasisPoints: canonicalInteger(formData, "firstOrderCommissionBasisPoints"),
    reorderCommissionBasisPoints: canonicalInteger(formData, "reorderCommissionBasisPoints"),
    reorderWindowDays: canonicalInteger(formData, "reorderWindowDays"),
    approvalDelayDays: canonicalInteger(formData, "approvalDelayDays"),
    payoutThresholdMinor: canonicalInteger(formData, "payoutThresholdMinor"),
    currency: value(formData, "currency"),
  };
}

function optionalValue(formData: FormData, name: string): string | undefined {
  const candidate = formData.get(name);
  if (candidate === null) return undefined;
  if (typeof candidate !== "string") throw new Error(`${name} is invalid`);
  const normalized = candidate.trim();
  return normalized || undefined;
}

function optionalInteger(formData: FormData, name: string): number | null {
  const candidate = optionalValue(formData, name);
  if (candidate === undefined) return null;
  const parsed = Number(candidate);
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} is invalid`);
  return parsed;
}

function optionalInstant(formData: FormData, name: string): string | null {
  const candidate = optionalValue(formData, name);
  if (candidate === undefined) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(candidate)
    ? `${candidate}:00.000Z`
    : candidate;
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${name} is invalid`);
  return parsed.toISOString();
}

function commaSeparated(formData: FormData, name: string): string[] {
  const candidate = optionalValue(formData, name);
  if (!candidate) return [];
  const values = candidate.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (values.length > 50 || new Set(values).size !== values.length) {
    throw new Error(`${name} is invalid`);
  }
  return values;
}

function versionedReference(
  formData: FormData,
  referenceName: string,
  idName: string,
): Readonly<{ id: string; expectedUpdatedAt: string }> {
  const supplied = formData.get(referenceName);
  if (typeof supplied !== "string") {
    return {
      id: value(formData, idName),
      expectedUpdatedAt: value(formData, "expectedUpdatedAt"),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(supplied);
  } catch {
    throw new Error(`${referenceName} is invalid`);
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("id" in parsed) ||
    !("expectedUpdatedAt" in parsed) ||
    typeof parsed.id !== "string" ||
    typeof parsed.expectedUpdatedAt !== "string"
  ) {
    throw new Error(`${referenceName} is invalid`);
  }
  return { id: parsed.id, expectedUpdatedAt: parsed.expectedUpdatedAt };
}

function promotionReference(
  formData: FormData,
  referenceName = "promotionReference",
): Readonly<{ id: string; expectedVersion: number; expectedUpdatedAt: string }> {
  const supplied = formData.get(referenceName);
  if (typeof supplied !== "string") {
    const expectedVersion = integer(formData, "expectedVersion");
    if (expectedVersion < 1) throw new Error("expectedVersion is invalid");
    return {
      id: value(formData, "promotionId"),
      expectedVersion,
      expectedUpdatedAt: value(formData, "expectedUpdatedAt"),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(supplied);
  } catch {
    throw new Error(`${referenceName} is invalid`);
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("id" in parsed) ||
    !("expectedVersion" in parsed) ||
    !("expectedUpdatedAt" in parsed) ||
    typeof parsed.id !== "string" ||
    typeof parsed.expectedVersion !== "number" ||
    !Number.isSafeInteger(parsed.expectedVersion) ||
    parsed.expectedVersion < 1 ||
    typeof parsed.expectedUpdatedAt !== "string"
  ) {
    throw new Error(`${referenceName} is invalid`);
  }
  return {
    id: parsed.id,
    expectedVersion: parsed.expectedVersion,
    expectedUpdatedAt: parsed.expectedUpdatedAt,
  };
}

function resultCode(error: unknown): "saved" | "stale" | "rate-limited" | "denied" | "unavailable" {
  const message = error instanceof Error ? error.message : "";
  if (/stale|changed during|version_conflict/i.test(message)) return "stale";
  if (/rate limit/i.test(message)) return "rate-limited";
  if (/origin/i.test(message)) return "denied";
  if (/threshold_not_met|profile_ineligible/i.test(message)) return "unavailable";
  if (/unavailable|does not exist|required/i.test(message)) return "unavailable";
  return "denied";
}

async function run(resource: string, command: () => Promise<unknown>): Promise<never> {
  let result: ReturnType<typeof resultCode> = "saved";
  try {
    await command();
  } catch (error) {
    result = resultCode(error);
  }
  redirect(`/admin/${resource}?result=${result}` as never);
}

type CommerceCommand =
  | "submit-refund"
  | "clear-hold"
  | "handoff"
  | "deliver"
  | "exception";

function closedCommerceResult(value: unknown): string {
  if (!value || typeof value !== "object" || !("status" in value)) return "unavailable";
  const status = value.status;
  if (status === "terminal" && "refundStatus" in value) {
    const refundStatus = value.refundStatus;
    return refundStatus === "succeeded" || refundStatus === "failed" || refundStatus === "cancelled"
      ? refundStatus
      : "unavailable";
  }
  return typeof status === "string" && new Set([
    "unavailable", "ineligible", "conflict", "submitted", "awaiting_signed_event",
    "failed", "cancelled", "stale", "held", "denied", "cleared", "already_clear",
    "handed_off", "already_handed_off", "delivered", "already_delivered",
    "exception", "already_exception",
  ]).has(status)
    ? status
    : "unavailable";
}

async function runCommerce(
  resource: "orders" | "refunds" | "shipments",
  command: CommerceCommand,
  readTarget: () => string,
  execute: (
    runtime: NonNullable<Awaited<ReturnType<typeof createStaffCommerceServerRuntime>>>,
    target: string,
  ) => Promise<unknown>,
): Promise<never> {
  let result = "unavailable";
  let canonicalTarget: string | null = null;
  try {
    const target = readTarget();
    canonicalTarget = isCanonicalUuid(target) ? target : null;
    if (canonicalTarget !== null) {
      const admin = await trustedAdmin(resource);
      const runtime = await createStaffCommerceServerRuntime(
        admin.request,
        admin.context.correlationId,
      );
      if (runtime !== null) {
        result = closedCommerceResult(await execute(runtime, canonicalTarget));
      }
    }
  } catch (error) {
    result = resultCode(error);
  }
  const targetQuery = canonicalTarget === null ? "" : `&target=${canonicalTarget}`;
  redirect(`/admin/${resource}?command=${command}${targetQuery}&result=${result}` as never);
}

export async function activateProductAction(formData: FormData): Promise<never> {
  return run("products", async () => {
    const admin = await trustedAdmin("products");
    const reference = versionedReference(formData, "productReference", "productId");
    await activateProduct(admin.repositories.adminRepository, admin.context, {
      productId: reference.id,
      expectedUpdatedAt: reference.expectedUpdatedAt,
    });
  });
}

export async function savePolicyGroupAction(formData: FormData): Promise<never> {
  return run("policy-groups", async () => {
    const admin = await trustedAdmin("policy-groups");
    const policyGroupId = optionalValue(formData, "policyGroupId");
    const expectedUpdatedAt = optionalValue(formData, "expectedUpdatedAt");
    await savePolicyGroup(admin.repositories.adminRepository, admin.context, {
      ...(policyGroupId ? { policyGroupId } : {}),
      slug: value(formData, "slug"),
      name: value(formData, "name"),
      ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    });
  });
}

export async function setPolicyGroupLifecycleAction(formData: FormData): Promise<never> {
  return run("policy-groups", async () => {
    const admin = await trustedAdmin("policy-groups");
    const reference = versionedReference(formData, "policyGroupReference", "policyGroupId");
    await setPolicyGroupLifecycle(admin.repositories.adminRepository, admin.context, {
      policyGroupId: reference.id,
      active: value(formData, "active") === "true",
      expectedUpdatedAt: reference.expectedUpdatedAt,
    });
  });
}

export async function saveProductDraftAction(formData: FormData): Promise<never> {
  return run("products", async () => {
    const admin = await trustedAdmin("products");
    const productId = optionalValue(formData, "productId");
    const expectedUpdatedAt = optionalValue(formData, "expectedUpdatedAt");
    await saveProductDraft(admin.repositories.adminRepository, admin.context, {
      ...(productId ? { productId } : {}),
      slug: value(formData, "slug"),
      name: value(formData, "name"),
      packageForm: value(formData, "packageForm"),
      materialIdentity: value(formData, "materialIdentity"),
      policyGroupId: value(formData, "policyGroupId"),
      ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    });
  });
}

export async function retireProductAction(formData: FormData): Promise<never> {
  return run("products", async () => {
    const admin = await trustedAdmin("products");
    const reference = versionedReference(formData, "productReference", "productId");
    await retireProduct(admin.repositories.adminRepository, admin.context, {
      productId: reference.id,
      expectedUpdatedAt: reference.expectedUpdatedAt,
    });
  });
}

export async function supersedeProductPriceAction(formData: FormData): Promise<never> {
  return run("prices", async () => {
    const admin = await trustedAdmin("prices");
    await supersedeProductPrice(admin.repositories.adminRepository, admin.context, {
      productId: value(formData, "productId"),
      amountMinor: integer(formData, "amountMinor"),
      currency: "USD",
    });
  });
}

export async function saveLotDraftAction(formData: FormData): Promise<never> {
  return run("lots", async () => {
    const admin = await trustedAdmin("lots");
    const lotId = optionalValue(formData, "lotId");
    const analyticalMethod = optionalValue(formData, "analyticalMethod");
    const expectedUpdatedAt = optionalValue(formData, "expectedUpdatedAt");
    const manufacturedAt = optionalInstant(formData, "manufacturedAt");
    const expiresAt = optionalInstant(formData, "expiresAt");
    await saveLotDraft(admin.repositories.adminRepository, admin.context, {
      ...(lotId ? { lotId } : {}),
      productId: value(formData, "productId"),
      supplierName: value(formData, "supplierName"),
      supplierLotCode: value(formData, "supplierLotCode"),
      ...(analyticalMethod ? { analyticalMethod } : {}),
      receivedQuantity: integer(formData, "receivedQuantity"),
      availableQuantity: integer(formData, "availableQuantity"),
      ...(manufacturedAt ? { manufacturedAt } : {}),
      ...(expiresAt ? { expiresAt } : {}),
      ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    });
  });
}

export async function setLotLifecycleAction(formData: FormData): Promise<never> {
  return run("lots", async () => {
    const admin = await trustedAdmin("lots");
    const reference = versionedReference(formData, "lotReference", "lotId");
    const status = value(formData, "status");
    if (!(["released", "quarantined", "exhausted", "recalled"] as const).includes(status as never)) {
      throw new Error("Lot status is invalid");
    }
    await setLotLifecycle(admin.repositories.adminRepository, admin.context, {
      lotId: reference.id,
      status: status as "released" | "quarantined" | "exhausted" | "recalled",
      expectedUpdatedAt: reference.expectedUpdatedAt,
    });
  });
}

export async function saveCoaDraftAction(formData: FormData): Promise<never> {
  return run("coas", async () => {
    const admin = await trustedAdmin("coas");
    const coaDocumentId = optionalValue(formData, "coaDocumentId");
    const expectedStorageKey = optionalValue(formData, "expectedStorageKey");
    const expectedEvidenceHash = optionalValue(formData, "expectedEvidenceHash");
    const issuedAt = optionalInstant(formData, "issuedAt");
    await saveCoaDraft(admin.repositories.adminRepository, admin.context, {
      ...(coaDocumentId ? { coaDocumentId } : {}),
      lotId: value(formData, "lotId"),
      storageKey: value(formData, "storageKey"),
      evidenceHash: value(formData, "evidenceHash"),
      ...(issuedAt ? { issuedAt } : {}),
      ...(expectedStorageKey ? { expectedStorageKey } : {}),
      ...(expectedEvidenceHash ? { expectedEvidenceHash } : {}),
    });
  });
}

export async function setCoaLifecycleAction(formData: FormData): Promise<never> {
  return run("coas", async () => {
    const admin = await trustedAdmin("coas");
    await setCoaLifecycle(admin.repositories.adminRepository, admin.context, {
      coaDocumentId: value(formData, "coaDocumentId"),
      active: value(formData, "active") === "true",
      expectedStorageKey: value(formData, "expectedStorageKey"),
      expectedEvidenceHash: value(formData, "expectedEvidenceHash"),
    });
  });
}

export async function saveAnalyticalClaimDraftAction(formData: FormData): Promise<never> {
  return run("analytical-claims", async () => {
    const admin = await trustedAdmin("analytical-claims");
    const claimId = optionalValue(formData, "claimId");
    const expectedUpdatedAt = optionalValue(formData, "expectedUpdatedAt");
    await saveAnalyticalClaimDraft(admin.repositories.adminRepository, admin.context, {
      ...(claimId ? { claimId } : {}),
      productId: value(formData, "productId"),
      lotId: value(formData, "lotId"),
      coaDocumentId: value(formData, "coaDocumentId"),
      text: value(formData, "text"),
      ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    });
  });
}

export async function setAnalyticalClaimLifecycleAction(formData: FormData): Promise<never> {
  return run("analytical-claims", async () => {
    const admin = await trustedAdmin("analytical-claims");
    const reference = versionedReference(formData, "claimReference", "claimId");
    await setAnalyticalClaimLifecycle(admin.repositories.adminRepository, admin.context, {
      claimId: reference.id,
      active: value(formData, "active") === "true",
      expectedUpdatedAt: reference.expectedUpdatedAt,
    });
  });
}

export async function activatePromotionAction(formData: FormData): Promise<never> {
  return run("promotions", async () => {
    const admin = await trustedAdmin("promotions");
    const reference = promotionReference(formData);
    await activatePromotion(admin.repositories.adminRepository, admin.context, {
      promotionId: reference.id,
      expectedVersion: reference.expectedVersion,
      expectedUpdatedAt: reference.expectedUpdatedAt,
    });
  });
}

export async function savePromotionDraftAction(formData: FormData): Promise<never> {
  return run("promotions", async () => {
    const admin = await trustedAdmin("promotions");
    const kind = value(formData, "kind");
    if (!(["discount", "bundle", "subscription", "loyalty", "cross_sell"] as const).includes(kind as never)) {
      throw new Error("Promotion kind is invalid");
    }
    const productIds = commaSeparated(formData, "configurationProductIds");
    const configuration =
      kind === "bundle" || kind === "cross_sell"
        ? { productIds }
        : kind === "subscription"
          ? {
              interval: value(formData, "interval"),
              intervalCount: optionalInteger(formData, "intervalCount"),
            }
          : kind === "loyalty"
            ? { pointsPerDollar: optionalInteger(formData, "pointsPerDollar") }
            : {};
    const targets: PromotionTargetInput[] = [
      ...commaSeparated(formData, "targetProductIds").map((targetId) => ({
        targetKind: "product" as const,
        targetId,
      })),
      ...commaSeparated(formData, "targetPolicyGroupIds").map((targetId) => ({
        targetKind: "policy_group" as const,
        targetId,
      })),
    ];
    const promotionId = optionalValue(formData, "promotionId");
    const expectedUpdatedAt = optionalValue(formData, "expectedUpdatedAt");
    const expectedVersion = optionalInteger(formData, "expectedVersion");
    await savePromotionDraft(admin.repositories.adminRepository, admin.context, {
      ...(promotionId ? { promotionId } : {}),
      code: value(formData, "code"),
      name: value(formData, "name"),
      kind: kind as "discount" | "bundle" | "subscription" | "loyalty" | "cross_sell",
      amountMinor: optionalInteger(formData, "amountMinor"),
      basisPoints: optionalInteger(formData, "basisPoints"),
      currency: optionalValue(formData, "currency") ?? null,
      configuration,
      startsAt: optionalInstant(formData, "startsAt"),
      endsAt: optionalInstant(formData, "endsAt"),
      targets,
      ...(expectedVersion !== null ? { expectedVersion } : {}),
      ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    });
  });
}

export async function retirePromotionAction(formData: FormData): Promise<never> {
  return run("promotions", async () => {
    const admin = await trustedAdmin("promotions");
    const reference = promotionReference(formData);
    await retirePromotion(admin.repositories.adminRepository, admin.context, {
      promotionId: reference.id,
      expectedVersion: reference.expectedVersion,
      expectedUpdatedAt: reference.expectedUpdatedAt,
    });
  });
}

export async function publishCoaAction(formData: FormData): Promise<never> {
  return run("coas", async () => {
    const admin = await trustedAdmin("coas");
    await publishCoaDocument(
      admin.repositories.adminRepository,
      admin.context,
      { coaDocumentId: value(formData, "coaDocumentId") },
      { storageVerifier: admin.repositories.storageVerifier },
    );
  });
}

export async function publishAttestationAction(formData: FormData): Promise<never> {
  return run("attestations", async () => {
    const admin = await trustedAdmin("attestations");
    const supplied = value(formData, "suppliedContentHash").trim();
    await publishAttestationVersion(
      admin.repositories.adminRepository,
      admin.context,
      supplied
        ? { policyText: value(formData, "policyText"), suppliedContentHash: supplied }
        : { policyText: value(formData, "policyText") },
    );
  });
}

export async function supersedeDestinationAction(formData: FormData): Promise<never> {
  return run("destination-rules", async () => {
    const admin = await trustedAdmin("destination-rules");
    const scopeKind = value(formData, "scopeKind");
    const result = value(formData, "result");
    if (scopeKind !== "product" && scopeKind !== "policy_group") throw new Error("Scope is invalid");
    if (result !== "allowed" && result !== "review" && result !== "blocked") throw new Error("Result is invalid");
    await supersedeDestinationPolicy(admin.repositories.adminRepository, admin.context, {
      scopeKind,
      targetId: value(formData, "targetId"),
      stateCode: value(formData, "stateCode"),
      result,
    });
  });
}

export async function changeBuyerStatusAction(formData: FormData): Promise<never> {
  return run("buyers", async () => {
    const admin = await trustedAdmin("buyers");
    const reference = versionedReference(formData, "buyerReference", "userId");
    const status = value(formData, "status") as BuyerStatus;
    if (!(["active", "review", "blocked"] as const).includes(status)) throw new Error("Status is invalid");
    await changeBuyerStatus(
      admin.repositories.adminRepository,
      admin.context,
      {
        userId: reference.id,
        status,
        expectedUpdatedAt: reference.expectedUpdatedAt,
      },
      {
        loadTargetIdentity: (clerkUserId, referenceTime) =>
          loadTargetVerifiedIdentity(admin.request, clerkUserId, referenceTime),
      },
    );
  });
}

export async function decideReviewAction(formData: FormData): Promise<never> {
  return run("review-requests", async () => {
    const admin = await trustedAdmin("review-requests");
    const outcome = value(formData, "outcome");
    if (outcome !== "approved" && outcome !== "rejected") throw new Error("Outcome is invalid");
    await decideReviewRequest(admin.repositories.adminRepository, admin.context, {
      reviewRequestId: value(formData, "reviewRequestId"),
      outcome,
    });
  });
}

export async function requestRefundAction(formData: FormData): Promise<never> {
  return run("refunds", async () => {
    const admin = await trustedAdmin("refunds");
    const reason = value(formData, "reasonRedacted").trim();
    await requestRefundIntent(admin.repositories.adminRepository, admin.context, {
      orderId: value(formData, "orderId"),
      requestedAmountMinor: integer(formData, "requestedAmountMinor"),
      reasonRedacted: reason || null,
      idempotencyKey: value(formData, "idempotencyKey"),
    });
  });
}

export async function submitOrRecoverRefundAction(formData: FormData): Promise<never> {
  return runCommerce("refunds", "submit-refund", () => value(formData, "refundId"),
    (runtime, refundId) => runtime.submitOrRecoverRefund(refundId));
}

export async function clearFulfillmentHoldAction(formData: FormData): Promise<never> {
  return runCommerce("orders", "clear-hold", () => value(formData, "orderId"),
    (runtime, orderId) => runtime.clearFulfillmentHold(orderId));
}

export async function saveShipmentAction(formData: FormData): Promise<never> {
  return run("shipments", async () => {
    const admin = await trustedAdmin("shipments");
    const expected = value(formData, "expectedUpdatedAt").trim();
    await savePendingShipmentMetadata(admin.repositories.adminRepository, admin.context, {
      orderId: value(formData, "orderId"),
      carrier: value(formData, "carrier"),
      trackingReference: value(formData, "trackingReference"),
      expectedUpdatedAt: expected || null,
    });
  });
}

export async function handoffFulfillmentAction(formData: FormData): Promise<never> {
  return runCommerce("shipments", "handoff", () => value(formData, "orderId"),
    (runtime, orderId) => runtime.handoffFulfillment(orderId));
}

export async function markShipmentDeliveredAction(formData: FormData): Promise<never> {
  return runCommerce("shipments", "deliver", () => value(formData, "orderId"),
    (runtime, orderId) => runtime.markShipmentDelivered(orderId));
}

export async function recordShipmentExceptionAction(formData: FormData): Promise<never> {
  return runCommerce("shipments", "exception", () => value(formData, "orderId"),
    (runtime, orderId) => runtime.recordShipmentException(orderId));
}

export async function changeStaffCapabilityAction(formData: FormData): Promise<never> {
  return run("staff", async () => {
    const admin = await trustedAdmin("staff");
    const capability = value(formData, "capability");
    if (!isCapability(capability)) throw new Error("Capability is invalid");
    await changeStaffCapability(admin.repositories.adminRepository, admin.context, {
      userId: value(formData, "userId"),
      capability,
      enabled: value(formData, "enabled") === "true",
    });
  });
}

async function createPolicyDraftAction(
  kind: GrowthPolicyKind,
  resource: "loyalty-policies" | "referral-policies" | "affiliate-policies",
  formData: FormData,
): Promise<never> {
  return run(resource, async () => {
    exactFormFields(formData, ["effectiveAt", ...policyValueFields[kind]]);
    const values = policyValues(formData, kind);
    const effectiveAt = canonicalUtcFormInstant(formData, "effectiveAt");
    const admin = await trustedGrowthAdmin(resource);
    await createGrowthPolicyDraft(admin.repositories.adminRepository, admin.context, {
      kind,
      policyId: randomUUID(),
      effectiveAt,
      values,
    });
  });
}

async function activatePolicyAction(
  kind: GrowthPolicyKind,
  resource: "loyalty-policies" | "referral-policies" | "affiliate-policies",
  formData: FormData,
): Promise<never> {
  return run(resource, async () => {
    exactFormFields(formData, ["policyId", "expectedVersion"]);
    const policyId = value(formData, "policyId");
    const expectedVersion = canonicalInteger(formData, "expectedVersion");
    const admin = await trustedGrowthAdmin(resource);
    await activateGrowthPolicy(admin.repositories.adminRepository, admin.context, {
      kind,
      policyId,
      expectedVersion,
    });
  });
}

export async function createLoyaltyPolicyDraftAction(formData: FormData): Promise<never> {
  return createPolicyDraftAction("loyalty", "loyalty-policies", formData);
}

export async function activateLoyaltyPolicyAction(formData: FormData): Promise<never> {
  return activatePolicyAction("loyalty", "loyalty-policies", formData);
}

export async function createReferralPolicyDraftAction(formData: FormData): Promise<never> {
  return createPolicyDraftAction("referral", "referral-policies", formData);
}

export async function activateReferralPolicyAction(formData: FormData): Promise<never> {
  return activatePolicyAction("referral", "referral-policies", formData);
}

export async function createAffiliatePolicyDraftAction(formData: FormData): Promise<never> {
  return createPolicyDraftAction("affiliate", "affiliate-policies", formData);
}

export async function activateAffiliatePolicyAction(formData: FormData): Promise<never> {
  return activatePolicyAction("affiliate", "affiliate-policies", formData);
}

export async function adjustRewardBalanceAction(formData: FormData): Promise<never> {
  return run("reward-adjustments", async () => {
    exactFormFields(formData, [
      "commandToken",
      "rewardAccountId",
      "delta",
      "reason",
      "internalAuditReason",
    ]);
    const commandToken = canonicalV4Uuid(formData, "commandToken");
    const rewardAccountId = value(formData, "rewardAccountId");
    const delta = signedCanonicalInteger(formData, "delta");
    const reason = value(formData, "reason");
    const internalAuditReason = value(formData, "internalAuditReason");
    if (!isCanonicalUuid(rewardAccountId)) throw new Error("Reward account ID is invalid");
    if (
      delta === 0 ||
      Math.abs(delta) > MANUAL_REWARD_ADJUSTMENT_MAX_ABS_POINTS_V1
    ) {
      throw new Error("Reward adjustment delta is invalid");
    }
    if (!MANUAL_REWARD_ADJUSTMENT_REASONS_V1.includes(
      reason as ManualRewardAdjustmentReasonV1,
    )) {
      throw new Error("Reward adjustment reason is invalid");
    }
    if (
      internalAuditReason.trim() !== internalAuditReason ||
      internalAuditReason.length < 1 ||
      internalAuditReason.length > 240 ||
      /[\u0000-\u001f\u007f]/u.test(internalAuditReason)
    ) {
      throw new Error("Reward adjustment internal audit reason is invalid");
    }
    const admin = await trustedGrowthAdmin("reward-adjustments");
    await adjustRewardBalance(admin.repositories.adminRepository, admin.context, {
      entryId: commandToken,
      rewardAccountId,
      delta,
      reason,
      internalAuditReason,
      idempotencyKey: `reward-adjustment:${commandToken}`,
    });
  });
}

export async function revokeReferralCodeAction(formData: FormData): Promise<never> {
  return run("referral-codes", async () => {
    exactFormFields(formData, ["referralCodeId", "expectedCreatedAt"]);
    const referralCodeId = canonicalV4Uuid(formData, "referralCodeId");
    const expectedCreatedAt = canonicalTimestamp(formData, "expectedCreatedAt");
    const admin = await trustedGrowthAdmin("referral-codes");
    await revokeReferralCode(admin.repositories.adminRepository, admin.context, {
      referralCodeId,
      expectedCreatedAt,
    });
  });
}

export async function deactivateSharedSetAction(formData: FormData): Promise<never> {
  return run("shared-sets", async () => {
    exactFormFields(formData, ["sharedSetId", "expectedUpdatedAt"]);
    const sharedSetId = canonicalV4Uuid(formData, "sharedSetId");
    const expectedUpdatedAt = canonicalTimestamp(formData, "expectedUpdatedAt");
    const admin = await trustedGrowthAdmin("shared-sets");
    await deactivateSharedSet(admin.repositories.adminRepository, admin.context, {
      sharedSetId,
      expectedUpdatedAt,
    });
  });
}

export async function decideAffiliateApplicationAction(formData: FormData): Promise<never> {
  return run("affiliate-applications", async () => {
    exactFormFields(formData, ["profileId", "expectedVersion", "decision"]);
    const profileId = canonicalV4Uuid(formData, "profileId");
    const expectedVersion = canonicalInteger(formData, "expectedVersion");
    const decision = value(formData, "decision");
    if (expectedVersion < 1 || (decision !== "active" && decision !== "rejected")) {
      throw new Error("Affiliate application decision is invalid");
    }
    const admin = await trustedGrowthAdmin("affiliate-applications");
    await decideAffiliateApplication(
      admin.repositories.affiliateApplicationAdminRepository,
      admin.context,
      { profileId, expectedVersion, decision },
    );
  });
}

export async function suspendAffiliateApplicationAction(formData: FormData): Promise<never> {
  return run("affiliate-applications", async () => {
    exactFormFields(formData, ["profileId", "expectedVersion"]);
    const profileId = canonicalV4Uuid(formData, "profileId");
    const expectedVersion = canonicalInteger(formData, "expectedVersion");
    if (expectedVersion < 1) throw new Error("Affiliate application version is invalid");
    const admin = await trustedGrowthAdmin("affiliate-applications");
    await suspendAffiliateApplication(
      admin.repositories.affiliateApplicationAdminRepository,
      admin.context,
      { profileId, expectedVersion },
    );
  });
}

export async function createAffiliatePayoutBatchAdminAction(
  formData: FormData,
): Promise<never> {
  return run("payouts", async () => {
    exactFormFields(formData, ["profileId"]);
    const profileId = canonicalV4Uuid(formData, "profileId");
    const admin = await trustedGrowthAdmin("payouts");
    await createAffiliatePayoutBatch(
      admin.repositories.affiliatePayoutAdminRepository,
      admin.context,
      {
        profileId,
        payoutId: randomUUID(),
        idempotencyKey: `affiliate-payout-create:${randomUUID()}`,
      },
    );
  });
}

export async function recordAffiliatePayoutPaidAdminAction(
  formData: FormData,
): Promise<never> {
  return run("payouts", async () => {
    exactFormFields(formData, [
      "payoutId",
      "expectedVersion",
      "providerName",
      "externalReference",
    ]);
    const payoutId = canonicalV4Uuid(formData, "payoutId");
    const expectedVersion = canonicalInteger(formData, "expectedVersion");
    if (expectedVersion < 1) throw new Error("Affiliate payout version is invalid");
    const admin = await trustedGrowthAdmin("payouts");
    await recordAffiliatePayoutPaid(
      admin.repositories.affiliatePayoutAdminRepository,
      admin.context,
      {
        payoutId,
        expectedVersion,
        idempotencyKey: `affiliate-payout-paid:${randomUUID()}`,
        providerName: value(formData, "providerName"),
        externalReference: value(formData, "externalReference"),
      },
    );
  });
}
