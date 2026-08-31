import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useCart, fetchMock, setQuantity, removeItem, clearCart, acknowledgeLegacyReselection } = vi.hoisted(() => ({
  useCart: vi.fn(), fetchMock: vi.fn(), setQuantity: vi.fn(), removeItem: vi.fn(), clearCart: vi.fn(), acknowledgeLegacyReselection: vi.fn(),
}));
vi.mock("@/cart/cart-provider", () => ({ useCart }));
import { CartView } from "./cart-view";

const variantId = "61000000-0000-4000-8000-000000000001";
const preview = {
  items: [{ variantId, quantity: 2, available: true, name: "Synthetic local test only — Alpha", packageForm: "Research vial", unitAmountMinor: 2400, lineSubtotalMinor: 4800, currency: "USD" }],
  subtotalMinor: 4800, currency: "USD", taxMinor: null, shippingMinor: null, finalDiscountMinor: null,
  previewToken: "c".repeat(64), requiresAcknowledgement: false, reasons: [],
};
function response(value: unknown): Response { return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }); }

describe("CartView", () => {
  beforeEach(() => {
    vi.restoreAllMocks(); vi.clearAllMocks(); window.sessionStorage.clear();
    useCart.mockReturnValue({ hydrated: true, items: [{ variantId, quantity: 2 }], legacyItemCount: null, setQuantity, removeItem, clearCart, acknowledgeLegacyReselection });
    fetchMock.mockResolvedValue(response(preview)); vi.stubGlobal("fetch", fetchMock);
  });

  it("renders a canonical variant preview without inventing checkout totals", async () => {
    render(<CartView checkoutIntent={null} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body.items).toEqual([{ variantId, quantity: 2 }]);
    expect(within(screen.getByRole("complementary", { name: "Order summary" })).getByText("$48.00")).toBeVisible();
    expect(screen.getByLabelText("Quantity for Synthetic local test only — Alpha")).toHaveValue(2);
  });

  it("requires explicit acknowledgement before removing a v1 cart", async () => {
    const user = userEvent.setup();
    useCart.mockReturnValue({ hydrated: true, items: [], legacyItemCount: 2, setQuantity, removeItem, clearCart, acknowledgeLegacyReselection });
    render(<CartView checkoutIntent={null} />);
    expect(screen.getByRole("heading", { name: "Choose your variants again." })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear old cart and choose variants" }));
    expect(acknowledgeLegacyReselection).toHaveBeenCalledOnce();
  });
});
