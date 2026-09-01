import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildPublicStorefrontCatalog,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";
import {
  testCanonicalProduct,
  testPricingContext,
} from "@/components/commerce/storefront-test-fixtures";

const {
  buildCatalogDiscoveryRowsMock,
  explorerProps,
  getPublicBrowseCatalogMock,
  getPublicStorefrontViewMock,
} = vi.hoisted(() => ({
  buildCatalogDiscoveryRowsMock: vi.fn(),
  explorerProps: [] as Array<{
    products: readonly unknown[];
    pricing: unknown;
    discoveryRows: readonly unknown[];
  }>,
  getPublicBrowseCatalogMock: vi.fn(),
  getPublicStorefrontViewMock: vi.fn(),
}));

vi.mock("@/catalog/browse-catalog-server", () => ({
  getPublicBrowseCatalog: getPublicBrowseCatalogMock,
}));
vi.mock("@/catalog/storefront-public-server", () => ({
  getPublicStorefrontView: getPublicStorefrontViewMock,
}));
vi.mock("@/search/catalog-discovery", () => ({
  buildCatalogDiscoveryRows: buildCatalogDiscoveryRowsMock,
}));
vi.mock("@/components/commerce/catalog-explorer", () => ({
  CatalogExplorer: (props: {
    products: readonly { name: string }[];
    pricing: unknown;
    discoveryRows: readonly unknown[];
  }) => {
    explorerProps.push(props);
    return (
      <section aria-label="Synthetic catalog explorer">
        {props.products.map((product) => <article key={product.name}>{product.name}</article>)}
      </section>
    );
  },
}));
vi.mock("@/components/site/page-transition", () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import CatalogPage from "./page";

const projectedCatalog = buildPublicStorefrontCatalog({
  configuredPublicationId: browseCatalogPublicationId,
  catalogData: storefrontCatalogData,
  runtimeVariantFacts: [],
  controlledContent: [],
  verifiedImageMetadata: storefrontImageMetadata,
});
const projectedDiscoveryRows = Object.freeze([{ synthetic: "discovery-row" }]);

describe("retained browse catalog route", () => {
  const pricing = testPricingContext("test");

  beforeEach(() => {
    buildCatalogDiscoveryRowsMock.mockReset();
    buildCatalogDiscoveryRowsMock.mockReturnValue(projectedDiscoveryRows);
    explorerProps.length = 0;
    getPublicBrowseCatalogMock.mockReset();
    getPublicStorefrontViewMock.mockReset();
    getPublicBrowseCatalogMock.mockRejectedValue(
      new Error("legacy browse loader must not own the retained route"),
    );
    getPublicStorefrontViewMock.mockResolvedValue({ catalog: projectedCatalog, pricing });
  });

  it("renders all 56 projected products and describes all 103 display configurations", async () => {
    render(await CatalogPage());

    expect(screen.getAllByRole("article")).toHaveLength(56);
    expect(
      screen.getByText(/56 product families and 103 supplied package configurations/iu),
    ).toBeVisible();
    expect(getPublicStorefrontViewMock).toHaveBeenCalledTimes(1);
    expect(getPublicBrowseCatalogMock).not.toHaveBeenCalled();
    expect(buildCatalogDiscoveryRowsMock).toHaveBeenCalledTimes(1);
    expect(buildCatalogDiscoveryRowsMock).toHaveBeenCalledWith({
      products: projectedCatalog.products,
      pricing,
    });
    expect(explorerProps).toHaveLength(1);
    expect(explorerProps[0]?.products).toBe(projectedCatalog.products);
    expect(explorerProps[0]?.pricing).toBe(pricing);
    expect(explorerProps[0]?.discoveryRows).toBe(projectedDiscoveryRows);
  });

  it("uses neutral snapshot copy when a canonical product is present", async () => {
    getPublicStorefrontViewMock.mockResolvedValue({
      catalog: {
        publicationId: projectedCatalog.publicationId,
        products: [testCanonicalProduct()],
        displayConfigurationCount: 1,
      },
      pricing,
    });

    render(await CatalogPage());
    expect(screen.getByText(/current catalog price and availability snapshots are displayed where configured and revalidated before checkout/iu)).toBeVisible();
    expect(screen.queryByText(/prices and availability are intentionally excluded/iu)).toBeNull();
  });

  it("skips discovery projection and explorer rendering for an empty catalog", async () => {
    const emptyProducts = Object.freeze([]);
    getPublicStorefrontViewMock.mockResolvedValue({
      catalog: {
        publicationId: projectedCatalog.publicationId,
        products: emptyProducts,
        displayConfigurationCount: 0,
      },
      pricing,
    });

    render(await CatalogPage());

    expect(getPublicStorefrontViewMock).toHaveBeenCalledTimes(1);
    expect(buildCatalogDiscoveryRowsMock).not.toHaveBeenCalled();
    expect(explorerProps).toHaveLength(0);
    expect(screen.queryByRole("region", { name: "Synthetic catalog explorer" })).toBeNull();
    expect(screen.getByText("No owner-approved browse catalog is currently published.")).toBeVisible();
    expect(getPublicBrowseCatalogMock).not.toHaveBeenCalled();
  });
});
