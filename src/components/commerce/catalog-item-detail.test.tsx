import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildPublicStorefrontCatalog,
  findPublicStorefrontProduct,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";

import { CatalogItemDetail } from "./catalog-item-detail";
import { testPricingContext } from "./storefront-test-fixtures";

describe("CatalogItemDetail", () => {
  const catalog = buildPublicStorefrontCatalog({
    configuredPublicationId: browseCatalogPublicationId,
    catalogData: storefrontCatalogData,
    runtimeVariantFacts: [],
    controlledContent: [],
    verifiedImageMetadata: storefrontImageMetadata,
  });

  it("shows every supplied variant and exposes a normalized source label", () => {
    const product = findPublicStorefrontProduct(catalog, "pinealon")!;
    render(<CatalogItemDetail product={product} pricing={testPricingContext()} />);

    expect(screen.getByRole("heading", { level: 1, name: "Pinealon" })).toBeVisible();
    expect(screen.getByRole("img", { name: product.image.alt })).toBeVisible();
    expect(screen.getByText("Source label: Pinealon10mg")).toBeVisible();
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
    const product = findPublicStorefrontProduct(catalog, slug)!;
    render(<CatalogItemDetail product={product} pricing={testPricingContext()} />);

    const variantRow = screen.getByText(code).closest("li");
    expect(variantRow).not.toBeNull();
    expect(within(variantRow!).getByText(`Source label: ${sourceName}`)).toBeVisible();
  });
});
