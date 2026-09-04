import type { PublicStorefrontVariant } from "@/catalog/storefront-public";
import { formatStorefrontMoney, publicVariantPurchaseLabel, resolvePublicVariantPrice, type PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";

export function ProductPrice({
  variant,
  productId,
  quantity = 1,
  pricing,
  showPurchaseStatus = true,
}: {
  variant: PublicStorefrontVariant;
  productId: string;
  quantity?: number;
  pricing: PublicStorefrontPricingContext;
  showPurchaseStatus?: boolean;
}) {
  const presentation = resolvePublicVariantPrice({ variant, productId, quantity, pricing });
  if (presentation.state !== "priced") {
    if (!showPurchaseStatus) return null;
    return (
      <p className="text-sm font-medium text-muted-ink">
        {publicVariantPurchaseLabel(presentation.purchaseState)}
      </p>
    );
  }
  const price = presentation.price;
  const discounted = price.effectiveDiscountBps > 0;
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-baseline gap-2 tabular-nums">
        {discounted ? (
          <del className="text-sm text-muted-ink">
            {formatStorefrontMoney(price.baseUnitMinor)}
          </del>
        ) : null}
        <strong className="text-xl font-semibold text-ink">
          {formatStorefrontMoney(price.effectiveUnitMinor)}
        </strong>
        {discounted ? (
          <span className="rounded-full bg-moss px-2 py-0.5 text-xs font-semibold text-white">
            -{price.effectiveDiscountBps / 100}%
          </span>
        ) : null}
      </div>
      {discounted ? (
        <p className="text-xs font-medium text-muted-ink">
          Save {formatStorefrontMoney(price.lineSavingsMinor)}
        </p>
      ) : null}
      {showPurchaseStatus ? (
        <p className="text-xs font-medium text-muted-ink">
          {publicVariantPurchaseLabel(presentation.purchaseState)}
        </p>
      ) : null}
    </div>
  );
}
