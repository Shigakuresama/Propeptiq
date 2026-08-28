import type { Metadata } from "next";
import { BadgeCheck, Share2 } from "lucide-react";
import Link from "next/link";

import { PageIntro } from "@/components/site/page-intro";
import { PageTransition } from "@/components/site/page-transition";
import { getPublicGrowthProjection } from "@/growth/public-growth-server";

export const metadata: Metadata = {
  title: "Rewards",
  description: "Current PROPEPTIQ LABS rewards program information.",
};

export default async function RewardsPage() {
  const result = await getPublicGrowthProjection();
  const projection = result.status === "active" ? result.projection : null;
  const loyalty = projection?.loyalty?.status === "active" ? projection.loyalty : null;
  const referral = projection?.referral?.status === "active" ? projection.referral : null;
  const available = loyalty !== null || referral !== null;

  return (
    <PageTransition>
      <div className="site-container pb-20">
        <PageIntro
          eyebrow="Current program record"
          title="Rewards"
          description="Program details appear only when an active server record is available."
        />
        {result.status === "read_error" ? (
          <p className="record-sheet text-base leading-7 text-muted-ink" role="status">
            Rewards are temporarily unavailable. Please try again.
          </p>
        ) : !available ? (
          <p className="record-sheet text-base leading-7 text-muted-ink">
            Rewards are not currently available.
          </p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {loyalty ? (
              <section className="record-card" aria-labelledby="loyalty-heading">
                <BadgeCheck aria-hidden="true" className="size-5 text-moss" />
                <h2 id="loyalty-heading" className="mt-5 font-heading text-3xl text-ink">
                  Earn points
                </h2>
                <p className="mt-4 text-base leading-7 text-muted-ink">
                  Earn {loyalty.pointsPerDollar} points per eligible dollar.
                </p>
                <p className="mt-2 text-base leading-7 text-muted-ink">
                  Redemption begins at {loyalty.minimumRedemptionPoints.toLocaleString("en-US")} points and remains subject to the active policy at checkout.
                </p>
              </section>
            ) : null}
            {referral ? (
              <section className="record-card" aria-labelledby="referral-heading">
                <Share2 aria-hidden="true" className="size-5 text-moss" />
                <h2 id="referral-heading" className="mt-5 font-heading text-3xl text-ink">
                  Research referrals
                </h2>
                <p className="mt-4 text-base leading-7 text-muted-ink">
                  {referral.attributionDays}-day referral attribution window.
                </p>
                <p className="mt-2 text-base leading-7 text-muted-ink">
                  Rewards apply only after the qualifying lifecycle events defined by the current policy.
                </p>
              </section>
            ) : null}
          </div>
        )}
        {available && projection?.terms.rewards ? (
          <Link
            className="record-link mt-8 inline-flex min-h-11 items-center"
            href="/rewards/terms"
          >
            Read current rewards terms
          </Link>
        ) : null}
      </div>
    </PageTransition>
  );
}
