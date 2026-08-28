import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { addItem } = vi.hoisted(() => ({ addItem: vi.fn() }));

vi.mock("@/cart/cart-provider", () => ({
  useCart: () => ({ addItem }),
}));

import { AddSetToCartButton } from "./add-set-to-cart-button";

describe("AddSetToCartButton", () => {
  it("transfers only normalized current product IDs and quantities without checkout authority", () => {
    render(
      <AddSetToCartButton
        items={[
          { productId: "product-current-a", quantity: 2, price: 1, discount: 99 } as never,
          { productId: "product-current-b", quantity: 25, inventory: 500 } as never,
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add set to cart" }));

    expect(addItem).toHaveBeenNthCalledWith(1, "product-current-a", 2);
    expect(addItem).toHaveBeenNthCalledWith(2, "product-current-b", 25);
    expect(addItem).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("link", { name: /checkout/i })).not.toBeInTheDocument();
  });
});
