import type { Metadata } from "next";
import Link from "next/link";

import { SIGN_IN_ROUTE } from "@/auth/routes";
import { AffiliateDashboard } from "@/components/growth/affiliate-dashboard";
import { applyOwnerAffiliateAction } from "@/growth/owner-action-forms";
import { loadOwnerGrowthDashboard } from "@/growth/owner-growth-server";

export const metadata: Metadata = { title: "Partner" };

export default async function PartnerPage() {
  const result = await loadOwnerGrowthDashboard();
  if (result.status === "denied") {
    return (
      <section className="error-record" role="alert">
        <p className="eyebrow">Owner partner record</p>
        <h1 className="mt-4 font-heading text-page leading-[0.95]">Partner unavailable</h1>
        <p className="mt-5 text-base leading-7">A current verified owner identity is required.</p>
        <Link className="record-link mt-5 inline-flex min-h-11 items-center" href={SIGN_IN_ROUTE}>Sign in</Link>
      </section>
    );
  }
  if (result.status === "read_error") {
    return (
      <section className="error-record" role="alert">
        <h1 className="font-heading text-page leading-[0.95]">Partner unavailable</h1>
        <p className="mt-5 text-base leading-7">Partner records could not be read safely. Please try again.</p>
      </section>
    );
  }
  return (
    <div className="max-w-5xl">
      <p className="eyebrow">Owner growth record</p>
      <h1 className="mt-4 font-heading text-page leading-[0.95]">Partner</h1>
      <p className="mt-5 max-w-3xl text-base leading-7 text-muted-ink">
        Apply with one bounded public channel or review your private partner, commission, and payout history.
      </p>
      {result.status === "inactive" ? (
        <div className="empty-record mt-8">The partner program is not currently active for this account.</div>
      ) : (
        <div className="mt-8">
          <AffiliateDashboard
            affiliate={result.snapshot.affiliate}
            policy={result.projection.affiliate}
            terms={result.projection.terms.partner}
            verifiedEmail={result.verifiedEmail}
            blocked={result.access === "blocked_read_capable"}
            readOnly={result.access !== "owner"}
            action={applyOwnerAffiliateAction}
          />
        </div>
      )}
    </div>
  );
}
