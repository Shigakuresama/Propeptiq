"use client";

import { ShoppingBag } from "lucide-react";

import { useCart } from "@/cart/cart-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AddToCartButton({
  productId,
  productName,
  className,
}: {
  productId: string;
  productName: string;
  className?: string;
}) {
  const { addItem } = useCart();

  return (
    <Button
      type="button"
      className={cn("action-primary", className)}
      aria-label={`Add ${productName} to cart`}
      onClick={() => addItem(productId)}
    >
      <ShoppingBag aria-hidden="true" />
      Add to cart
    </Button>
  );
}
