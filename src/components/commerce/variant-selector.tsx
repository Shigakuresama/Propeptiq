import type { CanonicalPublicStorefrontProduct } from "@/catalog/storefront-public";
import type { PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import { publicVariantPurchaseState } from "@/catalog/storefront-price-presentation";
import { cn } from "@/lib/utils";

export type VariantSelectorProps = Readonly<{
  productId: string;
  productName: string;
  variants: CanonicalPublicStorefrontProduct["variants"];
  selectedVariantId: string | null;
  quantity: number;
  pricing: PublicStorefrontPricingContext;
  onSelectedVariantIdChange: (variantId: string) => void;
}>;

function status(variant: VariantSelectorProps["variants"][number], productId: string, quantity: number, pricing: PublicStorefrontPricingContext): string {
  const state = publicVariantPurchaseState(variant, pricing.mode);
  return state === "unavailable" ? "Unavailable" : state === "pricing_pending" ? "Pricing coming soon" : state === "local_preview" ? "Preview only" : state === "checkout_unavailable" ? "Checkout unavailable" : "Available";
}

export function VariantSelector({ productId, productName, variants, selectedVariantId, quantity, pricing, onSelectedVariantIdChange }: VariantSelectorProps) {
  const name = `variant-${productId}`;
  return (
    <fieldset className="space-y-3" aria-label={`${productName} variants`}>
      <legend className="font-heading text-2xl text-ink">Choose a variant</legend>
      {variants.map((variant) => {
        const selected = variant.id === selectedVariantId;
        const amount = variant.amount ? `${variant.amount.value} ${variant.amount.unit}` : "Amount not specified";
        return (
          <label key={variant.id} className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", selected && "border-moss bg-moss-soft/40")}>
            <input className="size-4 shrink-0 accent-moss" type="radio" name={name} value={variant.id} checked={selected} onChange={() => onSelectedVariantIdChange(variant.id)} />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <span className="block font-semibold text-ink">{variant.label}</span>
              <span className="block text-sm text-muted-ink">{amount} · {status(variant, productId, quantity, pricing)}{selected ? " · Selected" : ""}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
