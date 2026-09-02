import "server-only";

import { createHash } from "node:crypto";

import type {
  AccountRepository,
  AccountTransaction,
  BuyerProfileRecord,
} from "@/account/account-service";
import type { AccountSummary, OrderDetail } from "@/account/account-read";
import type {
  AdminAuditEvent,
  AdminRepository,
  AdminTransaction,
} from "@/admin/admin-service";
import type {
  AdminReadResource,
  AdminReadSnapshot,
  AdminReadSnapshotFor,
  SafePromotionConfiguration,
} from "@/admin/admin-read";
import { signLocalActor, verifyLocalActor, type VerifiedIdentity } from "@/auth/identity";
import { createLocalCommerceDriverV1 } from "@/auth/local-commerce-driver";
import { createLocalGrowthDriverV1 } from "@/auth/local-growth-driver";
import { CAPABILITIES, type Capability } from "@/domain/authorization";
import type { BuyerStatus } from "@/domain/eligibility";
import { createRewardsService } from "@/growth/rewards-service";

import type { LocalTestDriver } from "./local-driver-types";

const LOCAL_FIXTURE_SENTINEL = "LOCAL_TEST_ONLY_PROPEPTIQ_91C4E7";
/** Objects written by the local harness writer, keyed by storage key. */
const localIngestedCoaObjects = new Map<string, string>();
const fixedNow = "2026-08-25T12:00:00.000Z";
const localPolicyGroupId = "local-policy-group-a";
const localProductId = "local-product-a";
const localLotId = "local-lot-a";
const localPromotionId = "local-promotion-a";
const localCoaId = "local-coa-a";
const localClaimId = "local-claim-a";
const localOrderId = "local-order-customer";
const localReviewId = "local-review-request";

type ActorKey =
  | "customer"
  | "blocked"
  | "admin"
  | "non_admin"
  | "missing_mfa"
  | "limited_admin"
  | "growth_owner"
  | "growth_buyer";

type FixedActor = Readonly<{
  key: ActorKey;
  label: string;
  description: string;
  userId: string;
  identity: VerifiedIdentity;
  initialStatus: BuyerStatus | null;
  capabilities: readonly Capability[];
}>;

const fixedActors: readonly FixedActor[] = Object.freeze([
  {
    key: "customer",
    label: "Fixed new customer",
    description: "Verified email; no buyer profile until the account form is complete.",
    userId: "50000000-0000-4000-8000-000000000001",
    identity: {
      clerkUserId: `${LOCAL_FIXTURE_SENTINEL}_CUSTOMER`,
      primaryEmail: "fixed-customer@local.test",
      emailVerifiedAt: fixedNow,
      mfaConfigured: false,
      secondFactorCompleted: false,
    },
    initialStatus: null,
    capabilities: [],
  },
  {
    key: "blocked",
    label: "Fixed blocked customer",
    description: "Can read the account and its own order, but cannot check out.",
    userId: "50000000-0000-4000-8000-000000000002",
    identity: {
      clerkUserId: `${LOCAL_FIXTURE_SENTINEL}_BLOCKED`,
      primaryEmail: "fixed-blocked@local.test",
      emailVerifiedAt: fixedNow,
      mfaConfigured: false,
      secondFactorCompleted: false,
    },
    initialStatus: "blocked",
    capabilities: [],
  },
  {
    key: "admin",
    label: "Fixed capable administrator",
    description: "All known capabilities with configured, current-session MFA.",
    userId: "50000000-0000-4000-8000-000000000003",
    identity: {
      clerkUserId: `${LOCAL_FIXTURE_SENTINEL}_ADMIN`,
      primaryEmail: "fixed-admin@local.test",
      emailVerifiedAt: fixedNow,
      mfaConfigured: true,
      secondFactorCompleted: true,
    },
    initialStatus: null,
    capabilities: CAPABILITIES,
  },
  {
    key: "non_admin",
    label: "Fixed non-administrator",
    description: "Authenticated with current-session MFA, but without staff capabilities.",
    userId: "50000000-0000-4000-8000-000000000004",
    identity: {
      clerkUserId: `${LOCAL_FIXTURE_SENTINEL}_NON_ADMIN`,
      primaryEmail: "fixed-non-admin@local.test",
      emailVerifiedAt: fixedNow,
      mfaConfigured: true,
      secondFactorCompleted: true,
    },
    initialStatus: "active",
    capabilities: [],
  },
  {
    key: "missing_mfa",
    label: "Fixed administrator without MFA",
    description: "Has staff capabilities but no configured/current second factor.",
    userId: "50000000-0000-4000-8000-000000000005",
    identity: {
      clerkUserId: `${LOCAL_FIXTURE_SENTINEL}_MISSING_MFA`,
      primaryEmail: "fixed-no-mfa@local.test",
      emailVerifiedAt: fixedNow,
      mfaConfigured: false,
      secondFactorCompleted: false,
    },
    initialStatus: null,
    capabilities: CAPABILITIES,
  },
  {
    key: "limited_admin",
    label: "Fixed limited administrator",
    description: "MFA is complete, but catalog publication is not granted.",
    userId: "50000000-0000-4000-8000-000000000006",
    identity: {
      clerkUserId: `${LOCAL_FIXTURE_SENTINEL}_LIMITED`,
      primaryEmail: "fixed-limited-admin@local.test",
      emailVerifiedAt: fixedNow,
      mfaConfigured: true,
      secondFactorCompleted: true,
    },
    initialStatus: null,
    capabilities: ["order:read:any"],
  },
  {
    key: "growth_owner",
    label: "Fixed growth owner",
    description: "Active owner with deterministic points and a private growth workspace.",
    userId: "50000000-0000-4000-8000-000000000007",
    identity: {
      clerkUserId: `${LOCAL_FIXTURE_SENTINEL}_GROWTH_OWNER`,
      primaryEmail: "fixed-growth-owner@local.test",
      emailVerifiedAt: fixedNow,
      mfaConfigured: false,
      secondFactorCompleted: false,
    },
    initialStatus: "active",
    capabilities: [],
  },
  {
    key: "growth_buyer",
    label: "Fixed referred buyer",
    description: "Active buyer used for deterministic referral and partner fixtures.",
    userId: "50000000-0000-4000-8000-000000000008",
    identity: {
      clerkUserId: `${LOCAL_FIXTURE_SENTINEL}_GROWTH_BUYER`,
      primaryEmail: "fixed-growth-buyer@local.test",
      emailVerifiedAt: fixedNow,
      mfaConfigured: false,
      secondFactorCompleted: false,
    },
    initialStatus: "active",
    capabilities: [],
  },
]);

