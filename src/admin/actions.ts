"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { resourceBySlug, adminGate } from "@/admin/access";
import {
  activateProduct,
  activatePromotion,
  changeBuyerStatus,
  changeStaffCapability,
  decideReviewRequest,
  publishAttestationVersion,
  publishCoaDocument,
  requestRefundIntent,
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
  type AdminCommandContext,
  type PromotionTargetInput,
} from "@/admin/admin-service";
import {
  getRequestIdentity,
  getRequestRepositories,
  loadTargetVerifiedIdentity,
} from "@/auth/server";
import { isCapability } from "@/domain/authorization";
import type { BuyerStatus } from "@/domain/eligibility";

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

function resultCode(error: unknown): "saved" | "stale" | "rate-limited" | "denied" | "unavailable" {
  const message = error instanceof Error ? error.message : "";
  if (/stale|changed during/i.test(message)) return "stale";
  if (/rate limit/i.test(message)) return "rate-limited";
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
    const reference = versionedReference(formData, "promotionReference", "promotionId");
    await activatePromotion(admin.repositories.adminRepository, admin.context, {
      promotionId: reference.id,
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
      ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    });
  });
}

export async function retirePromotionAction(formData: FormData): Promise<never> {
  return run("promotions", async () => {
    const admin = await trustedAdmin("promotions");
    const reference = versionedReference(formData, "promotionReference", "promotionId");
    await retirePromotion(admin.repositories.adminRepository, admin.context, {
      promotionId: reference.id,
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
