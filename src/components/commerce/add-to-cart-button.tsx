"use client";

import { ShoppingBag } from "lucide-react";

import { useCart } from "@/cart/cart-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AddToCartButton({
  variantId,
  productName,
  quantity = 1,
  canAdd = false,
  disabledReason = variantId === null ? "Choose a variant before adding this item." : undefined,
  className,
}: {
  variantId: string | null;
  productName: string;
  quantity?: number;
  canAdd?: boolean;
  disabledReason?: string;
  className?: string;
}) {
  const { addVariant } = useCart();
  const unavailable = variantId === null || !canAdd;

  return (
    <Button
      type="button"
      className={cn("action-primary", className)}
      aria-label={unavailable ? `${productName} unavailable` : `Add ${productName} to cart`}
      title={unavailable ? disabledReason : undefined}
      disabled={unavailable}
      onClick={() => {
        if (variantId !== null && canAdd) addVariant(variantId, quantity);
      }}
    >
      <ShoppingBag aria-hidden="true" />
      {unavailable ? (disabledReason ?? "Unavailable") : "Add to cart"}
    </Button>
  );
}
