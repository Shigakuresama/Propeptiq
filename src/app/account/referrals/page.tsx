import type { Metadata } from "next";
import Link from "next/link";

import { SIGN_IN_ROUTE } from "@/auth/routes";
import { ReferralDashboard } from "@/components/growth/referral-dashboard";
import { activateOwnerReferralAction } from "@/growth/owner-action-forms";
import { loadOwnerGrowthDashboard } from "@/growth/owner-growth-server";

export const metadata: Metadata = { title: "Referrals" };

export default async function ReferralsPage() {
  const result = await loadOwnerGrowthDashboard();
  if (result.status === "denied") {
    return (
      <section className="error-record" role="alert">
        <p className="eyebrow">Owner referrals</p>
        <h1 className="mt-4 font-heading text-page leading-[0.95]">Referrals unavailable</h1>
        <p className="mt-5 text-base leading-7">A current verified owner identity is required.</p>
        <Link className="record-link mt-5 inline-flex min-h-11 items-center" href={SIGN_IN_ROUTE}>Sign in</Link>
      </section>
    );
  }
  if (result.status === "read_error") {
    return (
      <section className="error-record" role="alert">
        <h1 className="font-heading text-page leading-[0.95]">Referrals unavailable</h1>
        <p className="mt-5 text-base leading-7">Referrals could not be read safely. Please try again.</p>
      </section>
    );
  }
  return (
    <div className="max-w-5xl">
      <p className="eyebrow">Owner growth record</p>
      <h1 className="mt-4 font-heading text-page leading-[0.95]">Referrals</h1>
      <p className="mt-5 max-w-3xl text-base leading-7 text-muted-ink">
        This private dashboard shows only your code, aggregate counts, reward points, and redacted conversion references.
      </p>
      {result.syntheticLocal === true ? <p className="warning-record mt-6 text-base font-semibold">Synthetic local test only</p> : null}
      <Link className="record-link mt-5 inline-flex min-h-11 items-center" href="/research-sets">
        Manage research sets
      </Link>
      {result.status === "inactive" ? (
        <div className="empty-record mt-8">Referrals are not currently active for this account.</div>
      ) : (
        <div className="mt-8">
          <ReferralDashboard
            referrals={result.snapshot.referrals}
            policy={result.projection.referral}
            terms={result.projection.terms.rewards}
            blocked={result.access === "blocked_read_capable"}
            readOnly={result.access !== "owner"}
            action={activateOwnerReferralAction}
          />
        </div>
      )}
    </div>
  );
}
