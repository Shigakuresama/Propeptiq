import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { findBrowseCatalogProduct } from "@/catalog/browse-catalog";

import { CatalogItemDetail } from "./catalog-item-detail";

describe("CatalogItemDetail", () => {
  it("shows every supplied variant and exposes a normalized source label", () => {
    const product = findBrowseCatalogProduct("pinealon")!;
    render(<CatalogItemDetail product={product} />);

    const heading = screen.getByRole("heading", { level: 1, name: "Pinealon" });
    const image = screen.getByRole("img", { name: product.image.alt });
    expect(heading).toBeVisible();
    expect(image).toBeVisible();
    expect(heading.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Source label: Pinealon10mg")).toBeVisible();
    expect(screen.getByText("Dossier entries")).toBeVisible();
    expect(screen.getByText("PN5")).toBeVisible();
    expect(screen.getByText("5mg × 10 vials")).toBeVisible();
    expect(screen.getByText("Illustrative product presentation")).toBeVisible();
    expect(screen.queryByRole("button", { name: /add to cart/i })).toBeNull();
    expect(document.body).not.toHaveTextContent(/\$|usd/i);
  });

  it.each([
    ["bpc-tb-blend", "BB10", "BPC 5mg + TB 5mg"],
    ["bpc-tb-blend-bb20", "BB20", "BPC 10mg + TB 10mg"],
    ["bpc-tb-blend-bb40", "BB40", "BPC 20mg + TB 20mg"],
    ["cjc-1295-no-dac-ipa", "CP10", "CJC-1295 NO DAC 5mg + IPA 5mg"],
    ["cjc-1295-no-dac-ipa-cp20", "CP20", "CJC-1295 NO DAC 10mg + IPA 10mg"],
  ])("keeps the exact supplied blend composition attached to %s", (slug, code, sourceName) => {
    const product = findBrowseCatalogProduct(slug)!;
    render(<CatalogItemDetail product={product} />);

    const variantRow = screen.getByText(code).closest("li");
    expect(variantRow).not.toBeNull();
    expect(within(variantRow!).getByText(`Source label: ${sourceName}`)).toBeVisible();
  });
});
