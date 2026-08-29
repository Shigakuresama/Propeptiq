import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadOwnerGrowthDashboardMock } = vi.hoisted(() => ({
  loadOwnerGrowthDashboardMock: vi.fn(),
}));

vi.mock("@/growth/owner-growth-server", () => ({
  loadOwnerGrowthDashboard: loadOwnerGrowthDashboardMock,
}));

import PartnerPage from "./page";

const emptyPaged = Object.freeze({ items: Object.freeze([]), totalCount: 0, page: Object.freeze({ limit: 50, offset: 0, hasMore: false }) });
const baseSnapshot = Object.freeze({
  rewards: null,
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
const projection = Object.freeze({
  loyalty: null,
  referral: null,
  affiliate: Object.freeze({ attributionDays: 30, reorderWindowDays: 180, approvalDelayDays: 30, payoutThresholdMinor: 5_000, currency: "USD" }),
  terms: Object.freeze({ rewards: null, partner: Object.freeze({ id: "79000000-0000-4000-8000-000000000001", version: 4 }) }),
});

describe("owner partner route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders suspended private summaries without referred identity or payout controls", async () => {
    loadOwnerGrowthDashboardMock.mockResolvedValue({
      status: "data",
      access: "owner",
      verifiedEmail: "owner@example.test",
      snapshot: Object.freeze({
        ...baseSnapshot,
        affiliate: Object.freeze({
          publicCode: "aff_PrivateRouteCode1234",
          status: "suspended",
          publicChannel: "@research_records",
          promotionMethod: "social",
          attributedCount: 3,
          commissionTotalsMinor: Object.freeze({ pending: 500, approved: 1_500, paid: 5_000, reversed: 250 }),
          payoutTotalsMinor: Object.freeze({ pending: 1_500, paid: 5_000 }),
        }),
      }),
      projection,
    });

    render(await PartnerPage());

    expect(screen.getByRole("heading", { level: 1, name: "Partner" })).toBeVisible();
    expect(screen.getByText("Suspended")).toBeVisible();
    expect(screen.getByText("$2.50")).toBeVisible();
    expect(document.body).not.toHaveTextContent(/owner@example\.test|address|order line|payment id/iu);
    expect(screen.queryByRole("button", { name: /pay|send|transfer/iu })).toBeNull();
  });

  it("offers the bounded application only to an active verified owner", async () => {
    loadOwnerGrowthDashboardMock.mockResolvedValue({ status: "empty", access: "owner", verifiedEmail: "owner@example.test", snapshot: baseSnapshot, projection });

    render(await PartnerPage());

    expect(screen.getByRole("form", { name: "Apply for partner program" })).toBeVisible();
    expect(screen.getByLabelText("Verified email")).toHaveValue("owner@example.test");
  });

  it("keeps review owners read-only instead of presenting an application", async () => {
    loadOwnerGrowthDashboardMock.mockResolvedValue({ status: "empty", access: "read_only_owner", verifiedEmail: "owner@example.test", snapshot: baseSnapshot, projection });

    render(await PartnerPage());

    expect(screen.getByText(/applications require an active buyer account/iu)).toBeVisible();
    expect(screen.queryByRole("form", { name: "Apply for partner program" })).toBeNull();
  });

  it.each([
    ["denied", "Partner unavailable"],
    ["read_error", "Partner records could not be read safely. Please try again."],
    ["inactive", "The partner program is not currently active for this account."],
  ])("renders the safe %s state", async (status, message) => {
    loadOwnerGrowthDashboardMock.mockResolvedValue(
      status === "inactive" ? { status, access: "owner", verifiedEmail: "owner@example.test" } : { status },
    );

    render(await PartnerPage());

    expect(screen.getByText(message)).toBeVisible();
  });
});
