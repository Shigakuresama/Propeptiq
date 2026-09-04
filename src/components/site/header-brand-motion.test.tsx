import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HeaderBrandMotion } from "./header-brand-motion";

type ObserverHarness = Readonly<{
  callback: IntersectionObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
}>;

const observers: ObserverHarness[] = [];
const mediaListeners = new Set<(event: MediaQueryListEvent) => void>();
let reducedMotion = false;
let visibilityState: DocumentVisibilityState = "visible";
let originalIntersectionObserver: PropertyDescriptor | undefined;
let originalMatchMedia: PropertyDescriptor | undefined;
let originalRequestAnimationFrame: PropertyDescriptor | undefined;
let originalVisibilityState: PropertyDescriptor | undefined;
let requestAnimationFrameSpy: ReturnType<typeof vi.fn>;
let removeMediaListener: ReturnType<typeof vi.fn>;

function installIntersectionObserver(): void {
  const Observer = vi.fn(function Observer(callback: IntersectionObserverCallback) {
    const harness: ObserverHarness = {
      callback,
      disconnect: vi.fn(),
      observe: vi.fn(),
    };
    observers.push(harness);
    return harness;
  });
  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    value: Observer,
  });
}

function installMatchMedia(): void {
  removeMediaListener = vi.fn((_: string, listener: (event: MediaQueryListEvent) => void) => {
    mediaListeners.delete(listener);
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
        mediaListeners.add(listener);
      },
      dispatchEvent: vi.fn(),
      matches: reducedMotion && query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      removeEventListener: removeMediaListener,
    })),
  });
}

function intersectionEntry(target: Element, isIntersecting: boolean): IntersectionObserverEntry {
  const bounds = target.getBoundingClientRect();
  return {
    boundingClientRect: bounds,
    intersectionRatio: isIntersecting ? 1 : 0,
    intersectionRect: isIntersecting ? bounds : new DOMRect(),
    isIntersecting,
    rootBounds: null,
    target,
    time: 0,
  };
}

beforeEach(() => {
  observers.length = 0;
  mediaListeners.clear();
  reducedMotion = false;
  visibilityState = "visible";
  originalIntersectionObserver = Object.getOwnPropertyDescriptor(window, "IntersectionObserver");
  originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
  originalRequestAnimationFrame = Object.getOwnPropertyDescriptor(window, "requestAnimationFrame");
  originalVisibilityState = Object.getOwnPropertyDescriptor(document, "visibilityState");
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibilityState,
  });
  requestAnimationFrameSpy = vi.fn();
  Object.defineProperty(window, "requestAnimationFrame", {
    configurable: true,
    value: requestAnimationFrameSpy,
  });
  installIntersectionObserver();
  installMatchMedia();
});

afterEach(() => {
  for (const [owner, key, descriptor] of [
    [window, "IntersectionObserver", originalIntersectionObserver],
    [window, "matchMedia", originalMatchMedia],
    [window, "requestAnimationFrame", originalRequestAnimationFrame],
    [document, "visibilityState", originalVisibilityState],
  ] as const) {
    if (descriptor) Object.defineProperty(owner, key, descriptor);
    else Reflect.deleteProperty(owner, key);
  }
  mediaListeners.clear();
});

describe("HeaderBrandMotion", () => {
  it("keeps the real logo content unchanged behind one inert decorative motif", () => {
    const { container } = render(
      <HeaderBrandMotion>
        <span>PROPEPTIQ LABS</span>
      </HeaderBrandMotion>,
    );

    expect(screen.getByText("PROPEPTIQ LABS")).toBeVisible();
    const wrapper = container.querySelector(".header-brand-motion");
    expect(wrapper).toHaveAttribute("data-motion-state", "paused");
    expect(wrapper?.querySelectorAll("svg")).toHaveLength(1);
    expect(wrapper?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(wrapper?.querySelector("svg")).toHaveAttribute("focusable", "false");
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
  });

  it("runs only while visible and intersecting, then pauses immediately on exit or hidden document", () => {
    const { container } = render(
      <HeaderBrandMotion>
        <span>Brand</span>
      </HeaderBrandMotion>,
    );
    const wrapper = container.querySelector<HTMLElement>(".header-brand-motion")!;
    const observer = observers[0]!;

    expect(observer.observe).toHaveBeenCalledWith(wrapper);
    expect(wrapper).toHaveAttribute("data-motion-state", "paused");

    act(() => observer.callback([intersectionEntry(wrapper, true)], observer as never));
    expect(wrapper).toHaveAttribute("data-motion-state", "running");

    visibilityState = "hidden";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(wrapper).toHaveAttribute("data-motion-state", "paused");

    visibilityState = "visible";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(wrapper).toHaveAttribute("data-motion-state", "running");

    act(() => observer.callback([intersectionEntry(wrapper, false)], observer as never));
    expect(wrapper).toHaveAttribute("data-motion-state", "paused");
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();
  });

  it("renders a static frame for reduced motion and responds to preference changes", () => {
    reducedMotion = true;
    const { container } = render(
      <HeaderBrandMotion>
        <span>Brand</span>
      </HeaderBrandMotion>,
    );
    const wrapper = container.querySelector<HTMLElement>(".header-brand-motion")!;

    expect(wrapper).toHaveAttribute("data-motion-state", "static");
    expect(requestAnimationFrameSpy).not.toHaveBeenCalled();

    reducedMotion = false;
    act(() => {
      for (const listener of mediaListeners) {
        listener({ matches: false } as MediaQueryListEvent);
      }
    });
    expect(wrapper).toHaveAttribute("data-motion-state", "paused");
  });

  it("disconnects its observer and removes every browser listener on unmount", () => {
    const removeVisibilityListener = vi.spyOn(document, "removeEventListener");
    const rendered = render(
      <HeaderBrandMotion>
        <span>Brand</span>
      </HeaderBrandMotion>,
    );
    const observer = observers[0]!;

    rendered.unmount();

    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(removeVisibilityListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    expect(removeMediaListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(mediaListeners).toHaveLength(0);
    removeVisibilityListener.mockRestore();
  });
});
