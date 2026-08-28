import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { VerifiedIdentity } from "@/auth/identity";
import type { GrowthSqlClient, GrowthTransactionRunner } from "@/db/repositories/growth-repository";
import type { Principal } from "@/domain/authorization";
import type { AffiliatePolicy } from "@/domain/affiliates";

import {
  AffiliateAdminError,
  AffiliateApplicationError,
  calculateAffiliateOrderCommission,
  createAffiliateCheckoutService,
  createAffiliateAttributionCandidate,
  createAffiliateAdminService,
  createAffiliatePayoutBatchDraft,
  createAffiliatePayoutService,
  createAffiliateService,
  createPostgresAffiliatePayoutCreateTransaction,
  type AffiliateAdminMutationTransaction,
  type AffiliateApplicationTransaction,
  type AffiliatePayoutCreateTransaction,
  type AffiliatePayoutPaidTransaction,
} from "./affiliate-service";

const now = new Date("2026-08-28T19:00:00.000Z");
const buyerUserId = "6a000000-0000-4000-8000-000000000001";
const termsVersionId = "6a000000-0000-4000-8000-000000000002";
const acceptanceId = "6a000000-0000-4000-8000-000000000003";
const profileId = "6a000000-0000-4000-8000-000000000004";
const publicCode = "aff_6AStableOpaquePartnerCode";
const attributionCode = "aff_6BOpaqueAttribution9";
const termsText = "Synthetic affiliate terms version one for service tests.";
const termsContentHash = createHash("sha256").update(termsText).digest("hex");

const activeAffiliatePolicy: AffiliatePolicy = Object.freeze({
  id: "6b000000-0000-4000-8000-000000000001",
  version: 1,
  status: "active",
  attributionDays: 30,
  firstOrderCommissionBasisPoints: 1_000,
  reorderCommissionBasisPoints: 500,
  reorderWindowDays: 180,
  approvalDelayDays: 30,
  payoutThresholdMinor: 5_000,
  currency: "USD",
  effectiveAt: "2026-08-27T00:00:00.000Z",
  supersededAt: null,
});

