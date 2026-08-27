import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PublicCatalog } from "@/catalog/types";
import { PublicHome } from "@/components/site/public-home";

import { ProofRail } from "./proof-rail";

const emptyCatalog: PublicCatalog = {
  source: "production",
  products: [],
  promotions: [],
  qualityRecords: [],
};

describe("public storefront semantics", () => {
  it("presents research-use positioning with public catalog and cart actions", () => {
    render(<PublicHome catalog={emptyCatalog} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Research materials, documented for laboratory work.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("For legitimate laboratory and research use only."),
    ).toBeVisible();
    expect(screen.getByText("Not for human or veterinary use.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Browse catalog" })).toHaveAttribute(
      "href",
      "/catalog",
    );
    expect(screen.getByRole("link", { name: "View cart" })).toHaveAttribute(
      "href",
      "/cart",
    );
    expect(
      screen.getByText("No active catalog records are currently available."),
    ).toBeVisible();
    expect(screen.queryByText(/apply|researcher approval/i)).toBeNull();
  });

  it("renders exactly one ordered four-node Proof Rail in the required order", () => {
    render(<ProofRail />);

    const rail = screen.getByRole("list", { name: "Evidence relationship" });
    const stages = within(rail)
      .getAllByRole("listitem")
      .map((item) => within(item).getByRole("heading", { level: 3 }).textContent);

    expect(stages).toEqual([
      "Material identity",
      "Analytical method",
      "Lot/batch",
      "COA state",
    ]);
    expect(screen.getAllByRole("list", { name: "Evidence relationship" })).toHaveLength(1);
    expect(within(rail).getAllByRole("listitem")).toHaveLength(4);
    for (const item of within(rail).getAllByRole("listitem")) {
      expect(within(item).getByText("No approved public record")).toBeVisible();
    }
  });
});
