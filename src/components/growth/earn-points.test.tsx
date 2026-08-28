import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LoyaltyPolicy } from "@/domain/rewards";

import { EarnPoints } from "./earn-points";

const activePolicy: LoyaltyPolicy = {
  id: "loyalty-active",
  version: 2,
  status: "active",
  pointsPerDollar: 2,
  redemptionMinorPerPoint: 1,
  minimumRedemptionPoints: 500,
  maximumRedemptionBasisPoints: 2_500,
  expiresAfterDays: null,
  effectiveAt: "2026-08-27T00:00:00.000Z",
  supersededAt: null,
};

describe("EarnPoints", () => {
  it("shows server-calculated points for a production USD product and one active policy", () => {
    render(
      <EarnPoints
        loyaltyPolicy={activePolicy}
        price={{ id: "price-1", amountMinor: 5_621, currency: "USD", version: 1 }}
        source="production"
      />,
    );
    expect(screen.getByText("Earn 112 points")).toBeVisible();
  });

  it.each([
    ["browse-only source", "synthetic-demo", activePolicy, "USD"],
    ["inactive policy", "production", { ...activePolicy, status: "draft" }, "USD"],
    ["non-USD price", "production", activePolicy, "CAD"],
  ] as const)("renders nothing for %s", (_label, source, loyaltyPolicy, currency) => {
    render(
      <EarnPoints
        loyaltyPolicy={loyaltyPolicy}
        price={{ id: "price-1", amountMinor: 5_621, currency, version: 1 }}
        source={source}
      />,
    );
    expect(screen.queryByText(/Earn \d+ points/)).toBeNull();
  });
});
