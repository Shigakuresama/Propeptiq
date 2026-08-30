import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/catalog" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

import { ShellNavLink } from "./shell-nav-link";

describe("ShellNavLink", () => {
  beforeEach(() => {
    navigation.pathname = "/catalog";
  });

  it("marks exact and nested destinations as the current page", () => {
    const { rerender } = render(<ShellNavLink href="/catalog">Catalog</ShellNavLink>);
    expect(screen.getByRole("link", { name: "Catalog" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    navigation.pathname = "/catalog/items/tirzepatide";
    rerender(<ShellNavLink href="/catalog">Catalog</ShellNavLink>);
    expect(screen.getByRole("link", { name: "Catalog" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps the account overview exact so child routes can identify themselves", () => {
    navigation.pathname = "/account/orders";
    render(<ShellNavLink href="/account">Overview</ShellNavLink>);
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("forwards refs and injected handlers for composition primitives", async () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLAnchorElement>();

    render(
      <ShellNavLink href="/catalog" onClick={onClick} ref={ref}>
        Catalog
      </ShellNavLink>,
    );

    await userEvent.click(screen.getByRole("link", { name: "Catalog" }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(ref.current).toBe(screen.getByRole("link", { name: "Catalog" }));
  });
});
