"use client";

import { useState } from "react";

import type { PublicStorefrontProduct } from "@/catalog/storefront-public";
import {
  canAddPublicVariant,
  resolvePublicVariantPrice,
  type PricePresentation,
  type PublicStorefrontPricingContext,
} from "@/catalog/storefront-price-presentation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { AddToCartButton } from "./add-to-cart-button";
import { ProductPrice } from "./product-price";

type CanonicalProduct = Extract<PublicStorefrontProduct, { kind: "canonical" }>;

function rowStatus(presentation: PricePresentation): string {
  if (presentation.state === "pending") return "Pricing coming soon";
  if (presentation.state === "unavailable") return "Unavailable";
  if (presentation.purchaseState === "ready") return "Available";
  if (presentation.purchaseState === "local_preview") return "Local cart preview";
  return "Checkout unavailable";
}

function disabledReason(presentation: PricePresentation): string {
  if (presentation.state === "pending") return "Pricing coming soon.";
  if (presentation.state === "unavailable") return "This variant is unavailable.";
  return "This variant cannot be added to the cart.";
}

export function QuickAddVariantSheet({
  product,
  pricing,
  trigger,
}: {
  product: CanonicalProduct;
  pricing: PublicStorefrontPricingContext;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(product.defaultVariantId);
  const variant = product.variants.find((entry) => entry.id === selected) ?? null;
  const canAdd = variant
    ? canAddPublicVariant(variant, pricing.mode)
    : false;
  const selectedPresentation = variant
    ? resolvePublicVariantPrice({
        variant,
        productId: product.id,
        quantity: 1,
        pricing,
      })
    : null;
  const selectedDisabledReason = selectedPresentation
    ? disabledReason(selectedPresentation)
    : "This variant cannot be added to the cart.";

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setSelected(product.defaultVariantId);
    setOpen(nextOpen);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        aria-describedby={`${product.slug}-variant-description`}
        className="w-full overflow-y-auto sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>Choose a variant for {product.name}</SheetTitle>
          <SheetDescription id={`${product.slug}-variant-description`}>
            Select an exact variant before adding this product to your cart.
          </SheetDescription>
        </SheetHeader>
        <fieldset className="grid gap-3 px-4">
          <legend className="sr-only">{product.name} variants</legend>
          {product.variants.map((entry) => {
            const addable = canAddPublicVariant(entry, pricing.mode);
            const presentation = resolvePublicVariantPrice({
              variant: entry,
              productId: product.id,
              quantity: 1,
              pricing,
            });
            return (
              <label
                key={entry.id}
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-xl border border-border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  addable ? "cursor-pointer" : "cursor-not-allowed opacity-70",
                )}
              >
                <input
                  checked={selected === entry.id}
                  disabled={!addable}
                  name={`${product.slug}-variant`}
                  onChange={() => setSelected(entry.id)}
                  type="radio"
                  value={entry.id}
                />
                <span className="grid min-w-0 flex-1 gap-1 [overflow-wrap:anywhere]">
                  <span className="block font-medium text-ink">{entry.label}</span>
                  <ProductPrice
                    pricing={pricing}
                    productId={product.id}
                    showPurchaseStatus={false}
                    variant={entry}
                  />
                  <span className="text-sm text-muted-ink">
                    {rowStatus(presentation)}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <div className="mt-auto p-4">
          {variant ? (
            <AddToCartButton
              canAdd={canAdd}
              className="min-h-11 w-full"
              disabledReason={selectedDisabledReason}
              onAdded={() => setOpen(false)}
              productName={product.name}
              variantId={variant.id}
              variantLabel={variant.label}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function VariantAddTrigger({
  product,
  pricing,
}: {
  product: CanonicalProduct;
  pricing: PublicStorefrontPricingContext;
}) {
  return (
    <QuickAddVariantSheet
      product={product}
      pricing={pricing}
      trigger={
        <Button
          aria-label={`Add ${product.name} to cart`}
          className="action-primary min-h-11"
          type="button"
        >
          ADD
        </Button>
      }
    />
  );
}
