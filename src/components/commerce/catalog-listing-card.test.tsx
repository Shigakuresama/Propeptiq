import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildPublicStorefrontCatalog,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";

import { CatalogListingCard } from "./catalog-listing-card";

describe("CatalogListingCard", () => {
  it("renders an illustrated price-free catalog entry without a cart action", () => {
    const product = buildPublicStorefrontCatalog({
      configuredPublicationId: browseCatalogPublicationId,
      catalogData: storefrontCatalogData,
      runtimeVariantFacts: [],
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
    }).products[0]!;
    render(<CatalogListingCard product={product} />);

    const article = screen.getByRole("article", { name: product.name });
    expect(within(article).getByRole("img", { name: product.image.alt })).toBeVisible();
    expect(within(article).getByRole("heading", { name: product.name })).toBeVisible();
    expect(within(article).getByText("TR5")).toBeVisible();
    expect(within(article).getByText("5mg × 10 vials")).toBeVisible();
    expect(within(article).getByText("Illustrative product presentation")).toBeVisible();
    expect(
      within(article).getByRole("link", {
        name: `View catalog item: ${product.name}`,
      }),
    ).toHaveAttribute("href", `/catalog/items/${product.slug}`);
    expect(within(article).queryByRole("button", { name: /add to cart/i })).toBeNull();
    expect(article).not.toHaveTextContent(/\$|price|usd/i);
    expect(product).toMatchObject({ kind: "browse_only", id: null, variants: [] });
  });
});
