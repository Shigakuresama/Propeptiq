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

import PartnersPage from "./page";

describe("public partner page", () => {
  it("shows a truthful unavailable state when no active server projection exists", async () => {
    getPublicGrowthProjectionMock.mockResolvedValue(null);

    render(await PartnersPage());

    expect(screen.getByRole("heading", { level: 1, name: "Partner Program" })).toBeVisible();
    expect(screen.getByText("The Partner Program is not currently available.")).toBeVisible();
    expect(document.body).not.toHaveTextContent(/\d+\s*(?:%|days)|\$\d+/iu);
  });

  it("renders only active affiliate values from the server projection", async () => {
    getPublicGrowthProjectionMock.mockResolvedValue({
      loyalty: null,
      referral: null,
      affiliate: {
        status: "active",
        attributionDays: 23,
        firstOrderCommissionBasisPoints: 825,
        reorderCommissionBasisPoints: 325,
        reorderWindowDays: 140,
        approvalDelayDays: 17,
        payoutThresholdMinor: 7_500,
        currency: "USD",
      },
      terms: { rewards: null, partner: { version: 4 } },
    });

    render(await PartnersPage());

    expect(screen.getByText("23-day attribution window.")).toBeVisible();
    expect(screen.getByText("8.25% on a first eligible order.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Read current partner terms" })).toHaveAttribute(
      "href",
      "/partners/terms",
    );
    expect(screen.queryByText("The Partner Program is not currently available.")).toBeNull();
  });
});
