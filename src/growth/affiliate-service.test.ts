import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { VerifiedIdentity } from "@/auth/identity";
import type { Principal } from "@/domain/authorization";

import {
  AffiliateAdminError,
  AffiliateApplicationError,
  createAffiliateAdminService,
  createAffiliateService,
  type AffiliateAdminMutationTransaction,
  type AffiliateApplicationTransaction,
} from "./affiliate-service";

const now = new Date("2026-08-28T19:00:00.000Z");
const buyerUserId = "6a000000-0000-4000-8000-000000000001";
const termsVersionId = "6a000000-0000-4000-8000-000000000002";
const acceptanceId = "6a000000-0000-4000-8000-000000000003";
const profileId = "6a000000-0000-4000-8000-000000000004";
const publicCode = "aff_6AStableOpaquePartnerCode";
const termsText = "Synthetic affiliate terms version one for service tests.";
const termsContentHash = createHash("sha256").update(termsText).digest("hex");

const verifiedIdentity: VerifiedIdentity = Object.freeze({
  clerkUserId: "clerk_task_6a_buyer",
  primaryEmail: "partner@example.test",
  emailVerifiedAt: "2026-08-28T18:59:00.000Z",
  mfaConfigured: false,
  secondFactorCompleted: false,
});

type ApplicationState = {
  currentTerms: Array<Readonly<{
    id: string;
    contentHash: string;
    termsText: string;
    effectiveAt: string;
    supersededAt: string | null;
  }>>;
  acceptances: Array<Readonly<{
    id: string;
    buyerUserId: string;
    termsVersionId: string;
    contentHash: string;
    acceptedAt: string;
  }>>;
  profiles: Array<Readonly<{
    id: string;
    buyerUserId: string;
    publicCode: string;
    status: "pending";
    version: number;
    publicChannel: string;
    promotionMethod: "website" | "social" | "email" | "other";
    termsAcceptanceId: string;
    createdAt: string;
  }>>;
};

function transactionHarness(
  overrides: Partial<ApplicationState> = {},
): Readonly<{
  state: ApplicationState;
  applyInTransaction: AffiliateApplicationTransaction;
}> {
  const state: ApplicationState = {
    currentTerms: [{
      id: termsVersionId,
      contentHash: termsContentHash,
      termsText,
      effectiveAt: "2026-08-28T00:00:00.000Z",
      supersededAt: null,
    }],
    acceptances: [],
    profiles: [],
    ...overrides,
  };

  const applyInTransaction: AffiliateApplicationTransaction = async (input) => {
    const beforeAcceptances = [...state.acceptances];
    const beforeProfiles = [...state.profiles];
    try {
      const acceptedAt = input.acceptedAt.toISOString();
      const current = state.currentTerms.filter(
        (terms) =>
          terms.effectiveAt <= acceptedAt &&
          (terms.supersededAt === null || terms.supersededAt > acceptedAt),
      );
      if (current.length !== 1) {
        throw new AffiliateApplicationError("terms_unavailable");
      }
      const selected = current[0]!;
      const computedHash = createHash("sha256")
        .update(selected.termsText)
        .digest("hex");
      if (
        selected.id !== input.termsVersionId ||
        selected.contentHash !== computedHash ||
        input.termsContentHash !== computedHash
      ) {
        throw new AffiliateApplicationError("terms_mismatch");
      }

      const priorAcceptance = state.acceptances.find(
        (acceptance) => acceptance.buyerUserId === input.buyerUserId,
      );
      if (!priorAcceptance) {
        state.acceptances.push(Object.freeze({
          id: input.acceptanceId,
          buyerUserId: input.buyerUserId,
          termsVersionId: input.termsVersionId,
          contentHash: computedHash,
          acceptedAt,
        }));
      } else if (
        priorAcceptance.id !== input.acceptanceId ||
        priorAcceptance.termsVersionId !== input.termsVersionId ||
        priorAcceptance.contentHash !== computedHash ||
        priorAcceptance.acceptedAt !== acceptedAt
      ) {
        throw new AffiliateApplicationError("idempotency_conflict");
      }

      const priorProfile = state.profiles.find(
        (profile) => profile.buyerUserId === input.buyerUserId,
      );
      if (priorProfile) {
        if (
          priorProfile.id !== input.profileId ||
          priorProfile.publicCode !== input.publicCode ||
          priorProfile.publicChannel !== input.publicChannel ||
          priorProfile.promotionMethod !== input.promotionMethod ||
          priorProfile.termsAcceptanceId !== input.acceptanceId ||
          priorProfile.createdAt !== acceptedAt
        ) {
          throw new AffiliateApplicationError("idempotency_conflict");
        }
        return Object.freeze({
          status: "idempotent" as const,
          profile: priorProfile,
        });
      }

      const profile = Object.freeze({
        id: input.profileId,
        buyerUserId: input.buyerUserId,
        publicCode: input.publicCode,
        status: "pending" as const,
        version: 1,
        publicChannel: input.publicChannel,
        promotionMethod: input.promotionMethod,
        termsAcceptanceId: input.acceptanceId,
        createdAt: acceptedAt,
      });
      state.profiles.push(profile);
      return Object.freeze({ status: "applied" as const, profile });
    } catch (error) {
      state.acceptances = beforeAcceptances;
      state.profiles = beforeProfiles;
      throw error;
    }
  };

  return Object.freeze({ state, applyInTransaction });
}

