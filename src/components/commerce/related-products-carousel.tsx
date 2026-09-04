"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useRef } from "react";

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
  const seen = new Set<string>();
  const safeProducts = products.filter((product) => {
    if (product.id === currentProductId || seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
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
            Frequently Researched Together
          </h2>
          <p id={descriptionId} className="mt-2 text-sm leading-6 text-ink/65 sm:text-base">
            Continue exploring adjacent records in the PropeptIQ catalog.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="mr-1 text-xs font-medium uppercase tracking-[0.14em] text-ink/55">
            {safeProducts.length} {safeProducts.length === 1 ? "record" : "records"}
          </span>
          <Button
            aria-controls={relatedListId}
            aria-label="Previous related products"
            className="min-h-11 min-w-11 rounded-full border-border bg-canvas text-ink hover:bg-moss-soft"
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
            onClick={() => scroll(1)}
            size="icon-lg"
            title="Next related products"
            type="button"
            variant="outline"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
      <ul
        ref={listRef}
        aria-label={`Related products, ${safeProducts.length} items`}
        className="mt-1 flex touch-pan-x list-none gap-4 overflow-x-auto overscroll-x-contain px-1 pb-5 pt-6 [scrollbar-width:thin] scroll-px-2 snap-x snap-mandatory"
        id={relatedListId}
        role="list"
        tabIndex={0}
      >
        {safeProducts.map((product) => (
          <li
            className="flex w-[min(82vw,20rem)] shrink-0 snap-start sm:w-[19rem] lg:w-[20rem] [&>*]:w-full"
            key={product.id}
          >
            <CatalogListingCard product={product} pricing={pricing} priority={false} />
          </li>
        ))}
      </ul>
    </section>
  );
}
