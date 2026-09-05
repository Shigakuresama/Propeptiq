import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

const { addVariantMock, cartState } = vi.hoisted(() => ({
  addVariantMock: vi.fn(),
  // Minimal cart context test double; legacy authority remains in CartProvider.
  cartState: { legacyItemCount: null as number | null },
}));

vi.mock("@/cart/cart-provider", () => ({
  useCart: () => ({ addVariant: addVariantMock, legacyItemCount: cartState.legacyItemCount }),
}));

import { AddToCartButton } from "./add-to-cart-button";

describe("AddToCartButton", () => {
  beforeEach(() => {
    addVariantMock.mockReset();
    addVariantMock.mockReturnValue(true);
    cartState.legacyItemCount = null;
  });

  it("shows ordinary visible cart-reselection guidance and removes it when the cart authority clears the legacy state", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    cartState.legacyItemCount = 2;
    addVariantMock.mockReturnValue(false);
    const props = {
      canAdd: true, onAdded, productName: "Synthetic Product Alpha", variantId: "variant-10mg",
    };
    const { container, rerender } = render(<AddToCartButton {...props} />);
    const guidance = screen.getByText("Your saved cart uses an older format. Clear the old cart before adding a variant.");
    expect(guidance).toBeVisible();
    const link = screen.getByRole("link", { name: "Review saved cart" });
    expect(link).toBeVisible();
    expect(link).toHaveAttribute("href", "/cart");
    expect(link.tagName).toBe("A");
    expect(container.querySelectorAll('[aria-live], [role="status"], [role="alert"]')).toHaveLength(0);
    const button = screen.getByRole("button", { name: "Add Synthetic Product Alpha to cart" });
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onAdded).not.toHaveBeenCalled();
    expect(guidance).toBeVisible();

    cartState.legacyItemCount = null;
    addVariantMock.mockReturnValue(true);
    rerender(<AddToCartButton {...props} />);
    expect(screen.queryByRole("link", { name: "Review saved cart" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Your saved cart uses an older format/u)).not.toBeInTheDocument();
    await user.click(button);
    expect(onAdded).toHaveBeenCalledOnce();
  });

  it("does not show legacy guidance for a ready cart", () => {
    render(<AddToCartButton canAdd productName="Synthetic Product Alpha" variantId="variant-10mg" />);
    expect(screen.queryByRole("link", { name: "Review saved cart" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Synthetic Product Alpha to cart" })).toBeEnabled();
  });

  it("requires explicit add authorization in its public prop contract", () => {
    type Props = ComponentProps<typeof AddToCartButton>;
    expectTypeOf<Props["canAdd"]>().toEqualTypeOf<boolean>();
  });

  it("forwards the exact variant ID, integer quantity, and transient safe labels once", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    render(
      <AddToCartButton
        canAdd
        onAdded={onAdded}
        productName="Synthetic Product Alpha"
        quantity={3}
        variantId="variant-10mg"
        variantLabel="10 mg"
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Add Synthetic Product Alpha to cart",
      }),
    );

    expect(addVariantMock).toHaveBeenCalledTimes(1);
    expect(addVariantMock).toHaveBeenCalledWith("variant-10mg", 3, {
      productName: "Synthetic Product Alpha",
      variantLabel: "10 mg",
    });
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button")).toHaveTextContent("Add to cart");
  });

  it("uses exact preview-cart copy without changing the cart write", async () => {
    const user = userEvent.setup();
    render(
      <AddToCartButton
        canAdd
        presentation="preview"
        productName="Synthetic Product Alpha"
        quantity={3}
        variantId="variant-preview"
        variantLabel="30 mg"
      />,
    );

    const button = screen.getByRole("button", {
      name: "Add Synthetic Product Alpha to preview cart",
    });
    expect(button).toHaveTextContent("Add to preview cart");
    await user.click(button);

    expect(addVariantMock).toHaveBeenCalledExactlyOnceWith(
      "variant-preview",
      3,
      {
        productName: "Synthetic Product Alpha",
        variantLabel: "30 mg",
      },
    );
  });

  it("keeps disabled semantics and reasons unchanged in preview presentation", async () => {
    const user = userEvent.setup();
    render(
      <AddToCartButton
        canAdd={false}
        disabledReason="Pricing coming soon"
        presentation="preview"
        productName="Synthetic Product Alpha"
        variantId="variant-preview"
      />,
    );

    const button = screen.getByRole("button", {
      name: "Synthetic Product Alpha unavailable",
    });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Pricing coming soon");
    expect(button).toHaveAttribute("title", "Pricing coming soon");
    await user.click(button);
    expect(addVariantMock).not.toHaveBeenCalled();
  });

  it("allows the exact cart line cap of 25", async () => {
    const user = userEvent.setup();
    render(
      <AddToCartButton
        canAdd
        productName="Synthetic Product Alpha"
        quantity={25}
        variantId="variant-5mg"
      />,
    );

    await user.click(screen.getByRole("button", { name: /add synthetic product alpha/iu }));
    expect(addVariantMock).toHaveBeenCalledWith("variant-5mg", 25, {
      productName: "Synthetic Product Alpha",
    });
  });

  it("does not report success when cart normalization rejects the add", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn();
    addVariantMock.mockReturnValue(false);
    render(
      <AddToCartButton
        canAdd
        onAdded={onAdded}
        productName="Synthetic Product Alpha"
        variantId="variant-51"
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Add Synthetic Product Alpha to cart",
      }),
    );

    expect(addVariantMock).toHaveBeenCalledTimes(1);
    expect(onAdded).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, 26, Number.NaN])(
    "blocks invalid handler quantity %s",
    async (quantity) => {
      const user = userEvent.setup();
      render(
        <AddToCartButton
          canAdd
          productName="Synthetic Product Alpha"
          quantity={quantity}
          variantId="variant-5mg"
        />,
      );

      const button = screen.getByRole("button", {
        name: /synthetic product alpha unavailable/iu,
      });
      expect(button).toBeDisabled();
      await user.click(button);
      expect(addVariantMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { canAdd: false, variantId: "variant-5mg" },
    { canAdd: true, variantId: null },
    { canAdd: true, variantId: "" },
    { canAdd: true, variantId: "bad id" },
  ] as const)(
    "blocks missing, invalid, or unauthorized identity %#",
    async ({ canAdd, variantId }) => {
      const user = userEvent.setup();
      render(
        <AddToCartButton
          canAdd={canAdd}
          disabledReason="Pricing coming soon"
          productName="Synthetic Product Alpha"
          variantId={variantId}
        />,
      );

      const button = screen.getByRole("button", {
        name: /synthetic product alpha unavailable/iu,
      });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", "Pricing coming soon");
      expect(button).toHaveTextContent("Pricing coming soon");
      await user.click(button);
      expect(addVariantMock).not.toHaveBeenCalled();
    },
  );
});
