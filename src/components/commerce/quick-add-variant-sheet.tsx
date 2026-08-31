"use client";

import { useState } from "react";
import { AddToCartButton } from "./add-to-cart-button";
import type { PublicStorefrontProduct } from "@/catalog/storefront-public";
import { canAddPublicVariant, formatStorefrontMoney, type PricePresentationMode } from "@/catalog/storefront-price-presentation";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function QuickAddVariantSheet({ product, mode, trigger }: { product: Extract<PublicStorefrontProduct, { kind: "canonical" }>; mode: PricePresentationMode; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(product.defaultVariantId);
  const variant = product.variants.find((entry) => entry.id === selected) ?? null;
  const canAdd = variant ? canAddPublicVariant(variant, mode) : false;
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild>{trigger}</SheetTrigger>
    <SheetContent aria-describedby={`${product.slug}-variant-description`} className="w-full overflow-y-auto sm:max-w-md">
      <SheetHeader>
        <SheetTitle>Choose a variant for {product.name}</SheetTitle>
        <SheetDescription id={`${product.slug}-variant-description`}>Select an exact variant before adding this product to your cart.</SheetDescription>
      </SheetHeader>
      <div className="grid gap-3 px-4" role="radiogroup" aria-label={`${product.name} variants`}>
        {product.variants.map((entry) => {
          const addable = canAddPublicVariant(entry, mode);
          return <label key={entry.id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
            <input type="radio" name={`${product.slug}-variant`} value={entry.id} checked={selected === entry.id} onChange={() => setSelected(entry.id)} disabled={!addable} />
            <span className="flex-1"><span className="block font-medium text-ink">{entry.label}</span><span className="text-sm text-muted-ink">{entry.baseUnitMinor !== null && entry.currency ? formatStorefrontMoney(entry.baseUnitMinor, entry.currency) : "Pricing coming soon"}{!addable ? " · Unavailable" : ""}</span></span>
          </label>;
        })}
      </div>
      <div className="mt-auto p-4">
        {variant ? <AddToCartButton variantId={variant.id} productName={product.name} canAdd={canAdd} {...(canAdd ? {} : { disabledReason: "This variant is unavailable for cart testing." })} className="w-full min-h-11" /> : null}
      </div>
    </SheetContent>
  </Sheet>;
}

export function VariantAddTrigger({ product, mode }: { product: Extract<PublicStorefrontProduct, { kind: "canonical" }>; mode: PricePresentationMode }) {
  return <QuickAddVariantSheet product={product} mode={mode} trigger={<Button type="button" className="action-primary min-h-11" aria-label={`Add ${product.name} to cart`}>ADD</Button>} />;
}
