"use client";

import { ShoppingBag } from "lucide-react";

import { useCart } from "@/cart/cart-provider";
import {
  isValidCartVariantId,
  MAX_CART_ITEM_QUANTITY,
} from "@/cart/cart-storage";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AddToCartButton({
  variantId,
  productName,
  variantLabel,
  quantity = 1,
  canAdd,
  disabledReason,
  className,
  onAdded,
}: {
  variantId: string | null;
  productName: string;
  variantLabel?: string;
  quantity?: number;
  canAdd: boolean;
  disabledReason?: string;
  className?: string;
  onAdded?: () => void;
}) {
  const { addVariant } = useCart();
  const validIdentity = isValidCartVariantId(variantId);
  const validQuantity =
    Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_CART_ITEM_QUANTITY;
  const unavailable = !canAdd || !validIdentity || !validQuantity;
  const resolvedDisabledReason =
    disabledReason ??
    (variantId === null
      ? "Choose a variant before adding this item."
      : "This item is unavailable.");

  return (
    <Button
      type="button"
      className={cn("action-primary whitespace-normal text-center", className)}
      aria-label={unavailable ? `${productName} unavailable` : `Add ${productName} to cart`}
      title={unavailable ? resolvedDisabledReason : undefined}
      disabled={unavailable}
      onClick={() => {
        if (
          !canAdd ||
          !isValidCartVariantId(variantId) ||
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > MAX_CART_ITEM_QUANTITY
        ) {
          return;
        }
        const added = addVariant(variantId, quantity, {
          productName,
          ...(variantLabel === undefined ? {} : { variantLabel }),
        });
        if (added) onAdded?.();
      }}
    >
      <ShoppingBag aria-hidden="true" />
      {unavailable ? resolvedDisabledReason : "Add to cart"}
    </Button>
  );
}
