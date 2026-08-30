import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

type RewardsIdentityFixture = Readonly<{
  environment: Readonly<{ AUTH_MODE: "disabled" | "test" }>;
  identity: Readonly<{
    clerkUserId: string;
    primaryEmail: string | null;
    emailVerifiedAt: string | null;
    mfaConfigured: boolean;
    secondFactorCompleted: boolean;
  }> | null;
  principal: null;
  localDriver: null;
}>;

const { getPublicGrowthProjectionMock, getRequestIdentityMock } = vi.hoisted(() => ({
  getPublicGrowthProjectionMock: vi.fn(),
  getRequestIdentityMock: vi.fn<() => Promise<RewardsIdentityFixture>>(
    async () => ({
      environment: { AUTH_MODE: "test" },
      identity: null,
      principal: null,
      localDriver: null,
    }),
  ),
}));

vi.mock("@/growth/public-growth-server", () => ({
  getPublicGrowthProjection: getPublicGrowthProjectionMock,
}));

vi.mock("@/auth/server", () => ({
  getRequestIdentity: getRequestIdentityMock,
}));

vi.mock("@/components/site/page-transition", () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import RewardsPage from "./page";

const publicRewardFactPattern =
  /(?:\b\d[\d,]*(?:-|\s+)(?:point|points|day|days)\b|\b\d+(?:\.\d+)?\s*%|\$\s*\d)/iu;

describe("public rewards page", () => {
  it("shows a truthful unavailable state when no active server projection exists", async () => {
    getPublicGrowthProjectionMock.mockResolvedValue({ status: "inactive" });

    render(await RewardsPage());

    expect(screen.getByRole("heading", { level: 1, name: "Rewards" })).toBeVisible();
    expect(screen.getByText("Rewards are not currently available.")).toBeVisible();
    expect(screen.getByText("No active public record")).toBeVisible();
    expect(screen.getByRole("complementary", { name: "Rewards policy status" })).toHaveAttribute(
      "data-status",
      "inactive",
    );
    expect(screen.queryByRole("link", { name: "Create account" })).toBeNull();
    expect(document.body).not.toHaveTextContent(publicRewardFactPattern);
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
    expect(screen.getByText("Active policy signal")).toBeVisible();
    expect(screen.getByText("Loyalty record active")).toBeVisible();
    expect(screen.getByText("Referral record active")).toBeVisible();
    expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute(
      "href",
      "/sign-up?returnTo=%2Faccount%2Frewards",
    );
    expect(screen.getByRole("link", { name: "Read current rewards terms" })).toHaveAttribute(
      "href",
      "/rewards/terms",
    );
    expect(screen.queryByText("Rewards are not currently available.")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Earn points" })).toBeVisible();
    expect(document.body).not.toHaveTextContent(/\b(?:purchase|buy)\s+points\b/iu);
  });

  it("omits referral claims when only the loyalty record is active", async () => {
    getPublicGrowthProjectionMock.mockResolvedValue({
      status: "active",
      projection: {
        loyalty: {
          status: "active",
          pointsPerDollar: 5,
          redemptionMinorPerPoint: 1,
          minimumRedemptionPoints: 750,
          maximumRedemptionBasisPoints: 1_000,
          expiresAfterDays: null,
        },
        referral: null,
        affiliate: null,
        terms: { rewards: { version: 4 }, partner: null },
      },
    });

    render(await RewardsPage());

    expect(screen.getByText("Loyalty record active")).toBeVisible();
    expect(screen.queryByText("Referral record active")).toBeNull();
    expect(screen.getByRole("heading", { name: "Earn points" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Research referrals" })).toBeNull();
    expect(screen.getByRole("link", { name: "Create account" })).toBeVisible();
  });

  it("omits loyalty claims when only the referral record is active", async () => {
    getPublicGrowthProjectionMock.mockResolvedValue({
      status: "active",
      projection: {
        loyalty: null,
        referral: {
          status: "active",
          attributionDays: 14,
          referredDiscountBasisPoints: 500,
          referredDiscountCapMinor: 1_500,
          referrerPointsPerDollar: 3,
          referrerRewardCapPoints: 1_200,
        },
        affiliate: null,
        terms: { rewards: { version: 5 }, partner: null },
      },
    });

    render(await RewardsPage());

    expect(screen.getByText("Referral record active")).toBeVisible();
    expect(screen.queryByText("Loyalty record active")).toBeNull();
    expect(screen.getByRole("heading", { name: "Research referrals" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Earn points" })).toBeNull();
    expect(screen.getByRole("link", { name: "Create account" })).toBeVisible();
  });

  it("keeps actions and values hidden when an active projection has no active reward module", async () => {
    getPublicGrowthProjectionMock.mockResolvedValue({
      status: "active",
      projection: {
        loyalty: null,
        referral: null,
        affiliate: null,
        terms: { rewards: { version: 6 }, partner: null },
      },
    });

    render(await RewardsPage());

    expect(screen.getByText("Rewards are not currently available.")).toBeVisible();
    expect(screen.getByText("No active public record")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Create account" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Read current rewards terms" })).toBeNull();
    expect(document.body).not.toHaveTextContent(publicRewardFactPattern);
  });

  it("does not offer account creation when managed authentication is disabled", async () => {
    getRequestIdentityMock.mockResolvedValueOnce({
      environment: { AUTH_MODE: "disabled" },
      identity: null,
      principal: null,
      localDriver: null,
    });
    getPublicGrowthProjectionMock.mockResolvedValue({
      status: "active",
      projection: {
        loyalty: {
          status: "active",
          pointsPerDollar: 2,
          redemptionMinorPerPoint: 1,
          minimumRedemptionPoints: 500,
          maximumRedemptionBasisPoints: 2_500,
          expiresAfterDays: null,
        },
        referral: null,
        affiliate: null,
        terms: { rewards: { version: 7 }, partner: null },
      },
    });

    render(await RewardsPage());

    expect(screen.queryByRole("link", { name: "Create account" })).toBeNull();
    expect(screen.getByRole("link", { name: "Read current rewards terms" })).toBeVisible();
  });

  it("sends a verified account directly to its private rewards record", async () => {
    getRequestIdentityMock.mockResolvedValueOnce({
      environment: { AUTH_MODE: "test" },
      identity: {
        clerkUserId: "neon-user-verified",
        primaryEmail: "researcher@example.test",
        emailVerifiedAt: "2026-08-30T00:00:00.000Z",
        mfaConfigured: false,
        secondFactorCompleted: false,
      },
      principal: null,
      localDriver: null,
    });
    getPublicGrowthProjectionMock.mockResolvedValue({
      status: "active",
      projection: {
        loyalty: {
          status: "active",
          pointsPerDollar: 2,
          redemptionMinorPerPoint: 1,
          minimumRedemptionPoints: 500,
          maximumRedemptionBasisPoints: 2_500,
          expiresAfterDays: null,
        },
        referral: null,
        affiliate: null,
        terms: { rewards: { version: 7 }, partner: null },
      },
    });

    render(await RewardsPage());

    expect(screen.getByRole("link", { name: "View your rewards" })).toHaveAttribute(
      "href",
      "/account/rewards",
    );
    expect(screen.queryByRole("link", { name: "Create account" })).toBeNull();
  });

  it("sends an unverified identity to verification before private rewards", async () => {
    getRequestIdentityMock.mockResolvedValueOnce({
      environment: { AUTH_MODE: "test" },
      identity: {
        clerkUserId: "neon-user-unverified",
        primaryEmail: "researcher@example.test",
        emailVerifiedAt: null,
        mfaConfigured: false,
        secondFactorCompleted: false,
      },
      principal: null,
      localDriver: null,
    });
    getPublicGrowthProjectionMock.mockResolvedValue({
      status: "active",
      projection: {
        loyalty: null,
        referral: {
          status: "active",
          attributionDays: 14,
          referredDiscountBasisPoints: 500,
          referredDiscountCapMinor: 1_500,
          referrerPointsPerDollar: 3,
          referrerRewardCapPoints: 1_200,
        },
        affiliate: null,
        terms: { rewards: { version: 5 }, partner: null },
      },
    });

    render(await RewardsPage());

    expect(screen.getByRole("link", { name: "Verify account" })).toHaveAttribute(
      "href",
      "/sign-in?returnTo=%2Faccount%2Frewards",
    );
    expect(screen.queryByRole("link", { name: "Create account" })).toBeNull();
  });

  it("shows a safe retry state without rates or terms when the public read fails", async () => {
    getPublicGrowthProjectionMock.mockResolvedValue({ status: "read_error" });

    render(await RewardsPage());

    expect(
      screen.getByText("Rewards are temporarily unavailable. Please try again."),
    ).toBeVisible();
    expect(screen.getByText("Public record unavailable")).toBeVisible();
    expect(screen.getByRole("complementary", { name: "Rewards policy status" })).toHaveAttribute(
      "data-status",
      "read_error",
    );
    expect(document.body).not.toHaveTextContent(publicRewardFactPattern);
    expect(screen.queryByRole("link", { name: "Create account" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Read current rewards terms" })).toBeNull();
    expect(document.body).not.toHaveTextContent(/\b(?:purchase|buy)\s+points\b/iu);
  });
});
