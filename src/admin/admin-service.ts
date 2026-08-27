import { isVerifiedIdentityAt, type VerifiedIdentity } from "@/auth/identity";
import type { PromotionActivationCandidate, ProductPublicationFacts } from "@/admin/admin-policy";
import {
  assertStaffCommandAccess,
  validateAttestationManifest,
  validateProductPublication,
  validatePromotionForActivation,
} from "@/admin/admin-policy";
import type { AuthorizationOperation, Capability, Principal } from "@/domain/authorization";
import { isCapability } from "@/domain/authorization";
import { scanPublicCopy } from "@/domain/content-policy";
import { evaluateBuyerActivation, type BuyerStatus, type ResearchPurpose } from "@/domain/eligibility";
import {
  consumeFixedWindowLimit,
  createRateLimitScope,
  type RateLimitStore,
} from "@/security/rate-limit";
import { verifyCoaForPublication, type StorageVerifier } from "@/security/storage";

export type AdminCommandContext = Readonly<{
  principal: Principal | null;
  identity: VerifiedIdentity | null;
  now: Date;
  correlationId: string;
  rateLimitSecret: string;
}>;

export type AdminAuditEvent = Readonly<{
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  correlationId: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type PromotionRecord = PromotionActivationCandidate & Readonly<{
  id: string;
  code: string;
  version: number;
  name: string;
  status: "draft" | "active" | "retired";
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string;
  referencedProductsValid: boolean;
}>;

export type DraftSaveResult = Readonly<{ id: string; updatedAt: string }>;
export type PromotionDraftSaveResult = Readonly<{
  id: string;
  version: number;
  updatedAt: string;
  changed: boolean;
}>;
export type PromotionTargetInput = Readonly<{
  targetKind: "product" | "policy_group";
  targetId: string;
}>;

export type AdminTransaction = Readonly<{
  assertActorAuthority: (input: Readonly<{
    actorUserId: string;
    clerkUserId: string;
    capability: Capability;
  }>) => Promise<void>;
  savePolicyGroup: (input: Readonly<{
    policyGroupId: string | null;
    slug: string;
    name: string;
    expectedUpdatedAt: string | null;
    now: Date;
  }>) => Promise<DraftSaveResult & Readonly<{ active: boolean }>>;
  setPolicyGroupActive: (input: Readonly<{
    policyGroupId: string;
    active: boolean;
    expectedUpdatedAt: string;
    now: Date;
  }>) => Promise<DraftSaveResult & Readonly<{ active: boolean }>>;
  saveProductDraft: (input: Readonly<{
    productId: string | null;
    slug: string;
    name: string;
    packageForm: string;
    materialIdentity: string;
    policyGroupId: string;
    expectedUpdatedAt: string | null;
    now: Date;
  }>) => Promise<DraftSaveResult>;
  supersedeProductPrice: (input: Readonly<{
    productId: string;
    amountMinor: number;
    currency: string;
    now: Date;
  }>) => Promise<Readonly<{ id: string; version: number }>>;
  saveLotDraft: (input: Readonly<{
    lotId: string | null;
    productId: string;
    supplierName: string;
    supplierLotCode: string;
    analyticalMethod: string | null;
    receivedQuantity: number;
    availableQuantity: number;
    manufacturedAt: string | null;
    expiresAt: string | null;
    expectedUpdatedAt: string | null;
    now: Date;
  }>) => Promise<DraftSaveResult>;
  setLotStatus: (input: Readonly<{
    lotId: string;
    status: "released" | "quarantined" | "exhausted" | "recalled";
    expectedUpdatedAt: string;
    now: Date;
  }>) => Promise<DraftSaveResult & Readonly<{ status: string }>>;
  getLotPublicationFacts: (lotId: string) => Promise<Readonly<{
    id: string;
    supplierLotCode: string;
    analyticalMethod: string | null;
    manufacturedAt: string | null;
    expiresAt: string | null;
    status: "draft" | "quarantined" | "released" | "exhausted" | "recalled";
    updatedAt: string;
  }> | null>;
  saveCoaDraft: (input: Readonly<{
    coaDocumentId: string | null;
    lotId: string;
    storageKey: string;
    evidenceHash: string;
    issuedAt: string | null;
    expectedStorageKey: string | null;
    expectedEvidenceHash: string | null;
  }>) => Promise<Readonly<{ id: string; active: boolean; public: boolean }>>;
  setCoaActive: (input: Readonly<{
    coaDocumentId: string;
    active: boolean;
    expectedStorageKey: string;
    expectedEvidenceHash: string;
  }>) => Promise<Readonly<{ id: string; active: boolean }>>;
  saveAnalyticalClaimDraft: (input: Readonly<{
    claimId: string | null;
    productId: string;
    lotId: string;
    coaDocumentId: string;
    text: string;
    expectedUpdatedAt: string | null;
    now: Date;
  }>) => Promise<DraftSaveResult>;
  getAnalyticalClaimPublicationFacts: (claimId: string) => Promise<Readonly<{
    id: string;
    text: string;
    evidenceId: string;
    evidenceValid: boolean;
    active: boolean;
    updatedAt: string;
  }> | null>;
  setAnalyticalClaimActive: (input: Readonly<{
    claimId: string;
    active: boolean;
    expectedUpdatedAt: string;
    now: Date;
  }>) => Promise<DraftSaveResult & Readonly<{ active: boolean }>>;
  savePromotionDraft: (input: Readonly<{
    promotionId: string | null;
    code: string;
    name: string;
    kind: PromotionRecord["kind"];
    amountMinor: number | null;
    basisPoints: number | null;
    currency: string | null;
    configuration: unknown;
    startsAt: Date | null;
    endsAt: Date | null;
    targets: readonly PromotionTargetInput[];
    expectedVersion: number | null;
    now: Date;
  }>) => Promise<PromotionDraftSaveResult>;
  getProductPublicationFacts: (
    productId: string,
  ) => Promise<(ProductPublicationFacts & Readonly<{
    status: "draft" | "active" | "retired";
    updatedAt: string;
  }>) | null>;
  setProductStatus: (
    productId: string,
    status: "active" | "retired",
    expectedUpdatedAt: string,
    now: Date,
  ) => Promise<Readonly<{ id: string; status: "active" | "retired"; updatedAt: string }>>;
  getPromotion: (promotionId: string) => Promise<PromotionRecord | null>;
  setPromotionStatus: (
    promotionId: string,
    status: "active" | "retired",
    expectedVersion: number,
    expectedUpdatedAt: string,
    now: Date,
  ) => Promise<Readonly<{
    id: string;
    status: "active" | "retired";
    version: number;
    updatedAt: string;
  }>>;
  getCoaDocument: (coaDocumentId: string) => Promise<Readonly<{
    id: string;
    storageKey: string;
    evidenceHash: string;
    active: boolean;
    public: boolean;
  }> | null>;
  setCoaPublic: (input: Readonly<{
    coaDocumentId: string;
    expectedStorageKey: string;
    expectedEvidenceHash: string;
  }>) => Promise<Readonly<{ id: string; public: true }>>;
  insertAttestationVersion: (input: Readonly<{
    policyText: string;
    contentHash: string;
    now: Date;
  }>) => Promise<Readonly<{ id: string; version: number }>>;
  supersedeDestination: (input: Readonly<{
    scopeKind: "product" | "policy_group";
    targetId: string;
    stateCode: string;
    result: "allowed" | "review" | "blocked";
    now: Date;
  }>) => Promise<Readonly<{ id: string; version: number }>>;
  getBuyerReactivationFacts: (userId: string) => Promise<Readonly<{
    userId: string;
    clerkUserId: string;
    status: BuyerStatus;
    updatedAt: string;
    ageConfirmed21Plus: boolean;
    researchPurpose: ResearchPurpose | null;
    acceptedCurrentAttestation: boolean;
    currentAttestationVersion: string | null;
  }> | null>;
  setBuyerStatus: (
    userId: string,
    status: BuyerStatus,
    expectedUpdatedAt: string,
    now: Date,
  ) => Promise<Readonly<{ userId: string; status: BuyerStatus; updatedAt: string }>>;
  decideReview: (input: Readonly<{
    reviewRequestId: string;
    outcome: "approved" | "rejected";
    actorUserId: string;
    now: Date;
  }>) => Promise<Readonly<{
    id: string;
    outcome: "approved" | "rejected";
    coversBuyerReview: boolean;
    changed: boolean;
  }>>;
  getRefundEligibility: (orderId: string, idempotencyKey: string) => Promise<Readonly<{
    orderId: string;
    orderState: string;
    currency: string;
    verifiedPaidMinor: number;
    refundedMinor: number;
    outstandingRequested: boolean;
    provider: string | null;
    verifiedPaymentEventId: string | null;
  }> | null>;
  insertRefundRequest: (input: Readonly<{
    orderId: string;
    requestedByUserId: string;
    provider: string;
    verifiedPaymentEventId: string;
    requestedAmountMinor: number;
    currency: string;
    reasonRedacted: string | null;
    idempotencyKey: string;
    now: Date;
  }>) => Promise<Readonly<{
    id: string;
    status: "requested" | "submitted" | "succeeded" | "failed" | "cancelled";
    provider: string;
    changed: boolean;
  }>>;
  getShipmentEligibility: (orderId: string) => Promise<Readonly<{
    orderId: string;
    orderState: string;
    releaseId: string | null;
    releaseState: "issued" | "revoked" | "expired" | "consumed" | null;
    releaseExpiresAt: string | null;
    shipmentState: "pending" | "handed_off" | "delivered" | "exception" | null;
    shipmentUpdatedAt: string | null;
  }> | null>;
  upsertPendingShipment: (input: Readonly<{
    orderId: string;
    carrier: string;
    trackingReference: string;
    expectedUpdatedAt: string | null;
    now: Date;
  }>) => Promise<Readonly<{ id: string; state: "pending" }>>;
  changeCapability: (input: Readonly<{
    userId: string;
    capability: Capability;
    enabled: boolean;
    actorUserId: string;
    correlationId: string;
    now: Date;
  }>) => Promise<Readonly<{ changed: boolean }>>;
  appendAudit: (event: AdminAuditEvent) => Promise<void>;
}>;

export type AdminRepository = Readonly<{
  rateLimitStore: RateLimitStore;
  transaction: <T>(work: (transaction: AdminTransaction) => Promise<T>) => Promise<T>;
  retrySerializableTransaction: <T>(
    work: (transaction: AdminTransaction) => Promise<T>,
  ) => Promise<T>;
}>;

const mutationLimit = 30;
const mutationWindowMs = 60_000;

const operationCapability: Readonly<
  Partial<Record<AuthorizationOperation, Capability>>
> = Object.freeze({
  "catalog.publish": "catalog:publish",
  "destination.manage": "destination:manage",
  "promotion.manage": "promotion:manage",
  "review.decide": "review:decide",
  "refund.request": "refund:request",
  "fulfillment.release.consume": "fulfillment:release:consume",
  "staff.manage": "staff:manage",
});

function authorizedTransaction<T>(
  repository: AdminRepository,
  context: AdminCommandContext,
  principal: Principal,
  operation: AuthorizationOperation,
  work: (tx: AdminTransaction) => Promise<T>,
): Promise<T> {
  const capability = operationCapability[operation];
  if (!capability) throw new Error("Admin operation has no persisted authority mapping");
  return repository.transaction(async (tx) => {
    await tx.assertActorAuthority({
      actorUserId: principal.actorId,
      clerkUserId: context.identity!.clerkUserId,
      capability,
    });
    return work(tx);
  });
}

function authorizedRetryingTransaction<T>(
  repository: AdminRepository,
  context: AdminCommandContext,
  principal: Principal,
  operation: AuthorizationOperation,
  work: (tx: AdminTransaction) => Promise<T>,
): Promise<T> {
  const capability = operationCapability[operation];
  if (!capability) throw new Error("Admin operation has no persisted authority mapping");
  return repository.retrySerializableTransaction(async (tx) => {
    await tx.assertActorAuthority({
      actorUserId: principal.actorId,
      clerkUserId: context.identity!.clerkUserId,
      capability,
    });
    return work(tx);
  });
}

async function authorizeAndLimit(
  repository: AdminRepository,
  context: AdminCommandContext,
  operation: AuthorizationOperation,
): Promise<Principal> {
  if (!Number.isFinite(context.now.getTime()) || !context.correlationId.trim()) {
    throw new Error("Admin command context is invalid");
  }
  const principal = assertStaffCommandAccess({
    principal: context.principal,
    identity: context.identity,
    operation,
    now: context.now,
  });
  const decision = await consumeFixedWindowLimit({
    store: repository.rateLimitStore,
    scope: createRateLimitScope(principal.actorId, operation, context.rateLimitSecret),
    limit: mutationLimit,
    windowMs: mutationWindowMs,
    now: context.now,
  });
  if (!decision.allowed) throw new Error(`Admin mutation rate limit exceeded until ${decision.retryAt}`);
  return principal;
}

export type StaffCommerceAuthorizationOperationV1 =
  | "refund.request"
  | "fulfillment.release.consume";

export async function authorizeStaffCommerceCommandV1(
  repository: AdminRepository,
  context: AdminCommandContext,
  operation: StaffCommerceAuthorizationOperationV1,
): Promise<Readonly<{
  actorUserId: string;
  actorClerkUserId: string;
}>> {
  const principal = await authorizeAndLimit(repository, context, operation);
  return Object.freeze({
    actorUserId: principal.actorId,
    actorClerkUserId: context.identity!.clerkUserId,
  });
}

function audit(
  principal: Principal,
  context: AdminCommandContext,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata: AdminAuditEvent["metadata"],
): AdminAuditEvent {
  return {
    actorUserId: principal.actorId,
    action,
    resourceType,
    resourceId,
    correlationId: context.correlationId,
    metadata,
  };
}

function requireId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function requirePositiveVersion(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function assertSafePublicString(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} is required`);
  const result = scanPublicCopy(
    { text: value, claims: [] },
    { version: "task5-publication-policy-v1", activeLotEvidenceIds: [] },
  );
  if (!result.publishable) throw new Error(`${label} violates public content policy`);
}

function assertSafeLotMetadata(value: string, label: string): void {
  const evidenceId = "lot-metadata-validation";
  const result = scanPublicCopy(
    {
      text: value,
      claims: [{
        id: evidenceId,
        kind: "analytical",
        text: value,
        lotEvidenceIds: [evidenceId],
      }],
    },
    {
      version: "task5-lot-metadata-policy-v1",
      activeLotEvidenceIds: [evidenceId],
    },
  );
  if (!result.publishable) throw new Error(`${label} violates public content policy`);
}

export async function activateProduct(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{ productId: string; expectedUpdatedAt: string }>,
) {
  const principal = await authorizeAndLimit(repository, context, "catalog.publish");
  return authorizedTransaction(repository, context, principal, "catalog.publish", async (tx) => {
    const productId = requireId(input.productId, "Product ID");
    const expectedUpdatedAt = requireId(input.expectedUpdatedAt, "Expected product version");
    const facts = await tx.getProductPublicationFacts(productId);
    if (!facts) throw new Error("Product does not exist");
    if (facts.updatedAt !== expectedUpdatedAt) throw new Error("Stale product write rejected");
    if (facts.status !== "draft") {
      throw new Error("Only a draft product can be activated; retired products are terminal");
    }
    validateProductPublication(facts);
    const result = await tx.setProductStatus(
      productId,
      "active",
      expectedUpdatedAt,
      context.now,
    );
    await tx.appendAudit(
      audit(principal, context, "catalog.product.activated", "product", productId, {
        status: "active",
      }),
    );
    return result;
  });
}

export async function activatePromotion(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{
    promotionId: string;
    expectedVersion: number;
    expectedUpdatedAt: string;
  }>,
) {
  const principal = await authorizeAndLimit(repository, context, "promotion.manage");
  return authorizedTransaction(repository, context, principal, "promotion.manage", async (tx) => {
    const promotionId = requireId(input.promotionId, "Promotion ID");
    const expectedVersion = requirePositiveVersion(input.expectedVersion, "Expected terms version");
    const expectedUpdatedAt = requireId(input.expectedUpdatedAt, "Expected promotion version");
    const promotion = await tx.getPromotion(promotionId);
    if (!promotion) throw new Error("Promotion does not exist");
    if (promotion.version !== expectedVersion || promotion.updatedAt !== expectedUpdatedAt) {
      throw new Error("Stale promotion write rejected");
    }
    if (promotion.status !== "draft") {
      throw new Error("Only a draft promotion can be activated; retired promotions are terminal");
    }
    assertSafePublicString(promotion.name, "Promotion name");
    validatePromotionForActivation({
      kind: promotion.kind,
      amountMinor: promotion.amountMinor,
      basisPoints: promotion.basisPoints,
      currency: promotion.currency,
      configuration: promotion.configuration,
    });
    if (!promotion.referencedProductsValid) {
      throw new Error("Promotion references missing or inactive products");
    }
    const result = await tx.setPromotionStatus(
      promotionId,
      "active",
      expectedVersion,
      expectedUpdatedAt,
      context.now,
    );
    await tx.appendAudit(
      audit(principal, context, "promotion.activated", "promotion", promotionId, {
        kind: promotion.kind,
        status: "active",
      }),
    );
    return result;
  });
}

export async function publishCoaDocument(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{ coaDocumentId: string }>,
  dependencies: Readonly<{ storageVerifier: StorageVerifier }>,
) {
  const principal = await authorizeAndLimit(repository, context, "catalog.publish");
  const id = requireId(input.coaDocumentId, "COA document ID");
  const coa = await authorizedTransaction(repository, context, principal, "catalog.publish", (tx) => tx.getCoaDocument(id));
  if (!coa || !coa.active || coa.public) {
    throw new Error("An active private COA draft is required");
  }
  await verifyCoaForPublication(dependencies.storageVerifier, {
    storageKey: coa.storageKey,
    expectedSha256: coa.evidenceHash,
  });
  return authorizedTransaction(repository, context, principal, "catalog.publish", async (tx) => {
    const result = await tx.setCoaPublic({
      coaDocumentId: id,
      expectedStorageKey: coa.storageKey,
      expectedEvidenceHash: coa.evidenceHash,
    });
    await tx.appendAudit(
      audit(principal, context, "catalog.coa.published", "coa_document", id, {
        public: true,
      }),
    );
    return result;
  });
}

export async function publishAttestationVersion(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{
    policyText: string;
    suppliedContentHash?: string;
  }>,
) {
  const principal = await authorizeAndLimit(repository, context, "catalog.publish");
  const contentHash = validateAttestationManifest(
    input.policyText,
    input.suppliedContentHash,
  );
  return authorizedTransaction(repository, context, principal, "catalog.publish", async (tx) => {
    const result = await tx.insertAttestationVersion({
      policyText: input.policyText,
      contentHash,
      now: context.now,
    });
    await tx.appendAudit(
      audit(principal, context, "attestation.published", "attestation_version", result.id, {
        version: result.version,
      }),
    );
    return result;
  });
}

export async function supersedeDestinationPolicy(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{
    scopeKind: "product" | "policy_group";
    targetId: string;
    stateCode: string;
    result: "allowed" | "review" | "blocked";
  }>,
) {
  const principal = await authorizeAndLimit(repository, context, "destination.manage");
  const targetId = requireId(input.targetId, "Destination target ID");
  const stateCode = input.stateCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(stateCode)) {
    throw new Error("Destination policy input is invalid");
  }
  return authorizedTransaction(repository, context, principal, "destination.manage", async (tx) => {
    const result = await tx.supersedeDestination({ ...input, targetId, stateCode, now: context.now });
    await tx.appendAudit(
      audit(principal, context, "destination.policy.superseded", "destination_policy", result.id, {
        stateCode,
        result: input.result,
        version: result.version,
      }),
    );
    return result;
  });
}

export async function changeBuyerStatus(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{ userId: string; status: BuyerStatus; expectedUpdatedAt: string }>,
  dependencies: Readonly<{
    loadTargetIdentity: (
      clerkUserId: string,
      referenceTime: Date,
    ) => Promise<VerifiedIdentity | null>;
  }>,
) {
  const principal = await authorizeAndLimit(repository, context, "review.decide");
  const userId = requireId(input.userId, "Buyer user ID");
  const expectedUpdatedAt = requireId(input.expectedUpdatedAt, "Expected buyer version");
  const snapshot = await authorizedTransaction(repository, context, principal, "review.decide", (tx) =>
    tx.getBuyerReactivationFacts(userId),
  );
  if (!snapshot) throw new Error("Buyer profile does not exist");
  if (snapshot.updatedAt !== expectedUpdatedAt) {
    throw new Error("Stale buyer status write rejected");
  }
  const targetIdentity =
    input.status === "active"
      ? await dependencies.loadTargetIdentity(snapshot.clerkUserId, context.now)
      : null;
  return authorizedTransaction(repository, context, principal, "review.decide", async (tx) => {
    const facts = await tx.getBuyerReactivationFacts(userId);
    if (!facts) throw new Error("Buyer profile does not exist");
    if (
      facts.updatedAt !== snapshot.updatedAt ||
      facts.clerkUserId !== snapshot.clerkUserId ||
      facts.ageConfirmed21Plus !== snapshot.ageConfirmed21Plus ||
      facts.researchPurpose !== snapshot.researchPurpose ||
      facts.acceptedCurrentAttestation !== snapshot.acceptedCurrentAttestation ||
      facts.currentAttestationVersion !== snapshot.currentAttestationVersion
    ) {
      throw new Error("Buyer eligibility facts changed during re-verification");
    }
    if (input.status === "active") {
      const decision = evaluateBuyerActivation({
        emailVerified:
          targetIdentity !== null &&
          targetIdentity.clerkUserId === facts.clerkUserId &&
          isVerifiedIdentityAt(targetIdentity, context.now),
        ageConfirmed21Plus: facts.ageConfirmed21Plus,
        researchPurpose: facts.researchPurpose,
        acceptedAttestationVersion: facts.acceptedCurrentAttestation
          ? facts.currentAttestationVersion
          : null,
        currentAttestationVersion: facts.currentAttestationVersion ?? "",
        statusSignal: null,
      });
      if (decision.status !== "active") {
        throw new Error(`Buyer cannot be activated: ${decision.reasons.join(", ")}`);
      }
    }
    const result = await tx.setBuyerStatus(
      userId,
      input.status,
      expectedUpdatedAt,
      context.now,
    );
    await tx.appendAudit(
      audit(principal, context, "buyer.status.changed", "buyer_profile", userId, {
        previousStatus: facts.status,
        status: input.status,
      }),
    );
    return result;
  });
}

export async function decideReviewRequest(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{
    reviewRequestId: string;
    outcome: "approved" | "rejected";
  }>,
) {
  const principal = await authorizeAndLimit(repository, context, "review.decide");
  return authorizedTransaction(repository, context, principal, "review.decide", async (tx) => {
    const id = requireId(input.reviewRequestId, "Review request ID");
    const result = await tx.decideReview({
      ...input,
      reviewRequestId: id,
      actorUserId: principal.actorId,
      now: context.now,
    });
    if (result.changed) {
      await tx.appendAudit(
        audit(principal, context, "review.decided", "review_request", id, {
          outcome: result.outcome,
          coversBuyerReview: result.coversBuyerReview,
        }),
      );
    }
    return result;
  });
}

export async function requestRefundIntent(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{
    orderId: string;
    requestedAmountMinor: number;
    reasonRedacted: string | null;
    idempotencyKey: string;
  }>,
) {
  const principal = await authorizeAndLimit(repository, context, "refund.request");
  return authorizedRetryingTransaction(repository, context, principal, "refund.request", async (tx) => {
    const orderId = requireId(input.orderId, "Order ID");
    if (!Number.isSafeInteger(input.requestedAmountMinor) || input.requestedAmountMinor <= 0) {
      throw new Error("Refund amount must be a positive minor-unit integer");
    }
    const idempotencyKey = requireId(input.idempotencyKey, "Refund idempotency key");
    const facts = await tx.getRefundEligibility(orderId, idempotencyKey);
    if (
      facts !== null &&
      facts.orderState !== "paid_pending_fulfillment" &&
      facts.orderState !== "paid_on_hold"
    ) {
      throw new Error("A pre-handoff paid order is required for a refund intent");
    }
    if (!facts || !facts.provider || !facts.verifiedPaymentEventId) {
      throw new Error("One exact verified payment authority is required");
    }
    if (facts.outstandingRequested) throw new Error("An outstanding refund request already exists");
    const remaining = facts.verifiedPaidMinor - facts.refundedMinor;
    if (input.requestedAmountMinor > remaining) {
      throw new Error("Refund amount exceeds the verified remaining balance");
    }
    const reasonRedacted = input.reasonRedacted?.trim() || null;
    if (reasonRedacted !== null && reasonRedacted.length > 500) {
      throw new Error("Refund reason exceeds its safe length limit");
    }
    const result = await tx.insertRefundRequest({
      orderId,
      requestedByUserId: principal.actorId,
      provider: facts.provider,
      verifiedPaymentEventId: facts.verifiedPaymentEventId,
      requestedAmountMinor: input.requestedAmountMinor,
      currency: facts.currency,
      reasonRedacted,
      idempotencyKey,
      now: context.now,
    });
    if (result.changed) {
      await tx.appendAudit(
        audit(principal, context, "refund.requested", "refund", result.id, {
          orderId,
          amountMinor: input.requestedAmountMinor,
          currency: facts.currency,
        }),
      );
    }
    return result;
  });
}

export async function savePendingShipmentMetadata(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{
    orderId: string;
    carrier: string;
    trackingReference: string;
    expectedUpdatedAt: string | null;
  }>,
) {
  const principal = await authorizeAndLimit(
    repository,
    context,
    "fulfillment.release.consume",
  );
  return authorizedTransaction(repository, context, principal, "fulfillment.release.consume", async (tx) => {
    const orderId = requireId(input.orderId, "Order ID");
    const carrier = requireId(input.carrier, "Carrier");
    const trackingReference = requireId(input.trackingReference, "Tracking reference");
    if (carrier.length > 100 || trackingReference.length > 200) {
      throw new Error("Shipment metadata exceeds its safe length limit");
    }
    const facts = await tx.getShipmentEligibility(orderId);
    if (
      !facts ||
      (facts.orderState !== "paid_pending_fulfillment" &&
        facts.orderState !== "paid_on_hold")
    ) {
      throw new Error("Shipment preparation requires paid pending fulfillment or paid hold");
    }
    if (facts.shipmentState !== null && facts.shipmentState !== "pending") {
      throw new Error("Only pending shipment metadata can be changed");
    }
    if (
      facts.releaseId !== null ||
      facts.releaseState !== null ||
      facts.releaseExpiresAt !== null
    ) {
      throw new Error("Shipment preparation cannot modify release authority");
    }
    if (facts.shipmentUpdatedAt !== input.expectedUpdatedAt) {
      throw new Error("Stale shipment metadata write rejected");
    }
    const result = await tx.upsertPendingShipment({
      orderId,
      carrier,
      trackingReference,
      expectedUpdatedAt: input.expectedUpdatedAt,
      now: context.now,
    });
    await tx.appendAudit(
      audit(principal, context, "shipment.metadata.saved", "shipment", result.id, {
        orderId,
        state: "pending",
      }),
    );
    return result;
  });
}

export async function changeStaffCapability(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{ userId: string; capability: Capability; enabled: boolean }>,
) {
  const principal = await authorizeAndLimit(repository, context, "staff.manage");
  if (!isCapability(input.capability)) throw new Error("Unknown staff capability");
  if (input.enabled && input.userId.trim() === principal.actorId) {
    throw new Error("Self-targeted staff capability grants are not permitted");
  }
  return authorizedTransaction(repository, context, principal, "staff.manage", async (tx) => {
    const userId = requireId(input.userId, "Staff user ID");
    const result = await tx.changeCapability({
      ...input,
      userId,
      actorUserId: principal.actorId,
      correlationId: context.correlationId,
      now: context.now,
    });
    if (result.changed) {
      await tx.appendAudit(
        audit(
          principal,
          context,
          input.enabled ? "staff.capability.granted" : "staff.capability.revoked",
          "staff_role",
          `${userId}:${input.capability}`,
          { capability: input.capability },
        ),
      );
    }
    return result;
  });
}

function safeSlug(value: string, label: string): string {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) {
    throw new Error(`${label} must be a lowercase URL slug`);
  }
  return slug;
}

function bounded(value: string, label: string, maximum = 240): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`${label} is missing or too long`);
  }
  return normalized;
}

function parseOptionalInstant(value: string | null | undefined, label: string): Date | null {
  if (value === null || value === undefined || !value.trim()) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be an exact ISO-8601 instant`);
  }
  return parsed;
}

