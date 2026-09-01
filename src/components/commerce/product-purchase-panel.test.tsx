import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { testCanonicalProduct, testPricingContext, testPublicVariant } from "./storefront-test-fixtures";
import { CartProvider } from "@/cart/cart-provider";
import { ProductPurchasePanel } from "./product-purchase-panel";
describe("ProductPurchasePanel", () => {
  it("fails closed when default identity is not a member", () => {
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct([testPublicVariant({ id: "first" }), testPublicVariant({ id: "second" })], { defaultVariantId: "missing" })} pricing={testPricingContext()} /></CartProvider>);
    expect(screen.getByRole("status", { name: "Purchase summary" })).toHaveTextContent("No variant selected");
    expect(screen.getByRole("button", { name: /unavailable/i })).toBeDisabled();
    expect(screen.getByRole("status", { name: "Purchase summary" })).toHaveTextContent("Choose a variant");
  });
  it.each([[1, "$10.00", "0%"], [2, "$9.20", "8%"], [3, "$9.00", "10%"], [10, "$7.00", "30%"]])("shows quantity pricing %s", (quantity, effective, discount) => {
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct([testPublicVariant()])} pricing={testPricingContext()} /></CartProvider>);
    const input = screen.getByRole("spinbutton", { name: "Exact quantity" }); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, String(quantity)); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(screen.getByRole("status", { name: "Purchase summary" })).toHaveTextContent(discount);
    expect(screen.getByRole("status", { name: "Purchase summary" })).toHaveTextContent(effective);
  });
});
