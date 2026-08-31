import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useCart, fetchMock } = vi.hoisted(() => ({ useCart: vi.fn(), fetchMock: vi.fn() }));
vi.mock("@/cart/cart-provider", () => ({ useCart }));
import { CheckoutForm } from "./checkout-form";

const variantId = "61000000-0000-4000-8000-000000000001";
const preview = {
  items: [{ variantId, quantity: 2, available: false, name: null, packageForm: null, unitAmountMinor: null, lineSubtotalMinor: null, currency: null }],
  subtotalMinor: 0, currency: null, taxMinor: null, shippingMinor: null, finalDiscountMinor: null,
  previewToken: "a".repeat(64), requiresAcknowledgement: true, reasons: ["product_unavailable"],
};

describe("CheckoutForm", () => {
  beforeEach(() => {
    useCart.mockReturnValue({ hydrated: true, items: [{ variantId, quantity: 2 }] });
    fetchMock.mockResolvedValue(new Response(JSON.stringify(preview), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("fails closed before sending a product-keyed checkout request for a v2 cart", async () => {
    render(<CheckoutForm promotions={[]} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/catalog/preview",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({
      items: [{ variantId, quantity: 2 }],
    });
    expect(screen.getByRole("button", { name: "Variant checkout unavailable" })).toBeDisabled();
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain("/api/checkout/quote");
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain("/api/checkout/sessions");
  });
});