function validatePromotionDraftShape(input: Readonly<{
  amountMinor: number | null;
  basisPoints: number | null;
  currency: string | null;
  configuration: unknown;
}>): void {
  if (
    input.amountMinor !== null &&
    (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0)
  ) {
    throw new Error("Promotion amount must be a positive minor-unit integer");
  }
  if (
    input.basisPoints !== null &&
    (!Number.isSafeInteger(input.basisPoints) ||
      input.basisPoints < 1 ||
      input.basisPoints > 10_000)
  ) {
    throw new Error("Promotion basis points are invalid");
  }
  if (input.amountMinor !== null && input.basisPoints !== null) {
    throw new Error("Promotion draft cannot combine amount and percentage discounts");
  }
  if (input.currency !== null && !/^[A-Z]{3}$/.test(input.currency)) {
    throw new Error("Promotion currency is invalid");
  }
  if ((input.amountMinor === null) !== (input.currency === null)) {
    throw new Error("Promotion amount and currency must be supplied together");
  }
  if (
    typeof input.configuration !== "object" ||
    input.configuration === null ||
    Array.isArray(input.configuration)
  ) {
    throw new Error("Promotion draft configuration must be an object");
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(input.configuration);
  } catch {
    throw new Error("Promotion draft configuration must be JSON serializable");
  }
  if (!serialized || serialized.length > 10_000) {
    throw new Error("Promotion draft configuration is too large");
  }
}

