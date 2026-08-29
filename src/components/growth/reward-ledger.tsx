import {
  BadgeCheck,
  CircleCheck,
  Clock3,
  LockKeyhole,
  LockOpen,
  ReceiptText,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  UserRoundPlus,
  type LucideIcon,
} from "lucide-react";

import type { RewardLedgerKind } from "@/db/repositories/growth-repository";
import type { OwnerGrowthSnapshot } from "@/growth/read-model";

type LedgerItem = NonNullable<OwnerGrowthSnapshot["rewards"]>["ledger"]["items"][number];

type LedgerState = Readonly<{ label: string; Icon: LucideIcon }>;

const entryStates = Object.freeze({
  order_earned_pending: Object.freeze({ label: "Order points pending", Icon: Clock3 }),
  order_earned_available: Object.freeze({ label: "Order points available", Icon: CircleCheck }),
  referral_earned_pending: Object.freeze({ label: "Referral points pending", Icon: UserRoundPlus }),
  referral_earned_available: Object.freeze({ label: "Referral points available", Icon: BadgeCheck }),
  redemption_reserved: Object.freeze({ label: "Redemption reserved", Icon: LockKeyhole }),
  redemption_consumed: Object.freeze({ label: "Redemption consumed", Icon: ReceiptText }),
  redemption_released: Object.freeze({ label: "Redemption released", Icon: LockOpen }),
  refund_reversal: Object.freeze({ label: "Refund reversal", Icon: RotateCcw }),
  chargeback_reversal: Object.freeze({ label: "Chargeback reversal", Icon: ShieldAlert }),
  admin_adjustment: Object.freeze({ label: "Administrative adjustment", Icon: SlidersHorizontal }),
}) satisfies Readonly<Record<RewardLedgerKind, LedgerState>>;

function entryState(item: LedgerItem): LedgerState {
  return entryStates[item.kind];
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
