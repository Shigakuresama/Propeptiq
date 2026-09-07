export type ProductPhotograph = Readonly<{
  productSlug: string;
  variantId: string | null;
  src: `/catalog/photography/${string}`;
  alt: string;
  width: number;
  height: number;
  sourceReference: string;
}>;

/**
 * Only owner-verified photographs belong here. The current /catalog/individual
 * and /catalog/visual-masters assets are documented AI illustrations, not photos.
 * See docs/design/storefront-redesign-report.md for the missing asset dependency.
 */
export const productPhotographs: readonly ProductPhotograph[] = Object.freeze([]);

export function resolveProductPhotograph(slug: string, variantId?: string | null): ProductPhotograph | null {
  return productPhotographs.find((photo) => photo.productSlug === slug && photo.variantId === variantId)
    ?? productPhotographs.find((photo) => photo.productSlug === slug && photo.variantId === null)
    ?? null;
}
