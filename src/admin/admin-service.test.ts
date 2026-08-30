import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { VerifiedIdentity } from "@/auth/identity";
import type { Principal } from "@/domain/authorization";
import type { StorageVerifier } from "@/security/storage";

import {
  activateProduct,
  activatePromotion,
  changeBuyerStatus,
  changeStaffCapability,
  decideReviewRequest,
  publishAttestationVersion,
  importCoaFromManifest,
  publishCoaDocument,
  requestRefundIntent,
  savePendingShipmentMetadata,
  supersedeDestinationPolicy,
  type AdminRepository,
  type AdminTransaction,
} from "./admin-service";

const now = new Date("2026-08-25T12:00:00.000Z");
const identity: VerifiedIdentity = {
  clerkUserId: "clerk-admin",
  primaryEmail: "admin@example.test",
  emailVerifiedAt: now.toISOString(),
  mfaConfigured: true,
  secondFactorCompleted: true,
};
const capabilities = [
  "catalog:publish",
  "destination:manage",
  "promotion:manage",
  "review:decide",
  "refund:request",
  "fulfillment:release:consume",
  "staff:manage",
] as const;
const principal: Principal = {
  actorId: "admin-user-id",
  clerkUserId: identity.clerkUserId,
  buyerStatus: null,
  capabilities,
  mfaSatisfied: true,
};

type TestState = {
  productStatus: "draft" | "active" | "retired";
  promotionStatus: "draft" | "active" | "retired";
  promotionVersion: number;
  coaPublic: boolean;
  buyerStatus: "active" | "review" | "blocked";
  reviewOutcome: "approved" | "rejected" | null;
  refundId: string | null;
  shipment: { carrier: string; trackingReference: string } | null;
  capabilities: string[];
  attestations: { version: number; digest: string }[];
  destinations: { version: number; stateCode: string; result: string }[];
  audits: { action: string; correlationId: string; metadata: unknown }[];
};

