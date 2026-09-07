import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CartProvider, useCart } from "@/cart/cart-provider";
import { CART_STORAGE_KEY } from "@/cart/cart-storage";
import { AddToCartButton } from "./add-to-cart-button";

// Synthetic catalog identity; these tests exercise the real local cart provider.
const variantId = "synthetic-feedback-variant";

function CartContents() {
  const { items } = useCart();
  return <output data-testid="cart-contents">{JSON.stringify(items)}</output>;
}

function renderCart(quantity = 1) {
  const onAdded = vi.fn();
  render(<CartProvider>
    <AddToCartButton canAdd onAdded={onAdded} productName="Synthetic Product Alpha" variantId={variantId} quantity={quantity} />
    <CartContents />
  </CartProvider>);
  return { onAdded, button: screen.getByRole("button", { name: "Add Synthetic Product Alpha to cart" }) };
}

describe("AddToCartButton confirmed local cart feedback", () => {
  beforeEach(() => window.localStorage.clear());

  it("confirms immediate repeated adds only with the updated local cart", async () => {
    const { button, onAdded } = renderCart(2);
    fireEvent.click(button);
    expect(screen.getByText("Added")).toBeVisible();
    expect(screen.getByTestId("cart-contents")).toHaveTextContent(JSON.stringify([{ variantId, quantity: 2 }]));
    fireEvent.click(button);
    expect(onAdded).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("cart-contents")).toHaveTextContent(JSON.stringify([{ variantId, quantity: 4 }]));
    await waitFor(() => expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("4 units in cart"));
  });

  it("does not claim the requested quantity when the cart caps an add, or success on a rejected repeat", async () => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ version: 2, items: [{ variantId, quantity: 24 }] }));
    const { button, onAdded } = renderCart(2);
    fireEvent.click(button);
    expect(screen.getByText("Added")).toBeVisible();
    expect(screen.getByTestId("cart-contents")).toHaveTextContent(JSON.stringify([{ variantId, quantity: 25 }]));
    await waitFor(() => expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("25 units in cart"));
    fireEvent.click(button);
    expect(screen.queryByText("Added")).not.toBeInTheDocument();
    expect(screen.getByText("Not added")).toBeVisible();
    expect(onAdded).toHaveBeenCalledOnce();
    expect(screen.getByTestId("cart-contents")).toHaveTextContent(JSON.stringify([{ variantId, quantity: 25 }]));
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("The cart was not changed.");
  });
});
