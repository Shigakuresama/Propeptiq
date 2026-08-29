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
      status: "active",
      projection: {
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
      },
    });

    render(await PartnersTermsPage());
    expect(screen.getByRole("heading", { level: 1, name: "Partner terms" })).toBeVisible();
    expect(screen.getByText("Server-projected partner terms.")).toBeVisible();
    expect(screen.getByText("Version 5")).toBeVisible();
    expect(screen.getByText("Effective August 27, 2026 (UTC)")).toBeVisible();
    expect(screen.getByText(/Effective August 27/)).toHaveAttribute(
      "datetime",
      "2026-08-27T00:00:00.000Z",
    );
  });

  it("fails closed when current terms are unavailable", async () => {
    getPublicGrowthProjectionMock.mockResolvedValue({ status: "inactive" });
    render(await PartnersTermsPage());
    expect(screen.getByText("Current partner terms are unavailable.")).toBeVisible();
  });

  it("distinguishes a safe read failure from an inactive terms record", async () => {
    getPublicGrowthProjectionMock.mockResolvedValue({ status: "read_error" });
    render(await PartnersTermsPage());
    expect(
      screen.getByText("Current partner terms are temporarily unavailable. Please try again."),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent(/Server-projected|Version \d+/iu);
  });
});
