import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadOwnerGrowthDashboardMock } = vi.hoisted(() => ({
  loadOwnerGrowthDashboardMock: vi.fn(),
}));

vi.mock("@/growth/owner-growth-server", () => ({
  loadOwnerGrowthDashboard: loadOwnerGrowthDashboardMock,
}));

import RewardsPage from "./page";

const emptyPaged = Object.freeze({
  items: Object.freeze([]),
  totalCount: 0,
  page: Object.freeze({ limit: 50, offset: 0, hasMore: false }),
});

const snapshot = Object.freeze({
  rewards: Object.freeze({
    pendingPoints: 25,
    availablePoints: -25,
    usdEquivalentMinor: -25,
    minimumRedemptionProgress: Object.freeze({ currentPoints: 0, requiredPoints: 500 }),
    ledger: Object.freeze({
      items: Object.freeze([Object.freeze({
        occurredAt: "2026-08-28T18:00:00.000Z",
        kind: "refund_reversal",
        reference: "ref:5555555555",
        pendingPointsDelta: 0,
        availablePointsDelta: -25,
        pendingPointsBalanceAfter: 25,
        availablePointsBalanceAfter: -25,
      })]),
      totalCount: 1,
      page: Object.freeze({ limit: 50, offset: 0, hasMore: false }),
    }),
  }),
  referrals: Object.freeze({
    code: null,
    status: null,
    counts: Object.freeze({ attributed: 0, pending: 0, qualified: 0, reversed: 0 }),
    rewardPointsTotal: 0,
    conversions: emptyPaged,
  }),
  sharedSets: emptyPaged,
  affiliate: null,
});

describe("owner rewards route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps a blocked owner ledger readable while omitting mutation controls", async () => {
    loadOwnerGrowthDashboardMock.mockResolvedValue({
      status: "data",
      access: "blocked_read_capable",
      verifiedEmail: "owner@example.test",
      snapshot,
      projection: {
        loyalty: { status: "active" },
        referral: null,
        affiliate: null,
        terms: { rewards: { id: "terms-r", version: 3 }, partner: null },
      },
    });

    render(await RewardsPage());

    expect(screen.getByRole("heading", { level: 1, name: "Rewards" })).toBeVisible();
    expect(screen.getByText(/blocked account remains able to read/iu)).toBeVisible();
    expect(screen.getByText("ref:5555555555")).toBeVisible();
    expect(screen.queryByRole("button", { name: /redeem|buy|purchase/iu })).toBeNull();
  });

  it("denies unauthenticated access without querying user facts into the page", async () => {
    loadOwnerGrowthDashboardMock.mockResolvedValue({ status: "denied" });

    render(await RewardsPage());

    expect(screen.getByRole("heading", { name: "Rewards unavailable" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(document.body).not.toHaveTextContent(/owner@example\.test|ref:5555555555/iu);
  });

  it.each([
    ["inactive", "Rewards are not currently active for this account."],
    ["read_error", "Rewards could not be read safely. Please try again."],
  ])("renders the safe %s state", async (status, message) => {
    loadOwnerGrowthDashboardMock.mockResolvedValue(
      status === "inactive"
        ? { status, access: "owner", verifiedEmail: "owner@example.test" }
        : { status },
    );

    render(await RewardsPage());

    expect(screen.getByText(message)).toBeVisible();
    expect(document.body).not.toHaveTextContent(/\$\d+|\d+ points per/iu);
  });
});
