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
    </PageTransition>
  );
}
