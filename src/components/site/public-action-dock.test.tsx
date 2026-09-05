import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteSearchLauncher } from "@/components/search/site-search-launcher";

describe("PublicActionDock composition", () => {
  it("keeps one search trigger beside an empty outside-main mobile purchase slot", () => {
    const view = render(<div className="public-layout"><main>Public content</main><SiteSearchLauncher /></div>);
    const trigger = screen.getByRole("button", { name: "Search PropeptIQ" });
    const dock = trigger.closest(".public-action-dock");
    expect(dock).not.toBeNull();
    expect(dock?.closest("main")).toBeNull();
    expect(dock?.querySelector("#public-mobile-purchase-slot")).toBeEmptyDOMElement();
    expect(view.container.querySelectorAll(".site-search-launcher-lane")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Mobile purchase controls" })).toBeNull();
  });
});
