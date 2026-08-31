import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildPublicStorefrontCatalog,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";

const { getPublicBrowseCatalogMock, getPublicStorefrontCatalogMock } = vi.hoisted(() => ({
  getPublicBrowseCatalogMock: vi.fn(),
  getPublicStorefrontCatalogMock: vi.fn(),
}));

vi.mock("@/catalog/browse-catalog-server", () => ({
  getPublicBrowseCatalog: getPublicBrowseCatalogMock,
}));
vi.mock("@/catalog/storefront-public-server", () => ({
  getPublicStorefrontCatalog: getPublicStorefrontCatalogMock,
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
  beforeEach(() => {
    getPublicBrowseCatalogMock.mockRejectedValue(
      new Error("legacy browse loader must not own the retained route"),
    );
    getPublicStorefrontCatalogMock.mockResolvedValue(projectedCatalog);
  });

  it("renders all 56 projected products and describes all 103 display configurations", async () => {
    render(await CatalogPage());

    expect(screen.getAllByRole("article")).toHaveLength(56);
    expect(
      screen.getByText(/56 product families and 103 supplied package configurations/iu),
    ).toBeVisible();
    expect(getPublicStorefrontCatalogMock).toHaveBeenCalledTimes(1);
    expect(getPublicBrowseCatalogMock).not.toHaveBeenCalled();
  });
});
