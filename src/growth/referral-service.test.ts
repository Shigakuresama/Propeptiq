import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { VerifiedIdentity } from "@/auth/identity";
import type { ReferralPolicy } from "@/domain/referrals";

import {
  ReferralEnrollmentError,
  createReferralCheckoutService,
  createReferralService,
  type ReferralEnrollmentTransaction,
} from "./referral-service";

const now = new Date("2026-08-28T18:00:00.000Z");
const buyerUserId = "51000000-0000-4000-8000-000000000001";
const termsVersionId = "51000000-0000-4000-8000-000000000002";
const acceptanceId = "51000000-0000-4000-8000-000000000003";
const referralCodeId = "51000000-0000-4000-8000-000000000004";
const termsText = "Synthetic customer rewards and referral terms version one.";
const termsContentHash = createHash("sha256").update(termsText).digest("hex");
const referralCode = "ref_5BStableOpaqueCode";

const verifiedIdentity: VerifiedIdentity = Object.freeze({
  clerkUserId: "clerk_task_5b_buyer",
  primaryEmail: "buyer@example.test",
  emailVerifiedAt: "2026-08-28T17:59:00.000Z",
  mfaConfigured: false,
  secondFactorCompleted: false,
});

type StoredAcceptance = Readonly<{
  userId: string;
  termsVersionId: string;
  contentHash: string;
  acceptedAt: string;
}>;

type EnrollmentState = {
  currentTerms: Array<Readonly<{
    id: string;
    contentHash: string;
    termsText: string;
    effectiveAt: string;
    supersededAt: string | null;
  }>>;
  acceptances: StoredAcceptance[];
  codes: Array<Readonly<{ ownerUserId: string; code: string; createdAt: string }>>;
};

function enrollmentHarness(
  overrides: Partial<EnrollmentState> = {},
): Readonly<{
  state: EnrollmentState;
  enrollInTransaction: ReferralEnrollmentTransaction;
}> {
  const state: EnrollmentState = {
    currentTerms: [{
      id: termsVersionId,
      contentHash: termsContentHash,
      termsText,
      effectiveAt: "2026-08-28T00:00:00.000Z",
      supersededAt: null,
    }],
    acceptances: [],
    codes: [],
    ...overrides,
  };

  const enrollInTransaction: ReferralEnrollmentTransaction = async (input) => {
    const beforeAcceptances = [...state.acceptances];
    const beforeCodes = [...state.codes];
    try {
      const current = state.currentTerms.filter(
        (terms) =>
          terms.effectiveAt <= input.acceptedAt.toISOString() &&
          (terms.supersededAt === null ||
            terms.supersededAt > input.acceptedAt.toISOString()),
      );
      if (current.length !== 1) throw new ReferralEnrollmentError("terms_unavailable");
      const selected = current[0]!;
      const computedHash = createHash("sha256")
        .update(selected.termsText)
        .digest("hex");
      if (
        selected.id !== input.termsVersionId ||
        selected.contentHash !== computedHash ||
        input.termsContentHash !== computedHash
      ) {
        throw new ReferralEnrollmentError("terms_mismatch");
      }

      const existingAcceptance = state.acceptances.find(
        (acceptance) => acceptance.userId === input.buyerUserId,
      );
      if (!existingAcceptance) {
        state.acceptances.push(Object.freeze({
          userId: input.buyerUserId,
          termsVersionId: input.termsVersionId,
          contentHash: computedHash,
          acceptedAt: input.acceptedAt.toISOString(),
        }));
      } else if (
        existingAcceptance.termsVersionId !== input.termsVersionId ||
        existingAcceptance.contentHash !== computedHash
      ) {
        throw new ReferralEnrollmentError("terms_mismatch");
      }

      const existingCode = state.codes.find(
        (code) => code.ownerUserId === input.buyerUserId,
      );
      if (existingCode) {
        return Object.freeze({
          status: "idempotent" as const,
          code: existingCode.code,
          createdAt: existingCode.createdAt,
        });
      }
      state.codes.push(Object.freeze({
        ownerUserId: input.buyerUserId,
        code: input.code,
        createdAt: input.acceptedAt.toISOString(),
      }));
      return Object.freeze({
        status: "applied" as const,
        code: input.code,
        createdAt: input.acceptedAt.toISOString(),
      });
    } catch (error) {
      state.acceptances = beforeAcceptances;
      state.codes = beforeCodes;
      throw error;
    }
  };

  return Object.freeze({ state, enrollInTransaction });
}

function createService(harness: ReturnType<typeof enrollmentHarness>) {
  return createReferralService({
    clock: () => new Date(now),
    createAcceptanceId: () => acceptanceId,
    createReferralCodeId: () => referralCodeId,
    createReferralCode: () => referralCode,
    enrollInTransaction: harness.enrollInTransaction,
  });
}

function enrollmentInput(
  buyerStatus: "active" | "review" | "blocked" = "active",
) {
  return Object.freeze({
    buyerUserId,
    buyerStatus,
    identity: verifiedIdentity,
    termsVersionId,
    termsContentHash,
  });
}

