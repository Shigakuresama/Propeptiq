import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildPublicStorefrontCatalog,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";
import type { PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import { testPricingContext } from "@/components/commerce/storefront-test-fixtures";

const { receivedPricing } = vi.hoisted(() => ({
  receivedPricing: [] as PublicStorefrontPricingContext[],
}));
const { panelPricing } = vi.hoisted(() => ({ panelPricing: [] as PublicStorefrontPricingContext[] }));

vi.mock("@/components/commerce/catalog-listing-card", () => ({
  CatalogListingCard: ({
    product,
    pricing,
  }: {
    product: { name: string };
    pricing: PublicStorefrontPricingContext;
  }) => {
    receivedPricing.push(pricing);
    return <article>{product.name}</article>;
  },
}));
vi.mock("@/components/commerce/product-purchase-panel", () => ({ ProductPurchasePanel: ({ pricing }: { pricing: PublicStorefrontPricingContext }) => { panelPricing.push(pricing); return <div data-testid="panel" />; } }));

import { CatalogExplorer } from "./catalog-explorer";
import { PublicHome } from "../site/public-home";
import { CatalogItemDetail } from "./catalog-item-detail";
import { testCanonicalProduct } from "./storefront-test-fixtures";

const products = buildPublicStorefrontCatalog({
  configuredPublicationId: browseCatalogPublicationId,
  catalogData: storefrontCatalogData,
  runtimeVariantFacts: [],
  controlledContent: [],
  verifiedImageMetadata: storefrontImageMetadata,
}).products;

describe("public pricing snapshot propagation", () => {
  beforeEach(() => {
    receivedPricing.length = 0;
    panelPricing.length = 0;
  });

  it("forwards one exact pricing object reference through CatalogExplorer to every card", () => {
    const pricing = testPricingContext("production");
    render(<CatalogExplorer pricing={pricing} products={products.slice(0, 2)} />);

    expect(receivedPricing).toHaveLength(2);
    for (const received of receivedPricing) expect(received).toBe(pricing);
  });

  it("forwards one exact pricing object reference through PublicHome to every highlight card", () => {
    const pricing = testPricingContext("production");
    render(
      <PublicHome
        pricing={pricing}
        products={products.slice(0, 3)}
        variantCount={3}
      />,
    );

    expect(receivedPricing).toHaveLength(3);
    for (const received of receivedPricing) expect(received).toBe(pricing);
  });

  it("forwards the exact snapshot through canonical detail into the panel", () => {
    const pricing = testPricingContext("production");
    render(<CatalogItemDetail product={testCanonicalProduct()} pricing={pricing} relatedProducts={[]} />);
    expect(panelPricing).toHaveLength(1); expect(panelPricing[0]).toBe(pricing);
  });

  it("does not replace the snapshot with a client mode", () => {
    const pricing = testPricingContext("production"); render(<CatalogItemDetail product={testCanonicalProduct()} pricing={pricing} relatedProducts={[]} />); expect(panelPricing[0]).toBe(pricing);
  });
});
