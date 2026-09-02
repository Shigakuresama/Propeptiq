import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useCart, fetchMock } = vi.hoisted(() => ({ useCart: vi.fn(), fetchMock: vi.fn() }));
vi.mock("@/cart/cart-provider", () => ({ useCart }));

import { CheckoutCartStatus } from "./checkout-cart-status";

const variantId = "61000000-0000-4000-8000-000000000001";

describe("CheckoutCartStatus", () => {
  beforeEach(() => {
    useCart.mockReturnValue({ hydrated: true, items: [{ variantId, quantity: 2 }] });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows a matching unavailable variant as unavailable", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      items: [{ variantId, quantity: 2, available: false, name: "Synthetic local test only — unavailable", packageForm: null, unitAmountMinor: null, lineSubtotalMinor: null, currency: null }],
    }), { status: 200 }));
    render(<CheckoutCartStatus />);
    expect(await screen.findByText("Unavailable in the current authoritative catalog preview")).toBeVisible();
  });

  it("refers to variant identifiers when the preview request fails", async () => {
    fetchMock.mockRejectedValue(new Error("preview unavailable"));
    render(<CheckoutCartStatus />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
    expect(screen.getByRole("alert")).toHaveTextContent("Browser request identifiers below are not verified variant facts.");
  });
});
