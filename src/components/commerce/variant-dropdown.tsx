"use client";

import { useId } from "react";
import type { CanonicalPublicStorefrontProduct } from "@/catalog/storefront-public";
import { publicVariantPurchaseState, type PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";

export function VariantDropdown({ product, selectedVariantId, pricing, onChange }: {
  product: CanonicalPublicStorefrontProduct;
  selectedVariantId: string | null;
  pricing: PublicStorefrontPricingContext;
  onChange: (variantId: string) => void;
}) {
  const id = useId();
  return <div className="mt-4">
    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-ink" htmlFor={id}>Amount</label>
    <select className="storefront-select w-full" id={id} aria-label={`${product.name} amount`}
      value={selectedVariantId ?? ""} onChange={(event) => onChange(event.target.value)}>
      {!selectedVariantId ? <option value="" disabled>Select amount</option> : null}
      {product.variants.map((variant) => {
        const state = publicVariantPurchaseState(variant, pricing.mode);
        return <option key={variant.id} value={variant.id} disabled={state === "unavailable" || state === "pricing_pending"}>
          {variant.label}{variant.packageQuantity > 1 ? ` · ${variant.packageQuantity} bottles per unit` : ""}
        </option>;
      })}
    </select>
  </div>;
}
