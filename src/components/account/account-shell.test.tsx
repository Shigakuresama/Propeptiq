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
    const home = screen.getByRole("link", { name: "PROPEPTIQ LABS home" });
    expect(home).toHaveAttribute("href", "/");
    expect(within(home).getByText("PROPEPTIQ")).toBeVisible();
    expect(within(home).getByText("LABS")).toBeVisible();
    expect(home.querySelector("img[alt='']")?.parentElement).toHaveClass("size-9", "sm:size-10");
    expect(home.querySelector(".brand-logo")).not.toHaveClass("w-24", "w-28");
    expect(home.querySelector(".brand-logo__wordmark")).toHaveClass("text-canvas");
    expect(screen.getByText("Private records", { exact: true })).toBeVisible();
    expect(navigation.closest("aside")).toHaveClass("hidden", "xl:block");
    expect(screen.getByText("Owner content").closest("[data-motion-surface]"))
      .toHaveAttribute("data-motion-surface", "private");
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

  it("shows managed sign-out only when managed authentication is enabled", () => {
    const { rerender } = render(
      <AccountShell authEnabled localDriver={false}>
        <p>Owner content</p>
      </AccountShell>,
    );

    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();

    rerender(
      <AccountShell localDriver={false}>
        <p>Owner content</p>
      </AccountShell>,
    );
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });
});