function createRepository(options: {
  failAudit?: boolean;
  incompleteBuyer?: boolean;
  promotionName?: string;
  rateCount?: number;
  shipmentReleaseId?: string | null;
} = {}): {
  repository: AdminRepository;
  state: TestState;
} {
  const state: TestState = {
    productStatus: "draft",
    promotionStatus: "draft",
    promotionVersion: 1,
    coaPublic: false,
    buyerStatus: "review",
    reviewOutcome: null,
    refundId: null,
    shipment: null,
    capabilities: [],
    attestations: [],
    destinations: [],
    audits: [],
  };
  const transaction: AdminTransaction = {
    async assertActorAuthority() {},
    async savePolicyGroup() {
      return { id: "group-a", active: false, updatedAt: now.toISOString() };
    },
    async setPolicyGroupActive(input) {
      return { id: "group-a", active: input.active, updatedAt: now.toISOString() };
    },
    async saveProductDraft() {
      return { id: "product-a", updatedAt: now.toISOString() };
    },
    async supersedeProductPrice() {
      return { id: "price-a", version: 2 };
    },
    async saveLotDraft() {
      return { id: "lot-a", updatedAt: now.toISOString() };
    },
    async setLotStatus(input) {
      return { id: "lot-a", status: input.status, updatedAt: now.toISOString() };
    },
    async getLotPublicationFacts() {
      return {
        id: "lot-a",
        supplierLotCode: "SYN-LOT-A",
        analyticalMethod: "HPLC",
        manufacturedAt: "2026-07-01T00:00:00.000Z",
        expiresAt: "2027-07-01T00:00:00.000Z",
        status: "draft",
        updatedAt: "2026-08-24T12:00:00.000Z",
      };
    },
    async saveCoaDraft() {
      return { id: "coa-a", active: false, public: false };
    },
    async setCoaActive(input) {
      return { id: "coa-a", active: input.active };
    },
    async saveAnalyticalClaimDraft() {
      return { id: "claim-a", updatedAt: now.toISOString() };
    },
    async getAnalyticalClaimPublicationFacts() {
      return {
        id: "claim-a",
        text: "HPLC analytical record COA",
        evidenceId: "coa-a",
        evidenceValid: true,
        active: false,
        updatedAt: "2026-08-24T12:00:00.000Z",
      };
    },
    async setAnalyticalClaimActive(input) {
      return { id: "claim-a", active: input.active, updatedAt: now.toISOString() };
    },
    async savePromotionDraft() {
      return {
        id: "promo-a",
        version: state.promotionVersion,
        updatedAt: now.toISOString(),
        changed: true,
      };
    },
    async getProductPublicationFacts() {
      return {
        productId: "product-a",
        name: "Reference standard A",
        packageForm: "Sealed unit",
        materialIdentity: "Synthetic reference identity A",
        status: state.productStatus,
        updatedAt: "2026-08-24T12:00:00.000Z",
        policyGroupActive: true,
        currentPriceMinor: 2400,
        releasedQuantity: 3,
        hasAllowDestination: true,
        activeEvidenceIds: ["coa-a"],
        claims: [{ id: "claim-a", text: "HPLC analytical record coa", lotEvidenceIds: ["coa-a"] }],
      };
    },
    async setProductStatus(_id, status) {
      state.productStatus = status;
      return { id: "product-a", status, updatedAt: now.toISOString() };
    },
    async getPromotion() {
      return {
        id: "promo-a",
        code: "SYN-BUNDLE",
        version: state.promotionVersion,
        name: options.promotionName ?? "Reference bundle",
        kind: "bundle",
        status: state.promotionStatus,
        amountMinor: 3600,
        basisPoints: null,
        currency: "USD",
        configuration: { productIds: ["product-a", "product-b"] },
        startsAt: null,
        endsAt: null,
        updatedAt: "2026-08-24T12:00:00.000Z",
        referencedProductsValid: true,
      };
    },
    async setPromotionStatus(_id, status) {
      state.promotionStatus = status;
      return {
        id: "promo-a",
        status,
        version: state.promotionVersion,
        updatedAt: now.toISOString(),
      };
    },
    async getCoaDocument() {
      return {
        id: "coa-a",
        storageKey: "private/coa-a.pdf",
        evidenceHash: "a".repeat(64),
        active: true,
        public: state.coaPublic,
      };
    },
    async setCoaPublic() {
      state.coaPublic = true;
      return { id: "coa-a", public: true };
    },
    async insertAttestationVersion(input) {
      const version = state.attestations.length + 1;
      state.attestations.push({ version, digest: input.contentHash });
      return { id: `attestation-${version}`, version };
    },
    async supersedeDestination(input) {
      const record = {
        id: `destination-${state.destinations.length + 1}`,
        version: state.destinations.length + 1,
      };
      state.destinations.push({
        version: record.version,
        stateCode: input.stateCode,
        result: input.result,
      });
      return record;
    },
    async getBuyerReactivationFacts() {
      return {
        userId: "buyer-a",
        clerkUserId: "clerk-buyer",
        status: state.buyerStatus,
        updatedAt: "2026-08-24T12:00:00.000Z",
        ageConfirmed21Plus: !options.incompleteBuyer,
        researchPurpose: "analytical",
        acceptedCurrentAttestation: true,
        currentAttestationVersion: "2",
      };
    },
    async setBuyerStatus(_id, status) {
      state.buyerStatus = status;
      return { userId: "buyer-a", status, updatedAt: now.toISOString() };
    },
    async decideReview(input) {
      if (state.reviewOutcome === null) {
        state.reviewOutcome = input.outcome;
        return {
          id: input.reviewRequestId,
          outcome: input.outcome,
          coversBuyerReview: input.outcome === "approved",
          changed: true,
        };
      }
      if (state.reviewOutcome !== input.outcome) throw new Error("Review was already decided");
      return {
        id: input.reviewRequestId,
        outcome: state.reviewOutcome,
        coversBuyerReview: state.reviewOutcome === "approved",
        changed: false,
      };
    },
    async getRefundEligibility() {
      return {
        orderId: "order-a",
        orderState: "paid_pending_fulfillment",
        currency: "USD",
        verifiedPaidMinor: 5000,
        refundedMinor: 1000,
        outstandingRequested: false,
        provider: "test-provider",
        verifiedPaymentEventId: "payment-event-a",
      };
    },
    async insertRefundRequest(input) {
      const changed = state.refundId === null;
      state.refundId ??= "refund-a";
      return { id: state.refundId, status: "requested", changed, ...input };
    },
    async getShipmentEligibility() {
      const releaseId = options.shipmentReleaseId ?? null;
      return {
        orderId: "order-a",
        orderState: "paid_pending_fulfillment",
        releaseId,
        releaseState: releaseId === null ? null : "issued",
        releaseExpiresAt: releaseId === null ? null : "2099-08-25T12:00:00.000Z",
        shipmentState: state.shipment ? "pending" : null,
        shipmentUpdatedAt: state.shipment ? now.toISOString() : null,
      };
    },
    async upsertPendingShipment(input) {
      state.shipment = {
        carrier: input.carrier,
        trackingReference: input.trackingReference,
      };
      return { id: "shipment-a", state: "pending" };
    },
    async changeCapability(input) {
      const index = state.capabilities.indexOf(input.capability);
      const changed = input.enabled ? index < 0 : index >= 0;
      if (input.enabled && index < 0) state.capabilities.push(input.capability);
      if (!input.enabled && index >= 0) state.capabilities.splice(index, 1);
      return { changed };
    },
    async appendAudit(event) {
      if (options.failAudit) throw new Error("synthetic audit failure");
      state.audits.push(event);
    },
  };

  return {
    state,
    repository: {
      rateLimitStore: { increment: async () => options.rateCount ?? 1 },
      async transaction(work) {
        const before = structuredClone(state);
        try {
          return await work(transaction);
        } catch (error) {
          Object.assign(state, before);
          throw error;
        }
      },
      async retrySerializableTransaction(work) {
        const before = structuredClone(state);
        try {
          return await work(transaction);
        } catch (error) {
          Object.assign(state, before);
          throw error;
        }
      },
    },
  };
}

