"use client";

import { ShoppingBag } from "lucide-react";

import { useCart } from "@/cart/cart-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AddToCartButton({
  variantId,
  productName,
  className,
}: {
  variantId: string | null;
  productName: string;
  className?: string;
}) {
  const { addVariant } = useCart();
  const unavailable = variantId === null;

  return (
    <Button
      type="button"
      className={cn("action-primary", className)}
      aria-label={unavailable ? `${productName} requires variant selection` : `Add ${productName} to cart`}
      disabled={unavailable}
      onClick={() => {
        if (variantId !== null) addVariant(variantId);
      }}
    >
      <ShoppingBag aria-hidden="true" />
      {unavailable ? "Variant selection unavailable" : "Add to cart"}
    </Button>
  );
}
