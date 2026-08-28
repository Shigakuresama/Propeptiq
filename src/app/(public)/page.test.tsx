import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const { getPublicBrowseCatalogMock, getPublicGrowthProjectionMock } = vi.hoisted(() => ({
  getPublicBrowseCatalogMock: vi.fn(),
  getPublicGrowthProjectionMock: vi.fn(),
}));

vi.mock("@/catalog/browse-catalog-server", () => ({
  getPublicBrowseCatalog: getPublicBrowseCatalogMock,
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

describe("public home growth projection", () => {
  it("shows the program strip only from an active server projection", async () => {
    getPublicBrowseCatalogMock.mockResolvedValue({ products: [], variantCount: 103 });
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

    expect(screen.getByRole("region", { name: "Active rewards program" })).toHaveTextContent(
      "Earn 2 points per eligible dollar",
    );
  });

  it.each(["inactive", "read_error"] as const)(
    "omits the program strip when the growth read is %s",
    async (status) => {
      getPublicBrowseCatalogMock.mockResolvedValue({ products: [], variantCount: 103 });
      getPublicGrowthProjectionMock.mockResolvedValue({ status });

      render(await HomePage());

      expect(screen.queryByRole("region", { name: "Active rewards program" })).toBeNull();
    },
  );
});
