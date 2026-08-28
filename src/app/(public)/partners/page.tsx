import type { Metadata } from "next";
import { Handshake, Timer } from "lucide-react";
import Link from "next/link";

import { PageIntro } from "@/components/site/page-intro";
import { PageTransition } from "@/components/site/page-transition";
import { getPublicGrowthProjection } from "@/growth/public-growth-server";

export const metadata: Metadata = {
  title: "Partner Program",
  description: "Current PROPEPTIQ LABS Partner Program information.",
};

export default async function PartnersPage() {
  const projection = await getPublicGrowthProjection();
  const affiliate =
    projection?.affiliate?.status === "active" ? projection.affiliate : null;

  return (
    <PageTransition>
      <div className="site-container pb-20">
        <PageIntro
          eyebrow="Current program record"
          title="Partner Program"
          description="Program details appear only when an active server record is available."
        />
        {affiliate === null ? (
          <p className="record-sheet text-base leading-7 text-muted-ink">
            The Partner Program is not currently available.
          </p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            <section className="record-card" aria-labelledby="partner-attribution-heading">
              <Timer aria-hidden="true" className="size-5 text-moss" />
              <h2 id="partner-attribution-heading" className="mt-5 font-heading text-3xl text-ink">
                Attribution
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-ink">
                {affiliate.attributionDays}-day attribution window.
              </p>
              <p className="mt-2 text-base leading-7 text-muted-ink">
                {affiliate.reorderWindowDays}-day reorder window after the first qualified order.
              </p>
            </section>
            <section className="record-card" aria-labelledby="partner-commission-heading">
              <Handshake aria-hidden="true" className="size-5 text-moss" />
              <h2 id="partner-commission-heading" className="mt-5 font-heading text-3xl text-ink">
                Commission record
              </h2>
              <p className="mt-4 text-base leading-7 text-muted-ink">
                {affiliate.firstOrderCommissionBasisPoints / 100}% on a first eligible order.
              </p>
              <p className="mt-2 text-base leading-7 text-muted-ink">
                Approval and payout remain governed by the current policy and terms.
              </p>
            </section>
          </div>
        )}
        {affiliate && projection?.terms.partner ? (
          <Link
            className="record-link mt-8 inline-flex min-h-11 items-center"
            href="/partners/terms"
          >
            Read current partner terms
          </Link>
        ) : null}
      </div>
    </PageTransition>
  );
}
