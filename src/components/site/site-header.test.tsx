import { act, render, screen } from "@testing-library/react";
import type { CSSProperties } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CartProvider } from "@/cart/cart-provider";
import { SiteHeader } from "./site-header";

vi.mock("next/navigation", () => ({ usePathname: () => "/catalog" }));

// Minimal browser layout/capability doubles: jsdom has no rendered header size.
let headerHeight = 166.25;
let resizeHeader: ResizeObserverCallback;
const observe = vi.fn();
const disconnect = vi.fn();
let fontsReady: Promise<void>;
let finishFonts: () => void;
let originalFonts: PropertyDescriptor | undefined;

function PublicShell({ showHeader = true, previousHeight }: { showHeader?: boolean; previousHeight?: string }) {
  return <CartProvider><div className="public-layout" style={previousHeight ? { "--public-header-height": previousHeight } as CSSProperties : undefined}>
    {showHeader ? <SiteHeader /> : null}<main>Catalog</main>
  </div></CartProvider>;
}

beforeEach(() => {
  headerHeight = 166.25;
  observe.mockClear();
  disconnect.mockClear();
  fontsReady = new Promise<void>((resolve) => { finishFonts = resolve; });
  originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: fontsReady } });
  vi.stubGlobal("ResizeObserver", vi.fn(function (callback: ResizeObserverCallback) {
    resizeHeader = callback;
    return { observe, disconnect, unobserve: vi.fn() };
  }));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return new DOMRect(0, 0, 320, this.matches("header.persistent-chrome") ? headerHeight : 0);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalFonts) Object.defineProperty(document, "fonts", originalFonts);
  else Reflect.deleteProperty(document, "fonts");
});

describe("SiteHeader public focus clearance", () => {
  it("measures the complete public header without a purchase bar and follows wrapping and viewport changes", () => {
    const view = render(<PublicShell />);
    const layout = view.container.querySelector<HTMLElement>(".public-layout")!;
    expect(layout.style.getPropertyValue("--public-header-height")).toBe("167px");
    expect(observe).toHaveBeenCalledWith(screen.getByRole("banner"), { box: "border-box" });
    headerHeight = 214.5;
    act(() => resizeHeader([], {} as ResizeObserver));
    expect(layout.style.getPropertyValue("--public-header-height")).toBe("215px");
    headerHeight = 141;
    act(() => window.dispatchEvent(new Event("resize")));
    expect(layout.style.getPropertyValue("--public-header-height")).toBe("141px");
    expect(layout.style.getPropertyValue("--public-purchase-header-height")).toBe("");
  });

  it("remeasures after fonts load even without ResizeObserver and removes its property on unmount", async () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const view = render(<PublicShell />);
    const layout = view.container.querySelector<HTMLElement>(".public-layout")!;
    headerHeight = 198;
    await act(async () => { finishFonts(); await fontsReady; });
    expect(layout.style.getPropertyValue("--public-header-height")).toBe("198px");
    view.rerender(<PublicShell showHeader={false} />);
    expect(layout.style.getPropertyValue("--public-header-height")).toBe("");
    act(() => window.dispatchEvent(new Event("resize")));
    expect(layout.style.getPropertyValue("--public-header-height")).toBe("");
  });

  it("disconnects and restores prior spacing without accepting late observer or font callbacks", async () => {
    const view = render(<PublicShell previousHeight="120px" />);
    const layout = view.container.querySelector<HTMLElement>(".public-layout")!;
    expect(layout.style.getPropertyValue("--public-header-height")).toBe("167px");
    view.rerender(<PublicShell showHeader={false} previousHeight="120px" />);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(layout.style.getPropertyValue("--public-header-height")).toBe("120px");
    headerHeight = 300;
    await act(async () => { resizeHeader([], {} as ResizeObserver); finishFonts(); await fontsReady; });
    expect(layout.style.getPropertyValue("--public-header-height")).toBe("120px");
  });

  it("does not observe or assign public spacing outside the public layout", () => {
    render(<CartProvider><SiteHeader /></CartProvider>);
    expect(observe).not.toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue("--public-header-height")).toBe("");
  });
});
