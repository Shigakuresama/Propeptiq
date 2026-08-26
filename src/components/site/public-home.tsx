import { ArrowRight, LibraryBig } from "lucide-react";
import Link from "next/link";

import type { PublicCatalog } from "@/catalog/types";
import { Button } from "@/components/ui/button";
import { researchRestrictions } from "@/lib/site-content";

export function PublicHome({ catalog }: { catalog: PublicCatalog }) {
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
              Browse active catalog records, server-provided prices, and linked
              quality records before creating a research-use account at checkout.
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
              {catalog.products.length.toString().padStart(2, "0")}
            </p>
            <p className="mt-3 max-w-[34ch] text-sm leading-6 text-muted-ink">
              Active public catalog record{catalog.products.length === 1 ? "" : "s"}.
              Server records remain authoritative.
            </p>
            {catalog.source === "synthetic-demo" ? (
              <p className="demo-notice mt-6">Synthetic demo records — not real products or offers.</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-container">
          <div className="flex items-center gap-3">
            <LibraryBig aria-hidden="true" className="size-5 text-moss" />
            <p className="eyebrow">Catalog highlights</p>
          </div>
          {catalog.products.length === 0 ? (
            <div className="empty-record mt-8">
              <h2 className="font-heading text-section text-ink">
                No active catalog records are currently available.
              </h2>
              <p className="mt-4 max-w-[62ch] leading-7 text-muted-ink">
                Production remains empty until a separately verified catalog source is connected.
              </p>
              <Link className="record-link mt-6 inline-block" href="/research-use-policy">
                Read the research-use policy
              </Link>
            </div>
          ) : (
            <ul className="catalog-grid mt-8">
              {catalog.products.slice(0, 2).map((product) => (
                <li className="record-card" key={product.id}>
                  <p className="eyebrow">Catalog record</p>
                  <h2 className="mt-4 font-heading text-3xl text-ink">{product.name}</h2>
                  <p className="mt-3 text-sm leading-6 text-muted-ink">{product.packageForm}</p>
                  <Link className="record-link mt-6 inline-block" href={`/catalog/${product.slug}`}>
                    View product record
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
