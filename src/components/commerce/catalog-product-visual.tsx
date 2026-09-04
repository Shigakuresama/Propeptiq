import Image from "next/image";

import type { PublicStorefrontProduct } from "@/catalog/storefront-public";

export function CatalogProductVisual({
  product,
  variantLabel,
  priority = false,
  sizes = "(min-width: 1280px) 28vw, (min-width: 768px) 45vw, calc(100vw - 2rem)",
}: {
  product: PublicStorefrontProduct;
  variantLabel?: string | undefined;
  priority?: boolean | undefined;
  sizes?: string | undefined;
}) {
  return (
    <div className="catalog-product-visual">
      <Image
        alt={`Illustrative laboratory vial presentation for ${product.name}`}
        className="catalog-product-visual__base"
        fill
        loading={priority ? "eager" : "lazy"}
        priority={priority}
        sizes={sizes}
        src="/catalog/vial-base-v2.png"
      />
      <div className="catalog-product-visual__label" aria-hidden="true">
        <span className="catalog-product-visual__name">{product.name}</span>
        {variantLabel ? (
          <span className="catalog-product-visual__variant">{variantLabel}</span>
        ) : null}
        <span className="catalog-product-visual__notice">RESEARCH USE ONLY</span>
      </div>
      <span className="catalog-image-disclosure">Illustrative product presentation</span>
    </div>
  );
}
