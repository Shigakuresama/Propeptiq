import { ArrowUpRight, LibraryBig } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function CatalogEmptyState({ headingLevel = "h2" }: { headingLevel?: "h1" | "h2" }) {
  const Heading = headingLevel;

  return (
    <section
      aria-labelledby="catalog-empty-heading"
      className="grid gap-8 rounded-[0.875rem] border border-border bg-surface p-6 shadow-soft sm:p-8 lg:grid-cols-[auto_1fr_auto] lg:items-center lg:p-10"
    >
      <div className="grid size-12 place-items-center rounded-full bg-moss-soft text-moss">
        <LibraryBig aria-hidden="true" className="size-5" />
      </div>
      <div className="max-w-[62ch]">
        <p className="eyebrow">Catalog state</p>
        <Heading
          id="catalog-empty-heading"
          className="mt-3 font-heading text-3xl leading-tight text-ink sm:text-4xl"
        >
          No research materials are currently approved for sale.
        </Heading>
        <p className="mt-4 leading-7 text-muted-ink">
          Products, categories, prices, inventory, and evidence records will appear
          only after the corresponding business and compliance approvals exist.
        </p>
      </div>
      <div className="flex flex-wrap gap-3 lg:justify-end">
        <Button
          asChild
          className="h-11 rounded-full bg-ink px-5 text-canvas hover:bg-slate"
        >
          <Link href="/access">
            Review access
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="h-11 rounded-full border-ink/20 bg-transparent px-5 text-ink hover:bg-moss-soft/60"
        >
          <Link href="/research-use-policy">Read policy</Link>
        </Button>
      </div>
    </section>
  );
}
