import { parseStorefrontBindings } from "./storefront-bindings";
import type { StorefrontBinding, StorefrontProduct } from "./storefront-types";

export type StorefrontCatalogData = Readonly<{
  products: readonly StorefrontProduct[];
  bindings: StorefrontBinding;
}>;

/**
 * Production remains deliberately empty until the owner supplies canonical IDs,
 * SKUs, amount/package facts, rank/date/defaults, relations, and mappings.
 */
export const storefrontCatalogData: StorefrontCatalogData = Object.freeze({
  products: Object.freeze([]),
  bindings: parseStorefrontBindings({ products: [], variants: [] }),
});
