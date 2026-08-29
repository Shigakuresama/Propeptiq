import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { OwnerGrowthSnapshot } from "@/growth/read-model";

const rewards = Object.freeze({
  pendingPoints: 80,
  availablePoints: -125,
  usdEquivalentMinor: -125,
  minimumRedemptionProgress: Object.freeze({ currentPoints: 0, requiredPoints: 500 }),
  ledger: Object.freeze({
    items: Object.freeze([
      Object.freeze({
        occurredAt: "2026-08-28T18:00:00.000Z",
        kind: "order_earned_pending",
        reference: "ref:1111111111",
        pendingPointsDelta: 80,
        availablePointsDelta: 0,
        pendingPointsBalanceAfter: 80,
        availablePointsBalanceAfter: -125,
      }),
      Object.freeze({
        occurredAt: "2026-08-27T18:00:00.000Z",
        kind: "order_earned_available",
        reference: "ref:2222222222",
        pendingPointsDelta: -40,
        availablePointsDelta: 40,
        pendingPointsBalanceAfter: 0,
        availablePointsBalanceAfter: 40,
      }),
      Object.freeze({
        occurredAt: "2026-08-26T18:00:00.000Z",
        kind: "refund_reversal",
        reference: "ref:3333333333",
        pendingPointsDelta: 0,
        availablePointsDelta: -165,
        pendingPointsBalanceAfter: 0,
        availablePointsBalanceAfter: -125,
      }),
      Object.freeze({
        occurredAt: "2026-08-25T18:00:00.000Z",
        kind: "admin_adjustment",
        reference: "ref:4444444444",
        pendingPointsDelta: 0,
        availablePointsDelta: 5,
        pendingPointsBalanceAfter: 0,
        availablePointsBalanceAfter: -120,
      }),
    ]),
    totalCount: 4,
    page: Object.freeze({ limit: 50, offset: 0, hasMore: false }),
  }),
}) satisfies NonNullable<OwnerGrowthSnapshot["rewards"]>;

describe("owner rewards dashboard", () => {
  it("renders server-projected available, pending, USD, and minimum progress semantics", async () => {
    const { RewardsSummary } = await import("./rewards-summary");

    render(<RewardsSummary rewards={rewards} />);

    expect(screen.getByText("-125", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("80", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("-$1.25")).toBeInTheDocument();
    const progress = screen.getByRole("progressbar", { name: "Minimum redemption progress" });
    expect(progress).toHaveAttribute("aria-valuenow", "0");
    expect(progress).toHaveAttribute("aria-valuemax", "500");
    expect(screen.getByText("0 of 500 points toward the minimum redemption.")).toBeInTheDocument();
  });

  it("keeps immutable redacted ledger rows readable with text and icon states", async () => {
    const { RewardLedger } = await import("./reward-ledger");

    render(<RewardLedger ledger={rewards.ledger} />);

    const ledger = screen.getByRole("list", { name: "Reward ledger" });
    expect(within(ledger).getByText("Pending")).toBeInTheDocument();
    expect(within(ledger).getByText("Reversed")).toBeInTheDocument();
    expect(within(ledger).getByText("Adjustment")).toBeInTheDocument();
    expect(within(ledger).getAllByText("Available")).toHaveLength(1);
    expect(within(ledger).getByText("ref:3333333333")).toBeInTheDocument();
    expect(within(ledger).getAllByText("-125").length).toBeGreaterThan(0);
    expect(Object.isFrozen(rewards)).toBe(true);
    expect(Object.isFrozen(rewards.ledger.items)).toBe(true);
  });
});
