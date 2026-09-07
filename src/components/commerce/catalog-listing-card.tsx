"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { PublicStorefrontProduct } from "@/catalog/storefront-public";
import { canAddPublicVariant, publicVariantPurchaseLabel, resolvePublicVariantPrice, selectCardVariant, type PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import { AddToCartButton } from "./add-to-cart-button";
import { ProductPrice } from "./product-price";
import { CatalogProductVisual } from "./catalog-product-visual";
import { VariantDropdown } from "./variant-dropdown";

export function CatalogListingCard({ product, priority = false, pricing, headingLevel = 2 }: {
  product: PublicStorefrontProduct;
  priority?: boolean;
  pricing: PublicStorefrontPricingContext;
  headingLevel?: 2 | 3;
}) {
  const instanceId = useId();
  const [selection, setSelection] = useState<{ slug: string; variantId: string } | null>(null);
  const defaultVariant = product.kind === "canonical" ? selectCardVariant({ product, pricing }) : null;
  const selected = product.kind === "canonical"
    ? product.variants.find((variant) => selection?.slug === product.slug && variant.id === selection.variantId) ?? defaultVariant
    : null;
  const presentation = product.kind === "canonical" && selected
    ? resolvePublicVariantPrice({ variant: selected, productId: product.id, quantity: 1, pricing })
    : null;
  const canAdd = selected ? canAddPublicVariant(selected, pricing.mode) : false;
  const headingId = `catalog-${product.slug}-${instanceId}`;
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const href = `/catalog/items/${product.slug}` as const;

  return (
    <article aria-labelledby={headingId} className="catalog-listing-card group record-card flex h-full min-w-0 flex-col p-0">
      <Link className="catalog-image-frame block rounded-t-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        href={href} aria-label={`View ${product.name} image and details`}>
        <CatalogProductVisual product={product} priority={priority} variantLabel={selected?.label} variantId={selected?.id}
          discountPercent={presentation?.state === "priced" && presentation.price.lineSavingsMinor > 0 ? presentation.price.effectiveDiscountBps / 100 : undefined} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col p-5">
        <Heading id={headingId} className="catalog-card-title font-heading text-ink">
          <Link className="rounded-sm hover:text-accent-readable focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" href={href}>{product.name}</Link>
        </Heading>
        {product.kind === "canonical" ? (
          <VariantDropdown product={product} selectedVariantId={selected?.id ?? null} pricing={pricing}
            onChange={(variantId) => setSelection({ slug: product.slug, variantId })} />
        ) : (
          <p className="mt-4 text-sm leading-6 text-muted-ink">
            {product.displayConfigurations.map((option) => option.packageForm).join(" · ")}
          </p>
        )}
        <div className="catalog-card-price mt-auto pt-5" aria-live="polite" aria-atomic="true">
          {product.kind === "canonical" && selected && presentation ? (
            <>
              <p className="mb-2 text-sm text-muted-ink">{selected.label} · {selected.packageQuantity} bottle{selected.packageQuantity === 1 ? "" : "s"} per unit</p>
              <ProductPrice productId={product.id} variant={selected} pricing={pricing} showPurchaseStatus={false} />
              {presentation.state !== "priced" ? <p className="text-sm text-muted-ink">{publicVariantPurchaseLabel(presentation.purchaseState)}</p> : null}
              {presentation.purchaseState === "local_preview" ? <p className="text-xs text-muted-ink">{publicVariantPurchaseLabel(presentation.purchaseState)}</p> : null}
            </>
          ) : <p className="text-sm text-muted-ink">Pricing not available</p>}
        </div>
        <div className="catalog-card-action">
          {product.kind === "canonical" && selected ? (
            <AddToCartButton variantId={selected.id} productName={product.name} variantLabel={selected.label}
              canAdd={canAdd} disabledReason={publicVariantPurchaseLabel(presentation?.purchaseState ?? "unavailable")} className="w-full min-h-11" />
          ) : null}
        </div>
        <Link aria-label={`View catalog item: ${product.name}`} className="record-link mt-2 inline-flex min-h-11 items-center justify-center text-sm" href={href}>View product</Link>
      </div>
    </article>
  );
}
