import type { PublicStorefrontVariant } from "./storefront-public";
import { resolvePublicVariantPrice, type PublicStorefrontPricingContext } from "./storefront-price-presentation";
import { QUANTITY_TIERS } from "@/domain/storefront-pricing";

/** Presentation of existing quantity rules. No extra tier or stacking arithmetic. */
export function resolveBundleOptions(productId: string, variant: PublicStorefrontVariant, pricing: PublicStorefrontPricingContext) {
  if (variant.priceStatus !== "active" || variant.availability === "unavailable") return [];
  return QUANTITY_TIERS.filter((tier) => tier.minQuantity > 1).flatMap((tier) => {
    const presentation = resolvePublicVariantPrice({ productId, variant, pricing, quantity: tier.minQuantity });
    return presentation.state === "priced" && presentation.price.lineSavingsMinor > 0
      ? [{ quantity: tier.minQuantity, bottleCount: tier.minQuantity * variant.packageQuantity, price: presentation.price }]
      : [];
  });
}
