import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadOwnerGrowthDashboardMock } = vi.hoisted(() => ({
  loadOwnerGrowthDashboardMock: vi.fn(),
}));

vi.mock("@/growth/owner-growth-server", () => ({
  loadOwnerGrowthDashboard: loadOwnerGrowthDashboardMock,
}));

import ReferralsPage from "./page";

const emptyPaged = Object.freeze({
  items: Object.freeze([]),
  totalCount: 0,
  page: Object.freeze({ limit: 50, offset: 0, hasMore: false }),
});
const snapshot = Object.freeze({
  rewards: null,
  referrals: Object.freeze({
    code: "ref_StableOwnerRoute1234",
    status: "active" as const,
    counts: Object.freeze({ attributed: 1, pending: 0, qualified: 1, reversed: 0 }),
    rewardPointsTotal: 125,
    conversions: Object.freeze({
      ...emptyPaged,
      items: Object.freeze([Object.freeze({
        reference: "ref:7777777777",
        status: "qualified" as const,
        rewardPoints: 125,
        occurredAt: "2026-08-28T18:00:00.000Z",
      })]),
      totalCount: 1,
    }),
  }),
  sharedSets: emptyPaged,
  affiliate: null,
});

describe("owner referrals route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders only the owner code and redacted conversion facts", async () => {
    loadOwnerGrowthDashboardMock.mockResolvedValue({
      status: "data",
      access: "owner",
      verifiedEmail: "owner@example.test",
      snapshot,
      projection: {
        loyalty: null,
        referral: {
          attributionDays: 30,
          referredDiscountBasisPoints: 1_000,
          referredDiscountCapMinor: 2_500,
          referrerPointsPerDollar: 5,
          referrerRewardCapPoints: 2_500,
        },
        affiliate: null,
        terms: { rewards: { id: "77000000-0000-4000-8000-000000000001", version: 3 }, partner: null },
      },
    });

    render(await ReferralsPage());

    expect(screen.getByRole("heading", { level: 1, name: "Referrals" })).toBeVisible();
    expect(screen.getByText("/r/ref_StableOwnerRoute1234")).toBeVisible();
    expect(screen.getByText("ref:7777777777")).toBeVisible();
    expect(document.body).not.toHaveTextContent(/owner@example\.test|customer|address|payment/iu);
  });

  it("keeps blocked history visible and removes referral activation", async () => {
    loadOwnerGrowthDashboardMock.mockResolvedValue({
      status: "data",
      access: "blocked_read_capable",
      verifiedEmail: "owner@example.test",
      snapshot: Object.freeze({
        ...snapshot,
        referrals: Object.freeze({ ...snapshot.referrals, code: null, status: null }),
      }),
      projection: {
        loyalty: null,
        referral: { attributionDays: 30, referredDiscountBasisPoints: 1_000, referredDiscountCapMinor: 2_500, referrerPointsPerDollar: 5, referrerRewardCapPoints: 2_500 },
        affiliate: null,
        terms: { rewards: { id: "77000000-0000-4000-8000-000000000001", version: 3 }, partner: null },
      },
    });

    render(await ReferralsPage());

    expect(screen.getByText("ref:7777777777")).toBeVisible();
    expect(screen.getByText(/activation is unavailable while this account is blocked/iu)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Activate referral code" })).toBeNull();
  });

  it("keeps review owners read-only until they become active buyers", async () => {
    loadOwnerGrowthDashboardMock.mockResolvedValue({
      status: "empty",
      access: "read_only_owner",
      verifiedEmail: "owner@example.test",
      snapshot: Object.freeze({ ...snapshot, referrals: Object.freeze({ ...snapshot.referrals, code: null, status: null }) }),
      projection: {
        loyalty: null,
        referral: { attributionDays: 30, referredDiscountBasisPoints: 1_000, referredDiscountCapMinor: 2_500, referrerPointsPerDollar: 5, referrerRewardCapPoints: 2_500 },
        affiliate: null,
        terms: { rewards: { id: "77000000-0000-4000-8000-000000000001", version: 3 }, partner: null },
      },
    });

    render(await ReferralsPage());

    expect(screen.getByText(/activation requires an active buyer account/iu)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Activate referral code" })).toBeNull();
  });

  it.each([
    ["denied", "Referrals unavailable"],
    ["read_error", "Referrals could not be read safely. Please try again."],
    ["inactive", "Referrals are not currently active for this account."],
  ])("renders the safe %s state", async (status, message) => {
    loadOwnerGrowthDashboardMock.mockResolvedValue(
      status === "inactive"
        ? { status, access: "owner", verifiedEmail: "owner@example.test" }
        : { status },
    );

    render(await ReferralsPage());

    expect(screen.getByText(message)).toBeVisible();
  });
});