type LocalState = {
  profiles: Map<string, BuyerProfileRecord | null>;
  acceptances: Set<string>;
  capabilities: Map<string, Capability[]>;
  audits: AdminAuditEvent[];
  rateCounts: Map<string, number>;
  productStatus: "draft" | "active" | "retired";
  productUpdatedAt: string;
  policyGroupActive: boolean;
  policyGroupUpdatedAt: string;
  priceVersion: number;
  lotStatus: "draft" | "quarantined" | "released" | "exhausted" | "recalled";
  lotUpdatedAt: string;
  lotCode: string;
  analyticalMethod: string | null;
  lotManufacturedAt: string | null;
  lotExpiresAt: string | null;
  promotionStatus: "draft" | "active" | "retired";
  promotionCode: string;
  promotionVersion: number;
  promotionName: string;
  promotionKind: "discount" | "bundle" | "subscription" | "loyalty" | "cross_sell";
  promotionAmountMinor: number | null;
  promotionBasisPoints: number | null;
  promotionCurrency: string | null;
  promotionConfiguration: unknown;
  promotionUpdatedAt: string;
  promotionStartsAt: string | null;
  promotionEndsAt: string | null;
  promotionTargets: readonly Readonly<{
    targetKind: "product" | "policy_group";
    targetId: string;
  }>[];
  coaActive: boolean;
  coaPublic: boolean;
  coaStorageKey: string;
  coaEvidenceHash: string;
  coaIssuedAt: string | null;
  claimActive: boolean;
  claimUpdatedAt: string;
  claimText: string;
  attestationVersion: number;
  destinationVersion: number;
  reviewOutcome: "approved" | "rejected" | null;
  refund: { id: string; idempotencyKey: string; amountMinor: number } | null;
  shipment: {
    carrier: string;
    trackingReference: string;
    updatedAt: string;
  } | null;
};

function initialState(): LocalState {
  return {
    profiles: new Map(
      fixedActors.map((actor) => [
        actor.userId,
        actor.initialStatus === null
          ? null
          : {
              userId: actor.userId,
              status: actor.initialStatus,
              ageConfirmedAt: fixedNow,
              researchPurpose: "analytical" as const,
              organizationName: null,
              updatedAt: fixedNow,
            },
      ]),
    ),
    acceptances: new Set(
      fixedActors
        .filter((actor) => actor.initialStatus !== null)
        .map((actor) => `${actor.userId}:1`),
    ),
    capabilities: new Map(
      fixedActors.map((actor) => [actor.userId, [...actor.capabilities]]),
    ),
    audits: [],
    rateCounts: new Map(),
    productStatus: "draft",
    productUpdatedAt: fixedNow,
    policyGroupActive: true,
    policyGroupUpdatedAt: fixedNow,
    priceVersion: 1,
    lotStatus: "released",
    lotUpdatedAt: fixedNow,
    lotCode: "LOCAL-LOT-A",
    analyticalMethod: "HPLC",
    lotManufacturedAt: "2026-07-01T00:00:00.000Z",
    lotExpiresAt: "2099-07-01T00:00:00.000Z",
    promotionStatus: "draft",
    promotionCode: "LOCAL-BUNDLE",
    promotionVersion: 1,
    promotionName: "Synthetic local reference bundle",
    promotionKind: "bundle",
    promotionAmountMinor: 3600,
    promotionBasisPoints: null,
    promotionCurrency: "USD",
    promotionConfiguration: { productIds: [localProductId, "local-product-b"] },
    promotionUpdatedAt: fixedNow,
    promotionStartsAt: null,
    promotionEndsAt: null,
    promotionTargets: [{ targetKind: "product", targetId: localProductId }],
    coaActive: true,
    coaPublic: false,
    coaStorageKey: "local-private/coa-a.pdf",
    coaEvidenceHash: "f".repeat(64),
    coaIssuedAt: "2026-08-20T00:00:00.000Z",
    claimActive: false,
    claimUpdatedAt: fixedNow,
    claimText: "HPLC analytical record COA",
    attestationVersion: 1,
    destinationVersion: 1,
    reviewOutcome: null,
    refund: null,
    shipment: null,
  };
}

const localDriverProcessStateKey = Symbol.for("propeptiq.local-driver-state.v1");
const localProcessState = process as NodeJS.Process & {
  [key: symbol]: LocalState | undefined;
};
const state = localProcessState[localDriverProcessStateKey] ?? initialState();
localProcessState[localDriverProcessStateKey] = state;

const growth = createLocalGrowthDriverV1({
  appendAudit(event) {
    state.audits.push(event);
  },
});

function canonicalLocalValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalLocalValue).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalLocalValue(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonicalLocalTargets(
  targets: readonly Readonly<{ targetKind: string; targetId: string }>[],
): string {
  return targets
    .toSorted((left, right) =>
      left.targetKind.localeCompare(right.targetKind) ||
      left.targetId.localeCompare(right.targetId),
    )
    .map(({ targetKind, targetId }) => `${targetKind}:${targetId}`)
    .join("|");
}

function localPromotionConfiguration(): SafePromotionConfiguration {
  const configuration = state.promotionConfiguration;
  if (state.promotionKind === "discount") return { kind: "discount" };
  if (
    (state.promotionKind === "bundle" || state.promotionKind === "cross_sell") &&
    typeof configuration === "object" &&
    configuration !== null &&
    Array.isArray(Reflect.get(configuration, "productIds"))
  ) {
    return {
      kind: state.promotionKind,
      productIds: Reflect.get(configuration, "productIds") as string[],
    };
  }
  if (
    state.promotionKind === "subscription" &&
    typeof configuration === "object" &&
    configuration !== null
  ) {
    const interval = Reflect.get(configuration, "interval");
    const intervalCount = Reflect.get(configuration, "intervalCount");
    if (
      (interval === "month" || interval === "year") &&
      typeof intervalCount === "number"
    ) {
      return { kind: "subscription", interval, intervalCount };
    }
  }
  if (
    state.promotionKind === "loyalty" &&
    typeof configuration === "object" &&
    configuration !== null &&
    typeof Reflect.get(configuration, "pointsPerDollar") === "number"
  ) {
    return {
      kind: "loyalty",
      pointsPerDollar: Reflect.get(configuration, "pointsPerDollar") as number,
    };
  }
  return { kind: "invalid" };
}

function actorByClerkId(clerkUserId: string): FixedActor | null {
  return fixedActors.find((actor) => actor.identity.clerkUserId === clerkUserId) ?? null;
}

function accountTransaction(): AccountTransaction {
  return {
    async upsertIdentity(identity) {
      const actor = actorByClerkId(identity.clerkUserId);
      if (!actor) throw new Error("Local identity is not a fixed principal");
      return { userId: actor.userId };
    },
    async getBuyerProfile(userId) {
      return state.profiles.get(userId) ?? null;
    },
    async findCurrentAttestations() {
      return [{ id: "local-attestation-current", version: state.attestationVersion }];
    },
    async hasAttestationAcceptance(userId, attestationId) {
      return (
        attestationId === "local-attestation-current" &&
        state.acceptances.has(`${userId}:${state.attestationVersion}`)
      );
    },
    async acceptAttestation(userId, attestationId) {
      if (attestationId !== "local-attestation-current") {
        throw new Error("Local attestation version is not current");
      }
      state.acceptances.add(`${userId}:${state.attestationVersion}`);
    },
    async saveBuyerProfile(profile, expectedUpdatedAt) {
      const current = state.profiles.get(profile.userId) ?? null;
      if ((current?.updatedAt ?? null) !== expectedUpdatedAt) {
        throw new Error("Stale buyer profile write rejected");
      }
      state.profiles.set(profile.userId, profile);
      return profile;
    },
    async appendAudit(event) {
      state.audits.push({
        ...event,
        resourceType: "buyer_profile",
      });
    },
  };
}

const accountRepository: AccountRepository = {
  async transaction(work) {
    const before = structuredClone(state);
    try {
      return await work(accountTransaction());
    } catch (error) {
      Object.assign(state, before);
      throw error;
    }
  },
};

function adminTransaction(): AdminTransaction {
  return {
    ...growth.adminTransactionMethods,
    async assertActorAuthority(input) {
      const actor = actorByClerkId(input.clerkUserId);
      const profile = actor ? state.profiles.get(actor.userId) ?? null : null;
      const capabilities = actor ? state.capabilities.get(actor.userId) ?? [] : [];
      if (
        !actor ||
        actor.userId !== input.actorUserId ||
        profile?.status === "blocked" ||
        !capabilities.includes(input.capability)
      ) {
        throw new Error(`Persisted ${input.capability} capability is required`);
      }
    },
    async savePolicyGroup(input) {
      if (
        (input.policyGroupId !== null && input.policyGroupId !== localPolicyGroupId) ||
        (input.policyGroupId !== null && state.policyGroupUpdatedAt !== input.expectedUpdatedAt) ||
        (input.policyGroupId !== null && state.policyGroupActive)
      ) {
        throw new Error("Fixed policy-group draft is unavailable or stale");
      }
      state.policyGroupActive = false;
      state.policyGroupUpdatedAt = input.now.toISOString();
      return {
        id: localPolicyGroupId,
        active: state.policyGroupActive,
        updatedAt: state.policyGroupUpdatedAt,
      };
    },
    async setPolicyGroupActive(input) {
      if (
        input.policyGroupId !== localPolicyGroupId ||
        input.expectedUpdatedAt !== state.policyGroupUpdatedAt ||
        input.active === state.policyGroupActive
      ) {
        throw new Error("Fixed policy-group lifecycle write is unavailable or stale");
      }
      state.policyGroupActive = input.active;
      state.policyGroupUpdatedAt = input.now.toISOString();
      return {
        id: localPolicyGroupId,
        active: state.policyGroupActive,
        updatedAt: state.policyGroupUpdatedAt,
      };
    },
    async saveProductDraft(input) {
      if (
        (input.productId !== null && input.productId !== localProductId) ||
        input.policyGroupId !== localPolicyGroupId ||
        (input.productId !== null &&
          (state.productStatus !== "draft" ||
            state.productUpdatedAt !== input.expectedUpdatedAt))
      ) {
        throw new Error("Fixed product draft is unavailable or stale");
      }
      state.productStatus = "draft";
      state.productUpdatedAt = input.now.toISOString();
      return { id: localProductId, updatedAt: state.productUpdatedAt };
    },
    async supersedeProductPrice(input) {
      if (input.productId !== localProductId || input.currency !== "USD") {
        throw new Error("Fixed USD product price is required");
      }
      state.priceVersion += 1;
      return { id: `local-price-${state.priceVersion}`, version: state.priceVersion };
    },
    async saveLotDraft(input) {
      if (
        (input.lotId !== null && input.lotId !== localLotId) ||
        input.productId !== localProductId ||
        (input.lotId !== null &&
          (state.lotStatus !== "draft" || state.lotUpdatedAt !== input.expectedUpdatedAt))
      ) {
        throw new Error("Fixed lot draft is unavailable or stale");
      }
      state.lotStatus = "draft";
      state.lotCode = input.supplierLotCode;
      state.analyticalMethod = input.analyticalMethod;
      state.lotManufacturedAt = input.manufacturedAt;
      state.lotExpiresAt = input.expiresAt;
      state.lotUpdatedAt = input.now.toISOString();
      return { id: localLotId, updatedAt: state.lotUpdatedAt };
    },
    async setLotStatus(input) {
      if (
        input.lotId !== localLotId ||
        input.expectedUpdatedAt !== state.lotUpdatedAt
      ) {
        throw new Error("Fixed lot lifecycle write is unavailable or stale");
      }
      const allowed =
        (input.status === "released" &&
          (state.lotStatus === "draft" || state.lotStatus === "quarantined")) ||
        (input.status === "quarantined" &&
          (state.lotStatus === "draft" || state.lotStatus === "released")) ||
        (input.status === "recalled" &&
          (state.lotStatus === "draft" ||
            state.lotStatus === "quarantined" ||
            state.lotStatus === "released"));
      if (!allowed) throw new Error("Fixed lot lifecycle transition is not permitted");
      state.lotStatus = input.status;
      state.lotUpdatedAt = input.now.toISOString();
      return {
        id: localLotId,
        status: state.lotStatus,
        updatedAt: state.lotUpdatedAt,
      };
    },
    async getLotPublicationFacts(lotId) {
      if (lotId !== localLotId) return null;
      return {
        id: localLotId,
        supplierLotCode: state.lotCode,
        analyticalMethod: state.analyticalMethod,
        manufacturedAt: state.lotManufacturedAt,
        expiresAt: state.lotExpiresAt,
        status: state.lotStatus,
        updatedAt: state.lotUpdatedAt,
      };
    },
    async saveCoaDraft(input) {
      if (
        (input.coaDocumentId !== null && input.coaDocumentId !== localCoaId) ||
        input.lotId !== localLotId ||
        input.storageKey !== "local-private/coa-a.pdf" ||
        input.evidenceHash !== "f".repeat(64) ||
        (input.coaDocumentId !== null &&
          (state.coaActive ||
            state.coaPublic ||
            input.expectedStorageKey !== state.coaStorageKey ||
            input.expectedEvidenceHash !== state.coaEvidenceHash))
      ) {
        throw new Error("Fixed private COA draft is unavailable or stale");
      }
      state.coaStorageKey = input.storageKey;
      state.coaEvidenceHash = input.evidenceHash;
      state.coaIssuedAt = input.issuedAt;
      state.coaActive = false;
      state.coaPublic = false;
      return { id: localCoaId, active: false, public: false };
    },
    async setCoaActive(input) {
      if (
        input.coaDocumentId !== localCoaId ||
        input.expectedStorageKey !== state.coaStorageKey ||
        input.expectedEvidenceHash !== state.coaEvidenceHash ||
        input.active === state.coaActive
      ) {
        throw new Error("Fixed COA lifecycle write is unavailable or stale");
      }
      state.coaActive = input.active;
      if (!input.active) state.coaPublic = false;
      return { id: localCoaId, active: state.coaActive };
    },
    async saveAnalyticalClaimDraft(input) {
      if (
        (input.claimId !== null && input.claimId !== localClaimId) ||
        input.productId !== localProductId ||
        input.lotId !== localLotId ||
        input.coaDocumentId !== localCoaId ||
        (input.claimId !== null &&
          (state.claimActive || state.claimUpdatedAt !== input.expectedUpdatedAt))
      ) {
        throw new Error("Fixed analytical-claim draft is unavailable or stale");
      }
      state.claimActive = false;
      state.claimText = input.text;
      state.claimUpdatedAt = input.now.toISOString();
      return { id: localClaimId, updatedAt: state.claimUpdatedAt };
    },
    async getAnalyticalClaimPublicationFacts(claimId) {
      if (claimId !== localClaimId) return null;
      return {
        id: localClaimId,
        text: state.claimText,
        evidenceId: localCoaId,
        evidenceValid:
          state.lotStatus === "released" && state.coaActive && state.coaPublic,
        active: state.claimActive,
        updatedAt: state.claimUpdatedAt,
      };
    },
    async setAnalyticalClaimActive(input) {
      if (
        input.claimId !== localClaimId ||
        input.expectedUpdatedAt !== state.claimUpdatedAt ||
        input.active === state.claimActive
      ) {
        throw new Error("Fixed analytical-claim lifecycle write is unavailable or stale");
      }
      state.claimActive = input.active;
      state.claimUpdatedAt = input.now.toISOString();
      return {
        id: localClaimId,
        active: state.claimActive,
        updatedAt: state.claimUpdatedAt,
      };
    },
    async savePromotionDraft(input) {
      if (
        (input.promotionId !== null && input.promotionId !== localPromotionId) ||
        (input.promotionId !== null &&
          (state.promotionStatus !== "draft" ||
            state.promotionVersion !== input.expectedVersion)) ||
        input.targets.some(
          (target) =>
            (target.targetKind === "product" && target.targetId !== localProductId) ||
            (target.targetKind === "policy_group" &&
              target.targetId !== localPolicyGroupId),
        )
      ) {
        throw new Error("Fixed promotion draft is unavailable or stale");
      }
      const startsAt = input.startsAt?.toISOString() ?? null;
      const endsAt = input.endsAt?.toISOString() ?? null;
      const unchanged =
        input.promotionId !== null &&
        state.promotionCode === input.code &&
        state.promotionName === input.name &&
        state.promotionKind === input.kind &&
        state.promotionAmountMinor === input.amountMinor &&
        state.promotionBasisPoints === input.basisPoints &&
        state.promotionCurrency === input.currency &&
        canonicalLocalValue(state.promotionConfiguration) ===
          canonicalLocalValue(input.configuration) &&
        state.promotionStartsAt === startsAt &&
        state.promotionEndsAt === endsAt &&
        canonicalLocalTargets(state.promotionTargets) ===
          canonicalLocalTargets(input.targets);
      if (unchanged) {
        return {
          id: localPromotionId,
          version: state.promotionVersion,
          updatedAt: state.promotionUpdatedAt,
          changed: false,
        };
      }
      state.promotionStatus = "draft";
      state.promotionCode = input.code;
      state.promotionVersion = input.promotionId === null ? 1 : state.promotionVersion + 1;
      state.promotionName = input.name;
      state.promotionKind = input.kind;
      state.promotionAmountMinor = input.amountMinor;
      state.promotionBasisPoints = input.basisPoints;
      state.promotionCurrency = input.currency;
      state.promotionConfiguration = input.configuration;
      state.promotionStartsAt = startsAt;
      state.promotionEndsAt = endsAt;
      state.promotionTargets = [...input.targets];
      state.promotionUpdatedAt = input.now.toISOString();
      return {
        id: localPromotionId,
        version: state.promotionVersion,
        updatedAt: state.promotionUpdatedAt,
        changed: true,
      };
    },
    async getProductPublicationFacts(productId) {
      if (productId !== localProductId) return null;
      return {
        productId: "local-product-a",
        name: "Synthetic reference standard — local test only",
        packageForm: "Sealed local test unit",
        materialIdentity: "Synthetic local test identity",
        status: state.productStatus,
        updatedAt: state.productUpdatedAt,
        policyGroupActive: state.policyGroupActive,
        currentPriceMinor: 2400,
        releasedQuantity: state.lotStatus === "released" ? 4 : 0,
        hasAllowDestination: true,
        activeEvidenceIds:
          state.coaActive && state.coaPublic ? [localCoaId] : [],
        claims: state.claimActive ? [
          {
            id: localClaimId,
            text: state.claimText,
            lotEvidenceIds:
              state.coaActive && state.coaPublic ? [localCoaId] : [],
          },
        ] : [],
      };
    },
    async setProductStatus(id, status, expectedUpdatedAt, now) {
      if (id !== localProductId) throw new Error("Product does not exist");
      if (state.productUpdatedAt !== expectedUpdatedAt) {
        throw new Error("Stale product write rejected");
      }
      if (
        (status === "active" && state.productStatus !== "draft") ||
        (status === "retired" && state.productStatus === "retired")
      ) {
        throw new Error("Fixed product lifecycle transition is not permitted");
      }
      state.productStatus = status;
      state.productUpdatedAt = now.toISOString();
      return { id: "local-product-a", status, updatedAt: state.productUpdatedAt };
    },
    async getPromotion(promotionId) {
      if (promotionId !== localPromotionId) return null;
      return {
        id: "local-promotion-a",
        code: state.promotionCode,
        version: state.promotionVersion,
        name: state.promotionName,
        kind: state.promotionKind,
        status: state.promotionStatus,
        amountMinor: state.promotionAmountMinor,
        basisPoints: state.promotionBasisPoints,
        currency: state.promotionCurrency,
        configuration: state.promotionConfiguration,
        startsAt: state.promotionStartsAt,
        endsAt: state.promotionEndsAt,
        updatedAt: state.promotionUpdatedAt,
        referencedProductsValid: state.promotionTargets.length > 0,
      };
    },
    async setPromotionStatus(id, status, expectedVersion, expectedUpdatedAt, now) {
      if (id !== localPromotionId) throw new Error("Promotion does not exist");
      if (
        state.promotionVersion !== expectedVersion ||
        state.promotionUpdatedAt !== expectedUpdatedAt
      ) {
        throw new Error("Stale promotion write rejected");
      }
      if (
        (status === "active" && state.promotionStatus !== "draft") ||
        (status === "retired" && state.promotionStatus === "retired")
      ) {
        throw new Error("Fixed promotion lifecycle transition is not permitted");
      }
      state.promotionStatus = status;
      state.promotionUpdatedAt = now.toISOString();
      return {
        id: "local-promotion-a",
        status,
        version: state.promotionVersion,
        updatedAt: state.promotionUpdatedAt,
      };
    },
    async getCoaDocument(coaDocumentId) {
      if (coaDocumentId !== localCoaId) return null;
      return {
        id: "local-coa-a",
        storageKey: state.coaStorageKey,
        evidenceHash: state.coaEvidenceHash,
        active: state.coaActive,
        public: state.coaPublic,
      };
    },
    async setCoaPublic(input) {
      if (
        input.coaDocumentId !== localCoaId ||
        !state.coaActive ||
        state.coaPublic ||
        input.expectedStorageKey !== state.coaStorageKey ||
        input.expectedEvidenceHash !== state.coaEvidenceHash
      ) {
        throw new Error("Stale COA manifest publication rejected");
      }
      state.coaPublic = true;
      return { id: "local-coa-a", public: true };
    },
    async insertAttestationVersion() {
      state.attestationVersion += 1;
      return {
        id: `local-attestation-${state.attestationVersion}`,
        version: state.attestationVersion,
      };
    },
    async supersedeDestination() {
      state.destinationVersion += 1;
      return {
        id: `local-destination-${state.destinationVersion}`,
        version: state.destinationVersion,
      };
    },
    async getBuyerReactivationFacts(userId) {
      const actor = fixedActors.find((candidate) => candidate.userId === userId);
      const profile = state.profiles.get(userId) ?? null;
      if (!actor || !profile) return null;
      return {
        userId,
        clerkUserId: actor.identity.clerkUserId,
        status: profile.status,
        updatedAt: profile.updatedAt,
        ageConfirmed21Plus: profile.ageConfirmedAt !== null,
        researchPurpose: profile.researchPurpose,
        acceptedCurrentAttestation: state.acceptances.has(
          `${userId}:${state.attestationVersion}`,
        ),
        currentAttestationVersion: String(state.attestationVersion),
      };
    },
    async setBuyerStatus(userId, status, expectedUpdatedAt, now) {
      const profile = state.profiles.get(userId) ?? null;
      if (!profile || profile.updatedAt !== expectedUpdatedAt) {
        throw new Error("Stale buyer status write rejected");
      }
      const updated = { ...profile, status, updatedAt: now.toISOString() };
      state.profiles.set(userId, updated);
      return { userId, status, updatedAt: updated.updatedAt };
    },
    async decideReview(input) {
      if (input.reviewRequestId !== localReviewId) {
        throw new Error("Review request does not exist");
      }
      if (state.reviewOutcome === null) {
        state.reviewOutcome = input.outcome;
        return {
          id: input.reviewRequestId,
          outcome: input.outcome,
          coversBuyerReview: input.outcome === "approved",
          changed: true,
        };
      }
      if (state.reviewOutcome !== input.outcome) {
        throw new Error("Review was already decided differently");
      }
      return {
        id: input.reviewRequestId,
        outcome: state.reviewOutcome,
        coversBuyerReview: state.reviewOutcome === "approved",
        changed: false,
      };
    },
    async getRefundEligibility(orderId, idempotencyKey) {
      if (orderId !== localOrderId) return null;
      return {
        orderId: "local-order-customer",
        orderState: "paid_pending_fulfillment",
        currency: "USD",
        verifiedPaidMinor: 2400,
        refundedMinor: 0,
        outstandingRequested:
          state.refund !== null && state.refund.idempotencyKey !== idempotencyKey,
        provider: "local_test",
        verifiedPaymentEventId: "local-verified-payment-event",
      };
    },
    async insertRefundRequest(input) {
      if (input.orderId !== localOrderId) throw new Error("Order does not exist");
      if (state.refund) {
        if (
          state.refund.idempotencyKey !== input.idempotencyKey ||
          state.refund.amountMinor !== input.requestedAmountMinor
        ) {
          throw new Error("Refund idempotency key was already used differently");
        }
        return {
          id: state.refund.id,
          status: "requested",
          provider: input.provider,
          changed: false,
        };
      }
      state.refund = {
        id: "local-refund-request",
        idempotencyKey: input.idempotencyKey,
        amountMinor: input.requestedAmountMinor,
      };
      return {
        id: state.refund.id,
        status: "requested",
        provider: input.provider,
        changed: true,
      };
    },
    async getShipmentEligibility(orderId) {
      if (orderId !== localOrderId) return null;
      return {
        orderId: "local-order-customer",
        orderState: "paid_pending_fulfillment",
        releaseId: null,
        releaseState: null,
        releaseExpiresAt: null,
        shipmentState: state.shipment ? "pending" : null,
        shipmentUpdatedAt: state.shipment?.updatedAt ?? null,
      };
    },
    async upsertPendingShipment(input) {
      if (input.orderId !== localOrderId) throw new Error("Order does not exist");
      if ((state.shipment?.updatedAt ?? null) !== input.expectedUpdatedAt) {
        throw new Error("Stale shipment metadata write rejected");
      }
      state.shipment = {
        carrier: input.carrier,
        trackingReference: input.trackingReference,
        updatedAt: input.now.toISOString(),
      };
      return { id: "local-shipment", state: "pending" };
    },
    async changeCapability(input) {
      const actorCapabilities = state.capabilities.get(input.actorUserId) ?? [];
      if (!actorCapabilities.includes("staff:manage")) {
        throw new Error("Persisted staff:manage capability is required");
      }
      const target = state.capabilities.get(input.userId);
      if (!target) throw new Error("Fixed target identity does not exist");
      const hasCapability = target.includes(input.capability);
      if (input.enabled === hasCapability) return { changed: false };
      state.capabilities.set(
        input.userId,
        input.enabled
          ? [...target, input.capability]
          : target.filter((capability) => capability !== input.capability),
      );
      return { changed: true };
    },
    async appendAudit(event) {
      state.audits.push(event);
    },
  };
}

const adminRepository: AdminRepository = {
  rateLimitStore: {
    async increment(window) {
      const key = `${window.scopeHash}:${window.windowStart.toISOString()}`;
      const count = (state.rateCounts.get(key) ?? 0) + 1;
      state.rateCounts.set(key, count);
      return count;
    },
  },
  async transaction(work) {
    const before = structuredClone(state);
    const growthBefore = growth.captureState();
    try {
      return await work(adminTransaction());
    } catch (error) {
      Object.assign(state, before);
      growth.restoreState(growthBefore);
      throw error;
    }
  },
  async retrySerializableTransaction(work) {
    const before = structuredClone(state);
    const growthBefore = growth.captureState();
    try {
      return await work(adminTransaction());
    } catch (error) {
      Object.assign(state, before);
      growth.restoreState(growthBefore);
      throw error;
    }
  },
};

const localOrders: readonly OrderDetail[] = Object.freeze([
  {
    id: localOrderId,
    state: "paid_pending_fulfillment",
    currency: "USD",
    totalMinor: 2400,
    paymentState: "paid",
    refundState: "none",
    holdState: "none",
    releaseState: "issued",
    shipmentState: "pending",
    createdAt: "2026-08-24T12:00:00.000Z",
    destinationStateCode: "CA",
    items: [
      {
        id: "local-order-item-customer",
        productName: "Synthetic reference standard — local test only",
        packageForm: "Sealed local test unit",
        quantity: 1,
        unitAmountMinor: 2400,
        totalMinor: 2400,
      },
    ],
  },
  {
    id: "local-order-blocked",
    state: "fulfilled",
    currency: "USD",
    totalMinor: 1800,
    paymentState: "paid",
    refundState: "none",
    holdState: "none",
    releaseState: "consumed",
    shipmentState: "delivered",
    createdAt: "2026-08-20T12:00:00.000Z",
    destinationStateCode: "NV",
    items: [
      {
        id: "local-order-item-blocked",
        productName: "Synthetic archived standard — local test only",
        packageForm: "Sealed local test unit",
        quantity: 1,
        unitAmountMinor: 1800,
        totalMinor: 1800,
      },
    ],
  },
]);

function ownerOrderId(userId: string): string | null {
  if (userId === fixedActors[0]!.userId) return localOrderId;
  if (userId === fixedActors[1]!.userId) return "local-order-blocked";
  return null;
}

function localAdminReadSnapshot(resource: AdminReadResource): AdminReadSnapshot {
  const growthSnapshot = growth.readAdminSnapshot(resource);
  if (growthSnapshot !== null) return growthSnapshot as AdminReadSnapshot;
  const base = { limit: 100 as const, truncated: false };
  switch (resource) {
    case "products":
      return {
        ...base,
        resource,
        items: [{
          id: localProductId,
          slug: "synthetic-reference-standard-local-only",
          name: "Synthetic reference standard — local test only",
          packageForm: "Sealed local test unit",
          materialIdentity: "Synthetic local test identity",
          policyGroupId: localPolicyGroupId,
          policyGroupName: "Synthetic local policy group",
          status: state.productStatus,
          createdAt: fixedNow,
          updatedAt: state.productUpdatedAt,
        }],
      };
    case "prices":
      return {
        ...base,
        resource,
        items: [{
          id: `local-price-${state.priceVersion}`,
          productId: localProductId,
          productName: "Synthetic reference standard — local test only",
          version: state.priceVersion,
          amountMinor: 2400,
          currency: "USD",
          effectiveAt: fixedNow,
          supersededAt: null,
          createdAt: fixedNow,
        }],
      };
    case "policy-groups":
      return {
        ...base,
        resource,
        items: [{
          id: localPolicyGroupId,
          slug: "synthetic-local-policy-group",
          name: "Synthetic local policy group",
          active: state.policyGroupActive,
          createdAt: fixedNow,
          updatedAt: state.policyGroupUpdatedAt,
        }],
      };
    case "lots":
      return {
        ...base,
        resource,
        items: [{
          id: localLotId,
          productId: localProductId,
          productName: "Synthetic reference standard — local test only",
          supplierName: "Synthetic local supplier",
          supplierLotCode: state.lotCode,
          analyticalMethod: state.analyticalMethod,
          receivedQuantity: 4,
          availableQuantity: state.lotStatus === "released" ? 4 : 0,
          status: state.lotStatus,
          manufacturedAt: state.lotManufacturedAt,
          expiresAt: state.lotExpiresAt,
          createdAt: fixedNow,
          updatedAt: state.lotUpdatedAt,
        }],
      };
    case "coas":
      return {
        ...base,
        resource,
        items: [{
          id: localCoaId,
          lotId: localLotId,
          productId: localProductId,
          supplierLotCode: state.lotCode,
          evidenceHash: state.coaEvidenceHash,
          public: state.coaPublic,
          active: state.coaActive,
          issuedAt: state.coaIssuedAt,
          createdAt: fixedNow,
          rowVersion: "local-fixed-row",
        }],
      };
    case "analytical-claims":
      return {
        ...base,
        resource,
        items: [{
          id: localClaimId,
          productId: localProductId,
          productName: "Synthetic reference standard — local test only",
          lotId: localLotId,
          supplierLotCode: state.lotCode,
          coaDocumentId: localCoaId,
          evidenceHash: state.coaEvidenceHash,
          text: state.claimText,
          active: state.claimActive,
          createdAt: fixedNow,
          updatedAt: state.claimUpdatedAt,
        }],
      };
    case "attestations":
      return {
        ...base,
        resource,
        items: [{
          id: `local-attestation-${state.attestationVersion}`,
          version: state.attestationVersion,
          contentHash: "e".repeat(64),
          policyText: "Fixed local research-use attestation.",
          effectiveAt: fixedNow,
          supersededAt: null,
          createdAt: fixedNow,
        }],
      };
    case "destination-rules":
      return {
        ...base,
        resource,
        items: [{
          id: `local-destination-${state.destinationVersion}`,
          scopeKind: "product",
          productId: localProductId,
          policyGroupId: null,
          targetLabel: "Synthetic reference standard — local test only",
          stateCode: "CA",
          result: "allowed",
          version: state.destinationVersion,
          active: true,
          effectiveAt: fixedNow,
          supersededAt: null,
          createdAt: fixedNow,
        }],
      };
    case "promotions":
      return {
        ...base,
        resource,
        items: [{
          id: localPromotionId,
          code: state.promotionCode,
          version: state.promotionVersion,
          name: state.promotionName,
          kind: state.promotionKind,
          status: state.promotionStatus,
          amountMinor: state.promotionAmountMinor,
          basisPoints: state.promotionBasisPoints,
          currency: state.promotionCurrency,
          configuration: localPromotionConfiguration(),
          targets: state.promotionTargets.map(({ targetKind, targetId }) => ({
            kind: targetKind,
            id: targetId,
          })),
          startsAt: state.promotionStartsAt,
          endsAt: state.promotionEndsAt,
          createdAt: fixedNow,
          updatedAt: state.promotionUpdatedAt,
        }],
      };
    case "buyers":
      return {
        ...base,
        resource,
        items: fixedActors.flatMap((actor) => {
          const profile = state.profiles.get(actor.userId) ?? null;
          return profile
            ? [{
                userId: actor.userId,
                status: profile.status,
                emailVerifiedAt: actor.identity.emailVerifiedAt,
                ageConfirmedAt: profile.ageConfirmedAt,
                researchPurpose: profile.researchPurpose,
                organizationName: profile.organizationName,
                createdAt: fixedNow,
                updatedAt: profile.updatedAt,
              }]
            : [];
        }),
      };
    case "review-requests":
      return {
        ...base,
        resource,
        items: [{
          id: localReviewId,
          userId: fixedActors[1]!.userId,
          orderId: "local-order-blocked",
          snapshotHash: "d".repeat(64),
          buyerStatusSnapshot: "blocked",
          attestationVersionId: `local-attestation-${state.attestationVersion}`,
          attestationVersion: state.attestationVersion,
          destinationStateCode: "NV",
          buyerReviewRequired: true,
          destinationReviewRequired: false,
          outcome: state.reviewOutcome,
          decidedByUserId: state.reviewOutcome ? fixedActors[2]!.userId : null,
          decidedAt: state.reviewOutcome ? fixedNow : null,
          coversBuyerReview: state.reviewOutcome === null
            ? null
            : state.reviewOutcome === "approved",
          createdAt: fixedNow,
        }],
      };
    case "orders":
      return {
        ...base,
        resource,
        items: localOrders.map((order) => ({
          id: order.id,
          buyerUserId:
            order.id === localOrderId ? fixedActors[0]!.userId : fixedActors[1]!.userId,
          buyerStatusSnapshot: order.id === localOrderId ? "active" : "blocked",
          attestationAcceptanceId: "local-attestation-acceptance",
          attestationVersion: state.attestationVersion,
          destinationStateCode: order.destinationStateCode,
          currency: order.currency,
          subtotalMinor: order.totalMinor,
          discountMinor: 0,
          taxMinor: 0,
          shippingMinor: 0,
          totalMinor: order.totalMinor,
          state: order.state,
          itemCount: order.items.length,
          verifiedPaymentEventCount: 1,
          paymentState: "paid" as const,
          refundState: "none" as const,
          holdState: "none" as const,
          currentReleaseState: order.id === localOrderId ? "issued" : "consumed",
          releaseVersion: 1,
          shipmentState: order.shipmentState === "none" ? null : order.shipmentState,
          providerExecutionBoundary: "task6_managed" as const,
          createdAt: order.createdAt,
          updatedAt: order.createdAt,
        })),
      };
    case "refunds":
      return {
        ...base,
        resource,
        items: state.refund
          ? [{
              id: state.refund.id,
              orderId: localOrderId,
              requestedByUserId: fixedActors[2]!.userId,
              verifiedPaymentEventId: "local-verified-payment-event",
              provider: "local-test-provider",
              requestedAmountMinor: state.refund.amountMinor,
              confirmedAmountMinor: null,
              currency: "USD",
              status: "requested" as const,
              reasonRedacted: null,
              requestedAt: fixedNow,
              confirmedAt: null,
              providerRefundRecorded: false,
              providerExecutionBoundary: "task6_managed" as const,
            }]
          : [],
      };
    case "shipments":
      return {
        ...base,
        resource,
        items: state.shipment
          ? [{
              id: "local-shipment",
              orderId: localOrderId,
              fulfillmentReleaseId: null,
              releaseState: null,
              releaseVersion: null,
              releaseExpiresAt: null,
              carrier: state.shipment.carrier,
              trackingReference: state.shipment.trackingReference,
              state: "pending" as const,
              handedOffAt: null,
              deliveredAt: null,
              createdAt: fixedNow,
              updatedAt: state.shipment.updatedAt,
              handoffConfirmationBoundary: "task6_managed" as const,
            }]
          : [],
      };
    case "staff":
      return {
        ...base,
        resource,
        items: fixedActors.flatMap((actor) =>
          (state.capabilities.get(actor.userId) ?? []).map((capability) => ({
            roleId: `${actor.userId}:${capability}`,
            userId: actor.userId,
            capability,
            recognizedCapability: true,
            active: true,
            grantedByUserId: fixedActors[2]!.userId,
            grantedAt: fixedNow,
            revokedByUserId: null,
            revokedAt: null,
          })),
        ),
      };
    case "audit":
      return {
        ...base,
        resource,
        items: state.audits.map((event, index) => ({
          id: `local-audit-${index + 1}`,
          actorKind: "user" as const,
          actorUserId: event.actorUserId,
          action: event.action,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          correlationId: event.correlationId,
          occurredAt: fixedNow,
        })),
      };
    case "loyalty-policies":
      return {
        ...base,
        resource,
        items: Object.freeze([]),
      };
    case "referral-policies":
      return {
        ...base,
        resource,
        items: Object.freeze([]),
      };
    case "affiliate-policies":
      return {
        ...base,
        resource,
        items: Object.freeze([]),
      };
    case "reward-adjustments":
      return {
        ...base,
        resource,
        items: Object.freeze([]),
      };
    case "referral-codes":
      return {
        ...base,
        resource,
        items: Object.freeze([]),
      };
    case "referral-conversions":
      return {
        ...base,
        resource,
        items: Object.freeze([]),
      };
    case "shared-sets":
      return {
        ...base,
        resource,
        items: Object.freeze([]),
      };
    case "affiliate-applications":
      return {
        ...base,
        resource,
        items: Object.freeze([]),
      };
    case "commissions":
      return {
        ...base,
        resource,
        items: Object.freeze([]),
      };
    case "payouts":
      return {
        ...base,
        resource,
        items: Object.freeze([]),
      };
  }
}

const commerce = createLocalCommerceDriverV1({
  loadProfile(userId) {
    return state.profiles.get(userId) ?? null;
  },
  hasCurrentAttestation(userId) {
    return state.acceptances.has(`${userId}:${state.attestationVersion}`);
  },
  loadEmail(userId) {
    return fixedActors.find((actor) => actor.userId === userId)?.identity.primaryEmail ?? null;
  },
  reserveCheckoutRewards: createRewardsService({
    atomicPort: growth.rewardsAtomicPort,
  }).reserveCheckoutRewards,
}, () => {
  const secret = process.env.LOCAL_TEST_SECRET;
  return typeof secret === "string" && secret.length >= 32 ? secret : null;
});

const driver: LocalTestDriver = {
  actorOptions: fixedActors.map(({ key, label, description }) => ({
    key,
    label,
    description,
  })),
  signActor(actorKey, secret) {
    if (!fixedActors.some((actor) => actor.key === actorKey)) return null;
    return signLocalActor(actorKey, secret);
  },
  resolveIdentity(signedActor, secret) {
    if (!signedActor) return null;
    const key = verifyLocalActor(
      signedActor,
      secret,
      fixedActors.map((actor) => actor.key),
    );
    return fixedActors.find((actor) => actor.key === key)?.identity ?? null;
  },
  loadIdentityByClerkId(clerkUserId) {
    return actorByClerkId(clerkUserId)?.identity ?? null;
  },
  loadPrincipal(clerkUserId) {
    const actor = actorByClerkId(clerkUserId);
    if (!actor) return null;
    return {
      actorId: actor.userId,
      clerkUserId,
      buyerStatus: state.profiles.get(actor.userId)?.status ?? null,
      capabilities: Object.freeze([...(state.capabilities.get(actor.userId) ?? [])]),
      mfaSatisfied:
        actor.identity.mfaConfigured && actor.identity.secondFactorCompleted,
    };
  },
  accountRepository,
  adminRepository,
  storageVerifier: {
    mode: "test",
    verify: async (storageKey) => {
      const ingested = localIngestedCoaObjects.get(storageKey);
      if (ingested) return { exists: true, sha256: ingested };
      return {
        exists: storageKey === "local-private/coa-a.pdf",
        sha256:
          storageKey === "local-private/coa-a.pdf" ? "f".repeat(64) : null,
      };
    },
  },
  storageWriter: {
    mode: "test",
    write: async ({ storageKey, body }) => {
      localIngestedCoaObjects.set(
        storageKey,
        createHash("sha256").update(body).digest("hex"),
      );
    },
  },
  loadAccount(userId) {
    const profile = state.profiles.get(userId) ?? null;
    if (!profile) return null;
    return {
      ...profile,
      acceptedAttestationVersion: state.acceptances.has(
        `${userId}:${state.attestationVersion}`,
      )
        ? state.attestationVersion
        : null,
      currentAttestationVersion: state.attestationVersion,
    } satisfies AccountSummary;
  },
  loadCurrentAttestation() {
    return {
      version: state.attestationVersion,
      policyText:
        "Fixed local test attestation: requested materials are for legitimate laboratory research only and are not for human or veterinary use.",
    };
  },
  listOrders(userId) {
    const orderId = ownerOrderId(userId);
    const historical = orderId
      ? localOrders
          .filter((order) => order.id === orderId)
          .map((order) => ({
            id: order.id,
            state: order.state,
            currency: order.currency,
            totalMinor: order.totalMinor,
            paymentState: order.paymentState,
            refundState: order.refundState,
            holdState: order.holdState,
            releaseState: order.releaseState,
            shipmentState: order.shipmentState,
            createdAt: order.createdAt,
          }))
      : [];
    return Object.freeze([...commerce.listOrders(userId), ...historical]);
  },
  loadOrder(userId, orderId) {
    return commerce.loadOrder(userId, orderId) ?? (ownerOrderId(userId) === orderId
      ? (localOrders.find((order) => order.id === orderId) ?? null)
      : null);
  },
  loadAdminSnapshot() {
    return {
      buyers: fixedActors.map((actor) => ({
        userId: actor.userId,
        label: actor.label,
        status: state.profiles.get(actor.userId)?.status ?? null,
      })),
      audits: state.audits.map((event) => ({
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        correlationId: event.correlationId,
      })),
      orders: localOrders.map(({ id, state: orderState, currency, totalMinor }) => ({
        id,
        state: orderState,
        currency,
        totalMinor,
      })),
      commandDefaults: {
        policyGroupId: localPolicyGroupId,
        policyGroupUpdatedAt: state.policyGroupUpdatedAt,
        productId: localProductId,
        productUpdatedAt: state.productUpdatedAt,
        lotId: localLotId,
        lotUpdatedAt: state.lotUpdatedAt,
        promotionId: localPromotionId,
        promotionUpdatedAt: state.promotionUpdatedAt,
        coaDocumentId: localCoaId,
        coaStorageKey: state.coaStorageKey,
        coaEvidenceHash: state.coaEvidenceHash,
        claimId: localClaimId,
        claimUpdatedAt: state.claimUpdatedAt,
        buyerUserId: fixedActors[1]!.userId,
        buyerUpdatedAt:
          state.profiles.get(fixedActors[1]!.userId)?.updatedAt ?? fixedNow,
        reviewRequestId: localReviewId,
        orderId: localOrderId,
        shipmentUpdatedAt: state.shipment?.updatedAt ?? "",
        staffUserId: fixedActors[3]!.userId,
      },
    };
  },
  readAdminSnapshot<Resource extends AdminReadResource>(resource: Resource) {
    if (resource === "orders" || resource === "refunds" || resource === "shipments") {
      const base = localAdminReadSnapshot(resource);
      return {
        ...base,
        items: commerce.adminSnapshotItems(resource),
      } as AdminReadSnapshotFor<Resource>;
    }
    return localAdminReadSnapshot(resource) as AdminReadSnapshotFor<Resource>;
  },
  commerce,
  growth,
};

export function getLocalTestDriver(): LocalTestDriver {
  return driver;
}
