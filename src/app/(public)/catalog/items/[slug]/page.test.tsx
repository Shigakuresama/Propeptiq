import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildPublicStorefrontCatalog,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";

const {
  getPublicBrowseCatalogMock,
  getPublicStorefrontCatalogMock,
  notFoundMock,
} = vi.hoisted(() => ({
  getPublicBrowseCatalogMock: vi.fn(),
  getPublicStorefrontCatalogMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/catalog/browse-catalog-server", () => ({
  getPublicBrowseCatalog: getPublicBrowseCatalogMock,
}));
vi.mock("@/catalog/storefront-public-server", () => ({
  getPublicStorefrontCatalog: getPublicStorefrontCatalogMock,
}));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/components/site/page-transition", () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import CatalogItemPage, { generateMetadata } from "./page";

const projectedCatalog = buildPublicStorefrontCatalog({
  configuredPublicationId: browseCatalogPublicationId,
  catalogData: storefrontCatalogData,
  runtimeVariantFacts: [],
  controlledContent: [],
  verifiedImageMetadata: storefrontImageMetadata,
});

describe("retained catalog item route", () => {
  beforeEach(() => {
    getPublicBrowseCatalogMock.mockRejectedValue(
      new Error("legacy browse loader must not own the retained route"),
    );
    getPublicStorefrontCatalogMock.mockResolvedValue(projectedCatalog);
  });

  it("renders an owner-published product through the safe storefront projection", async () => {
    render(
      await CatalogItemPage({ params: Promise.resolve({ slug: "tirzepatide" }) }),
    );

    expect(screen.getByRole("heading", { level: 1, name: "Tirzepatide" })).toBeVisible();
    expect(getPublicStorefrontCatalogMock).toHaveBeenCalledTimes(1);
    expect(getPublicBrowseCatalogMock).not.toHaveBeenCalled();
  });

  it("keeps unknown slugs on the not-found path", async () => {
    await expect(
      CatalogItemPage({ params: Promise.resolve({ slug: "not-a-real-item" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("generates metadata from the projected product and fails closed for an unknown slug", async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "tirzepatide" }) }),
    ).resolves.toEqual({
      title: "Tirzepatide",
      description: "Browse supplied catalog configurations for Tirzepatide.",
    });
    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "not-a-real-item" }) }),
    ).resolves.toEqual({ title: "Catalog item unavailable" });
  });
});
