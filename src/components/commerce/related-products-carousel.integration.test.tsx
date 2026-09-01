import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { CartProvider } from "@/cart/cart-provider";
import { RelatedProductsCarousel } from "./related-products-carousel";
import { testCanonicalProduct, testPricingContext, testPublicVariant } from "./storefront-test-fixtures";

describe("RelatedProductsCarousel real commerce integration", () => {
  beforeEach(() => window.localStorage.clear());

  it("uses real listing cards, Sheet selection, cart announcement, and direct add", async () => {
    const user = userEvent.setup();
    const multi = testCanonicalProduct([
      testPublicVariant({ id: "real-five", label: "5 mg" }),
      testPublicVariant({ id: "real-ten", label: "10 mg" }),
    ], { id: "real-multi", name: "Real Multi" });
    const single = testCanonicalProduct([testPublicVariant({ id: "real-single", label: "2 mg" })], { id: "real-single-product", name: "Real Single" });
    render(<CartProvider><RelatedProductsCarousel currentProductId="current" products={[multi, single]} pricing={testPricingContext()} /></CartProvider>);
    const trigger = screen.getByRole("button", { name: "Add Real Multi to cart" });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.queryByText(/Cart updated/iu)).toBeNull();
    await user.click(screen.getByRole("radio", { name: /10 mg/iu }));
    const confirm = screen.getByRole("button", { name: /add real multi to cart/iu });
    await user.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("Real Multi, 10 mg: 1 unit"));
    expect(trigger).toHaveFocus();
    const direct = screen.getByRole("button", { name: "Add Real Single to cart" });
    await user.click(direct);
    await waitFor(() => expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("Real Single, 2 mg: 1 unit"));
    expect(direct).toHaveFocus();
  });
});
