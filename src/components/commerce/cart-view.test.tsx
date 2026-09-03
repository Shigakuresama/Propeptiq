import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCartPreviewToken } from "@/cart/preview-token";
import { PREVIEW_PRESENTATION_STORAGE_KEY } from "@/cart/preview-presentation";
import type {
  CartPreview,
  CartPreviewItem,
  CartPreviewPurchaseState,
} from "@/cart/preview-types";

const {
  useCart,
  fetchMock,
  setQuantity,
  removeItem,
  clearCart,
  acknowledgeLegacyReselection,
} = vi.hoisted(() => ({
  useCart: vi.fn(),
  fetchMock: vi.fn(),
  setQuantity: vi.fn(),
  removeItem: vi.fn(),
  clearCart: vi.fn(),
  acknowledgeLegacyReselection: vi.fn(),
}));

vi.mock("@/cart/cart-provider", () => ({ useCart }));

import { CartView } from "./cart-view";

const variantId = "61000000-0000-4000-8000-000000000001";
const secondVariantId = "62000000-0000-4000-8000-000000000002";
const thirdVariantId = "63000000-0000-4000-8000-000000000003";
const tr30VariantId = "5ff78cc3-c541-5bf4-9f3b-12be2222cc75";
const tr60VariantId = "d6b26e70-2a1b-599c-93f0-c85cd014ffd5";

