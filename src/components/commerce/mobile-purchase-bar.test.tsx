import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CartProvider } from "@/cart/cart-provider";
import { CART_STORAGE_KEY, LEGACY_CART_STORAGE_KEY } from "@/cart/cart-storage";
import { SiteSearchLauncher } from "@/components/search/site-search-launcher";
import { ProductPurchasePanel } from "./product-purchase-panel";
import { testCanonicalProduct, testPricingContext, testPublicVariant, testWinter30 } from "./storefront-test-fixtures";

const { route } = vi.hoisted(() => ({ route: { pathname: "/catalog/items/product-alpha" } }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

// Minimal browser geometry doubles: jsdom has no layout or native IO/RO.
const intersections: { callback: IntersectionObserverCallback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
const resizes: { callback: ResizeObserverCallback; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[] = [];
let mobile = true;
let viewportHeight = 812;
let rowHeight = 124;
let summaryBottom = 1100;
let mediaChange: (() => void) | undefined;

function rect(top: number, height: number, width = 367): DOMRect {
  return { top, bottom: top + height, left: 0, right: width, width, height, x: 0, y: top, toJSON: () => ({}) };
}

function reportSummary(bottom: number, isIntersecting = false) {
  const summary = screen.getByRole("status", { name: "Purchase summary" });
  const observer = intersections.find((item) => item.observe.mock.calls.some(([target]) => target === summary));
  expect(observer, "the actual inline purchase summary must be observed").toBeDefined();
  act(() => observer!.callback([{
    target: summary, isIntersecting, boundingClientRect: rect(bottom - 200, 200),
    intersectionRatio: isIntersecting ? 1 : 0, intersectionRect: rect(bottom - 200, 200), rootBounds: null, time: 0,
  }], {} as IntersectionObserver));
}

async function showBar() {
  await waitFor(() => expect(intersections.some((item) => item.observe.mock.calls.length > 0)).toBe(true));
  reportSummary(-1);
  return await screen.findByRole("region", { name: "Mobile purchase controls" });
}

function Fixture({ product = testCanonicalProduct(), pricing = testPricingContext("production", [testWinter30]) }: {
  product?: ReturnType<typeof testCanonicalProduct>;
  pricing?: ReturnType<typeof testPricingContext>;
}) {
  return <CartProvider><div className="public-layout"><header className="persistent-chrome">Site navigation</header><main><ProductPurchasePanel key={product.slug} product={product} pricing={pricing} /></main><SiteSearchLauncher /></div></CartProvider>;
}

beforeEach(() => {
  route.pathname = "/catalog/items/product-alpha";
  mobile = true;
  viewportHeight = 812;
  rowHeight = 124;
  summaryBottom = 1100;
  intersections.length = 0;
  resizes.length = 0;
  window.localStorage.clear();
  vi.stubGlobal("IntersectionObserver", vi.fn(function (callback: IntersectionObserverCallback) {
    const observer = { callback, observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
    intersections.push(observer);
    return observer;
  }));
  vi.stubGlobal("ResizeObserver", vi.fn(function (callback: ResizeObserverCallback) {
    const observer = { callback, observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
    resizes.push(observer);
    return observer;
  }));
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    get matches() { return query === "(max-width: 767px)" && mobile; },
    media: query,
    addEventListener: (_event: string, listener: () => void) => { mediaChange = listener; },
    removeEventListener: vi.fn(),
  })));
  vi.spyOn(window, "innerHeight", "get").mockImplementation(() => viewportHeight);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("mobile-purchase-bar")) return rect(600, rowHeight);
    if (this.classList.contains("public-action-dock")) return rect(736, 44);
    if (this.classList.contains("persistent-chrome")) return rect(0, 141);
    if (this.getAttribute("aria-label") === "Purchase summary") return rect(summaryBottom - 200, 200);
    return rect(900, 200);
  });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Mobile purchase bar with the real purchase and cart authority", () => {
  it("waits until the inline summary passes above the viewport and keeps reservation stable while scrolling", async () => {
    const view = render(<Fixture />);
    await waitFor(() => expect(intersections).toHaveLength(1));
    reportSummary(1100);
    expect(screen.queryByRole("region", { name: "Mobile purchase controls" })).toBeNull();
    reportSummary(200, true);
    expect(screen.queryByRole("region", { name: "Mobile purchase controls" })).toBeNull();
    reportSummary(0, true);
    expect(screen.queryByRole("region", { name: "Mobile purchase controls" })).toBeNull();
    const bar = await showBar();
    expect(bar.closest("main")).toBeNull();
    expect(bar.parentElement).toHaveAttribute("id", "public-mobile-purchase-slot");
    const layout = view.container.querySelector<HTMLElement>(".public-layout")!;
    const reserve = layout.style.getPropertyValue("--public-action-dock-reserved-height");
    expect(Number.parseFloat(reserve)).toBeGreaterThanOrEqual(208);
    reportSummary(200, true);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Mobile purchase controls" })).toBeNull());
    expect(layout.style.getPropertyValue("--public-action-dock-reserved-height")).toBe(reserve);
  });

  it.each([[1, "$7.00"], [2, "$14.00"], [3, "$21.00"], [4, "$28.00"], [9, "$63.00"], [10, "$70.00"], [11, "$77.00"], [25, "$175.00"]] as const)("mirrors exact quantity %s and its existing WINTER30 subtotal", async (quantity, subtotal) => {
    render(<Fixture />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Exact quantity" }), { target: { value: String(quantity) } });
    const bar = await showBar();
    expect(bar).toHaveTextContent("Synthetic Product Alpha");
    expect(bar).toHaveTextContent("5 mg");
    expect(bar).toHaveTextContent(`${quantity} bottle`);
    expect(within(bar).getByText(subtotal, { exact: true })).toBeInTheDocument();
    expect(within(bar).queryByRole("status")).toBeNull();
    expect(screen.getAllByRole("status", { name: "Purchase summary" })).toHaveLength(1);
    expect(screen.getAllByRole("status", { name: "Cart updates" })).toHaveLength(1);
  });

  it("handles a jump from below to above between IntersectionObserver frames", async () => {
    render(<Fixture />);
    await waitFor(() => expect(intersections).toHaveLength(1));
    reportSummary(1100);
    summaryBottom = -12;
    act(() => window.dispatchEvent(new Event("scroll")));
    expect(await screen.findByRole("region", { name: "Mobile purchase controls" })).toBeVisible();
    summaryBottom = 1100;
    act(() => window.dispatchEvent(new Event("scroll")));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Mobile purchase controls" })).toBeNull());
  });

  it("uses the latest matching entry when IntersectionObserver batches opposite crossings", async () => {
    render(<Fixture />);
    await waitFor(() => expect(intersections).toHaveLength(1));
    const summary = screen.getByRole("status", { name: "Purchase summary" });
    const entry = (bottom: number, isIntersecting: boolean): IntersectionObserverEntry => ({
      target: summary, boundingClientRect: rect(bottom - 200, 200), isIntersecting,
      intersectionRatio: isIntersecting ? 1 : 0, intersectionRect: rect(bottom - 200, 200), rootBounds: null, time: 0,
    });
    const observer = intersections[0]!;
    act(() => observer.callback([entry(100, true), entry(-12, false)], {} as IntersectionObserver));
    expect(await screen.findByRole("region", { name: "Mobile purchase controls" })).toBeVisible();
    act(() => observer.callback([entry(-12, false), entry(100, true)], {} as IntersectionObserver));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Mobile purchase controls" })).toBeNull());
  });

  it("uses the selected canonical variant for repeated adds and persists the merged line without double announcements", async () => {
    render(<Fixture product={testCanonicalProduct([testPublicVariant(), testPublicVariant({ id: "variant-10mg", label: "10 mg", baseUnitMinor: 2000, availability: "preview_only", checkoutReady: false })])} />);
    fireEvent.click(screen.getByRole("radio", { name: /10 mg/u }));
    fireEvent.click(screen.getByRole("button", { name: "2 bottles" }));
    const bar = await showBar();
    expect(bar).toHaveTextContent("$28.00");
    expect(bar).toHaveTextContent("Cart preview only");
    const add = within(bar).getByRole("button", { name: "Add Synthetic Product Alpha to preview cart" });
    fireEvent.click(add);
    fireEvent.click(add);
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY)!)).toEqual({ version: 2, items: [{ variantId: "variant-10mg", quantity: 4 }] }));
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("Synthetic Product Alpha, 10 mg: 4 units in cart");
    expect(within(bar).queryByRole("status")).toBeNull();
  });

  it.each([
    ["pending", testPublicVariant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, checkoutReady: false }), "Pricing coming soon"],
    ["unavailable", testPublicVariant({ availability: "unavailable", checkoutReady: false }), "Unavailable"],
  ] as const)("preserves %s status without a price or enabled add", async (_label, variant, status) => {
    render(<Fixture product={testCanonicalProduct([variant])} />);
    const bar = await showBar();
    expect(bar).toHaveTextContent(status);
    expect(bar).not.toHaveTextContent("$");
    expect(within(bar).getByRole("button", { name: /unavailable/u })).toBeDisabled();
  });

  it("keeps invalid drafts out of sticky totals and addition", async () => {
    render(<Fixture />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Exact quantity" }), { target: { value: "" } });
    const bar = await showBar();
    expect(bar).toHaveTextContent("Invalid quantity");
    expect(bar).not.toHaveTextContent("$");
    expect(within(bar).getByRole("button", { name: /unavailable/u })).toBeDisabled();
  });

  it("mirrors the permitted preview-zero state without turning it into checkout authority", async () => {
    const zero = testPublicVariant({ priceStatus: "pending", availability: "preview_only", baseUnitMinor: 0, checkoutReady: false });
    render(<Fixture product={testCanonicalProduct([zero])} pricing={testPricingContext("preview", [testWinter30])} />);
    const bar = await showBar();
    expect(bar).toHaveTextContent("$0.00");
    expect(bar).toHaveTextContent("Local cart preview");
    expect(within(bar).getByRole("button", { name: "Add Synthetic Product Alpha to preview cart" })).toBeEnabled();
  });

  it("does not choose a variant when the canonical default is not a member", async () => {
    render(<Fixture product={testCanonicalProduct([testPublicVariant()], { defaultVariantId: "synthetic-missing-default" })} />);
    const bar = await showBar();
    expect(bar).toHaveTextContent("No variant selected");
    expect(bar).toHaveTextContent("Choose a variant");
    expect(bar).not.toHaveTextContent("$");
    expect(within(bar).getByRole("button", { name: /unavailable/u })).toBeDisabled();
  });

  it("retains a focused row until focus leaves and exposes a native return to the focusable purchase heading", async () => {
    render(<Fixture />);
    const bar = await showBar();
    const change = within(bar).getByRole("link", { name: "Change selection" });
    expect(change).toHaveAttribute("href", "#purchase-heading");
    const heading = screen.getByRole("heading", { name: "Purchase" });
    expect(heading).toHaveAttribute("tabindex", "-1");
    act(() => change.focus());
    reportSummary(200, true);
    expect(bar).not.toHaveAttribute("aria-hidden", "true");
    expect(change).toHaveFocus();
    act(() => heading.focus());
    await waitFor(() => expect(screen.queryByRole("region", { name: "Mobile purchase controls" })).toBeNull());
    expect(heading).toHaveFocus();
  });

  it("keeps legacy-cart denial visible and never changes its stored items", async () => {
    const old = JSON.stringify({ version: 1, items: [{ productId: "synthetic-old-product", quantity: 2 }] });
    window.localStorage.setItem(LEGACY_CART_STORAGE_KEY, old);
    render(<Fixture />);
    const bar = await showBar();
    await waitFor(() => expect(within(bar).getByRole("link", { name: "Review saved cart" })).toHaveAttribute("href", "/cart"));
    await userEvent.click(within(bar).getByRole("button", { name: "Add Synthetic Product Alpha to cart" }));
    expect(window.localStorage.getItem(LEGACY_CART_STORAGE_KEY)).toBe(old);
    expect(screen.getByRole("status", { name: "Cart updates" })).not.toHaveTextContent("Cart updated");
  });

  it("yields an oversized purchase row without hiding search and restores it when it fits", async () => {
    viewportHeight = 240;
    render(<Fixture />);
    await waitFor(() => expect(intersections).toHaveLength(1));
    reportSummary(-1);
    expect(screen.queryByRole("region", { name: "Mobile purchase controls" })).toBeNull();
    expect(screen.getByRole("button", { name: "Search PropeptIQ" })).toBeVisible();
    viewportHeight = 812;
    act(() => window.dispatchEvent(new Event("resize")));
    expect(await screen.findByRole("region", { name: "Mobile purchase controls" })).toBeVisible();
  });

  it.each(["desktop", "short viewport", "enlarged text"] as const)("hands focused purchase controls back to the inline heading before hiding for %s", async (reason) => {
    render(<Fixture />);
    const bar = await showBar();
    act(() => within(bar).getByRole("button", { name: "Add Synthetic Product Alpha to cart" }).focus());
    if (reason === "desktop") {
      mobile = false;
      act(() => mediaChange?.());
    } else if (reason === "short viewport") {
      viewportHeight = 240;
      act(() => window.dispatchEvent(new Event("resize")));
    } else {
      rowHeight = 500;
      act(() => resizes.at(-1)!.callback([], {} as ResizeObserver));
    }
    await waitFor(() => expect(screen.getByRole("heading", { name: "Purchase" })).toHaveFocus());
    expect(screen.queryByRole("region", { name: "Mobile purchase controls" })).toBeNull();
    expect(screen.getByRole("button", { name: "Search PropeptIQ" })).toBeVisible();
  });

  it("removes the row on desktop or route change and disconnects its observers", async () => {
    const view = render(<Fixture />);
    await showBar();
    mobile = false;
    act(() => mediaChange?.());
    await waitFor(() => expect(screen.queryByRole("region", { name: "Mobile purchase controls" })).toBeNull());
    route.pathname = "/catalog";
    view.rerender(<Fixture />);
    expect(screen.queryByRole("region", { name: "Mobile purchase controls" })).toBeNull();
    expect(view.container.querySelector<HTMLElement>(".public-layout")!.style.getPropertyValue("--public-action-dock-reserved-height")).toBe("");
    act(() => {
      for (const observer of intersections) observer.callback([], {} as IntersectionObserver);
      for (const observer of resizes) observer.callback([], {} as ResizeObserver);
      window.dispatchEvent(new Event("scroll"));
    });
    expect(screen.queryByRole("region", { name: "Mobile purchase controls" })).toBeNull();
    view.unmount();
    for (const observer of [...intersections, ...resizes]) expect(observer.disconnect).toHaveBeenCalled();
  });

  it("reads the current summary position when returning from desktop after desktop scrolling", async () => {
    mobile = false;
    render(<Fixture />);
    await waitFor(() => expect(intersections).toHaveLength(1));
    reportSummary(1100);
    summaryBottom = -12;
    act(() => window.dispatchEvent(new Event("scroll")));
    expect(screen.queryByRole("region", { name: "Mobile purchase controls" })).toBeNull();
    mobile = true;
    act(() => mediaChange?.());
    expect(await screen.findByRole("region", { name: "Mobile purchase controls" })).toBeVisible();
  });

  it("measures content growth once and keeps the high-water reserve through later shrinking and scroll changes", async () => {
    const view = render(<Fixture />);
    await showBar();
    const layout = view.container.querySelector<HTMLElement>(".public-layout")!;
    rowHeight = 200;
    act(() => resizes.at(-1)!.callback([], {} as ResizeObserver));
    await waitFor(() => expect(layout.style.getPropertyValue("--public-action-dock-reserved-height")).toBe("284px"));
    rowHeight = 124;
    act(() => resizes.at(-1)!.callback([], {} as ResizeObserver));
    reportSummary(1100);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Mobile purchase controls" })).toBeNull());
    expect(layout.style.getPropertyValue("--public-action-dock-reserved-height")).toBe("284px");
  });

  it("does not add a sticky enhancement when IntersectionObserver is unavailable", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const view = render(<Fixture />);
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    expect(intersections).toHaveLength(0);
    expect(view.container.querySelector(".mobile-purchase-bar")).toBeNull();
    expect(screen.queryByRole("region", { name: "Mobile purchase controls" })).toBeNull();
    expect(screen.getByRole("status", { name: "Purchase summary" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Search PropeptIQ" })).toBeVisible();
  });
});
