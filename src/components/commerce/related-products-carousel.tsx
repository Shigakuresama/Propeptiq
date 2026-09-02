"use client";

import { useRef } from "react";

import type { CanonicalPublicStorefrontProduct } from "@/catalog/storefront-public";
import type { PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import { Button } from "@/components/ui/button";

import { CatalogListingCard } from "./catalog-listing-card";

export type RelatedProductsCarouselProps = Readonly<{
  currentProductId: string;
  products: readonly CanonicalPublicStorefrontProduct[];
  pricing: PublicStorefrontPricingContext;
}>;

const relatedListId = "related-products-list";

export function RelatedProductsCarousel({ currentProductId, products, pricing }: RelatedProductsCarouselProps) {
  const listRef = useRef<HTMLUListElement>(null);
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
    <section aria-labelledby="related-products-heading" className="mt-16">
      <div className="flex items-end justify-between gap-4">
        <h2 id="related-products-heading" className="font-heading text-3xl text-ink">
          Frequently Researched Together
        </h2>
        <div className="flex gap-2">
          <Button aria-controls={relatedListId} aria-label="Previous related products" className="min-h-11 min-w-11" onClick={() => scroll(-1)} type="button">←</Button>
          <Button aria-controls={relatedListId} aria-label="Next related products" className="min-h-11 min-w-11" onClick={() => scroll(1)} type="button">→</Button>
        </div>
      </div>
      <ul ref={listRef} id={relatedListId} role="list" className="flex list-none gap-6 overflow-x-auto overscroll-x-contain p-2 scroll-px-2 snap-x snap-proximity">
        {safeProducts.map((product) => (
          <li className="flex w-[min(85vw,24rem)] shrink-0 snap-start md:w-[min(45vw,24rem)] xl:w-[min(28vw,24rem)]" key={product.id}>
            <CatalogListingCard product={product} pricing={pricing} priority={false} />
          </li>
        ))}
      </ul>
    </section>
  );
}