describe("customer referral enrollment", () => {
  it("atomically accepts the exact current terms and returns one frozen opaque code for an active verified buyer", async () => {
    const harness = enrollmentHarness();

    const result = await createService(harness).enrollCustomerReferral(
      enrollmentInput(),
    );

    expect(result).toEqual({
      status: "enrolled",
      code: referralCode,
      createdAt: now.toISOString(),
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.code).toMatch(/^ref_[A-Za-z0-9_-]{16,64}$/u);
    expect(harness.state.acceptances).toEqual([{
      userId: buyerUserId,
      termsVersionId,
      contentHash: termsContentHash,
      acceptedAt: now.toISOString(),
    }]);
    expect(harness.state.codes).toHaveLength(1);
  });

  it("returns the same stable code on exact replay without a second acceptance or code", async () => {
    const harness = enrollmentHarness();
    const service = createReferralService({
      clock: () => new Date(now),
      createAcceptanceId: vi
        .fn()
        .mockReturnValueOnce(acceptanceId)
        .mockReturnValueOnce("51000000-0000-4000-8000-000000000005"),
      createReferralCodeId: vi
        .fn()
        .mockReturnValueOnce(referralCodeId)
        .mockReturnValueOnce("51000000-0000-4000-8000-000000000006"),
      createReferralCode: vi
        .fn()
        .mockReturnValueOnce(referralCode)
        .mockReturnValueOnce("ref_5BDifferentCandidate"),
      enrollInTransaction: harness.enrollInTransaction,
    });

    const first = await service.enrollCustomerReferral(enrollmentInput());
    const replay = await service.enrollCustomerReferral(enrollmentInput());

    expect(first.code).toBe(referralCode);
    expect(replay).toEqual({
      status: "idempotent",
      code: referralCode,
      createdAt: now.toISOString(),
    });
    expect(harness.state.acceptances).toHaveLength(1);
    expect(harness.state.codes).toHaveLength(1);
  });

  it.each([
    ["missing", []],
    ["overlapping", [
      {
        id: termsVersionId,
        contentHash: termsContentHash,
        termsText,
        effectiveAt: "2026-08-28T00:00:00.000Z",
        supersededAt: null,
      },
      {
        id: "51000000-0000-4000-8000-000000000007",
        contentHash: termsContentHash,
        termsText,
        effectiveAt: "2026-08-28T12:00:00.000Z",
        supersededAt: null,
      },
    ]],
  ] as const)("rolls back when current terms are %s", async (_label, currentTerms) => {
    const harness = enrollmentHarness({ currentTerms: [...currentTerms] });

    await expect(
      createService(harness).enrollCustomerReferral(enrollmentInput()),
    ).rejects.toMatchObject({ code: "terms_unavailable" });
    expect(harness.state.acceptances).toEqual([]);
    expect(harness.state.codes).toEqual([]);
  });

  it.each([
    ["stale version", { termsVersionId: "51000000-0000-4000-8000-000000000008" }],
    ["hash mismatch", { termsContentHash: "0".repeat(64) }],
  ] as const)("rolls back on %s", async (_label, override) => {
    const harness = enrollmentHarness();

    await expect(
      createService(harness).enrollCustomerReferral({
        ...enrollmentInput(),
        ...override,
      }),
    ).rejects.toMatchObject({ code: "terms_mismatch" });
    expect(harness.state.acceptances).toEqual([]);
    expect(harness.state.codes).toEqual([]);
  });

  it.each(["review", "blocked"] as const)(
    "rejects a %s buyer before opening the enrollment transaction",
    async (buyerStatus) => {
      const harness = enrollmentHarness();
      const transaction = vi.fn(harness.enrollInTransaction);
      const service = createReferralService({
        clock: () => new Date(now),
        createAcceptanceId: () => acceptanceId,
        createReferralCodeId: () => referralCodeId,
        createReferralCode: () => referralCode,
        enrollInTransaction: transaction,
      });

      await expect(
        service.enrollCustomerReferral(enrollmentInput(buyerStatus)),
      ).rejects.toMatchObject({ code: "buyer_inactive" });
      expect(transaction).not.toHaveBeenCalled();
      expect(harness.state.acceptances).toEqual([]);
      expect(harness.state.codes).toEqual([]);
    },
  );

  it("requires the existing currently verified primary-email identity contract", async () => {
    const harness = enrollmentHarness();

    await expect(
      createService(harness).enrollCustomerReferral({
        ...enrollmentInput(),
        identity: Object.freeze({ ...verifiedIdentity, emailVerifiedAt: null }),
      }),
    ).rejects.toMatchObject({ code: "identity_unverified" });
    expect(harness.state.acceptances).toEqual([]);
    expect(harness.state.codes).toEqual([]);
  });
});

const referralPolicy: ReferralPolicy = Object.freeze({
  id: "51000000-0000-4000-8000-000000000010",
  version: 1,
  status: "active",
  attributionDays: 30,
  referredDiscountBasisPoints: 1_000,
  referredDiscountCapMinor: 2_500,
  referrerPointsPerDollar: 5,
  referrerRewardCapPoints: 2_500,
  effectiveAt: "2026-08-01T00:00:00.000Z",
  supersededAt: null,
});

describe("customer referral checkout attribution", () => {
  it("verifies the signed cookie server-side and projects an eligible capped acquisition candidate", async () => {
    const verifyCookie = vi.fn(() => Object.freeze({
      schemaVersion: 1 as const,
      program: "customer_referral" as const,
      code: referralCode,
      issuedAt: "2026-08-20T18:00:00.000Z",
      expiresAt: "2026-09-19T18:00:00.000Z",
    }));
    const loadCandidate = vi.fn(async () => Object.freeze({
      status: "eligible" as const,
      referralCodeId,
      referrerUserId: "51000000-0000-4000-8000-000000000011",
      policy: referralPolicy,
    }));
    const service = createReferralCheckoutService({ verifyCookie, loadCandidate });

    const result = await service.quoteCustomerReferral({
      buyerUserId,
      attributionCookie: "signed-cookie-value",
      merchandiseSubtotalMinor: 40_000,
      currency: "USD",
      now,
    });

    expect(result).toMatchObject({
      status: "eligible",
      referralDiscountMinor: 2_500,
      referralPolicyId: referralPolicy.id,
      referralPolicyVersion: 1,
      code: referralCode,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(verifyCookie).toHaveBeenCalledWith("signed-cookie-value", now);
    expect(loadCandidate).toHaveBeenCalledWith({
      buyerUserId,
      code: referralCode,
      clickedAt: "2026-08-20T18:00:00.000Z",
      expiresAt: "2026-09-19T18:00:00.000Z",
      now,
    });
  });

  it.each([
    ["tampered or stale cookie", null],
    ["affiliate cookie", Object.freeze({
      schemaVersion: 1 as const,
      program: "affiliate" as const,
      code: "aff_5BConflictOpaqueCode",
      issuedAt: "2026-08-20T18:00:00.000Z",
      expiresAt: "2026-09-19T18:00:00.000Z",
    })],
  ] as const)("fails closed for %s before candidate lookup", async (_label, envelope) => {
    const loadCandidate = vi.fn();
    const service = createReferralCheckoutService({
      verifyCookie: () => envelope,
      loadCandidate,
    });

    await expect(service.quoteCustomerReferral({
      buyerUserId,
      attributionCookie: "untrusted-cookie",
      merchandiseSubtotalMinor: 10_000,
      currency: "USD",
      now,
    })).resolves.toEqual({
      status: "unavailable",
      reason: envelope === null ? "attribution_invalid" : "program_conflict",
    });
    expect(loadCandidate).not.toHaveBeenCalled();
  });

  it.each([
    "code_inactive",
    "policy_unavailable",
    "buyer_already_referred",
    "affiliate_conflict",
  ] as const)("fails closed when authoritative lookup reports %s", async (reason) => {
    const service = createReferralCheckoutService({
      verifyCookie: () => Object.freeze({
        schemaVersion: 1 as const,
        program: "customer_referral" as const,
        code: referralCode,
        issuedAt: "2026-08-20T18:00:00.000Z",
        expiresAt: "2026-09-19T18:00:00.000Z",
      }),
      loadCandidate: async () => Object.freeze({ status: "unavailable" as const, reason }),
    });

    await expect(service.quoteCustomerReferral({
      buyerUserId,
      attributionCookie: "signed-cookie",
      merchandiseSubtotalMinor: 10_000,
      currency: "USD",
      now,
    })).resolves.toEqual({ status: "unavailable", reason });
  });

  it("reports an internal conflict when authoritative candidate lookup fails", async () => {
    const service = createReferralCheckoutService({
      verifyCookie: () => Object.freeze({
        schemaVersion: 1 as const,
        program: "customer_referral" as const,
        code: referralCode,
        issuedAt: "2026-08-20T18:00:00.000Z",
        expiresAt: "2026-09-19T18:00:00.000Z",
      }),
      loadCandidate: async () => {
        throw new Error("synthetic authoritative lookup outage");
      },
    });

    await expect(service.quoteCustomerReferral({
      buyerUserId,
      attributionCookie: "signed-cookie",
      merchandiseSubtotalMinor: 10_000,
      currency: "USD",
      now,
    })).resolves.toEqual({ status: "internal_conflict" });
  });

  it("rejects self-referral from authoritative owner facts", async () => {
    const service = createReferralCheckoutService({
      verifyCookie: () => Object.freeze({
        schemaVersion: 1 as const,
        program: "customer_referral" as const,
        code: referralCode,
        issuedAt: "2026-08-20T18:00:00.000Z",
        expiresAt: "2026-09-19T18:00:00.000Z",
      }),
      loadCandidate: async () => Object.freeze({
        status: "eligible" as const,
        referralCodeId,
        referrerUserId: buyerUserId,
        policy: referralPolicy,
      }),
    });

    await expect(service.quoteCustomerReferral({
      buyerUserId,
      attributionCookie: "signed-cookie",
      merchandiseSubtotalMinor: 10_000,
      currency: "USD",
      now,
    })).resolves.toEqual({ status: "unavailable", reason: "self_referral" });
  });
});
