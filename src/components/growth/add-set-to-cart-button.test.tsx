import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AddSetToCartButton } from "./add-set-to-cart-button";

describe("AddSetToCartButton", () => {
  it("does not treat product-only research sets as canonical cart variants", () => {
    render(<AddSetToCartButton items={[{ productId: "product-current-a", quantity: 2 }]} />);
    expect(screen.getByRole("button", { name: "Variant selection unavailable" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Select exact variants before adding a research set");
  });
});
