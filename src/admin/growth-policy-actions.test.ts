import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  createDraft: vi.fn(),
  getRequestIdentity: vi.fn(),
  getRequestRepositories: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
  randomUUID: vi.fn(() => "8b300000-0000-4000-8000-000000000001"),
}));

vi.mock("node:crypto", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:crypto")>(),
  randomUUID: mocks.randomUUID,
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/auth/server", () => ({
  getRequestIdentity: mocks.getRequestIdentity,
  getRequestRepositories: mocks.getRequestRepositories,
  loadTargetVerifiedIdentity: vi.fn(),
}));
vi.mock("@/admin/admin-service", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/admin/admin-service")>(),
  activateGrowthPolicy: mocks.activate,
  createGrowthPolicyDraft: mocks.createDraft,
}));

import {
  activateAffiliatePolicyAction,
  activateLoyaltyPolicyAction,
  activateReferralPolicyAction,
  createAffiliatePolicyDraftAction,
  createLoyaltyPolicyDraftAction,
  createReferralPolicyDraftAction,
} from "./actions";

const policyId = "8b300000-0000-4000-8000-000000000002";
const effectiveAt = "2026-08-29T20:00:00.000Z";

const cases = [
  {
    kind: "loyalty",
    resource: "loyalty-policies",
    create: createLoyaltyPolicyDraftAction,
    activate: activateLoyaltyPolicyAction,
    values: {
      pointsPerDollar: 2,
      redemptionMinorPerPoint: 1,
      minimumRedemptionPoints: 500,
      maximumRedemptionBasisPoints: 2_500,
      expiresAfterDays: null,
    },
  },
  {
    kind: "referral",
    resource: "referral-policies",
    create: createReferralPolicyDraftAction,
    activate: activateReferralPolicyAction,
    values: {
      attributionDays: 30,
      referredDiscountBasisPoints: 1_000,
      referredDiscountCapMinor: 2_500,
      referrerPointsPerDollar: 5,
      referrerRewardCapPoints: 2_500,
    },
  },
  {
    kind: "affiliate",
    resource: "affiliate-policies",
    create: createAffiliatePolicyDraftAction,
    activate: activateAffiliatePolicyAction,
    values: {
      attributionDays: 30,
      firstOrderCommissionBasisPoints: 1_000,
      reorderCommissionBasisPoints: 500,
      reorderWindowDays: 180,
      approvalDelayDays: 30,
      payoutThresholdMinor: 5_000,
      currency: "USD",
    },
  },
] as const;

function form(values: Readonly<Record<string, unknown>>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) {
    data.set(name, value === null ? "" : String(value));
  }
  return data;
}

describe("Task 8B3 growth policy server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ origin: "https://admin.example.test" }));
    mocks.getRequestIdentity.mockResolvedValue({
      environment: {
        APP_ENV: "production",
        APP_ORIGIN: "https://admin.example.test",
        RATE_LIMIT_SECRET: "task-8b3-rate-limit-secret-at-least-32-characters",
      },
      identity: {
        clerkUserId: "clerk-growth-admin",
        primaryEmail: "admin@example.test",
        emailVerifiedAt: "2026-08-28T00:00:00.000Z",
        mfaConfigured: true,
        secondFactorCompleted: true,
      },
      principal: {
        actorId: "8b300000-0000-4000-8000-000000000003",
        clerkUserId: "clerk-growth-admin",
        buyerStatus: "active",
        capabilities: ["growth:manage"],
        mfaSatisfied: true,
      },
      localDriver: null,
    });
    mocks.getRequestRepositories.mockReturnValue({ adminRepository: {} });
    mocks.createDraft.mockResolvedValue({ id: policyId, version: 1, status: "draft" });
    mocks.activate.mockResolvedValue({ id: policyId, version: 1, status: "active" });
  });

  it.each(cases)("binds $resource draft and activation to server-owned $kind authority", async (entry) => {
    await expect(entry.create(form({ effectiveAt, ...entry.values }))).rejects.toThrow(
      `redirect:/admin/${entry.resource}?result=saved`,
    );
    expect(mocks.createDraft).toHaveBeenLastCalledWith(
      {},
      expect.objectContaining({ principal: expect.objectContaining({ capabilities: ["growth:manage"] }) }),
      {
        kind: entry.kind,
        policyId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u),
        effectiveAt,
        values: entry.values,
      },
    );

    await expect(entry.activate(form({ policyId, expectedVersion: 1 }))).rejects.toThrow(
      `redirect:/admin/${entry.resource}?result=saved`,
    );
    expect(mocks.activate).toHaveBeenLastCalledWith(
      {},
      expect.any(Object),
      { kind: entry.kind, policyId, expectedVersion: 1 },
    );
  });

  it.each(cases)("rejects browser kind/resource/extra authority for $resource", async (entry) => {
    for (const extra of [
      { kind: entry.kind === "loyalty" ? "referral" : "loyalty" },
      { resource: entry.resource === "affiliate-policies" ? "loyalty-policies" : "affiliate-policies" },
      { actorUserId: "browser-owned-authority" },
    ]) {
      await expect(entry.create(form({ effectiveAt, ...entry.values, ...extra }))).rejects.toThrow(
        `redirect:/admin/${entry.resource}?result=denied`,
      );
    }
    expect(mocks.getRequestIdentity).not.toHaveBeenCalled();
    expect(mocks.createDraft).not.toHaveBeenCalled();
  });
});
