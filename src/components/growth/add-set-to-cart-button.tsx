"use client";

import { Button } from "@/components/ui/button";

export function AddSetToCartButton({
  items,
}: {
  items: readonly Readonly<{ productId: string; quantity: number }>[];
}) {
  void items;
  return (
    <>
      <Button type="button" className="action-primary" disabled aria-describedby="set-cart-unavailable">
        Variant selection unavailable
      </Button>
      <p id="set-cart-unavailable" className="sr-only" role="status" aria-live="polite">
        Select exact variants before adding a research set to the cart.
      </p>
    </>
  );
}
