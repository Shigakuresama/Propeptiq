import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildPublicStorefrontCatalog,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";
import type { PublicStorefrontPricingContext } from "@/catalog/storefront-price-presentation";
import type { PublicStorefrontProduct } from "@/catalog/storefront-public";
import { testPricingContext, testPublicVariant } from "@/components/commerce/storefront-test-fixtures";
import type { CatalogDiscoveryRow } from "@/search/catalog-discovery";

const { receivedPricing, receivedProducts } = vi.hoisted(() => ({
  receivedPricing: [] as PublicStorefrontPricingContext[],
  receivedProducts: [] as Array<{ name: string }>,
}));
const { panelPricing } = vi.hoisted(() => ({ panelPricing: [] as PublicStorefrontPricingContext[] }));
const { relatedPricing, relatedCardPricing } = vi.hoisted(() => ({ relatedPricing: [] as PublicStorefrontPricingContext[], relatedCardPricing: [] as PublicStorefrontPricingContext[] }));

vi.mock("@/components/commerce/catalog-listing-card", () => ({
  CatalogListingCard: ({
    product,
    pricing,
  }: {
    product: { name: string };
    pricing: PublicStorefrontPricingContext;
  }) => {
    receivedPricing.push(pricing);
    receivedProducts.push(product);
    return <article>{product.name}</article>;
  },
}));
vi.mock("./related-products-carousel", () => ({ RelatedProductsCarousel: ({ products, pricing }: { products: Array<{ name: string }>; pricing: PublicStorefrontPricingContext }) => { relatedPricing.push(pricing); for (const product of products) { void product; relatedCardPricing.push(pricing); } return <section>{products.map((product) => <article key={product.name}>{product.name}</article>)}</section>; } }));
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

function syntheticDiscoveryRows(
  selectedProducts: readonly PublicStorefrontProduct[],
): readonly CatalogDiscoveryRow[] {
  return Object.freeze(selectedProducts.map((product) => {
    const id = `product:${product.slug}`;
    return Object.freeze({
      productSlug: product.slug,
      searchEntry: Object.freeze({
        id,
        group: "products" as const,
        title: product.name,
        href: `/catalog/items/${product.slug}`,
        description: "",
        exactTerms: Object.freeze([]),
        keywords: Object.freeze([]),
        popularityRank: null,
      }),
      sortRow: Object.freeze({
        id,
        name: product.name,
        popularityRank: null,
        releasedAt: null,
        price: Object.freeze({ state: "pending" as const }),
      }),
    });
  }));
}

describe("public pricing snapshot propagation", () => {
  beforeEach(() => {
    receivedPricing.length = 0;
    receivedProducts.length = 0;
    panelPricing.length = 0;
    relatedPricing.length = 0;
    relatedCardPricing.length = 0;
  });

  it("forwards one exact pricing object reference through CatalogExplorer to every card", () => {
    const pricing = testPricingContext("production");
    const selectedProducts = products.slice(0, 2);
    render(
      <CatalogExplorer
        discoveryRows={syntheticDiscoveryRows(selectedProducts)}
        pricing={pricing}
        products={selectedProducts}
      />,
    );

    expect(receivedPricing).toHaveLength(2);
    for (const received of receivedPricing) expect(received).toBe(pricing);
    expect(receivedProducts).toHaveLength(2);
    expect(new Set(receivedProducts)).toEqual(new Set(selectedProducts));
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
    render(<CatalogItemDetail calculator={null} product={testCanonicalProduct()} pricing={pricing} relatedProducts={[]} />);
    expect(panelPricing).toHaveLength(1); expect(panelPricing[0]).toBe(pricing);
  });

  it("does not replace the snapshot with a client mode", () => {
    const pricing = testPricingContext("production"); render(<CatalogItemDetail calculator={null} product={testCanonicalProduct()} pricing={pricing} relatedProducts={[]} />); expect(panelPricing[0]).toBe(pricing);
  });

  it("keeps the exact snapshot through detail, carousel, and every related card", () => {
    const pricing = testPricingContext("production");
    const related = [testCanonicalProduct([testPublicVariant({ id: "related-v1" })], { id: "related-1", name: "Related 1" }), testCanonicalProduct([testPublicVariant({ id: "related-v2" })], { id: "related-2", name: "Related 2" })];
    render(<CatalogItemDetail calculator={null} product={testCanonicalProduct()} pricing={pricing} relatedProducts={related} />);
    expect(panelPricing[0]).toBe(pricing);
    expect(relatedPricing[0]).toBe(pricing);
    expect(relatedCardPricing).toHaveLength(2);
    expect(relatedCardPricing.every((received) => received === pricing)).toBe(true);
  });
});
