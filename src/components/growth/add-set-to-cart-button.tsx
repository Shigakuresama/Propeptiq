"use client";

import { useState } from "react";

import { normalizeCart } from "@/cart/cart-storage";
import { useCart } from "@/cart/cart-provider";
import { Button } from "@/components/ui/button";

export function AddSetToCartButton({
  items,
}: {
  items: readonly Readonly<{ productId: string; quantity: number }>[];
}) {
  const { addItem } = useCart();
  const [announcement, setAnnouncement] = useState("");

  function addSet() {
    const normalized = normalizeCart(items);
    for (const item of normalized) addItem(item.productId, item.quantity);
    setAnnouncement(
      normalized.length === 0
        ? "The cart was not changed."
        : `${normalized.length} current research record${normalized.length === 1 ? "" : "s"} added to the cart.`,
    );
  }

  return (
    <>
      <Button type="button" className="action-primary" onClick={addSet}>
        Add set to cart
      </Button>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
