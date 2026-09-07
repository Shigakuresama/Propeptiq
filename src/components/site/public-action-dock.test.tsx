import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CartProvider } from "@/cart/cart-provider";
import { SiteSearchLauncher } from "@/components/search/site-search-launcher";
import { SiteHeader } from "./site-header";

vi.mock("next/navigation", () => ({ usePathname: () => "/catalog" }));

describe("PublicActionDock composition", () => {
  it("keeps one header search and one outside-main purchase slot through modal focus and dismissal", async () => {
    const user = userEvent.setup();
    const loadIndex = vi.fn(async () => ({ version: 1 as const, entries: [] }));
    const view = render(<CartProvider><div className="public-layout"><SiteHeader search={<SiteSearchLauncher loadIndex={loadIndex} />} /><main>Public content</main></div></CartProvider>);
    const trigger = screen.getByRole("button", { name: "Search PropeptIQ" });
    const dock = trigger.closest(".public-action-dock");
    expect(dock).not.toBeNull();
    expect(dock?.closest("main")).toBeNull();
    expect(dock?.closest("header")).toBe(screen.getByRole("banner"));
    expect(dock?.querySelector("#public-mobile-purchase-slot")).toBeEmptyDOMElement();
    expect(view.container.querySelectorAll(".public-action-dock")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Mobile purchase controls" })).toBeNull();
    expect(loadIndex).not.toHaveBeenCalled();
    await user.click(trigger);
    expect(await screen.findByRole("searchbox")).toHaveFocus();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(screen.getAllByRole("button", { name: "Search PropeptIQ" })).toHaveLength(1);
    expect(view.container.querySelectorAll("#public-mobile-purchase-slot")).toHaveLength(1);
  });
});
