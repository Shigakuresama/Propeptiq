import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildPublicStorefrontCatalog,
  storefrontImageMetadata,
  type CanonicalPublicStorefrontProduct,
  type PublicStorefrontProduct,
  type PublicStorefrontVariant,
} from "@/catalog/storefront-public";
import { CartProvider } from "@/cart/cart-provider";
import {
  testCanonicalProduct,
  testPricingContext,
  testPublicVariant,
  testWinter30,
} from "@/components/commerce/storefront-test-fixtures";
import { buildCatalogDiscoveryRows } from "@/search/catalog-discovery";

import { CatalogExplorer } from "./catalog-explorer";

const pricing = testPricingContext("production");
const products = buildPublicStorefrontCatalog({
  configuredPublicationId: browseCatalogPublicationId,
  catalogData: storefrontCatalogData,
  runtimeVariantFacts: [],
  controlledContent: [],
  verifiedImageMetadata: storefrontImageMetadata,
}).products;

function syntheticProduct(
  slug: string,
  overrides: Partial<CanonicalPublicStorefrontProduct> = {},
  variantOverrides: Partial<PublicStorefrontVariant> = {},
): CanonicalPublicStorefrontProduct {
  const variant = testPublicVariant({
    id: `00000000-0000-4000-8000-${slug.padEnd(12, "0").slice(0, 12)}`,
    sku: `SYN-${slug.toUpperCase()}`,
    ...variantOverrides,
  });
  return testCanonicalProduct([variant], {
    id: `synthetic-${slug}-product`,
    slug,
    name: `Synthetic ${slug} research record`,
    sourceName: "Synthetic Source",
    category: "Synthetic Category",
    displayConfigurations: [
      {
        displayCode: `CODE-${slug.toUpperCase()}`,
        packageForm: `${slug} synthetic package`,
        sourceName: "Synthetic Source",
      },
    ],
    popularityRank: 100,
    releasedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

function renderExplorer(
  currentProducts: readonly PublicStorefrontProduct[] = products,
  currentPricing = pricing,
) {
  const currentRows = buildCatalogDiscoveryRows({
    products: currentProducts,
    pricing: currentPricing,
  });
  return render(
    <CartProvider>
      <CatalogExplorer
        discoveryRows={currentRows}
        pricing={currentPricing}
        products={currentProducts}
      />
    </CartProvider>,
  );
}

function resultHeadings(): string[] {
  return within(screen.getByRole("list", { name: "Catalog results" }))
    .getAllByRole("heading")
    .map((heading) => heading.textContent ?? "");
}

describe("CatalogExplorer", () => {
  it("provides the three retained exact facets and all five labeled sort modes", () => {
    renderExplorer();

    expect(screen.getByRole("searchbox", { name: "Search catalog" })).toBeVisible();
    const sourceFilter = screen.getByRole("combobox", { name: "Source name" });
    expect(within(sourceFilter).getAllByRole("option")).toHaveLength(57);
    expect(screen.getByRole("combobox", { name: "Source code" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Package unit" })).toBeVisible();
    const sort = screen.getByRole("combobox", { name: "Sort catalog" });
    expect(sort).toHaveValue("popular");
    expect(within(sort).getAllByRole("option").map((option) => [option.getAttribute("value"), option.textContent])).toEqual([
      ["popular", "Most popular"],
      ["price-asc", "Price: low to high"],
      ["price-desc", "Price: high to low"],
      ["alphabetical", "A to Z"],
      ["newest", "Newest"],
    ]);
    expect(screen.getAllByRole("article")).toHaveLength(56);
  });

  it("retains unique English-alphabetical facet options from the complete catalog", () => {
    renderExplorer();

    for (const name of ["Source name", "Source code", "Package unit"]) {
      const values = within(screen.getByRole("combobox", { name }))
        .getAllByRole("option")
        .slice(1)
        .map((option) => option.textContent ?? "");
      expect(values).toEqual([...new Set(values)]);
      expect(values).toEqual([...values].sort((left, right) => left.localeCompare(right, "en-US")));
    }
  });

  it.each([
    ["fuzzy product name", "reeserch", "Fuzzy Research Catalog"],
    ["SKU", "SYN-SEARCH-SKU", "Fuzzy Research Catalog"],
    ["variant label", "25 mg synthetic vial", "Fuzzy Research Catalog"],
    ["alias", "Synthetic Discovery Alias", "Fuzzy Research Catalog"],
    ["category", "Special Synthetic Category", "Fuzzy Research Catalog"],
    ["approved description", "approved synthetic discovery body", "Fuzzy Research Catalog"],
  ])("matches a real Task 1/2 %s entry", (_label, query, expectedName) => {
    const target = syntheticProduct(
      "fuzzy-target",
      {
        name: "Fuzzy Research Catalog",
        aliases: ["Synthetic Discovery Alias"],
        category: "Special Synthetic Category",
        content: [
          {
            id: "synthetic-approved-description",
            kind: "product_information",
            status: "approved",
            title: "Synthetic approved overview",
            body: "Approved synthetic discovery body",
            sourceReferences: ["synthetic-test-source"],
            approvalNote: "synthetic-test-approval",
            reviewedAt: "2026-08-31T00:00:00.000Z",
            effectiveAt: null,
          },
        ],
      },
      { sku: "SYN-SEARCH-SKU", label: "25 mg synthetic vial" },
    );
    renderExplorer([
      target,
      syntheticProduct("unrelated", { name: "Unrelated Control" }),
    ]);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search catalog" }), {
      target: { value: query },
    });

    expect(screen.getByRole("heading", { name: expectedName })).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it("does not fuzzy-match a one-to-three-character typo", () => {
    renderExplorer([
      syntheticProduct("short-target", { aliases: ["nax"] }),
      syntheticProduct("short-control"),
    ]);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search catalog" }), {
      target: { value: "nad" },
    });

    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });

  it("composes query, every exact facet, and sort without resetting independent state", () => {
    const alpha = syntheticProduct("alpha", {
      name: "Synthetic shared Alpha",
      sourceName: "Alpha Source",
      displayConfigurations: [
        { displayCode: "ALPHA-CODE", packageForm: "Alpha package", sourceName: "Alpha Source" },
      ],
      popularityRank: 2,
    });
    const beta = syntheticProduct("beta", {
      name: "Synthetic shared Beta",
      sourceName: "Beta Source",
      displayConfigurations: [
        { displayCode: "BETA-CODE", packageForm: "Beta package", sourceName: "Beta Source" },
      ],
      popularityRank: 1,
    });
    renderExplorer([alpha, beta]);
    const search = screen.getByRole("searchbox", { name: "Search catalog" });
    const sort = screen.getByRole("combobox", { name: "Sort catalog" });

    fireEvent.change(search, { target: { value: "Synthetic shared" } });
    fireEvent.change(sort, { target: { value: "alphabetical" } });
    expect(search).toHaveValue("Synthetic shared");
    expect(resultHeadings()).toEqual(["Synthetic shared Alpha", "Synthetic shared Beta"]);

    fireEvent.change(screen.getByRole("combobox", { name: "Source name" }), {
      target: { value: "Beta Source" },
    });
    expect(search).toHaveValue("Synthetic shared");
    expect(sort).toHaveValue("alphabetical");
    expect(resultHeadings()).toEqual(["Synthetic shared Beta"]);

    fireEvent.change(screen.getByRole("combobox", { name: "Source code" }), {
      target: { value: "BETA-CODE" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Package unit" }), {
      target: { value: "Beta package" },
    });
    fireEvent.change(search, { target: { value: "Beta" } });
    expect(sort).toHaveValue("alphabetical");
    expect(screen.getByRole("combobox", { name: "Source name" })).toHaveValue("Beta Source");
    expect(screen.getByRole("combobox", { name: "Source code" })).toHaveValue("BETA-CODE");
    expect(screen.getByRole("combobox", { name: "Package unit" })).toHaveValue("Beta package");
    expect(resultHeadings()).toEqual(["Synthetic shared Beta"]);
  });

  it("sorts active prices in both directions before pending and unavailable", () => {
    const low = syntheticProduct("low", { name: "Low" }, { baseUnitMinor: 1_000 });
    const high = syntheticProduct("high", { name: "High" }, { baseUnitMinor: 9_000 });
    const pending = syntheticProduct(
      "pending",
      { name: "Pending" },
      { priceStatus: "pending", baseUnitMinor: null, currency: null, checkoutReady: false },
    );
    const unavailable = syntheticProduct(
      "unavailable",
      { name: "Unavailable" },
      { availability: "unavailable", checkoutReady: false },
    );
    renderExplorer([pending, high, unavailable, low]);
    const sort = screen.getByRole("combobox", { name: "Sort catalog" });

    fireEvent.change(sort, { target: { value: "price-asc" } });
    expect(resultHeadings()).toEqual(["Low", "High", "Pending", "Unavailable"]);
    expect(screen.getByText("$10.00")).toBeVisible();

    fireEvent.change(sort, { target: { value: "price-desc" } });
    expect(resultHeadings()).toEqual(["High", "Low", "Pending", "Unavailable"]);
    expect(screen.getByText("$90.00")).toBeVisible();
  });

  it("keeps selector, WINTER30, checkout-unavailable, pending, and unavailable cards aligned with derived price order", () => {
    const expensiveDefault = testPublicVariant({
      id: "synthetic-expensive-default",
      label: "10 mg synthetic default",
      baseUnitMinor: 10_000,
    });
    const cheaperDisplayed = testPublicVariant({
      id: "synthetic-cheaper-displayed",
      label: "5 mg synthetic option",
      baseUnitMinor: 5_000,
    });
    const cheapestSelector = testCanonicalProduct(
      [expensiveDefault, cheaperDisplayed],
      {
        id: "synthetic-selector-product",
        slug: "synthetic-selector-product",
        name: "Selector Product",
        defaultVariantId: expensiveDefault.id,
        popularityRank: 1,
      },
    );
    const checkoutUnavailable = syntheticProduct(
      "checkout-unavailable",
      { name: "Checkout-unavailable Product" },
      { baseUnitMinor: 2_500, checkoutReady: false },
    );
    const pending = syntheticProduct(
      "aligned-pending",
      { name: "Pending Product" },
      { priceStatus: "pending", baseUnitMinor: null, currency: null, checkoutReady: false },
    );
    const unavailable = syntheticProduct(
      "aligned-unavailable",
      { name: "Unavailable Product" },
      { availability: "unavailable", checkoutReady: false },
    );
    renderExplorer(
      [unavailable, pending, checkoutUnavailable, cheapestSelector],
      testPricingContext("production", [testWinter30]),
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Sort catalog" }), {
      target: { value: "price-desc" },
    });

    expect(resultHeadings()).toEqual([
      "Selector Product",
      "Checkout-unavailable Product",
      "Pending Product",
      "Unavailable Product",
    ]);
    const selectorCard = screen.getByRole("article", { name: "Selector Product" });
    expect(within(selectorCard).getByText("$50.00").tagName).toBe("DEL");
    expect(within(selectorCard).getByText("$35.00").tagName).toBe("STRONG");
    const checkoutCard = screen.getByRole("article", { name: "Checkout-unavailable Product" });
    expect(within(checkoutCard).getByText("$17.50")).toBeVisible();
    expect(within(checkoutCard).getAllByText("Checkout unavailable").length).toBeGreaterThan(0);
    expect(within(screen.getByRole("article", { name: "Pending Product" })).getByText("Pricing coming soon")).toBeVisible();
    expect(within(screen.getByRole("article", { name: "Unavailable Product" })).getByText("Unavailable")).toBeVisible();
  });

  it("sorts and renders a local zero-preview row as an active zero price", () => {
    const zeroPreview = syntheticProduct(
      "zero-preview",
      { name: "Zero-preview Product" },
      {
        availability: "preview_only",
        priceStatus: "pending",
        baseUnitMinor: 0,
        currency: "USD",
        checkoutReady: false,
      },
    );
    const paid = syntheticProduct("paid", { name: "Paid Product" }, { baseUnitMinor: 1_000 });
    renderExplorer([paid, zeroPreview], testPricingContext("local"));

    fireEvent.change(screen.getByRole("combobox", { name: "Sort catalog" }), {
      target: { value: "price-asc" },
    });

    expect(resultHeadings()).toEqual(["Zero-preview Product", "Paid Product"]);
    const zeroCard = screen.getByRole("article", { name: "Zero-preview Product" });
    expect(within(zeroCard).getAllByText("$0.00")).toHaveLength(1);
    expect(within(zeroCard).getByText("Local cart preview")).toBeVisible();
  });

  it("clear search preserves facets and sort, while broad reset preserves only sort", () => {
    renderExplorer([syntheticProduct("alpha"), syntheticProduct("beta")]);
    const search = screen.getByRole("searchbox", { name: "Search catalog" });
    const source = screen.getByRole("combobox", { name: "Source name" });
    const sort = screen.getByRole("combobox", { name: "Sort catalog" });
    fireEvent.change(sort, { target: { value: "newest" } });
    fireEvent.change(source, { target: { value: "Synthetic Source" } });
    fireEvent.change(search, { target: { value: "alpha" } });

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue("");
    expect(source).toHaveValue("Synthetic Source");
    expect(sort).toHaveValue("newest");

    fireEvent.change(search, { target: { value: "beta" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset all filters" }));
    expect(search).toHaveValue("");
    expect(source).toHaveValue("");
    expect(sort).toHaveValue("newest");
  });

  it.each([
    ["query", true, false, "No products match your search."],
    ["facets", false, true, "No products match the selected filters."],
    ["combined", true, true, "No products match your search and filters."],
  ])("provides the appropriate %s no-results actions", (_label, hasQuery, hasFacet, message) => {
    renderExplorer([
      syntheticProduct("only", {
        sourceName: "Synthetic Source One",
        displayConfigurations: [
          { displayCode: "CODE-ONLY", packageForm: "Only package", sourceName: "Synthetic Source One" },
        ],
      }),
      syntheticProduct("second", {
        sourceName: "Synthetic Source Two",
        displayConfigurations: [
          { displayCode: "CODE-SECOND", packageForm: "Second package", sourceName: "Synthetic Source Two" },
        ],
      }),
    ]);
    fireEvent.change(screen.getByRole("combobox", { name: "Sort catalog" }), {
      target: { value: "price-desc" },
    });
    if (hasQuery) {
      fireEvent.change(screen.getByRole("searchbox", { name: "Search catalog" }), {
        target: { value: "missing" },
      });
    }
    if (hasFacet) {
      if (!hasQuery) {
        fireEvent.change(screen.getByRole("combobox", { name: "Source name" }), {
          target: { value: "Synthetic Source One" },
        });
      }
      fireEvent.change(screen.getByRole("combobox", { name: "Source code" }), {
        target: { value: "CODE-SECOND" },
      });
    }

    expect(screen.getByText(message)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Clear search" }) !== null).toBe(hasQuery);
    expect(screen.queryByRole("button", { name: "Reset all filters" }) !== null).toBe(hasFacet);
    expect(screen.getByRole("combobox", { name: "Sort catalog" })).toHaveValue("price-desc");
  });

  it("keeps unsafe-looking query text as input text and cannot create markup", () => {
    renderExplorer([syntheticProduct("safe")]);
    const unsafe = '<img id="injected-search-markup" src=x onerror=alert(1)>';

    fireEvent.change(screen.getByRole("searchbox", { name: "Search catalog" }), {
      target: { value: unsafe },
    });

    expect(screen.getByRole("searchbox", { name: "Search catalog" })).toHaveValue(unsafe);
    expect(document.querySelector("#injected-search-markup")).toBeNull();
    expect(document.querySelector("[onerror]")).toBeNull();
  });

  it("announces one exact total-catalog count and exposes a deferred busy state", async () => {
    renderExplorer([syntheticProduct("alpha"), syntheticProduct("beta")]);
    const region = screen.getByRole("region", { name: "Catalog results region" });
    const explorer = screen.getByRole("heading", { name: "Find a catalog record" }).closest("section")!;
    const input = screen.getByRole("searchbox", { name: "Search catalog" });
    expect(screen.getByText("2 of 2 products")).toBeVisible();
    expect(explorer.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);

    act(() => {
      fireEvent.change(input, { target: { value: "alpha" } });
      expect(input).toHaveValue("alpha");
      expect(region).toHaveAttribute("aria-busy", "true");
      expect(screen.getByText("Updating catalog results")).toBeVisible();
    });

    await waitFor(() => {
      expect(region).not.toHaveAttribute("aria-busy", "true");
      expect(screen.getByText("1 of 2 products")).toBeVisible();
    });
    expect(explorer.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
  });

  it("supports keyboard focus with visible-focus classes on every interactive control", async () => {
    const user = userEvent.setup();
    renderExplorer([syntheticProduct("focus")]);

    const input = screen.getByRole("searchbox", { name: "Search catalog" });
    await user.tab();
    expect(input).toHaveFocus();
    expect(input.className).toMatch(/focus-visible:/u);
    for (const name of ["Source name", "Source code", "Package unit", "Sort catalog"]) {
      const control = screen.getByRole("combobox", { name });
      expect(control.className).toMatch(/focus-visible:/u);
    }
  });

  it("does not mutate immutable catalog rows while exact filtering", () => {
    const snapshot = JSON.stringify(products);
    renderExplorer();

    fireEvent.change(screen.getByRole("combobox", { name: "Source code" }), {
      target: { value: "LPC" },
    });

    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "LI PO-C" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "LI PO-C without B12" })).toBeVisible();
    expect(JSON.stringify(products)).toBe(snapshot);
  });
});