export async function savePolicyGroup(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{
    policyGroupId?: string;
    slug: string;
    name: string;
    expectedUpdatedAt?: string;
  }>,
) {
  const principal = await authorizeAndLimit(repository, context, "catalog.publish");
  const name = bounded(input.name, "Policy-group name", 160);
  assertSafePublicString(name, "Policy-group name");
  return authorizedTransaction(repository, context, principal, "catalog.publish", async (tx) => {
    const result = await tx.savePolicyGroup({
      policyGroupId: input.policyGroupId ? requireId(input.policyGroupId, "Policy-group ID") : null,
      slug: safeSlug(input.slug, "Policy-group slug"),
      name,
      expectedUpdatedAt: input.expectedUpdatedAt ? requireId(input.expectedUpdatedAt, "Expected policy-group version") : null,
      now: context.now,
    });
    await tx.appendAudit(audit(principal, context, input.policyGroupId ? "catalog.policy_group.updated" : "catalog.policy_group.created", "product_policy_group", result.id, { active: result.active }));
    return result;
  });
}

export async function setPolicyGroupLifecycle(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{ policyGroupId: string; active: boolean; expectedUpdatedAt: string }>,
) {
  const principal = await authorizeAndLimit(repository, context, "catalog.publish");
  return authorizedTransaction(repository, context, principal, "catalog.publish", async (tx) => {
    const id = requireId(input.policyGroupId, "Policy-group ID");
    const result = await tx.setPolicyGroupActive({
      policyGroupId: id,
      active: input.active,
      expectedUpdatedAt: requireId(input.expectedUpdatedAt, "Expected policy-group version"),
      now: context.now,
    });
    await tx.appendAudit(audit(principal, context, input.active ? "catalog.policy_group.activated" : "catalog.policy_group.deactivated", "product_policy_group", id, { active: input.active }));
    return result;
  });
}

