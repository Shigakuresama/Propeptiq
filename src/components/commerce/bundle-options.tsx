import Image from "next/image";
import type { CanonicalPublicStorefrontProduct, PublicStorefrontVariant } from "@/catalog/storefront-public";
import { formatStorefrontMoney, type PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import { resolveBundleOptions } from "@/catalog/bundle-options";
import { resolveProductPhotograph } from "@/catalog/product-photography";
import { cn } from "@/lib/utils";
import { getCatalogProductVisualScenes } from "./catalog-product-visual-manifest";

export function BundleOptions({ product, variant, pricing, quantity, onSelect }: {
  product: CanonicalPublicStorefrontProduct;
  variant: PublicStorefrontVariant;
  pricing: PublicStorefrontPricingContext;
  quantity: number;
  onSelect: (quantity: number) => void;
}) {
  const options = resolveBundleOptions(product.id, variant, pricing);
  if (!options.length) return null;
  const scene = getCatalogProductVisualScenes(product.slug)[0]!;
  const photograph = resolveProductPhotograph(product.slug, variant.id);
  const currentBottles = quantity * variant.packageQuantity;
  return <fieldset className="bundle-options">
    <legend className="purchase-field-label">Bundle and save</legend>
    <div className="bundle-options__grid">
      {options.map((option) => {
        const selected = currentBottles >= option.minBottleCount &&
          (option.maxBottleCount === null || currentBottles <= option.maxBottleCount);
        const bulk = option.maxBottleCount === null;
        const tone = bulk ? "bulk" : option.minBottleCount === 2 ? "recommended" : "value";
        return <button key={option.quantity} type="button"
          className={cn("bundle-option", `bundle-option--${tone}`, selected && "bundle-option--selected")}
          aria-pressed={selected} onClick={() => onSelect(option.quantity)}
          aria-label={`${option.bottleCount} bottles, ${option.discountBps / 100}% extra bundle discount, ${formatStorefrontMoney(option.price.lineSubtotalMinor)} total`}>
          <span className="bundle-option__tag">{bulk ? "Bulk · Best value" : option.minBottleCount === 2 ? "Recommended" : "Value pack"}</span>
          <span className="bundle-option__bottles" aria-hidden="true">
            {Array.from({ length: bulk ? 3 : Math.min(option.bottleCount, 4) }, (_, index) => <Image
              key={index} alt="" width={photograph?.width ?? scene.width} height={photograph?.height ?? scene.height}
              src={photograph?.src ?? scene.src} sizes="48px" className="bundle-option__bottle" />)}
            {bulk ? <span className="bundle-option__count">×{option.bottleCount}</span> : null}
          </span>
          <span className="text-sm font-semibold">{option.bottleCount} bottles</span>
          {variant.packageQuantity > 1 ? <span className="text-xs text-muted-ink">{option.quantity} unit{option.quantity === 1 ? "" : "s"}</span> : null}
          <span className="bundle-option__discount">Extra {option.discountBps / 100}% off</span>
          <strong className="text-sm tabular-nums">{formatStorefrontMoney(option.price.lineSubtotalMinor)}</strong>
          <span className="text-xs text-muted-ink">{formatStorefrontMoney(Math.round(option.price.effectiveUnitMinor / variant.packageQuantity))} / bottle</span>
        </button>;
      })}
    </div>
    <p className="mt-2 text-xs leading-5 text-muted-ink">Bundle savings apply after the sale price. Same product and amount: 2–3 bottles save 3% extra, 4–10 save 6%, and 11+ save 30%.</p>
  </fieldset>;
}
