"use client";

import { useRef, useState, type ComponentProps } from "react";
import Link from "next/link";
import { canAddPublicVariant, formatStorefrontMoney, publicVariantPurchaseLabel, resolvePublicVariantPrice, type PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import type { CanonicalPublicStorefrontProduct } from "@/catalog/storefront-public";
import { MAX_CART_ITEM_QUANTITY } from "@/cart/cart-storage";
import { AddToCartButton } from "./add-to-cart-button";
import { MobilePurchaseBar } from "./mobile-purchase-bar";
import { BundleOptions } from "./bundle-options";
import { VariantSelector } from "./variant-selector";
import { QuantityStepper } from "./quantity-stepper";

type ProductPurchasePanelBaseProps = Readonly<{
  onSelectedQuantityChange?: (quantity: number | null) => void;
  product: CanonicalPublicStorefrontProduct;
  pricing: PublicStorefrontPricingContext;
}>;
export type ProductPurchasePanelProps = ProductPurchasePanelBaseProps & (
  | Readonly<{ selectedVariantId: string | null; onSelectedVariantIdChange: (variantId: string) => void }>
  | Readonly<{ selectedVariantId?: never; onSelectedVariantIdChange?: never }>
);

export function ProductPurchasePanel(props: ProductPurchasePanelProps) {
  const { product, pricing } = props;
  const inlineSummaryRef = useRef<HTMLDivElement>(null);
  const [internalSelectedVariantId, setInternalSelectedVariantId] = useState<string | null>(() =>
    product.variants.some((v) => v.id === product.defaultVariantId) ? product.defaultVariantId : null);
  const selectedVariantId = "selectedVariantId" in props ? props.selectedVariantId : internalSelectedVariantId;
  const [quantity, setQuantity] = useState(1);
  const [quantityValid, setQuantityValid] = useState(true);
  const selected = product.variants.find((variant) => variant.id === selectedVariantId) ?? null;
  const presentation = selected ? resolvePublicVariantPrice({ variant: selected, productId: product.id, quantity, pricing }) : null;
  const canAdd = quantityValid && selected !== null && canAddPublicVariant(selected, pricing.mode);
  const chooseQuantity = (next: number | null) => {
    if (next === null) { setQuantityValid(false); props.onSelectedQuantityChange?.(null); return; }
    if (!Number.isInteger(next) || next < 1 || next > MAX_CART_ITEM_QUANTITY) return;
    setQuantityValid(true);
    setQuantity(next);
    props.onSelectedQuantityChange?.(next);
  };
  const status = !quantityValid ? "Enter a valid quantity" : selected === null ? "Choose an amount" : presentation ? publicVariantPurchaseLabel(presentation.purchaseState, "purchase_summary") : "Currently unavailable";
  const price = presentation?.state === "priced" ? presentation.price : null;
  const orderingPaused = presentation?.purchaseState === "cart_preview" || presentation?.purchaseState === "checkout_unavailable";
  const addToCartProps: ComponentProps<typeof AddToCartButton> = {
    variantId: selected?.id ?? null, quantity, productName: product.name,
    ...(selected ? { variantLabel: selected.label } : {}), canAdd,
    disabledReason: status,
  };
  return <section className="product-purchase-panel" aria-labelledby="purchase-heading">
    <h2 id="purchase-heading" tabIndex={-1} className="product-purchase-heading w-fit text-xs font-semibold tracking-wider text-muted-ink">Select your product</h2>
    <VariantSelector productId={product.id} productName={product.name} variants={product.variants} selectedVariantId={selectedVariantId} quantity={quantity} pricing={pricing}
      onSelectedVariantIdChange={(variantId) => (props.onSelectedVariantIdChange ?? setInternalSelectedVariantId)(variantId)} />
    {selected ? <BundleOptions product={product} variant={selected} pricing={pricing} quantity={quantity} onSelect={chooseQuantity} /> : null}
    <div ref={inlineSummaryRef} className="purchase-summary">
      <div className="purchase-quantity-price">
        <div>
          <QuantityStepper quantity={quantity} maximum={MAX_CART_ITEM_QUANTITY} onChange={chooseQuantity} />
          {selected && selected.packageQuantity > 1 ? <p className="mt-1 text-xs text-muted-ink">{selected.packageQuantity} bottles per unit</p> : null}
        </div>
        <div className="purchase-price" role="status" aria-label="Purchase summary" aria-live="polite" aria-atomic="true">
          <p className="text-xs font-medium text-muted-ink">{selected?.label ?? "No amount selected"} · {quantity} unit{quantity === 1 ? "" : "s"} · Total</p>
          {price ? <>
            <div className="mt-1 flex flex-wrap items-baseline justify-end gap-2">
              <strong className="text-2xl tabular-nums">{formatStorefrontMoney(price.lineSubtotalMinor)}</strong>
              {price.lineSavingsMinor > 0 ? <del className="text-muted-ink">{formatStorefrontMoney(price.lineSubtotalMinor + price.lineSavingsMinor)}</del> : null}
            </div>
            <p className="mt-1 text-xs text-muted-ink">{formatStorefrontMoney(price.effectiveUnitMinor)} per unit</p>
            {presentation?.purchaseState === "local_preview" ? <p className="mt-2 text-sm font-semibold">{status}</p> : null}
            {price.lineSavingsMinor > 0 ? <p className="mt-1 text-xs font-semibold text-accent-readable">Save {formatStorefrontMoney(price.lineSavingsMinor)} total</p> : null}
            {price.appliedPromotionIds.length ? <p className="mt-1 text-xs text-accent-readable">{price.appliedPromotionIds.map((promotionId) => {
              const promotion = pricing.automaticPromotions.find((entry) => entry.id === promotionId);
              return promotion?.displayCode ?? promotion?.displayName;
            }).filter(Boolean).join(", ")} −{price.campaignDiscountBps / 100}%</p> : null}
            {price.volumeDiscountBps > 0 ? <p className="mt-1 text-xs text-accent-readable">Bundle −{price.volumeDiscountBps / 100}% extra: save {formatStorefrontMoney(price.lineVolumeSavingsMinor)}</p> : null}
          </> : <p className="mt-3 text-sm">{status}</p>}
        </div>
      </div>
      <div className="mt-4"><AddToCartButton {...addToCartProps} className="w-full uppercase" /></div>
      {orderingPaused ? <p className="mt-2 text-xs leading-5 text-muted-ink">{canAdd ? "Save your selection in the cart. " : ""}Ordering is not open. <Link className="record-link" href="/contact">Contact us</Link> for availability.</p> : null}
      <p className="mt-2 text-xs leading-5 text-muted-ink">For laboratory research only. Not for human or veterinary use. <Link className="record-link" href="/research-use-policy">Research-use policy</Link>.</p>
    </div>
    <MobilePurchaseBar productSlug={product.slug} inlineSummaryRef={inlineSummaryRef} quantity={quantity} presentation={presentation} status={status} addToCartProps={addToCartProps} />
  </section>;
}
