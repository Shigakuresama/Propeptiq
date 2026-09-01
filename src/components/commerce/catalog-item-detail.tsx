import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { PublicStorefrontProduct } from "@/catalog/storefront-public";
import type { PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import { ProductPurchasePanel } from "./product-purchase-panel";

export function CatalogItemDetail({ product, pricing }: { product: PublicStorefrontProduct; pricing: PublicStorefrontPricingContext }) {
  const canonical = product.kind === "canonical";
  const sourceLabelIsDistinct =
    product.sourceName.replace(/\s+/gu, "").toLocaleLowerCase("en-US") !==
    product.name.replace(/\s+/gu, "").toLocaleLowerCase("en-US");

  return (
    <article className="site-container pb-20 pt-10 sm:pt-14 lg:pt-16">
      <Link
        className="record-link inline-flex min-h-11 items-center gap-2"
        href="/catalog"
        transitionTypes={["nav-back"]}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to catalog
      </Link>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(20rem,5fr)] lg:items-start lg:gap-16">
        <div className="catalog-detail-image" data-category={product.category}>
          <Image
            alt={product.image.alt}
            className="object-cover"
            fill
            priority
            sizes="(min-width: 1024px) 55vw, calc(100vw - 2rem)"
            src={product.image.src}
          />
          <p className="catalog-image-disclosure">Illustrative product presentation</p>
        </div>

        <div>
          <p className="eyebrow">{canonical ? "Product" : "Browse-only catalog item"}</p>
          <h1 className="mt-5 text-balance font-heading text-page leading-[1.02] text-ink">
            {product.name}
          </h1>
          {sourceLabelIsDistinct ? (
            <p className="mt-4 text-sm leading-6 text-muted-ink">
              Source label: {product.sourceName}
            </p>
          ) : null}

          <section aria-labelledby="catalog-variants-heading" className="mt-10">
            <h2 id="catalog-variants-heading" className="font-heading text-3xl text-ink">
              Supplied configurations
            </h2>
            <ul className="mt-5 divide-y divide-border border-y border-border">
              {product.displayConfigurations.map((configuration) => (
                <li
                  className="grid gap-1 py-4 sm:grid-cols-[minmax(5rem,auto)_1fr] sm:gap-6"
                  key={`${product.slug}-${configuration.displayCode}-${configuration.packageForm}`}
                >
                  <span className="font-semibold tabular-nums text-ink">
                    {configuration.displayCode}
                  </span>
                  <span className="leading-6 text-muted-ink">
                    {configuration.packageForm}
                  </span>
                  {configuration.sourceName ? (
                    <span className="text-sm leading-6 text-muted-ink sm:col-start-2">
                      Source label: {configuration.sourceName}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <p className="info-record mt-8 text-sm">
            {!canonical ? "This browse-only entry reproduces the supplied product name, code, and package configuration. Availability, quality records, and purchasing are not represented." : null}
          </p>
          {canonical ? <ProductPurchasePanel product={product} pricing={pricing} /> : null}
          {canonical && product.content.some((record) => record.kind === "product_information" || record.kind === "legal_notice") ? <section className="mt-10 space-y-5" aria-label="Approved information">{product.content.filter((record) => record.kind === "product_information" || record.kind === "legal_notice").map((record) => <article key={record.id}><h2 className="font-heading text-2xl text-ink">{record.title}</h2><p className="mt-2 whitespace-pre-wrap text-muted-ink">{record.body}</p></article>)}</section> : null}
        </div>
      </div>
    </article>
  );
}
