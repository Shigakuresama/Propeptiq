import { browseCatalogProducts } from "./browse-catalog";
import { storefrontCatalogDecisionManifest, STOREFRONT_CATALOG_AUDIT_TIMESTAMP } from "./storefront-catalog-manifest";
import { parseStorefrontBindings } from "./storefront-bindings";
import type { StorefrontBinding, StorefrontProduct } from "./storefront-types";

export type StorefrontCatalogData = Readonly<{ products: readonly StorefrontProduct[]; bindings: StorefrontBinding }>;

function amountFromLabel(label: string): { value: number; unit: "mg" | "mcg" | "iu" } | null {
  const match = /^(\d+(?:\.\d+)?)\s*(mg|mcg|iu)$/iu.exec(label.trim());
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? { value, unit: match[2]!.toLowerCase() as "mg" | "mcg" | "iu" } : null;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) { for (const child of Object.values(value as Record<string, unknown>)) freeze(child); Object.freeze(value); }
  return value;
}
const manifestByProduct = new Map(storefrontCatalogDecisionManifest.products.map((p) => [p.browseSlug, p] as const));
const decisionsByKey = new Map(storefrontCatalogDecisionManifest.variants.map((v) => [`${v.browseSlug}:${v.browseCode}`, v] as const));
const products: StorefrontProduct[] = browseCatalogProducts.map((browse, index) => {
  const manifest = manifestByProduct.get(browse.slug);
  if (!manifest) throw new Error(`Missing catalog manifest product: ${browse.slug}`);
  const variants = browse.variants.map((variant) => decisionsByKey.get(`${browse.slug}:${variant.code}`)!);
  const defaultVariant = variants.find((variant) => variant.decisionStatus === "approved_candidate") ?? variants[0]!;
  return { id: manifest.id, slug: browse.slug, name: browse.name, category: browse.category, description: null,
    image: { ...browse.image, width: 1254, height: 1254 }, aliases: [browse.sourceName], popularityRank: index + 1,
    releasedAt: STOREFRONT_CATALOG_AUDIT_TIMESTAMP, defaultVariantId: defaultVariant.id, variantIds: manifest.variantIds, relatedProductIds: [], contentIds: [] };
});
const variants = browseCatalogProducts.flatMap((browse) => browse.variants.map((source) => {
  const decision = decisionsByKey.get(`${browse.slug}:${source.code}`)!;
  return { id: decision.id, productId: decision.productId, browseCode: source.code, sku: decision.sku, label: decision.publicLabel,
    amount: amountFromLabel(decision.publicLabel), packageQuantity: decision.packageQuantity, currency: "USD" as const,
    baseUnitMinor: decision.baseUnitMinor, priceStatus: "pending" as const, availability: "preview_only" as const,
    stripeProductId: null, stripePriceId: null };
}));
export const storefrontCatalogData: StorefrontCatalogData = freeze({ products,
  bindings: parseStorefrontBindings({ products: products.map((product) => ({ id: product.id, browseSlug: product.slug,
    popularityRank: product.popularityRank, releasedAt: product.releasedAt, defaultVariantId: product.defaultVariantId,
    relatedProductIds: product.relatedProductIds, contentIds: product.contentIds })), variants }) });
