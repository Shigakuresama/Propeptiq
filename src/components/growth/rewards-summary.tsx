import { CircleDollarSign, Clock3 } from "lucide-react";

import type { OwnerGrowthSnapshot } from "@/growth/read-model";

function usd(amountMinor: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountMinor / 100);
}

export function RewardsSummary({
  rewards,
}: {
  rewards: NonNullable<OwnerGrowthSnapshot["rewards"]>;
}) {
  const { currentPoints, requiredPoints } = rewards.minimumRedemptionProgress;
  const progressPercent = requiredPoints > 0
    ? Math.min(100, Math.max(0, (currentPoints / requiredPoints) * 100))
    : 0;

  return (
    <section aria-labelledby="rewards-balance-heading">
      <p className="eyebrow">Owner balance</p>
      <h2 id="rewards-balance-heading" className="mt-3 font-heading text-3xl">
        Rewards balance
      </h2>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="record-card">
          <dt className="flex items-center gap-2 text-base font-semibold">
            <CircleDollarSign aria-hidden="true" className="size-5 text-moss" />
            Available points
          </dt>
          <dd className="mt-3 text-3xl font-semibold tabular-nums">{rewards.availablePoints}</dd>
          <p className="mt-2 text-base leading-7 text-muted-ink">
            Server-projected order credit: <span className="font-semibold text-ink">{usd(rewards.usdEquivalentMinor)}</span>
          </p>
        </div>
        <div className="record-card">
          <dt className="flex items-center gap-2 text-base font-semibold">
            <Clock3 aria-hidden="true" className="size-5 text-moss" />
            Pending points
          </dt>
          <dd className="mt-3 text-3xl font-semibold tabular-nums">{rewards.pendingPoints}</dd>
          <p className="mt-2 text-base leading-7 text-muted-ink">
            Pending points are not yet available for redemption.
          </p>
        </div>
      </dl>
      <div className="record-card mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-base font-semibold">Minimum redemption progress</p>
          <p className="text-base tabular-nums text-muted-ink">
            {currentPoints} / {requiredPoints}
          </p>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-label="Minimum redemption progress"
          aria-valuemin={0}
          aria-valuemax={requiredPoints}
          aria-valuenow={currentPoints}
          aria-valuetext={`${currentPoints} of ${requiredPoints} points toward the minimum redemption`}
        >
          <div className="h-full rounded-full bg-moss" style={{ width: `${progressPercent}%` }} />
        </div>
        <p className="mt-3 text-base leading-7 text-muted-ink">
          {currentPoints} of {requiredPoints} points toward the minimum redemption.
        </p>
      </div>
    </section>
  );
}
