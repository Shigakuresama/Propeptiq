import type { Metadata } from "next";

import { PublicTermsRecord } from "@/components/growth/public-terms";
import { PageTransition } from "@/components/site/page-transition";
import { getPublicGrowthProjection } from "@/growth/public-growth-server";

export const metadata: Metadata = { title: "Rewards terms" };

export default async function RewardsTermsPage() {
  const result = await getPublicGrowthProjection();
  const projection = result.status === "active" ? result.projection : null;
  return (
    <PageTransition>
      <div>
        {result.syntheticLocal === true ? (
          <div className="site-container pt-5"><p className="warning-record text-base font-semibold">Synthetic local test only</p></div>
        ) : null}
        <PublicTermsRecord
          backHref="/rewards"
          backLabel="Back to Rewards"
          terms={projection?.terms.rewards ?? null}
          title="Rewards terms"
          unavailableMessage={
            result.status === "read_error"
              ? "Current rewards terms are temporarily unavailable. Please try again."
              : "Current rewards terms are unavailable."
          }
        />
      </div>
    </PageTransition>
  );
}
