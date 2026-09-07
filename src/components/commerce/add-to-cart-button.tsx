"use client";

import { Check, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";

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
  presentation?: "checkout" | "preview";
  className?: string;
  onAdded?: () => void;
}) {
  const { addVariant, legacyItemCount } = useCart();
  const validIdentity = isValidCartVariantId(variantId);
  const validQuantity =
    Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_CART_ITEM_QUANTITY;
  const unavailable = !canAdd || !validIdentity || !validQuantity;
  const selection = JSON.stringify([variantId, quantity, unavailable, legacyItemCount]);
  const [feedback, setFeedback] = useState<{
    selection: string;
    added: boolean;
  } | null>(null);
  // Feedback belongs to one selection, including an intervening unavailable state.
  if (feedback !== null && feedback.selection !== selection) setFeedback(null);
  const currentFeedback = feedback?.selection === selection ? feedback : null;

  useEffect(() => {
    if (feedback === null) return;
    const timeout = window.setTimeout(() => setFeedback(null), 2_000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);
  const resolvedDisabledReason =
    disabledReason ??
    (variantId === null
      ? "Choose a variant before adding this item."
      : "This item is unavailable.");
  const actionLabel = `Add ${productName} to cart`;

  return (
    <>
    <Button
      type="button"
      className={cn("action-primary min-h-11 whitespace-normal text-center duration-200 ease-out motion-safe:enabled:hover:[transform:translateY(-1px)] motion-safe:enabled:active:[transform:translateY(1px)] motion-reduce:transition-none", className)}
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
        setFeedback({ selection, added });
        if (added) onAdded?.();
      }}
    >
      {currentFeedback?.added ? <Check aria-hidden="true" /> : <ShoppingBag aria-hidden="true" />}
      {unavailable ? resolvedDisabledReason : (
        // Reserve the action label's size so feedback does not move nearby controls.
        // CartProvider owns live announcements; this button remains an add action.
        <span className="relative">
          <span className={currentFeedback ? "invisible" : undefined} aria-hidden={currentFeedback ? true : undefined}>Add to cart</span>
          {currentFeedback ? <span className="absolute inset-0" aria-hidden="true">{currentFeedback.added ? "Added" : "Not added"}</span> : null}
        </span>
      )}
    </Button>
    {legacyItemCount != null ? (
      <p className="mt-3 min-w-0 basis-full text-sm leading-6 text-muted-ink">
        <span>Your saved cart needs to be refreshed. Clear it before adding this item.</span>{" "}
        <a className="record-link inline-flex min-h-11 items-center" href="/cart">
          Review cart
        </a>
      </p>
    ) : null}
    </>
  );
}
