import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { PublicStorefrontProduct } from "@/catalog/storefront-public";

const CARD_VARIANT_LIMIT = 3;

export function CatalogListingCard({
  product,
  priority = false,
}: {
  product: PublicStorefrontProduct;
  priority?: boolean;
}) {
  const headingId = `catalog-${product.slug}`;
  const visibleConfigurations = product.displayConfigurations.slice(0, CARD_VARIANT_LIMIT);
  const remainingConfigurationCount =
    product.displayConfigurations.length - visibleConfigurations.length;

  return (
    <article
      aria-labelledby={headingId}
      className="catalog-listing-card group record-card flex h-full flex-col overflow-hidden p-0"
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
        <h2 id={headingId} className="font-heading text-3xl leading-tight text-ink">
          {product.name}
        </h2>

        <ul
          aria-label={`${product.name} catalog variants`}
          className="mt-5 space-y-2 border-t border-border pt-4"
        >
          {visibleConfigurations.map((configuration) => (
            <li
              className="grid grid-cols-[minmax(3.75rem,auto)_1fr] gap-3 text-sm leading-6 text-muted-ink"
              key={`${product.slug}-${configuration.displayCode}-${configuration.packageForm}`}
            >
              <span className="font-semibold tabular-nums text-ink">
                {configuration.displayCode}
              </span>
              <span>{configuration.packageForm}</span>
            </li>
          ))}
        </ul>
        {remainingConfigurationCount > 0 ? (
          <p className="mt-3 text-sm font-medium text-muted-ink">
            +{remainingConfigurationCount} more catalog variant
            {remainingConfigurationCount === 1 ? "" : "s"}
          </p>
        ) : null}

        <Link
          aria-label={`View catalog item: ${product.name}`}
          className="record-link mt-auto inline-flex min-h-11 items-center gap-2 pt-7"
          href={`/catalog/items/${product.slug}`}
          transitionTypes={["nav-forward"]}
        >
          View catalog item
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </article>
  );
}
