import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { CartProvider, useCart } from "./cart-provider";
import { CART_STORAGE_KEY } from "./cart-storage";

function CartHarness() {
  const { addVariant, hydrated, items } = useCart();
  return (
    <div>
      <p>{hydrated ? "Cart hydrated" : "Cart loading"}</p>
      <output aria-label="Cart lines">{JSON.stringify(items)}</output>
      <button
        onClick={() =>
          addVariant("variant-5mg", 1, {
            productName: "Synthetic Product Alpha",
            variantLabel: "5 mg",
          })
        }
        type="button"
      >
        Add 5 mg once
      </button>
      <button
        onClick={() =>
          addVariant("variant-5mg", 2, {
            productName: "Synthetic Product Alpha",
            variantLabel: "5 mg",
          })
        }
        type="button"
      >
        Add 5 mg twice
      </button>
      <button
        onClick={() =>
          addVariant("variant-10mg", 2, {
            productName: "Synthetic Product Alpha",
            variantLabel: "10 mg",
          })
        }
        type="button"
      >
        Add 10 mg twice
      </button>
      <button
        onClick={() =>
          addVariant("variant-5mg", 25, {
            productName: "Synthetic Product Alpha",
            variantLabel: "5 mg",
          })
        }
        type="button"
      >
        Fill 5 mg line
      </button>
    </div>
  );
}

describe("CartProvider exact-variant announcements", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("merges repeated exact variants, separates mg variants, and announces normalized quantity once", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <CartHarness />
      </CartProvider>,
    );
    await screen.findByText("Cart hydrated");

    const status = screen.getByRole("status", { name: "Cart updates" });
    expect(screen.getAllByRole("status", { name: "Cart updates" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Add 5 mg once" }));
    expect(status).toHaveTextContent(
      "Cart updated. Synthetic Product Alpha, 5 mg: 1 unit in cart.",
    );

    await user.click(screen.getByRole("button", { name: "Add 5 mg twice" }));
    expect(status).toHaveTextContent(
      "Cart updated. Synthetic Product Alpha, 5 mg: 3 units in cart.",
    );
    expect(status.textContent?.match(/3 units in cart/gu)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Add 10 mg twice" }));
    expect(screen.getByLabelText("Cart lines")).toHaveTextContent(
      JSON.stringify([
        { variantId: "variant-5mg", quantity: 3 },
        { variantId: "variant-10mg", quantity: 2 },
      ]),
    );

    await user.click(screen.getByRole("button", { name: "Fill 5 mg line" }));
    expect(status).toHaveTextContent(
      "Cart updated. Synthetic Product Alpha, 5 mg: 25 units in cart.",
    );
  });

  it("never persists transient announcement labels", async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <CartHarness />
      </CartProvider>,
    );
    await screen.findByText("Cart hydrated");
    await user.click(screen.getByRole("button", { name: "Add 5 mg once" }));

    await waitFor(() => {
      expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "null")).toEqual({
        version: 2,
        items: [{ variantId: "variant-5mg", quantity: 1 }],
      });
    });
    const serialized = window.localStorage.getItem(CART_STORAGE_KEY) ?? "";
    expect(serialized).not.toContain("Synthetic Product Alpha");
    expect(serialized).not.toContain("5 mg");
  });
});
