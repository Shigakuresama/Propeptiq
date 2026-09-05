"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import type { PublicStorefrontProduct } from "@/catalog/storefront-public";
import { CatalogProductVisual } from "./catalog-product-visual";
import { catalogProductVisualManifest as scenes } from "./catalog-product-visual-manifest";

type GalleryProps = {
  product: PublicStorefrontProduct;
  variantLabel?: string | undefined;
  discountPercent?: number | undefined;
};

export function CatalogProductGallery(props: GalleryProps) {
  return <ProductGallery key={props.product.slug} {...props} />;
}

function ProductGallery({ product, variantLabel, discountPercent }: GalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const scene = scenes[activeIndex]!;

  function moveTo(index: number) {
    setActiveIndex((index + scenes.length) % scenes.length);
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % scenes.length
      : event.key === "ArrowLeft" ? (index + scenes.length - 1) % scenes.length
        : event.key === "Home" ? 0
          : event.key === "End" ? scenes.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setActiveIndex(next);
    tabs.current[next]?.focus();
  }

  return (
    <section
      aria-label={`${product.name} product illustration gallery`}
      aria-roledescription="carousel"
      className="catalog-product-gallery"
    >
      <div
        aria-labelledby={`${id}-tab-${scene.id}`}
        className="catalog-product-gallery__panel"
        id={`${id}-panel`}
        role="tabpanel"
        tabIndex={0}
      >
        <CatalogProductVisual
          product={product}
          variantLabel={variantLabel}
          discountPercent={discountPercent}
          scene={scene}
          priority={activeIndex === 0}
          sizes="(min-width: 1024px) 35vw, 60vw"
        />
      </div>
      <div className="catalog-product-gallery__toolbar">
        <button
          aria-label="Previous product illustration"
          className="catalog-product-gallery__arrow"
          onClick={() => moveTo(activeIndex - 1)}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={18} />
        </button>
        <p aria-atomic="true" aria-live="polite" role="status">
          View {activeIndex + 1} of {scenes.length}: {scene.sceneLabel}
        </p>
        <button
          aria-label="Next product illustration"
          className="catalog-product-gallery__arrow"
          onClick={() => moveTo(activeIndex + 1)}
          type="button"
        >
          <ArrowRight aria-hidden="true" size={18} />
        </button>
      </div>
      <div aria-label="Product illustration views" className="catalog-product-gallery__tabs" role="tablist">
        {scenes.map((item, index) => (
          <button
            aria-controls={`${id}-panel`}
            aria-selected={index === activeIndex}
            className="catalog-product-gallery__tab"
            id={`${id}-tab-${item.id}`}
            key={item.id}
            onClick={() => setActiveIndex(index)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
            ref={(element) => { tabs.current[index] = element; }}
            role="tab"
            tabIndex={index === activeIndex ? 0 : -1}
            type="button"
          >
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            {item.sceneLabel}
          </button>
        ))}
      </div>
      <p className="catalog-product-gallery__caption">
        {scene.caption} {scene.truthNote}
      </p>
    </section>
  );
}
