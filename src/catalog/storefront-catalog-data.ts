import { browseCatalogProducts } from "./browse-catalog";
import { getRelatedProductIds } from "./storefront-merchandising";
import { storefrontCatalogDecisionManifest } from "./storefront-catalog-manifest";
import { parseStorefrontBindings } from "./storefront-bindings";
import type { StorefrontBinding, StorefrontProduct } from "./storefront-types";
import { getStorefrontProductContent } from "@/content/storefront-product-content";

export type StorefrontCatalogData = Readonly<{ products: readonly StorefrontProduct[]; bindings: StorefrontBinding }>;

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { for (const child of Object.values(value as Record<string, unknown>)) freeze(child); Object.freeze(value); }
  return value;
}
const manifestByProduct = new Map(storefrontCatalogDecisionManifest.products.map((p) => [p.browseSlug, p] as const));
const decisionsByKey = new Map(storefrontCatalogDecisionManifest.variants.map((v) => [`${v.browseSlug}:${v.browseCode}`, v] as const));
const products: StorefrontProduct[] = browseCatalogProducts.map((browse) => {
  const manifest = manifestByProduct.get(browse.slug);
  if (!manifest) throw new Error(`Missing catalog manifest product: ${browse.slug}`);
  const publicContent = getStorefrontProductContent(browse.slug);
  if (!publicContent) throw new Error(`Missing storefront product content: ${browse.slug}`);
  const variants = browse.variants.map((variant) => decisionsByKey.get(`${browse.slug}:${variant.code}`)!);
  const defaultVariant = variants.find((variant) => variant.decisionStatus === "approved_candidate") ?? variants[0]!;
  return { id: manifest.id, slug: browse.slug, name: browse.name, category: browse.category, description: publicContent.description,
    image: { ...browse.image, width: 1254, height: 1254 }, aliases: [browse.sourceName], popularityRank: null,
    releasedAt: null, defaultVariantId: defaultVariant.id, variantIds: manifest.variantIds,
    relatedProductIds: getRelatedProductIds(manifest.id), contentIds: publicContent.contentIds };
});
const variants = browseCatalogProducts.flatMap((browse) => browse.variants.map((source) => {
  const decision = decisionsByKey.get(`${browse.slug}:${source.code}`)!;
  return { id: decision.id, productId: decision.productId, browseCode: source.code, sku: decision.sku, label: decision.publicLabel,
    amount: decision.amount, packageQuantity: decision.packageQuantity, currency: "USD" as const,
    baseUnitMinor: decision.baseUnitMinor, priceStatus: "pending" as const, availability: "preview_only" as const,
    stripeProductId: null, stripePriceId: null };
}));
export const storefrontCatalogData: StorefrontCatalogData = freeze({ products,
  bindings: parseStorefrontBindings({ products: products.map((product) => ({ id: product.id, browseSlug: product.slug,
    popularityRank: product.popularityRank, releasedAt: product.releasedAt, defaultVariantId: product.defaultVariantId,
    relatedProductIds: product.relatedProductIds, contentIds: product.contentIds })), variants }) });
