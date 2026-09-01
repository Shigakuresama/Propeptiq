import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { testCanonicalProduct, testPricingContext, testPublicVariant } from "./storefront-test-fixtures";
import { testWinter30 } from "./storefront-test-fixtures";
import * as pricingPresentation from "@/catalog/storefront-price-presentation";
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

  it.each([[1, "$10.00", "$10.00", "0%", "$0.00", "$10.00"], [2, "$10.00", "$9.20", "8%", "$1.60", "$18.40"], [3, "$10.00", "$9.00", "10%", "$3.00", "$27.00"], [4, "$10.00", "$9.00", "10%", "$4.00", "$36.00"], [9, "$10.00", "$9.00", "10%", "$9.00", "$81.00"], [10, "$10.00", "$7.00", "30%", "$30.00", "$70.00"], [11, "$10.00", "$7.00", "30%", "$33.00", "$77.00"], [25, "$10.00", "$7.00", "30%", "$75.00", "$175.00"]] as const)("renders exact price semantics at quantity %s", (quantity, standard, effective, discount, savings, subtotal) => {
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct([testPublicVariant()])} pricing={testPricingContext()} /></CartProvider>);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Exact quantity" }), { target: { value: String(quantity) } });
    const summary = screen.getByRole("status", { name: "Purchase summary" });
    expect(summary).toHaveTextContent(standard); expect(summary).toHaveTextContent(effective); expect(summary).toHaveTextContent(discount); expect(summary).toHaveTextContent(savings); expect(summary).toHaveTextContent(String(quantity)); expect(summary).toHaveTextContent(subtotal);
    if (quantity === 1) expect(summary.querySelector("del")).toBeNull(); else expect(summary.querySelector("del")).not.toBeNull();
  });

  it("uses one highest eligible promotion and never falls back to its internal id", () => {
    const promotions = [
      { ...testWinter30, id: "eligible35", displayCode: null, displayName: "Thirty Five", discountBps: 3500 },
      { ...testWinter30, id: "winter30", displayCode: "WINTER30", discountBps: 3000 },
      { ...testWinter30, id: "other40", displayCode: "OTHER40", discountBps: 4000, scope: { kind: "products" as const, productIds: ["other"] } },
    ];
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct([testPublicVariant()])} pricing={testPricingContext("test", promotions)} /></CartProvider>);
    expect(screen.getByRole("status", { name: "Purchase summary" })).toHaveTextContent("35%"); expect(screen.getByRole("status", { name: "Purchase summary" })).toHaveTextContent("Thirty Five"); expect(screen.getByRole("status", { name: "Purchase summary" })).not.toHaveTextContent("eligible35");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Exact quantity" }), { target: { value: "10" } }); expect(screen.getByRole("status", { name: "Purchase summary" })).toHaveTextContent("35%");
  });

  it.each([
    ["mapping missing", testPublicVariant({ checkoutReady: false }), "Checkout unavailable", true],
    ["unavailable", testPublicVariant({ availability: "unavailable", checkoutReady: false }), "Unavailable", false],
    ["pending null", testPublicVariant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: null, currency: null, checkoutReady: false }), "Pricing coming soon", false],
    ["pending positive", testPublicVariant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 1000, currency: "USD", checkoutReady: false }), "Pricing coming soon", false],
    ["malformed active zero", testPublicVariant({ baseUnitMinor: 0, checkoutReady: false }), "Pricing coming soon", false],
    ["preview zero", testPublicVariant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, currency: "USD", checkoutReady: false }), "Preview only", true],
  ] as const)("handles %s honestly", (_name, variant, status, hasMoney) => {
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct([variant])} pricing={testPricingContext("preview", [{ ...testWinter30, displayCode: "ZERO" }])} /></CartProvider>);
    const summary = screen.getByRole("status", { name: "Purchase summary" }); expect(summary).toHaveTextContent(status); if (!hasMoney || String(status) === "Pricing coming soon") expect(summary).not.toHaveTextContent("Standard unit price");
  });

  it("keeps production pending-zero closed and invalid drafts out of arithmetic", () => {
    const resolver = vi.spyOn(pricingPresentation, "resolvePublicVariantPrice");
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct([testPublicVariant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, currency: "USD", checkoutReady: false })])} pricing={testPricingContext("production")} /></CartProvider>);
    expect(screen.getByRole("status", { name: "Purchase summary" })).toHaveTextContent("Pricing coming soon");
    resolver.mockClear();
    for (const value of ["", "1.0", "1e1", "x", "0", "-1", "26"]) { fireEvent.change(screen.getByRole("spinbutton", { name: "Exact quantity" }), { target: { value } }); expect(screen.getByRole("spinbutton")).toHaveAttribute("aria-invalid", "true"); expect(screen.getByRole("button", { name: /unavailable/i })).toBeDisabled(); }
    expect(resolver).not.toHaveBeenCalled(); resolver.mockRestore();
  });

  it("exposes exactly one panel summary and one global cart announcement", () => {
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct()} pricing={testPricingContext()} /></CartProvider>);
    expect(screen.getAllByRole("status", { name: "Purchase summary" })).toHaveLength(1); expect(screen.getAllByRole("status", { name: "Cart updates" })).toHaveLength(1);
  });
});