describe("affiliate payout batch draft", () => {
  it("selects only eligible approved unpaid USD commission and enforces the immutable 5000-minor threshold", () => {
    const draft = createAffiliatePayoutBatchDraft({
      payoutId: "6c000000-0000-4000-8000-000000000001",
      idempotencyKey: "affiliate-payout-batch:6c:one",
      createdAt: now,
      profile: Object.freeze({ id: profileId, status: "active" as const }),
      policy: activeAffiliatePolicy,
      commissions: Object.freeze([
        Object.freeze({ id: "6c000000-0000-4000-8000-000000000011", affiliateProfileId: profileId, affiliatePolicyId: activeAffiliatePolicy.id, affiliatePolicyVersion: 1, grossCommissionMinor: 2_700, reversedCommissionMinor: 200, currency: "USD", status: "approved" as const, approvalEligibleAt: "2026-08-27T19:00:00.000Z", payoutId: null }),
        Object.freeze({ id: "6c000000-0000-4000-8000-000000000012", affiliateProfileId: profileId, affiliatePolicyId: activeAffiliatePolicy.id, affiliatePolicyVersion: 1, grossCommissionMinor: 2_500, reversedCommissionMinor: 0, currency: "USD", status: "approved" as const, approvalEligibleAt: "2026-08-28T19:00:00.000Z", payoutId: null }),
        Object.freeze({ id: "6c000000-0000-4000-8000-000000000013", affiliateProfileId: profileId, affiliatePolicyId: activeAffiliatePolicy.id, affiliatePolicyVersion: 1, grossCommissionMinor: 9_000, reversedCommissionMinor: 0, currency: "EUR", status: "approved" as const, approvalEligibleAt: "2026-08-27T19:00:00.000Z", payoutId: null }),
        Object.freeze({ id: "6c000000-0000-4000-8000-000000000014", affiliateProfileId: profileId, affiliatePolicyId: activeAffiliatePolicy.id, affiliatePolicyVersion: 1, grossCommissionMinor: 6_000, reversedCommissionMinor: 0, currency: "USD", status: "approved" as const, approvalEligibleAt: "2026-08-27T19:00:00.000Z", payoutId: "6c000000-0000-4000-8000-000000000099" }),
      ]),
    });

    expect(draft).toEqual({
      id: "6c000000-0000-4000-8000-000000000001",
      affiliateProfileId: profileId,
      affiliatePolicyId: activeAffiliatePolicy.id,
      affiliatePolicyVersion: 1,
      idempotencyKey: "affiliate-payout-batch:6c:one",
      amountMinor: 5_000,
      currency: "USD",
      state: "pending",
      version: 1,
      commissionIds: [
        "6c000000-0000-4000-8000-000000000011",
        "6c000000-0000-4000-8000-000000000012",
      ],
      providerName: null,
      externalReference: null,
      paidAt: null,
      createdAt: now.toISOString(),
    });
    expect(Object.isFrozen(draft)).toBe(true);
    expect(Object.isFrozen(draft.commissionIds)).toBe(true);

    expect(() => createAffiliatePayoutBatchDraft({
      payoutId: "6c000000-0000-4000-8000-000000000002",
      idempotencyKey: "affiliate-payout-batch:6c:below",
      createdAt: now,
      profile: Object.freeze({ id: profileId, status: "active" as const }),
      policy: activeAffiliatePolicy,
      commissions: Object.freeze([
        Object.freeze({ id: "6c000000-0000-4000-8000-000000000021", affiliateProfileId: profileId, affiliatePolicyId: activeAffiliatePolicy.id, affiliatePolicyVersion: 1, grossCommissionMinor: 4_999, reversedCommissionMinor: 0, currency: "USD", status: "approved" as const, approvalEligibleAt: "2026-08-27T19:00:00.000Z", payoutId: null }),
      ]),
    })).toThrow(/threshold/u);
  });

  it("honors a retired immutable policy snapshot for an active affiliate obligation", () => {
    const retiredPolicy = Object.freeze({
      ...activeAffiliatePolicy,
      status: "retired" as const,
      supersededAt: "2026-08-20T00:00:00.000Z",
    });
    expect(createAffiliatePayoutBatchDraft({
      payoutId: "6c000000-0000-4000-8000-000000000003",
      idempotencyKey: "affiliate-payout-batch:6c:retired-policy",
      createdAt: now,
      profile: Object.freeze({ id: profileId, status: "active" as const }),
      policy: retiredPolicy,
      commissions: Object.freeze([
        Object.freeze({ id: "6c000000-0000-4000-8000-000000000031", affiliateProfileId: profileId, affiliatePolicyId: retiredPolicy.id, affiliatePolicyVersion: 1, grossCommissionMinor: 5_000, reversedCommissionMinor: 0, currency: "USD", status: "approved" as const, approvalEligibleAt: "2026-08-27T19:00:00.000Z", payoutId: null }),
      ]),
    })).toMatchObject({ amountMinor: 5_000, affiliatePolicyVersion: 1 });
  });

  it.each([4_999, 5_001])(
    "rejects a stored payout threshold of %i instead of redefining the Task 6 V1 contract",
    (payoutThresholdMinor) => {
      const policy = Object.freeze({ ...activeAffiliatePolicy, payoutThresholdMinor });
      expect(() => createAffiliatePayoutBatchDraft({
        payoutId: "6c000000-0000-4000-8000-000000000004",
        idempotencyKey: `affiliate-payout-batch:6c:threshold:${payoutThresholdMinor}`,
        createdAt: now,
        profile: Object.freeze({ id: profileId, status: "active" as const }),
        policy,
        commissions: Object.freeze([
          Object.freeze({ id: "6c000000-0000-4000-8000-000000000041", affiliateProfileId: profileId, affiliatePolicyId: policy.id, affiliatePolicyVersion: 1, grossCommissionMinor: payoutThresholdMinor, reversedCommissionMinor: 0, currency: "USD", status: "approved" as const, approvalEligibleAt: "2026-08-27T19:00:00.000Z", payoutId: null }),
        ]),
      })).toThrow(/5,000/u);
    },
  );
});

const payoutAdmin: Principal = Object.freeze({
  actorId: "6c000000-0000-4000-8000-000000000090",
  clerkUserId: "clerk_task_6c_payout_admin",
  buyerStatus: null,
  capabilities: Object.freeze(["affiliate:payout"] as const),
  mfaSatisfied: true,
});

