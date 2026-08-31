"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { PublicStorefrontProduct } from "@/catalog/storefront-public";
import type { PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import { CatalogListingCard } from "@/components/commerce/catalog-listing-card";

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

function exactSourceNames(product: PublicStorefrontProduct): readonly string[] {
  return product.displayConfigurations.map(
    (configuration) => configuration.sourceName ?? product.sourceName,
  );
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b, "en-US")));
}

export function CatalogExplorer({
  products,
  pricing,
}: {
  products: readonly PublicStorefrontProduct[];
  pricing?: PublicStorefrontPricingContext | undefined;
}) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ExactFilters>(emptyFilters);

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

  const visibleProducts = useMemo(() => {
    const searchTerm = normalized(query);
    return products.filter((product) => {
      const sourceNames = exactSourceNames(product);
      const matchesQuery =
        searchTerm.length === 0 ||
        [
          product.name,
          product.sourceName,
          ...sourceNames,
          ...product.displayConfigurations.flatMap((configuration) => [
            configuration.displayCode,
            configuration.packageForm,
          ]),
        ].some((value) => normalized(value).includes(searchTerm));
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
      return matchesQuery && matchesSource && matchesCode && matchesUnit;
    });
  }, [filters, products, query]);

  const filtersActive = query.length > 0 || Object.values(filters).some(Boolean);

  return (
    <section aria-labelledby="catalog-explorer-heading">
      <div className="record-sheet mb-10 p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <Search aria-hidden="true" className="size-5 text-moss" />
          <h2 id="catalog-explorer-heading" className="font-heading text-2xl text-ink">
            Find a catalog record
          </h2>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-2 text-base font-medium text-ink lg:col-span-2 xl:col-span-1">
            Search catalog
            <input
              className="min-h-11 w-full rounded-xl border border-border bg-canvas px-3 text-base text-ink outline-none transition-colors duration-200 placeholder:text-muted-ink focus-visible:border-moss focus-visible:ring-2 focus-visible:ring-ring"
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
        </div>

        <div className="mt-5 flex min-h-11 flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p aria-live="polite" className="text-base text-muted-ink">
            {visibleProducts.length} of {products.length} catalog records
          </p>
          {filtersActive ? (
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-base font-medium text-ink transition-colors duration-200 hover:bg-moss-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setQuery("");
                setFilters(emptyFilters);
              }}
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

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
          No catalog records match these filters.
        </p>
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
