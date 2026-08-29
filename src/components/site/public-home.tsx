import { ArrowRight, Coins, FileCheck2, FlaskConical, LibraryBig, Share2 } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import type { BrowseCatalogProduct } from "@/catalog/browse-catalog";
import { CatalogListingCard } from "@/components/commerce/catalog-listing-card";
import { ProgramStrip } from "@/components/growth/program-strip";
import { ProofRail } from "@/components/site/proof-rail";
import { Button } from "@/components/ui/button";
import type { LoyaltyPolicy } from "@/domain/rewards";
import type { ReferralPolicy } from "@/domain/referrals";
import { researchRestrictions } from "@/lib/site-content";

export function PublicHome({
  loyaltyPolicy = null,
  referralPolicy = null,
  products,
  variantCount,
}: {
  loyaltyPolicy?: LoyaltyPolicy | null;
  referralPolicy?: ReferralPolicy | null;
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
      <ProgramStrip loyaltyPolicy={loyaltyPolicy} />
      <section className="border-b border-border">
        <div className="site-container grid gap-10 py-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:py-16">
          <div className="max-w-[52rem]">
            <p className="eyebrow">Research-use catalog</p>
            <h1 className="mt-5 text-balance font-heading text-page leading-[1.01] text-ink xl:text-[5rem]">
              Research materials, documented for laboratory work.
            </h1>
            <p className="mt-6 max-w-[64ch] text-pretty text-lg leading-8 text-muted-ink sm:text-xl">
              Explore the owner-supplied product catalog and package configurations.
              Purchasing and operational availability remain separate from this browse-only collection.
            </p>
            <div className="restriction-copy mt-7 border-l-2 border-moss pl-4 text-sm leading-6 sm:text-base">
              <p>{researchRestrictions[0]}</p>
              <p>{researchRestrictions[1]}</p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="action-primary">
                <Link href="/catalog">
                  Browse catalog
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="action-secondary">
                <Link href="/cart">View cart</Link>
              </Button>
            </div>
          </div>

          <div className="record-sheet p-7 sm:p-9">
            <p className="eyebrow">Current catalog</p>
            <p className="mt-4 font-heading text-4xl text-ink tabular-nums">
              {products.length.toString().padStart(2, "0")}
            </p>
            <p className="mt-3 max-w-[34ch] text-sm leading-6 text-muted-ink">
              Product families spanning {variantCount} supplied package configurations.
              Prices are intentionally excluded.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-border py-12 lg:py-14" aria-labelledby="home-evidence-heading">
        <div className="site-container">
          <p className="eyebrow">Evidence relationship</p>
          <h2 id="home-evidence-heading" className="mt-3 max-w-[24ch] font-heading text-3xl text-ink sm:text-4xl">
            Public records stay linked to their source evidence.
          </h2>
          <div className="mt-8">
            <ProofRail />
          </div>
        </div>
      </section>

      <section className="py-14 lg:py-16">
        <div className="site-container">
          <div className="flex items-center gap-3">
            <LibraryBig aria-hidden="true" className="size-5 text-moss" />
            <p className="eyebrow">Catalog highlights</p>
          </div>
          <ul className="catalog-grid mt-8">
            {products.slice(0, 3).map((product, index) => (
              <li key={product.slug}>
                <CatalogListingCard product={product} priority={index === 0} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {growthPrograms.length > 0 ? (
        <section
          aria-label="Growth programs"
          className="border-t border-border bg-moss-soft/25 py-12 lg:py-14"
        >
          <div className="site-container">
            <p className="eyebrow">Current active programs</p>
            <ul className="mt-6 grid gap-4 p-0 md:grid-cols-3">
              {growthPrograms.map(({ title, description, href, Icon }) => (
                <li className="record-sheet min-w-0 p-5" key={title}>
                  <Icon aria-hidden="true" className="size-5 text-moss" />
                  <Link
                    className="record-link mt-4 inline-flex min-h-11 items-center text-lg font-semibold"
                    href={href as Route}
                  >
                    {title}
                  </Link>
                  <p className="mt-2 text-base leading-7 text-muted-ink">{description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="border-t border-border py-14 lg:py-16" aria-labelledby="quality-callout-heading">
        <div className="site-container grid gap-6 md:grid-cols-[auto_1fr_auto] md:items-center">
          <FileCheck2 aria-hidden="true" className="size-6 text-moss" />
          <div>
            <p className="eyebrow">Quality records</p>
            <h2 id="quality-callout-heading" className="mt-3 font-heading text-3xl text-ink">
              Follow the record, not an unsupported claim.
            </h2>
          </div>
          <Link className="record-link inline-flex min-h-11 items-center" href="/quality-records">
            View quality records
          </Link>
        </div>
      </section>
    </div>
  );
}
