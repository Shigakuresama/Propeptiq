"use client";

import { useMemo, useState } from "react";
import { canAddPublicVariant, formatStorefrontMoney, resolvePublicVariantPrice, type PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import type { CanonicalPublicStorefrontProduct } from "@/catalog/storefront-public";
import { AddToCartButton } from "./add-to-cart-button";
import { QuantityTierSelector } from "./quantity-tier-selector";
import { VariantSelector } from "./variant-selector";

export type ProductPurchasePanelProps = Readonly<{ product: CanonicalPublicStorefrontProduct; pricing: PublicStorefrontPricingContext }>;
const QUANTITY_ERROR = "Enter a whole number from 1 to 25.";
const TEN_PLUS_QUANTITY_ERROR = "Enter a whole number from 10 to 25.";

function parseQuantityDraft(draft: string, minimum: number): number | null {
  if (!/^(?:[1-9]|1[0-9]|2[0-5])$/u.test(draft)) return null;
  const quantity = Number(draft);
  return quantity >= minimum ? quantity : null;
}

export function ProductPurchasePanel({ product, pricing }: ProductPurchasePanelProps) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(() => product.variants.some((v) => v.id === product.defaultVariantId) ? product.defaultVariantId : null);
  const [lastValidQuantity, setLastValidQuantity] = useState(1);
  const [quantityDraft, setQuantityDraft] = useState("1");
  const minimumQuantity = lastValidQuantity >= 10 ? 10 : 1;
  const parsedQuantity = parseQuantityDraft(quantityDraft, minimumQuantity);
  const quantityIsValid = parsedQuantity !== null;
  const quantity = quantityIsValid ? parsedQuantity : lastValidQuantity;
  const errorMessage = quantityIsValid ? null : minimumQuantity === 10 ? TEN_PLUS_QUANTITY_ERROR : QUANTITY_ERROR;
  const selected = product.variants.find((variant) => variant.id === selectedVariantId) ?? null;
  const presentation = useMemo(() => quantityIsValid && selected ? resolvePublicVariantPrice({ variant: selected, productId: product.id, quantity, pricing }) : null, [pricing, product.id, quantity, quantityIsValid, selected]);
  const chooseQuantity = (next: number) => { setLastValidQuantity(next); setQuantityDraft(String(next)); };
  const status = selected === null ? "Choose a variant" : !quantityIsValid ? "Invalid quantity" : presentation?.state === "unavailable" ? "Unavailable" : presentation?.state === "pending" ? "Pricing coming soon" : presentation?.purchaseState === "checkout_unavailable" ? "Checkout unavailable" : presentation?.purchaseState === "local_preview" ? "Preview only" : "Ready to purchase";
  const price = presentation?.state === "priced" ? presentation.price : null;
  return <section className="mt-10 space-y-8" aria-labelledby="purchase-heading">
    <h2 id="purchase-heading" className="font-heading text-3xl text-ink">Purchase</h2>
    <VariantSelector productId={product.id} productName={product.name} variants={product.variants} selectedVariantId={selectedVariantId} quantity={lastValidQuantity} pricing={pricing} onSelectedVariantIdChange={setSelectedVariantId} />
    <div><h3 className="mb-3 font-heading text-2xl text-ink">Quantity</h3><QuantityTierSelector quantity={lastValidQuantity} quantityDraft={quantityDraft} errorId="quantity-error" errorMessage={errorMessage} onQuantityDraftChange={(draft) => { setQuantityDraft(draft); const parsed = parseQuantityDraft(draft, minimumQuantity); if (parsed !== null) setLastValidQuantity(parsed); }} onQuantitySelect={chooseQuantity} /></div>
    <div role="status" aria-label="Purchase summary" aria-live="polite" aria-atomic="true" className="space-y-2 rounded-xl border border-border bg-canvas p-4">
      <p className="font-semibold text-ink">{selected?.label ?? "No variant selected"} · {quantityIsValid ? `${quantity} bottle${quantity === 1 ? "" : "s"}` : errorMessage}</p>
      <p className="text-sm text-muted-ink">{status}</p>
      {price ? <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm"><dt>Standard unit price</dt><dd>{price.effectiveDiscountBps > 0 ? <del>{formatStorefrontMoney(price.baseUnitMinor)}</del> : formatStorefrontMoney(price.baseUnitMinor)}</dd><dt>Effective unit price</dt><dd className="font-semibold">{formatStorefrontMoney(price.effectiveUnitMinor)}</dd><dt>Discount</dt><dd>{price.effectiveDiscountBps / 100}%</dd><dt>Savings</dt><dd>{formatStorefrontMoney(price.lineSavingsMinor)}</dd><dt>Quantity</dt><dd>{price.quantity}</dd><dt>Subtotal</dt><dd className="font-semibold">{formatStorefrontMoney(price.lineSubtotalMinor)}</dd></dl> : null}
      {price?.appliedPromotionIds.length ? <p className="text-sm font-semibold text-moss">{price.appliedPromotionIds.map((id) => { const promotion = pricing.automaticPromotions.find((entry) => entry.id === id); return promotion?.displayCode ?? promotion?.displayName ?? null; }).filter((label): label is string => label !== null).join(", ")}</p> : null}
      <AddToCartButton variantId={selected?.id ?? null} quantity={lastValidQuantity} productName={product.name} {...(selected ? { variantLabel: selected.label } : {})} canAdd={quantityIsValid && selected !== null && canAddPublicVariant(selected, pricing.mode)} />
    </div>
  </section>;
}
