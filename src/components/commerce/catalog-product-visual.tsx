import Image from "next/image";
import type { CSSProperties } from "react";

import type { PublicStorefrontProduct } from "@/catalog/storefront-public";
import { resolveProductPhotograph } from "@/catalog/product-photography";
import {
  catalogIllustrationDisclosure,
  getCatalogProductVisualScenes,
  getCatalogVisualIdentity,
  type CatalogProductVisualScene,
} from "./catalog-product-visual-manifest";

export const catalogProductVisualPresentation = Object.freeze({
  mode: "illustration_with_catalog_data_plate" as const,
});

export function CatalogProductVisual({
  product,
  variantLabel,
  variantId,
  priority = false,
  sizes = "(min-width: 1280px) 28vw, (min-width: 768px) 45vw, calc(100vw - 2rem)",
  discountPercent,
  scene,
}: {
  product: PublicStorefrontProduct;
  variantLabel?: string | undefined;
  variantId?: string | undefined;
  priority?: boolean | undefined;
  sizes?: string | undefined;
  discountPercent?: number | undefined;
  scene?: CatalogProductVisualScene | undefined;
}) {
  const resolvedScene = scene ?? getCatalogProductVisualScenes(product.slug)[0]!;
  const identity = getCatalogVisualIdentity(product.slug, product.category);
  const photograph = resolveProductPhotograph(product.slug, variantId);
  return (
    <div
      className="catalog-product-visual"
      data-category={product.category}
      data-product-slug={product.slug}
      data-visual-presentation={photograph ? "product_photograph" : catalogProductVisualPresentation.mode}
      data-visual-accent={identity.accent}
      data-visual-signature={identity.recordMark}
      style={{ "--catalog-rule-position": `${identity.rulePositionPercent}%` } as CSSProperties}
    >
      <div className="catalog-product-visual__image">
        <Image
          alt={photograph?.alt ?? `${resolvedScene.sceneLabel} AI-generated catalog illustration for ${product.name}`}
          className="catalog-product-visual__base"
          width={photograph?.width ?? resolvedScene.width}
          height={photograph?.height ?? resolvedScene.height}
          {...(priority ? { preload: true } : { loading: "lazy" as const })}
          sizes={sizes}
          src={photograph?.src ?? resolvedScene.src}
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
      {photograph ? null : <span className="catalog-image-disclosure">{catalogIllustrationDisclosure}</span>}
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