export async function saveProductDraft(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{
    productId?: string;
    slug: string;
    name: string;
    packageForm: string;
    materialIdentity: string;
    policyGroupId: string;
    expectedUpdatedAt?: string;
  }>,
) {
  const principal = await authorizeAndLimit(repository, context, "catalog.publish");
  const name = bounded(input.name, "Product name");
  const packageForm = bounded(input.packageForm, "Package form");
  const materialIdentity = bounded(input.materialIdentity, "Material identity", 500);
  for (const [text, label] of [[name, "Product name"], [packageForm, "Package form"], [materialIdentity, "Material identity"]] as const) {
    assertSafePublicString(text, label);
  }
  return authorizedTransaction(repository, context, principal, "catalog.publish", async (tx) => {
    const result = await tx.saveProductDraft({
      productId: input.productId ? requireId(input.productId, "Product ID") : null,
      slug: safeSlug(input.slug, "Product slug"),
      name,
      packageForm,
      materialIdentity,
      policyGroupId: requireId(input.policyGroupId, "Policy-group ID"),
      expectedUpdatedAt: input.expectedUpdatedAt ? requireId(input.expectedUpdatedAt, "Expected product version") : null,
      now: context.now,
    });
    await tx.appendAudit(audit(principal, context, input.productId ? "catalog.product.draft_updated" : "catalog.product.draft_created", "product", result.id, { status: "draft" }));
    return result;
  });
}

