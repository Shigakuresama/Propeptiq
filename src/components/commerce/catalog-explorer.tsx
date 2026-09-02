"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import type { PublicStorefrontProduct } from "@/catalog/storefront-public";
import type { PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import { CatalogListingCard } from "@/components/commerce/catalog-listing-card";
import type { CatalogDiscoveryRow } from "@/search/catalog-discovery";
import {
  normalizeSearchText,
  searchEntries,
  sortStorefrontProducts,
  type CatalogSort,
} from "@/search/storefront-search";

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

const sortOptions: readonly Readonly<{ value: CatalogSort; label: string }>[] =
  Object.freeze([
    Object.freeze({ value: "popular", label: "Most popular" }),
    Object.freeze({ value: "price-asc", label: "Price: low to high" }),
    Object.freeze({ value: "price-desc", label: "Price: high to low" }),
    Object.freeze({ value: "alphabetical", label: "A to Z" }),
    Object.freeze({ value: "newest", label: "Newest" }),
  ]);

function exactSourceNames(product: PublicStorefrontProduct): readonly string[] {
  return product.displayConfigurations.map(
    (configuration) => configuration.sourceName ?? product.sourceName,
  );
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b, "en-US")));
}

function invalidDiscovery(): never {
  throw new TypeError("Invalid catalog discovery data.");
}

export function CatalogExplorer({
  discoveryRows,
  products,
  pricing,
}: {
  discoveryRows: readonly CatalogDiscoveryRow[];
  products: readonly PublicStorefrontProduct[];
  pricing: PublicStorefrontPricingContext;
}) {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [filters, setFilters] = useState<ExactFilters>(emptyFilters);
  const [sortMode, setSortMode] = useState<CatalogSort>("popular");
  const [, startQueryTransition] = useTransition();

  const options = useMemo(
    () => ({
      sourceNames: sortedUnique(products.flatMap(exactSourceNames)),
      sourceCodes: sortedUnique(
        products.flatMap((product) =>
          product.displayConfigurations.map((configuration) => configuration.displayCode),
        ),
      ),
      packageUnits: sortedUnique(
        products.flatMap((product) =>
          product.displayConfigurations.map((configuration) => configuration.packageForm),
        ),
      ),
    }),
    [products],
  );

  const productBySlug = useMemo(
    () => new Map(products.map((product) => [product.slug, product] as const)),
    [products],
  );
  const discoveryById = useMemo(
    () => new Map(discoveryRows.map((row) => [row.sortRow.id, row] as const)),
    [discoveryRows],
  );
  const searchEntriesForProducts = useMemo(
    () => discoveryRows.map((row) => row.searchEntry),
    [discoveryRows],
  );

  const visibleProducts = useMemo(() => {
    const normalizedQuery = normalizeSearchText(appliedQuery);
    const queryEligibleIds = normalizedQuery.length === 0
      ? new Set(discoveryRows.map((row) => row.searchEntry.id))
      : new Set(
          searchEntries(searchEntriesForProducts, appliedQuery).map(
            ({ entry }) => entry.id,
          ),
        );

    const survivingSortRows = discoveryRows.flatMap((row) => {
      if (!queryEligibleIds.has(row.searchEntry.id)) return [];
      const product = productBySlug.get(row.productSlug) ?? invalidDiscovery();
      const sourceNames = exactSourceNames(product);
      const matchesSource =
        filters.sourceName.length === 0 || sourceNames.includes(filters.sourceName);
      const matchesCode =
        filters.sourceCode.length === 0 ||
        product.displayConfigurations.some(
          (configuration) => configuration.displayCode === filters.sourceCode,
        );
      const matchesUnit =
        filters.packageUnit.length === 0 ||
        product.displayConfigurations.some(
          (configuration) => configuration.packageForm === filters.packageUnit,
        );
      return matchesSource && matchesCode && matchesUnit ? [row.sortRow] : [];
    });

    return sortStorefrontProducts(survivingSortRows, sortMode).map((sortRow) => {
      const discoveryRow = discoveryById.get(sortRow.id) ?? invalidDiscovery();
      return productBySlug.get(discoveryRow.productSlug) ?? invalidDiscovery();
    });
  }, [
    appliedQuery,
    discoveryById,
    discoveryRows,
    filters,
    productBySlug,
    searchEntriesForProducts,
    sortMode,
  ]);

  const queryUpdating = query !== appliedQuery;
  const exactFiltersActive = Object.values(filters).some(Boolean);
  const normalizedAppliedQuery = normalizeSearchText(appliedQuery);

  function updateQuery(value: string): void {
    setQuery(value);
    startQueryTransition(() => setAppliedQuery(value));
  }

  function clearSearch(): void {
    setQuery("");
    setAppliedQuery("");
  }

  function resetAllFilters(): void {
    setQuery("");
    setAppliedQuery("");
    setFilters(emptyFilters);
  }

  return (
    <section aria-labelledby="catalog-explorer-heading">
      <div className="record-sheet mb-10 p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <Search aria-hidden="true" className="size-5 text-moss" />
          <h2 id="catalog-explorer-heading" className="font-heading text-2xl text-ink">
            Find a catalog record
          </h2>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2 xl:grid-cols-5">
          <label className="grid gap-2 text-base font-medium text-ink lg:col-span-2 xl:col-span-1">
            Search catalog
            <input
              className="min-h-11 w-full rounded-xl border border-border bg-canvas px-3 text-base text-ink outline-none transition-colors duration-200 placeholder:text-muted-ink focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => updateQuery(event.currentTarget.value)}
              placeholder="Name, SKU, alias, or catalog fact"
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
          <label className="grid gap-2 text-base font-medium text-ink">
            Sort catalog
            <select
              className="min-h-11 w-full rounded-xl border border-border bg-canvas px-3 text-base text-ink outline-none transition-colors duration-200 focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => setSortMode(event.currentTarget.value as CatalogSort)}
              value={sortMode}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 flex min-h-11 flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p aria-live="polite" className="text-base text-muted-ink">
            {queryUpdating
              ? "Updating catalog results"
              : `${visibleProducts.length} of ${discoveryRows.length} products`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {query.length > 0 ? (
              <ClearButton label="Clear search" onClick={clearSearch} />
            ) : null}
            {exactFiltersActive ? (
              <ClearButton label="Reset all filters" onClick={resetAllFilters} />
            ) : null}
          </div>
        </div>
      </div>

      <div
        aria-busy={queryUpdating || undefined}
        aria-label="Catalog results region"
        role="region"
      >
        {visibleProducts.length > 0 ? (
          <ul aria-label="Catalog results" className="catalog-grid">
            {visibleProducts.map((product, index) => (
              <li key={product.slug}>
                <CatalogListingCard product={product} priority={index < 3} pricing={pricing} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="record-sheet text-base leading-7 text-muted-ink">
            {normalizedAppliedQuery.length > 0 && exactFiltersActive
              ? "No products match your search and filters."
              : normalizedAppliedQuery.length > 0
                ? "No products match your search."
                : "No products match the selected filters."}
          </p>
        )}
      </div>
    </section>
  );
}

function ClearButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-base font-medium text-ink transition-colors duration-200 hover:bg-moss-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
      type="button"
    >
      <X aria-hidden="true" className="size-4" />
      {label}
    </button>
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
        className="min-h-11 w-full rounded-xl border border-border bg-canvas px-3 text-base text-ink outline-none transition-colors duration-200 focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-ring"
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
