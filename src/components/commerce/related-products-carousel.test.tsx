import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RelatedProductsCarousel } from "./related-products-carousel";
import { testCanonicalProduct, testPricingContext, testPublicVariant } from "./storefront-test-fixtures";

vi.mock("./catalog-listing-card", () => ({
  CatalogListingCard: ({ product, priority, pricing }: { product: { name: string }; priority?: boolean; pricing: unknown }) => (
    <article data-priority={String(priority)} data-pricing={String(pricing)}>{product.name}</article>
  ),
}));

describe("RelatedProductsCarousel", () => {
  let originalScrollBy: PropertyDescriptor | undefined;
  let originalMatchMedia: PropertyDescriptor | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalScrollBy) Object.defineProperty(HTMLElement.prototype, "scrollBy", originalScrollBy);
    else delete (HTMLElement.prototype as HTMLElement & { scrollBy?: unknown }).scrollBy;
    if (originalMatchMedia) Object.defineProperty(window, "matchMedia", originalMatchMedia);
    else delete (window as Window & { matchMedia?: unknown }).matchMedia;
  });

  it("omits the section for an empty relationship slice", () => {
    render(<RelatedProductsCarousel currentProductId="current" products={[]} pricing={testPricingContext()} />);
    expect(screen.queryByRole("heading", { name: "Frequently Researched Together" })).toBeNull();
  });

  it("renders configured cards and scroll controls with reduced-motion behavior", async () => {
    const first = testCanonicalProduct([testPublicVariant()], { id: "related-a", name: "Related A" });
    const second = testCanonicalProduct([testPublicVariant({ id: "related-b-variant" })], { id: "related-b", name: "Related B" });
    const user = userEvent.setup();
    const scrollBy = vi.fn();
    originalScrollBy = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollBy");
    Object.defineProperty(HTMLElement.prototype, "scrollBy", { configurable: true, value: scrollBy });
    originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false })) });
    render(<RelatedProductsCarousel currentProductId="current" products={[first, second]} pricing={testPricingContext()} />);
    const list = screen.getByRole("list");
    Object.defineProperty(list, "clientWidth", { configurable: true, value: 640 });
    const next = screen.getByRole("button", { name: "Next related products" });
    await user.click(next);
    expect(scrollBy).toHaveBeenCalledWith({ left: 640, behavior: "smooth" });
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getAllByRole("article")[0]).toHaveAttribute("data-priority", "false");
    expect(next).toHaveAttribute("aria-controls", list.id);
  });
});
