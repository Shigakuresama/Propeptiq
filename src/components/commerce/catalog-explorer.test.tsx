import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildPublicStorefrontCatalog,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";
import { testPricingContext } from "@/components/commerce/storefront-test-fixtures";

import { CatalogExplorer } from "./catalog-explorer";

describe("CatalogExplorer", () => {
  const pricing = testPricingContext("production");
  const products = buildPublicStorefrontCatalog({
    configuredPublicationId: browseCatalogPublicationId,
    catalogData: storefrontCatalogData,
    runtimeVariantFacts: [],
    controlledContent: [],
    verifiedImageMetadata: storefrontImageMetadata,
  }).products;

  it("provides labeled search and exact source-name, code, and package-unit filters", () => {
    render(<CatalogExplorer products={products} pricing={pricing} />);

    expect(screen.getByRole("searchbox", { name: "Search catalog" })).toBeVisible();
    const sourceFilter = screen.getByRole("combobox", { name: "Source name" });
    expect(within(sourceFilter).getAllByRole("option")).toHaveLength(57);
    expect(screen.getByRole("combobox", { name: "Source code" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Package unit" })).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(56);
  });

  it("finds source ambiguities without changing the immutable catalog rows", () => {
    const snapshot = JSON.stringify(products);
    render(<CatalogExplorer products={products} pricing={pricing} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Source code" }), {
      target: { value: "LPC" },
    });

    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "LI PO-C" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "LI PO-C without B12" })).toBeVisible();
    expect(JSON.stringify(products)).toBe(snapshot);
  });

  it("searches exact source facts and reports an accessible empty result", () => {
    render(<CatalogExplorer products={products} pricing={pricing} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search catalog" }), {
      target: { value: "PN5" },
    });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Pinealon" })).toBeVisible();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search catalog" }), {
      target: { value: "not-a-source-record" },
    });
    expect(screen.getByText("No catalog records match these filters.")).toBeVisible();
  });

  it("filters a distinct exact source Name to its one matching card", () => {
    render(<CatalogExplorer products={products} pricing={pricing} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Source name" }), {
      target: { value: "BPC 10mg + TB 10mg" },
    });

    const card = screen.getByRole("article");
    expect(within(card).getByRole("heading", { name: "BPC 10mg + TB 10mg" })).toBeVisible();
    expect(within(card).getByText("BB20")).toBeVisible();
    expect(within(card).getByText("20mg × 10 vials")).toBeVisible();
  });
});
