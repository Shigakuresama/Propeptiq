import {
  browseCatalogCategories,
  browseCatalogProducts,
  type BrowseCatalogCategory,
} from "./browse-catalog";
import { storefrontCatalogDecisionManifest } from "./storefront-catalog-manifest";

export type RelatedProductIdentity = Readonly<{
  id: string;
  slug: string;
  category: BrowseCatalogCategory;
}>;

const CONFIGURATION_ERROR = "Invalid related-product merchandising configuration";
const MAX_RELATED_PRODUCTS = 4;

function failConfiguration(): never {
  throw new Error(CONFIGURATION_ERROR);
}

function snapshotIdentities(value: readonly RelatedProductIdentity[]): RelatedProductIdentity[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) failConfiguration();
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
    const length = descriptors.length?.value as unknown;
    if (
      typeof length !== "number" || !Number.isSafeInteger(length) || length < 1 ||
      Reflect.ownKeys(descriptors).length !== length + 1
    ) failConfiguration();

    const snapshot: RelatedProductIdentity[] = [];
    for (let index = 0; index < length; index += 1) {
      const entry = descriptors[index];
      if (!entry || !("value" in entry)) failConfiguration();
      const identity: unknown = entry.value;
      if (!identity || typeof identity !== "object") failConfiguration();
      const prototype = Object.getPrototypeOf(identity);
      if (prototype !== Object.prototype && prototype !== null) failConfiguration();
      const fields = Object.getOwnPropertyDescriptors(identity);
      if (Reflect.ownKeys(fields).length !== 3) failConfiguration();
      for (const field of ["id", "slug", "category"]) {
        if (!fields[field] || !("value" in fields[field])) failConfiguration();
      }
      const id: unknown = fields.id!.value;
      const slug: unknown = fields.slug!.value;
      const category: unknown = fields.category!.value;
      if (
        typeof id !== "string" || !id.trim() || id !== id.trim() ||
        typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) ||
        typeof category !== "string" ||
        !browseCatalogCategories.some((supported) => supported === category)
      ) failConfiguration();
      snapshot.push({ id, slug, category: category as BrowseCatalogCategory });
    }
    return snapshot;
  } catch {
    return failConfiguration();
  }
}

/**
 * Derives neutral catalog adjacency from the owner-supplied category only.
 * This is not customer-behavior data, a protocol, or a research/use pairing.
 */
export function buildRelatedProductIdsByProductId(
  productIdentities: readonly RelatedProductIdentity[],
): Readonly<Record<string, readonly string[]>> {
  const identities = snapshotIdentities(productIdentities).sort((left, right) => {
    if (left.slug !== right.slug) return left.slug < right.slug ? -1 : 1;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
  const productIds = new Set<string>();
  const productSlugs = new Set<string>();
  const productsByCategory = new Map<BrowseCatalogCategory, RelatedProductIdentity[]>();

  for (const identity of identities) {
    if (
      productIds.has(identity.id) ||
      productSlugs.has(identity.slug)
    ) {
      failConfiguration();
    }
    productIds.add(identity.id);
    productSlugs.add(identity.slug);
    const categoryProducts = productsByCategory.get(identity.category) ?? [];
    categoryProducts.push(identity);
    productsByCategory.set(identity.category, categoryProducts);
  }

  const result: Record<string, readonly string[]> = Object.create(null) as Record<
    string,
    readonly string[]
  >;
  for (const identity of identities) {
    const categoryProducts = productsByCategory.get(identity.category);
    if (!categoryProducts) failConfiguration();
    const sourceIndex = categoryProducts.findIndex(
      (candidate) => candidate.id === identity.id,
    );
    if (sourceIndex < 0) failConfiguration();

    const relatedIds: string[] = [];
    const availablePeers = categoryProducts.length - 1;
    const relatedCount = Math.min(MAX_RELATED_PRODUCTS, availablePeers);
    for (let offset = 1; offset <= relatedCount; offset += 1) {
      const candidate = categoryProducts[(sourceIndex + offset) % categoryProducts.length];
      if (!candidate || candidate.id === identity.id || relatedIds.includes(candidate.id)) {
        failConfiguration();
      }
      relatedIds.push(candidate.id);
    }
    result[identity.id] = Object.freeze(relatedIds);
  }

  return Object.freeze(result);
}

const browseProductBySlug = new Map(
  browseCatalogProducts.map((product) => [product.slug, product] as const),
);
const merchandisingProducts = storefrontCatalogDecisionManifest.products.map(
  ({ browseSlug, id }) => {
    const product = browseProductBySlug.get(browseSlug);
    if (!product) failConfiguration();
    return Object.freeze({ id, slug: browseSlug, category: product.category });
  },
);

export const storefrontRelatedProductIdsByProductId =
  buildRelatedProductIdsByProductId(merchandisingProducts);

export function getRelatedProductIds(productId: string): readonly string[] {
  if (!Object.prototype.hasOwnProperty.call(storefrontRelatedProductIdsByProductId, productId)) {
    throw new Error("Related products are not configured for this product");
  }
  return storefrontRelatedProductIdsByProductId[productId]!;
}
