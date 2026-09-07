import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartProvider } from "@/cart/cart-provider";
import { CART_STORAGE_KEY } from "@/cart/cart-storage";
import { ProductPurchasePanel } from "./product-purchase-panel";
import { testCanonicalProduct, testPricingContext, testPublicVariant, testWinter30 } from "./storefront-test-fixtures";

const summary = () => screen.getByRole("status", { name: "Purchase summary" });
const quantityControl = () => screen.getByRole("spinbutton", { name: "Quantity" });
const chooseQuantity = (quantity: number) => fireEvent.change(quantityControl(), { target: { value: String(quantity) } });
const renderPanel = (product = testCanonicalProduct(), pricing = testPricingContext()) =>
  render(<CartProvider><ProductPurchasePanel product={product} pricing={pricing} /></CartProvider>);

describe("ProductPurchasePanel", () => {
  beforeEach(() => window.localStorage.clear());

  it("requires a catalog member when the configured default is missing", () => {
    renderPanel(testCanonicalProduct([testPublicVariant()], { defaultVariantId: "missing" }));
    expect(summary()).toHaveTextContent("No amount selected");
    expect(summary()).toHaveTextContent("Choose an amount");
    expect(screen.getByRole("button", { name: /unavailable/i })).toBeDisabled();
    expect(screen.getAllByRole("radio").some((input) => (input as HTMLInputElement).checked)).toBe(false);
  });

  it.each([
    [1, "$10.00", "$10.00", null],
    [2, "$9.70", "$19.40", "$0.60"],
    [3, "$9.70", "$29.10", "$0.90"],
    [4, "$9.40", "$37.60", "$2.40"],
    [9, "$9.40", "$84.60", "$5.40"],
    [10, "$9.40", "$94.00", "$6.00"],
    [11, "$7.00", "$77.00", "$33.00"],
    [25, "$7.00", "$175.00", "$75.00"],
  ] as const)("shows exact approved pricing for %s units", (quantity, unit, subtotal, savings) => {
    renderPanel();
    chooseQuantity(quantity);
    expect(summary()).toHaveTextContent(unit + " per unit");
    expect(within(summary()).getByText(subtotal, { selector: "strong" })).toBeVisible();
    if (savings) {
      expect(summary()).toHaveTextContent("Save " + savings);
      expect(summary().querySelector("del")).not.toBeNull();
    } else {
      expect(summary()).not.toHaveTextContent("Save");
      expect(summary().querySelector("del")).toBeNull();
    }
  });

  it("offers only whole quantities 1 to 25 and ignores invalid selections", () => {
    renderPanel();
    const savedCart = window.localStorage.getItem(CART_STORAGE_KEY);
    expect(quantityControl()).toHaveAttribute("min", "1");
    expect(quantityControl()).toHaveAttribute("max", "25");
    expect(quantityControl()).toHaveAttribute("step", "1");
    expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
    chooseQuantity(11);
    for (const value of ["", "0", "-1", "26", "1.5", "invalid"]) {
      fireEvent.change(quantityControl(), { target: { value } });
      expect(summary()).toHaveTextContent("11 units");
      expect(summary()).toHaveTextContent("$77.00");
      expect(quantityControl()).toHaveAttribute("aria-invalid", "true");
      const add = screen.getByRole("button", { name: /unavailable/i });
      expect(add).toBeDisabled();
      fireEvent.click(add);
      expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe(savedCart);
      fireEvent.blur(quantityControl());
      expect(quantityControl()).toHaveValue(11);
      expect(quantityControl()).not.toHaveAttribute("aria-invalid");
      expect(screen.getByRole("button", { name: "Add Synthetic Product Alpha to cart" })).toBeEnabled();
    }
  });

  it("steps within the 1–25 unit bounds without changing the cart", () => {
    renderPanel();
    const savedCart = window.localStorage.getItem(CART_STORAGE_KEY);
    const minus = screen.getByRole("button", { name: "Decrease quantity" });
    const plus = screen.getByRole("button", { name: "Increase quantity" });
    expect(minus).toBeDisabled();
    fireEvent.click(plus);
    expect(quantityControl()).toHaveValue(2);
    fireEvent.click(minus);
    expect(quantityControl()).toHaveValue(1);
    chooseQuantity(25);
    expect(plus).toBeDisabled();
    fireEvent.click(plus);
    expect(quantityControl()).toHaveValue(25);
    fireEvent.click(minus);
    expect(quantityControl()).toHaveValue(24);
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBe(savedCart);
  });

  it.each([[2, "$13.58", 3], [4, "$26.32", 6], [11, "$53.90", 30]])("keeps bundle %s, stepper, promotion and cart synchronized", async (quantity, total, extra) => {
    renderPanel(testCanonicalProduct(), testPricingContext("test", [testWinter30]));
    const bundle = screen.getByRole("button", { name: new RegExp("^" + quantity + " bottles,") });
    fireEvent.click(bundle);
    expect(bundle).toHaveAttribute("aria-pressed", "true");
    expect(quantityControl()).toHaveValue(quantity);
    expect(summary()).toHaveTextContent("30%");
    expect(summary()).toHaveTextContent("WINTER30 −30%");
    expect(summary()).toHaveTextContent(String(total));
    expect(summary()).toHaveTextContent(`Bundle −${extra}% extra`);
    fireEvent.click(screen.getByRole("button", { name: "Add Synthetic Product Alpha to cart" }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "{}").items)
      .toEqual([{ variantId: "variant-5mg", quantity }]));
    chooseQuantity(1);
    expect(bundle).toHaveAttribute("aria-pressed", "false");
  });

  it("uses only the highest eligible discount and its public name", () => {
    renderPanel(testCanonicalProduct(), testPricingContext("test", [
      { ...testWinter30, id: "eligible35", displayCode: null, displayName: "Thirty Five", discountBps: 3500 },
      testWinter30,
      { ...testWinter30, id: "other40", discountBps: 4000, scope: { kind: "products", productIds: ["other"] } },
    ]));
    chooseQuantity(10);
    expect(summary()).toHaveTextContent("35%");
    expect(summary()).toHaveTextContent("$61.10");
    expect(summary()).toHaveTextContent("Thirty Five −35%");
    expect(summary()).not.toHaveTextContent(/eligible35|other40|WINTER30/);
  });

  it("preserves quantity on amount change and adds the exact selected id", async () => {
    const user = userEvent.setup();
    renderPanel(testCanonicalProduct([
      testPublicVariant(),
      testPublicVariant({ id: "variant-10mg", label: "10 mg", baseUnitMinor: 2000 }),
    ]));
    chooseQuantity(11);
    await user.click(screen.getByRole("radio", { name: "10 mg" }));
    expect(quantityControl()).toHaveValue(11);
    expect(summary()).toHaveTextContent("10 mg");
    expect(summary()).toHaveTextContent("$154.00");
    await user.click(screen.getByRole("button", { name: "Add Synthetic Product Alpha to cart" }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "{}").items)
      .toEqual([{ variantId: "variant-10mg", quantity: 11 }]));
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("Synthetic Product Alpha, 10 mg: 11 units");
  });

  it("keeps package bottles separate from purchased units", () => {
    renderPanel(testCanonicalProduct([testPublicVariant({ packageQuantity: 10 })]));
    fireEvent.click(screen.getByRole("button", { name: /^20 bottles,/ }));
    expect(quantityControl()).toHaveValue(2);
    expect(summary()).toHaveTextContent("2 units");
    expect(summary()).toHaveTextContent("$14.00");
  });

  it("waits for its controlled owner to apply an amount", () => {
    const product = testCanonicalProduct([testPublicVariant(), testPublicVariant({ id: "second", label: "Second", baseUnitMinor: 2000 })]);
    const change = vi.fn();
    const view = render(<CartProvider><ProductPurchasePanel product={product} pricing={testPricingContext()} selectedVariantId="variant-5mg" onSelectedVariantIdChange={change} /></CartProvider>);
    fireEvent.click(screen.getByRole("radio", { name: "Second" }));
    expect(change).toHaveBeenCalledWith("second");
    expect(summary()).toHaveTextContent("5 mg");
    view.rerender(<CartProvider><ProductPurchasePanel product={product} pricing={testPricingContext()} selectedVariantId="second" onSelectedVariantIdChange={change} /></CartProvider>);
    expect(summary()).toHaveTextContent("Second");
    expect(summary()).toHaveTextContent("$20.00");
  });

  it.each([
    [testPublicVariant({ availability: "unavailable", checkoutReady: false }), "Unavailable"],
    [testPublicVariant({ priceStatus: "pending", baseUnitMinor: null, checkoutReady: false }), "Currently unavailable"],
    [testPublicVariant({ priceStatus: "pending", baseUnitMinor: 0, availability: "preview_only", checkoutReady: false }), "Currently unavailable"],
    [testPublicVariant({ baseUnitMinor: 0, checkoutReady: false }), "Currently unavailable"],
  ] as const)("prevents unsafe production purchasing: %j", (variant, reason) => {
    renderPanel(testCanonicalProduct([variant]), testPricingContext("production", [testWinter30]));
    const unavailable = screen.getByRole("button", { name: /unavailable/i });
    expect(unavailable).toBeDisabled();
    expect(unavailable).toHaveTextContent(reason);
    expect(unavailable).toHaveAttribute("title", reason);
    expect(summary()).not.toHaveTextContent(/\$|Save|WINTER30/);
    expect(screen.queryByRole("group", { name: "Bundle and save" })).toBeNull();
  });

  it("keeps missing checkout mapping closed and supplies a contact link", () => {
    renderPanel(testCanonicalProduct([testPublicVariant({ checkoutReady: false })]), testPricingContext("production"));
    const unavailable = screen.getByRole("button", { name: /unavailable/i });
    expect(unavailable).toBeDisabled();
    expect(unavailable).toHaveTextContent("Ordering not open");
    expect(unavailable).toHaveAttribute("title", "Ordering not open");
    expect(screen.getByText(/Ordering is not open/)).not.toHaveTextContent("Save your selection");
    expect(screen.getByRole("link", { name: "Contact us" })).toHaveAttribute("href", "/contact");
    expect(document.body).not.toHaveTextContent("Checkout unavailable");
  });

  it("allows the existing preview cart without promising checkout", async () => {
    renderPanel(testCanonicalProduct([testPublicVariant({ availability: "preview_only", checkoutReady: false })]), testPricingContext("production"));
    chooseQuantity(3);
    expect(screen.getByText(/Ordering is not open/)).toHaveTextContent("Save your selection");
    fireEvent.click(screen.getByRole("button", { name: "Add Synthetic Product Alpha to cart" }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "{}").items)
      .toEqual([{ variantId: "variant-5mg", quantity: 3 }]));
  });

  it("labels nonproduction zero pricing without fabricated savings", () => {
    renderPanel(testCanonicalProduct([testPublicVariant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, checkoutReady: false })]), testPricingContext("preview", [testWinter30]));
    expect(summary()).toHaveTextContent("Test mode — no payments");
    expect(summary()).toHaveTextContent("$0.00");
    expect(summary()).not.toHaveTextContent("Save");
    expect(summary().querySelector("del")).toBeNull();
  });

  it("reports stepper and bundle changes to the shared visual owner", () => {
    const change = vi.fn();
    render(<CartProvider><ProductPurchasePanel product={testCanonicalProduct()} pricing={testPricingContext()} onSelectedQuantityChange={change} /></CartProvider>);
    chooseQuantity(3);
    fireEvent.click(screen.getByRole("button", { name: /^11 bottles,/ }));
    expect(change.mock.calls).toEqual([[3], [11]]);
    expect(document.getElementById("purchase-heading")).toHaveClass("product-purchase-heading");
  });

  it("does not announce success when the cart rejects an already-full line", async () => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ version: 2, items: [{ variantId: "variant-5mg", quantity: 25 }] }));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Add Synthetic Product Alpha to cart" }));
    await waitFor(() => expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("cart was not changed"));
    expect(screen.getAllByRole("status", { name: "Purchase summary" })).toHaveLength(1);
  });
});
