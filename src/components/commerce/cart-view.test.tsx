import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCartPreviewToken } from "@/cart/preview-token";
import type { CartPreviewItem } from "@/cart/preview-types";

const { useCart, fetchMock, setQuantity, removeItem, clearCart, acknowledgeLegacyReselection } = vi.hoisted(() => ({
  useCart: vi.fn(), fetchMock: vi.fn(), setQuantity: vi.fn(), removeItem: vi.fn(), clearCart: vi.fn(), acknowledgeLegacyReselection: vi.fn(),
}));
vi.mock("@/cart/cart-provider", () => ({ useCart }));
import { CartView } from "./cart-view";

const variantId = "61000000-0000-4000-8000-000000000001";
function cart(quantity = 2) {
  return { hydrated: true, items: [{ variantId, quantity }], legacyItemCount: null, setQuantity, removeItem, clearCart, acknowledgeLegacyReselection };
}
type PreviewOptions = {
  available?: boolean;
  name?: string;
  quantity?: number;
  reasons?: string[];
  requiresAcknowledgement?: boolean;
};

function preview({
  available = true,
  name = "Synthetic local test only — Alpha",
  quantity = 2,
  reasons = [],
  requiresAcknowledgement = false,
}: PreviewOptions = {}) {
  const unitAmountMinor = quantity === 2 ? 2_208 : 2_160;
  const items: CartPreviewItem[] = [{ variantId, quantity, available, purchaseState: available ? "ready" : "unavailable", name, variantLabel: "Synthetic 5 mg", sku: "SYNTHETIC-5MG", packageForm: "Research vial", baseUnitMinor: 2400, unitAmountMinor, lineSubtotalMinor: quantity * unitAmountMinor, lineSavingsMinor: quantity * (2400 - unitAmountMinor), effectiveDiscountBps: quantity === 2 ? 800 : 1000, appliedPromotions: [], currency: "USD" }];
  return {
    schemaVersion: 2,
    items,
    subtotalMinor: quantity * unitAmountMinor, currency: "USD", taxMinor: null, shippingMinor: null, finalDiscountMinor: null,
    previewToken: createCartPreviewToken(items), requiresAcknowledgement, reasons,
  };
}
function response(value: unknown): Response { return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }); }

describe("CartView", () => {
  beforeEach(() => {
    vi.restoreAllMocks(); vi.clearAllMocks(); window.sessionStorage.clear(); window.localStorage.clear();
    useCart.mockReturnValue(cart());
    fetchMock.mockResolvedValue(response(preview())); vi.stubGlobal("fetch", fetchMock);
  });

  it("renders a canonical variant preview without inventing checkout totals", async () => {
    render(<CartView checkoutIntent={null} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.items).toEqual([{ variantId, quantity: 2 }]);
    expect(within(screen.getByRole("complementary", { name: "Order summary" })).getByText("$44.16")).toBeVisible();
  });

  it("retries the unchanged variant cart after a preview failure", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new Error("temporary preview failure")).mockResolvedValueOnce(response(preview()));
    render(<CartView checkoutIntent={null} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The authoritative cart preview is unavailable.");
    const first = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    await user.click(screen.getByRole("button", { name: "Retry current cart facts" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))).toEqual(first);
    expect(await screen.findByText("$44.16")).toBeVisible();
  });

  it("hides a stale preview and refreshes the exact changed variant cart", async () => {
    fetchMock.mockReset()
      .mockResolvedValueOnce(response(preview({ name: "Prior variant" })))
      .mockRejectedValueOnce(new Error("changed preview failure"))
      .mockResolvedValueOnce(response(preview({ quantity: 3, name: "Current variant" })));
    const { rerender } = render(<CartView checkoutIntent={null} />);
    expect(await screen.findByText("Prior variant")).toBeVisible();
    useCart.mockReturnValue(cart(3));
    rerender(<CartView checkoutIntent={null} />);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByText("Prior variant")).toBeNull();
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))).toMatchObject({ items: [{ variantId, quantity: 3 }] });
    fireEvent.click(screen.getByRole("button", { name: "Retry current cart facts" }));
    expect(await screen.findByText("Current variant")).toBeVisible();
  });

  it("uses the canonical variant for increase, decrease, and the 25-unit control cap", async () => {
    const user = userEvent.setup();
    render(<CartView checkoutIntent={null} />);
    await screen.findByText("Synthetic local test only — Alpha");
    await user.click(screen.getByRole("button", { name: "Increase quantity for Synthetic local test only — Alpha" }));
    await user.click(screen.getByRole("button", { name: "Decrease quantity for Synthetic local test only — Alpha" }));
    const input = screen.getByRole("spinbutton", { name: "Quantity for Synthetic local test only — Alpha" });
    expect(input).toHaveAttribute("max", "25");
    fireEvent.change(input, { target: { value: "25" } });
    expect(setQuantity).toHaveBeenNthCalledWith(1, variantId, 3);
    expect(setQuantity).toHaveBeenNthCalledWith(2, variantId, 1);
    expect(setQuantity).toHaveBeenNthCalledWith(3, variantId, 25);
  });

  it("persists the v2 handoff and invokes the supplied checkout navigation", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    render(<CartView checkoutIntent={null} navigate={navigate} />);
    await screen.findByText("$44.16");
    await user.click(screen.getByRole("button", { name: "Continue to sign in" }));
    expect(navigate).toHaveBeenCalledWith("/checkout");
    expect(JSON.parse(window.localStorage.getItem("propeptiq.cart.v2")!)).toEqual({ version: 2, items: [{ variantId, quantity: 2 }] });
  });

  it("requires explicit acknowledgement before removing a v1 cart", async () => {
    const user = userEvent.setup();
    useCart.mockReturnValue({ ...cart(), items: [], legacyItemCount: 2 });
    render(<CartView checkoutIntent={null} />);
    expect(screen.getByRole("heading", { name: "Choose your variants again." })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear old cart and choose variants" }));
    expect(acknowledgeLegacyReselection).toHaveBeenCalledOnce();
  });
});
