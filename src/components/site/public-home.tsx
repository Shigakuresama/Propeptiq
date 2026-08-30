import { ArrowRight, Coins, FileCheck2, FlaskConical, LibraryBig, Share2 } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import type { BrowseCatalogProduct } from "@/catalog/browse-catalog";
import { CatalogListingCard } from "@/components/commerce/catalog-listing-card";
import {
  DataLabel,
  Metric,
  RecordPanel,
  SectionShell,
} from "@/components/design-system/archive-primitives";
import { ProgramStrip } from "@/components/growth/program-strip";
import { ProofRail } from "@/components/site/proof-rail";
import { ScienceField } from "@/components/site/science-field";
import { SectionHeading } from "@/components/site/section-heading";
import { Button } from "@/components/ui/button";
import type { LoyaltyPolicy } from "@/domain/rewards";
import type { ReferralPolicy } from "@/domain/referrals";
import { researchRestrictions } from "@/lib/site-content";

const documentationStages = [
  {
    index: "01",
    label: "Material",
    detail: "Current catalog identity",
  },
  {
    index: "02",
    label: "Record",
    detail: "Owner-supplied configuration",
  },
  {
    index: "03",
    label: "Method",
    detail: "Approved analytical context, when available",
  },
  {
    index: "04",
    label: "Document",
    detail: "Public destination, when approved",
  },
] as const;

