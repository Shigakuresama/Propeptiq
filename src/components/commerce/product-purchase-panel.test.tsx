import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { testCanonicalProduct, testPricingContext, testPublicVariant } from "./storefront-test-fixtures";
import { testWinter30 } from "./storefront-test-fixtures";
import * as pricingPresentation from "@/catalog/storefront-price-presentation";
import { CartProvider } from "@/cart/cart-provider";
import { CART_STORAGE_KEY } from "@/cart/cart-storage";
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
    const dl = summary.querySelector("dl")!; const pair = (label: string) => { const dt = within(dl).getByText(label); return dt.nextElementSibling!; };
    expect(pair("Standard unit price")).toHaveTextContent(standard); expect(pair("Effective unit price")).toHaveTextContent(effective); expect(pair("Discount")).toHaveTextContent(discount); expect(pair("Savings")).toHaveTextContent(savings); expect(pair("Quantity")).toHaveTextContent(String(quantity)); expect(pair("Subtotal")).toHaveTextContent(subtotal); expect(pair("Effective unit price")).toHaveClass("font-semibold");
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

  it.each([2, 3, 10])("applies WINTER30 exactly once at quantity %s", (quantity) => {
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct([testPublicVariant()])} pricing={testPricingContext("test", [testWinter30])} /></CartProvider>); fireEvent.change(screen.getByRole("spinbutton", { name: "Exact quantity" }), { target: { value: String(quantity) } }); const summary = screen.getByRole("status", { name: "Purchase summary" }); const discount = within(summary.querySelector("dl")!).getByText("Discount").nextElementSibling!; expect(discount).toHaveTextContent("30%");
  });

  it("renders the permitted preview-zero sale structure exactly", () => {
    const zero = testPublicVariant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, currency: "USD", checkoutReady: false });
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct([zero])} pricing={testPricingContext("preview", [testWinter30])} /></CartProvider>);
    const summary = screen.getByRole("status", { name: "Purchase summary" }); const dl = summary.querySelector("dl")!;
    expect(within(dl).getByText("Standard unit price").nextElementSibling).toContainHTML("<del>$0.00</del>"); expect(within(dl).getByText("Effective unit price").nextElementSibling).toHaveTextContent("$0.00"); expect(within(dl).getByText("Savings").nextElementSibling).toHaveTextContent("$0.00"); expect(within(dl).getByText("Subtotal").nextElementSibling).toHaveTextContent("$0.00"); expect(summary).toHaveTextContent("WINTER30"); expect(summary.querySelector("del")).not.toBeNull();
  });

  it("preserves quantity while a real variant change updates price and status", () => {
    const first = testPublicVariant({ id: "first", label: "First", baseUnitMinor: 1000 }); const second = testPublicVariant({ id: "second", label: "Second", baseUnitMinor: 2000, checkoutReady: false });
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct([first, second], { defaultVariantId: "second" })} pricing={testPricingContext()} /></CartProvider>);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Exact quantity" }), { target: { value: "11" } }); fireEvent.click(screen.getByRole("radio", { name: /First/u }));
    const summary = screen.getByRole("status", { name: "Purchase summary" }); expect(summary).toHaveTextContent("First"); expect(within(summary.querySelector("dl")!).getByText("Quantity").nextElementSibling).toHaveTextContent("11"); expect(summary).toHaveTextContent("$7.00"); expect(summary).not.toHaveTextContent("Checkout unavailable");
  });

  it("supports one externally controlled variant selection without retaining stale internal state", () => {
    const priced = testPublicVariant({ id: "controlled-priced", label: "Controlled priced" });
    const pending = testPublicVariant({
      id: "controlled-pending",
      label: "Controlled pending",
      availability: "preview_only",
      baseUnitMinor: 0,
      checkoutReady: false,
      priceStatus: "pending",
    });
    const product = testCanonicalProduct([priced, pending], { defaultVariantId: priced.id });
    const onSelectedVariantIdChange = vi.fn();
    const view = render(
      <CartProvider>
        <ProductPurchasePanel
          onSelectedVariantIdChange={onSelectedVariantIdChange}
          pricing={testPricingContext("production")}
          product={product}
          selectedVariantId={priced.id}
        />
      </CartProvider>,
    );

    fireEvent.click(screen.getByRole("radio", { name: /Controlled pending/u }));
    expect(onSelectedVariantIdChange).toHaveBeenCalledOnce();
    expect(onSelectedVariantIdChange).toHaveBeenCalledWith(pending.id);
    expect(screen.getByRole("status", { name: "Purchase summary" })).toHaveTextContent("Controlled priced");

    view.rerender(
      <CartProvider>
        <ProductPurchasePanel
          onSelectedVariantIdChange={onSelectedVariantIdChange}
          pricing={testPricingContext("production")}
          product={product}
          selectedVariantId={pending.id}
        />
      </CartProvider>,
    );
    expect(screen.getByRole("status", { name: "Purchase summary" })).toHaveTextContent("Controlled pending");
    expect(screen.getByRole("status", { name: "Purchase summary" })).toHaveTextContent("Pricing coming soon");
  });

  it("reports every valid quantity change to a shared visual selection owner", () => {
    const onSelectedQuantityChange = vi.fn();
    render(
      <CartProvider>
        <ProductPurchasePanel
          onSelectedQuantityChange={onSelectedQuantityChange}
          pricing={testPricingContext("production")}
          product={testCanonicalProduct()}
        />
      </CartProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "2 bottles" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Exact quantity" }), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "10 or more bottles" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Exact quantity" }), {
      target: { value: "" },
    });

    expect(onSelectedQuantityChange.mock.calls).toEqual([[2], [3], [10], [null]]);
  });

  it("keeps the 10+ interaction synchronized with pricing and exits through decrement", () => {
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct([testPublicVariant()])} pricing={testPricingContext()} /></CartProvider>);
    const exactQuantity = () => screen.getByRole("spinbutton", { name: "Exact quantity" });
    const tenPlus = () => screen.getByRole("button", { name: "10 or more bottles" });
    const summary = () => screen.getByRole("status", { name: "Purchase summary" });

    fireEvent.click(tenPlus());
    expect(exactQuantity()).toHaveValue(10);
    expect(exactQuantity()).toHaveAttribute("min", "10");
    expect(tenPlus()).toHaveAttribute("aria-pressed", "true");
    expect(summary()).toHaveTextContent("30%");
    expect(summary()).toHaveTextContent("$30.00");
    expect(summary()).toHaveTextContent("$70.00");

    fireEvent.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(exactQuantity()).toHaveValue(11);
    expect(exactQuantity()).toHaveAttribute("min", "10");
    expect(tenPlus()).toHaveAttribute("aria-pressed", "true");
    expect(summary()).toHaveTextContent("30%");
    expect(summary()).toHaveTextContent("$33.00");
    expect(summary()).toHaveTextContent("$77.00");

    fireEvent.click(screen.getByRole("button", { name: "Decrease quantity" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease quantity" }));
    expect(exactQuantity()).toHaveValue(9);
    expect(exactQuantity()).toHaveAttribute("min", "1");
    expect(tenPlus()).toHaveAttribute("aria-pressed", "false");
    expect(summary()).toHaveTextContent("10%");
    expect(summary()).toHaveTextContent("$9.00");
    expect(summary()).toHaveTextContent("$81.00");

    fireEvent.click(screen.getByRole("button", { name: "2 bottles" }));
    expect(exactQuantity()).toHaveValue(2);
    expect(exactQuantity()).toHaveAttribute("min", "1");
    expect(summary()).toHaveTextContent("8%");
    expect(summary()).toHaveTextContent("$1.60");
    expect(summary()).toHaveTextContent("$18.40");
  });

  it.each(["9", "1"])("rejects typed quantity %s while the 10+ minimum is active", (draft) => {
    const resolver = vi.spyOn(pricingPresentation, "resolvePublicVariantPrice");
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct([testPublicVariant()])} pricing={testPricingContext()} /></CartProvider>);
    const input = screen.getByRole("spinbutton", { name: "Exact quantity" });
    fireEvent.click(screen.getByRole("button", { name: "10 or more bottles" }));
    resolver.mockClear();
    fireEvent.change(input, { target: { value: draft } });
    expect(input).toHaveAttribute("min", "10");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a whole number from 10 to 25.")).toBeVisible();
    const summary = screen.getByRole("status", { name: "Purchase summary" });
    expect(summary).toHaveTextContent("Invalid quantity");
    expect(summary).toHaveTextContent("Enter a whole number from 10 to 25.");
    expect(summary).not.toHaveTextContent("Enter a whole number from 1 to 25.");
    expect(screen.getByRole("button", { name: /unavailable/i })).toBeDisabled();
    expect(resolver).not.toHaveBeenCalled();
    if (draft === "9") {
      fireEvent.click(screen.getByRole("button", { name: "Decrease quantity" }));
      expect(input).toHaveValue(9);
      expect(input).toHaveAttribute("min", "1");
      expect(input).not.toHaveAttribute("aria-invalid", "true");
      expect(screen.queryByText("Enter a whole number from 10 to 25.")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "10 or more bottles" })).toHaveAttribute("aria-pressed", "false");
      expect(summary).toHaveTextContent("10%");
      expect(summary).toHaveTextContent("$81.00");
      expect(screen.getByRole("button", { name: /add synthetic product alpha to cart/i })).toBeEnabled();
      fireEvent.change(input, { target: { value: "10" } });
      expect(input).toHaveAttribute("min", "10");
      expect(screen.getByRole("button", { name: "10 or more bottles" })).toHaveAttribute("aria-pressed", "true");
    }
    resolver.mockRestore();
  });

  it.each([
    ["mapping missing", testPublicVariant({ checkoutReady: false }), "Checkout unavailable", true],
    ["unavailable", testPublicVariant({ availability: "unavailable", checkoutReady: false }), "Unavailable", false],
    ["pending null", testPublicVariant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: null, currency: null, checkoutReady: false }), "Pricing coming soon", false],
    ["pending positive", testPublicVariant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 1000, currency: "USD", checkoutReady: false }), "Pricing coming soon", false],
    ["malformed active zero", testPublicVariant({ baseUnitMinor: 0, checkoutReady: false }), "Pricing coming soon", false],
    ["preview zero", testPublicVariant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, currency: "USD", checkoutReady: false }), "Local cart preview", true],
  ] as const)("handles %s honestly", (_name, variant, status, hasMoney) => {
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct([variant])} pricing={testPricingContext("preview", [{ ...testWinter30, displayCode: "ZERO" }])} /></CartProvider>);
    const summary = screen.getByRole("status", { name: "Purchase summary" }); expect(summary).toHaveTextContent(status); if (!hasMoney || String(status) === "Pricing coming soon") { expect(summary).not.toHaveTextContent("Standard unit price"); expect(summary).not.toHaveTextContent("Savings"); expect(summary).not.toHaveTextContent("Subtotal"); expect(summary.querySelector("del")).toBeNull(); expect(summary).not.toHaveTextContent("ZERO"); }
  });

  it("keeps production pending-zero closed and invalid drafts out of arithmetic", () => {
    const resolver = vi.spyOn(pricingPresentation, "resolvePublicVariantPrice");
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct([testPublicVariant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, currency: "USD", checkoutReady: false })])} pricing={testPricingContext("production")} /></CartProvider>);
    expect(screen.getByRole("status", { name: "Purchase summary" })).toHaveTextContent("Pricing coming soon");
    resolver.mockClear();
    for (const value of ["", "1.0", "1e1", "x", "0", "-1", "26"]) { fireEvent.change(screen.getByRole("spinbutton", { name: "Exact quantity" }), { target: { value } }); expect(screen.getByRole("spinbutton")).toHaveAttribute("aria-invalid", "true"); expect(screen.getByRole("button", { name: /unavailable/i })).toBeDisabled(); }
    expect(resolver).not.toHaveBeenCalled(); resolver.mockRestore();
  });

  it("adds a positive preview-only Production quantity with an honest announcement", async () => {
    window.localStorage.clear();
    const previewOnly = testPublicVariant({
      id: "production-preview-variant",
      label: "30 mg",
      availability: "preview_only",
      checkoutReady: false,
    });
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct([previewOnly])} pricing={testPricingContext("production")} /></CartProvider>);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Exact quantity" }), { target: { value: "3" } });
    expect(screen.getByRole("status", { name: "Purchase summary" })).toHaveTextContent("Cart preview only");
    const add = screen.getByRole("button", { name: "Add Synthetic Product Alpha to preview cart" });
    expect(add).toHaveTextContent("Add to preview cart");
    fireEvent.click(add);
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "null")).toEqual({
      version: 2,
      items: [{ variantId: "production-preview-variant", quantity: 3 }],
    }));
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("Synthetic Product Alpha, 30 mg: 3 units");
  });

  it("links the panel error and recovers from invalid drafts to canonical 11", () => {
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct()} pricing={testPricingContext()} /></CartProvider>);
    const input = screen.getByRole("spinbutton", { name: "Exact quantity" }); fireEvent.change(input, { target: { value: "1.0" } });
    expect(input).toHaveAttribute("aria-invalid", "true"); expect(input).toHaveAttribute("aria-describedby", "quantity-error"); expect(screen.getByText("Enter a whole number from 1 to 25.")).toBeVisible(); expect(screen.getByRole("button", { name: /unavailable/i })).toBeDisabled();
    fireEvent.change(input, { target: { value: "11" } }); expect(input).not.toHaveAttribute("aria-invalid", "true"); expect(screen.getByRole("status", { name: "Purchase summary" })).toHaveTextContent("Quantity11");
  });

  it("exposes exactly one panel summary and one global cart announcement", () => {
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct()} pricing={testPricingContext()} /></CartProvider>);
    expect(screen.getAllByRole("status", { name: "Purchase summary" })).toHaveLength(1); expect(screen.getAllByRole("status", { name: "Cart updates" })).toHaveLength(1);
  });

  it("forwards exact canonical identity, quantity, product, and variant labels to the cart", async () => {
    window.localStorage.clear();
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct([testPublicVariant()])} pricing={testPricingContext()} /></CartProvider>);
    fireEvent.click(screen.getByRole("button", { name: "10 or more bottles" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(screen.getByRole("spinbutton", { name: "Exact quantity" })).toHaveValue(11);
    expect(screen.getByRole("spinbutton", { name: "Exact quantity" })).toHaveAttribute("min", "10");
    expect(screen.getByRole("button", { name: "10 or more bottles" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /add synthetic product alpha to cart/i }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "null").items).toEqual([{ variantId: "variant-5mg", quantity: 11 }]));
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("Synthetic Product Alpha, 5 mg");
  });

  it("does not announce success when cart normalization rejects an already-full line", async () => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ version: 2, items: [{ variantId: "variant-5mg", quantity: 25 }] }));
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct([testPublicVariant()])} pricing={testPricingContext()} /></CartProvider>); const add = screen.getByRole("button", { name: "Add Synthetic Product Alpha to cart" }); expect(add).toHaveTextContent("Add to cart"); fireEvent.click(add); await waitFor(() => expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("cart was not changed")); expect(screen.getByRole("status", { name: "Purchase summary" })).toHaveTextContent("Ready to purchase");
  });
});
