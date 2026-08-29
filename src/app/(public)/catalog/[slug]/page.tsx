import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { findPublicProduct } from "@/catalog/public-catalog";
import { getPublicCatalog } from "@/catalog/server";
import { AddToCartButton } from "@/components/commerce/add-to-cart-button";
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

        <div className="mt-8 grid gap-12 lg:grid-cols-[7fr_5fr] lg:gap-16">
          <div>
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
            <ProductTitleTransition productId={product.id}>
              <h1 className="mt-8 text-balance font-heading text-page leading-[1.02] text-ink">
                {product.name}
              </h1>
            </ProductTitleTransition>
            <p className="mt-5 max-w-[62ch] text-lg leading-8 text-muted-ink">
              {product.packageForm}
            </p>

            {product.claims.length > 0 ? (
              <section aria-labelledby="supported-claims-heading" className="mt-12">
                <h2 id="supported-claims-heading" className="font-heading text-3xl text-ink">
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
            ) : null}
          </div>

          <aside className="record-sheet self-start p-7 sm:p-9" aria-label="Catalog price and cart action">
            <p className="eyebrow">Server price</p>
            <p className="mt-4 text-4xl font-semibold tabular-nums text-ink">
              {formatMoney(product.price.amountMinor, product.price.currency)}
            </p>
            <EarnPoints
              loyaltyPolicy={
                growth.status === "active" ? growth.projection.loyalty : null
              }
              price={product.price}
              source={catalog.source}
            />
            <p className="mt-3 text-sm leading-6 text-muted-ink">
              {product.availableQuantity} unit{product.availableQuantity === 1 ? "" : "s"} in the current public projection.
              Tax, shipping, and final discounts are calculated later.
            </p>
            <AddToCartButton
              productId={product.id}
              productName={product.name}
              className="mt-7 w-full"
            />
          </aside>
        </div>

        <section aria-labelledby="evidence-heading" className="site-section">
          <p className="eyebrow">Evidence relationship</p>
          <h2 id="evidence-heading" className="mt-4 font-heading text-section text-ink">
            Record relationships for this catalog entry.
          </h2>
          <div className="mt-10">
            <ProofRail nodes={product.proof} />
          </div>
        </section>

        {product.merchandising.length > 0 ? (
          <section aria-labelledby="merchandising-heading" className="border-t border-border py-14">
            <p className="eyebrow">Merchandising records</p>
            <h2 id="merchandising-heading" className="mt-4 font-heading text-section text-ink">
              Display options from active server records.
            </h2>
            <ul className="mt-8 grid gap-4 md:grid-cols-2">
              {product.merchandising.map((entry) => (
                <li className="record-card" key={entry.id}>
                  <p className="eyebrow">{entry.kind.replace("_", " ")}</p>
                  <h3 className="mt-3 text-lg font-semibold text-ink">{entry.name}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-ink">{entry.summary}</p>
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
