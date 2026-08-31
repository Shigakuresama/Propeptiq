import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { testPricingContext } from "@/components/commerce/storefront-test-fixtures";

const { getPublicStorefrontViewMock, getPublicGrowthProjectionMock } = vi.hoisted(() => ({
  getPublicStorefrontViewMock: vi.fn(),
  getPublicGrowthProjectionMock: vi.fn(),
}));

vi.mock("@/catalog/storefront-public-server", () => ({
  getPublicStorefrontView: getPublicStorefrontViewMock,
}));
vi.mock("@/growth/public-growth-server", () => ({
  getPublicGrowthProjection: getPublicGrowthProjectionMock,
}));
vi.mock("@/components/site/page-transition", () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import HomePage from "./page";

const activeLoyaltyPolicy = {
  id: "loyalty-active",
  version: 3,
  status: "active" as const,
  pointsPerDollar: 2,
  redemptionMinorPerPoint: 1,
  minimumRedemptionPoints: 500,
  maximumRedemptionBasisPoints: 2_500,
  expiresAfterDays: null,
  effectiveAt: "2026-08-27T00:00:00.000Z",
  supersededAt: null,
};

const activeReferralPolicy = {
  id: "referral-active",
  version: 2,
  status: "active" as const,
  attributionDays: 30 as const,
  referredDiscountBasisPoints: 1_000,
  referredDiscountCapMinor: 2_500,
  referrerPointsPerDollar: 5,
  referrerRewardCapPoints: 2_500,
  effectiveAt: "2026-08-27T00:00:00.000Z",
  supersededAt: null,
};

describe("public home growth projection", () => {
  const pricing = testPricingContext("test");

  it("shows the program strip only from an active server projection", async () => {
    getPublicStorefrontViewMock.mockResolvedValue({
      catalog: { products: [], displayConfigurationCount: 103 },
      pricing,
    });
    getPublicGrowthProjectionMock.mockResolvedValue({
      status: "active",
      projection: {
        loyalty: activeLoyaltyPolicy,
        referral: activeReferralPolicy,
        affiliate: null,
        terms: { rewards: null, partner: null },
      },
    });

    render(await HomePage());

    expect(screen.getByRole("region", { name: "Active rewards program" })).toHaveTextContent(
      "Earn 2 points per eligible dollar",
    );
    const explainer = screen.getByRole("region", { name: "Growth programs" });
    expect(explainer).toHaveTextContent("Earn points");
    expect(explainer).toHaveTextContent("Refer a lab");
    expect(explainer).toHaveTextContent("Share a research set");
    expect(within(explainer).getByRole("link", { name: "Earn points" })).toHaveAttribute("href", "/rewards");
    expect(within(explainer).getByRole("link", { name: "Refer a lab" })).toHaveAttribute("href", "/account/referrals");
    expect(within(explainer).getByRole("link", { name: "Share a research set" })).toHaveAttribute("href", "/research-sets");
    expect(explainer).not.toHaveTextContent(/\$|%|save|member|limited|hurry|popular/iu);
    expect(getPublicStorefrontViewMock).toHaveBeenCalledTimes(1);
    const highlights = screen.getByText("Catalog highlights");
    const quality = screen.getByRole("heading", { name: "Follow the record, not an unsupported claim." });
    expect(highlights.compareDocumentPosition(explainer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(explainer.compareDocumentPosition(quality) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("omits referral and shared-set entries when only loyalty is active", async () => {
    getPublicStorefrontViewMock.mockResolvedValue({
      catalog: { products: [], displayConfigurationCount: 103 },
      pricing,
    });
    getPublicGrowthProjectionMock.mockResolvedValue({
      status: "active",
      projection: {
        loyalty: activeLoyaltyPolicy,
        referral: null,
        affiliate: null,
        terms: { rewards: null, partner: null },
      },
    });

    render(await HomePage());

    const explainer = screen.getByRole("region", { name: "Growth programs" });
    expect(within(explainer).getByRole("link", { name: "Earn points" })).toBeVisible();
    expect(within(explainer).queryByRole("link", { name: "Refer a lab" })).toBeNull();
    expect(within(explainer).queryByRole("link", { name: "Share a research set" })).toBeNull();
  });

  it.each(["inactive", "read_error"] as const)(
    "omits the program strip when the growth read is %s",
    async (status) => {
      getPublicStorefrontViewMock.mockResolvedValue({
        catalog: { products: [], displayConfigurationCount: 103 },
        pricing,
      });
      getPublicGrowthProjectionMock.mockResolvedValue({ status });

      render(await HomePage());

      expect(screen.queryByRole("region", { name: "Active rewards program" })).toBeNull();
      expect(screen.queryByRole("region", { name: "Growth programs" })).toBeNull();
    },
  );
});
