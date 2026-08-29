import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
      ["Research sets", "/research-sets"],
      ["Cart", "/cart"],
      ["Checkout", "/checkout"],
    ] as const;

    for (const [name, href] of expectedLinks) {
      expect(within(navigation).getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(navigation.closest("aside")).toHaveClass("hidden", "xl:block");
  });

  it("keeps every account and commerce destination in the through-1024 sheet", async () => {
    const user = userEvent.setup();
    render(
      <AccountShell localDriver={false}>
        <p>Owner content</p>
      </AccountShell>,
    );

    const trigger = screen.getByRole("button", { name: "Open account navigation" });
    expect(trigger).toHaveClass("size-11", "xl:hidden");
    await user.click(trigger);
    const navigation = await screen.findByRole("navigation", { name: "Mobile account" });
    for (const [name, href] of [
      ["Overview", "/account"],
      ["Orders", "/account/orders"],
      ["Rewards", "/account/rewards"],
      ["Referrals", "/account/referrals"],
      ["Partner", "/account/partner"],
      ["Research sets", "/research-sets"],
      ["Cart", "/cart"],
      ["Checkout", "/checkout"],
    ] as const) {
      const link = within(navigation).getByRole("link", { name });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveClass("shell-nav-link");
    }
  });
});
