import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthPageFrame } from "./auth-page-frame";

describe("AuthPageFrame", () => {
  it.each([
    ["sign-in" as const, "Sign in", "/sign-in"],
    ["sign-up" as const, "Create account", "/sign-up"],
  ])("marks the %s route with the inverse semantic action", (kind, label, href) => {
    render(
      <AuthPageFrame kind={kind}>
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
    expect(home.querySelector("img[alt='']")?.parentElement).toHaveClass("w-28");
  });
});
