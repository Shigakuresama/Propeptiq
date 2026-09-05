import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { CartProvider } from "@/cart/cart-provider";
import { loadCart } from "@/cart/cart-storage";
import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildConfiguredDisplayVariantFacts,
  buildPublicStorefrontCatalog,
  resolvePublicStorefrontRelatedProducts,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";
import { WINTER30_STOREFRONT_PROMOTION } from "@/config/storefront-promotions";
import { storefrontContentRecords } from "@/content/storefront-content";
import { CatalogItemDetail } from "./catalog-item-detail";
import { testCanonicalProduct, testPricingContext, testPublicVariant, testWinter30 } from "./storefront-test-fixtures";

const publishedCatalog = buildPublicStorefrontCatalog({
  configuredPublicationId: browseCatalogPublicationId,
  catalogData: storefrontCatalogData,
  runtimeVariantFacts: buildConfiguredDisplayVariantFacts(storefrontCatalogData),
  controlledContent: storefrontContentRecords,
  verifiedImageMetadata: storefrontImageMetadata,
});
const productionPricing = {
  mode: "production" as const,
  evaluatedAt: "2026-09-05T12:00:00.000Z",
  automaticPromotions: [WINTER30_STOREFRONT_PROMOTION],
};

function publishedProduct(slug: string) {
  const product = publishedCatalog.products.find((candidate) => candidate.slug === slug);
  if (product?.kind !== "canonical") throw new Error("Expected published canonical product");
  return product;
}

describe("related products through the published catalog and real purchase components", () => {
  beforeEach(() => window.localStorage.clear());

  it("renders the real detail → carousel → card path and adds a related item", async () => {
    const user = userEvent.setup();
    const related = testCanonicalProduct([testPublicVariant({ id: "composition-v", label: "5 mg" })], { id: "composition-related", name: "Composition Related" });
    render(<CartProvider><CatalogItemDetail calculator={null} product={testCanonicalProduct()} pricing={testPricingContext("test", [testWinter30])} relatedProducts={[related]} /></CartProvider>);
    const section = screen.getByRole("region", { name: "Related Products" });
    expect(section).toBeVisible();
    expect(within(section).getByRole("heading", { name: "Related Products" })).toBeVisible();
    expect(within(section).getByRole("heading", { name: "Composition Related" })).toBeVisible();
    expect(section.compareDocumentPosition(screen.getByRole("heading", { level: 1, name: "Synthetic Product Alpha" })) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    const image = within(section).getByRole("img", { name: /Composition Related/u });
    expect(image.closest(".catalog-image-frame")).not.toBeNull();
    expect(image).toHaveAttribute("width", "1254");
    expect(image).toHaveAttribute("height", "1254");
    expect(image).toHaveAttribute("sizes");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(within(section).getByText("$7.00")).toBeVisible();
    await user.click(within(section).getByRole("button", { name: "Add Composition Related to cart" }));
    await waitFor(() => expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("Composition Related, 5 mg: 1 unit"));
  });

  it("retains visible related cards for all 56 actual products while payment remains closed", () => {
    expect(publishedCatalog.products).toHaveLength(56);
    for (const product of publishedCatalog.products) {
      if (product.kind !== "canonical") throw new Error("Expected canonical product");
      const related = resolvePublicStorefrontRelatedProducts(publishedCatalog, product);
      expect(related.length).toBeGreaterThan(0);
      expect(related.length).toBeLessThanOrEqual(4);
      expect(related.every((candidate) => candidate.category === product.category)).toBe(true);
      expect(related.every((candidate) => candidate.id !== product.id)).toBe(true);
      expect(related.every((candidate) => candidate.variants.some((variant) =>
        variant.availability === "preview_only",
      ))).toBe(true);
      expect(related.every((candidate) => candidate.variants.every((variant) => !variant.checkoutReady))).toBe(true);
    }
  });

  it("shows actual related catalog names, image, WINTER30 price and a working single-variant preview add", async () => {
    const user = userEvent.setup();
    const product = publishedProduct("ghk-cu");
    const relatedProducts = resolvePublicStorefrontRelatedProducts(publishedCatalog, product);
    render(<CartProvider><CatalogItemDetail calculator={null} product={product} pricing={productionPricing} relatedProducts={relatedProducts} /></CartProvider>);
    const section = screen.getByRole("region", { name: "Related Products" });
    expect(within(section).getByText("Explore more products in this category.")).toBeVisible();
    expect(within(section).queryByRole("heading", { name: product.name })).toBeNull();
    expect(within(section).getAllByRole("article")).toHaveLength(4);
    const snap = within(section).getByRole("article", { name: "SNAP" });
    expect(within(snap).getByRole("img")).toHaveAttribute("loading", "lazy");
    expect(within(snap).getByText("$29.99")).toBeVisible();
    expect(within(snap).getByText("$20.99")).toBeVisible();
    expect(within(snap).getByLabelText("-30%")).toBeVisible();
    expect(within(snap).getByText("Cart preview only")).toBeVisible();
    await user.click(within(snap).getByRole("button", { name: "Add SNAP to preview cart" }));
    await waitFor(() => expect(loadCart(window.localStorage)).toEqual({
      status: "ready", items: [{ variantId: publishedProduct("snap").defaultVariantId, quantity: 1 }],
    }));
    expect(screen.getAllByRole("status", { name: "Cart updates" })).toHaveLength(1);
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("SNAP");
  });

  it("requires an explicit actual variant and merges repeat quick-add selections by its ID", async () => {
    const user = userEvent.setup();
    const product = publishedProduct("tirzepatide");
    const relatedProducts = resolvePublicStorefrontRelatedProducts(publishedCatalog, product);
    const retatrutide = publishedProduct("retatrutide");
    const selected = retatrutide.variants.find((variant) =>
      variant.priceStatus === "active" && variant.id !== retatrutide.defaultVariantId,
    );
    if (!selected) throw new Error("Expected a second reviewed Retatrutide variant");
    render(<CartProvider><CatalogItemDetail calculator={null} product={product} pricing={productionPricing} relatedProducts={relatedProducts} /></CartProvider>);
    const section = screen.getByRole("region", { name: "Related Products" });
    const trigger = within(section).getByRole("button", { name: "Add Retatrutide: choose a variant" });
    for (let quantity = 1; quantity <= 2; quantity += 1) {
      await user.click(trigger);
      const sheet = screen.getByRole("dialog", { name: "Choose a variant for Retatrutide" });
      expect(loadCart(window.localStorage)).toEqual({
        status: "ready", items: quantity === 1 ? [] : [{ variantId: selected.id, quantity: 1 }],
      });
      const option = within(sheet).getByRole("radio", { name: new RegExp(`^${selected.label} `, "u") });
      option.focus();
      await user.keyboard(" ");
      expect(option).toBeChecked();
      await user.click(within(sheet).getByRole("button", { name: "Add Retatrutide to preview cart" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(loadCart(window.localStorage)).toEqual({
        status: "ready", items: [{ variantId: selected.id, quantity }],
      }));
      expect(trigger).toHaveFocus();
    }
    expect(screen.getByRole("status", { name: "Cart updates" })).toHaveTextContent("2 units in cart");
  });
});
