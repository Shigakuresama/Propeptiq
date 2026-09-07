import { ArrowRight, FlaskConical, LibraryBig } from "lucide-react";
import Link from "next/link";
import type { PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import type { PublicStorefrontProduct } from "@/catalog/storefront-public";
import { CatalogListingCard } from "@/components/commerce/catalog-listing-card";
import { DataLabel, SectionShell } from "@/components/design-system/archive-primitives";
import { ProgramStrip } from "@/components/growth/program-strip";
import { FaqSection } from "@/components/site/faq-section";
import { FaqJsonLd } from "@/components/site/faq-json-ld";
import { SectionHeading } from "@/components/site/section-heading";
import { WhyChoosePropeptIQ } from "@/components/site/why-choose-propeptiq";
import { TrendingProducts } from "@/components/site/trending-products";
import { Button } from "@/components/ui/button";
import type { ApprovedHomepageContent } from "@/content/storefront-content";
import type { LoyaltyPolicy } from "@/domain/rewards";
import type { ReferralPolicy } from "@/domain/referrals";
import { researchRestrictions } from "@/lib/site-content";

const emptyHomepageContent: ApprovedHomepageContent = Object.freeze({ whyChoose: Object.freeze([]), faqs: Object.freeze([]) });

export function PublicHome({ homepageContent = emptyHomepageContent, loyaltyPolicy = null, referralPolicy = null, partnerAvailable = false, syntheticLocal = false, products, pricing }: {
  homepageContent?: ApprovedHomepageContent | undefined;
  loyaltyPolicy?: LoyaltyPolicy | null;
  referralPolicy?: ReferralPolicy | null;
  partnerAvailable?: boolean;
  programsUnavailable?: boolean;
  syntheticLocal?: boolean;
  products: readonly PublicStorefrontProduct[];
  variantCount: number;
  pricing: PublicStorefrontPricingContext;
}) {
  const programs = [
    { title: "Rewards", href: "/rewards" as const, active: loyaltyPolicy?.status === "active" },
    { title: "Referrals", href: "/rewards#referrals" as const, active: referralPolicy?.status === "active" },
    { title: "Partner program", href: "/partners" as const, active: partnerAvailable },
  ].filter((program) => program.active);

  return <div>
    {syntheticLocal ? <div className="site-container pt-5"><p className="warning-record text-base font-semibold">Synthetic local test only</p></div> : null}
    <ProgramStrip loyaltyPolicy={loyaltyPolicy} />
    <section aria-labelledby="home-hero-heading" className="home-hero border-b border-border">
      <SectionShell className="grid gap-10 py-10 sm:py-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center lg:gap-12">
        <div className="min-w-0" data-motion-sequence="home-hero">
          <DataLabel>PROPEPTIQ LABS · Research-use catalog</DataLabel>
          <h1 id="home-hero-heading" className="home-hero-title mt-5 font-heading text-ink">
            Research materials,<br /><span className="text-accent-readable">documented with clarity.</span>
          </h1>
          <p className="mt-6 max-w-[48ch] text-lg leading-8 text-muted-ink">Explore the research catalog. Compare amounts, see current pricing, and keep your selections together.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild className="action-primary"><Link href="/catalog">Browse catalog <ArrowRight aria-hidden="true" /></Link></Button>
            <Button asChild className="action-secondary" variant="outline"><Link href="/cart">View cart</Link></Button>
          </div>
          {products.length ? <p className="mt-8 text-sm font-semibold uppercase tracking-wider text-accent-readable">{products.length} products in the catalog</p> : null}
        </div>
        <TrendingProducts products={products} />
      </SectionShell>
    </section>
    <section aria-labelledby="home-highlights-heading" className="py-12 sm:py-16 lg:py-20">
      <SectionShell>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading description="Explore products from the PropeptIQ research catalog." eyebrow="Catalog highlights" id="home-highlights-heading" title="Find your next research material." />
          <Link className="record-link inline-flex min-h-11 items-center gap-2" href="/catalog"><LibraryBig aria-hidden="true" className="size-4" />View the full catalog</Link>
        </div>
        <ul aria-label="Catalog highlights" className="home-product-grid mt-8 grid list-none gap-5 p-0 md:grid-cols-3">
          {products.slice(0, 3).map((product, index) => <li className="min-w-0" key={product.slug}><CatalogListingCard headingLevel={3} product={product} priority={index === 0} pricing={pricing} /></li>)}
        </ul>
      </SectionShell>
    </section>
    {programs.length ? <section className="border-y border-border bg-surface-recessed py-10" aria-label="PROPEPTIQ programs">
      <SectionShell><ul className="flex list-none flex-wrap gap-6 p-0">{programs.map((program) => <li key={program.href}><h2 className="font-heading text-2xl"><Link className="record-link inline-flex min-h-11 items-center gap-2" href={program.href}>{program.title}<ArrowRight aria-hidden="true" className="size-4" /></Link></h2></li>)}</ul></SectionShell>
    </section> : null}
    <WhyChoosePropeptIQ items={homepageContent.whyChoose} />
    <FaqSection entries={homepageContent.faqs} />
    <FaqJsonLd entries={homepageContent.faqs} />
    <section aria-labelledby="research-use-heading" className="border-t border-border py-12 sm:py-16">
      <SectionShell className="grid gap-6 md:grid-cols-2 md:items-center">
        <div><FlaskConical aria-hidden="true" className="size-7 text-accent-readable" /><h2 id="research-use-heading" className="mt-4 font-heading text-section leading-tight">Research use only</h2></div>
        <div><div className="restriction-copy border-l-2 border-moss pl-5 text-base leading-7"><p>{researchRestrictions[0]}</p><p>{researchRestrictions[1]}</p></div><Link className="record-link mt-4 inline-flex min-h-11 items-center" href="/research-use-policy">Read the research-use policy</Link></div>
      </SectionShell>
    </section>
    <section aria-labelledby="catalog-cta-heading" className="border-t border-border bg-surface-inverse text-canvas">
      <SectionShell className="flex flex-wrap items-end justify-between gap-8 py-12 sm:py-16">
        <div className="min-w-0 max-w-2xl"><DataLabel className="data-label-inverse">Research catalog</DataLabel><h2 id="catalog-cta-heading" className="mt-4 font-heading text-section leading-tight">Explore the full research catalog.</h2></div>
        <Button asChild className="action-inverse" variant="outline"><Link href="/catalog">Explore the catalog<ArrowRight aria-hidden="true" /></Link></Button>
      </SectionShell>
    </section>
  </div>;
}