export function PublicHome({
  loyaltyPolicy = null,
  referralPolicy = null,
  syntheticLocal = false,
  products,
  variantCount,
}: {
  loyaltyPolicy?: LoyaltyPolicy | null;
  referralPolicy?: ReferralPolicy | null;
  syntheticLocal?: boolean;
  products: readonly BrowseCatalogProduct[];
  variantCount: number;
}) {
  const growthPrograms = [
    ...(loyaltyPolicy?.status === "active" ? [{
      title: "Earn points",
      description: "Review the current rewards program and its eligibility rules.",
      href: "/rewards" as const,
      Icon: Coins,
    }] : []),
    ...(referralPolicy?.status === "active" ? [{
      title: "Refer a lab",
      description: "Open the private referral dashboard from an eligible account.",
      href: "/account/referrals" as const,
      Icon: FlaskConical,
    }, {
      title: "Share a research set",
      description: "Build a neutral set from current public product records.",
      href: "/research-sets" as const,
      Icon: Share2,
    }] : []),
  ];

  return (
    <div>
      {syntheticLocal ? (
        <div className="site-container pt-5">
          <p className="warning-record text-base font-semibold">Synthetic local test only</p>
        </div>
      ) : null}
      <ProgramStrip loyaltyPolicy={loyaltyPolicy} />

      <section aria-labelledby="home-hero-heading" className="overflow-hidden border-b border-border">
        <SectionShell className="grid gap-8 py-12 sm:gap-10 sm:py-16 lg:grid-cols-[minmax(0,7fr)_minmax(14rem,5fr)] lg:items-stretch lg:py-20 xl:gap-14 xl:py-24">
          <div className="flex min-w-0 max-w-[54rem] flex-col justify-center lg:py-8" data-motion-sequence="home-hero">
            <DataLabel>Research-use catalog</DataLabel>
            <h1
              aria-label="Research materials, documented with greater clarity."
              id="home-hero-heading"
              className="mt-5 break-words font-heading text-page leading-[0.97] tracking-[-0.025em] text-ink xl:text-[5.75rem]"
            >
              <span className="block">Research materials,</span>
              <span className="block">documented with</span>
              <span className="block">greater clarity.</span>
            </h1>
            <p className="mt-7 max-w-[62ch] text-pretty text-lg leading-8 text-muted-ink sm:text-xl">
              Explore the owner-supplied product catalog and package configurations.
              Purchasing and operational availability remain separate from this browse-only collection.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild className="action-primary">
                <Link href="/catalog">
                  Browse catalog
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild className="action-secondary" variant="outline">
                <Link href="/cart">View cart</Link>
              </Button>
            </div>
          </div>

          <RecordPanel className="relative min-h-[26rem] overflow-hidden bg-surface-recessed p-0 shadow-none sm:min-h-[34rem] lg:min-h-[38rem]">
            <ScienceField className="home-research-lattice" variant="lattice" />
            <div className="relative z-10 flex h-full min-h-[26rem] flex-col justify-between sm:min-h-[34rem] lg:min-h-[38rem]">
              <div className="flex items-start justify-between gap-4 p-6 sm:p-8">
                <DataLabel>Current catalog</DataLabel>
                <p className="rounded-full border border-border bg-surface-record px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-accent-readable">
                  Browse-only
                </p>
              </div>
              <div className="border-t border-border bg-surface-record p-6 sm:p-8">
                <div className="grid grid-cols-2 gap-6 divide-x divide-border">
                  <Metric
                    className="pr-4"
                    label="Product families"
                    value={products.length.toString().padStart(2, "0")}
                  />
                  <Metric
                    className="pl-1 sm:pl-3"
                    label="Configurations"
                    value={variantCount.toString()}
                  />
                </div>
                <p className="mt-6 max-w-[38ch] border-t border-border pt-5 text-base leading-7 text-muted-ink">
                  Product families spanning {variantCount} supplied package configurations.
                  Prices are intentionally excluded.
                </p>
              </div>
            </div>
          </RecordPanel>
        </SectionShell>
      </section>

      <section
        aria-labelledby="home-evidence-heading"
        className="border-b border-border bg-surface-record/35 py-12 sm:py-16 lg:py-24 xl:py-28"
      >
        <SectionShell>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,8fr)_minmax(16rem,4fr)] lg:items-end">
            <SectionHeading
              description="Each stage remains distinct, and an unavailable stage stays explicitly unavailable."
              eyebrow="Evidence relationship"
              id="home-evidence-heading"
              title="Public records stay linked to their source evidence."
            />
            <div className="border-l-2 border-moss pl-5">
              <DataLabel>Reading note</DataLabel>
              <p className="mt-3 text-base leading-7 text-muted-ink">
                This ordered rail describes a relationship. It is not a progress score.
              </p>
            </div>
          </div>
          <div className="mt-10">
            <ProofRail />
          </div>
        </SectionShell>
      </section>

      {products.length > 0 ? (
        <section aria-labelledby="home-highlights-heading" className="py-12 sm:py-16 lg:py-24 xl:py-28">
          <SectionShell>
            <div className="grid gap-7 lg:grid-cols-[minmax(0,8fr)_minmax(14rem,4fr)] lg:items-end">
              <SectionHeading
                description="A closer view of three product families from the current owner-supplied publication."
                eyebrow="Catalog highlights"
                id="home-highlights-heading"
                title="Selected entries, given room to be read."
              />
              <div className="flex items-center gap-3 lg:justify-end">
                <LibraryBig aria-hidden="true" className="size-5 text-moss" />
                <Link className="record-link inline-flex min-h-11 items-center" href="/catalog">
                  View the full catalog
                </Link>
              </div>
            </div>
            <ul
              aria-label="Catalog highlights"
              className="mt-10 grid list-none gap-6 p-0 md:grid-cols-2 xl:grid-cols-12"
            >
              {products.slice(0, 3).map((product, index) => (
                <li
                  className={index === 0
                    ? "md:col-span-2 xl:col-span-6 [&_.catalog-image-frame]:aspect-[16/10] sm:[&_.catalog-image-frame]:aspect-[4/3]"
                    : "xl:col-span-3 [&_.catalog-image-frame]:hidden [&_.record-panel-recessed]:hidden sm:[&_.catalog-image-frame]:block sm:[&_.record-panel-recessed]:block"}
                  key={product.slug}
                >
                  <CatalogListingCard product={product} priority={index === 0} />
                </li>
              ))}
            </ul>
          </SectionShell>
        </section>
      ) : null}

      {growthPrograms.length > 0 ? (
        <section
          aria-label="Growth programs"
          className="border-t border-border bg-moss-soft/25 py-10 sm:py-12 lg:py-14"
        >
          <SectionShell>
            <SectionHeading
              className="max-w-[48rem]"
              eyebrow="Current active programs"
              id="home-programs-heading"
              title="Programs appear only from active policy records."
            />
            <ul className="mt-8 grid list-none gap-4 p-0 md:grid-cols-3">
              {growthPrograms.map(({ title, description, href, Icon }) => (
                <li className="min-w-0" key={title}>
                  <RecordPanel className="h-full p-5" interactive>
                    <Icon aria-hidden="true" className="size-5 text-moss" />
                    <Link
                      className="record-link mt-4 inline-flex min-h-11 items-center text-lg font-semibold"
                      href={href as Route}
                    >
                      {title}
                    </Link>
                    <p className="mt-2 text-base leading-7 text-muted-ink">{description}</p>
                  </RecordPanel>
                </li>
              ))}
            </ul>
          </SectionShell>
        </section>
      ) : null}

      <section
        aria-labelledby="quality-callout-heading"
        className="border-t border-border bg-surface-recessed py-12 sm:py-16 lg:py-24 xl:py-28"
      >
        <SectionShell className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
          <div className="max-w-[38rem]">
            <div className="flex items-center gap-3">
              <FileCheck2 aria-hidden="true" className="size-5 text-moss" />
              <DataLabel>Documentation philosophy</DataLabel>
            </div>
            <h2
              id="quality-callout-heading"
              className="mt-5 text-balance font-heading text-section leading-[1.08] text-ink"
            >
              Follow the record, not an unsupported claim.
            </h2>
            <p className="mt-6 text-pretty text-base leading-7 text-muted-ink">
              Catalog identity is presented separately from analytical context, lot information,
              and public COA availability. Each appears only from its corresponding record.
            </p>
            <Link
              className="record-link mt-7 inline-flex min-h-11 items-center gap-2"
              href="/quality-records"
            >
              View quality records
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>

          <ol className="grid list-none gap-px overflow-hidden rounded-[0.875rem] border border-border bg-border p-0 sm:grid-cols-2">
            {documentationStages.map((stage) => (
              <li className="min-h-36 bg-surface-record p-5 sm:min-h-44 sm:p-7" key={stage.index}>
                <DataLabel className="break-words">{stage.index} / {stage.label}</DataLabel>
                <p className="mt-6 max-w-[24ch] break-words font-heading text-2xl leading-tight text-ink sm:mt-8">
                  {stage.detail}
                </p>
              </li>
            ))}
          </ol>
        </SectionShell>
      </section>

      <section aria-labelledby="research-use-heading" className="border-t border-border py-10 sm:py-16 lg:py-20">
        <SectionShell>
          <RecordPanel className="grid overflow-hidden p-0 lg:grid-cols-[minmax(0,7fr)_minmax(18rem,5fr)]">
            <div className="bg-surface-inverse p-7 text-canvas sm:p-10 lg:p-12">
              <FlaskConical aria-hidden="true" className="size-6 text-canvas/75" />
              <DataLabel className="data-label-inverse mt-8">Research-use boundary</DataLabel>
              <h2
                id="research-use-heading"
                className="mt-4 max-w-[18ch] break-words text-balance font-heading text-section leading-[1.08] text-canvas"
              >
                A clear boundary, integrated into the catalog.
              </h2>
            </div>
            <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
              <div className="restriction-copy border-l-2 border-moss pl-5 text-base leading-7 text-ink">
                <p>{researchRestrictions[0]}</p>
                <p>{researchRestrictions[1]}</p>
              </div>
              <p className="mt-6 text-base leading-7 text-muted-ink">
                The browse publication identifies owner-supplied product families and package
                configurations. Purchasing and operational availability remain separate.
              </p>
              <Link
                className="record-link mt-7 inline-flex min-h-11 items-center"
                href="/research-use-policy"
              >
                Read the research-use policy
              </Link>
            </div>
          </RecordPanel>
        </SectionShell>
      </section>

      <section aria-labelledby="catalog-cta-heading" className="border-t border-border bg-surface-inverse text-canvas">
        <SectionShell className="grid gap-8 py-12 sm:py-16 lg:grid-cols-[minmax(0,8fr)_auto] lg:items-end lg:py-20">
          <div>
            <DataLabel className="data-label-inverse">Research catalog</DataLabel>
            <h2
              id="catalog-cta-heading"
              className="mt-4 max-w-[18ch] break-words text-balance font-heading text-section leading-[1.04] text-canvas"
            >
              Explore the full research catalog.
            </h2>
            <p className="mt-5 max-w-[58ch] text-base leading-7 text-canvas/75">
              Review every currently published product family and supplied package configuration.
            </p>
          </div>
          <Button
            asChild
            className="action-inverse"
            variant="outline"
          >
            <Link href="/catalog">
              Explore the catalog
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </SectionShell>
      </section>
    </div>
  );
}
