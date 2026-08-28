import type { Metadata } from "next";

import { PublicTermsRecord } from "@/components/growth/public-terms";
import { PageTransition } from "@/components/site/page-transition";
import { getPublicGrowthProjection } from "@/growth/public-growth-server";

export const metadata: Metadata = { title: "Rewards terms" };

export default async function RewardsTermsPage() {
  const projection = await getPublicGrowthProjection();
  return (
    <PageTransition>
      <PublicTermsRecord
        backHref="/rewards"
        backLabel="Back to Rewards"
        terms={projection?.terms.rewards ?? null}
        title="Rewards terms"
        unavailableMessage="Current rewards terms are unavailable."
      />
    </PageTransition>
  );
}
