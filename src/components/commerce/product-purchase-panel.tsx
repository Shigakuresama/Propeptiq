"use client";

import { useId, useRef, useState, type ComponentProps } from "react";
import Link from "next/link";
import { canAddPublicVariant, formatStorefrontMoney, publicVariantPurchaseLabel, resolvePublicVariantPrice, type PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import type { CanonicalPublicStorefrontProduct } from "@/catalog/storefront-public";
import { MAX_CART_ITEM_QUANTITY } from "@/cart/cart-storage";
import { AddToCartButton } from "./add-to-cart-button";
import { MobilePurchaseBar } from "./mobile-purchase-bar";
import { BundleOptions } from "./bundle-options";
import { VariantSelector } from "./variant-selector";

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
  const id = useId();
  const inlineSummaryRef = useRef<HTMLDivElement>(null);
  const [internalSelectedVariantId, setInternalSelectedVariantId] = useState<string | null>(() =>
    product.variants.some((v) => v.id === product.defaultVariantId) ? product.defaultVariantId : null);
  const selectedVariantId = "selectedVariantId" in props ? props.selectedVariantId : internalSelectedVariantId;
  const [quantity, setQuantity] = useState(1);
  const selected = product.variants.find((variant) => variant.id === selectedVariantId) ?? null;
  const presentation = selected ? resolvePublicVariantPrice({ variant: selected, productId: product.id, quantity, pricing }) : null;
  const canAdd = selected !== null && canAddPublicVariant(selected, pricing.mode);
  const chooseQuantity = (next: number) => {
    if (!Number.isInteger(next) || next < 1 || next > MAX_CART_ITEM_QUANTITY) return;
    setQuantity(next);
    props.onSelectedQuantityChange?.(next);
  };
  const status = selected === null ? "Choose an amount" : presentation ? publicVariantPurchaseLabel(presentation.purchaseState, "purchase_summary") : "Price unavailable";
  const price = presentation?.state === "priced" ? presentation.price : null;
  const orderingPaused = presentation?.purchaseState === "cart_preview" || presentation?.purchaseState === "checkout_unavailable";
  const addToCartProps: ComponentProps<typeof AddToCartButton> = {
    variantId: selected?.id ?? null, quantity, productName: product.name,
    ...(selected ? { variantLabel: selected.label } : {}), canAdd,
    disabledReason: selected ? "Currently unavailable" : "Choose an amount",
  };
  return <section className="mt-6 space-y-5" aria-labelledby="purchase-heading">
    <h2 id="purchase-heading" tabIndex={-1} className="product-purchase-heading w-fit font-heading text-xl text-ink">Select your product</h2>
    <VariantSelector productId={product.id} productName={product.name} variants={product.variants} selectedVariantId={selectedVariantId} quantity={quantity} pricing={pricing}
      onSelectedVariantIdChange={(variantId) => (props.onSelectedVariantIdChange ?? setInternalSelectedVariantId)(variantId)} />
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <label htmlFor={id} className="mb-2 block text-sm font-semibold uppercase tracking-wider">Quantity</label>
        <select id={id} className="storefront-select min-w-28" value={quantity} onChange={(event) => chooseQuantity(Number(event.target.value))}>
          {Array.from({ length: MAX_CART_ITEM_QUANTITY }, (_, index) => index + 1).map((value) => <option value={value} key={value}>{value}</option>)}
        </select>
      </div>
      {selected ? <p className="pb-3 text-sm text-muted-ink">{selected.packageQuantity} bottle{selected.packageQuantity === 1 ? "" : "s"} per unit</p> : null}
    </div>
    <div ref={inlineSummaryRef} className="purchase-summary rounded-xl border border-border bg-surface-record p-5">
      <div role="status" aria-label="Purchase summary" aria-live="polite" aria-atomic="true">
        <p className="text-sm font-medium text-muted-ink">{selected?.label ?? "No amount selected"} · {quantity} unit{quantity === 1 ? "" : "s"}</p>
        {price ? <>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <strong className="text-3xl tabular-nums">{formatStorefrontMoney(price.lineSubtotalMinor)}</strong>
            {price.lineSavingsMinor > 0 ? <del className="text-muted-ink">{formatStorefrontMoney(price.lineSubtotalMinor + price.lineSavingsMinor)}</del> : null}
            <span className="text-sm text-muted-ink">subtotal</span>
          </div>
          <p className="mt-2 text-sm text-muted-ink">{formatStorefrontMoney(price.effectiveUnitMinor)} per unit</p>
          {presentation?.purchaseState === "local_preview" ? <p className="mt-2 text-sm font-semibold">{status}</p> : null}
          {price.lineSavingsMinor > 0 ? <p className="mt-2 text-sm font-semibold text-accent-readable">Save {formatStorefrontMoney(price.lineSavingsMinor)} ({price.effectiveDiscountBps / 100}%)</p> : null}
          {price.appliedPromotionIds.length ? <p className="mt-2 text-xs font-semibold text-accent-readable">{price.appliedPromotionIds.map((promotionId) => {
            const promotion = pricing.automaticPromotions.find((entry) => entry.id === promotionId);
            return promotion?.displayCode ?? promotion?.displayName;
          }).filter(Boolean).join(", ")} applied automatically</p> : null}
        </> : <p className="mt-3 text-sm">{status}</p>}
      </div>
      <div className="mt-4"><AddToCartButton {...addToCartProps} className="w-full" /></div>
      {orderingPaused ? <p className="mt-3 text-sm leading-6 text-muted-ink">Ordering is not open for this item. {canAdd ? "You can save your selection in the cart. " : ""}<Link className="record-link" href="/contact">Contact us</Link> for availability.</p> : null}
      <p className="mt-3 text-xs leading-5 text-muted-ink">For laboratory research only. Not for human or veterinary use. <Link className="record-link" href="/research-use-policy">Research-use policy</Link>.</p>
    </div>
    {selected ? <BundleOptions product={product} variant={selected} pricing={pricing} quantity={quantity} onSelect={chooseQuantity} /> : null}
    <MobilePurchaseBar productSlug={product.slug} inlineSummaryRef={inlineSummaryRef} quantity={quantity} presentation={presentation} status={status} addToCartProps={addToCartProps} />
  </section>;
}
