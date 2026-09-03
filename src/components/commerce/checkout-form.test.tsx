import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCartPreviewToken } from "@/cart/preview-token";
import {
  PREVIEW_PRESENTATION_STORAGE_KEY,
  savePreviewPresentation,
} from "@/cart/preview-presentation";
import type {
  CartPreview,
  CartPreviewItem,
  CartPreviewPurchaseState,
} from "@/cart/preview-types";

const { useCart, fetchMock } = vi.hoisted(() => ({ useCart: vi.fn(), fetchMock: vi.fn() }));
vi.mock("@/cart/cart-provider", () => ({ useCart }));
import { CheckoutForm } from "./checkout-form";

const variantId = "61000000-0000-4000-8000-000000000001";
type PreviewOptions = {
  available?: boolean;
  name?: string;
  quantity?: number;
  reasons?: CartPreview["reasons"];
  requiresAcknowledgement?: boolean;
};

function preview({
  available = true,
  name = "Synthetic local test only — Alpha",
  quantity = 2,
  reasons = [],
  requiresAcknowledgement = false,
}: PreviewOptions = {}): CartPreview {
  const unitAmountMinor = quantity === 2 ? 2_208 : 2_160;
  const items: CartPreviewItem[] = [{ variantId, quantity, available, purchaseState: available ? "ready" : "unavailable", name, variantLabel: "Synthetic 5 mg", sku: "SYNTHETIC-5MG", packageForm: "Research vial", baseUnitMinor: 2400, unitAmountMinor, lineSubtotalMinor: quantity * unitAmountMinor, lineSavingsMinor: quantity * (2400 - unitAmountMinor), effectiveDiscountBps: quantity === 2 ? 800 : 1000, appliedPromotions: [], currency: "USD" }];
  return {
    schemaVersion: 2,
    items,
    subtotalMinor: quantity * unitAmountMinor, currency: "USD", taxMinor: null, shippingMinor: null, finalDiscountMinor: null,
    previewToken: createCartPreviewToken(items), requiresAcknowledgement, reasons,
  };
}

function displayPreview(purchaseState: Exclude<CartPreviewPurchaseState, "ready">): CartPreview {
  const priced = ["checkout_unavailable", "local_preview", "insufficient_quantity"].includes(purchaseState);
  const local = purchaseState === "local_preview";
  const unknown = purchaseState === "unknown_variant";
  const items: CartPreviewItem[] = [{
    variantId,
    quantity: 2,
    available: false,
    purchaseState,
    name: unknown ? null : "Synthetic local test only — Alpha",
    variantLabel: unknown ? null : "Synthetic 5 mg",
    sku: unknown ? null : "SYNTHETIC-5MG",
    packageForm: unknown ? null : "1 bottle",
    baseUnitMinor: priced ? (local ? 0 : 2_400) : null,
    unitAmountMinor: priced ? (local ? 0 : 2_208) : null,
    lineSubtotalMinor: priced ? (local ? 0 : 4_416) : null,
    lineSavingsMinor: priced ? (local ? 0 : 384) : null,
    effectiveDiscountBps: priced ? 800 : null,
    appliedPromotions: [],
    currency: priced ? "USD" : null,
  }];
  const reasons: CartPreview["reasons"] = purchaseState === "checkout_unavailable" || purchaseState === "local_preview"
    ? ["checkout_unavailable"]
    : purchaseState === "unavailable"
      ? ["product_unavailable"]
      : [purchaseState];
  return {
    schemaVersion: 2,
    items,
    subtotalMinor: items[0]!.lineSubtotalMinor ?? 0,
    currency: items[0]!.currency,
    taxMinor: null,
    shippingMinor: null,
    finalDiscountMinor: null,
    previewToken: createCartPreviewToken(items),
    requiresAcknowledgement: true,
    reasons,
  };
}
function response(value: unknown): Response { return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }); }
const pricingRevision = "d".repeat(64);
function authoritativeQuote(revision = pricingRevision) {
  return {
    status: "quoted",
    pricingRevision: revision,
    quote: {
      status: "ready", reviewRequired: false, reasons: [], currency: "USD",
      subtotalMinor: 4800, discountMinor: 1440, shippingMinor: 500, taxMinor: 300,
      totalMinor: 4160, promotionDiscountMinor: 1440, referralDiscountMinor: 0,
      rewardRedemptionPoints: 0, rewardRedemptionMinor: 0, pendingBaseEarnPoints: 67,
      rewardsBenefitAvailable: false, rewardsUnavailableReason: "not_requested",
      lines: [{
        variantId, sku: "SYNTHETIC-ALPHA-5MG", variantLabel: "5 mg test fixture",
        productName: "Synthetic local test only — Alpha", packageForm: "Research vial",
        quantity: 2, unitAmountMinor: 2400, subtotalMinor: 4800,
        discountMinor: 1440, totalMinor: 3360,
      }],
    },
  };
}

