import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildPublicStorefrontCatalog,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";
import { CartProvider } from "@/cart/cart-provider";
import {
  testCanonicalProduct,
  testPricingContext,
} from "@/components/commerce/storefront-test-fixtures";

const { getPublicBrowseCatalogMock, getPublicStorefrontViewMock } = vi.hoisted(() => ({
  getPublicBrowseCatalogMock: vi.fn(),
  getPublicStorefrontViewMock: vi.fn(),
}));

vi.mock("@/catalog/browse-catalog-server", () => ({
  getPublicBrowseCatalog: getPublicBrowseCatalogMock,
}));
vi.mock("@/catalog/storefront-public-server", () => ({
  getPublicStorefrontView: getPublicStorefrontViewMock,
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

describe("retained browse catalog route", () => {
  const pricing = testPricingContext("test");

  beforeEach(() => {
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

    render(<CartProvider>{await CatalogPage()}</CartProvider>);
    expect(screen.getByText(/current catalog price and availability snapshots are displayed where configured and revalidated before checkout/iu)).toBeVisible();
    expect(screen.queryByText(/prices and availability are intentionally excluded/iu)).toBeNull();
  });
});
