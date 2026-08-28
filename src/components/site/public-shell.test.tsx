import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CartProvider } from "@/cart/cart-provider";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

describe("public shell growth navigation", () => {
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
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );

    const footer = screen.getByRole("navigation", { name: "Footer" });
    expect(within(footer).getByRole("link", { name: "Partner Program" })).toHaveAttribute(
      "href",
      "/partners",
    );
  });
});
