import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { BrowseCatalogProduct } from "@/catalog/browse-catalog";

export function CatalogItemDetail({ product }: { product: BrowseCatalogProduct }) {
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
          <p className="eyebrow">Browse-only catalog item</p>
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
              {product.variants.map((variant) => (
                <li
                  className="grid gap-1 py-4 sm:grid-cols-[minmax(5rem,auto)_1fr] sm:gap-6"
                  key={`${product.slug}-${variant.code}-${variant.packageForm}`}
                >
                  <span className="font-semibold tabular-nums text-ink">{variant.code}</span>
                  <span className="leading-6 text-muted-ink">{variant.packageForm}</span>
                  {variant.sourceName ? (
                    <span className="text-sm leading-6 text-muted-ink sm:col-start-2">
                      Source label: {variant.sourceName}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <p className="info-record mt-8 text-sm">
            This browse-only entry reproduces the supplied product name, code, and package configuration. Availability, quality records, and purchasing are not represented.
          </p>
        </div>
      </div>
    </article>
  );
}
