import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CartProvider } from "@/cart/cart-provider";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

const route = vi.hoisted(() => ({ pathname: "/catalog" }));

vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

describe("public shell growth navigation", () => {
  beforeEach(() => {
    route.pathname = "/catalog";
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("keeps the primary navigation focused and leaves Partner Program in the footer", () => {
    render(
      <CartProvider>
        <SiteHeader />
        <SiteFooter />
      </CartProvider>,
    );

    const primary = screen.getByRole("navigation", { name: "Primary" });
    expect(within(primary).getByRole("link", { name: "Catalog" })).toHaveAttribute(
      "href",
      "/catalog",
    );
    expect(
      within(primary).getByRole("link", { name: "Quality Records" }),
    ).toHaveAttribute("href", "/quality-records");
    expect(within(primary).getByRole("link", { name: "Research Use" })).toHaveAttribute(
      "href",
      "/research-use-policy",
    );
    expect(within(primary).getByRole("link", { name: "Rewards" })).toHaveAttribute(
      "href",
      "/rewards",
    );
    expect(within(primary).queryByRole("link", { name: "Partner Program" })).toBeNull();

    expect(screen.getByRole("link", { name: /^Cart,/ })).toHaveAttribute("href", "/cart");
    expect(screen.getByRole("link", { name: /^Cart,/ })).not.toHaveAttribute("aria-haspopup");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );

    const homeLinks = screen.getAllByRole("link", { name: "PROPEPTIQ LABS home" });
    expect(homeLinks).toHaveLength(2);
    expect(homeLinks[0]?.querySelector(".brand-logo")).not.toHaveClass("w-auto");
    expect(homeLinks[0]?.querySelector(".brand-logo__wordmark")).toHaveClass("text-ink");
    expect(homeLinks[1]?.querySelector(".brand-logo__wordmark")).toHaveClass("text-canvas");

    const footer = screen.getByRole("navigation", { name: "Footer" });
    expect(screen.getAllByRole("navigation", { name: "Footer" })).toHaveLength(1);
    const footerRestriction = screen.getByText(/Catalog names and package configurations come from owner-supplied records/iu);
    expect(footerRestriction).toHaveClass("text-base");
    expect(footerRestriction).not.toHaveClass("text-sm");
    expect(within(footer).getByRole("link", { name: "Partner Program" })).toHaveAttribute(
      "href",
      "/partners",
    );
    expect(within(footer).getByRole("link", { name: "Cart" })).toHaveAttribute(
      "href",
      "/cart",
    );
    expect(within(footer).getByRole("link", { name: "Order tracking" })).toHaveAttribute(
      "href",
      "/account/orders",
    );
    expect(
      within(footer).getByRole("link", { name: "Research Use Only" }),
    ).toHaveAttribute("href", "/research-use-policy");
    expect(within(footer).getByRole("link", { name: "FAQ" })).toHaveAttribute(
      "href",
      "/#faq",
    );
    expect(
      within(footer).queryByRole("link", { name: "Terms and Conditions" }),
    ).toBeNull();

    const social = screen.getByRole("region", { name: "Social media" });
    for (const label of ["Instagram", "TikTok", "X", "Facebook"]) {
      expect(within(social).getByRole("link", { name: label })).toHaveAttribute(
        "href",
        "/",
      );
    }
  });

  it("enhances only the opted-in public header Cart link into a drawer", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const OptedInHeader = SiteHeader as ComponentType<{ cartDrawer?: boolean }>;
    render(
      <CartProvider>
        <OptedInHeader cartDrawer />
      </CartProvider>,
    );

    const cartLink = screen.getByRole("link", { name: "Cart, 0 requested units" });
    expect(cartLink).toHaveAttribute("href", "/cart");
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(cartLink);

    expect(screen.getByRole("dialog", { name: "Your cart" })).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
