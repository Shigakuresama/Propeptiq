import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RewardLedgerKind } from "@/db/repositories/growth-repository";
import type { OwnerGrowthSnapshot } from "@/growth/read-model";

const rewardLedgerLabels = Object.freeze({
  order_earned_pending: "Order points pending",
  order_earned_available: "Order points available",
  referral_earned_pending: "Referral points pending",
  referral_earned_available: "Referral points available",
  redemption_reserved: "Redemption reserved",
  redemption_consumed: "Redemption consumed",
  redemption_released: "Redemption released",
  refund_reversal: "Refund reversal",
  chargeback_reversal: "Chargeback reversal",
  admin_adjustment: "Administrative adjustment",
}) satisfies Readonly<Record<RewardLedgerKind, string>>;

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

  it("keeps balances readable while omitting USD and minimum facts without an active policy", async () => {
    const { RewardsSummary } = await import("./rewards-summary");
    const rewardsWithoutPolicy = Object.freeze({
      ...rewards,
      usdEquivalentMinor: null,
      minimumRedemptionProgress: null,
    });

    render(<RewardsSummary rewards={rewardsWithoutPolicy} />);

    expect(screen.getByText("-125", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("80", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText(/no current USD equivalent is shown/iu)).toBeVisible();
    expect(screen.getByText(/minimum redemption progress is unavailable/iu)).toBeVisible();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("-$1.25")).toBeNull();
  });

  it("keeps immutable redacted ledger rows readable with text and icon states", async () => {
    const { RewardLedger } = await import("./reward-ledger");

    render(<RewardLedger ledger={rewards.ledger} />);

    const ledger = screen.getByRole("list", { name: "Reward ledger" });
    expect(within(ledger).getByText("Order points pending")).toBeInTheDocument();
    expect(within(ledger).getByText("Order points available")).toBeInTheDocument();
    expect(within(ledger).getByText("Refund reversal")).toBeInTheDocument();
    expect(within(ledger).getByText("Administrative adjustment")).toBeInTheDocument();
    expect(within(ledger).getByText("ref:3333333333")).toBeInTheDocument();
    expect(within(ledger).getAllByText("-125").length).toBeGreaterThan(0);
    expect(Object.isFrozen(rewards)).toBe(true);
    expect(Object.isFrozen(rewards.ledger.items)).toBe(true);
  });

  it("maps every real reward ledger kind to a distinct truthful text and icon state", async () => {
    const { RewardLedger } = await import("./reward-ledger");
    const entries = Object.entries(rewardLedgerLabels) as [RewardLedgerKind, string][];
    const ledger = Object.freeze({
      items: Object.freeze(entries.map(([kind], index) => Object.freeze({
        occurredAt: `2026-08-${String(28 - index).padStart(2, "0")}T18:00:00.000Z`,
        kind,
        reference: `ref:${String(index + 1).padStart(10, "0")}`,
        pendingPointsDelta: 0,
        availablePointsDelta: kind.includes("reversal") || kind === "redemption_reserved" ? -10 : 10,
        pendingPointsBalanceAfter: 0,
        availablePointsBalanceAfter: 100 - index * 10,
      }))),
      totalCount: entries.length,
      page: Object.freeze({ limit: 50, offset: 0, hasMore: false }),
    });

    render(<RewardLedger ledger={ledger} />);

    expect(new Set(Object.values(rewardLedgerLabels)).size).toBe(entries.length);
    for (const [index, [, label]] of entries.entries()) {
      const row = screen.getByText(`ref:${String(index + 1).padStart(10, "0")}`).closest("li");
      expect(row).not.toBeNull();
      expect(within(row!).getByText(label)).toBeInTheDocument();
      expect(row!.querySelector("svg")).not.toBeNull();
    }
    expect(Object.isFrozen(ledger.items)).toBe(true);
  });
});
