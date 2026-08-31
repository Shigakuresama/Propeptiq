"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import type { PublicStorefrontProduct } from "@/catalog/storefront-public";
import { canAddPublicVariant, resolvePublicVariantPrice, selectCardVariant, type PricePresentationMode, type PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import { AddToCartButton } from "./add-to-cart-button";
import { ProductPrice } from "./product-price";
import { VariantAddTrigger } from "./quick-add-variant-sheet";

const CARD_VARIANT_LIMIT = 3;

export function CatalogListingCard({
  product,
  priority = false,
  pricing,
  pricingMode,
}: {
  product: PublicStorefrontProduct;
  priority?: boolean;
  pricing?: PublicStorefrontPricingContext | undefined;
  pricingMode?: PricePresentationMode;
}) {
  const mode = pricing?.mode ?? pricingMode ?? "production";
  const pricingContext = pricing ?? { mode, evaluatedAt: "1970-01-01T00:00:00.000Z", automaticPromotions: [] };
  const selectedVariant = product.kind === "canonical" ? selectCardVariant({ product, pricing: pricingContext }) : null;
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
        {product.kind === "canonical" && selectedVariant ? <CardDiscountBadge product={product} variant={selectedVariant} pricing={pricingContext} /> : null}
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

        {product.kind === "canonical" && selectedVariant ? <div className="mt-5"><p className="text-sm text-muted-ink">{product.variants.length > 1 ? `From ${selectedVariant.amount?.value ?? selectedVariant.label} ${selectedVariant.amount?.unit ?? ""}` : selectedVariant.label}</p><ProductPrice productId={product.id} variant={selectedVariant} pricing={pricingContext} /></div> : <p className="mt-5 text-sm font-medium text-muted-ink">Pricing coming soon</p>}

        {product.kind === "canonical" ? (product.variants.length > 1 ? <VariantAddTrigger product={product} mode={mode} pricing={pricingContext} /> : selectedVariant ? <><p className="mt-2 text-sm text-muted-ink">{selectedVariant.availability === "available" && selectedVariant.checkoutReady ? "Available" : "Checkout unavailable"}</p><AddToCartButton variantId={selectedVariant.id} productName={product.name} canAdd={canAddPublicVariant(selectedVariant, mode)} disabledReason="This product is not currently available for cart testing." className="mt-5 min-h-11" /></> : null) : null}

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

function CardDiscountBadge({ product, variant, pricing }: { product: Extract<PublicStorefrontProduct, { kind: "canonical" }>; variant: import("@/catalog/storefront-public").PublicStorefrontVariant; pricing: PublicStorefrontPricingContext }) {
  const result = resolvePublicVariantPrice({ variant, productId: product.id, quantity: 1, pricing });
  return result.state === "priced" && result.price.effectiveDiscountBps > 0 ? <span className="absolute left-3 top-3 rounded-full bg-moss px-3 py-1 text-xs font-semibold text-white" aria-label={`-${result.price.effectiveDiscountBps / 100}%`}>-{result.price.effectiveDiscountBps / 100}%</span> : null;
}
