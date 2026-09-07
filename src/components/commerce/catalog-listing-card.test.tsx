import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { parseStorefrontBindings } from "@/catalog/storefront-bindings";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildPublicStorefrontCatalog,
  buildConfiguredDisplayVariantFacts,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";
import { CartProvider } from "@/cart/cart-provider";
import { CART_STORAGE_KEY } from "@/cart/cart-storage";
import {
  testCanonicalProduct,
  testPricingContext,
  testPublicVariant,
  testWinter30,
} from "@/components/commerce/storefront-test-fixtures";

import { CatalogListingCard } from "./catalog-listing-card";

function renderCanonical(
  product = testCanonicalProduct(),
  pricing = testPricingContext("test"),
) {
  return render(
    <CartProvider>
      <CatalogListingCard product={product} pricing={pricing} />
    </CartProvider>,
  );
}

describe("CatalogListingCard", () => {
  beforeEach(() => window.localStorage.clear());

  it("selects a card variant directly and adds its exact ID to the cart", async () => {
    const user = userEvent.setup();
    const variants = [
      testPublicVariant({ id: "variant-5", label: "5 mg" }),
      testPublicVariant({ id: "variant-10", label: "10 mg" }),
    ];
    renderCanonical(testCanonicalProduct(variants, { defaultVariantId: "variant-5" }));
    const select = screen.getByRole("combobox", { name: "Synthetic Product Alpha amount" });
    expect(select).toHaveValue("variant-5");
    await user.selectOptions(select, "variant-10");
    expect(select).toHaveValue("variant-10");
    expect(screen.getByText("10 mg · 1 bottle per unit")).toBeVisible();
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("");
    const add = screen.getByRole("button", { name: /add synthetic product alpha to cart/i });
    await user.click(add);
    await waitFor(() => expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("Synthetic Product Alpha, 10 mg: 1 unit"));
    expect(add).toHaveFocus();
    expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "{}")).toEqual({ version: 2, items: [{ variantId: "variant-10", quantity: 1 }] });
  });

  it("directly adds a single variant with its exact announcement context", async () => {
    const user = userEvent.setup();
    const product = testCanonicalProduct([testPublicVariant({ id: "variant-single", label: "5 mg" })]);
    renderCanonical(product);
    const button = screen.getByRole("button", { name: /add synthetic product alpha to cart/i });
    await user.click(button);
    await waitFor(() => expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("Synthetic Product Alpha, 5 mg: 1 unit"));
    expect(button).toHaveFocus();
  });

  it("marks unavailable card amounts inaccessible and never adds them", async () => {
    const unavailable = testPublicVariant({
      id: "variant-unavailable",
      label: "20 mg",
      availability: "unavailable",
      checkoutReady: false,
    });
    const available = testPublicVariant({ id: "variant-available", label: "10 mg" });
    renderCanonical(testCanonicalProduct([unavailable, available], { defaultVariantId: available.id }));

    const select = screen.getByRole("combobox", { name: "Synthetic Product Alpha amount" });
    expect(screen.getByRole("option", { name: "20 mg — Unavailable" })).toBeDisabled();
    await userEvent.setup().selectOptions(select, "variant-unavailable");
    expect(select).toHaveValue("variant-available");
    expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "{}")).toEqual({ version: 2, items: [] });
  });

  it("retains an illustrated browse-only entry with honest pending pricing and no cart action", () => {
    const product = buildPublicStorefrontCatalog({
      configuredPublicationId: browseCatalogPublicationId,
      catalogData: { products: [], bindings: parseStorefrontBindings({ products: [], variants: [] }) },
      runtimeVariantFacts: [],
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
    }).products[0]!;
    render(
      <CatalogListingCard product={product} pricing={testPricingContext("production")} />,
    );

    const article = screen.getByRole("article", { name: product.name });
    const image = within(article).getByRole("img", {
      name: `Front view of ${product.name}`,
    });
    expect(image).toBeVisible();
    expect(image).toHaveAttribute(
      "sizes",
      "(min-width: 1280px) 28vw, (min-width: 768px) 45vw, calc(100vw - 2rem)",
    );
    const visual = image.closest(".catalog-product-visual");
    expect(visual).toHaveAttribute(
      "data-visual-presentation",
      "illustration_with_catalog_data_plate",
    );
    expect(visual?.querySelectorAll("img")).toHaveLength(1);
    expect(image.getAttribute("src")).toContain(
      encodeURIComponent("/catalog/individual/tirzepatide/front-v1.webp"),
    );
    expect(image.closest(".catalog-image-frame")).not.toBeNull();
    expect(within(article).getByRole("heading", { name: product.name })).toBeVisible();
    expect(within(article).queryByText("TR5")).not.toBeInTheDocument();
    expect(within(article).queryByText("5mg")).not.toBeInTheDocument();
    expect(within(article).queryByText("AI-generated catalog illustration — not actual product photography.")).not.toBeInTheDocument();
    expect(within(article).getByText("Pricing not available")).toBeVisible();
    expect(
      within(article).getByRole("link", {
        name: `View catalog item: ${product.name}`,
      }),
    ).toHaveAttribute("href", `/catalog/items/${product.slug}`);
    expect(within(article).queryByRole("button", { name: /add/iu })).toBeNull();
    expect(product).toMatchObject({ kind: "browse_only", id: null, variants: [] });
  });

  it("renders an exact promoted single-variant price, image badge, availability, and direct ADD", () => {
    renderCanonical(
      testCanonicalProduct(),
      testPricingContext("test", [testWinter30]),
    );

    const article = screen.getByRole("article", { name: "Synthetic Product Alpha" });
    expect(within(article).getByText("5 mg · 1 bottle per unit")).toBeVisible();
    expect(within(article).getByText("$10.00").tagName).toBe("DEL");
    expect(within(article).getByText("$7.00").tagName).toBe("STRONG");
    expect(within(article).getAllByText("-30%")).toHaveLength(2);
    expect(within(article).queryByText("Available")).not.toBeInTheDocument();
    const add = within(article).getByRole("button", {
      name: "Add Synthetic Product Alpha to cart",
    });
    expect(add).toBeEnabled();
    expect(add).toHaveTextContent("Add to cart");
  });

  it("uses the approved mapped front by default while retaining the live product plate", () => {
    renderCanonical(testCanonicalProduct([], {
      slug: "bpc-157",
      name: "BPC-157",
    }));

    const article = screen.getByRole("article", { name: "BPC-157" });
    const image = within(article).getByRole("img", {
      name: "Front view of BPC-157",
    });
    expect(image.getAttribute("src")).toContain(
      encodeURIComponent("/catalog/individual/bpc-157/front-v1.webp"),
    );
    expect(within(article).getByRole("heading", { name: "BPC-157" })).toBeVisible();
    expect(within(article).getByText("RESEARCH USE ONLY")).toBeVisible();
  });

  it("shows a truthful price but disables direct ADD when checkout mapping is unavailable", () => {
    renderCanonical(
      testCanonicalProduct([testPublicVariant({ checkoutReady: false })]),
    );

    const article = screen.getByRole("article", { name: "Synthetic Product Alpha" });
    expect(within(article).getByText("$10.00")).toBeVisible();
    expect(within(article).queryByText("Checkout unavailable")).toBeNull();
    const unavailable = within(article).getByRole("button", {
      name: /synthetic product alpha unavailable/iu,
    });
    expect(unavailable).toBeDisabled();
    expect(unavailable).toHaveTextContent("Ordering not open");
    expect(unavailable).toHaveAttribute("title", "Ordering not open");
    expect(within(article).queryByText(/-\d+%/u)).toBeNull();
  });

  it("adds a positive preview-only Production variant to real cart storage", async () => {
    const user = userEvent.setup();
    renderCanonical(
      testCanonicalProduct([testPublicVariant({
        id: "production-preview-variant",
        label: "30 mg",
        availability: "preview_only",
        checkoutReady: false,
      })]),
      testPricingContext("production", [testWinter30]),
    );

    const article = screen.getByRole("article", { name: "Synthetic Product Alpha" });
    expect(within(article).queryByText("Checkout unavailable")).toBeNull();
    const add = within(article).getByRole("button", {
      name: "Add Synthetic Product Alpha to cart",
    });
    expect(add).toHaveTextContent("Add to cart");
    await user.click(add);

    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "null")).toEqual({
      version: 2,
      items: [{ variantId: "production-preview-variant", quantity: 1 }],
    }));
  });

  it("fails a production pending-zero variant closed without a price, savings, or badge", () => {
    const pending = testPublicVariant({
      availability: "preview_only",
      priceStatus: "pending",
      baseUnitMinor: 0,
      checkoutReady: false,
    });
    renderCanonical(
      testCanonicalProduct([pending]),
      testPricingContext("production", [testWinter30]),
    );

    const article = screen.getByRole("article", { name: "Synthetic Product Alpha" });
    expect(within(article).getByText("Price unavailable", { selector: "p" })).toBeVisible();
    expect(within(article).queryByText("$0.00")).toBeNull();
    expect(within(article).queryByText("-30%")).toBeNull();
    expect(within(article).queryByText(/save/iu)).toBeNull();
    const unavailable = within(article).getByRole("button", {
      name: /synthetic product alpha unavailable/iu,
    });
    expect(unavailable).toBeDisabled();
    expect(unavailable).toHaveTextContent("Price unavailable");
    expect(unavailable).toHaveAttribute("title", "Price unavailable");
  });

  it("shows explicit zero-dollar sale layout only in a local cart preview", () => {
    const pending = testPublicVariant({
      availability: "preview_only",
      priceStatus: "pending",
      baseUnitMinor: 0,
      checkoutReady: false,
    });
    renderCanonical(
      testCanonicalProduct([pending]),
      testPricingContext("preview", [testWinter30]),
    );

    const article = screen.getByRole("article", { name: "Synthetic Product Alpha" });
    expect(within(article).getAllByText("$0.00")).toHaveLength(1);
    expect(within(article).queryByText("-30%")).not.toBeInTheDocument();
    expect(within(article).queryByText(/save/iu)).not.toBeInTheDocument();
    expect(within(article).getByText("Test mode — no payments")).toBeVisible();
    const add = within(article).getByRole("button", {
      name: "Add Synthetic Product Alpha to cart",
    });
    expect(add).toBeEnabled();
    expect(add).toHaveTextContent("Add to cart");
  });

  it("uses the selected higher-priced default for caption, price, and availability", () => {
    const selectedDefault = testPublicVariant({
      id: "variant-default",
      label: "30 mg",
      amount: { value: 30, unit: "mg" },
      packageQuantity: 2,
      baseUnitMinor: 5_999,
      checkoutReady: false,
    });
    const readyOtherOption = testPublicVariant({
      id: "variant-ready-other",
      label: "5 mg",
      amount: { value: 5, unit: "mg" },
      baseUnitMinor: 2_999,
      checkoutReady: true,
    });
    renderCanonical(
      testCanonicalProduct([selectedDefault, readyOtherOption], { defaultVariantId: selectedDefault.id }),
      testPricingContext("production", [testWinter30]),
    );

    const article = screen.getByRole("article", { name: "Synthetic Product Alpha" });
    expect(within(article).getAllByText("30 mg · 2 bottles per unit")).toHaveLength(2);
    expect(within(article).getByText("$59.99").tagName).toBe("DEL");
    expect(within(article).getByText("$41.99").tagName).toBe("STRONG");
    expect(within(article).queryByText("Checkout unavailable")).toBeNull();
    expect(within(article).queryByText("Available")).toBeNull();
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("");
    expect(within(article).getByRole("button", { name: /unavailable/i })).toBeDisabled();
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("");
  });

  it("renders the selected actual catalog label, one-bottle caption, base price, sale price, and badge", () => {
    const catalog = buildPublicStorefrontCatalog({
      configuredPublicationId: browseCatalogPublicationId,
      catalogData: storefrontCatalogData,
      runtimeVariantFacts: buildConfiguredDisplayVariantFacts(storefrontCatalogData),
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
    });

    for (const expected of [
      ["tirzepatide", "30mg · 1 bottle per unit", "$59.99", "$41.99"],
      ["retatrutide", "10mg · 1 bottle per unit", "$69.99", "$48.99"],
      ["nad-plus", "500mg · 1 bottle per unit", "$69.99", "$48.99"],
    ] as const) {
      const [slug, caption, basePrice, salePrice] = expected;
      const product = catalog.products.find((candidate) => candidate.slug === slug);
      if (!product || product.kind !== "canonical") {
        throw new Error(`Expected canonical configured catalog product: ${slug}`);
      }
      const { unmount } = renderCanonical(product, testPricingContext("test", [testWinter30]));
      const article = screen.getByRole("article", { name: product.name });
      expect(within(article).getByText(caption)).toBeVisible();
      expect(within(article).getByText(basePrice).tagName).toBe("DEL");
      expect(within(article).getByText(salePrice).tagName).toBe("STRONG");
      expect(within(article).getAllByText("-30%")).toHaveLength(2);
      unmount();
    }
  });

  it("preserves a composite selected label and pluralizes a single bottle caption", () => {
    const composite = testPublicVariant({
      id: "variant-composite",
      label: "5 mg + 5 mg blend",
      amount: null,
      packageQuantity: 1,
    });
    renderCanonical(testCanonicalProduct([composite]));

    expect(screen.getByText("5 mg + 5 mg blend · 1 bottle per unit")).toBeVisible();
  });
});