export async function retireProduct(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{ productId: string; expectedUpdatedAt: string }>,
) {
  const principal = await authorizeAndLimit(repository, context, "catalog.publish");
  return authorizedTransaction(repository, context, principal, "catalog.publish", async (tx) => {
    const id = requireId(input.productId, "Product ID");
    const result = await tx.setProductStatus(id, "retired", requireId(input.expectedUpdatedAt, "Expected product version"), context.now);
    await tx.appendAudit(audit(principal, context, "catalog.product.retired", "product", id, { status: "retired" }));
    return result;
  });
}

export async function supersedeProductPrice(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{ productId: string; amountMinor: number; currency: string }>,
) {
  const principal = await authorizeAndLimit(repository, context, "catalog.publish");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("Price must be a positive minor-unit integer");
  const currency = input.currency.trim().toUpperCase();
  if (currency !== "USD") throw new Error("Task 5 V1 prices must use USD");
  return authorizedTransaction(repository, context, principal, "catalog.publish", async (tx) => {
    const productId = requireId(input.productId, "Product ID");
    const result = await tx.supersedeProductPrice({ productId, amountMinor: input.amountMinor, currency, now: context.now });
    await tx.appendAudit(audit(principal, context, "catalog.price.superseded", "product_price", result.id, { productId, version: result.version, amountMinor: input.amountMinor, currency }));
    return result;
  });
}

