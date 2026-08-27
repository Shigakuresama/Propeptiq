import { describe, expect, it } from "vitest";

import type { VerifiedIdentity } from "@/auth/identity";

import {
  completeBuyerAccount,
  type AccountRepository,
  type AccountTransaction,
  type BuyerProfileRecord,
} from "./account-service";

const now = new Date("2026-08-25T12:00:00.000Z");
const verifiedIdentity: VerifiedIdentity = {
  clerkUserId: "clerk-customer",
  primaryEmail: "customer@example.test",
  emailVerifiedAt: now.toISOString(),
  mfaConfigured: false,
  secondFactorCompleted: false,
};

type TestState = {
  userId: string | null;
  profile: BuyerProfileRecord | null;
  acceptances: string[];
  audits: {
    actorUserId: string;
    action: string;
    resourceId: string;
    correlationId: string;
    metadata: unknown;
  }[];
};

function cloneState(state: TestState): TestState {
  return structuredClone(state);
}

function createRepository(options: {
  profile?: BuyerProfileRecord | null;
  attestations?: readonly { id: string; version: number }[];
  failAudit?: boolean;
} = {}): { repository: AccountRepository; state: TestState } {
  const state: TestState = {
    userId: options.profile?.userId ?? null,
    profile: options.profile ?? null,
    acceptances: [],
    audits: [],
  };
  const attestations = options.attestations ?? [{ id: "attestation-1", version: 1 }];

  const transaction: AccountTransaction = {
    async upsertIdentity() {
      state.userId = state.userId ?? "user-1";
      return { userId: state.userId };
    },
    async getBuyerProfile() {
      return state.profile;
    },
    async findCurrentAttestations() {
      return attestations;
    },
    async hasAttestationAcceptance(_userId, attestationId) {
      return state.acceptances.includes(attestationId);
    },
    async acceptAttestation(_userId, attestationId) {
      if (!state.acceptances.includes(attestationId)) {
        state.acceptances.push(attestationId);
      }
    },
    async saveBuyerProfile(profile) {
      state.profile = profile;
      return profile;
    },
    async appendAudit(event) {
      if (options.failAudit) throw new Error("synthetic audit failure");
      state.audits.push(event);
    },
  };

  return {
    state,
    repository: {
      async transaction(work) {
        const before = cloneState(state);
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

const completeInput = {
  ageConfirmed21Plus: true,
  researchPurpose: "analytical" as const,
  organizationName: "Independent laboratory",
  acceptCurrentAttestation: true,
};

describe("completeBuyerAccount", () => {
  it("atomically activates a new verified buyer against the one authoritative attestation", async () => {
    const { repository, state } = createRepository();
    const result = await completeBuyerAccount(repository, {
      identity: verifiedIdentity,
      input: completeInput,
      now,
      correlationId: "account-onboarding-1",
    });

    expect(result.status).toBe("active");
    expect(state.profile).toMatchObject({
      userId: "user-1",
      status: "active",
      researchPurpose: "analytical",
      organizationName: "Independent laboratory",
    });
    expect(state.acceptances).toEqual(["attestation-1"]);
    expect(state.audits).toEqual([
      {
        actorUserId: "user-1",
        action: "account.onboarding.completed",
        resourceId: "user-1",
        correlationId: "account-onboarding-1",
        metadata: { attestationVersion: 1, status: "active" },
      },
    ]);
  });

  it.each([
    ["email", { identity: { ...verifiedIdentity, emailVerifiedAt: null }, input: completeInput }],
    ["age", { identity: verifiedIdentity, input: { ...completeInput, ageConfirmed21Plus: false } }],
    ["purpose", { identity: verifiedIdentity, input: { ...completeInput, researchPurpose: null } }],
    ["acceptance", { identity: verifiedIdentity, input: { ...completeInput, acceptCurrentAttestation: false } }],
  ] as const)("keeps a new buyer profile-less when %s is missing", async (_fact, request) => {
    const { repository, state } = createRepository();
    await expect(
      completeBuyerAccount(repository, {
        ...request,
        now,
        correlationId: "account-incomplete",
      }),
    ).rejects.toThrow(/account facts|attestation acceptance/i);
    expect(state).toEqual({ userId: null, profile: null, acceptances: [], audits: [] });
  });

  it.each([
    ["blank primary email", { ...verifiedIdentity, primaryEmail: "   " }],
    ["malformed primary email", { ...verifiedIdentity, primaryEmail: "not-an-email" }],
    ["invalid verification timestamp", { ...verifiedIdentity, emailVerifiedAt: "not-a-date" }],
    [
      "future verification timestamp",
      { ...verifiedIdentity, emailVerifiedAt: "2026-08-26T12:00:00.000Z" },
    ],
  ] as const)("rejects a %s before opening a transaction", async (_label, identity) => {
    const { repository, state } = createRepository();
    await expect(
      completeBuyerAccount(repository, {
        identity,
        input: completeInput,
        now,
        correlationId: "account-invalid-identity",
      }),
    ).rejects.toThrow(/account facts/i);
    expect(state).toEqual({ userId: null, profile: null, acceptances: [], audits: [] });
  });

  it.each([
    [[]],
    [[{ id: "attestation-1", version: 1 }, { id: "attestation-2", version: 2 }]],
  ] as const)(
    "fails closed and rolls back for %j current attestations",
    async (attestations) => {
      const { repository, state } = createRepository({ attestations });
      await expect(
        completeBuyerAccount(repository, {
          identity: verifiedIdentity,
          input: completeInput,
          now,
          correlationId: "account-attestation-ambiguous",
        }),
      ).rejects.toThrow(/exactly one current attestation/i);
      expect(state).toEqual({ userId: null, profile: null, acceptances: [], audits: [] });
    },
  );

  it("preserves an existing review status while updating account facts", async () => {
      const status = "review" as const;
      const profile: BuyerProfileRecord = {
        userId: "user-1",
        status,
        ageConfirmedAt: now.toISOString(),
        researchPurpose: "in_vitro",
        organizationName: null,
        updatedAt: "2026-08-24T12:00:00.000Z",
      };
      const { repository, state } = createRepository({ profile });
      const result = await completeBuyerAccount(repository, {
        identity: verifiedIdentity,
        input: completeInput,
        now,
        correlationId: `account-preserve-${status}`,
      });

      expect(result.status).toBe(status);
      expect(state.profile?.status).toBe(status);
  });

  it("rejects a blocked account update transaction without changing the profile", async () => {
    const profile: BuyerProfileRecord = {
      userId: "user-1",
      status: "blocked",
      ageConfirmedAt: now.toISOString(),
      researchPurpose: "in_vitro",
      organizationName: null,
      updatedAt: "2026-08-24T12:00:00.000Z",
    };
    const { repository, state } = createRepository({ profile });
    await expect(
      completeBuyerAccount(repository, {
        identity: verifiedIdentity,
        input: completeInput,
        now,
        correlationId: "account-blocked-read-only",
      }),
    ).rejects.toThrow(/blocked accounts are read-only/i);
    expect(state.profile).toEqual(profile);
    expect(state.audits).toEqual([]);
  });

  it("rejects an active profile edit when the newly current attestation is unaccepted", async () => {
    const profile: BuyerProfileRecord = {
      userId: "user-1",
      status: "active",
      ageConfirmedAt: now.toISOString(),
      researchPurpose: "analytical",
      organizationName: "Original laboratory",
      updatedAt: "2026-08-24T12:00:00.000Z",
    };
    const { repository, state } = createRepository({ profile });
    await expect(
      completeBuyerAccount(repository, {
        identity: verifiedIdentity,
        input: {
          ...completeInput,
          organizationName: "Changed laboratory",
          acceptCurrentAttestation: false,
        },
        now,
        correlationId: "account-current-attestation-required",
      }),
    ).rejects.toThrow(/current attestation acceptance is required/i);
    expect(state.profile).toEqual(profile);
    expect(state.audits).toEqual([]);
  });

  it("rolls back identity, acceptance, and profile when audit append fails", async () => {
    const { repository, state } = createRepository({ failAudit: true });
    await expect(
      completeBuyerAccount(repository, {
        identity: verifiedIdentity,
        input: completeInput,
        now,
        correlationId: "account-audit-failure",
      }),
    ).rejects.toThrow(/audit failure/);
    expect(state).toEqual({ userId: null, profile: null, acceptances: [], audits: [] });
  });
});
