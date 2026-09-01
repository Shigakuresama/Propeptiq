import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pathnameState } = vi.hoisted(() => ({
  pathnameState: { value: "/" },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameState.value,
}));

import { ScrollRevealController } from "./scroll-reveal-controller";

type ObserverHarness = Readonly<{
  callback: IntersectionObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
  options: IntersectionObserverInit | undefined;
  unobserve: ReturnType<typeof vi.fn>;
}>;

const observers: ObserverHarness[] = [];
let reducedMotion = false;
let originalIntersectionObserver: PropertyDescriptor | undefined;
let originalMatchMedia: PropertyDescriptor | undefined;
let rectSpy: ReturnType<typeof vi.spyOn> | undefined;

function rect(top: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left: 0,
    right: 320,
    top,
    width: 320,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

function installBrowserGeometry(): void {
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 600,
  });
  rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect")
    .mockImplementation(function getFixtureRectangle(this: Element) {
      const element = this as HTMLElement;
      return rect(
        Number(element.dataset.fixtureTop ?? 0),
        Number(element.dataset.fixtureHeight ?? 120),
      );
    });
}

function installIntersectionObserver(): void {
  const Observer = vi.fn(function Observer(
    callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    const harness: ObserverHarness = {
      callback,
      disconnect: vi.fn(),
      observe: vi.fn(),
      options,
      unobserve: vi.fn(),
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
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: reducedMotion && query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

function entry(target: Element, isIntersecting: boolean): IntersectionObserverEntry {
  return {
    boundingClientRect: target.getBoundingClientRect(),
    intersectionRatio: isIntersecting ? 1 : 0,
    intersectionRect: isIntersecting ? target.getBoundingClientRect() : rect(0, 0),
    isIntersecting,
    rootBounds: null,
    target,
    time: 0,
  };
}

function PublicFixture({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="public-layout">
      <main>{children}</main>
      <ScrollRevealController />
    </div>
  );
}

beforeEach(() => {
  pathnameState.value = "/";
  reducedMotion = false;
  observers.length = 0;
  window.history.replaceState({}, "", "/");
  originalIntersectionObserver = Object.getOwnPropertyDescriptor(
    window,
    "IntersectionObserver",
  );
  originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
  installBrowserGeometry();
  installIntersectionObserver();
  installMatchMedia();
});

afterEach(() => {
  rectSpy?.mockRestore();
  rectSpy = undefined;
  if (originalIntersectionObserver) {
    Object.defineProperty(window, "IntersectionObserver", originalIntersectionObserver);
  } else {
    Reflect.deleteProperty(window, "IntersectionObserver");
  }
  if (originalMatchMedia) {
    Object.defineProperty(window, "matchMedia", originalMatchMedia);
  } else {
    Reflect.deleteProperty(window, "matchMedia");
  }
  window.history.replaceState({}, "", "/");
});

describe("ScrollRevealController progressive behavior", () => {
  it("renders no controller DOM and leaves source sections visible in server markup", () => {
    const markup = renderToStaticMarkup(
      <PublicFixture>
        <section>Essential source content</section>
      </PublicFixture>,
    );

    expect(markup).toContain("Essential source content");
    expect(markup).not.toContain("data-scroll-reveal-state");

    const { container } = render(<ScrollRevealController />);
    expect(container).toBeEmptyDOMElement();
  });

  it("uses one shared observer for eligible top-level sections and leaves nested sections untouched", () => {
    const { getByTestId } = render(
      <PublicFixture>
        <section data-fixture-top="720" data-testid="first">
          First
          <section data-fixture-top="760" data-testid="nested">Nested</section>
        </section>
        <section data-fixture-top="980" data-testid="second">Second</section>
      </PublicFixture>,
    );

    const first = getByTestId("first");
    const nested = getByTestId("nested");
    const second = getByTestId("second");
    expect(observers).toHaveLength(1);
    expect(observers[0]?.options).toEqual({
      root: null,
      rootMargin: "0px 0px -8% 0px",
      threshold: 0.08,
    });
    expect(observers[0]?.observe.mock.calls.map(([target]) => target)).toEqual([
      first,
      second,
    ]);
    expect(first).toHaveAttribute("data-scroll-reveal-state", "pending");
    expect(second).toHaveAttribute("data-scroll-reveal-state", "pending");
    expect(nested).not.toHaveAttribute("data-scroll-reveal-state");
  });

  it("never hides sections that are above, partially visible, or reached before hydration", () => {
    const { getByTestId } = render(
      <PublicFixture>
        <section data-fixture-top="-900" data-testid="above">Above</section>
        <section data-fixture-top="-40" data-testid="partial-top">Partial top</section>
        <section data-fixture-top="520" data-fixture-height="300" data-testid="partial-bottom">
          Partial bottom
        </section>
      </PublicFixture>,
    );

    expect(observers).toHaveLength(0);
    for (const testId of ["above", "partial-top", "partial-bottom"]) {
      expect(getByTestId(testId)).toHaveAttribute("data-scroll-reveal-state", "visible");
    }
  });

  it("reveals on first intersection, unobserves once, and never replays on reverse movement", () => {
    const { getByTestId } = render(
      <PublicFixture>
        <section data-fixture-top="800" data-testid="target">Target</section>
      </PublicFixture>,
    );
    const target = getByTestId("target");
    const observer = observers[0]!;

    act(() => observer.callback([entry(target, true)], observer as never));
    expect(target).toHaveAttribute("data-scroll-reveal-state", "visible");
    expect(observer.unobserve).toHaveBeenCalledOnce();
    expect(observer.unobserve).toHaveBeenCalledWith(target);

    act(() => observer.callback([entry(target, false)], observer as never));
    expect(target).toHaveAttribute("data-scroll-reveal-state", "visible");
    expect(observer.observe).toHaveBeenCalledOnce();
    expect(observer.unobserve).toHaveBeenCalledOnce();
  });

  it("keeps all sections visible without observing for reduced motion or a missing observer", () => {
    reducedMotion = true;
    const reduced = render(
      <PublicFixture>
        <section data-fixture-top="900" data-testid="reduced">Reduced</section>
      </PublicFixture>,
    );
    expect(reduced.getByTestId("reduced")).toHaveAttribute(
      "data-scroll-reveal-state",
      "visible",
    );
    expect(observers).toHaveLength(0);
    reduced.unmount();

    reducedMotion = false;
    Reflect.deleteProperty(window, "IntersectionObserver");
    const missing = render(
      <PublicFixture>
        <section data-fixture-top="900" data-testid="missing">Missing</section>
      </PublicFixture>,
    );
    expect(missing.getByTestId("missing")).toHaveAttribute(
      "data-scroll-reveal-state",
      "visible",
    );
    expect(observers).toHaveLength(0);
  });

  it("reveals a pending section on focus without moving focus", () => {
    const { getByRole, getByTestId } = render(
      <PublicFixture>
        <section data-fixture-top="900" data-testid="focus-section">
          <button type="button">Focus target</button>
        </section>
      </PublicFixture>,
    );
    const section = getByTestId("focus-section");
    const button = getByRole("button", { name: "Focus target" });

    button.focus();

    expect(button).toHaveFocus();
    expect(section).toHaveAttribute("data-scroll-reveal-state", "visible");
    expect(observers[0]?.unobserve).toHaveBeenCalledWith(section);
  });

  it("reveals only the pending section containing the exact current fragment target", () => {
    window.history.replaceState({}, "", "/#exact-target");
    const { getByTestId } = render(
      <PublicFixture>
        <section data-fixture-top="800" data-testid="fragment-section">
          <h2 id="exact-target">Exact target</h2>
        </section>
        <section data-fixture-top="980" data-testid="other-section">
          <h2 id="other-target">Other target</h2>
        </section>
      </PublicFixture>,
    );

    expect(getByTestId("fragment-section")).toHaveAttribute(
      "data-scroll-reveal-state",
      "visible",
    );
    expect(getByTestId("other-section")).toHaveAttribute(
      "data-scroll-reveal-state",
      "pending",
    );
    expect(observers[0]?.observe).toHaveBeenCalledTimes(1);
    expect(observers[0]?.observe).toHaveBeenCalledWith(getByTestId("other-section"));
  });

  it("responds to a later exact hash target without moving focus", () => {
    const { getByTestId } = render(
      <PublicFixture>
        <section data-fixture-top="900" data-testid="hash-section">
          <h2 id="later-target">Later target</h2>
        </section>
      </PublicFixture>,
    );
    const section = getByTestId("hash-section");

    window.history.pushState({}, "", "/#later-target");
    act(() => window.dispatchEvent(new HashChangeEvent("hashchange")));

    expect(section).toHaveAttribute("data-scroll-reveal-state", "visible");
    expect(observers[0]?.unobserve).toHaveBeenCalledWith(section);
    expect(document.activeElement).toBe(document.body);
  });

  it("disconnects route listeners, reveals old pending nodes, and rescans on pathname changes", () => {
    const documentAddSpy = vi.spyOn(document, "addEventListener");
    const documentRemoveSpy = vi.spyOn(document, "removeEventListener");
    const windowAddSpy = vi.spyOn(window, "addEventListener");
    const windowRemoveSpy = vi.spyOn(window, "removeEventListener");
    const view = render(
      <PublicFixture>
        <section data-fixture-top="900" data-testid="old-section" key="old">Old</section>
      </PublicFixture>,
    );
    const oldSection = view.getByTestId("old-section");
    const oldObserver = observers[0]!;
    const focusHandler = documentAddSpy.mock.calls.find(([name]) => name === "focusin")?.[1];
    const hashHandler = windowAddSpy.mock.calls.find(([name]) => name === "hashchange")?.[1];
    expect(focusHandler).toEqual(expect.any(Function));
    expect(hashHandler).toEqual(expect.any(Function));

    pathnameState.value = "/quality-records";
    view.rerender(
      <PublicFixture>
        <section data-fixture-top="880" data-testid="new-section" key="new">New</section>
      </PublicFixture>,
    );

    expect(oldObserver.disconnect).toHaveBeenCalledOnce();
    expect(oldSection).toHaveAttribute("data-scroll-reveal-state", "visible");
    expect(documentRemoveSpy).toHaveBeenCalledWith("focusin", focusHandler);
    expect(windowRemoveSpy).toHaveBeenCalledWith("hashchange", hashHandler);
    expect(observers).toHaveLength(2);
    expect(view.getByTestId("new-section")).toHaveAttribute(
      "data-scroll-reveal-state",
      "pending",
    );

    pathnameState.value = "/cart";
    view.rerender(<PublicFixture><p>No sections</p></PublicFixture>);
    expect(observers[1]?.disconnect).toHaveBeenCalledOnce();
    expect(observers).toHaveLength(2);
  });

  it("uses no replay, polling, scrolling, mutation, persistence, focus, or content-authority APIs", () => {
    const contents = readFileSync(
      resolve(process.cwd(), "src/components/site/scroll-reveal-controller.tsx"),
      "utf8",
    );

    expect(contents).not.toMatch(
      /setTimeout|setInterval|requestAnimationFrame|MutationObserver|localStorage|sessionStorage|scroll(?:To|By|IntoView)|\.focus\(|setAttribute\(["'](?:aria-|tabindex)/u,
    );
    expect(contents).not.toMatch(
      /@\/(?:content|catalog|cart|commerce|newsletter|config|env|db)|stripe|provider/iu,
    );
    expect(contents.match(/new IntersectionObserver/gu)).toHaveLength(1);
  });
});

describe("scroll reveal CSS", () => {
  it("uses only a short composited transition in the public main and forces a visible reduced-motion fallback", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(
      /\.public-layout main section\[data-scroll-reveal-state\]\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*translateY\(0\);[^}]*transition:\s*opacity 280ms ease-out,\s*transform 280ms ease-out;[^}]*\}/su,
    );
    expect(css).toMatch(
      /\.public-layout main section\[data-scroll-reveal-state="pending"\]\s*\{[^}]*opacity:\s*0;[^}]*transform:\s*translateY\(0\.625rem\);[^}]*\}/su,
    );
    expect(css).not.toMatch(
      /section\[data-scroll-reveal-state[^}]*\b(?:height|margin|padding|position|will-change|transition-delay)\s*:/su,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.public-layout main section\[data-scroll-reveal-state\]\s*\{[^}]*opacity:\s*1\s*!important;[^}]*transform:\s*none\s*!important;[^}]*transition-duration:\s*0s\s*!important;/u,
    );
  });
});
