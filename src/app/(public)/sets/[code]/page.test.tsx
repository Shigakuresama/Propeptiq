import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CartProvider } from "@/cart/cart-provider";

const { loadPublicSharedSetMock } = vi.hoisted(() => ({
  loadPublicSharedSetMock: vi.fn(),
}));

vi.mock("@/growth/shared-set-server", () => ({
  loadPublicSharedSet: loadPublicSharedSetMock,
}));
vi.mock("@/components/site/page-transition", () => ({
  PageTransition: ({ children }: { children: ReactNode }) => (
    <div data-motion-surface="public">{children}</div>
  ),
}));

import SharedSetPage from "./page";

describe("public shared research set page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders only current server product facts, a truthful omission, and no checkout action", async () => {
    loadPublicSharedSetMock.mockResolvedValue({
      status: "available",
      set: {
        code: "set_Task5CPublicCode1",
        label: "Analytical reference set",
        items: [{
          productId: "product-a",
          quantity: 2,
          slug: "reference-a",
          name: "Reference A",
          packageForm: "sealed unit",
        }],
        omittedItemCount: 1,
        omissionNotice:
          "One saved product is no longer available in the current public catalog and was omitted.",
      },
    });

    const markup = renderToStaticMarkup(
      <CartProvider>
        {await SharedSetPage({
          params: Promise.resolve({ code: "set_Task5CPublicCode1" }),
        })}
      </CartProvider>,
    );

    expect(markup).toContain("Analytical reference set");
    expect(markup).toContain('data-motion-surface="public"');
    expect(markup).toContain("Reference A");
    expect(markup).toContain("One saved product is no longer available");
    expect(markup).toContain("Add set to cart");
    expect(markup).toMatch(/<article[^>]+aria-labelledby=/u);
    expect(markup.match(/<h1/gu)).toHaveLength(1);
    expect(markup).not.toMatch(/owner|email|price|discount|inventory|checkout/iu);
  });

  it("uses one non-enumerating unavailable view for malformed, missing, or inactive codes", async () => {
    loadPublicSharedSetMock.mockResolvedValue({ status: "unavailable" });

    const markup = renderToStaticMarkup(await SharedSetPage({
      params: Promise.resolve({ code: "set_UnknownOpaqueCode1" }),
    }));

    expect(markup).toContain("Research set unavailable");
    expect(markup).toContain('data-motion-surface="public"');
    expect(markup).not.toMatch(/missing|inactive|invalid|owner/iu);
  });
});
