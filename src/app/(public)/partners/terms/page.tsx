import type { Metadata } from "next";

import { PublicTermsRecord } from "@/components/growth/public-terms";
import { PageTransition } from "@/components/site/page-transition";
import { getPublicGrowthProjection } from "@/growth/public-growth-server";

export const metadata: Metadata = { title: "Partner terms" };

export default async function PartnersTermsPage() {
  const projection = await getPublicGrowthProjection();
  return (
    <PageTransition>
      <PublicTermsRecord
        backHref="/partners"
        backLabel="Back to Partner Program"
        terms={projection?.terms.partner ?? null}
        title="Partner terms"
        unavailableMessage="Current partner terms are unavailable."
      />
    </PageTransition>
  );
}
