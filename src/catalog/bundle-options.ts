import type { PublicStorefrontVariant } from "./storefront-public";
import { resolvePublicVariantPrice, type PublicStorefrontPricingContext } from "./storefront-price-presentation";
import { QUANTITY_TIERS } from "@/domain/storefront-pricing";

/** Whole-package choices for reachable bottle tiers; all amounts use shared pricing. */
export function resolveBundleOptions(productId: string, variant: PublicStorefrontVariant, pricing: PublicStorefrontPricingContext) {
  if (variant.priceStatus !== "active" || variant.availability === "unavailable") return [];
  if (!Number.isSafeInteger(variant.packageQuantity) || variant.packageQuantity < 1) return [];
  return QUANTITY_TIERS.filter((tier) => tier.minBottleCount > 1).flatMap((tier) => {
    const quantity = Math.ceil(tier.minBottleCount / variant.packageQuantity);
    const bottleCount = quantity * variant.packageQuantity;
    if (tier.maxBottleCount !== null && bottleCount > tier.maxBottleCount) return [];
    const presentation = resolvePublicVariantPrice({ productId, variant, pricing, quantity });
    return presentation.state === "priced" && presentation.price.lineSavingsMinor > 0
      ? [{ ...tier, quantity, bottleCount, price: presentation.price }]
      : [];
  });
}