function createService(harness = transactionHarness()) {
  return createAffiliateService({
    clock: () => new Date(now),
    createAcceptanceId: () => acceptanceId,
    createProfileId: () => profileId,
    createPublicCode: () => publicCode,
    publicationPolicy: Object.freeze({
      version: "task-6a-content-policy-v1",
      activeLotEvidenceIds: Object.freeze([]),
    }),
    applyInTransaction: harness.applyInTransaction,
  });
}

function applicationInput(
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return Object.freeze({
    buyerUserId,
    buyerStatus: "active" as const,
    identity: verifiedIdentity,
    publicChannel: "https://partner.example/research",
    promotionMethod: "website" as const,
    termsVersionId,
    termsContentHash,
    ...overrides,
  });
}

describe("affiliate application service", () => {
  it("submits one pending application for an active buyer with a verified primary email and exact current terms", async () => {
    const harness = transactionHarness();

    const result = await createService(harness).applyForAffiliate(
      applicationInput(),
    );

    expect(result).toEqual({
      status: "submitted",
      application: {
        publicCode,
        status: "pending",
        version: 1,
        publicChannel: "https://partner.example/research",
        promotionMethod: "website",
        createdAt: now.toISOString(),
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.application)).toBe(true);
    expect(harness.state.acceptances).toEqual([{
      id: acceptanceId,
      buyerUserId,
      termsVersionId,
      contentHash: termsContentHash,
      acceptedAt: now.toISOString(),
    }]);
    expect(harness.state.profiles).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(verifiedIdentity.primaryEmail!);
    expect(JSON.stringify(result)).not.toContain(verifiedIdentity.clerkUserId);
  });

  it("returns an immutable idempotent replay and rejects changed replay content without partial writes", async () => {
    const harness = transactionHarness();
    const service = createService(harness);

    const first = await service.applyForAffiliate(applicationInput());
    const replay = await service.applyForAffiliate(applicationInput());

    expect(first.status).toBe("submitted");
    expect(replay).toEqual({ ...first, status: "idempotent" });
    expect(Object.isFrozen(replay)).toBe(true);
    expect(Object.isFrozen(replay.application)).toBe(true);
    expect(harness.state.acceptances).toHaveLength(1);
    expect(harness.state.profiles).toHaveLength(1);

    await expect(
      service.applyForAffiliate(applicationInput({ publicChannel: "@changed_partner" })),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
    expect(harness.state.acceptances).toHaveLength(1);
    expect(harness.state.profiles).toHaveLength(1);
    expect(harness.state.profiles[0]?.publicChannel).toBe(
      "https://partner.example/research",
    );
  });

  it("accepts the stored immutable replay when fresh candidate IDs and code differ", async () => {
    let attempt = 0;
    const storedProfile = Object.freeze({
      id: profileId,
      buyerUserId,
      publicCode,
      status: "pending" as const,
      version: 1,
      publicChannel: "https://partner.example/research",
      promotionMethod: "website" as const,
      termsAcceptanceId: acceptanceId,
      createdAt: now.toISOString(),
    });
    const applyInTransaction: AffiliateApplicationTransaction = async () =>
      Object.freeze({
        status: attempt === 1 ? "applied" as const : "idempotent" as const,
        profile: storedProfile,
      });
    const service = createAffiliateService({
      clock: () => new Date(now),
      createAcceptanceId: () => attempt === 0
        ? acceptanceId
        : "6a000000-0000-4000-8000-000000000013",
      createProfileId: () => attempt === 0
        ? profileId
        : "6a000000-0000-4000-8000-000000000014",
      createPublicCode: () => {
        attempt += 1;
        return attempt === 1 ? publicCode : "aff_6AFreshReplayCandidate";
      },
      publicationPolicy: { version: "policy-v1", activeLotEvidenceIds: [] },
      applyInTransaction,
    });

    await expect(service.applyForAffiliate(applicationInput())).resolves.toMatchObject({
      status: "submitted",
      application: { publicCode },
    });
    await expect(service.applyForAffiliate(applicationInput())).resolves.toMatchObject({
      status: "idempotent",
      application: { publicCode },
    });
  });

  it.each(["review", "blocked"] as const)(
    "rejects a %s buyer before starting the application transaction",
    async (buyerStatus) => {
      const applyInTransaction = vi.fn<AffiliateApplicationTransaction>();
      const service = createAffiliateService({
        clock: () => new Date(now),
        createAcceptanceId: () => acceptanceId,
        createProfileId: () => profileId,
        createPublicCode: () => publicCode,
        publicationPolicy: { version: "policy-v1", activeLotEvidenceIds: [] },
        applyInTransaction,
      });

      await expect(
        service.applyForAffiliate(applicationInput({ buyerStatus })),
      ).rejects.toMatchObject({ code: "buyer_inactive" });
      expect(applyInTransaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["missing email", { primaryEmail: null }],
    ["invalid email", { primaryEmail: "not-an-email" }],
    ["missing verification", { emailVerifiedAt: null }],
    ["future verification", { emailVerifiedAt: "2026-08-28T19:00:01.000Z" }],
  ] as const)("rejects a verified-identity projection with %s", async (_label, identityPatch) => {
    const applyInTransaction = vi.fn<AffiliateApplicationTransaction>();
    const service = createAffiliateService({
      clock: () => new Date(now),
      createAcceptanceId: () => acceptanceId,
      createProfileId: () => profileId,
      createPublicCode: () => publicCode,
      publicationPolicy: { version: "policy-v1", activeLotEvidenceIds: [] },
      applyInTransaction,
    });

    await expect(
      service.applyForAffiliate(applicationInput({
        identity: Object.freeze({ ...verifiedIdentity, ...identityPatch }),
      })),
    ).rejects.toMatchObject({ code: "identity_unverified" });
    expect(applyInTransaction).not.toHaveBeenCalled();
  });

  it("rejects a missing identity projection with a structured error before persistence", async () => {
    const applyInTransaction = vi.fn<AffiliateApplicationTransaction>();
    const service = createAffiliateService({
      clock: () => new Date(now),
      createAcceptanceId: () => acceptanceId,
      createProfileId: () => profileId,
      createPublicCode: () => publicCode,
      publicationPolicy: { version: "policy-v1", activeLotEvidenceIds: [] },
      applyInTransaction,
    });

    await expect(
      service.applyForAffiliate(applicationInput({ identity: null })),
    ).rejects.toMatchObject({ code: "identity_unverified" });
    expect(applyInTransaction).not.toHaveBeenCalled();
  });

  it.each(["website", "social", "email", "other"] as const)(
    "accepts the closed %s promotion method",
    async (promotionMethod) => {
      await expect(
        createService().applyForAffiliate(applicationInput({ promotionMethod })),
      ).resolves.toMatchObject({
        status: "submitted",
        application: { promotionMethod },
      });
    },
  );

  it.each([
    ["unknown promotion method", { promotionMethod: "podcast" }, "invalid_promotion_method"],
    ["blank channel", { publicChannel: "   " }, "invalid_channel"],
    ["non-public URL", { publicChannel: "http://partner.example/research" }, "invalid_channel"],
    ["URL credentials", { publicChannel: "https://user:pass@partner.example" }, "invalid_channel"],
    ["unbounded channel", { publicChannel: `https://partner.example/${"a".repeat(500)}` }, "invalid_channel"],
    ["malformed terms id", { termsVersionId: "terms-v1" }, "invalid_input"],
    ["malformed terms hash", { termsContentHash: "browser-hash" }, "invalid_input"],
  ] as const)("rejects %s before persistence", async (_label, patch, code) => {
    const applyInTransaction = vi.fn<AffiliateApplicationTransaction>();
    const service = createAffiliateService({
      clock: () => new Date(now),
      createAcceptanceId: () => acceptanceId,
      createProfileId: () => profileId,
      createPublicCode: () => publicCode,
      publicationPolicy: { version: "policy-v1", activeLotEvidenceIds: [] },
      applyInTransaction,
    });

    await expect(
      service.applyForAffiliate(applicationInput(patch)),
    ).rejects.toMatchObject({ code });
    expect(applyInTransaction).not.toHaveBeenCalled();
  });

  it.each([
    "@research_partner",
    "https://partner.example/research",
  ])("accepts the bounded canonical public channel %s", async (publicChannel) => {
    await expect(
      createService().applyForAffiliate(applicationInput({ publicChannel })),
    ).resolves.toMatchObject({ application: { publicChannel } });
  });

  it.each([
    "Treatment protocol partner",
    "Guaranteed 99.9% pure research",
  ])("rejects prohibited or unsupported public channel content before storage", async (publicChannel) => {
    const applyInTransaction = vi.fn<AffiliateApplicationTransaction>();
    const service = createAffiliateService({
      clock: () => new Date(now),
      createAcceptanceId: () => acceptanceId,
      createProfileId: () => profileId,
      createPublicCode: () => publicCode,
      publicationPolicy: { version: "policy-v1", activeLotEvidenceIds: [] },
      applyInTransaction,
    });

    await expect(
      service.applyForAffiliate(applicationInput({ publicChannel })),
    ).rejects.toMatchObject({ code: "content_rejected" });
    expect(applyInTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ["missing current terms", []],
    ["overlapping current terms", [
      {
        id: termsVersionId,
        contentHash: termsContentHash,
        termsText,
        effectiveAt: "2026-08-28T00:00:00.000Z",
        supersededAt: null,
      },
      {
        id: "6a000000-0000-4000-8000-000000000005",
        contentHash: createHash("sha256").update("Overlapping terms").digest("hex"),
        termsText: "Overlapping terms",
        effectiveAt: "2026-08-28T01:00:00.000Z",
        supersededAt: null,
      },
    ]],
  ] as const)("rolls back all writes for %s", async (_label, currentTerms) => {
    const harness = transactionHarness({ currentTerms: [...currentTerms] });

    await expect(
      createService(harness).applyForAffiliate(applicationInput()),
    ).rejects.toMatchObject({ code: "terms_unavailable" });
    expect(harness.state.acceptances).toEqual([]);
    expect(harness.state.profiles).toEqual([]);
  });

  it.each([
    ["stale browser terms id", { termsVersionId: "6a000000-0000-4000-8000-000000000099" }],
    ["browser hash mismatch", { termsContentHash: "a".repeat(64) }],
  ] as const)("rolls back all writes for %s", async (_label, patch) => {
    const harness = transactionHarness();

    await expect(
      createService(harness).applyForAffiliate(applicationInput(patch)),
    ).rejects.toMatchObject({ code: "terms_mismatch" });
    expect(harness.state.acceptances).toEqual([]);
    expect(harness.state.profiles).toEqual([]);
  });
});

type AdminHarnessState = {
  profile: {
    id: string;
    status: "pending" | "active" | "rejected" | "suspended";
    version: number;
    updatedAt: string;
  };
  audits: Array<Readonly<{
    actorUserId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    correlationId: string;
    metadata: Readonly<Record<string, unknown>>;
    occurredAt: string;
  }>>;
  failAudit: boolean;
};

function adminHarness(
  overrides: Partial<AdminHarnessState> = {},
): Readonly<{
  state: AdminHarnessState;
  mutateInTransaction: AffiliateAdminMutationTransaction;
}> {
  const state: AdminHarnessState = {
    profile: {
      id: profileId,
      status: "pending",
      version: 1,
      updatedAt: "2026-08-28T18:30:00.000Z",
    },
    audits: [],
    failAudit: false,
    ...overrides,
  };
  const mutateInTransaction: AffiliateAdminMutationTransaction = async (input) => {
    const beforeProfile = { ...state.profile };
    const beforeAudits = [...state.audits];
    try {
      if (
        state.profile.id !== input.profileId ||
        state.profile.version !== input.expectedVersion
      ) {
        throw new AffiliateAdminError("version_conflict");
      }
      const allowed =
        (state.profile.status === "pending" &&
          (input.targetStatus === "active" || input.targetStatus === "rejected")) ||
        (state.profile.status === "active" && input.targetStatus === "suspended");
      if (!allowed) throw new AffiliateAdminError("invalid_transition");
      const fromStatus = state.profile.status;
      const fromVersion = state.profile.version;
      const updatedProfile = {
        ...state.profile,
        status: input.targetStatus,
        version: fromVersion + 1,
        updatedAt: input.mutatedAt.toISOString(),
      };
      state.profile = updatedProfile;
      if (state.failAudit) throw new AffiliateAdminError("audit_conflict");
      state.audits.push(Object.freeze({
        actorUserId: input.actorUserId,
        action: input.targetStatus === "suspended"
          ? "affiliate.suspended"
          : `affiliate.application.${input.targetStatus}`,
        resourceType: "affiliate_profile",
        resourceId: input.profileId,
        correlationId: input.correlationId,
        metadata: Object.freeze({
          fromStatus,
          toStatus: input.targetStatus,
          fromVersion,
          toVersion: state.profile.version,
        }),
        occurredAt: input.mutatedAt.toISOString(),
      }));
      return Object.freeze({ profile: Object.freeze(updatedProfile) });
    } catch (error) {
      state.profile = beforeProfile;
      state.audits = beforeAudits;
      throw error;
    }
  };
  return Object.freeze({ state, mutateInTransaction });
}

const capableAdmin: Principal = Object.freeze({
  actorId: "6a000000-0000-4000-8000-000000000099",
  clerkUserId: "clerk_task_6a_admin",
  buyerStatus: null,
  capabilities: Object.freeze(["growth:manage"] as const),
  mfaSatisfied: true,
});

function createAdminService(harness = adminHarness()) {
  return createAffiliateAdminService({
    clock: () => new Date(now),
    mutateInTransaction: harness.mutateInTransaction,
  });
}

describe("affiliate admin review service", () => {
  it.each(["active", "rejected"] as const)(
    "allows one growth-manage MFA administrator to decide pending to %s with exactly one redacted audit",
    async (decision) => {
      const harness = adminHarness();

      const result = await createAdminService(harness).decideApplication({
        principal: capableAdmin,
        profileId,
        expectedVersion: 1,
        decision,
        correlationId: `task-6a-decision-${decision}`,
      });

      expect(result).toEqual({
        status: decision,
        version: 2,
        updatedAt: now.toISOString(),
      });
      expect(Object.isFrozen(result)).toBe(true);
      expect(harness.state.audits).toHaveLength(1);
      expect(harness.state.audits[0]).toMatchObject({
        actorUserId: capableAdmin.actorId,
        action: `affiliate.application.${decision}`,
        resourceType: "affiliate_profile",
        resourceId: profileId,
        correlationId: `task-6a-decision-${decision}`,
        metadata: {
          fromStatus: "pending",
          toStatus: decision,
          fromVersion: 1,
          toVersion: 2,
        },
      });
      const serializedAudit = JSON.stringify(harness.state.audits[0]);
      expect(serializedAudit).not.toContain("partner@example.test");
      expect(serializedAudit).not.toContain("partner.example");
      expect(serializedAudit).not.toContain("clerk_task_6a_admin");
      expect(capableAdmin.capabilities).not.toContain("affiliate:payout");
    },
  );

  it("allows active to suspended with expected-version CAS and one audit", async () => {
    const harness = adminHarness({
      profile: {
        id: profileId,
        status: "active",
        version: 2,
        updatedAt: "2026-08-28T18:45:00.000Z",
      },
    });

    await expect(createAdminService(harness).suspendAffiliate({
      principal: capableAdmin,
      profileId,
      expectedVersion: 2,
      correlationId: "task-6a-suspend-0001",
    })).resolves.toEqual({
      status: "suspended",
      version: 3,
      updatedAt: now.toISOString(),
    });
    expect(harness.state.audits).toHaveLength(1);
    expect(harness.state.audits[0]).toMatchObject({
      action: "affiliate.suspended",
      metadata: {
        fromStatus: "active",
        toStatus: "suspended",
        fromVersion: 2,
        toVersion: 3,
      },
    });
  });

  it.each([
    ["non-admin", { ...capableAdmin, capabilities: [] }, "authorization_denied"],
    ["wrong capability", { ...capableAdmin, capabilities: ["affiliate:payout"] }, "authorization_denied"],
    ["missing MFA", { ...capableAdmin, mfaSatisfied: false }, "authorization_denied"],
  ] as const)("denies %s before mutation", async (_label, principal, code) => {
    const mutateInTransaction = vi.fn<AffiliateAdminMutationTransaction>();
    const service = createAffiliateAdminService({
      clock: () => new Date(now),
      mutateInTransaction,
    });

    await expect(service.decideApplication({
      principal: principal as Principal,
      profileId,
      expectedVersion: 1,
      decision: "active",
      correlationId: "task-6a-denied-0001",
    })).rejects.toMatchObject({ code });
    expect(mutateInTransaction).not.toHaveBeenCalled();
  });

  it("fails stale and replayed decisions deterministically without a second audit", async () => {
    const harness = adminHarness();
    const service = createAdminService(harness);

    await service.decideApplication({
      principal: capableAdmin,
      profileId,
      expectedVersion: 1,
      decision: "active",
      correlationId: "task-6a-decision-0001",
    });
    await expect(service.decideApplication({
      principal: capableAdmin,
      profileId,
      expectedVersion: 1,
      decision: "active",
      correlationId: "task-6a-decision-replay",
    })).rejects.toMatchObject({ code: "version_conflict" });
    await expect(service.decideApplication({
      principal: capableAdmin,
      profileId,
      expectedVersion: 2,
      decision: "rejected",
      correlationId: "task-6a-invalid-transition",
    })).rejects.toMatchObject({ code: "invalid_transition" });
    expect(harness.state.profile).toMatchObject({ status: "active", version: 2 });
    expect(harness.state.audits).toHaveLength(1);
  });

  it.each([
    ["pending suspension", "pending", "suspendAffiliate"],
    ["rejected decision", "rejected", "decideApplication"],
    ["suspended decision", "suspended", "decideApplication"],
  ] as const)("rejects invalid %s without mutation or audit", async (_label, status, method) => {
    const harness = adminHarness({
      profile: {
        id: profileId,
        status,
        version: 4,
        updatedAt: "2026-08-28T18:45:00.000Z",
      },
    });
    const service = createAdminService(harness);
    const operation = method === "suspendAffiliate"
      ? service.suspendAffiliate({
          principal: capableAdmin,
          profileId,
          expectedVersion: 4,
          correlationId: "task-6a-invalid-suspend",
        })
      : service.decideApplication({
          principal: capableAdmin,
          profileId,
          expectedVersion: 4,
          decision: "active",
          correlationId: "task-6a-invalid-decision",
        });

    await expect(operation).rejects.toMatchObject({ code: "invalid_transition" });
    expect(harness.state.profile).toMatchObject({ status, version: 4 });
    expect(harness.state.audits).toEqual([]);
  });

  it("rolls back the status/version update when the audit write fails", async () => {
    const harness = adminHarness({ failAudit: true });

    await expect(createAdminService(harness).decideApplication({
      principal: capableAdmin,
      profileId,
      expectedVersion: 1,
      decision: "active",
      correlationId: "task-6a-audit-failure",
    })).rejects.toMatchObject({ code: "audit_conflict" });
    expect(harness.state.profile).toMatchObject({ status: "pending", version: 1 });
    expect(harness.state.audits).toEqual([]);
  });
});
