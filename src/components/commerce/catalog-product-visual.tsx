import Image from "next/image";
import type { CSSProperties } from "react";

import type { PublicStorefrontProduct } from "@/catalog/storefront-public";
import {
  catalogIllustrationDisclosure,
  catalogProductVisualManifest,
  getCatalogVisualIdentity,
  type CatalogProductVisualScene,
} from "./catalog-product-visual-manifest";

export const catalogProductVisualPresentation = Object.freeze({
  mode: "illustration_with_catalog_data_plate" as const,
  baseAsset: "/catalog/visual-masters/front.webp" as const,
});

export function CatalogProductVisual({
  product,
  variantLabel,
  priority = false,
  sizes = "(min-width: 1280px) 28vw, (min-width: 768px) 45vw, calc(100vw - 2rem)",
  discountPercent,
  scene = catalogProductVisualManifest[0]!,
}: {
  product: PublicStorefrontProduct;
  variantLabel?: string | undefined;
  priority?: boolean | undefined;
  sizes?: string | undefined;
  discountPercent?: number | undefined;
  scene?: CatalogProductVisualScene | undefined;
}) {
  const identity = getCatalogVisualIdentity(product.slug, product.category);
  return (
    <div
      className="catalog-product-visual"
      data-category={product.category}
      data-product-slug={product.slug}
      data-visual-presentation={catalogProductVisualPresentation.mode}
      data-visual-accent={identity.accent}
      data-visual-signature={identity.recordMark}
      style={{ "--catalog-rule-position": `${identity.rulePositionPercent}%` } as CSSProperties}
    >
      <div className="catalog-product-visual__image">
        <Image
          alt={`${scene.sceneLabel} AI-generated catalog illustration for ${product.name}`}
          className="catalog-product-visual__base"
          width={scene.width}
          height={scene.height}
          {...(priority ? { preload: true } : { loading: "lazy" as const })}
          sizes={sizes}
          src={scene.src}
        />
      </div>
      <div className="catalog-product-visual__label">
        <span aria-hidden="true" className="catalog-product-visual__record">{identity.recordMark}</span>
        <span className="catalog-product-visual__name">{product.name}</span>
        {variantLabel ? (
          <span className="catalog-product-visual__variant">{variantLabel}</span>
        ) : null}
        <span className="catalog-product-visual__notice">RESEARCH USE ONLY</span>
      </div>
      <span className="catalog-image-disclosure">{catalogIllustrationDisclosure}</span>
      {discountPercent && discountPercent > 0 ? (
        <span
          aria-label={`-${discountPercent}%`}
          className="catalog-product-visual__discount"
        >
          -{discountPercent}%
        </span>
      ) : null}
    </div>
  );
}
