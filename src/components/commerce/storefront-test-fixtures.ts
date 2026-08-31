import type {
  PricePresentationMode,
  PublicStorefrontPricingContext,
} from "@/catalog/storefront-price-presentation";
import type {
  CanonicalPublicStorefrontProduct,
  PublicStorefrontVariant,
} from "@/catalog/storefront-public";

export function testPricingContext(
  mode: PricePresentationMode = "test",
  automaticPromotions: PublicStorefrontPricingContext["automaticPromotions"] = [],
): PublicStorefrontPricingContext {
  return Object.freeze({
    mode,
    evaluatedAt: "2026-08-31T12:00:00.000Z",
    automaticPromotions,
  });
}

export const testWinter30 = Object.freeze({
  id: "winter30",
  displayName: "Winter Sale",
  displayCode: "WINTER30",
  discountBps: 3_000,
  enabled: true as const,
  startAt: null,
  endAt: null,
  timezone: "America/Los_Angeles",
  scope: Object.freeze({ kind: "sitewide" as const }),
  applicationMode: "automatic" as const,
});

export function testPublicVariant(
  overrides: Partial<PublicStorefrontVariant> = {},
): PublicStorefrontVariant {
  return Object.freeze({
    id: "variant-5mg",
    sku: "TEST-5MG",
    label: "5 mg",
    amount: Object.freeze({ value: 5, unit: "mg" as const }),
    packageQuantity: 1,
    availability: "available" as const,
    priceStatus: "active" as const,
    baseUnitMinor: 1_000,
    currency: "USD" as const,
    checkoutReady: true,
    ...overrides,
  });
}

export function testCanonicalProduct(
  variants: readonly PublicStorefrontVariant[] = [testPublicVariant()],
  overrides: Partial<CanonicalPublicStorefrontProduct> = {},
): CanonicalPublicStorefrontProduct {
  const defaultVariantId = overrides.defaultVariantId ?? variants[0]?.id ?? "missing-default";
  return Object.freeze({
    kind: "canonical",
    id: "product-alpha",
    slug: "product-alpha",
    name: "Synthetic Product Alpha",
    sourceName: "Synthetic source",
    category: "test",
    description: null,
    image: Object.freeze({
      src: "/catalog/tirzepatide.webp",
      alt: "Synthetic fixture image",
      width: 1254,
      height: 1254,
    }),
    displayConfigurations: Object.freeze([
      Object.freeze({ displayCode: "TEST5", packageForm: "5 mg fixture" }),
    ]),
    aliases: Object.freeze([]),
    popularityRank: 1,
    releasedAt: "2026-08-30T00:00:00.000Z",
    defaultVariantId,
    variants: Object.freeze([...variants]),
    relatedProductIds: Object.freeze([]),
    content: Object.freeze([]),
    ...overrides,
  });
}
