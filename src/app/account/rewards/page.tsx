import type { Metadata } from "next";
import { Gift } from "lucide-react";
import Link from "next/link";

import { SIGN_IN_ROUTE } from "@/auth/routes";
import { DataLabel, EmptyState } from "@/components/design-system/archive-primitives";
import { RewardLedger } from "@/components/growth/reward-ledger";
import { RewardsSummary } from "@/components/growth/rewards-summary";
import { loadOwnerGrowthDashboard } from "@/growth/owner-growth-server";

export const metadata: Metadata = { title: "Rewards" };

function Unavailable({ readError = false }: { readError?: boolean }) {
  return (
    <section className="error-record" role="alert">
      <p className="eyebrow">Owner rewards</p>
      <h1 className="mt-4 font-heading text-page leading-[0.95]">Rewards unavailable</h1>
      <p className="mt-5 text-base leading-7">
        {readError
          ? "Rewards could not be read safely. Please try again."
          : "A current verified owner identity is required."}
      </p>
      {!readError ? (
        <Link className="record-link mt-5 inline-flex min-h-11 items-center" href={SIGN_IN_ROUTE}>
          Sign in
        </Link>
      ) : null}
    </section>
  );
}

export default async function RewardsPage() {
  const result = await loadOwnerGrowthDashboard();
  if (result.status === "denied") return <Unavailable />;
  if (result.status === "read_error") return <Unavailable readError />;

  return (
    <div className="max-w-5xl">
      <DataLabel>Owner growth record</DataLabel>
      <h1 className="mt-4 font-heading text-page leading-[0.95]">Rewards</h1>
      <p className="mt-5 max-w-3xl text-base leading-7 text-muted-ink">
        Available and pending balances come from the authenticated owner ledger. Entries are immutable and references are redacted.
      </p>
      {result.syntheticLocal === true ? <p className="warning-record mt-6 text-base font-semibold">Synthetic local test only</p> : null}
      {result.access === "blocked_read_capable" ? (
        <div className="error-record mt-7" role="status">
          This blocked account remains able to read its own reward history. Growth mutations remain unavailable.
        </div>
      ) : null}
      {result.status === "inactive" ? (
        <EmptyState className="mt-8" description="No earning, redemption, or ledger action is available until an active server policy applies to this owner." eyebrow="Rewards ledger" icon={Gift} title="Rewards are not currently active for this account." />
      ) : result.snapshot.rewards === null ? (
        <EmptyState className="mt-8" description="Authoritative balance and immutable ledger entries will appear here when they exist." eyebrow="Rewards ledger" icon={Gift} title="No reward balance or ledger entries exist for this account." />
      ) : (
        <>
          <div className="mt-8"><RewardsSummary rewards={result.snapshot.rewards} /></div>
          {result.projection.loyalty ? (
            <section className="record-card mt-6" aria-labelledby="active-reward-rules">
              <p className="eyebrow">Active server rules</p>
              <h2 id="active-reward-rules" className="mt-3 font-heading text-3xl">How this balance works</h2>
              <ul className="mt-4 grid gap-2 text-base leading-7 text-muted-ink">
                <li>Earn {result.projection.loyalty.pointsPerDollar} points per eligible merchandise dollar.</li>
                <li>Minimum redemption: {result.projection.loyalty.minimumRedemptionPoints} points.</li>
                <li>Maximum order credit: {result.projection.loyalty.maximumRedemptionBasisPoints / 100}% of eligible merchandise after promotions.</li>
                <li>{result.projection.loyalty.expiresAfterDays === null ? "The active policy records no points expiry." : `Points expire after ${result.projection.loyalty.expiresAfterDays} days under the active policy.`}</li>
              </ul>
            </section>
          ) : null}
          <RewardLedger ledger={result.snapshot.rewards.ledger} />
        </>
      )}
    </div>
  );
}
