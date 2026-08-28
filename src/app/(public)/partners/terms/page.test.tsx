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

import PartnersTermsPage from "./page";

describe("public partner terms page", () => {
  it("renders the exact current terms record", async () => {
    getPublicGrowthProjectionMock.mockResolvedValue({
      loyalty: null,
      referral: null,
      affiliate: null,
      terms: {
        rewards: null,
        partner: {
          version: 5,
          effectiveAt: "2026-08-27T00:00:00.000Z",
          termsText: "Server-projected partner terms.",
        },
      },
    });

    render(await PartnersTermsPage());
    expect(screen.getByRole("heading", { level: 1, name: "Partner terms" })).toBeVisible();
    expect(screen.getByText("Server-projected partner terms.")).toBeVisible();
    expect(screen.getByText("Version 5")).toBeVisible();
  });

  it("fails closed when current terms are unavailable", async () => {
    getPublicGrowthProjectionMock.mockResolvedValue(null);
    render(await PartnersTermsPage());
    expect(screen.getByText("Current partner terms are unavailable.")).toBeVisible();
  });
});
