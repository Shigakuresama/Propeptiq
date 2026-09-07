import type { CanonicalPublicStorefrontProduct } from "@/catalog/storefront-public";
import { publicVariantPurchaseState, type PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import { cn } from "@/lib/utils";

export type VariantSelectorProps = Readonly<{
  productId: string; productName: string;
  variants: CanonicalPublicStorefrontProduct["variants"];
  selectedVariantId: string | null; quantity: number;
  pricing: PublicStorefrontPricingContext;
  onSelectedVariantIdChange: (variantId: string) => void;
}>;

export function VariantSelector({ productId, productName, variants, selectedVariantId, pricing, onSelectedVariantIdChange }: VariantSelectorProps) {
  return <fieldset aria-label={`${productName} variants`}>
    <legend className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink">Amount</legend>
    <div className="amount-options">
      {variants.map((variant) => {
        const state = publicVariantPurchaseState(variant, pricing.mode);
        const selected = variant.id === selectedVariantId;
        const unavailable = state === "unavailable";
        return <label key={variant.id} className={cn("amount-option", selected && "amount-option--selected", unavailable && "amount-option--unavailable")}>
          <input className="sr-only" type="radio" name={`variant-${productId}`} value={variant.id}
            checked={selected} disabled={unavailable} onChange={() => onSelectedVariantIdChange(variant.id)} />
          <span className="font-semibold">{variant.label}</span>
          {variant.packageQuantity > 1 ? <span className="text-xs">{variant.packageQuantity} bottles per unit</span> : null}
          {unavailable || state === "pricing_pending" ? <span className="text-xs text-muted-ink">{unavailable ? "Unavailable" : "Price unavailable"}</span> : null}
        </label>;
      })}
    </div>
  </fieldset>;
}
