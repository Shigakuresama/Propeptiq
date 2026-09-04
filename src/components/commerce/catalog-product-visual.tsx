import Image from "next/image";

import type { PublicStorefrontProduct } from "@/catalog/storefront-public";

export const catalogProductVisualPresentation = Object.freeze({
  mode: "composite_data_label_overlay" as const,
  baseAsset: "/catalog/vial-base-v2.png" as const,
});

export function CatalogProductVisual({
  product,
  variantLabel,
  priority = false,
  sizes = "(min-width: 1280px) 28vw, (min-width: 768px) 45vw, calc(100vw - 2rem)",
  discountPercent,
}: {
  product: PublicStorefrontProduct;
  variantLabel?: string | undefined;
  priority?: boolean | undefined;
  sizes?: string | undefined;
  discountPercent?: number | undefined;
}) {
  return (
    <div
      className="catalog-product-visual"
      data-category={product.category}
      data-product-slug={product.slug}
      data-visual-presentation={catalogProductVisualPresentation.mode}
    >
      <Image
        alt=""
        aria-hidden="true"
        className="catalog-product-visual__backdrop"
        fill
        loading="lazy"
        sizes={sizes}
        src={product.image.src}
      />
      <Image
        alt={`Illustrative laboratory vial presentation for ${product.name}`}
        className="catalog-product-visual__base"
        fill
        loading={priority ? "eager" : "lazy"}
        priority={priority}
        sizes={sizes}
        src={catalogProductVisualPresentation.baseAsset}
      />
      <div className="catalog-product-visual__label" aria-hidden="true">
        <span className="catalog-product-visual__name">{product.name}</span>
        {variantLabel ? (
          <span className="catalog-product-visual__variant">{variantLabel}</span>
        ) : null}
        <span className="catalog-product-visual__notice">RESEARCH USE ONLY</span>
      </div>
      {discountPercent && discountPercent > 0 ? (
        <span
          aria-label={`-${discountPercent}%`}
          className="absolute left-3 top-3 z-10 rounded-full bg-moss px-3 py-1 text-xs font-semibold text-white"
        >
          -{discountPercent}%
        </span>
      ) : null}
      <span className="catalog-image-disclosure">Illustrative product presentation</span>
    </div>
  );
}
