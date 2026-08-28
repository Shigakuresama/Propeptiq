import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { browseCatalogProducts } from "@/catalog/browse-catalog";
import { PublicHome } from "@/components/site/public-home";

import { ProofRail } from "./proof-rail";

describe("public storefront semantics", () => {
  it("presents the owner-supplied catalog without inventing commerce facts", () => {
    render(<PublicHome products={browseCatalogProducts} variantCount={103} />);

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
    expect(screen.getByText("53")).toBeVisible();
    expect(screen.getByText("Tirzepatide")).toBeVisible();
    expect(
      screen.getByRole("link", { name: /view catalog item: tirzepatide/i }),
    ).toHaveAttribute("href", `/catalog/items/${browseCatalogProducts[0]!.slug}`);
    expect(document.body).not.toHaveTextContent(/server-provided prices/i);
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
