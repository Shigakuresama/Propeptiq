import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useCart, fetchMock } = vi.hoisted(() => ({
  useCart: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@/cart/cart-provider", () => ({ useCart }));

import { CartView } from "./cart-view";

const productId = "61000000-0000-4000-8000-000000000001";

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("CartView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    useCart.mockReturnValue({
      hydrated: true,
      items: [{ productId, quantity: 2 }],
      setQuantity: vi.fn(),
      removeItem: vi.fn(),
      clearCart: vi.fn(),
    });
    fetchMock.mockResolvedValue(response({
      items: [{
        productId,
        quantity: 2,
        available: true,
        name: "Synthetic local test only — Alpha",
        packageForm: "Research vial",
        unitAmountMinor: 2_400,
        lineSubtotalMinor: 4_800,
        currency: "USD",
      }],
      subtotalMinor: 4_800,
      currency: "USD",
      taxMinor: null,
      shippingMinor: null,
      finalDiscountMinor: null,
      previewToken: "c".repeat(64),
      requiresAcknowledgement: false,
      reasons: [],
    }));
    vi.stubGlobal("fetch", fetchMock);
    window.sessionStorage.clear();
  });

  it("separates every checkout total fact without inventing preview amounts", async () => {
    render(<CartView checkoutIntent={null} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const summary = screen.getByRole("complementary", { name: "Order summary" });
    expect(within(summary).getByText("Merchandise subtotal")).toBeVisible();
    expect(within(summary).getByText("$48.00")).toBeVisible();
    for (const label of [
      "Promotion",
      "Referral benefit",
      "Points redemption",
      "Tax",
      "Shipping",
      "Total",
    ]) {
      expect(within(summary).getByText(label)).toBeVisible();
    }
    expect(within(summary).getByText("Calculated at checkout")).toBeVisible();
    expect(within(summary).getAllByText("Not yet calculated")).toHaveLength(2);
    expect(within(summary).getAllByText("Available after checkout quote")).toHaveLength(3);
    expect(within(summary).queryByText(/\$0\.00/)).toBeNull();
  });
});
