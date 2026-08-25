import { ArrowRight, FileCheck2, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { CatalogEmptyState } from "@/components/site/catalog-empty-state";
import { ProofRail } from "@/components/site/proof-rail";
import { SectionHeading } from "@/components/site/section-heading";
import { Button } from "@/components/ui/button";
import {
  accessSteps,
  plannedControls,
  researchRestrictions,
} from "@/lib/site-content";

export default function Home() {
  return (
    <main id="main-content">
      <section className="overflow-hidden border-b border-border">
        <div className="site-container grid min-h-[min(50rem,calc(100svh-7.75rem))] items-center gap-12 py-16 lg:grid-cols-[7fr_5fr] lg:gap-16 lg:py-24">
          <div className="motion-rise max-w-[52rem]">
            <p className="eyebrow">Evidence-governed research access</p>
            <h1 className="mt-6 text-balance font-heading text-display leading-[0.98] text-ink">
              Research materials, governed by evidence.
            </h1>
            <p className="mt-7 max-w-[64ch] text-pretty text-lg leading-8 text-muted-ink sm:text-xl">
              PROPEPTIQ LABS is being built for verified researchers and organizations,
              with product, destination, payment, and fulfillment decisions kept as
              separate, auditable gates.
            </p>

            <div className="mt-7 border-l-2 border-moss pl-4 text-sm leading-6 text-ink sm:text-base">
              <p>{researchRestrictions[0]}</p>
              <p>{researchRestrictions[1]}</p>
            </div>

            <div className="mt-9 flex flex-wrap gap-3">
              <Button
                asChild
                className="group h-12 rounded-full bg-ink px-6 text-canvas hover:bg-slate"
              >
                <Link href="/access">
                  Review researcher access
                  <ArrowRight
                    aria-hidden="true"
                    className="transition-transform duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transform-none"
                  />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-12 rounded-full border-ink/20 bg-transparent px-6 text-ink hover:bg-moss-soft/60"
              >
                <Link href="/quality-records">Explore evidence policy</Link>
              </Button>
            </div>
          </div>

          <div className="record-composition motion-rise motion-delay" aria-label="Public record state">
            <div aria-hidden="true" className="record-sheet record-sheet-back" />
            <div className="record-sheet relative">
              <div className="flex items-start justify-between gap-5 border-b border-border pb-5">
                <div>
                  <p className="eyebrow">Public record state</p>
                  <h2 className="mt-3 font-heading text-3xl leading-tight text-ink">
                    No material record published
                  </h2>
                </div>
                <FileCheck2 aria-hidden="true" className="mt-1 size-6 shrink-0 text-moss" />
              </div>
              <dl className="mt-3 divide-y divide-border">
                {[
                  "Material identity",
                  "Analytical method",
                  "Lot/batch",
                  "COA state",
                ].map((label) => (
                  <div
                    key={label}
                    className="grid gap-1 py-4 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-5"
                  >
                    <dt className="text-sm font-medium text-ink">{label}</dt>
                    <dd className="text-sm text-unknown">No approved public record</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-5 rounded-lg bg-moss-soft/55 p-4 text-sm leading-6 text-muted-ink">
                Record publication remains disabled until approved evidence and a
                public-release decision exist.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="planned-controls-heading" className="border-b border-border bg-surface">
        <div className="site-container py-10">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="planned-controls-heading" className="eyebrow text-ink">
              Planned system controls
            </h2>
            <p className="text-xs text-muted-ink">Subject to implementation and launch review</p>
          </div>
          <div className="mt-7 grid gap-6 md:grid-cols-3 md:gap-0 md:divide-x md:divide-border">
            {plannedControls.map((control) => (
              <article key={control.title} className="md:px-7 md:first:pl-0 md:last:pr-0">
                <div className="flex items-center gap-2">
                  <ShieldCheck aria-hidden="true" className="size-4 text-moss" />
                  <h3 className="text-sm font-semibold text-ink">{control.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-ink">{control.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-container">
          <SectionHeading
            eyebrow="Access sequence"
            title="Research access is a governed sequence—not a shortcut to checkout."
            description="Approval is specific, reversible, and separate from product and destination eligibility. Unknown or manual-review states cannot silently proceed."
          />
          <ol className="mt-12 grid gap-px overflow-hidden rounded-[0.875rem] border border-border bg-border md:grid-cols-2 xl:grid-cols-4">
            {accessSteps.map((step) => (
              <li key={step.number} className="bg-surface p-6 sm:p-8">
                <span className="font-heading text-2xl tabular-nums text-moss">{step.number}</span>
                <h3 className="mt-8 text-lg font-semibold text-ink">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-ink">{step.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="site-section border-y border-border bg-moss-soft/30">
        <div className="site-container">
          <SectionHeading
            eyebrow="Evidence relationship"
            title="A public fact is useful only when its supporting record can be traced."
            description="The Proof Rail shows the relationship the platform is designed to preserve. It intentionally contains no fictional identifiers, methods, laboratories, or documents."
          />
          <div className="mt-12">
            <ProofRail />
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-container">
          <CatalogEmptyState />
        </div>
      </section>

      <section className="bg-moss text-canvas">
        <div className="site-container grid gap-8 py-14 lg:grid-cols-[1fr_auto] lg:items-center lg:py-16">
          <div className="max-w-[68ch]">
            <p className="eyebrow text-canvas/75">Research-use boundary</p>
            <h2 className="mt-4 font-heading text-section leading-[1.08] text-canvas">
              Eligibility is evaluated for each product and destination.
            </h2>
            <p className="mt-5 leading-7 text-canvas/80">
              Unknown eligibility requires review and cannot proceed to checkout.
              Product legality, provider eligibility, tax, buyer verification, and
              shipping remain separate gates.
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            className="h-12 justify-self-start rounded-full border-canvas/35 bg-transparent px-6 text-canvas hover:bg-canvas hover:text-ink"
          >
            <Link href="/research-use-policy">Read the research-use policy</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
