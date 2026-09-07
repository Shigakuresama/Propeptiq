import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { CartProvider } from "@/cart/cart-provider";
import { CART_STORAGE_KEY, MAX_CART_DISTINCT_ITEMS } from "@/cart/cart-storage";
import { RelatedProductsCarousel } from "./related-products-carousel";
import { testCanonicalProduct, testPricingContext, testPublicVariant } from "./storefront-test-fixtures";

// Synthetic catalog fixtures exercise the real UI/cart components, never provider or production data.
describe("RelatedProductsCarousel real commerce integration", () => {
  beforeEach(() => window.localStorage.clear());

  it("uses real listing-card dropdown selection, cart announcement, and direct add", async () => {
    const user = userEvent.setup();
    const multi = testCanonicalProduct([
      testPublicVariant({ id: "real-five", label: "5 mg" }),
      testPublicVariant({ id: "real-ten", label: "10 mg" }),
    ], { id: "real-multi", name: "Real Multi" });
    const single = testCanonicalProduct([testPublicVariant({ id: "real-single", label: "2 mg" })], { id: "real-single-product", name: "Real Single" });
    render(<CartProvider><RelatedProductsCarousel currentProductId="current" products={[multi, single]} pricing={testPricingContext()} /></CartProvider>);
    const select = screen.getByRole("combobox", { name: "Real Multi amount" });
    await user.selectOptions(select, "real-ten");
    expect(screen.queryByText(/Cart updated/iu)).toBeNull();
    const confirm = screen.getByRole("button", { name: /add real multi to cart/iu });
    await user.click(confirm);
    await waitFor(() => expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("Real Multi, 10 mg: 1 unit"));
    expect(confirm).toHaveFocus();
    expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "{}").items).toEqual([{ variantId: "real-ten", quantity: 1 }]);
    const direct = screen.getByRole("button", { name: "Add Real Single to cart" });
    await user.click(direct);
    await waitFor(() => expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("Real Single, 2 mg: 1 unit"));
    expect(direct).toHaveFocus();
  });

  it("keeps the exact cart unchanged when full-cart normalization rejects a new variant", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ version: 2, items: Array.from({ length: MAX_CART_DISTINCT_ITEMS }, (_, index) => ({ variantId: `seed-${index}`, quantity: 1 })) }));
    const product = testCanonicalProduct([testPublicVariant({ id: "rejected-five", label: "5 mg" }), testPublicVariant({ id: "rejected-ten", label: "10 mg" })], { id: "rejected-product", name: "Rejected Product" });
    render(<CartProvider><RelatedProductsCarousel currentProductId="current" products={[product]} pricing={testPricingContext()} /></CartProvider>);
    const trigger = screen.getByRole("button", { name: "Add Rejected Product to cart" });
    const serializedBefore = window.localStorage.getItem(CART_STORAGE_KEY);
    const itemsBefore = JSON.parse(serializedBefore ?? "{}").items;
    const urlBefore = window.location.href;
    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("The cart was not changed."));
    expect(trigger).toHaveFocus();
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe(serializedBefore);
    const itemsAfter = JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "{}").items;
    expect(itemsAfter).toEqual(itemsBefore);
    expect(itemsAfter.map((item: { variantId: string }) => item.variantId)).toEqual(itemsBefore.map((item: { variantId: string }) => item.variantId));
    expect(itemsAfter).not.toContainEqual(expect.objectContaining({ variantId: "rejected-five" }));
    expect(itemsAfter).toHaveLength(MAX_CART_DISTINCT_ITEMS);
    expect(window.location.href).toBe(urlBefore);
  });
});
