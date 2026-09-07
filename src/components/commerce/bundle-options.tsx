import type { CanonicalPublicStorefrontProduct, PublicStorefrontVariant } from "@/catalog/storefront-public";
import { formatStorefrontMoney, type PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import { resolveBundleOptions } from "@/catalog/bundle-options";
import { cn } from "@/lib/utils";

export function BundleOptions({ product, variant, pricing, quantity, onSelect }: {
  product: CanonicalPublicStorefrontProduct;
  variant: PublicStorefrontVariant;
  pricing: PublicStorefrontPricingContext;
  quantity: number;
  onSelect: (quantity: number) => void;
}) {
  const options = resolveBundleOptions(product.id, variant, pricing);
  if (!options.length) return null;
  return <fieldset className="bundle-options">
    <legend className="mb-3 font-heading text-xl uppercase text-ink">Bundle and save</legend>
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map((option) => <button key={option.quantity} type="button"
        className={cn("bundle-option", quantity === option.quantity && "bundle-option--selected")}
        aria-pressed={quantity === option.quantity} onClick={() => onSelect(option.quantity)}
        aria-label={`${option.quantity} units, ${option.bottleCount} bottles, ${formatStorefrontMoney(option.price.lineSubtotalMinor)} total`}>
        <span className="bundle-option__discount">-{option.price.effectiveDiscountBps / 100}%</span>
        <span className="font-semibold">{option.quantity} units</span>
        <span className="text-xs text-muted-ink">{option.bottleCount} bottles total</span>
        <strong className="text-lg tabular-nums">{formatStorefrontMoney(option.price.lineSubtotalMinor)}</strong>
        <span className="text-xs text-muted-ink">Save {formatStorefrontMoney(option.price.lineSavingsMinor)}</span>
      </button>)}
    </div>
    <p className="mt-3 text-xs leading-5 text-muted-ink">Same amount in every unit. The best eligible discount applies; offers do not stack.</p>
  </fieldset>;
}