export async function saveLotDraft(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{
    lotId?: string;
    productId: string;
    supplierName: string;
    supplierLotCode: string;
    analyticalMethod?: string;
    receivedQuantity: number;
    availableQuantity: number;
    manufacturedAt?: string;
    expiresAt?: string;
    expectedUpdatedAt?: string;
  }>,
) {
  const principal = await authorizeAndLimit(repository, context, "catalog.publish");
  if (!Number.isSafeInteger(input.receivedQuantity) || input.receivedQuantity <= 0 || !Number.isSafeInteger(input.availableQuantity) || input.availableQuantity < 0 || input.availableQuantity > input.receivedQuantity) throw new Error("Lot quantities are invalid");
  const analyticalMethod = input.analyticalMethod?.trim() ?? "";
  const manufacturedAt = parseOptionalInstant(input.manufacturedAt, "Manufactured at");
  const expiresAt = parseOptionalInstant(input.expiresAt, "Expires at");
  if (manufacturedAt && expiresAt && expiresAt.getTime() <= manufacturedAt.getTime()) {
    throw new Error("Lot expiry must be after manufacture");
  }
  if (manufacturedAt && manufacturedAt.getTime() > context.now.getTime()) {
    throw new Error("Manufactured at cannot be in the future");
  }
  return authorizedTransaction(repository, context, principal, "catalog.publish", async (tx) => {
    const result = await tx.saveLotDraft({
      lotId: input.lotId ? requireId(input.lotId, "Lot ID") : null,
      productId: requireId(input.productId, "Product ID"),
      supplierName: bounded(input.supplierName, "Supplier name", 200),
      supplierLotCode: bounded(input.supplierLotCode, "Supplier lot code", 160),
      analyticalMethod: analyticalMethod
        ? bounded(analyticalMethod, "Analytical method", 240)
        : null,
      receivedQuantity: input.receivedQuantity,
      availableQuantity: input.availableQuantity,
      manufacturedAt: manufacturedAt?.toISOString() ?? null,
      expiresAt: expiresAt?.toISOString() ?? null,
      expectedUpdatedAt: input.expectedUpdatedAt ? requireId(input.expectedUpdatedAt, "Expected lot version") : null,
      now: context.now,
    });
    await tx.appendAudit(audit(principal, context, input.lotId ? "catalog.lot.draft_updated" : "catalog.lot.draft_created", "lot", result.id, { status: "draft" }));
    return result;
  });
}

