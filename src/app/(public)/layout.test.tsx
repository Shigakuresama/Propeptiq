import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Winter30PromotionView } from "@/catalog/storefront-promotion-banner";

const { getStorefrontPromotionBannerViewMock, scrollRevealControllerMock, siteHeaderMock } = vi.hoisted(() => ({
  getStorefrontPromotionBannerViewMock: vi.fn(),
  scrollRevealControllerMock: vi.fn(() => null),
  siteHeaderMock: vi.fn((props: Readonly<{ cartDrawer?: boolean; search?: ReactNode }>) => {
    return <header>Site header{props.search}</header>;
  }),
}));

vi.mock("@/catalog/storefront-promotion-banner-server", () => ({
  getStorefrontPromotionBannerView: getStorefrontPromotionBannerViewMock,
}));
vi.mock("@/components/site/site-header", () => ({
  SiteHeader: siteHeaderMock,
}));
vi.mock("@/components/site/site-footer", () => ({
  SiteFooter: () => <footer>Site footer</footer>,
}));
vi.mock("@/components/site/scroll-reveal-controller", () => ({
  ScrollRevealController: scrollRevealControllerMock,
}));

import PublicLayout from "./layout";

const winter30 = Object.freeze({
  id: "winter30" as const,
  code: "WINTER30" as const,
  displayName: "Winter Sale" as const,
  percentage: 30 as const,
}) satisfies Winter30PromotionView;

describe("public layout promotion composition", () => {
  beforeEach(() => {
    getStorefrontPromotionBannerViewMock.mockReset();
    scrollRevealControllerMock.mockClear();
    siteHeaderMock.mockClear();
  });

  it("loads the safe view once and places the banner after the header and before main", async () => {
    getStorefrontPromotionBannerViewMock.mockResolvedValue(winter30);

    const { container } = render(
      await PublicLayout({ children: <p>Public content</p> as ReactNode }),
    );

    expect(getStorefrontPromotionBannerViewMock).toHaveBeenCalledOnce();
    expect(container.children).toHaveLength(1);
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    expect(root).toHaveClass("public-layout");
    expect([...root!.children].map((element) => element.tagName)).toEqual([
      "A",
      "HEADER",
      "ASIDE",
      "MAIN",
      "FOOTER",
    ]);
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("banner")).toHaveTextContent("Site header");
    expect(siteHeaderMock.mock.calls[0]?.[0]).toMatchObject({ cartDrawer: true });
    expect(screen.getByRole("complementary", { name: "Promotion" })).toHaveTextContent(
      "WINTER SALE: 30% OFF SITEWIDE",
    );
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("main")).toHaveTextContent("Public content");
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("Site footer");
    expect(footer.parentElement).toBe(root);
    expect(root!.lastElementChild).toBe(footer);
    const trigger = screen.getByRole("button", { name: "Search PropeptIQ" });
    expect(trigger).toBeVisible();
    expect(trigger.closest("header")).toBe(screen.getByRole("banner"));
    expect(trigger.closest("main")).toBeNull();
    expect(root!.querySelectorAll("#public-mobile-purchase-slot")).toHaveLength(1);
    expect(scrollRevealControllerMock).toHaveBeenCalledOnce();
    expect(root!.querySelectorAll("[data-scroll-reveal-controller]")).toHaveLength(0);
  });

  it("omits the banner and empty spacing when the safe server view is null", async () => {
    getStorefrontPromotionBannerViewMock.mockResolvedValue(null);

    const { container } = render(
      await PublicLayout({ children: <p>Information remains available</p> }),
    );

    expect(getStorefrontPromotionBannerViewMock).toHaveBeenCalledOnce();
    expect(container.children).toHaveLength(1);
    const root = container.firstElementChild;
    expect(root).toHaveClass("public-layout");
    expect([...root!.children].map((element) => element.tagName)).toEqual([
      "A",
      "HEADER",
      "MAIN",
      "FOOTER",
    ]);
    expect(screen.queryByRole("complementary", { name: "Promotion" })).toBeNull();
    expect(screen.queryByText(/WINTER30/u)).toBeNull();
    expect(screen.getByRole("main")).toHaveTextContent("Information remains available");
    expect(root!.lastElementChild).toBe(screen.getByRole("contentinfo"));
    expect(screen.getByRole("button", { name: "Search PropeptIQ" }).closest("header")).toBe(screen.getByRole("banner"));
    expect(scrollRevealControllerMock).toHaveBeenCalledOnce();
  });

  it("renders the unchanged public shell with no fabricated fallback after acquisition failure", async () => {
    // The safe adapter converts synchronous/rejected loader failures to null.
    getStorefrontPromotionBannerViewMock.mockResolvedValue(null);

    render(await PublicLayout({ children: <h1>Research policy</h1> }));

    expect(screen.getByRole("link", { name: "Skip to main content" })).toBeVisible();
    expect(screen.getByRole("banner")).toBeVisible();
    expect(screen.getByRole("main")).toHaveTextContent("Research policy");
    expect(screen.getByRole("contentinfo")).toBeVisible();
    expect(screen.getByRole("button", { name: "Search PropeptIQ" })).toBeVisible();
    expect(screen.queryByText(/WINTER SALE|WINTER30/iu)).toBeNull();
  });

  it("does not load the search index while rendering the async public layout", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    getStorefrontPromotionBannerViewMock.mockResolvedValue(null);
    try {
      render(await PublicLayout({ children: <p>Lazy search content</p> }));
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

});
