import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("public home", () => {
  it("presents the approved research-only empty-catalog experience", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Research materials, governed by evidence.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("For legitimate laboratory and research use only."),
    ).toBeVisible();
    expect(screen.getByText("Not for human or veterinary use.")).toBeVisible();
    expect(
      screen.getByText("No research materials are currently approved for sale."),
    ).toBeVisible();

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
    expect(screen.queryByRole("link", { name: /cart|checkout/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /cart|checkout/i })).toBeNull();
  });
});
