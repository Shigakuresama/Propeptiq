import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));

import { resourceBySlug } from "@/admin/access";

import { AdminShell } from "./admin-shell";

describe("Task 8A administration navigation", () => {
  it("keeps capability-scoped growth resources and Account access in the narrow Sheet", async () => {
    const loyalty = resourceBySlug("loyalty-policies");
    const payouts = resourceBySlug("payouts");
    expect(loyalty).not.toBeNull();
    expect(payouts).not.toBeNull();
    if (!loyalty || !payouts) return;

    render(<AdminShell resources={[loyalty, payouts]}><p>Growth administration</p></AdminShell>);
    const home = screen.getByRole("link", { name: "PROPEPTIQ LABS administration home" });
    expect(home.querySelector("img[alt='']")?.parentElement).toHaveClass("w-24");
    expect(screen.getByText("Admin operations", { exact: true })).toBeVisible();
    expect(screen.getByText("Growth administration").closest("[data-motion-surface]"))
      .toHaveAttribute("data-motion-surface", "admin");

    await userEvent.click(screen.getByRole("button", { name: "Open administration navigation" }));

    const mobileNavigation = screen.getByRole("navigation", { name: "Mobile administration" });
    expect(within(mobileNavigation).getByRole("link", { name: "Loyalty policies" })).toHaveAttribute(
      "href",
      "/admin/loyalty-policies",
    );
    expect(within(mobileNavigation).getByRole("link", { name: "Affiliate payouts" })).toHaveAttribute(
      "href",
      "/admin/payouts",
    );
    expect(within(mobileNavigation).getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/account",
    );
  });
});