function safePriceChangedCart() {
  return {
    items: [{
      variantId,
      quantity: 2,
      available: true,
      name: "Synthetic local test only — Alpha",
      packageForm: "Research vial",
      variantLabel: "5 mg test fixture",
      sku: "SYNTHETIC-ALPHA-5MG",
      unitAmountMinor: 2400,
      lineSubtotalMinor: 4800,
      currency: "USD",
    }],
    subtotalMinor: 4800,
    currency: "USD",
    taxMinor: null,
    shippingMinor: null,
    finalDiscountMinor: null,
  };
}

async function fillDestination(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Recipient name"), "Synthetic Research Buyer");
  await user.type(screen.getByLabelText("Address line 1"), "100 Test Way");
  await user.type(screen.getByLabelText("City"), "Los Angeles");
  await user.selectOptions(screen.getByLabelText("State or district"), "CA");
  await user.type(screen.getByLabelText("Postal code"), "90001");
}

describe("CheckoutForm", () => {
  beforeEach(() => {
    useCart.mockReturnValue({ hydrated: true, items: [{ variantId, quantity: 2 }] });
    fetchMock.mockResolvedValue(response(preview())); vi.stubGlobal("fetch", fetchMock); window.sessionStorage.clear();
  });

  it("sends only variant authority and destination when requesting a quote", async () => {
    const user = userEvent.setup();
    fetchMock.mockReset()
      .mockResolvedValueOnce(response(preview()))
      .mockResolvedValueOnce(response(authoritativeQuote()));
    render(<CheckoutForm promotions={[]} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/catalog/preview", expect.objectContaining({ method: "POST" })));
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({ items: [{ variantId, quantity: 2 }] });
    await fillDestination(user);
    await user.click(screen.getByRole("button", { name: "Calculate authoritative total" }));
    await screen.findByRole("heading", { name: "Authoritative total" });
    const quoteCall = fetchMock.mock.calls.find(([url]) => url === "/api/checkout/quote")!;
    const body = JSON.parse(String((quoteCall[1] as RequestInit).body));
    expect(body).toEqual({
      items: [{ variantId, quantity: 2 }],
      destination: {
        recipientName: "Synthetic Research Buyer", line1: "100 Test Way", line2: null,
        city: "Los Angeles", stateCode: "CA", postalCode: "90001", countryCode: "US",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/productId|price|total|currency|promotion/iu);
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
  });

  it("ignores an aborted obsolete preview that resolves after the newer retained facts", async () => {
    const user = userEvent.setup();
    const obsolete = preview();
    const current = preview({
      quantity: 3,
      requiresAcknowledgement: true,
      reasons: ["server_facts_changed"],
    });
    const following = preview({
      quantity: 4,
      requiresAcknowledgement: true,
      reasons: ["server_facts_changed"],
    });
    savePreviewPresentation(window.sessionStorage, obsolete);
    let resolveObsolete: ((value: Response) => void) | undefined;
    let obsoleteSignal: AbortSignal | undefined;
    fetchMock.mockReset()
      .mockImplementationOnce((_url: string, init: RequestInit) => {
        obsoleteSignal = init.signal as AbortSignal;
        return new Promise<Response>((resolve) => {
          resolveObsolete = resolve;
        });
      })
      .mockResolvedValueOnce(response(current))
      .mockResolvedValueOnce(response(following));

    const { rerender } = render(<CheckoutForm promotions={[]} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    useCart.mockReturnValue({ hydrated: true, items: [{ variantId, quantity: 3 }] });
    rerender(<CheckoutForm promotions={[]} />);

    expect(await screen.findByRole("heading", {
      name: "Server preview changed or became unavailable.",
    })).toBeVisible();
    expect(obsoleteSignal?.aborted).toBe(true);
    await user.click(screen.getByRole("button", { name: "Acknowledge current server facts" }));
    expect(screen.getByText("Current server facts acknowledged.", { exact: true })).toBeVisible();
    expect(screen.getByRole("button", { name: "Calculate authoritative total" })).toBeEnabled();
    expect(JSON.parse(
      window.sessionStorage.getItem(PREVIEW_PRESENTATION_STORAGE_KEY)!,
    ).preview.previewToken).toBe(current.previewToken);

    await act(async () => {
      resolveObsolete?.(response(obsolete));
      await Promise.resolve();
      await Promise.resolve();
    });
    const acknowledgementSurvived = screen.queryByText(
      "Current server facts acknowledged.",
      { exact: true },
    ) !== null;
    const continuationStayedEnabled = screen.getByRole("button", {
      name: "Calculate authoritative total",
    }).hasAttribute("disabled") === false;
    const storedAfterLateResponse = JSON.parse(
      window.sessionStorage.getItem(PREVIEW_PRESENTATION_STORAGE_KEY)!,
    ).preview.previewToken;

    useCart.mockReturnValue({ hydrated: true, items: [{ variantId, quantity: 4 }] });
    rerender(<CheckoutForm promotions={[]} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const followingRequest = JSON.parse(String(
      (fetchMock.mock.calls[2]?.[1] as RequestInit).body,
    ));

    expect(acknowledgementSurvived).toBe(true);
    expect(continuationStayedEnabled).toBe(true);
    expect(storedAfterLateResponse).toBe(current.previewToken);
    expect(followingRequest).toEqual({
      items: [{ variantId, quantity: 4 }],
      previousPreviewToken: current.previewToken,
    });
  });

  it.each([
    "checkout_unavailable",
    "local_preview",
    "pricing_pending",
    "unavailable",
    "insufficient_quantity",
    "unknown_variant",
  ] as const)("refuses quote and session requests for a coherent %s display preview even with its retained token", async (state) => {
    const user = userEvent.setup();
    const displayOnly = displayPreview(state);
    savePreviewPresentation(window.sessionStorage, displayOnly);
    fetchMock.mockReset().mockResolvedValue(response(displayOnly));

    render(<CheckoutForm promotions={[]} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const previewRequest = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(previewRequest).toEqual({
      items: [{ variantId, quantity: 2 }],
      previousPreviewToken: displayOnly.previewToken,
    });
    await fillDestination(user);
    const quoteButton = screen.getByRole("button", { name: "Calculate authoritative total" });
    expect(quoteButton).toBeDisabled();
    await user.click(quoteButton);
    expect(fetchMock.mock.calls.filter(([url]) =>
      url === "/api/checkout/quote" || url === "/api/checkout/sessions")).toEqual([]);
  });

  it.each([
    ["malformed", (valid: ReturnType<typeof preview>) => ({ ...valid, providerId: "private" })],
    ["different quantity", () => preview({ quantity: 3 })],
  ] as const)("treats a parser-valid or malformed 200 %s preview mismatch as a safe refusal", async (_label, mutate) => {
    const user = userEvent.setup();
    fetchMock.mockReset().mockResolvedValue(response(mutate(preview())));

    render(<CheckoutForm promotions={[]} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The current server preview is unavailable. No quote can be requested.",
    );
    await fillDestination(user);
    expect(screen.getByRole("button", { name: "Calculate authoritative total" })).toBeDisabled();
    expect(fetchMock.mock.calls.filter(([url]) =>
      url === "/api/checkout/quote" || url === "/api/checkout/sessions")).toEqual([]);
  });

  it("shows changed variant preview copy without replacing the v2 cart identity", async () => {
    fetchMock.mockReset()
      .mockResolvedValueOnce(response(preview()))
      .mockResolvedValueOnce(response(preview({ quantity: 3, requiresAcknowledgement: true, reasons: ["server_facts_changed"] })));
    const { rerender } = render(<CheckoutForm promotions={[]} />);
    await screen.findByText("This is the current authoritative baseline; no earlier same-tab server preview was available.");
    useCart.mockReturnValue({ hydrated: true, items: [{ variantId, quantity: 3 }] });
    rerender(<CheckoutForm promotions={[]} />);
    expect(await screen.findByRole("heading", { name: "Server preview changed or became unavailable." })).toBeVisible();
    expect(screen.getByText("Your requested variant identifiers and quantities were not replaced. Review the current server facts before checkout.")).toBeVisible();
  });

  it("requires a fresh reviewed quote after the session boundary reports PRICE_CHANGED", async () => {
    const user = userEvent.setup();
    fetchMock.mockReset()
      .mockResolvedValueOnce(response(preview()))
      .mockResolvedValueOnce(response(authoritativeQuote()))
      .mockResolvedValueOnce(response({
        status: "PRICE_CHANGED", pricingRevision: "e".repeat(64),
        cart: safePriceChangedCart(),
      }))
      .mockResolvedValueOnce(response(authoritativeQuote("e".repeat(64))));
    render(<CheckoutForm promotions={[]} />);
    await screen.findByRole("status");
    await fillDestination(user);
    await user.click(screen.getByRole("button", { name: "Calculate authoritative total" }));
    await user.click(await screen.findByRole("button", { name: "Continue to hosted payment" }));
    expect(await screen.findByText(/authoritative price changed/iu)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Continue to hosted payment" })).toBeNull();
    const sessionCall = fetchMock.mock.calls.find(([url]) => url === "/api/checkout/sessions")!;
    expect(JSON.parse(String((sessionCall[1] as RequestInit).body))).toEqual({
      items: [{ variantId, quantity: 2 }],
      destination: {
        recipientName: "Synthetic Research Buyer", line1: "100 Test Way", line2: null,
        city: "Los Angeles", stateCode: "CA", postalCode: "90001", countryCode: "US",
      },
      pricingRevision,
    });
    await user.click(screen.getByRole("button", { name: "Try authoritative quote again" }));
    expect(await screen.findByRole("button", { name: "Continue to hosted payment" })).toBeVisible();
    const quoteCalls = fetchMock.mock.calls.filter(([url]) => url === "/api/checkout/quote");
    const firstHeaders = (quoteCalls[0]![1] as RequestInit).headers as Record<string, string>;
    const refreshedHeaders = (quoteCalls[1]![1] as RequestInit).headers as Record<string, string>;
    expect(refreshedHeaders["Content-Type"]).toBe(firstHeaders["Content-Type"]);
    expect(refreshedHeaders["Idempotency-Key"]).not.toBe(firstHeaders["Idempotency-Key"]);
  });

  it.each([
    ["network error", "reject"],
    ["provider-unknown result", "provider_unknown"],
    ["generic unavailable result", "unavailable"],
  ])("retains the idempotency key across a %s session retry", async (_label, outcome) => {
    const user = userEvent.setup();
    fetchMock.mockReset()
      .mockResolvedValueOnce(response(preview()))
      .mockResolvedValueOnce(response(authoritativeQuote()));
    if (outcome === "reject") {
      fetchMock.mockRejectedValueOnce(new Error("synthetic network failure"));
    } else {
      fetchMock.mockResolvedValueOnce(response({ status: outcome }));
    }
    fetchMock.mockResolvedValueOnce(response({ status: "provider_unknown" }));

    render(<CheckoutForm promotions={[]} />);
    await screen.findByRole("status");
    await fillDestination(user);
    await user.click(screen.getByRole("button", { name: "Calculate authoritative total" }));
    await user.click(await screen.findByRole("button", { name: "Continue to hosted payment" }));
    await user.click(await screen.findByRole("button", { name: "Try hosted payment again" }));

    await waitFor(() => {
      const sessionCalls = fetchMock.mock.calls.filter(([url]) =>
        url === "/api/checkout/sessions");
      expect(sessionCalls).toHaveLength(2);
    });
    const sessionCalls = fetchMock.mock.calls.filter(([url]) =>
      url === "/api/checkout/sessions");
    const firstHeaders = (sessionCalls[0]![1] as RequestInit)
      .headers as Record<string, string>;
    const retriedHeaders = (sessionCalls[1]![1] as RequestInit)
      .headers as Record<string, string>;
    expect(retriedHeaders["Idempotency-Key"])
      .toBe(firstHeaders["Idempotency-Key"]);
  });

  it("rejects display-preview extensions at the exact PRICE_CHANGED safe-cart boundary", async () => {
    const user = userEvent.setup();
    fetchMock.mockReset()
      .mockResolvedValueOnce(response(preview()))
      .mockResolvedValueOnce(response(authoritativeQuote()))
      .mockResolvedValueOnce(response({
        status: "PRICE_CHANGED",
        pricingRevision: "e".repeat(64),
        cart: {
          ...safePriceChangedCart(),
          schemaVersion: 2,
          previewToken: "f".repeat(64),
          items: safePriceChangedCart().items.map((item) => ({
            ...item,
            purchaseState: "checkout_unavailable",
            baseUnitMinor: 2_400,
            lineSavingsMinor: 0,
            effectiveDiscountBps: 0,
            appliedPromotions: [],
          })),
        },
      }))
      .mockResolvedValueOnce(response({ status: "provider_unknown" }));

    render(<CheckoutForm promotions={[]} />);
    await screen.findByRole("status");
    await fillDestination(user);
    await user.click(screen.getByRole("button", { name: "Calculate authoritative total" }));
    await user.click(await screen.findByRole("button", { name: "Continue to hosted payment" }));
    await user.click(await screen.findByRole("button", { name: "Try hosted payment again" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url]) =>
        url === "/api/checkout/sessions")).toHaveLength(2);
    });
    const sessionCalls = fetchMock.mock.calls.filter(([url]) =>
      url === "/api/checkout/sessions");
    const firstHeaders = (sessionCalls[0]![1] as RequestInit)
      .headers as Record<string, string>;
    const retriedHeaders = (sessionCalls[1]![1] as RequestInit)
      .headers as Record<string, string>;
    expect(retriedHeaders["Idempotency-Key"])
      .toBe(firstHeaders["Idempotency-Key"]);
  });

  it("retains accessible required destination controls", async () => {
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
    expect(screen.getByRole("button", { name: "Calculate authoritative total" })).toBeEnabled();
  });
});
