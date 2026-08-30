import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { browseCatalogProducts } from "@/catalog/browse-catalog";

import { CatalogExplorer } from "./catalog-explorer";

describe("CatalogExplorer", () => {
  it("provides labeled search and exact source-name, code, and package-unit filters", () => {
    render(<CatalogExplorer products={browseCatalogProducts} />);

    expect(screen.getByRole("searchbox", { name: "Search catalog" })).toBeVisible();
    const sourceFilter = screen.getByRole("combobox", { name: "Source name" });
    expect(within(sourceFilter).getAllByRole("option")).toHaveLength(57);
    expect(screen.getByRole("combobox", { name: "Source code" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Package unit" })).toBeVisible();
    expect(screen.getByText("56 of 56 families")).toBeVisible();
    expect(screen.getByText("103 configurations represented")).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(56);
  });

  it("finds source ambiguities without changing the immutable catalog rows", () => {
    const snapshot = JSON.stringify(browseCatalogProducts);
    render(<CatalogExplorer products={browseCatalogProducts} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Source code" }), {
      target: { value: "LPC" },
    });

    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "LI PO-C" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "LI PO-C without B12" })).toBeVisible();
    expect(JSON.stringify(browseCatalogProducts)).toBe(snapshot);
  });

  it("searches exact source facts and reports an accessible empty result", () => {
    render(<CatalogExplorer products={browseCatalogProducts} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search catalog" }), {
      target: { value: "PN5" },
    });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Pinealon" })).toBeVisible();
    expect(screen.getByText("1 configuration represented")).toBeVisible();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search catalog" }), {
      target: { value: "not-a-source-record" },
    });
    expect(screen.getByText("No catalog records match these filters.")).toBeVisible();
    const reset = screen.getAllByRole("button", { name: "Clear filters" });
    expect(reset).toHaveLength(1);

    fireEvent.click(reset[0]!);

    expect(screen.getByText("56 of 56 families")).toBeVisible();
    expect(screen.getByText("103 configurations represented")).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(56);
    expect(screen.getByRole("searchbox", { name: "Search catalog" })).toHaveValue("");
  });

  it("filters a distinct exact source Name to its one matching card", () => {
    render(<CatalogExplorer products={browseCatalogProducts} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Source name" }), {
      target: { value: "BPC 10mg + TB 10mg" },
    });

    const card = screen.getByRole("article");
    expect(within(card).getByRole("heading", { name: "BPC 10mg + TB 10mg" })).toBeVisible();
    expect(within(card).getByText("BB20")).toBeVisible();
    expect(within(card).getByText("20mg × 10 vials")).toBeVisible();
  });

  it("requires combined exact filters to match the same supplied configuration", () => {
    render(<CatalogExplorer products={browseCatalogProducts} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Source code" }), {
      target: { value: "TR5" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Package unit" }), {
      target: { value: "10mg × 10 vials" },
    });

    expect(screen.getByText("0 configurations represented")).toBeVisible();
    expect(screen.getByText("No catalog records match these filters.")).toBeVisible();

    fireEvent.change(screen.getByRole("combobox", { name: "Package unit" }), {
      target: { value: "5mg × 10 vials" },
    });

    const card = screen.getByRole("article", { name: "Tirzepatide" });
    expect(screen.getByText("1 configuration represented")).toBeVisible();
    expect(within(card).getByText("TR5")).toBeVisible();
    expect(within(card).queryByText("TR10")).toBeNull();
  });
});