export async function setLotLifecycle(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{ lotId: string; status: "released" | "quarantined" | "exhausted" | "recalled"; expectedUpdatedAt: string }>,
) {
  const principal = await authorizeAndLimit(repository, context, "catalog.publish");
  return authorizedTransaction(repository, context, principal, "catalog.publish", async (tx) => {
    const id = requireId(input.lotId, "Lot ID");
    if (input.status === "released") {
      const facts = await tx.getLotPublicationFacts(id);
      if (!facts) throw new Error("Lot does not exist");
      if (facts.status !== "draft" && facts.status !== "quarantined") {
        throw new Error("Lot lifecycle transition is not permitted");
      }
      assertSafeLotMetadata(facts.supplierLotCode, "Supplier lot code");
      if (facts.analyticalMethod !== null) {
        assertSafeLotMetadata(facts.analyticalMethod, "Analytical method");
      }
      if (facts.manufacturedAt && new Date(facts.manufacturedAt).getTime() > context.now.getTime()) {
        throw new Error("A future manufactured date cannot be released");
      }
      if (facts.expiresAt && new Date(facts.expiresAt).getTime() <= context.now.getTime()) {
        throw new Error("An expired lot cannot be released");
      }
    }
    const result = await tx.setLotStatus({ lotId: id, status: input.status, expectedUpdatedAt: requireId(input.expectedUpdatedAt, "Expected lot version"), now: context.now });
    await tx.appendAudit(audit(principal, context, `catalog.lot.${input.status}`, "lot", id, { status: input.status }));
    return result;
  });
}

export async function saveCoaDraft(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{ coaDocumentId?: string; lotId: string; storageKey: string; evidenceHash: string; issuedAt?: string; expectedStorageKey?: string; expectedEvidenceHash?: string }>,
) {
  const principal = await authorizeAndLimit(repository, context, "catalog.publish");
  const evidenceHash = input.evidenceHash.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(evidenceHash)) throw new Error("COA evidence hash must be lowercase SHA-256");
  const issuedAt = parseOptionalInstant(input.issuedAt, "COA issued at");
  if (issuedAt && issuedAt.getTime() > context.now.getTime()) {
    throw new Error("COA issued at cannot be in the future");
  }
  return authorizedTransaction(repository, context, principal, "catalog.publish", async (tx) => {
    const result = await tx.saveCoaDraft({
      coaDocumentId: input.coaDocumentId ? requireId(input.coaDocumentId, "COA document ID") : null,
      lotId: requireId(input.lotId, "Lot ID"),
      storageKey: bounded(input.storageKey, "Private storage key", 500),
      evidenceHash,
      issuedAt: issuedAt?.toISOString() ?? null,
      expectedStorageKey: input.expectedStorageKey ? requireId(input.expectedStorageKey, "Expected storage key") : null,
      expectedEvidenceHash: input.expectedEvidenceHash ? requireId(input.expectedEvidenceHash, "Expected evidence hash") : null,
    });
    await tx.appendAudit(audit(principal, context, input.coaDocumentId ? "catalog.coa.draft_updated" : "catalog.coa.draft_created", "coa_document", result.id, { active: result.active, public: result.public }));
    return result;
  });
}

export async function setCoaLifecycle(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{ coaDocumentId: string; active: boolean; expectedStorageKey: string; expectedEvidenceHash: string }>,
) {
  const principal = await authorizeAndLimit(repository, context, "catalog.publish");
  return authorizedTransaction(repository, context, principal, "catalog.publish", async (tx) => {
    const id = requireId(input.coaDocumentId, "COA document ID");
    const result = await tx.setCoaActive({ ...input, coaDocumentId: id });
    await tx.appendAudit(audit(principal, context, input.active ? "catalog.coa.activated_private" : "catalog.coa.deactivated", "coa_document", id, { active: input.active, public: false }));
    return result;
  });
}