const payoutDraft = Object.freeze({
  id: "6c000000-0000-4000-8000-000000000001",
  affiliateProfileId: profileId,
  affiliatePolicyId: activeAffiliatePolicy.id,
  affiliatePolicyVersion: 1,
  idempotencyKey: "affiliate-payout-batch:6c:one",
  amountMinor: 5_000,
  currency: "USD" as const,
  state: "pending" as const,
  version: 1 as const,
  commissionIds: Object.freeze([
    "6c000000-0000-4000-8000-000000000011",
    "6c000000-0000-4000-8000-000000000012",
  ]),
  providerName: null,
  externalReference: null,
  paidAt: null,
  createdAt: now.toISOString(),
});

describe("affiliate payout service", () => {
  it("authorizes one MFA payout principal and keeps money and commission selection server-side", async () => {
    const createInTransaction = vi.fn<AffiliatePayoutCreateTransaction>()
      .mockResolvedValue(Object.freeze({ status: "applied", payout: payoutDraft }));
    const markPaidInTransaction = vi.fn<AffiliatePayoutPaidTransaction>();
    const service = createAffiliatePayoutService({
      clock: () => new Date(now),
      createPayoutId: () => payoutDraft.id,
      createInTransaction,
      markPaidInTransaction,
    });

    const result = await service.createBatch({
      principal: payoutAdmin,
      profileId,
      idempotencyKey: payoutDraft.idempotencyKey,
      correlationId: "task-6c-create-payout-one",
    });

    expect(createInTransaction).toHaveBeenCalledWith({
      actorUserId: payoutAdmin.actorId,
      payoutId: payoutDraft.id,
      profileId,
      idempotencyKey: payoutDraft.idempotencyKey,
      correlationId: "task-6c-create-payout-one",
      createdAt: now,
    });
    expect(result).toEqual({
      status: "created",
      payout: {
        id: payoutDraft.id,
        affiliateProfileId: profileId,
        affiliatePolicyId: activeAffiliatePolicy.id,
        affiliatePolicyVersion: 1,
        amountMinor: 5_000,
        currency: "USD",
        state: "pending",
        version: 1,
        commissionCount: 2,
        providerName: null,
        externalReference: null,
        createdAt: now.toISOString(),
        paidAt: null,
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(markPaidInTransaction).not.toHaveBeenCalled();
  });

  it("replays the original batch after response loss despite a fresh UUID and later server clock", async () => {
    const correlationId = "task-6c-create-payout-response-loss";
    const requestHash = createHash("sha256").update(JSON.stringify([
      "affiliate-payout-create-v1",
      payoutAdmin.actorId,
      profileId,
      payoutDraft.idempotencyKey,
      correlationId,
    ])).digest("hex");
    const sqlClient: GrowthSqlClient = Object.freeze({
      query: async <Row extends object>(sql: string) => {
        if (sql.includes("WHERE idempotency_key = $1 FOR UPDATE")) {
          return { rows: [{
            id: payoutDraft.id,
            affiliateProfileId: payoutDraft.affiliateProfileId,
            affiliatePolicyId: payoutDraft.affiliatePolicyId,
            affiliatePolicyVersion: payoutDraft.affiliatePolicyVersion,
            idempotencyKey: payoutDraft.idempotencyKey,
            requestHash,
            amountMinor: payoutDraft.amountMinor,
            currency: payoutDraft.currency,
            state: payoutDraft.state,
            version: payoutDraft.version,
            paidIdempotencyKey: null,
            paidRequestHash: null,
            externalProvider: null,
            externalReference: null,
            createdAt: payoutDraft.createdAt,
            paidAt: null,
          }] as unknown as Row[] };
        }
        if (sql.includes("FROM affiliate_payout_commissions")) {
          return { rows: payoutDraft.commissionIds.map((id) => ({ id })) as unknown as Row[] };
        }
        throw new Error(`Unexpected payout replay query: ${sql}`);
      },
    });
    const runSerializableTransaction: GrowthTransactionRunner = async (work) => work(sqlClient);
    const service = createAffiliatePayoutService({
      clock: () => new Date("2026-08-28T19:05:00.000Z"),
      createPayoutId: () => "6c000000-0000-4000-8000-000000000099",
      createInTransaction: createPostgresAffiliatePayoutCreateTransaction({
        runSerializableTransaction,
      }),
      markPaidInTransaction: vi.fn<AffiliatePayoutPaidTransaction>(),
    });

    await expect(service.createBatch({
      principal: payoutAdmin,
      profileId,
      idempotencyKey: payoutDraft.idempotencyKey,
      correlationId,
    })).resolves.toEqual({
      status: "idempotent",
      payout: {
        id: payoutDraft.id,
        affiliateProfileId: profileId,
        affiliatePolicyId: activeAffiliatePolicy.id,
        affiliatePolicyVersion: 1,
        amountMinor: 5_000,
        currency: "USD",
        state: "pending",
        version: 1,
        commissionCount: 2,
        providerName: null,
        externalReference: null,
        createdAt: now.toISOString(),
        paidAt: null,
      },
    });
  });

  it.each([
    ["missing MFA", { ...payoutAdmin, mfaSatisfied: false }],
    ["missing payout capability", { ...payoutAdmin, capabilities: Object.freeze(["growth:manage"] as const) }],
  ])("denies %s before a payout transaction", async (_label, principal) => {
    const createInTransaction = vi.fn<AffiliatePayoutCreateTransaction>();
    const service = createAffiliatePayoutService({
      clock: () => new Date(now),
      createPayoutId: () => payoutDraft.id,
      createInTransaction,
      markPaidInTransaction: vi.fn<AffiliatePayoutPaidTransaction>(),
    });

    await expect(service.createBatch({
      principal,
      profileId,
      idempotencyKey: payoutDraft.idempotencyKey,
      correlationId: "task-6c-create-payout-denied",
    })).rejects.toMatchObject({ code: "authorization_denied" });
    expect(createInTransaction).not.toHaveBeenCalled();
  });

  it("records an externally completed payment with expected-version CAS and bounded evidence", async () => {
    const paidAt = new Date("2026-08-28T20:00:00.000Z");
    const markPaidInTransaction = vi.fn<AffiliatePayoutPaidTransaction>()
      .mockResolvedValue(Object.freeze({
        status: "applied",
        payout: Object.freeze({
          ...payoutDraft,
          state: "paid" as const,
          version: 2,
          providerName: "ACH operator",
          externalReference: "bank-confirmation-6c-001",
          paidAt: paidAt.toISOString(),
        }),
      }));
    const service = createAffiliatePayoutService({
      clock: () => new Date(paidAt),
      createPayoutId: () => payoutDraft.id,
      createInTransaction: vi.fn<AffiliatePayoutCreateTransaction>(),
      markPaidInTransaction,
    });

    const result = await service.markPaid({
      principal: payoutAdmin,
      payoutId: payoutDraft.id,
      expectedVersion: 1,
      idempotencyKey: "affiliate-payout-paid:6c:one",
      providerName: "ACH operator",
      externalReference: "bank-confirmation-6c-001",
      correlationId: "task-6c-record-paid-one",
    });

    expect(markPaidInTransaction).toHaveBeenCalledWith({
      actorUserId: payoutAdmin.actorId,
      payoutId: payoutDraft.id,
      expectedVersion: 1,
      idempotencyKey: "affiliate-payout-paid:6c:one",
      providerName: "ACH operator",
      externalReference: "bank-confirmation-6c-001",
      correlationId: "task-6c-record-paid-one",
      paidAt,
    });
    expect(result).toMatchObject({
      status: "paid",
      payout: {
        state: "paid",
        version: 2,
        providerName: "ACH operator",
        externalReference: "bank-confirmation-6c-001",
      },
    });
  });

  it("denies paid recording without a nonempty external reference before persistence", async () => {
    const markPaidInTransaction = vi.fn<AffiliatePayoutPaidTransaction>();
    const service = createAffiliatePayoutService({
      clock: () => new Date(now),
      createPayoutId: () => payoutDraft.id,
      createInTransaction: vi.fn<AffiliatePayoutCreateTransaction>(),
      markPaidInTransaction,
    });

    await expect(service.markPaid({
      principal: payoutAdmin,
      payoutId: payoutDraft.id,
      expectedVersion: 1,
      idempotencyKey: "affiliate-payout-paid:6c:missing-reference",
      providerName: "ACH operator",
      externalReference: "",
      correlationId: "task-6c-record-paid-missing-reference",
    })).rejects.toMatchObject({ code: "invalid_input" });
    expect(markPaidInTransaction).not.toHaveBeenCalled();
  });
});

describe("authoritative affiliate commission calculation", () => {
  it("uses 10 percent for the first qualified order and merchandise after discounts and points only", () => {
    expect(calculateAffiliateOrderCommission({
      policy: activeAffiliatePolicy,
      partnerStatus: "active",
      attribution: {
        program: "affiliate",
        code: attributionCode,
        clickedAt: "2026-08-28T18:00:00.000Z",
      },
      firstQualifiedOrderAt: null,
      orderPaidAt: now.toISOString(),
      merchandiseMinor: 8_001,
      taxMinor: 825,
      shippingMinor: 1_500,
      currency: "USD",
    })).toEqual({
      status: "commissioned",
      orderKind: "first",
      eligibleMerchandiseMinor: 8_001,
      commissionMinor: 800,
    });
  });

  it("uses 5 percent through day 180 inclusive and zero after day 180", () => {
    const firstQualifiedOrderAt = "2026-03-01T19:00:00.000Z";
    expect(calculateAffiliateOrderCommission({
      policy: activeAffiliatePolicy,
      partnerStatus: "active",
      attribution: { program: "affiliate", code: attributionCode, clickedAt: firstQualifiedOrderAt },
      firstQualifiedOrderAt,
      orderPaidAt: "2026-08-28T19:00:00.000Z",
      merchandiseMinor: 12_345,
      taxMinor: 999,
      shippingMinor: 777,
      currency: "USD",
    })).toMatchObject({ status: "commissioned", orderKind: "reorder", commissionMinor: 617 });
    expect(calculateAffiliateOrderCommission({
      policy: activeAffiliatePolicy,
      partnerStatus: "active",
      attribution: { program: "affiliate", code: attributionCode, clickedAt: firstQualifiedOrderAt },
      firstQualifiedOrderAt,
      orderPaidAt: "2026-08-29T19:00:00.000Z",
      merchandiseMinor: 12_345,
      taxMinor: 0,
      shippingMinor: 0,
      currency: "USD",
    })).toEqual({ status: "outside_window", commissionMinor: 0 });
  });

  it("uses retired order-bound economics only while the current partner remains active", () => {
    const retiredPolicy = Object.freeze({
      ...activeAffiliatePolicy,
      status: "retired" as const,
      supersededAt: "2026-08-28T19:01:00.000Z",
    });
    const input = {
      policy: retiredPolicy,
      attribution: {
        program: "affiliate" as const,
        code: attributionCode,
        clickedAt: "2026-08-20T19:00:00.000Z",
      },
      firstQualifiedOrderAt: null,
      orderPaidAt: "2026-08-28T19:02:00.000Z",
      merchandiseMinor: 8_001,
      taxMinor: 825,
      shippingMinor: 1_500,
      currency: "USD" as const,
    };
    expect(calculateAffiliateOrderCommission({
      ...input,
      partnerStatus: "active",
    })).toMatchObject({ status: "commissioned", commissionMinor: 800 });
    for (const partnerStatus of ["suspended", "rejected"] as const) {
      expect(calculateAffiliateOrderCommission({ ...input, partnerStatus }))
        .toEqual({ status: "ineligible", commissionMinor: 0 });
    }
  });

  it("fails closed for customer-referral attribution or a non-active partner", () => {
    for (const input of [
      {
        partnerStatus: "active",
        attribution: { program: "customer_referral", code: "ref_AbCdEf0123456789", clickedAt: now.toISOString() },
      },
      {
        partnerStatus: "suspended",
        attribution: { program: "affiliate", code: attributionCode, clickedAt: now.toISOString() },
      },
      {
        partnerStatus: "rejected",
        attribution: { program: "affiliate", code: attributionCode, clickedAt: now.toISOString() },
      },
    ] as const) {
      expect(calculateAffiliateOrderCommission({
        policy: activeAffiliatePolicy,
        firstQualifiedOrderAt: null,
        orderPaidAt: now.toISOString(),
        merchandiseMinor: 8_001,
        taxMinor: 825,
        shippingMinor: 1_500,
        currency: "USD",
        ...input,
      })).toEqual({ status: "ineligible", commissionMinor: 0 });
    }
  });
});

describe("affiliate checkout attribution", () => {
  it("verifies an affiliate envelope and returns only a frozen private binding snapshot", async () => {
    const loadCandidate = vi.fn(async () => Object.freeze({
      status: "eligible" as const,
      code: attributionCode,
      affiliateProfileId: profileId,
      affiliateUserId: "6b000000-0000-4000-8000-000000000002",
      existingAttributionId: null,
      clickedAt: "2026-08-20T19:00:00.000Z",
      expiresAt: "2026-09-19T19:00:00.000Z",
      affiliatePolicyId: activeAffiliatePolicy.id,
      affiliatePolicyVersion: 1,
    }));
    const service = createAffiliateCheckoutService({
      verifyCookie: () => Object.freeze({
        schemaVersion: 1,
        program: "affiliate",
        code: attributionCode,
        issuedAt: "2026-08-20T19:00:00.000Z",
        expiresAt: "2026-09-19T19:00:00.000Z",
      }),
      loadCandidate,
    });

    const result = await service.quoteAffiliateAttribution({
      buyerUserId,
      attributionCookie: "signed-affiliate-cookie",
      now,
    });

    expect(result).toMatchObject({
      status: "eligible",
      code: attributionCode,
      affiliateProfileId: profileId,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(loadCandidate).toHaveBeenCalledWith({
      buyerUserId,
      code: attributionCode,
      clickedAt: "2026-08-20T19:00:00.000Z",
      expiresAt: "2026-09-19T19:00:00.000Z",
      now,
    });
  });

  it("reports an internal conflict when the authoritative candidate lookup fails", async () => {
    const service = createAffiliateCheckoutService({
      verifyCookie: () => Object.freeze({
        schemaVersion: 1,
        program: "affiliate",
        code: attributionCode,
        issuedAt: "2026-08-20T19:00:00.000Z",
        expiresAt: "2026-09-19T19:00:00.000Z",
      }),
      loadCandidate: async () => {
        throw new Error("synthetic authoritative lookup failure");
      },
    });

    await expect(service.quoteAffiliateAttribution({
      buyerUserId,
      attributionCookie: "signed-affiliate-cookie",
      now,
    })).resolves.toEqual({ status: "internal_conflict" });
  });

  it("fails closed for a customer-referral envelope and self attribution", async () => {
    const customerProgram = createAffiliateCheckoutService({
      verifyCookie: () => Object.freeze({
        schemaVersion: 1,
        program: "customer_referral",
        code: "ref_AbCdEf0123456789",
        issuedAt: "2026-08-20T19:00:00.000Z",
        expiresAt: "2026-09-19T19:00:00.000Z",
      }),
      loadCandidate: vi.fn(),
    });
    await expect(customerProgram.quoteAffiliateAttribution({
      buyerUserId,
      attributionCookie: "signed-customer-cookie",
      now,
    })).resolves.toEqual({ status: "unavailable", reason: "program_conflict" });

    const self = createAffiliateCheckoutService({
      verifyCookie: () => Object.freeze({
        schemaVersion: 1,
        program: "affiliate",
        code: attributionCode,
        issuedAt: "2026-08-20T19:00:00.000Z",
        expiresAt: "2026-09-19T19:00:00.000Z",
      }),
      loadCandidate: async () => Object.freeze({
        status: "eligible",
        code: attributionCode,
        affiliateProfileId: profileId,
        affiliateUserId: buyerUserId,
        existingAttributionId: null,
        clickedAt: "2026-08-20T19:00:00.000Z",
        expiresAt: "2026-09-19T19:00:00.000Z",
        affiliatePolicyId: activeAffiliatePolicy.id,
        affiliatePolicyVersion: 1,
      }),
    });
    await expect(self.quoteAffiliateAttribution({
      buyerUserId,
      attributionCookie: "signed-self-cookie",
      now,
    })).resolves.toEqual({ status: "unavailable", reason: "self_attribution" });
  });
});

const affiliatePolicyRow = Object.freeze({
  code: attributionCode,
  profileStatus: "active" as const,
  policyStatus: "active" as const,
  attributionDays: 30,
  effectiveAt: "2026-08-28T00:00:00.000Z",
  supersededAt: null,
});

describe("affiliate attribution candidate", () => {
  it("returns one frozen privacy-minimal candidate for an active code and one current active policy", () => {
    const result = createAffiliateAttributionCandidate({
      requestedCode: attributionCode,
      now,
      rows: [affiliatePolicyRow],
    });

    expect(result).toEqual({
      program: "affiliate",
      code: attributionCode,
      attributionDays: 30,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      /buyer|partner|email|channel|profile.?id|user.?id|order|payment|address|ip|device/i,
    );
  });

  it.each(["pending", "suspended", "rejected"] as const)(
    "rejects a %s affiliate profile without exposing whether the code exists",
    (profileStatus) => {
      expect(createAffiliateAttributionCandidate({
        requestedCode: attributionCode,
        now,
        rows: [{ ...affiliatePolicyRow, profileStatus }],
      })).toBeNull();
    },
  );

  it("rejects inactive, future, superseded, and overlapping affiliate policies", () => {
    for (const rows of [
      [{ ...affiliatePolicyRow, policyStatus: "draft" }],
      [{ ...affiliatePolicyRow, policyStatus: "retired" }],
      [{ ...affiliatePolicyRow, effectiveAt: "2026-08-28T19:00:00.001Z" }],
      [{ ...affiliatePolicyRow, supersededAt: now.toISOString() }],
      [{ ...affiliatePolicyRow }, { ...affiliatePolicyRow }],
      [],
    ]) {
      expect(createAffiliateAttributionCandidate({
        requestedCode: attributionCode,
        now,
        rows,
      })).toBeNull();
    }
  });

  it("rejects mismatched or malformed codes, non-30-day policy facts, and malformed clocks", () => {
    for (const input of [
      { requestedCode: "aff_DifferentOpaqueCode1", now, rows: [affiliatePolicyRow] },
      { requestedCode: "aff_short", now, rows: [affiliatePolicyRow] },
      { requestedCode: attributionCode, now, rows: [{ ...affiliatePolicyRow, attributionDays: 31 }] },
      { requestedCode: attributionCode, now: new Date("invalid"), rows: [affiliatePolicyRow] },
    ]) {
      expect(createAffiliateAttributionCandidate(input)).toBeNull();
    }
  });
});

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

  it.each([
    ["active", 2],
    ["rejected", 2],
    ["suspended", 3],
  ] as const)(
    "returns the current %s profile on an exact immutable application replay",
    async (status, version) => {
      const applyInTransaction: AffiliateApplicationTransaction = async () =>
        Object.freeze({
          status: "idempotent" as const,
          profile: Object.freeze({
            id: profileId,
            buyerUserId,
            publicCode,
            status,
            version,
            publicChannel: "https://partner.example/research",
            promotionMethod: "website" as const,
            termsAcceptanceId: acceptanceId,
            createdAt: "2026-08-28T18:30:00.000Z",
          }),
        });
      const service = createAffiliateService({
        clock: () => new Date(now),
        createAcceptanceId: () => "6a000000-0000-4000-8000-000000000013",
        createProfileId: () => "6a000000-0000-4000-8000-000000000014",
        createPublicCode: () => "aff_6AFreshReplayCandidate",
        publicationPolicy: { version: "policy-v1", activeLotEvidenceIds: [] },
        applyInTransaction,
      });

      await expect(service.applyForAffiliate(applicationInput())).resolves.toEqual({
        status: "idempotent",
        application: {
          publicCode,
          status,
          version,
          publicChannel: "https://partner.example/research",
          promotionMethod: "website",
          createdAt: "2026-08-28T18:30:00.000Z",
        },
      });
    },
  );

  it.each([
    ["pending", 2],
    ["active", 1],
    ["rejected", 3],
    ["suspended", 2],
  ] as const)(
    "rejects an incoherent stored %s version %i replay result",
    async (status, version) => {
      const applyInTransaction: AffiliateApplicationTransaction = async () =>
        Object.freeze({
          status: "idempotent" as const,
          profile: Object.freeze({
            id: profileId,
            buyerUserId,
            publicCode,
            status,
            version,
            publicChannel: "https://partner.example/research",
            promotionMethod: "website" as const,
            termsAcceptanceId: acceptanceId,
            createdAt: "2026-08-28T18:30:00.000Z",
          }),
        });

      await expect(createAffiliateService({
        clock: () => new Date(now),
        createAcceptanceId: () => "6a000000-0000-4000-8000-000000000013",
        createProfileId: () => "6a000000-0000-4000-8000-000000000014",
        createPublicCode: () => "aff_6AFreshReplayCandidate",
        publicationPolicy: { version: "policy-v1", activeLotEvidenceIds: [] },
        applyInTransaction,
      }).applyForAffiliate(applicationInput())).rejects.toMatchObject({
        code: "persistence_conflict",
      });
    },
  );

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
