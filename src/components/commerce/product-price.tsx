import type { PublicStorefrontVariant } from "@/catalog/storefront-public";
import { formatStorefrontMoney, resolvePublicVariantPrice, type PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";

export function ProductPrice({ variant, productId, quantity = 1, pricing }: { variant: PublicStorefrontVariant; productId: string; quantity?: number; pricing: PublicStorefrontPricingContext }) {
  const presentation = resolvePublicVariantPrice({ variant, productId, quantity, pricing });
  if (presentation.state !== "priced") return <p className="text-sm font-medium text-muted-ink">{presentation.reason === "pricing_coming_soon" ? "Pricing coming soon" : "Unavailable"}</p>;
  const price = presentation.price;
  const discounted = price.effectiveDiscountBps > 0;
  return <div aria-label={`${formatStorefrontMoney(price.effectiveUnitMinor)}${discounted ? `, ${price.effectiveDiscountBps / 100}% off` : ""}`} className="flex flex-wrap items-baseline gap-2 tabular-nums">
    {discounted ? <span className="text-sm text-muted-ink line-through">{formatStorefrontMoney(price.baseUnitMinor)}</span> : null}
    <span className="text-xl font-semibold text-ink">{formatStorefrontMoney(price.effectiveUnitMinor)}</span>
    {discounted ? <span className="rounded-full bg-moss px-2 py-0.5 text-xs font-semibold text-white">-{price.effectiveDiscountBps / 100}%</span> : null}
  </div>;
}
