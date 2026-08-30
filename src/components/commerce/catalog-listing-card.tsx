import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type {
  BrowseCatalogProduct,
  BrowseCatalogVariant,
} from "@/catalog/browse-catalog";
import { DataLabel } from "@/components/design-system/archive-primitives";

const CARD_VARIANT_LIMIT = 3;

export function CatalogListingCard({
  product,
  priority = false,
  variants = product.variants,
}: {
  product: BrowseCatalogProduct;
  priority?: boolean;
  variants?: readonly BrowseCatalogVariant[];
}) {
  const headingId = `catalog-${product.slug}`;
  const visibleVariants = variants.slice(0, CARD_VARIANT_LIMIT);
  const remainingVariantCount = variants.length - visibleVariants.length;

  return (
    <article
      aria-labelledby={headingId}
      className="catalog-listing-card group record-panel record-panel-interactive flex h-full flex-col overflow-hidden"
    >
      <div className="catalog-image-frame" data-category={product.category}>
        <Image
          alt={product.image.alt}
          className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02] motion-reduce:transform-none"
          fill
          priority={priority}
          sizes="(min-width: 1280px) 28vw, (min-width: 768px) 45vw, calc(100vw - 2rem)"
          src={product.image.src}
        />
        <p className="catalog-image-disclosure">Illustrative product presentation</p>
      </div>

      <div className="flex flex-1 flex-col p-6 sm:p-7">
        <DataLabel>
          {variants.length} supplied configuration
          {variants.length === 1 ? "" : "s"}
        </DataLabel>
        <h2 id={headingId} className="mt-3 text-balance font-heading text-3xl leading-tight text-ink">
          {product.name}
        </h2>

        <div className="record-panel-recessed mt-6 overflow-hidden">
          <div
            aria-hidden="true"
            className="grid grid-cols-[minmax(4.5rem,auto)_1fr] gap-3 border-b border-border px-4 py-2"
          >
            <span className="data-label">Code</span>
            <span className="data-label">Package</span>
          </div>
          <ul aria-label={`${product.name} catalog variants`} className="divide-y divide-border">
            {visibleVariants.map((variant) => (
              <li
                className="grid grid-cols-[minmax(4.5rem,auto)_1fr] gap-3 px-4 py-3 text-sm leading-6 text-muted-ink"
                key={`${product.slug}-${variant.code}-${variant.packageForm}`}
              >
                <span className="font-semibold tabular-nums text-ink">{variant.code}</span>
                <span>{variant.packageForm}</span>
              </li>
            ))}
          </ul>
          {remainingVariantCount > 0 ? (
            <p className="border-t border-border px-4 py-3 text-sm font-medium text-muted-ink">
              +{remainingVariantCount} additional configuration
              {remainingVariantCount === 1 ? "" : "s"} in the dossier
            </p>
          ) : null}
        </div>

        <Link
          aria-label={`Open catalog dossier: ${product.name}`}
          className="record-link mt-auto inline-flex min-h-11 items-center justify-between gap-4 pt-7"
          href={`/catalog/items/${product.slug}`}
          transitionTypes={["nav-forward"]}
        >
          Open catalog dossier
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </article>
  );
}
