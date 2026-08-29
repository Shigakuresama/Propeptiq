import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/account",
}));

import { AccountShell } from "./account-shell";

describe("AccountShell", () => {
  it("keeps overview and orders while exposing every owner growth destination", () => {
    render(
      <AccountShell localDriver={false}>
        <p>Owner content</p>
      </AccountShell>,
    );

    const navigation = screen.getByRole("navigation", { name: "Account" });
    const expectedLinks = [
      ["Overview", "/account"],
      ["Orders", "/account/orders"],
      ["Rewards", "/account/rewards"],
      ["Referrals", "/account/referrals"],
      ["Partner", "/account/partner"],
    ] as const;

    for (const [name, href] of expectedLinks) {
      expect(within(navigation).getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(within(navigation).getByRole("link", { name: "Checkout" })).toHaveAttribute(
      "href",
      "/checkout",
    );
    expect(navigation.closest("aside")).toHaveClass("hidden", "xl:block");
  });
});
