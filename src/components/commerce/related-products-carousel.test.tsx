import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RelatedProductsCarousel } from "./related-products-carousel";
import { testCanonicalProduct, testPricingContext, testPublicVariant } from "./storefront-test-fixtures";

const capturedCards: Array<{ pricing: unknown; priority: boolean | undefined }> = [];
vi.mock("./catalog-listing-card", () => ({
  CatalogListingCard: ({ product, priority, pricing }: { product: { name: string }; priority?: boolean; pricing: unknown }) => {
    capturedCards.push({ pricing, priority });
    return <article data-priority={String(priority)}>{product.name}</article>;
  },
}));

describe("RelatedProductsCarousel", () => {
  let originalScrollBy: PropertyDescriptor | undefined;
  let originalMatchMedia: PropertyDescriptor | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
    capturedCards.length = 0;
    if (originalScrollBy) Object.defineProperty(HTMLElement.prototype, "scrollBy", originalScrollBy);
    else Reflect.deleteProperty(HTMLElement.prototype, "scrollBy");
    if (originalMatchMedia) Object.defineProperty(window, "matchMedia", originalMatchMedia);
    else Reflect.deleteProperty(window, "matchMedia");
  });

  it("omits the section for an empty relationship slice", () => {
    render(<RelatedProductsCarousel currentProductId="current" products={[]} pricing={testPricingContext()} />);
    expect(screen.queryByRole("heading", { name: "Frequently Researched Together" })).toBeNull();
  });

  it("renders configured cards and scroll controls with reduced-motion behavior", async () => {
    const current = testCanonicalProduct([testPublicVariant({ id: "current-v" })], { id: "current", name: "Current Product" });
    const first = testCanonicalProduct([testPublicVariant()], { id: "related-a", name: "Related A" });
    const second = testCanonicalProduct([testPublicVariant({ id: "related-b-variant" })], { id: "related-b", name: "Related B" });
    const user = userEvent.setup();
    const pricing = testPricingContext();
    const scrollBy = vi.fn();
    originalScrollBy = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollBy");
    Object.defineProperty(HTMLElement.prototype, "scrollBy", { configurable: true, value: scrollBy });
    originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false })) });
    render(<RelatedProductsCarousel currentProductId="current" products={[second, current, first, second]} pricing={pricing} />);
    const list = screen.getByRole("list");
    Object.defineProperty(list, "clientWidth", { configurable: true, value: 640 });
    const next = screen.getByRole("button", { name: "Next related products" });
    const previous = screen.getByRole("button", { name: "Previous related products" });
    expect(list).toHaveClass("flex", "list-none", "gap-6", "overflow-x-auto", "overscroll-x-contain", "p-2", "scroll-px-2", "snap-x", "snap-proximity");
    expect(screen.getAllByRole("listitem")[0]).toHaveClass("flex", "w-[min(85vw,24rem)]", "shrink-0", "snap-start", "md:w-[min(45vw,24rem)]", "xl:w-[min(28vw,24rem)]");
    next.focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(next);
    expect(scrollBy).toHaveBeenCalledWith({ left: 640, behavior: "smooth" });
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getAllByRole("article").map((article) => article.textContent)).toEqual(["Related B", "Related A"]);
    expect(screen.getAllByRole("article")[0]).toHaveAttribute("data-priority", "false");
    expect(next).toHaveAttribute("aria-controls", list.id);
    expect(previous).toHaveAttribute("aria-controls", list.id);
    expect(capturedCards).toHaveLength(2);
    expect(capturedCards.every((card) => card.priority === false && card.pricing === pricing)).toBe(true);
    previous.focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(previous);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -640, behavior: "smooth" });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: true })) });
    await user.click(next);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 640, behavior: "auto" });
    Reflect.deleteProperty(window, "matchMedia");
    await user.click(next);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 640, behavior: "smooth" });
    expect((RelatedProductsCarousel as unknown as { toString(): string }).toString()).not.toMatch(/setTimeout|setInterval|autoplay|clone/iu);
  });
});
