import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useCart, fetchMock } = vi.hoisted(() => ({ useCart: vi.fn(), fetchMock: vi.fn() }));
vi.mock("@/cart/cart-provider", () => ({ useCart }));
import { CheckoutForm } from "./checkout-form";

const variantId = "61000000-0000-4000-8000-000000000001";
type PreviewOptions = {
  available?: boolean;
  name?: string;
  previewToken?: string;
  quantity?: number;
  reasons?: string[];
  requiresAcknowledgement?: boolean;
};

function preview({
  available = true,
  name = "Synthetic local test only — Alpha",
  previewToken = "a".repeat(64),
  quantity = 2,
  reasons = [],
  requiresAcknowledgement = false,
}: PreviewOptions = {}) {
  return {
    items: [{ variantId, quantity, available, name, packageForm: "Research vial", unitAmountMinor: 2400, lineSubtotalMinor: quantity * 2400, currency: "USD" }],
    subtotalMinor: quantity * 2400, currency: "USD", taxMinor: null, shippingMinor: null, finalDiscountMinor: null,
    previewToken, requiresAcknowledgement, reasons,
  };
}
function response(value: unknown): Response { return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }); }

describe("CheckoutForm", () => {
  beforeEach(() => {
    useCart.mockReturnValue({ hydrated: true, items: [{ variantId, quantity: 2 }] });
    fetchMock.mockResolvedValue(response(preview())); vi.stubGlobal("fetch", fetchMock); window.sessionStorage.clear();
  });

  it("fails closed before sending a product-keyed checkout request for a v2 cart", async () => {
    render(<CheckoutForm promotions={[]} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/catalog/preview", expect.objectContaining({ method: "POST" })));
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({ items: [{ variantId, quantity: 2 }] });
    expect(screen.getByRole("button", { name: "Variant checkout unavailable" })).toBeDisabled();
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain("/api/checkout/quote");
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain("/api/checkout/sessions");
  });

  it("retries the same variant preview request without opening checkout", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValueOnce(new Error("preview unavailable")).mockResolvedValueOnce(response(preview()));
    render(<CheckoutForm promotions={[]} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("The current server preview is unavailable.");
    const first = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    const callsBeforeRetry = fetchMock.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Try server preview again" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeRetry));
    expect(JSON.parse(String((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).body))).toEqual(first);
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain("/api/checkout/quote");
  });

  it("shows changed variant preview copy without replacing the v2 cart identity", async () => {
    fetchMock.mockReset()
      .mockResolvedValueOnce(response(preview({ previewToken: "b".repeat(64) })))
      .mockResolvedValueOnce(response(preview({ quantity: 3, previewToken: "c".repeat(64), requiresAcknowledgement: true, reasons: ["server_facts_changed"] })));
    const { rerender } = render(<CheckoutForm promotions={[]} />);
    await screen.findByText("This is the current authoritative baseline; no earlier same-tab server preview was available.");
    useCart.mockReturnValue({ hydrated: true, items: [{ variantId, quantity: 3 }] });
    rerender(<CheckoutForm promotions={[]} />);
    expect(await screen.findByRole("heading", { name: "Server preview changed or became unavailable." })).toBeVisible();
    expect(screen.getByText("Your requested variant identifiers and quantities were not replaced. Review the current server facts before checkout.")).toBeVisible();
  });

  it("acknowledges changed variant facts without reopening the Task 5 checkout gate", async () => {
    const user = userEvent.setup();
    fetchMock.mockReset()
      .mockResolvedValueOnce(response(preview({ previewToken: "b".repeat(64) })))
      .mockResolvedValueOnce(response(preview({ quantity: 3, previewToken: "c".repeat(64), requiresAcknowledgement: true, reasons: ["server_facts_changed"] })));
    const { rerender } = render(<CheckoutForm promotions={[]} />);
    await screen.findByText("This is the current authoritative baseline; no earlier same-tab server preview was available.");
    useCart.mockReturnValue({ hydrated: true, items: [{ variantId, quantity: 3 }] });
    rerender(<CheckoutForm promotions={[]} />);
    await user.click(await screen.findByRole("button", { name: "Acknowledge current server facts" }));
    expect(await screen.findByText("Current server facts acknowledged.")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("button", { name: "Acknowledge current server facts" })).toBeNull();
    expect(screen.getByRole("button", { name: "Variant checkout unavailable" })).toBeDisabled();
  });

  it("retains accessible destination labels while the variant checkout gate is disabled", async () => {
    render(<CheckoutForm promotions={[]} />);
    await screen.findByRole("status");
    for (const label of ["Recipient name", "Address line 1", "Address line 2 (optional)", "City", "State or district", "Postal code"]) {
      expect(screen.getByLabelText(label)).toBeVisible();
    }
    for (const label of ["Recipient name", "Address line 1", "City", "State or district", "Postal code"]) {
      const field = screen.getByLabelText(label);
      expect(field).toBeRequired();
      expect(field).toHaveAttribute("aria-required", "true");
    }
    expect(screen.getByRole("button", { name: "Variant checkout unavailable" })).toBeDisabled();
  });
});
