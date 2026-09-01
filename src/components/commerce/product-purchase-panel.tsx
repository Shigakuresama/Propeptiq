"use client";

import { useMemo, useState } from "react";
import { canAddPublicVariant, formatStorefrontMoney, resolvePublicVariantPrice, type PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import type { CanonicalPublicStorefrontProduct } from "@/catalog/storefront-public";
import { MAX_CART_ITEM_QUANTITY } from "@/cart/cart-storage";
import { AddToCartButton } from "./add-to-cart-button";
import { QuantityTierSelector } from "./quantity-tier-selector";
import { VariantSelector } from "./variant-selector";

export type ProductPurchasePanelProps = Readonly<{ product: CanonicalPublicStorefrontProduct; pricing: PublicStorefrontPricingContext }>;
const QUANTITY_ERROR = "Enter a whole number from 1 to 25.";

export function ProductPurchasePanel({ product, pricing }: ProductPurchasePanelProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(() => product.variants.some((v) => v.id === product.defaultVariantId) ? product.defaultVariantId : null);
  const [lastValidQuantity, setLastValidQuantity] = useState(1);
  const [quantityDraft, setQuantityDraft] = useState("1");
  const quantity = Number(quantityDraft);
  const quantityIsValid = Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_CART_ITEM_QUANTITY && quantityDraft.trim() !== "";
  const errorMessage = quantityIsValid ? null : QUANTITY_ERROR;
  const selected = product.variants.find((variant) => variant.id === selectedVariantId) ?? null;
  const presentation = useMemo(() => quantityIsValid && selected ? resolvePublicVariantPrice({ variant: selected, productId: product.id, quantity, pricing }) : null, [pricing, product.id, quantity, quantityIsValid, selected]);
  const chooseQuantity = (next: number) => { setLastValidQuantity(next); setQuantityDraft(String(next)); };
  const status = presentation?.state === "unavailable" ? "Unavailable" : presentation?.state === "pending" ? "Pricing coming soon" : presentation?.purchaseState === "checkout_unavailable" ? "Checkout unavailable" : presentation?.purchaseState === "local_preview" ? "Preview only" : "Ready to purchase";
  const price = presentation?.state === "priced" ? presentation.price : null;
  return <section className="mt-10 space-y-8" aria-labelledby="purchase-heading">
    <h2 id="purchase-heading" className="font-heading text-3xl text-ink">Purchase</h2>
    <VariantSelector productId={product.id} productName={product.name} variants={product.variants} selectedVariantId={selectedVariantId} quantity={lastValidQuantity} pricing={pricing} onSelectedVariantIdChange={setSelectedVariantId} />
    <div><h3 className="mb-3 font-heading text-2xl text-ink">Quantity</h3><QuantityTierSelector quantity={lastValidQuantity} quantityDraft={quantityDraft} errorId="quantity-error" errorMessage={errorMessage} onQuantityDraftChange={(draft) => { setQuantityDraft(draft); if (Number.isInteger(Number(draft)) && Number(draft) >= 1 && Number(draft) <= MAX_CART_ITEM_QUANTITY && draft.trim() !== "") setLastValidQuantity(Number(draft)); }} onQuantitySelect={chooseQuantity} /></div>
    <div role="status" aria-label="Purchase summary" aria-live="polite" aria-atomic="true" className="space-y-2 rounded-xl border border-border bg-canvas p-4">
      <p className="font-semibold text-ink">{selected?.label ?? "No variant selected"} · {quantityIsValid ? `${quantity} bottle${quantity === 1 ? "" : "s"}` : QUANTITY_ERROR}</p>
      <p className="text-sm text-muted-ink">{status}</p>
      {price ? <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm"><dt>Standard unit price</dt><dd>{formatStorefrontMoney(price.baseUnitMinor)}</dd><dt>Effective unit price</dt><dd className="font-semibold">{price.effectiveUnitMinor === price.baseUnitMinor ? formatStorefrontMoney(price.effectiveUnitMinor) : <><del>{formatStorefrontMoney(price.baseUnitMinor)}</del> {formatStorefrontMoney(price.effectiveUnitMinor)}</>}</dd><dt>Discount</dt><dd>{price.effectiveDiscountBps / 100}%</dd><dt>Savings</dt><dd>{formatStorefrontMoney(price.lineSavingsMinor)}</dd><dt>Quantity</dt><dd>{price.quantity}</dd><dt>Subtotal</dt><dd className="font-semibold">{formatStorefrontMoney(price.lineSubtotalMinor)}</dd></dl> : null}
      <AddToCartButton variantId={selected?.id ?? null} quantity={lastValidQuantity} productName={product.name} {...(selected ? { variantLabel: selected.label } : {})} canAdd={quantityIsValid && selected !== null && canAddPublicVariant(selected, pricing.mode)} />
    </div>
  </section>;
}
