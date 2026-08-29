import type { Metadata } from "next";

import { PublicTermsRecord } from "@/components/growth/public-terms";
import { PageTransition } from "@/components/site/page-transition";
import { getPublicGrowthProjection } from "@/growth/public-growth-server";

export const metadata: Metadata = { title: "Partner terms" };

export default async function PartnersTermsPage() {
  const result = await getPublicGrowthProjection();
  const projection = result.status === "active" ? result.projection : null;
  return (
    <PageTransition>
      <div>
        {result.syntheticLocal === true ? (
          <div className="site-container pt-5"><p className="warning-record text-base font-semibold">Synthetic local test only</p></div>
        ) : null}
        <PublicTermsRecord
          backHref="/partners"
          backLabel="Back to Partner Program"
          terms={projection?.terms.partner ?? null}
          title="Partner terms"
          unavailableMessage={
            result.status === "read_error"
              ? "Current partner terms are temporarily unavailable. Please try again."
              : "Current partner terms are unavailable."
          }
        />
      </div>
    </PageTransition>
  );
}
