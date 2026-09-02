import {
  resolvePublicVariantPrice,
  selectCardVariant,
  type PublicStorefrontPricingContext,
} from "@/catalog/storefront-price-presentation";
import type { PublicStorefrontProduct } from "@/catalog/storefront-public";

import { buildStorefrontSearchIndex } from "./storefront-index";
import type {
  ProductPriceSortState,
  SearchEntry,
  StorefrontProductSortRow,
} from "./storefront-search";

export type CatalogDiscoveryRow = Readonly<{
  productSlug: string;
  searchEntry: SearchEntry;
  sortRow: StorefrontProductSortRow;
}>;

const INVALID_DISCOVERY_MESSAGE = "Invalid catalog discovery projection.";

function invalidDiscovery(): never {
  throw new TypeError(INVALID_DISCOVERY_MESSAGE);
}

function canonicalPrice(
  product: Extract<PublicStorefrontProduct, { kind: "canonical" }>,
  pricing: PublicStorefrontPricingContext,
): ProductPriceSortState {
  const variant = selectCardVariant({ product, pricing });
  if (variant === null) return Object.freeze({ state: "unavailable" });

  const presentation = resolvePublicVariantPrice({
    variant,
    productId: product.id,
    quantity: 1,
    pricing,
  });
  if (presentation.state === "priced") {
    return Object.freeze({
      state: "active",
      effectiveMinor: presentation.price.effectiveUnitMinor,
    });
  }
  return Object.freeze({ state: presentation.state });
}

export function buildCatalogDiscoveryRows(input: Readonly<{
  products: readonly PublicStorefrontProduct[];
  pricing: PublicStorefrontPricingContext;
}>): readonly CatalogDiscoveryRow[] {
  const searchEntries = buildStorefrontSearchIndex({
    products: input.products,
    information: [],
  }).entries;
  if (searchEntries.length !== input.products.length) invalidDiscovery();

  const slugs = new Set<string>();
  const ids = new Set<string>();
  const rows = input.products.map((product, index): CatalogDiscoveryRow => {
    const searchEntry = searchEntries[index];
    const productSlug = product.slug;
    const expectedId = `product:${productSlug}`;
    const expectedHref = `/catalog/items/${productSlug}`;

    if (
      searchEntry === undefined ||
      searchEntry.group !== "products" ||
      searchEntry.id !== expectedId ||
      searchEntry.href !== expectedHref ||
      slugs.has(productSlug) ||
      ids.has(searchEntry.id)
    ) {
      return invalidDiscovery();
    }
    slugs.add(productSlug);
    ids.add(searchEntry.id);

    const sortRow = Object.freeze({
      id: searchEntry.id,
      name: product.name,
      popularityRank: product.kind === "canonical" ? product.popularityRank : null,
      releasedAt: product.kind === "canonical" ? product.releasedAt : null,
      price:
        product.kind === "canonical"
          ? canonicalPrice(product, input.pricing)
          : Object.freeze({ state: "pending" as const }),
    });
    if (searchEntry.id !== sortRow.id) invalidDiscovery();

    return Object.freeze({ productSlug, searchEntry, sortRow });
  });

  return Object.freeze(rows);
}
