import { CircleCheck, Clock3, SlidersHorizontal, Undo2 } from "lucide-react";

import type { OwnerGrowthSnapshot } from "@/growth/read-model";

type LedgerItem = NonNullable<OwnerGrowthSnapshot["rewards"]>["ledger"]["items"][number];

function entryState(item: LedgerItem) {
  if (item.kind.includes("reversal") || item.kind.includes("refund") || item.kind.includes("chargeback")) {
    return { label: "Reversed", Icon: Undo2 };
  }
  if (item.kind.includes("adjustment")) return { label: "Adjustment", Icon: SlidersHorizontal };
  if (item.availablePointsDelta > 0) return { label: "Available", Icon: CircleCheck };
  if (item.pendingPointsDelta > 0) return { label: "Pending", Icon: Clock3 };
  return { label: "Adjustment", Icon: SlidersHorizontal };
}

export function RewardLedger({
  ledger,
}: {
  ledger: NonNullable<OwnerGrowthSnapshot["rewards"]>["ledger"];
}) {
  return (
    <section className="mt-10" aria-labelledby="reward-ledger-heading">
      <h2 id="reward-ledger-heading" className="font-heading text-3xl">Reward ledger</h2>
      {ledger.items.length === 0 ? (
        <div className="empty-record mt-5">No reward ledger entries exist for this account.</div>
      ) : (
        <ul className="mt-5 grid gap-4 p-0" aria-label="Reward ledger">
          {ledger.items.map((item) => {
            const { label, Icon } = entryState(item);
            return (
              <li key={`${item.occurredAt}-${item.reference}-${item.kind}`} className="record-card min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-base font-semibold">
                      <Icon aria-hidden="true" className="size-5 text-moss" />
                      {label}
                    </p>
                    <p className="mt-2 break-all text-base leading-7 text-muted-ink">{item.reference}</p>
                  </div>
                  <time className="text-base text-muted-ink" dateTime={item.occurredAt}>
                    {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(item.occurredAt))}
                  </time>
                </div>
                <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div><dt className="eyebrow">Pending change</dt><dd className="mt-2 text-xl tabular-nums">{item.pendingPointsDelta}</dd></div>
                  <div><dt className="eyebrow">Available change</dt><dd className="mt-2 text-xl tabular-nums">{item.availablePointsDelta}</dd></div>
                  <div><dt className="eyebrow">Pending balance</dt><dd className="mt-2 text-xl tabular-nums">{item.pendingPointsBalanceAfter}</dd></div>
                  <div><dt className="eyebrow">Available balance</dt><dd className="mt-2 text-xl tabular-nums">{item.availablePointsBalanceAfter}</dd></div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