function cart(items: readonly Readonly<{ variantId: string; quantity: number }>[] = [
  { variantId, quantity: 2 },
]) {
  return {
    hydrated: true,
    items,
    legacyItemCount: null,
    setQuantity,
    removeItem,
    clearCart,
    acknowledgeLegacyReselection,
  };
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

const tr30QuantityTwo: CartPreviewItem = {
  variantId: tr30VariantId,
  quantity: 2,
  available: false,
  purchaseState: "checkout_unavailable",
  name: "Tirzepatide",
  variantLabel: "30mg",
  sku: "PPQ-TIRZEPATIDE-TR30",
  packageForm: "1 bottle",
  baseUnitMinor: 5_999,
  unitAmountMinor: 4_199,
  lineSubtotalMinor: 8_398,
  lineSavingsMinor: 3_600,
  effectiveDiscountBps: 3_000,
  appliedPromotions: [{ id: "winter30", label: "WINTER30" }],
  currency: "USD",
};

const tr30QuantityOne: CartPreviewItem = {
  ...tr30QuantityTwo,
  quantity: 1,
  lineSubtotalMinor: 4_199,
  lineSavingsMinor: 1_800,
};

const tr60QuantityOne: CartPreviewItem = {
  ...tr30QuantityTwo,
  variantId: tr60VariantId,
  quantity: 1,
  variantLabel: "60mg",
  sku: "PPQ-TIRZEPATIDE-TR60",
  baseUnitMinor: 10_999,
  unitAmountMinor: 7_699,
  lineSubtotalMinor: 7_699,
  lineSavingsMinor: 3_300,
};

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

function preview(
  items: readonly CartPreviewItem[] = [readyLine()],
  reasons: CartPreview["reasons"] = [],
): CartPreview {
  const subtotalMinor = items.reduce(
    (total, item) => total + (item.lineSubtotalMinor ?? 0),
    0,
  );
  return {
    schemaVersion: 2,
    items,
    subtotalMinor,
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

function requestBody(callIndex = 0) {
  return JSON.parse(String((fetchMock.mock.calls[callIndex]?.[1] as RequestInit).body));
}

function reasonFor(state: CartPreviewPurchaseState): CartPreview["reasons"] {
  if (state === "ready") return [];
  if (state === "checkout_unavailable" || state === "local_preview") {
    return ["checkout_unavailable"];
  }
  if (state === "unavailable") return ["product_unavailable"];
  return [state];
}

describe("CartView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    fetchMock.mockReset();
    window.sessionStorage.clear();
    window.localStorage.clear();
    useCart.mockReturnValue(cart());
    fetchMock.mockResolvedValue(response(preview()));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("renders exact TR30 and TR60 identity, display pricing, promotion, and subtotal without granting checkout", async () => {
    useCart.mockReturnValue(cart([
      { variantId: tr30VariantId, quantity: 2 },
      { variantId: tr60VariantId, quantity: 1 },
    ]));
    fetchMock.mockResolvedValue(response(preview(
      [tr30QuantityTwo, tr60QuantityOne],
      ["checkout_unavailable"],
    )));

    render(<CartView checkoutIntent={null} />);

    const tr30 = (await screen.findByText("30mg", { exact: true })).closest("li");
    const tr60 = screen.getByText("60mg", { exact: true }).closest("li");
    expect(tr30).not.toBeNull();
    expect(tr60).not.toBeNull();
    for (const line of [tr30!, tr60!]) {
      expect(within(line).getByRole("heading", { name: "Tirzepatide" })).toBeVisible();
      expect(within(line).getByText("1 bottle", { exact: true })).toBeVisible();
      expect(within(line).getByText("WINTER30", { exact: true })).toBeVisible();
      expect(within(line).getByText("-30%", { exact: true })).toBeVisible();
      expect(within(line).getByText(
        "Display price available. Checkout is not yet available for this variant.",
        { exact: true },
      )).toBeVisible();
    }
    expect(within(tr30!).getByText("SKU PPQ-TIRZEPATIDE-TR30", { exact: true })).toBeVisible();
    expect(within(tr30!).getByText("$59.99", { selector: "del" })).toBeVisible();
    expect(within(tr30!).getByText("$41.99", { selector: "strong" })).toBeVisible();
    expect(within(tr30!).getByText("Save $36.00", { exact: true })).toBeVisible();
    expect(within(tr30!).getByText("$83.98", { exact: true })).toBeVisible();
    expect(within(tr60!).getByText("SKU PPQ-TIRZEPATIDE-TR60", { exact: true })).toBeVisible();
    expect(within(tr60!).getByText("$109.99", { selector: "del" })).toBeVisible();
    expect(within(tr60!).getByText("$76.99", { selector: "strong" })).toBeVisible();
    expect(within(tr60!).getByText("Save $33.00", { exact: true })).toBeVisible();
    expect(within(tr60!).getByText("Line subtotal").nextElementSibling).toHaveTextContent("$76.99");
    expect(screen.queryByText(/30mg\s*[·|]\s*1 bottle/iu)).toBeNull();

    const summary = screen.getByRole("complementary", { name: "Order summary" });
    expect(within(summary).getByText("$160.97", { exact: true })).toBeVisible();
    expect(within(summary).getByText("Included in displayed merchandise prices", { exact: true })).toBeVisible();
    expect(within(summary).getByRole("heading", { name: "Display-price cart preview" })).toBeVisible();
    expect(within(summary).getByText(/no order or payment can be submitted/iu)).toBeVisible();
    expect(within(summary).getByRole("button", { name: "Checkout unavailable" })).toBeDisabled();
    expect(screen.queryByText(/sold out|no longer available|calculated at checkout/iu)).toBeNull();
    expect(screen.queryByText(/Unverified saved variant:/u)).toBeNull();
  });

  it("shows one unit price without a fake discount and describes no automatic promotion", async () => {
    const undiscounted = readyLine({
      quantity: 1,
      baseUnitMinor: 2_400,
      unitAmountMinor: 2_400,
      lineSubtotalMinor: 2_400,
      lineSavingsMinor: 0,
      effectiveDiscountBps: 0,
    });
    useCart.mockReturnValue(cart([{ variantId, quantity: 1 }]));
    fetchMock.mockResolvedValue(response(preview([undiscounted])));

    render(<CartView checkoutIntent={null} />);

    const line = (await screen.findByText("Synthetic 5 mg", { exact: true })).closest("li")!;
    expect(line.querySelector("del")).toBeNull();
    expect(within(line).getByText("Unit price", { exact: true })).toBeVisible();
    expect(within(line).getAllByText("$24.00", { exact: true })).toHaveLength(2);
    expect(within(line).queryByText(/^Save /u)).toBeNull();
    expect(screen.getByText("No automatic promotion applied", { exact: true })).toBeVisible();
  });

  it("describes a server-calculated quantity discount when no promotion is applied", async () => {
    render(<CartView checkoutIntent={null} />);

    await screen.findByText("Synthetic 5 mg", { exact: true });
    expect(screen.getByText("Quantity discount included in displayed prices", { exact: true })).toBeVisible();
    expect(screen.getByText("Save $3.84", { exact: true })).toBeVisible();
    expect(screen.getByText("-8%", { exact: true })).toBeVisible();
  });

  it.each([
    ["ready", null],
    ["checkout_unavailable", "Display price available. Checkout is not yet available for this variant."],
    ["local_preview", "Local cart preview only. No payment will be created."],
    ["pricing_pending", "Pricing coming soon."],
    ["unavailable", "This variant is unavailable."],
    ["insufficient_quantity", "The requested quantity is not currently available."],
    ["unknown_variant", "This saved variant is no longer recognized. Choose it again from the catalog."],
  ] as const)("renders the exact %s purchase-state copy", async (purchaseState, expected) => {
    const line = stateLine(purchaseState);
    fetchMock.mockResolvedValue(response(preview([line], reasonFor(purchaseState))));

    render(<CartView checkoutIntent={null} />);

    if (purchaseState === "unknown_variant") {
      await screen.findByText(new RegExp(`Unverified saved variant:.*${variantId}`, "u"));
    } else {
      await screen.findByText("Synthetic 5 mg", { exact: true });
    }
    if (expected === null) {
      for (const copy of [
        "Display price available. Checkout is not yet available for this variant.",
        "Local cart preview only. No payment will be created.",
        "Pricing coming soon.",
        "This variant is unavailable.",
        "The requested quantity is not currently available.",
        "This saved variant is no longer recognized. Choose it again from the catalog.",
      ]) expect(screen.queryByText(copy, { exact: true })).toBeNull();
    } else {
      expect(screen.getByText(expected, { exact: true })).toBeVisible();
    }
  });

  it("shows the exact visible and accessible unverified prefix while loading and after failure", async () => {
    let rejectRequest: ((reason?: unknown) => void) | undefined;
    fetchMock.mockReturnValue(new Promise<Response>((_resolve, reject) => {
      rejectRequest = reject;
    }));

    render(<CartView checkoutIntent={null} />);

    const fallback = screen.getByText(new RegExp(`Unverified saved variant:.*${variantId}`, "u"));
    expect(fallback).toBeVisible();
    expect(fallback).toHaveAccessibleName(`Unverified saved variant: ${variantId}`);
    await act(async () => rejectRequest?.(new Error("preview unavailable")));
    expect(await screen.findByRole("alert")).toHaveTextContent("The authoritative cart preview is unavailable.");
    expect(screen.getByText(new RegExp(`Unverified saved variant:.*${variantId}`, "u"))).toBeVisible();
  });

  it.each([
    ["extra authority field", (valid: CartPreview) => ({ ...valid, stripePriceId: "private" }), 200],
    ["incoherent subtotal", (valid: CartPreview) => ({ ...valid, subtotalMinor: valid.subtotalMinor + 1 }), 200],
    ["incoherent state", (valid: CartPreview) => ({ ...valid, items: [{ ...valid.items[0]!, available: false }] }), 200],
    ["legacy schema", (valid: CartPreview) => ({ ...valid, schemaVersion: 1 }), 200],
    ["non-200 response", (valid: CartPreview) => valid, 503],
  ] as const)("fails closed for a %s preview response", async (_label, mutate, status) => {
    const valid = preview();
    fetchMock.mockResolvedValue(response(mutate(valid), status));

    render(<CartView checkoutIntent="resume" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("The authoritative cart preview is unavailable.");
    expect(screen.queryByText("Synthetic local test only — Alpha", { exact: true })).toBeNull();
    expect(screen.getByText(new RegExp(`Unverified saved variant:.*${variantId}`, "u"))).toBeVisible();
    expect(screen.queryByText("Your saved request is ready to continue at checkout.", { exact: true })).toBeNull();
    expect(screen.getByRole("button", { name: "Checkout unavailable" })).toBeDisabled();
  });

  it.each([
    ["missing row", [tr30QuantityTwo]],
    ["extra row", [tr30QuantityTwo, tr60QuantityOne, readyLine({ variantId: thirdVariantId, quantity: 1, baseUnitMinor: 2_400, unitAmountMinor: 2_400, lineSubtotalMinor: 2_400, lineSavingsMinor: 0, effectiveDiscountBps: 0 })]],
    ["reordered rows", [tr60QuantityOne, tr30QuantityTwo]],
    ["different variant ID", [{ ...tr30QuantityTwo, variantId: secondVariantId }, tr60QuantityOne]],
    ["different quantity", [tr30QuantityOne, tr60QuantityOne]],
  ] as const)("rejects a parser-valid response with a %s", async (_label, responseItems) => {
    useCart.mockReturnValue(cart([
      { variantId: tr30VariantId, quantity: 2 },
      { variantId: tr60VariantId, quantity: 1 },
    ]));
    fetchMock.mockResolvedValue(response(preview(
      responseItems,
      responseItems.some((item) => item.purchaseState === "checkout_unavailable")
        ? ["checkout_unavailable"]
        : [],
    )));

    render(<CartView checkoutIntent="resume" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("The authoritative cart preview is unavailable.");
    expect(screen.queryByRole("heading", { name: "Tirzepatide" })).toBeNull();
    expect(screen.getByText(new RegExp(`Unverified saved variant:.*${tr30VariantId}`, "u"))).toBeVisible();
    expect(screen.getByText(new RegExp(`Unverified saved variant:.*${tr60VariantId}`, "u"))).toBeVisible();
    expect(screen.queryByText("Your saved request is ready to continue at checkout.", { exact: true })).toBeNull();
    expect(screen.getByRole("button", { name: "Checkout unavailable" })).toBeDisabled();
  });

  it("sends only exact variant requests and stores only the coherent v2 presentation", async () => {
    render(<CartView checkoutIntent={null} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(requestBody().items).toEqual([{ variantId, quantity: 2 }]);
    expect(JSON.stringify(requestBody())).not.toMatch(/name|sku|price|amount|promotion|available/iu);
    await screen.findByText("Synthetic 5 mg", { exact: true });
    expect(JSON.parse(window.sessionStorage.getItem(PREVIEW_PRESENTATION_STORAGE_KEY)!)).toEqual({
      schemaVersion: 2,
      preview: preview(),
    });
  });

  it("retries the unchanged variant cart after a preview failure", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockRejectedValueOnce(new Error("temporary preview failure"))
      .mockResolvedValueOnce(response(preview()));

    render(<CartView checkoutIntent={null} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("The authoritative cart preview is unavailable.");
    const first = requestBody();
    await user.click(screen.getByRole("button", { name: "Retry current cart facts" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(requestBody(1)).toEqual(first);
    expect(await screen.findAllByText("$44.16", { exact: true })).toHaveLength(2);
  });

  it("hides stale facts immediately while refreshing an exact changed quantity", async () => {
    fetchMock
      .mockResolvedValueOnce(response(preview()))
      .mockRejectedValueOnce(new Error("changed preview failure"))
      .mockResolvedValueOnce(response(preview([
        readyLine({ quantity: 3, unitAmountMinor: 2_160, lineSubtotalMinor: 6_480, lineSavingsMinor: 720, effectiveDiscountBps: 1_000 }),
      ])));
    const { rerender } = render(<CartView checkoutIntent={null} />);
    expect(await screen.findByText("Synthetic 5 mg", { exact: true })).toBeVisible();

    useCart.mockReturnValue(cart([{ variantId, quantity: 3 }]));
    rerender(<CartView checkoutIntent={null} />);

    expect(screen.queryByText("Synthetic 5 mg", { exact: true })).toBeNull();
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(requestBody(1)).toMatchObject({ items: [{ variantId, quantity: 3 }] });
    fireEvent.click(screen.getByRole("button", { name: "Retry current cart facts" }));
    expect(await screen.findByText("Synthetic 5 mg", { exact: true })).toBeVisible();
  });

  it("ignores an aborted response that resolves after the newer cart facts", async () => {
    let resolveFirst: ((value: Response) => void) | undefined;
    let firstSignal: AbortSignal | undefined;
    fetchMock
      .mockImplementationOnce((_url: string, init: RequestInit) => {
        firstSignal = init.signal as AbortSignal;
        return new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        });
      })
      .mockResolvedValueOnce(response(preview([tr30QuantityOne], ["checkout_unavailable"])));
    const { rerender } = render(<CartView checkoutIntent={null} />);

    useCart.mockReturnValue(cart([{ variantId: tr30VariantId, quantity: 1 }]));
    rerender(<CartView checkoutIntent={null} />);

    expect(await screen.findByText("30mg", { exact: true })).toBeVisible();
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => {
      resolveFirst?.(response(preview()));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText("30mg", { exact: true })).toBeVisible();
    expect(screen.queryByText("Synthetic 5 mg", { exact: true })).toBeNull();
  });

  it("targets the exact verified product and variant in every quantity and remove control", async () => {
    const user = userEvent.setup();
    useCart.mockReturnValue(cart([{ variantId: tr30VariantId, quantity: 2 }]));
    fetchMock.mockResolvedValue(response(preview([tr30QuantityTwo], ["checkout_unavailable"])));

    render(<CartView checkoutIntent={null} />);

    await screen.findByText("30mg", { exact: true });
    await user.click(screen.getByRole("button", { name: "Increase quantity for Tirzepatide, 30mg" }));
    await user.click(screen.getByRole("button", { name: "Decrease quantity for Tirzepatide, 30mg" }));
    const input = screen.getByRole("spinbutton", { name: "Quantity for Tirzepatide, 30mg" });
    expect(input).toHaveAttribute("max", "25");
    fireEvent.change(input, { target: { value: "25" } });
    await user.click(screen.getByRole("button", { name: "Remove Tirzepatide, 30mg from cart" }));
    expect(setQuantity).toHaveBeenNthCalledWith(1, tr30VariantId, 3);
    expect(setQuantity).toHaveBeenNthCalledWith(2, tr30VariantId, 1);
    expect(setQuantity).toHaveBeenNthCalledWith(3, tr30VariantId, 25);
    expect(removeItem).toHaveBeenCalledWith(tr30VariantId);
  });

  it("keeps a retained checkout intent closed for display-only or failed facts", async () => {
    fetchMock.mockResolvedValue(response(preview([tr30QuantityTwo], ["checkout_unavailable"])));
    useCart.mockReturnValue(cart([{ variantId: tr30VariantId, quantity: 2 }]));

    render(<CartView checkoutIntent="resume" />);

    await screen.findByText("30mg", { exact: true });
    expect(screen.queryByText("Your saved request is ready to continue at checkout.", { exact: true })).toBeNull();
    expect(screen.getByRole("button", { name: "Checkout unavailable" })).toBeDisabled();
  });

  it("requires acknowledgement for changed ready facts before preserving the v2 checkout handoff", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    fetchMock.mockResolvedValue(response(preview(
      [readyLine()],
      ["server_facts_changed"],
    )));

    render(<CartView checkoutIntent="resume" navigate={navigate} />);

    expect(await screen.findByRole("button", { name: "Checkout unavailable" })).toBeDisabled();
    expect(screen.queryByText("Your saved request is ready to continue at checkout.", { exact: true })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Acknowledge server changes" }));
    expect(screen.getByText("Your saved request is ready to continue at checkout.", { exact: true })).toBeVisible();
    const continueButton = screen.getByRole("button", { name: "Continue to sign in" });
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);
    expect(navigate).toHaveBeenCalledWith("/checkout");
    expect(JSON.parse(window.localStorage.getItem("propeptiq.cart.v2")!)).toEqual({
      version: 2,
      items: [{ variantId, quantity: 2 }],
    });
  });

  it("requires explicit acknowledgement before removing a v1 cart", async () => {
    const user = userEvent.setup();
    useCart.mockReturnValue({ ...cart(), items: [], legacyItemCount: 2 });

    render(<CartView checkoutIntent={null} />);

    expect(screen.getByRole("heading", { name: "Choose your variants again." })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear old cart and choose variants" }));
    expect(acknowledgeLegacyReselection).toHaveBeenCalledOnce();
  });

  it("keeps an empty v2 cart closed without requesting preview facts", () => {
    useCart.mockReturnValue(cart([]));

    render(<CartView checkoutIntent="resume" />);

    expect(screen.getByRole("heading", { name: "Your cart is empty." })).toBeVisible();
    expect(screen.getByRole("link", { name: "Continue to catalog" })).toHaveAttribute("href", "/catalog");
    expect(screen.queryByText("Your saved request is ready to continue at checkout.", { exact: true })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
