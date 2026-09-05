import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CartProvider, useCart } from "@/cart/cart-provider";
import { createCartPreviewToken } from "@/cart/preview-token";
import type { CartPreview, CartPreviewItem } from "@/cart/preview-types";

const route = vi.hoisted(() => ({ pathname: "/catalog" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

import { CartDrawer } from "./cart-drawer";

const alphaId = "71000000-0000-4000-8000-000000000001";
const betaId = "72000000-0000-4000-8000-000000000002";

function line(
  variantId: string,
  quantity: number,
  name = "Synthetic cart Alpha",
  variantLabel = "Synthetic 10 mg",
): CartPreviewItem {
  return {
    variantId,
    quantity,
    available: false,
    purchaseState: "checkout_unavailable",
    name,
    variantLabel,
    sku: variantId === alphaId ? "SYN-ALPHA-10" : "SYN-BETA-20",
    packageForm: "1 bottle",
    baseUnitMinor: 3_999,
    unitAmountMinor: 2_799,
    lineSubtotalMinor: 2_799 * quantity,
    lineSavingsMinor: 1_200 * quantity,
    effectiveDiscountBps: 3_000,
    appliedPromotions: [{ id: "winter30", label: "WINTER30" }],
    currency: "USD",
  };
}

function preview(items: readonly CartPreviewItem[]): CartPreview {
  return {
    schemaVersion: 2,
    items,
    subtotalMinor: items.reduce((total, item) => total + (item.lineSubtotalMinor ?? 0), 0),
    currency: "USD",
    taxMinor: null,
    shippingMinor: null,
    finalDiscountMinor: null,
    previewToken: createCartPreviewToken(items),
    requiresAcknowledgement: true,
    reasons: ["checkout_unavailable"],
  };
}

function responseForRequest(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const requested = JSON.parse(String(init?.body)) as {
    items: { variantId: string; quantity: number }[];
  };
  const items = requested.items.map((item) => item.variantId === alphaId
    ? line(item.variantId, item.quantity)
    : line(item.variantId, item.quantity, "Synthetic cart Beta", "Synthetic 20 mg"));
  return Promise.resolve(Response.json(preview(items)));
}

function seed(items: readonly Readonly<{ variantId: string; quantity: number }>[]) {
  window.localStorage.setItem("propeptiq.cart.v2", JSON.stringify({ version: 2, items }));
}

function DrawerHarness() {
  const { addVariant, itemCount } = useCart();
  return (
    <>
      <button type="button" onClick={() => addVariant(alphaId, 1)}>Add Alpha</button>
      <button type="button" onClick={() => addVariant(betaId, 1)}>Add Beta</button>
      <CartDrawer enabled itemCount={itemCount} />
    </>
  );
}

async function renderAndOpen() {
  const user = userEvent.setup();
  const view = render(<CartProvider><DrawerHarness /></CartProvider>);
  const trigger = await screen.findByRole("link", { name: /Cart, \d+ requested unit/iu });
  await user.click(trigger);
  const dialog = await screen.findByRole("dialog", { name: "Your cart" });
  return { dialog, trigger, user, rerender: view.rerender };
}

describe("CartDrawer accessible progressive enhancement", () => {
  beforeEach(() => {
    route.pathname = "/catalog";
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn(responseForRequest));
  });

  it("stays lazy while closed and preserves native modified-click and /cart fallbacks", async () => {
    seed([{ variantId: alphaId, quantity: 1 }]);
    render(<CartProvider><DrawerHarness /></CartProvider>);
    const trigger = await screen.findByRole("link", { name: "Cart, 1 requested unit" });

    expect(trigger).toHaveAttribute("href", "/cart");
    expect(fetch).not.toHaveBeenCalled();
    expect(fireEvent.click(trigger, { ctrlKey: true })).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Your cart" })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();

    route.pathname = "/cart";
    const { unmount } = render(
      <CartProvider><CartDrawer enabled itemCount={1} /></CartProvider>,
    );
    const pageLink = screen.getAllByRole("link", { name: "Cart, 1 requested unit" }).at(-1)!;
    expect(pageLink).not.toHaveAttribute("aria-haspopup");
    expect(fireEvent.click(pageLink)).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Your cart" })).toBeNull();
    unmount();
  });

  it("renders only verified adjacent identity with the shared disclosed front scene and current preview prices", async () => {
    seed([{ variantId: alphaId, quantity: 2 }]);
    const { dialog } = await renderAndOpen();
    const cartLine = await within(dialog).findByRole("listitem");

    expect(within(dialog).getByRole("heading", { name: "Items" })).toBeVisible();
    expect(within(dialog).getByText("Review your items and current prices.", { exact: true })).toBeVisible();
    expect(within(dialog).getByRole("complementary", { name: "Cart preview" })).toBeVisible();
    expect(within(dialog).queryByText("Referral benefit", { exact: true })).toBeNull();
    expect(within(dialog).queryByText("Points redemption", { exact: true })).toBeNull();
    expect(within(cartLine).getByRole("img", {
      name: "AI-generated catalog illustration beside Synthetic cart Alpha, Synthetic 10 mg",
    })).toHaveAttribute("src", expect.stringContaining("front.webp"));
    expect(within(cartLine).getByText(
      "AI-generated catalog illustration — not actual product photography.",
      { exact: true },
    )).toBeVisible();
    expect(within(cartLine).getByRole("heading", { name: "Synthetic cart Alpha" })).toBeVisible();
    expect(within(cartLine).getByText("Synthetic 10 mg", { exact: true })).toBeVisible();
    expect(within(cartLine).getByText("SKU SYN-ALPHA-10", { exact: true })).toBeVisible();
    expect(within(cartLine).getByText("$39.99", { selector: "del" })).toBeVisible();
    expect(within(cartLine).getByText("$27.99", { selector: "strong" })).toBeVisible();
    expect(within(cartLine).getByText("$55.98", { exact: true })).toBeVisible();
    expect(within(dialog).getByRole("complementary", { name: "Cart preview" }))
      .toHaveTextContent("$55.98");
  });

  it("keeps drawer checkout disabled even when authoritative facts say ready", async () => {
    seed([{ variantId: alphaId, quantity: 1 }]);
    const ready = { ...line(alphaId, 1), available: true, purchaseState: "ready" as const };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      ...preview([ready]),
      requiresAcknowledgement: false,
      reasons: [],
    })));

    const { dialog } = await renderAndOpen();
    const checkout = await within(dialog).findByRole("button", {
      name: "Checkout — Coming Soon",
    });
    expect(checkout).toBeDisabled();
    expect(checkout).toHaveAttribute("aria-disabled", "true");
    expect(within(dialog).getByText(/final shipping, tax, and payment are not available/iu)).toBeVisible();
  });

  it("uses unique bound quantity IDs and moves focus after remove and clear with real provider state", async () => {
    seed([
      { variantId: alphaId, quantity: 1 },
      { variantId: betaId, quantity: 1 },
    ]);
    const { dialog, user } = await renderAndOpen();
    const alphaInput = await within(dialog).findByRole("spinbutton", {
      name: "Quantity for Synthetic cart Alpha, Synthetic 10 mg",
    });
    const betaInput = within(dialog).getByRole("spinbutton", {
      name: "Quantity for Synthetic cart Beta, Synthetic 20 mg",
    });
    expect(alphaInput.id).not.toBe(betaInput.id);
    expect(alphaInput.id).not.toBe(`quantity-${alphaId}`);
    expect(dialog.querySelector(`label[for="${alphaInput.id}"]`)).toHaveTextContent("Quantity");

    await user.click(within(dialog).getByRole("button", {
      name: "Remove Synthetic cart Alpha, Synthetic 10 mg from cart",
    }));
    await waitFor(() => expect(document.activeElement).toBe(betaInput));

    await user.click(within(dialog).getByRole("button", { name: "Clear cart" }));
    const emptyHeading = await within(dialog).findByRole("heading", { name: "Your cart is empty." });
    await waitFor(() => expect(document.activeElement).toBe(emptyHeading));
  });

  it("moves focus to the next line when decrementing quantity one removes a line", async () => {
    seed([
      { variantId: alphaId, quantity: 1 },
      { variantId: betaId, quantity: 1 },
    ]);
    const { dialog, user } = await renderAndOpen();
    const betaInput = await within(dialog).findByRole("spinbutton", {
      name: "Quantity for Synthetic cart Beta, Synthetic 20 mg",
    });

    await user.click(within(dialog).getByRole("button", {
      name: "Decrease quantity for Synthetic cart Alpha, Synthetic 10 mg",
    }));

    await waitFor(() => expect(document.activeElement).toBe(betaInput));
  });

  it("moves focus to the next line when entering zero removes a line", async () => {
    seed([
      { variantId: alphaId, quantity: 1 },
      { variantId: betaId, quantity: 1 },
    ]);
    const { dialog } = await renderAndOpen();
    const alphaInput = await within(dialog).findByRole("spinbutton", {
      name: "Quantity for Synthetic cart Alpha, Synthetic 10 mg",
    });
    const betaInput = within(dialog).getByRole("spinbutton", {
      name: "Quantity for Synthetic cart Beta, Synthetic 20 mg",
    });

    fireEvent.change(alphaInput, { target: { value: "0" } });

    await waitFor(() => expect(document.activeElement).toBe(betaInput));
  });

  it("aborts a pending preview on close, ignores the late result, refreshes on reopen, and restores trigger focus", async () => {
    seed([{ variantId: alphaId, quantity: 1 }]);
    let resolveRequest!: (response: Response) => void;
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      return new Promise<Response>((resolvePromise) => { resolveRequest = resolvePromise; });
    }));
    const { dialog, trigger, user } = await renderAndOpen();
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(signals[0]?.aborted).toBe(true);
    expect(document.activeElement).toBe(trigger);
    await act(async () => resolveRequest(Response.json(preview([line(alphaId, 1)]))));
    expect(screen.queryByText("Synthetic cart Alpha", { exact: true })).toBeNull();

    await user.click(trigger);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("closes on pathname changes and stays closed when the original pathname is revisited", async () => {
    seed([{ variantId: alphaId, quantity: 1 }]);
    const { rerender } = await renderAndOpen();

    route.pathname = "/catalog/items/bpc-157";
    rerender(<CartProvider><DrawerHarness /></CartProvider>);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Your cart" })).toBeNull());

    route.pathname = "/catalog";
    rerender(<CartProvider><DrawerHarness /></CartProvider>);
    expect(screen.queryByRole("dialog", { name: "Your cart" })).toBeNull();
  });

  it("merges the same variant, preserves separate variants, and keeps exact quantities through close and reopen", async () => {
    const user = userEvent.setup();
    render(<CartProvider><DrawerHarness /></CartProvider>);
    await user.click(screen.getByRole("button", { name: "Add Alpha" }));
    await user.click(screen.getByRole("button", { name: "Add Alpha" }));
    await user.click(screen.getByRole("button", { name: "Add Beta" }));
    const trigger = await screen.findByRole("link", { name: "Cart, 3 requested units" });
    expect(fetch).not.toHaveBeenCalled();
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Your cart" });
    await waitFor(() => expect(within(dialog).getAllByRole("listitem")).toHaveLength(2));
    expect(within(dialog).getByRole("spinbutton", {
      name: "Quantity for Synthetic cart Alpha, Synthetic 10 mg",
    })).toHaveValue(2);
    expect(within(dialog).getByRole("spinbutton", {
      name: "Quantity for Synthetic cart Beta, Synthetic 20 mg",
    })).toHaveValue(1);

    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await user.click(trigger);
    const reopened = await screen.findByRole("dialog", { name: "Your cart" });
    expect(await within(reopened).findByRole("spinbutton", {
      name: "Quantity for Synthetic cart Alpha, Synthetic 10 mg",
    })).toHaveValue(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps a short-phone drawer scrollable with reachable fixed header/footer and scoped reduced motion", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/\.cart-drawer(?:\[[^\]]+\])?\s*\{[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/isu);
    expect(css).toMatch(/\.cart-drawer__scroll\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain/isu);
    expect(css).toMatch(/\.cart-drawer__footer\s*\{[^}]*padding-bottom:\s*max\([^}]*safe-area-inset-bottom/isu);
    expect(css).toMatch(/\.cart-drawer[^}]*transition-duration:\s*300ms/isu);
    expect(css).toMatch(/\.cart-drawer[^}]*animation-duration:\s*300ms/isu);
    expect(css).toMatch(/\.cart-drawer\s+\.cart-layout--drawer\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/isu);
    expect(css).toMatch(/\.cart-drawer\s+\.cart-layout--drawer\s+\.cart-summary\s*\{[^}]*position:\s*static/isu);
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*\.cart-drawer[^}]*transform:\s*none/iu);
  });

  it("keeps the real Sheet usable behind safe copy when the CartView chunk import fails", async () => {
    let rejectChunk!: (error: Error) => void;
    vi.resetModules();
    vi.doMock("next/dynamic", async (importOriginal) => {
      const actual = await importOriginal<typeof import("next/dynamic")>();
      const dynamic = actual.default;
      return {
        ...actual,
        default: ((loader, options) => {
          void loader;
          return dynamic(
            () => new Promise((_resolve, reject) => {
              rejectChunk = reject;
            }),
            options,
          );
        }) satisfies typeof dynamic,
      };
    });
    const { CartDrawer: ImportFailingCartDrawer } = await import("./cart-drawer");
    seed([{ variantId: alphaId, quantity: 1 }]);
    const user = userEvent.setup();

    function ImportFailureHarness() {
      const { itemCount } = useCart();
      return <ImportFailingCartDrawer enabled itemCount={itemCount} />;
    }

    try {
      render(<CartProvider><ImportFailureHarness /></CartProvider>);
      const trigger = await screen.findByRole("link", { name: "Cart, 1 requested unit" });
      await user.click(trigger);
      const dialog = await screen.findByRole("dialog", { name: "Your cart" });
      const loading = within(dialog).getByRole("status", { name: "Loading cart preview" });
      expect(loading).toBeVisible();
      expect(loading).toHaveTextContent("Loading cart preview…");
      await waitFor(() => expect(typeof rejectChunk).toBe("function"));
      await act(async () => rejectChunk(new Error("synthetic cart chunk import failure")));
      const fallback = await within(dialog).findByRole("alert");

      expect(fallback).toHaveTextContent(
        "The cart preview could not be loaded. Close this panel or use View cart to continue.",
      );
      expect(fallback).not.toHaveTextContent("synthetic cart chunk import failure");
      const viewCart = within(dialog).getByRole("link", { name: "View cart" });
      expect(viewCart).toHaveAttribute("href", "/cart");

      await user.click(within(dialog).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(dialog).not.toBeInTheDocument());
      expect(document.activeElement).toBe(trigger);

      await user.click(trigger);
      const reopened = await screen.findByRole("dialog", { name: "Your cart" });
      expect(fireEvent.click(within(reopened).getByRole("link", { name: "View cart" }))).toBe(true);
      await waitFor(() => expect(reopened).not.toBeInTheDocument());
    } finally {
      vi.doUnmock("next/dynamic");
      vi.resetModules();
    }
  });
});
