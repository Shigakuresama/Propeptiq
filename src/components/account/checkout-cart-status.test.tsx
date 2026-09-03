import { act, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCartPreviewToken } from "@/cart/preview-token";
import type {
  CartPreview,
  CartPreviewItem,
  CartPreviewPurchaseState,
} from "@/cart/preview-types";

const { useCart, fetchMock } = vi.hoisted(() => ({
  useCart: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("@/cart/cart-provider", () => ({ useCart }));

import { CheckoutCartStatus } from "./checkout-cart-status";

const variantId = "61000000-0000-4000-8000-000000000001";
const secondVariantId = "62000000-0000-4000-8000-000000000002";
const thirdVariantId = "63000000-0000-4000-8000-000000000003";

function cart(items: readonly Readonly<{ variantId: string; quantity: number }>[] = [
  { variantId, quantity: 2 },
]) {
  return { hydrated: true, items };
}

function readyLine(overrides: Partial<CartPreviewItem> = {}): CartPreviewItem {
  return {
    variantId,
    quantity: 2,
    available: true,
    purchaseState: "ready",
    name: "Synthetic local test only — Alpha",
    variantLabel: "Synthetic 5 mg",
    sku: "SYNTHETIC-5MG",
    packageForm: "1 bottle",
    baseUnitMinor: 2_400,
    unitAmountMinor: 2_208,
    lineSubtotalMinor: 4_416,
    lineSavingsMinor: 384,
    effectiveDiscountBps: 800,
    appliedPromotions: [],
    currency: "USD",
    ...overrides,
  };
}

function stateLine(purchaseState: CartPreviewPurchaseState): CartPreviewItem {
  if (purchaseState === "ready") return readyLine();
  if (purchaseState === "local_preview") {
    return readyLine({
      available: false,
      purchaseState,
      baseUnitMinor: 0,
      unitAmountMinor: 0,
      lineSubtotalMinor: 0,
      lineSavingsMinor: 0,
    });
  }
  if (purchaseState === "checkout_unavailable" || purchaseState === "insufficient_quantity") {
    return readyLine({ available: false, purchaseState });
  }
  const unpriced = {
    available: false,
    purchaseState,
    baseUnitMinor: null,
    unitAmountMinor: null,
    lineSubtotalMinor: null,
    lineSavingsMinor: null,
    effectiveDiscountBps: null,
    appliedPromotions: [],
    currency: null,
  } as const;
  if (purchaseState === "unknown_variant") {
    return readyLine({
      ...unpriced,
      name: null,
      variantLabel: null,
      sku: null,
      packageForm: null,
    });
  }
  return readyLine(unpriced);
}

function reasonFor(state: CartPreviewPurchaseState): CartPreview["reasons"] {
  if (state === "ready") return [];
  if (state === "checkout_unavailable" || state === "local_preview") {
    return ["checkout_unavailable"];
  }
  if (state === "unavailable") return ["product_unavailable"];
  return [state];
}

function preview(
  items: readonly CartPreviewItem[] = [readyLine()],
  reasons: CartPreview["reasons"] = [],
): CartPreview {
  return {
    schemaVersion: 2,
    items,
    subtotalMinor: items.reduce((total, item) => total + (item.lineSubtotalMinor ?? 0), 0),
    currency: items.find((item) => item.currency !== null)?.currency ?? null,
    taxMinor: null,
    shippingMinor: null,
    finalDiscountMinor: null,
    previewToken: createCartPreviewToken(items),
    requiresAcknowledgement: reasons.length > 0,
    reasons,
  };
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("CheckoutCartStatus", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    fetchMock.mockReset();
    useCart.mockReturnValue(cart());
    fetchMock.mockResolvedValue(response(preview()));
    vi.stubGlobal("fetch", fetchMock);
  });

  it.each([
    ["ready", null],
    ["checkout_unavailable", "Display price available. Checkout is not yet available for this variant."],
    ["local_preview", "Local cart preview only. No payment will be created."],
    ["pricing_pending", "Pricing coming soon."],
    ["unavailable", "This variant is unavailable."],
    ["insufficient_quantity", "The requested quantity is not currently available."],
    ["unknown_variant", "This saved variant is no longer recognized. Choose it again from the catalog."],
  ] as const)("shows exact identity and concise %s status from a parsed v2 response", async (state, expected) => {
    const line = stateLine(state);
    fetchMock.mockResolvedValue(response(preview([line], reasonFor(state))));

    render(<CheckoutCartStatus />);

    const savedLines = screen.getByRole("list", { name: "Saved cart lines" });
    if (state === "unknown_variant") {
      expect(await within(savedLines).findByText(
        new RegExp(`Unverified saved variant:.*${variantId}`, "u"),
      )).toBeVisible();
    } else {
      expect(await within(savedLines).findByText("Synthetic local test only — Alpha", { exact: true })).toBeVisible();
      expect(within(savedLines).getByText("Synthetic 5 mg", { exact: true })).toBeVisible();
    }
    if (expected === null) {
      expect(within(savedLines).queryByText(/Checkout|preview only|Pricing coming soon|unavailable|not currently available|no longer recognized/iu)).toBeNull();
    } else {
      expect(within(savedLines).getByText(expected, { exact: true })).toBeVisible();
    }
  });

  it("shows one polite verification status while awaiting a coherent response and removes it after success", async () => {
    let resolveRequest: ((value: Response) => void) | undefined;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    }));

    render(<CheckoutCartStatus />);

    const status = screen.getByRole("status");
    expect(status).toBeVisible();
    expect(status).toHaveTextContent("Awaiting server verification.");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByText(new RegExp(`Unverified saved variant:.*${variantId}`, "u"))).toBeVisible();

    await act(async () => {
      resolveRequest?.(response(preview()));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByText("Awaiting server verification.", { exact: true })).toBeNull());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("sends only the exact saved IDs and quantities", async () => {
    render(<CheckoutCartStatus />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toEqual({ items: [{ variantId, quantity: 2 }], previousPreviewToken: null });
    expect(JSON.stringify(body)).not.toMatch(/name|sku|price|amount|promotion|available/iu);
  });

  it.each([
    ["extra authority field", (valid: CartPreview) => ({ ...valid, providerId: "private" }), 200],
    ["incoherent arithmetic", (valid: CartPreview) => ({ ...valid, subtotalMinor: 1 }), 200],
    ["legacy schema", (valid: CartPreview) => ({ ...valid, schemaVersion: 1 }), 200],
    ["non-200 response", (valid: CartPreview) => valid, 503],
  ] as const)("fails closed for a %s", async (_label, mutate, status) => {
    const valid = preview();
    fetchMock.mockResolvedValue(response(mutate(valid), status));

    render(<CheckoutCartStatus />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Server preview unavailable");
    expect(screen.queryByText("Synthetic local test only — Alpha", { exact: true })).toBeNull();
    expect(screen.getByText(new RegExp(`Unverified saved variant:.*${variantId}`, "u"))).toBeVisible();
  });

  it.each([
    ["missing row", [readyLine()]],
    ["extra row", [readyLine(), readyLine({ variantId: secondVariantId, quantity: 1, baseUnitMinor: 2_400, unitAmountMinor: 2_400, lineSubtotalMinor: 2_400, lineSavingsMinor: 0, effectiveDiscountBps: 0 }), readyLine({ variantId: thirdVariantId, quantity: 1, baseUnitMinor: 2_400, unitAmountMinor: 2_400, lineSubtotalMinor: 2_400, lineSavingsMinor: 0, effectiveDiscountBps: 0 })]],
    ["reordered rows", [readyLine({ variantId: secondVariantId, quantity: 1, baseUnitMinor: 2_400, unitAmountMinor: 2_400, lineSubtotalMinor: 2_400, lineSavingsMinor: 0, effectiveDiscountBps: 0 }), readyLine()]],
    ["different ID", [readyLine(), readyLine({ variantId: thirdVariantId, quantity: 1, baseUnitMinor: 2_400, unitAmountMinor: 2_400, lineSubtotalMinor: 2_400, lineSavingsMinor: 0, effectiveDiscountBps: 0 })]],
    ["different quantity", [readyLine(), readyLine({ variantId: secondVariantId, quantity: 2 })]],
  ] as const)("rejects a parser-valid response with a %s", async (_label, responseItems) => {
    useCart.mockReturnValue(cart([
      { variantId, quantity: 2 },
      { variantId: secondVariantId, quantity: 1 },
    ]));
    fetchMock.mockResolvedValue(response(preview(responseItems)));

    render(<CheckoutCartStatus />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Server preview unavailable");
    expect(screen.queryByText("Synthetic local test only — Alpha", { exact: true })).toBeNull();
    expect(screen.getByText(new RegExp(`Unverified saved variant:.*${variantId}`, "u"))).toBeVisible();
    expect(screen.getByText(new RegExp(`Unverified saved variant:.*${secondVariantId}`, "u"))).toBeVisible();
  });

  it("does not let an aborted older response replace a newer coherent cart", async () => {
    let resolveFirst: ((value: Response) => void) | undefined;
    let firstSignal: AbortSignal | undefined;
    fetchMock
      .mockImplementationOnce((_url: string, init: RequestInit) => {
        firstSignal = init.signal as AbortSignal;
        return new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        });
      })
      .mockResolvedValueOnce(response(preview([
        readyLine({
          variantId: secondVariantId,
          quantity: 1,
          name: "Synthetic local test only — Beta",
          variantLabel: "Synthetic 10 mg",
          sku: "SYNTHETIC-10MG",
          baseUnitMinor: 2_400,
          unitAmountMinor: 2_400,
          lineSubtotalMinor: 2_400,
          lineSavingsMinor: 0,
          effectiveDiscountBps: 0,
        }),
      ])));
    const { rerender } = render(<CheckoutCartStatus />);

    useCart.mockReturnValue(cart([{ variantId: secondVariantId, quantity: 1 }]));
    rerender(<CheckoutCartStatus />);

    expect(await screen.findByText("Synthetic local test only — Beta", { exact: true })).toBeVisible();
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => {
      resolveFirst?.(response(preview()));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("Synthetic local test only — Beta", { exact: true })).toBeVisible();
    expect(screen.queryByText("Synthetic local test only — Alpha", { exact: true })).toBeNull();
  });

  it("keeps the exact unverified prefix after a request failure", async () => {
    fetchMock.mockRejectedValue(new Error("preview unavailable"));

    render(<CheckoutCartStatus />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Browser request identifiers below are not verified variant facts.",
    );
    const fallback = screen.getByText(new RegExp(`Unverified saved variant:.*${variantId}`, "u"));
    expect(fallback).toBeVisible();
    expect(fallback).toHaveAccessibleName(`Unverified saved variant: ${variantId}`);
    expect(screen.queryByText("Awaiting server verification.", { exact: true })).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
