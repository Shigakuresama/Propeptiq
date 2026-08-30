"use client";

import { Search, SearchX, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { BrowseCatalogProduct } from "@/catalog/browse-catalog";
import { CatalogListingCard } from "@/components/commerce/catalog-listing-card";
import {
  DataLabel,
  EmptyState,
  RecordPanel,
} from "@/components/design-system/archive-primitives";
import { Button } from "@/components/ui/button";

type ExactFilters = Readonly<{
  sourceName: string;
  sourceCode: string;
  packageUnit: string;
}>;

const emptyFilters: ExactFilters = Object.freeze({
  sourceName: "",
  sourceCode: "",
  packageUnit: "",
});

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function exactSourceNames(product: BrowseCatalogProduct): readonly string[] {
  return product.variants.map((variant) => variant.sourceName ?? product.sourceName);
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b, "en-US")));
}

export function CatalogExplorer({
  products,
}: {
  products: readonly BrowseCatalogProduct[];
}) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ExactFilters>(emptyFilters);
  const exactFiltersActive = Object.values(filters).some(Boolean);

  const options = useMemo(
    () => ({
      sourceNames: sortedUnique(products.flatMap(exactSourceNames)),
      sourceCodes: sortedUnique(
        products.flatMap((product) => product.variants.map((variant) => variant.code)),
      ),
      packageUnits: sortedUnique(
        products.flatMap((product) =>
          product.variants.map((variant) => variant.packageForm),
        ),
      ),
    }),
    [products],
  );

  const visibleEntries = useMemo(() => {
    const searchTerm = normalized(query);
    return products.flatMap((product) => {
      const sourceNames = exactSourceNames(product);
      const matchesQuery =
        searchTerm.length === 0 ||
        [
          product.name,
          product.sourceName,
          ...sourceNames,
          ...product.variants.flatMap((variant) => [variant.code, variant.packageForm]),
        ].some((value) => normalized(value).includes(searchTerm));
      if (!matchesQuery) return [];

      const matchingVariants = exactFiltersActive
        ? product.variants.filter((variant) => {
            const sourceName = variant.sourceName ?? product.sourceName;
            return (
              (filters.sourceName.length === 0 || sourceName === filters.sourceName) &&
              (filters.sourceCode.length === 0 || variant.code === filters.sourceCode) &&
              (filters.packageUnit.length === 0 ||
                variant.packageForm === filters.packageUnit)
            );
          })
        : product.variants;

      return matchingVariants.length > 0 ? [{ product, variants: matchingVariants }] : [];
    });
  }, [exactFiltersActive, filters, products, query]);

  const filtersActive = query.length > 0 || Object.values(filters).some(Boolean);
  const visibleVariantCount = visibleEntries.reduce(
    (total, entry) => total + entry.variants.length,
    0,
  );

  return (
    <section aria-labelledby="catalog-explorer-heading">
      <RecordPanel className="mb-10 overflow-hidden p-0 sm:mb-12">
        <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="max-w-[58ch]">
            <DataLabel>Index controls</DataLabel>
            <div className="mt-3 flex items-center gap-3">
              <Search aria-hidden="true" className="size-5 shrink-0 text-moss" />
              <h2 id="catalog-explorer-heading" className="font-heading text-3xl text-ink">
                Find a catalog record
              </h2>
            </div>
            <p className="mt-3 text-base leading-7 text-muted-ink">
              Search exact owner-supplied names, source codes, and package configurations.
            </p>
          </div>
          <div className="border-l-2 border-moss pl-4">
            <p aria-live="polite" className="font-semibold tabular-nums text-ink">
              {visibleEntries.length} of {products.length} families
            </p>
            <p className="mt-1 text-sm tabular-nums text-muted-ink">
              {visibleVariantCount} configuration
              {visibleVariantCount === 1 ? "" : "s"} represented
            </p>
          </div>
        </div>

        <form
          className="record-panel-recessed grid gap-5 rounded-none border-x-0 border-b-0 p-5 sm:p-7 lg:grid-cols-2 xl:grid-cols-4"
          onSubmit={(event) => event.preventDefault()}
          role="search"
        >
          <label className="grid gap-2 text-base font-medium text-ink lg:col-span-2 xl:col-span-1">
            Search catalog
            <input
              className="min-h-12 w-full rounded-xl border border-border bg-canvas px-4 text-base text-ink outline-none transition-colors duration-200 placeholder:text-muted-ink focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Name, code, or package unit"
              type="search"
              value={query}
            />
          </label>
          <CatalogSelect
            label="Source name"
            onChange={(sourceName) => setFilters((current) => ({ ...current, sourceName }))}
            options={options.sourceNames}
            value={filters.sourceName}
          />
          <CatalogSelect
            label="Source code"
            onChange={(sourceCode) => setFilters((current) => ({ ...current, sourceCode }))}
            options={options.sourceCodes}
            value={filters.sourceCode}
          />
          <CatalogSelect
            label="Package unit"
            onChange={(packageUnit) => setFilters((current) => ({ ...current, packageUnit }))}
            options={options.packageUnits}
            value={filters.packageUnit}
          />

          {filtersActive && visibleEntries.length > 0 ? (
            <div className="flex min-h-12 items-center lg:col-span-2 xl:col-span-4 xl:justify-end">
              <Button
                className="h-11 rounded-full px-4 text-base"
                onClick={() => {
                  setQuery("");
                  setFilters(emptyFilters);
                }}
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-4" />
                Clear filters
              </Button>
            </div>
          ) : null}
        </form>
      </RecordPanel>

      {visibleEntries.length > 0 ? (
        <ul aria-label="Catalog results" className="catalog-grid">
          {visibleEntries.map(({ product, variants }, index) => (
            <li key={product.slug}>
              <CatalogListingCard
                product={product}
                priority={index < 3}
                variants={variants}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          action={
            <Button
              className="h-11 rounded-full px-5"
              onClick={() => {
                setQuery("");
                setFilters(emptyFilters);
              }}
              type="button"
              variant="outline"
            >
              Clear filters
            </Button>
          }
          description={
            <>
              <p>No catalog records match these filters.</p>
              <p className="mt-2">
                Clear the current search and exact-match filters to restore the full
                owner-supplied index.
              </p>
            </>
          }
          eyebrow="Index result"
          icon={SearchX}
          title="No matching catalog records."
        />
      )}
    </section>
  );
}

function CatalogSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: readonly string[];
  value: string;
}) {
  return (
    <label className="grid gap-2 text-base font-medium text-ink">
      {label}
      <select
        className="min-h-12 w-full rounded-xl border border-border bg-canvas px-4 text-base text-ink outline-none transition-colors duration-200 focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-ring"
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
