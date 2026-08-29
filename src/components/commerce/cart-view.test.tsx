import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useCart, fetchMock, setQuantity, removeItem, clearCart } = vi.hoisted(() => ({
  useCart: vi.fn(),
  fetchMock: vi.fn(),
  setQuantity: vi.fn(),
  removeItem: vi.fn(),
  clearCart: vi.fn(),
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
      setQuantity,
      removeItem,
      clearCart,
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
    expect(within(summary).getByText("Merchandise subtotal").closest("dl")).toHaveClass("text-base");
    expect(screen.getByText("Research vial")).toHaveClass("text-base");
    expect(screen.getByText("$24.00 each")).toHaveClass("text-base");
    expect(screen.getByText(/Account verification continues at checkout/iu)).toHaveClass("text-base");
  });

  it("retries the same failed preview request without mutating or clearing the retained cart", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockRejectedValueOnce(new Error("temporary preview failure"))
      .mockResolvedValueOnce(response({
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
        previewToken: "d".repeat(64),
        requiresAcknowledgement: false,
        reasons: [],
      }));

    render(<CartView checkoutIntent={null} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The authoritative cart preview is unavailable.");
    expect(alert).toHaveClass("text-base");
    const retry = screen.getByRole("button", { name: "Retry current cart facts" });
    expect(retry).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Continue to sign in" })).toBeDisabled();
    expect(screen.getByLabelText(`Quantity for ${productId}`)).toHaveValue(2);

    const firstBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    await user.click(retry);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("$48.00")).toBeVisible();
    const secondBody = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(secondBody).toEqual(firstBody);
    expect(firstBody.items).toEqual([{ productId, quantity: 2 }]);
    expect(setQuantity).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(clearCart).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue to sign in" })).toBeEnabled();
  });

  it("hides a prior preview when changed cart facts fail and retries the exact current cart", async () => {
    const user = userEvent.setup();
    fetchMock.mockReset()
      .mockResolvedValueOnce(response({
        items: [{
          productId,
          quantity: 2,
          available: true,
          name: "Synthetic local test only — Prior preview",
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
        previewToken: "e".repeat(64),
        requiresAcknowledgement: false,
        reasons: [],
      }))
      .mockRejectedValueOnce(new Error("changed-cart preview failure"))
      .mockResolvedValueOnce(response({
        items: [{
          productId,
          quantity: 3,
          available: true,
          name: "Synthetic local test only — Current preview",
          packageForm: "Research vial",
          unitAmountMinor: 2_400,
          lineSubtotalMinor: 7_200,
          currency: "USD",
        }],
        subtotalMinor: 7_200,
        currency: "USD",
        taxMinor: null,
        shippingMinor: null,
        finalDiscountMinor: null,
        previewToken: "f".repeat(64),
        requiresAcknowledgement: false,
        reasons: [],
      }));

    const { rerender } = render(<CartView checkoutIntent={null} />);
    expect(await screen.findByText("Synthetic local test only — Prior preview")).toBeVisible();
    expect(screen.getByText("$48.00")).toBeVisible();

    useCart.mockReturnValue({
      hydrated: true,
      items: [{ productId, quantity: 3 }],
      setQuantity,
      removeItem,
      clearCart,
    });
    rerender(<CartView checkoutIntent={null} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The authoritative cart preview is unavailable.",
    );
    expect(screen.queryByText("Synthetic local test only — Prior preview")).toBeNull();
    expect(screen.queryByText("$24.00 each")).toBeNull();
    expect(screen.queryByText("$48.00")).toBeNull();
    expect(screen.getByRole("spinbutton")).toHaveValue(3);
    expect(screen.getByRole("button", { name: "Continue to sign in" })).toBeDisabled();

    const failedRequest = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(failedRequest.items).toEqual([{ productId, quantity: 3 }]);
    await user.click(screen.getByRole("button", { name: "Retry current cart facts" }));

    expect(await screen.findByText("Synthetic local test only — Current preview")).toBeVisible();
    expect(screen.getByText("$72.00")).toBeVisible();
    expect(screen.getByRole("spinbutton")).toHaveValue(3);
    const retryRequest = JSON.parse(String((fetchMock.mock.calls[2]?.[1] as RequestInit).body));
    expect(retryRequest).toEqual(failedRequest);
    expect(setQuantity).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(clearCart).not.toHaveBeenCalled();
  });
});
