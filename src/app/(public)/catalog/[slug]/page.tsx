import { ArrowLeft, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { findPublicProduct } from "@/catalog/public-catalog";
import { getPublicCatalog } from "@/catalog/server";
import { AddToCartButton } from "@/components/commerce/add-to-cart-button";
import {
  DataLabel,
  Metric,
  Notice,
  RecordPanel,
} from "@/components/design-system/archive-primitives";
import { EarnPoints } from "@/components/growth/earn-points";
import { DemoNotice } from "@/components/site/demo-notice";
import {
  PageTransition,
  ProductTitleTransition,
} from "@/components/site/page-transition";
import { ProofRail } from "@/components/site/proof-rail";
import { getPublicGrowthProjection } from "@/growth/public-growth-server";

type ProductPageProps = {
  params: Promise<{ slug: string }>;
};

function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100);
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await getPublicCatalog();
  const product = findPublicProduct(catalog, slug);
  return product
    ? {
        title: product.name,
        description: `Public research-use catalog record for ${product.name}.`,
      }
    : { title: "Catalog record unavailable" };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const [catalog, growth] = await Promise.all([
    getPublicCatalog(),
    getPublicGrowthProjection(),
  ]);
  const product = findPublicProduct(catalog, slug);
  if (!product) notFound();

  return (
    <PageTransition>
      {catalog.source === "synthetic-demo" ? <DemoNotice /> : null}
      <article className="site-container pb-20 pt-10 sm:pt-14 lg:pt-16">
        <Link
          className="record-link inline-flex min-h-11 items-center gap-2"
          href="/catalog"
          transitionTypes={["nav-back"]}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to catalog
        </Link>

        <header className="border-b border-border pb-10 pt-8 sm:pb-12">
          <DataLabel>Public catalog dossier</DataLabel>
          <ProductTitleTransition productId={product.id}>
            <h1 className="mt-4 max-w-[18ch] text-balance font-heading text-page leading-[1.02] text-ink">
              {product.name}
            </h1>
          </ProductTitleTransition>
          <p className="mt-5 max-w-[62ch] text-lg leading-8 text-muted-ink">
            {product.packageForm}
          </p>
        </header>

        <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(20rem,5fr)] lg:gap-16">
          <div className="min-w-0">
            {catalog.source === "synthetic-demo" ? (
              <>
                <p className="demo-label">Synthetic demo record — not a real product</p>
                <div
                  className="demo-geometry demo-geometry-large mt-7"
                  role="img"
                  aria-label="Abstract geometry for a synthetic demo record"
                >
                  <span />
                  <span />
                </div>
              </>
            ) : null}

            {product.claims.length > 0 ? (
              <section
                aria-labelledby="supported-claims-heading"
                className={catalog.source === "synthetic-demo" ? "mt-12" : undefined}
              >
                <DataLabel>Evidence-backed copy</DataLabel>
                <h2 id="supported-claims-heading" className="mt-3 font-heading text-3xl text-ink">
                  Linked analytical statements
                </h2>
                <ul className="mt-5 space-y-3">
                  {product.claims.map((claim) => (
                    <li className="record-row" key={claim.id}>
                      {claim.text}
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <Notice
                className={catalog.source === "synthetic-demo" ? "mt-12" : ""}
                icon={FileText}
                title="Analytical statements"
              >
                No linked analytical statements are available for public display on this
                record. No pending evidence state is inferred.
              </Notice>
            )}
          </div>

          <aside className="self-start" aria-label="Catalog price and cart action">
            <RecordPanel className="p-6 sm:p-8">
              <Metric
                detail="Server price"
                label="Current price"
                value={formatMoney(product.price.amountMinor, product.price.currency)}
              />
              <EarnPoints
                loyaltyPolicy={
                  growth.status === "active" ? growth.projection.loyalty : null
                }
                price={product.price}
                source={catalog.source}
              />
              <div className="record-panel-recessed mt-6 p-4">
                <DataLabel>Current public projection</DataLabel>
                <p className="mt-2 font-semibold tabular-nums text-ink">
                  {product.availableQuantity} unit
                  {product.availableQuantity === 1 ? "" : "s"}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-ink">
                  Tax, shipping, and final discounts are calculated later.
                </p>
              </div>
              <AddToCartButton
                productId={product.id}
                productName={product.name}
                className="mt-7 w-full"
              />
            </RecordPanel>
          </aside>
        </div>

        <section aria-labelledby="evidence-heading" className="site-section">
          <DataLabel>Evidence relationship</DataLabel>
          <h2 id="evidence-heading" className="mt-4 font-heading text-section text-ink">
            Record relationships for this catalog entry.
          </h2>
          <div className="mt-10">
            <ProofRail nodes={product.proof} />
          </div>
        </section>

        {product.merchandising.length > 0 ? (
          <section aria-labelledby="merchandising-heading" className="border-t border-border py-14">
            <DataLabel>Merchandising records</DataLabel>
            <h2 id="merchandising-heading" className="mt-4 font-heading text-section text-ink">
              Display options from active server records.
            </h2>
            <ul className="mt-8 grid gap-4 md:grid-cols-2">
              {product.merchandising.map((entry) => (
                <li key={entry.id}>
                  <RecordPanel className="h-full p-6">
                    <DataLabel>{entry.kind.replace("_", " ")}</DataLabel>
                    <h3 className="mt-3 text-lg font-semibold text-ink">{entry.name}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-ink">{entry.summary}</p>
                  </RecordPanel>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {product.relatedProducts.length > 0 ? (
          <section aria-labelledby="related-heading" className="border-t border-border py-14">
            <h2 id="related-heading" className="font-heading text-3xl text-ink">Related catalog records</h2>
            <ul className="mt-6 space-y-3">
              {product.relatedProducts.map((related) => (
                <li key={related.id}>
                  <Link className="record-link inline-flex min-h-11 items-center" href={`/catalog/${related.slug}`}>
                    {related.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </PageTransition>
  );
}
