import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LoyaltyPolicy } from "@/domain/rewards";

import { ProgramStrip } from "./program-strip";

const activePolicy: LoyaltyPolicy = {
  id: "loyalty-active",
  version: 3,
  status: "active",
  pointsPerDollar: 2,
  redemptionMinorPerPoint: 1,
  minimumRedemptionPoints: 500,
  maximumRedemptionBasisPoints: 2_500,
  expiresAfterDays: null,
  effectiveAt: "2026-08-27T00:00:00.000Z",
  supersededAt: null,
};

describe("ProgramStrip", () => {
  it("renders one restrained active-policy message from the injected projection", () => {
    render(<ProgramStrip loyaltyPolicy={activePolicy} />);
    const strip = screen.getByRole("region", { name: "Active rewards program" });
    expect(strip).toHaveTextContent("Earn 2 points per eligible dollar");
    expect(screen.getByRole("link", { name: "View rewards" })).toHaveAttribute(
      "href",
      "/rewards",
    );
  });

  it("renders nothing for unavailable or inactive policy data", () => {
    const { rerender } = render(<ProgramStrip loyaltyPolicy={null} />);
    expect(screen.queryByRole("region", { name: "Active rewards program" })).toBeNull();

    rerender(<ProgramStrip loyaltyPolicy={{ ...activePolicy, status: "draft" }} />);
    expect(screen.queryByRole("region", { name: "Active rewards program" })).toBeNull();
  });
});
