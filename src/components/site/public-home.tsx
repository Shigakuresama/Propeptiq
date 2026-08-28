import { ArrowRight, LibraryBig } from "lucide-react";
import Link from "next/link";

import type { BrowseCatalogProduct } from "@/catalog/browse-catalog";
import { CatalogListingCard } from "@/components/commerce/catalog-listing-card";
import { Button } from "@/components/ui/button";
import { researchRestrictions } from "@/lib/site-content";

export function PublicHome({
  products,
  variantCount,
}: {
  products: readonly BrowseCatalogProduct[];
  variantCount: number;
}) {
  return (
    <div>
      <section className="border-b border-border">
        <div className="site-container grid gap-12 py-16 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center lg:py-24">
          <div className="max-w-[52rem]">
            <p className="eyebrow">Research-use catalog</p>
            <h1 className="mt-6 text-balance font-heading text-display leading-[0.98] text-ink">
              Research materials, documented for laboratory work.
            </h1>
            <p className="mt-7 max-w-[64ch] text-pretty text-lg leading-8 text-muted-ink sm:text-xl">
              Explore the owner-supplied product catalog and package configurations.
              Purchasing and operational availability remain separate from this browse-only collection.
            </p>
            <div className="restriction-copy mt-7 border-l-2 border-moss pl-4 text-sm leading-6 sm:text-base">
              <p>{researchRestrictions[0]}</p>
              <p>{researchRestrictions[1]}</p>
            </div>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild className="action-primary">
                <Link href="/catalog">
                  Browse catalog
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="action-secondary">
                <Link href="/cart">View cart</Link>
              </Button>
            </div>
          </div>

          <div className="record-sheet p-7 sm:p-9">
            <p className="eyebrow">Current catalog</p>
            <p className="mt-4 font-heading text-4xl text-ink tabular-nums">
              {products.length.toString().padStart(2, "0")}
            </p>
            <p className="mt-3 max-w-[34ch] text-sm leading-6 text-muted-ink">
              Product families spanning {variantCount} supplied package configurations.
              Prices are intentionally excluded.
            </p>
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-container">
          <div className="flex items-center gap-3">
            <LibraryBig aria-hidden="true" className="size-5 text-moss" />
            <p className="eyebrow">Catalog highlights</p>
          </div>
          <ul className="catalog-grid mt-8">
            {products.slice(0, 3).map((product, index) => (
              <li key={product.slug}>
                <CatalogListingCard product={product} priority={index === 0} />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