function context(correlationId = "admin-command-1") {
  return {
    principal,
    identity,
    now,
    correlationId,
    rateLimitSecret: "task5-rate-limit-secret-at-least-32-characters",
  } as const;
}

const exactVerifier: StorageVerifier = {
  mode: "test",
  verify: async () => ({ exists: true, sha256: "a".repeat(64) }),
};

describe("Task 5 admin mutation services", () => {
  it("publishes product, promotion, verified COA, and attestation with one audit each", async () => {
    const { repository, state } = createRepository();
    await activateProduct(repository, context("product-1"), {
      productId: "product-a",
      expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
    });
    await activatePromotion(repository, context("promotion-1"), {
      promotionId: "promo-a",
      expectedVersion: 1,
      expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
    });
    await publishCoaDocument(repository, context("coa-1"), {
      coaDocumentId: "coa-a",
    }, { storageVerifier: exactVerifier });
    await publishAttestationVersion(repository, context("attestation-1"), {
      policyText: "Research-use policy version two.",
    });

    expect(state).toMatchObject({ productStatus: "active", promotionStatus: "active", coaPublic: true });
    expect(state.attestations[0]?.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(state.audits.map((event) => event.action)).toEqual([
      "catalog.product.activated",
      "promotion.activated",
      "catalog.coa.published",
      "attestation.published",
    ]);
  });

  it("rolls back a sensitive mutation when its audit fails", async () => {
    const { repository, state } = createRepository({ failAudit: true });
    await expect(
      activateProduct(repository, context(), {
        productId: "product-a",
        expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
      }),
    ).rejects.toThrow(/audit failure/);
    expect(state.productStatus).toBe("draft");
  });

  it.each([
    ["disabled", { mode: "disabled", verify: async () => ({ exists: true, sha256: "a".repeat(64) }) }],
    ["missing", { mode: "test", verify: async () => ({ exists: false, sha256: null }) }],
    ["digest mismatch", { mode: "test", verify: async () => ({ exists: true, sha256: "b".repeat(64) }) }],
  ] as const)("keeps a COA private when storage verification is %s", async (_label, verifier) => {
    const { repository, state } = createRepository();
    await expect(
      publishCoaDocument(repository, context(), {
        coaDocumentId: "coa-a",
      }, { storageVerifier: verifier }),
    ).rejects.toThrow();
    expect(state.coaPublic).toBe(false);
    expect(state.audits).toEqual([]);
  });

  it("rejects unsafe promotion copy and a rate-limited mutation before state changes", async () => {
    const unsafe = createRepository({ promotionName: "Guaranteed treatment" });
    await expect(
      activatePromotion(unsafe.repository, context(), {
        promotionId: "promo-a",
        expectedVersion: 1,
        expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
      }),
    ).rejects.toThrow(/content policy/i);
    expect(unsafe.state.promotionStatus).toBe("draft");

    const limited = createRepository({ rateCount: 31 });
    await expect(
      activateProduct(limited.repository, context(), {
        productId: "product-a",
        expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
      }),
    ).rejects.toThrow(/rate limit/i);
    expect(limited.state.productStatus).toBe("draft");
  });

  it("atomically supersedes a destination version and audits the new version", async () => {
    const { repository, state } = createRepository();
    await supersedeDestinationPolicy(repository, context(), {
      scopeKind: "product",
      targetId: "product-a",
      stateCode: "ca",
      result: "allowed",
    });
    expect(state.destinations).toEqual([{ version: 1, stateCode: "CA", result: "allowed" }]);
    expect(state.audits[0]?.metadata).toEqual({ stateCode: "CA", result: "allowed", version: 1 });
  });

  it("preserves pending-only immutable review decisions and makes identical retries idempotent", async () => {
    const { repository, state } = createRepository();
    const first = await decideReviewRequest(repository, context("review-1"), {
      reviewRequestId: "review-a",
      outcome: "approved",
    });
    const retry = await decideReviewRequest(repository, context("review-2"), {
      reviewRequestId: "review-a",
      outcome: "approved",
    });
    expect(first.changed).toBe(true);
    expect(retry.changed).toBe(false);
    expect(state.audits).toHaveLength(1);
    await expect(
      decideReviewRequest(repository, context("review-3"), {
        reviewRequestId: "review-a",
        outcome: "rejected",
      }),
    ).rejects.toThrow(/already decided/i);
  });

  it("reruns complete buyer facts before staff restores active status", async () => {
    const { repository, state } = createRepository();
    await changeBuyerStatus(repository, context(), {
      userId: "buyer-a",
      status: "active",
      expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
    }, {
      loadTargetIdentity: async () => ({
        ...identity,
        clerkUserId: "clerk-buyer",
        primaryEmail: "buyer@example.test",
      }),
    });
    expect(state.buyerStatus).toBe("active");
    expect(state.audits[0]?.action).toBe("buyer.status.changed");
  });

  it("passes the command reference time into delayed target identity projection", async () => {
    const { repository, state } = createRepository();
    let projectionReference: Date | null = null;
    await changeBuyerStatus(repository, context(), {
      userId: "buyer-a",
      status: "active",
      expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
    }, {
      loadTargetIdentity: async (_clerkUserId, referenceTime) => {
        await Promise.resolve();
        projectionReference = referenceTime;
        return {
          ...identity,
          clerkUserId: "clerk-buyer",
          primaryEmail: "buyer@example.test",
          emailVerifiedAt: referenceTime.toISOString(),
        };
      },
    });
    expect(projectionReference).toEqual(now);
    expect(state.buyerStatus).toBe("active");
  });

  it("fails closed when staff attempts reactivation without complete current buyer facts", async () => {
    const { repository, state } = createRepository({ incompleteBuyer: true });
    await expect(
      changeBuyerStatus(
        repository,
        context(),
        {
          userId: "buyer-a",
          status: "active",
          expectedUpdatedAt: "2026-08-24T12:00:00.000Z",
        },
        { loadTargetIdentity: async () => null },
      ),
    ).rejects.toThrow(/cannot be activated/i);
    expect(state.buyerStatus).toBe("review");
    expect(state.audits).toEqual([]);
  });

  it("derives refund provider from verified payment facts and records only a requested intent", async () => {
    const { repository, state } = createRepository();
    const result = await requestRefundIntent(repository, context(), {
      orderId: "order-a",
      requestedAmountMinor: 3500,
      reasonRedacted: "Duplicate approved request",
      idempotencyKey: "refund-request-a",
    });
    expect(result).toMatchObject({ status: "requested", provider: "test-provider" });
    expect(state.refundId).toBe("refund-a");
    expect(JSON.stringify(state.audits[0])).not.toContain("Duplicate approved request");
  });

  it("saves preparation-only pending shipment metadata without release authority", async () => {
    const { repository, state } = createRepository();
    const result = await savePendingShipmentMetadata(repository, context(), {
      orderId: "order-a",
      carrier: "Research Carrier",
      trackingReference: "TRACK-001",
      expectedUpdatedAt: null,
    });
    expect(result.state).toBe("pending");
    expect(state.shipment).toEqual({ carrier: "Research Carrier", trackingReference: "TRACK-001" });
  });

  it("rejects preparation metadata when a shipment already carries release authority", async () => {
    const { repository, state } = createRepository({ shipmentReleaseId: "release-a" });
    await expect(
      savePendingShipmentMetadata(repository, context(), {
        orderId: "order-a",
        carrier: "Research Carrier",
        trackingReference: "TRACK-001",
        expectedUpdatedAt: null,
      }),
    ).rejects.toThrow(/release authority/i);
    expect(state.shipment).toBeNull();
    expect(state.audits).toEqual([]);
  });

  it("grants and revokes only a known capability with current MFA and audit", async () => {
    const { repository, state } = createRepository();
    await changeStaffCapability(repository, context("grant-1"), {
      userId: "staff-a",
      capability: "catalog:publish",
      enabled: true,
    });
    await changeStaffCapability(repository, context("revoke-1"), {
      userId: "staff-a",
      capability: "catalog:publish",
      enabled: false,
    });
    expect(state.capabilities).toEqual([]);
    expect(state.audits.map((event) => event.action)).toEqual([
      "staff.capability.granted",
      "staff.capability.revoked",
    ]);
    await expect(
      changeStaffCapability(repository, context(), {
        userId: "staff-a",
        capability: "root:everything" as never,
        enabled: true,
      }),
    ).rejects.toThrow(/capability/i);
  });
});

describe("importCoaFromManifest", () => {
  const body = new TextEncoder().encode("manifest-declared-coa-bytes");
  const hash = createHash("sha256").update(body).digest("hex");

  function storage() {
    const store = new Map<string, string>();
    return {
      store,
      storageWriter: {
        mode: "test" as const,
        write: async ({ storageKey, body: written }: { storageKey: string; body: Uint8Array }) => {
          store.set(storageKey, createHash("sha256").update(written).digest("hex"));
        },
      },
      storageVerifier: {
        mode: "test" as const,
        verify: async (storageKey: string) => {
          const found = store.get(storageKey);
          return found ? { exists: true, sha256: found } : { exists: false, sha256: null };
        },
      },
    };
  }

  it("stores the object and records the draft with one audit", async () => {
    const { repository, state } = createRepository();
    const { store, storageWriter, storageVerifier } = storage();

    const result = await importCoaFromManifest(
      repository,
      context("coa-import-1"),
      { storageWriter, storageVerifier },
      { lotId: "lot-a", storageKey: "private/coa-new.pdf", evidenceHash: hash, body },
    );

    expect(result).toMatchObject({ id: "coa-a", ingest: { status: "written" } });
    expect(store.get("private/coa-new.pdf")).toBe(hash);
    expect(state.audits.map((event) => event.action)).toEqual([
      "catalog.coa.imported",
    ]);
  });

  it("records no draft and no audit when the bytes contradict the manifest", async () => {
    const { repository, state } = createRepository();
    const { store, storageWriter, storageVerifier } = storage();

    await expect(
      importCoaFromManifest(
        repository,
        context("coa-import-2"),
        { storageWriter, storageVerifier },
        {
          lotId: "lot-a",
          storageKey: "private/coa-new.pdf",
          evidenceHash: "a".repeat(64),
          body,
        },
      ),
    ).rejects.toThrow(/digest does not match the manifest/i);

    expect(store.size).toBe(0);
    expect(state.audits).toEqual([]);
  });
});
