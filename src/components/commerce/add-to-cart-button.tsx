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
  presentation = "checkout",
  className,
  onAdded,
}: {
  variantId: string | null;
  productName: string;
  variantLabel?: string;
  quantity?: number;
  canAdd: boolean;
  disabledReason?: string;
  presentation?: "checkout" | "preview";
  className?: string;
  onAdded?: () => void;
}) {
  const { addVariant, legacyItemCount } = useCart();
  const validIdentity = isValidCartVariantId(variantId);
  const validQuantity =
    Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_CART_ITEM_QUANTITY;
  const unavailable = !canAdd || !validIdentity || !validQuantity;
  const resolvedDisabledReason =
    disabledReason ??
    (variantId === null
      ? "Choose a variant before adding this item."
      : "This item is unavailable.");
  const actionLabel = presentation === "preview"
    ? `Add ${productName} to preview cart`
    : `Add ${productName} to cart`;
  const actionText = presentation === "preview"
    ? "Add to preview cart"
    : "Add to cart";

  return (
    <>
    <Button
      type="button"
      className={cn("action-primary whitespace-normal text-center", className)}
      aria-label={unavailable ? `${productName} unavailable` : actionLabel}
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
      {unavailable ? resolvedDisabledReason : actionText}
    </Button>
    {legacyItemCount != null ? (
      <p className="mt-3 min-w-0 basis-full text-sm leading-6 text-muted-ink">
        <span>Your saved cart uses an older format. Clear the old cart before adding a variant.</span>{" "}
        <a className="record-link inline-flex min-h-11 items-center" href="/cart">
          Review saved cart
        </a>
      </p>
    ) : null}
    </>
  );
}
