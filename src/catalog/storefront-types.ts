export type PriceStatus = "pending" | "active" | "unavailable";
export type VariantAvailability = "preview_only" | "available" | "unavailable";

export type StorefrontVariant = Readonly<{
  id: string;
  productId: string;
  sku: string;
  label: string;
  amount: Readonly<{ value: number; unit: "mg" | "mcg" | "iu" }> | null;
  packageQuantity: number;
  currency: "USD";
  baseUnitMinor: number;
  priceStatus: PriceStatus;
  availability: VariantAvailability;
  stripeProductId: string | null;
  stripePriceId: string | null;
}>;

export type StorefrontProduct = Readonly<{
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  image: Readonly<{ src: string; alt: string; width: number; height: number }>;
  aliases: readonly string[];
  popularityRank: number | null;
  releasedAt: string | null;
  defaultVariantId: string;
  variantIds: readonly string[];
  relatedProductIds: readonly string[];
  contentIds: readonly string[];
}>;

export type StorefrontBindingProduct = Readonly<{
  id: string;
  browseSlug: string;
  popularityRank: number | null;
  releasedAt: string | null;
  defaultVariantId: string;
  relatedProductIds: readonly string[];
  contentIds: readonly string[];
}>;

export type StorefrontBindingVariant = StorefrontVariant &
  Readonly<{
    browseCode: string;
  }>;

/**
 * Server-side owner-approved joins between legacy browse rows and canonical
 * commerce identities. It is not a public catalog projection.
 */
export type StorefrontBinding = Readonly<{
  products: readonly StorefrontBindingProduct[];
  variants: readonly StorefrontBindingVariant[];
}>;
