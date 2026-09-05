"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { CanonicalPublicStorefrontProduct } from "@/catalog/storefront-public";
import type { PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import { Button } from "@/components/ui/button";

import { CatalogListingCard } from "./catalog-listing-card";

export type RelatedProductsCarouselProps = Readonly<{
  currentProductId: string;
  products: readonly CanonicalPublicStorefrontProduct[];
  pricing: PublicStorefrontPricingContext;
}>;

export function RelatedProductsCarousel({ currentProductId, products, pricing }: RelatedProductsCarouselProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const instanceId = useId().replaceAll(":", "");
  const headingId = `related-products-heading-${instanceId}`;
  const descriptionId = `related-products-description-${instanceId}`;
  const relatedListId = `related-products-list-${instanceId}`;
  const [navigation, setNavigation] = useState({ previous: false, next: false });
  const seen = new Set<string>();
  const safeProducts = products.filter((product) => {
    if (product.id === currentProductId || seen.has(product.id)) return false;
    seen.add(product.id);
    return product.variants.some((variant) => variant.availability !== "unavailable");
  });

  const updateNavigation = useCallback(() => {
    const list = listRef.current;
    const maximum = list ? Math.max(0, list.scrollWidth - list.clientWidth) : 0;
    const previous = !!list && maximum > 1 && list.scrollLeft > 1;
    const next = !!list && maximum > 1 && list.scrollLeft < maximum - 1;
    setNavigation((current) => current.previous === previous && current.next === next
      ? current
      : { previous, next });
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const frame = window.requestAnimationFrame(updateNavigation);
    const observer = typeof ResizeObserver === "function"
      ? new ResizeObserver(updateNavigation)
      : null;
    observer?.observe(list);
    for (const child of list.children) observer?.observe(child);
    window.addEventListener("resize", updateNavigation);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateNavigation);
      observer?.disconnect();
    };
  }, [products, currentProductId, updateNavigation]);

  if (safeProducts.length === 0) return null;

  function scroll(direction: -1 | 1) {
    const list = listRef.current;
    if (!list) return;
    const reduced = typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollBy({ left: direction * list.clientWidth, behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <section
      aria-describedby={descriptionId}
      aria-labelledby={headingId}
      aria-roledescription="carousel"
      className="mt-16 border-t border-border pt-8 sm:pt-10"
      role="region"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-moss">
            Related catalog
          </p>
          <h2 id={headingId} className="font-heading text-3xl leading-tight text-ink sm:text-4xl">
            Related Products
          </h2>
          <p id={descriptionId} className="mt-2 text-sm leading-6 text-ink/65 sm:text-base">
            Explore more products in this category.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="mr-1 text-xs font-medium uppercase tracking-[0.14em] text-ink/55">
            {safeProducts.length} {safeProducts.length === 1 ? "item" : "items"}
          </span>
          {safeProducts.length > 1 ? (
            <>
              <Button
                aria-controls={relatedListId}
                aria-label="Previous related products"
                className="min-h-11 min-w-11 rounded-full border-border bg-canvas text-ink hover:bg-moss-soft"
                disabled={!navigation.previous}
                onClick={() => scroll(-1)}
                size="icon-lg"
                title="Previous related products"
                type="button"
                variant="outline"
              >
                <ChevronLeft aria-hidden="true" />
              </Button>
              <Button
                aria-controls={relatedListId}
                aria-label="Next related products"
                className="min-h-11 min-w-11 rounded-full border-border bg-canvas text-ink hover:bg-moss-soft"
                disabled={!navigation.next}
                onClick={() => scroll(1)}
                size="icon-lg"
                title="Next related products"
                type="button"
                variant="outline"
              >
                <ChevronRight aria-hidden="true" />
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <ul
        ref={listRef}
        aria-label={`Related products, ${safeProducts.length} ${safeProducts.length === 1 ? "item" : "items"}`}
        className="mt-1 flex touch-auto list-none gap-4 overflow-x-auto overscroll-x-contain px-1 pb-5 pt-6 [scrollbar-width:thin] scroll-px-2 snap-x snap-mandatory focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        id={relatedListId}
        onScroll={updateNavigation}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            scroll(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
        role="list"
        tabIndex={0}
      >
        {safeProducts.map((product) => (
          <li
            className="flex w-[min(82vw,20rem)] shrink-0 snap-start sm:w-[19rem] lg:w-[20rem] [&>*]:w-full"
            key={product.id}
          >
            <CatalogListingCard
              headingLevel={3}
              product={product}
              pricing={pricing}
              priority={false}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
