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

  it("requires and announces an explicit variant for a real multi-variant quick add", async () => {
    const user = userEvent.setup();
    const variants = [
      testPublicVariant({ id: "variant-5", label: "5 mg" }),
      testPublicVariant({ id: "variant-10", label: "10 mg" }),
    ];
    renderCanonical(testCanonicalProduct(variants, { defaultVariantId: "variant-5" }));
    const trigger = screen.getByRole("button", { name: "Add Synthetic Product Alpha: choose a variant" });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("radio", { name: /10 mg/i })).toBeEnabled();
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("");
    await user.click(screen.getByRole("radio", { name: /10 mg/i }));
    await user.click(screen.getByRole("button", { name: /add synthetic product alpha to cart/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("Synthetic Product Alpha, 10 mg: 1 unit"));
    expect(trigger).toHaveFocus();
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
      name: `Illustrative laboratory vial presentation for ${product.name}`,
    });
    expect(image).toBeVisible();
    expect(image).toHaveAttribute(
      "sizes",
      "(min-width: 1280px) 28vw, (min-width: 768px) 45vw, calc(100vw - 2rem)",
    );
    expect(image.closest(".catalog-image-frame")).not.toBeNull();
    expect(within(article).getByRole("heading", { name: product.name })).toBeVisible();
    expect(within(article).getByText("TR5")).toBeVisible();
    expect(within(article).getByText("5mg")).toBeVisible();
    expect(within(article).queryByText("5mg × 10 vials")).not.toBeInTheDocument();
    expect(within(article).getByText("Illustrative product presentation")).toBeVisible();
    expect(within(article).getByText("Pricing coming soon")).toBeVisible();
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
    expect(within(article).getByText("5 mg · 1 bottle")).toBeVisible();
    expect(within(article).getByText("$10.00").tagName).toBe("DEL");
    expect(within(article).getByText("$7.00").tagName).toBe("STRONG");
    expect(within(article).getAllByText("-30%")).toHaveLength(2);
    expect(within(article).getByText("Available")).toBeVisible();
    const add = within(article).getByRole("button", {
      name: "Add Synthetic Product Alpha to cart",
    });
    expect(add).toBeEnabled();
    expect(add).toHaveTextContent("Add to cart");
  });

  it("shows a truthful price but disables direct ADD when checkout mapping is unavailable", () => {
    renderCanonical(
      testCanonicalProduct([testPublicVariant({ checkoutReady: false })]),
    );

    const article = screen.getByRole("article", { name: "Synthetic Product Alpha" });
    expect(within(article).getByText("$10.00")).toBeVisible();
    expect(within(article).getAllByText("Checkout unavailable").length).toBeGreaterThan(0);
    expect(
      within(article).getByRole("button", {
        name: /synthetic product alpha unavailable/iu,
      }),
    ).toBeDisabled();
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
    expect(within(article).getByText("Cart preview only")).toBeVisible();
    const add = within(article).getByRole("button", {
      name: "Add Synthetic Product Alpha to preview cart",
    });
    expect(add).toHaveTextContent("Add to preview cart");
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
    expect(within(article).getByText("Pricing coming soon")).toBeVisible();
    expect(within(article).queryByText("$0.00")).toBeNull();
    expect(within(article).queryByText("-30%")).toBeNull();
    expect(within(article).queryByText(/save/iu)).toBeNull();
    expect(
      within(article).getByRole("button", {
        name: /synthetic product alpha unavailable/iu,
      }),
    ).toBeDisabled();
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
    expect(within(article).getAllByText("$0.00")).toHaveLength(2);
    expect(within(article).getAllByText("-30%")).toHaveLength(2);
    expect(within(article).getAllByText("Local cart preview").length).toBeGreaterThan(0);
    const add = within(article).getByRole("button", {
      name: "Add Synthetic Product Alpha to preview cart",
    });
    expect(add).toBeEnabled();
    expect(add).toHaveTextContent("Add to preview cart");
  });

  it("uses the selected higher-priced default for caption, price, and availability while ADD still opens the chooser", async () => {
    const user = userEvent.setup();
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
    expect(within(article).getByText("30 mg · 2 bottles")).toBeVisible();
    expect(within(article).getByText("$59.99").tagName).toBe("DEL");
    expect(within(article).getByText("$41.99").tagName).toBe("STRONG");
    expect(within(article).getByText("Checkout unavailable")).toBeVisible();
    expect(within(article).queryByText("Available")).toBeNull();
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("");
    await user.click(within(article).getByRole("button", { name: "Add Synthetic Product Alpha: choose a variant" }));
    expect(screen.getByRole("dialog")).toBeVisible();
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
      ["tirzepatide", "30 mg · 1 bottle", "$59.99", "$41.99"],
      ["retatrutide", "10 mg · 1 bottle", "$69.99", "$48.99"],
      ["nad-plus", "500 mg · 1 bottle", "$69.99", "$48.99"],
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

    expect(screen.getByText("5 mg + 5 mg blend · 1 bottle")).toBeVisible();
  });
});
