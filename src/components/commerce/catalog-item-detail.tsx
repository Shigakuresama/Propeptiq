import { ArrowLeft, FileText } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { BrowseCatalogProduct } from "@/catalog/browse-catalog";
import {
  DataLabel,
  Metric,
  Notice,
  RecordPanel,
} from "@/components/design-system/archive-primitives";

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

      <header
        className="grid gap-8 border-b border-border pb-10 pt-8 sm:pb-12 lg:grid-cols-[minmax(0,8fr)_minmax(14rem,4fr)] lg:items-end"
        data-motion-sequence="dossier-intro"
      >
        <div className="max-w-[68ch]">
          <div data-motion-step="1">
            <DataLabel>Browse-only catalog item</DataLabel>
          </div>
          <h1
            className="mt-4 text-balance font-heading text-page leading-[1.02] text-ink"
            data-motion-step="2"
          >
            {product.name}
          </h1>
          {sourceLabelIsDistinct ? (
            <p className="mt-4 text-base leading-7 text-muted-ink" data-motion-step="3">
              Source label: {product.sourceName}
            </p>
          ) : null}
        </div>
        <div data-motion-step="4">
          <Metric
            className="border-l-2 border-moss pl-5"
            detail="Owner-supplied package configurations"
            label="Dossier entries"
            value={product.variants.length}
          />
        </div>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(20rem,5fr)] lg:items-start lg:gap-16">
        <figure className="catalog-detail-image" data-category={product.category}>
          <Image
            alt={product.image.alt}
            className="object-cover"
            fill
            priority
            sizes="(min-width: 1024px) 55vw, calc(100vw - 2rem)"
            src={product.image.src}
          />
          <figcaption className="catalog-image-disclosure">
            Illustrative product presentation
          </figcaption>
        </figure>

        <section aria-labelledby="catalog-variants-heading">
          <DataLabel>Configuration index</DataLabel>
          <h2 id="catalog-variants-heading" className="mt-3 font-heading text-3xl text-ink">
              Supplied configurations
          </h2>
          <RecordPanel className="mt-6 overflow-hidden p-0">
            <div
              aria-hidden="true"
              className="hidden grid-cols-[minmax(5rem,auto)_1fr] gap-6 border-b border-border bg-surface-recessed px-5 py-3 sm:grid"
            >
              <span className="data-label">Code</span>
              <span className="data-label">Supplied configuration</span>
            </div>
            <ol className="divide-y divide-border">
              {product.variants.map((variant) => (
                <li
                  className="grid gap-1 px-5 py-4 sm:grid-cols-[minmax(5rem,auto)_1fr] sm:gap-6"
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
            </ol>
          </RecordPanel>
        </section>
      </div>

      <Notice className="mt-10" icon={FileText} title="Publication scope">
        This browse-only entry reproduces the supplied product name, code, and package
        configuration. Availability, quality records, pricing, and purchasing are not
        represented.
      </Notice>
    </article>
  );
}
