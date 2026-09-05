import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthPageFrame } from "./auth-page-frame";

describe("AuthPageFrame", () => {
  it.each([
    [
      "sign-in" as const,
      "Sign in",
      "/sign-in?returnTo=%2Faccount%2Forders%2Forder-1",
    ],
    [
      "sign-up" as const,
      "Create account",
      "/sign-up?returnTo=%2Faccount%2Forders%2Forder-1",
    ],
  ])("marks the %s route with the inverse semantic action", (kind, label, href) => {
    const { container } = render(
      <AuthPageFrame kind={kind} returnTo="/account/orders/order-1">
        <h1>Identity entry</h1>
      </AuthPageFrame>,
    );

    const active = screen.getByRole("link", { name: label });
    expect(active).toHaveAttribute("href", href);
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveClass("action-primary");
    expect(screen.getByRole("link", { name: "Return to cart" })).toHaveAttribute("href", "/cart");
    const home = screen.getByRole("link", { name: "PROPEPTIQ LABS home" });
    expect(home).toHaveAttribute("href", "/");
    expect(within(home).getByText("PROPEPTIQ")).toBeVisible();
    expect(within(home).getByText("LABS")).toBeVisible();
    expect(home.querySelector("img[alt='']")?.parentElement).toHaveClass("size-9", "sm:size-10");
    expect(home.querySelector(".brand-logo")).not.toHaveClass("w-24", "w-28");
    expect(home.querySelector(".brand-logo__wordmark")).toHaveClass("text-canvas");
    expect(screen.getByRole("main")).toHaveAttribute("data-motion-surface", "auth");
    const field = container.querySelector("[data-science-field='trace']");
    expect(field).toHaveAttribute("aria-hidden", "true");
  });
});
