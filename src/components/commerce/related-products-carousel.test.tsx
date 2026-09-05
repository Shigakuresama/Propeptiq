import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RelatedProductsCarousel } from "./related-products-carousel";
import { testCanonicalProduct, testPricingContext, testPublicVariant } from "./storefront-test-fixtures";

const capturedCards: Array<{ headingLevel: number | undefined; pricing: unknown; priority: boolean | undefined }> = [];
vi.mock("./catalog-listing-card", () => ({
  CatalogListingCard: ({ headingLevel, product, priority, pricing }: { headingLevel?: number; product: { name: string }; priority?: boolean; pricing: unknown }) => {
    capturedCards.push({ headingLevel, pricing, priority });
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
    expect(screen.queryByRole("heading", { name: "Related Products" })).toBeNull();
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
    const region = screen.getByRole("region", { name: "Related Products" });
    Object.defineProperty(list, "clientWidth", { configurable: true, value: 640 });
    Object.defineProperty(list, "scrollWidth", { configurable: true, value: 1280 });
    fireEvent.scroll(list);
    const next = screen.getByRole("button", { name: "Next related products" });
    const previous = screen.getByRole("button", { name: "Previous related products" });
    expect(region).toHaveAttribute("aria-roledescription", "carousel");
    expect(screen.getByText("Related catalog")).toBeVisible();
    expect(screen.getByText("Explore more products in this category.")).toBeVisible();
    expect(screen.getByText("2 items")).toBeVisible();
    expect(list).toHaveAttribute("aria-label", "Related products, 2 items");
    expect(list).toHaveAttribute("tabindex", "0");
    expect(list).toHaveClass("flex", "list-none", "gap-4", "overflow-x-auto", "overscroll-x-contain", "scroll-px-2", "snap-x", "snap-mandatory");
    expect(screen.getAllByRole("listitem")[0]).toHaveClass("flex", "w-[min(82vw,20rem)]", "shrink-0", "snap-start", "sm:w-[19rem]", "lg:w-[20rem]");
    next.focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(next);
    expect(scrollBy).toHaveBeenCalledWith({ left: 640, behavior: "smooth" });
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getAllByRole("article").map((article) => article.textContent)).toEqual(["Related B", "Related A"]);
    expect(screen.getAllByRole("article")[0]).toHaveAttribute("data-priority", "false");
    expect(next).toHaveAttribute("aria-controls", list.id);
    expect(previous).toHaveAttribute("aria-controls", list.id);
    expect(next).toHaveAttribute("title", "Next related products");
    expect(previous).toHaveAttribute("title", "Previous related products");
    expect(capturedCards.every((card) => card.headingLevel === 3 && card.priority === false && card.pricing === pricing)).toBe(true);
    expect(previous).toBeDisabled();
    list.scrollLeft = 640;
    fireEvent.scroll(list);
    expect(next).toBeDisabled();
    expect(previous).toBeEnabled();
    previous.focus();
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(previous);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -640, behavior: "smooth" });
    list.scrollLeft = 0;
    fireEvent.scroll(list);
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: true })) });
    await user.click(next);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 640, behavior: "auto" });
    Reflect.deleteProperty(window, "matchMedia");
    await user.click(next);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 640, behavior: "smooth" });
    expect((RelatedProductsCarousel as unknown as { toString(): string }).toString()).not.toMatch(/setTimeout|setInterval|autoplay|clone/iu);
  });

  it("disables both controls when all cards fit, and updates after layout and touch scrolling", async () => {
    const first = testCanonicalProduct([testPublicVariant()], { id: "related-a" });
    const second = testCanonicalProduct([testPublicVariant()], { id: "related-b" });
    render(<RelatedProductsCarousel currentProductId="current" products={[first, second]} pricing={testPricingContext()} />);
    const list = screen.getByRole("list");
    const next = screen.getByRole("button", { name: "Next related products" });
    const previous = screen.getByRole("button", { name: "Previous related products" });
    Object.defineProperty(list, "clientWidth", { configurable: true, value: 800 });
    Object.defineProperty(list, "scrollWidth", { configurable: true, value: 800 });
    fireEvent.scroll(list);
    expect(previous).toBeDisabled();
    expect(next).toBeDisabled();

    Object.defineProperty(list, "clientWidth", { configurable: true, value: 400 });
    act(() => window.dispatchEvent(new Event("resize")));
    await waitFor(() => expect(next).toBeEnabled());
    list.scrollLeft = 400;
    fireEvent.scroll(list);
    expect(next).toBeDisabled();
    expect(previous).toBeEnabled();
  });

  it("allows list arrow navigation without capturing keys from child purchase controls", () => {
    const first = testCanonicalProduct([testPublicVariant()], { id: "related-a" });
    const second = testCanonicalProduct([testPublicVariant()], { id: "related-b" });
    const scrollBy = vi.fn();
    originalScrollBy = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollBy");
    Object.defineProperty(HTMLElement.prototype, "scrollBy", { configurable: true, value: scrollBy });
    render(<RelatedProductsCarousel currentProductId="current" products={[first, second]} pricing={testPricingContext()} />);
    const list = screen.getByRole("list");
    Object.defineProperty(list, "clientWidth", { configurable: true, value: 400 });
    Object.defineProperty(list, "scrollWidth", { configurable: true, value: 800 });
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(scrollBy).toHaveBeenCalledWith({ left: 400, behavior: "smooth" });
    fireEvent.keyDown(screen.getAllByRole("article")[0]!, { key: "ArrowLeft" });
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });

  it("omits no-op navigation controls when only one related item is available", () => {
    const only = testCanonicalProduct([testPublicVariant()], { id: "related-only", name: "Related Only" });
    render(<RelatedProductsCarousel currentProductId="current" products={[only]} pricing={testPricingContext()} />);

    expect(screen.getByRole("region", { name: "Related Products" })).toBeVisible();
    expect(screen.getByText("1 item")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Previous related products" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next related products" })).toBeNull();
  });

  it("assigns a unique list target to each carousel instance", () => {
    const first = testCanonicalProduct([testPublicVariant()], { id: "related-a", name: "Related A" });
    const second = testCanonicalProduct([testPublicVariant({ id: "related-b-variant" })], { id: "related-b", name: "Related B" });

    render(
      <>
        <RelatedProductsCarousel currentProductId="current-a" products={[first, second]} pricing={testPricingContext()} />
        <RelatedProductsCarousel currentProductId="current-b" products={[second, first]} pricing={testPricingContext()} />
      </>,
    );

    const lists = screen.getAllByRole("list");
    const nextButtons = screen.getAllByRole("button", { name: "Next related products" });
    const firstList = lists[0]!;
    const secondList = lists[1]!;
    expect(firstList.id).not.toBe(secondList.id);
    expect(nextButtons[0]).toHaveAttribute("aria-controls", firstList.id);
    expect(nextButtons[1]).toHaveAttribute("aria-controls", secondList.id);
  });
});
