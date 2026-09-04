import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

const { addVariantMock } = vi.hoisted(() => ({
  addVariantMock: vi.fn(),
}));

vi.mock("@/cart/cart-provider", () => ({
  useCart: () => ({ addVariant: addVariantMock }),
}));

import { AddToCartButton } from "./add-to-cart-button";

describe("AddToCartButton", () => {
  beforeEach(() => {
    addVariantMock.mockReset();
    addVariantMock.mockReturnValue(true);
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
