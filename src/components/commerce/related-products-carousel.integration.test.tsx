import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { CartProvider } from "@/cart/cart-provider";
import { CART_STORAGE_KEY, MAX_CART_DISTINCT_ITEMS } from "@/cart/cart-storage";
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
    const firstRadio = screen.getByRole("radio", { name: /5 mg/iu });
    firstRadio.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: /10 mg/iu })).toBeChecked();
    const confirm = screen.getByRole("button", { name: /add real multi to cart/iu });
    await user.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("Real Multi, 10 mg: 1 unit"));
    expect(trigger).toHaveFocus();
    expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "{}").items).toEqual([{ variantId: "real-ten", quantity: 1 }]);
    const direct = screen.getByRole("button", { name: "Add Real Single to cart" });
    await user.click(direct);
    await waitFor(() => expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("Real Single, 2 mg: 1 unit"));
    expect(direct).toHaveFocus();
  });

  it("keeps the Sheet open when full-cart normalization rejects a new variant", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ version: 2, items: Array.from({ length: MAX_CART_DISTINCT_ITEMS }, (_, index) => ({ variantId: `seed-${index}`, quantity: 1 })) }));
    const product = testCanonicalProduct([testPublicVariant({ id: "rejected-five", label: "5 mg" }), testPublicVariant({ id: "rejected-ten", label: "10 mg" })], { id: "rejected-product", name: "Rejected Product" });
    render(<CartProvider><RelatedProductsCarousel currentProductId="current" products={[product]} pricing={testPricingContext()} /></CartProvider>);
    const trigger = screen.getByRole("button", { name: "Add Rejected Product to cart" });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /add rejected product to cart/iu }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(document.activeElement).not.toBe(trigger);
    expect(screen.getByRole("status", { name: "Cart updates" })).not.toHaveTextContent(/Cart updated/iu);
    expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "{}").items).toHaveLength(MAX_CART_DISTINCT_ITEMS);
  });
});
