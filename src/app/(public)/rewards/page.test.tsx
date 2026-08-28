import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const { getPublicGrowthProjectionMock } = vi.hoisted(() => ({
  getPublicGrowthProjectionMock: vi.fn(),
}));

vi.mock("@/growth/public-growth-server", () => ({
  getPublicGrowthProjection: getPublicGrowthProjectionMock,
}));

vi.mock("@/components/site/page-transition", () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import RewardsPage from "./page";

describe("public rewards page", () => {
  it("shows a truthful unavailable state when no active server projection exists", async () => {
    getPublicGrowthProjectionMock.mockResolvedValue({ status: "inactive" });

    render(await RewardsPage());

    expect(screen.getByRole("heading", { level: 1, name: "Rewards" })).toBeVisible();
    expect(screen.getByText("Rewards are not currently available.")).toBeVisible();
    expect(document.body).not.toHaveTextContent(/\d+\s*(?:points|%|days)|\$\d+/iu);
    expect(document.body).not.toHaveTextContent(/\b(?:purchase|buy)\s+points\b/iu);
  });

  it("renders only active loyalty and referral values from the server projection", async () => {
    getPublicGrowthProjectionMock.mockResolvedValue({
      status: "active",
      projection: {
        loyalty: {
          status: "active",
          pointsPerDollar: 7,
          redemptionMinorPerPoint: 2,
          minimumRedemptionPoints: 900,
          maximumRedemptionBasisPoints: 1_500,
          expiresAfterDays: null,
        },
        referral: {
          status: "active",
          attributionDays: 19,
          referredDiscountBasisPoints: 725,
          referredDiscountCapMinor: 1_800,
          referrerPointsPerDollar: 4,
          referrerRewardCapPoints: 1_700,
        },
        affiliate: null,
        terms: { rewards: { version: 3 }, partner: null },
      },
    });

    render(await RewardsPage());

    expect(screen.getByText("Earn 7 points per eligible dollar.")).toBeVisible();
    expect(screen.getByText("19-day referral attribution window.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Read current rewards terms" })).toHaveAttribute(
      "href",
      "/rewards/terms",
    );
    expect(screen.queryByText("Rewards are not currently available.")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Earn points" })).toBeVisible();
    expect(document.body).not.toHaveTextContent(/\b(?:purchase|buy)\s+points\b/iu);
  });

  it("shows a safe retry state without rates or terms when the public read fails", async () => {
    getPublicGrowthProjectionMock.mockResolvedValue({ status: "read_error" });

    render(await RewardsPage());

    expect(
      screen.getByText("Rewards are temporarily unavailable. Please try again."),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent(/\d+\s*(?:points|%|days)|\$\d+/iu);
    expect(screen.queryByRole("link", { name: "Read current rewards terms" })).toBeNull();
    expect(document.body).not.toHaveTextContent(/\b(?:purchase|buy)\s+points\b/iu);
  });
});