export async function saveAnalyticalClaimDraft(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{ claimId?: string; productId: string; lotId: string; coaDocumentId: string; text: string; expectedUpdatedAt?: string }>,
) {
  const principal = await authorizeAndLimit(repository, context, "catalog.publish");
  const text = bounded(input.text, "Analytical claim", 1000);
  return authorizedTransaction(repository, context, principal, "catalog.publish", async (tx) => {
    const result = await tx.saveAnalyticalClaimDraft({
      claimId: input.claimId ? requireId(input.claimId, "Analytical claim ID") : null,
      productId: requireId(input.productId, "Product ID"),
      lotId: requireId(input.lotId, "Lot ID"),
      coaDocumentId: requireId(input.coaDocumentId, "COA document ID"),
      text,
      expectedUpdatedAt: input.expectedUpdatedAt ? requireId(input.expectedUpdatedAt, "Expected analytical claim version") : null,
      now: context.now,
    });
    await tx.appendAudit(audit(principal, context, input.claimId ? "catalog.claim.draft_updated" : "catalog.claim.draft_created", "analytical_claim", result.id, { active: false }));
    return result;
  });
}

export async function setAnalyticalClaimLifecycle(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{ claimId: string; active: boolean; expectedUpdatedAt: string }>,
) {
  const principal = await authorizeAndLimit(repository, context, "catalog.publish");
  return authorizedTransaction(repository, context, principal, "catalog.publish", async (tx) => {
    const id = requireId(input.claimId, "Analytical claim ID");
    if (input.active) {
      const facts = await tx.getAnalyticalClaimPublicationFacts(id);
      if (!facts || !facts.evidenceValid) throw new Error("Released lot and active public COA evidence are required");
      const scan = scanPublicCopy({ text: facts.text, claims: [{ id: facts.id, kind: "analytical", text: facts.text, lotEvidenceIds: [facts.evidenceId] }] }, { version: "task5-publication-policy-v1", activeLotEvidenceIds: [facts.evidenceId] });
      if (!scan.publishable) throw new Error("Analytical claim violates public content policy");
    }
    const result = await tx.setAnalyticalClaimActive({ claimId: id, active: input.active, expectedUpdatedAt: requireId(input.expectedUpdatedAt, "Expected analytical claim version"), now: context.now });
    await tx.appendAudit(audit(principal, context, input.active ? "catalog.claim.activated" : "catalog.claim.retired", "analytical_claim", id, { active: input.active }));
    return result;
  });
}

export async function savePromotionDraft(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{
    promotionId?: string;
    code: string;
    name: string;
    kind: PromotionRecord["kind"];
    amountMinor: number | null;
    basisPoints: number | null;
    currency: string | null;
    configuration: unknown;
    startsAt?: string | null;
    endsAt?: string | null;
    targets?: readonly PromotionTargetInput[];
    expectedVersion?: number;
    expectedUpdatedAt?: string;
  }>,
) {
  const principal = await authorizeAndLimit(repository, context, "promotion.manage");
  const name = bounded(input.name, "Promotion name", 200);
  assertSafePublicString(name, "Promotion name");
  const currency = input.currency?.trim().toUpperCase() ?? null;
  validatePromotionDraftShape({
    amountMinor: input.amountMinor,
    basisPoints: input.basisPoints,
    currency,
    configuration: input.configuration,
  });
  const startsAt = parseOptionalInstant(input.startsAt, "Promotion start");
  const endsAt = parseOptionalInstant(input.endsAt, "Promotion end");
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw new Error("Promotion end must follow its start");
  }
  const targets = input.targets ?? [];
  if (targets.length > 50) throw new Error("Promotion has too many targets");
  const normalizedTargets = targets.map((target) => ({
    targetKind: target.targetKind,
    targetId: requireId(target.targetId, "Promotion target ID"),
  })).toSorted((left, right) =>
    left.targetKind.localeCompare(right.targetKind) || left.targetId.localeCompare(right.targetId),
  );
  if (
    new Set(normalizedTargets.map((target) => `${target.targetKind}:${target.targetId}`)).size !==
    normalizedTargets.length
  ) {
    throw new Error("Promotion targets must be unique");
  }
  return authorizedTransaction(repository, context, principal, "promotion.manage", async (tx) => {
    const result = await tx.savePromotionDraft({
      promotionId: input.promotionId ? requireId(input.promotionId, "Promotion ID") : null,
      code: bounded(input.code, "Promotion code", 80).toUpperCase(),
      name,
      kind: input.kind,
      amountMinor: input.amountMinor,
      basisPoints: input.basisPoints,
      currency,
      configuration: input.configuration,
      startsAt,
      endsAt,
      targets: normalizedTargets,
      expectedVersion: input.promotionId
        ? requirePositiveVersion(input.expectedVersion ?? 0, "Expected terms version")
        : null,
      now: context.now,
    });
    if (result.changed) {
      await tx.appendAudit(audit(principal, context, input.promotionId ? "promotion.draft_updated" : "promotion.draft_created", "promotion", result.id, { kind: input.kind, status: "draft", version: result.version }));
    }
    return result;
  });
}

export async function retirePromotion(
  repository: AdminRepository,
  context: AdminCommandContext,
  input: Readonly<{
    promotionId: string;
    expectedVersion: number;
    expectedUpdatedAt: string;
  }>,
) {
  const principal = await authorizeAndLimit(repository, context, "promotion.manage");
  return authorizedTransaction(repository, context, principal, "promotion.manage", async (tx) => {
    const id = requireId(input.promotionId, "Promotion ID");
    const result = await tx.setPromotionStatus(
      id,
      "retired",
      requirePositiveVersion(input.expectedVersion, "Expected terms version"),
      requireId(input.expectedUpdatedAt, "Expected promotion version"),
      context.now,
    );
    await tx.appendAudit(audit(principal, context, "promotion.retired", "promotion", id, { status: "retired" }));
    return result;
  });
}
