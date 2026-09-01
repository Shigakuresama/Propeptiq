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
  getPublicStorefrontViewMock,
  notFoundMock,
  requestCacheState,
  detailProps,
} = vi.hoisted(() => ({
  getPublicBrowseCatalogMock: vi.fn(),
  getPublicStorefrontViewMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  requestCacheState: { generation: 0 },
  detailProps: [] as Array<{ product: unknown; pricing: unknown }>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <Args extends unknown[], Result>(
      loader: (...args: Args) => Result,
    ) => {
      let cached: { generation: number; result: Result } | undefined;
      return (...args: Args): Result => {
        if (!cached || cached.generation !== requestCacheState.generation) {
          cached = {
            generation: requestCacheState.generation,
            result: loader(...args),
          };
        }
        return cached.result;
      };
    },
  };
});

vi.mock("@/catalog/browse-catalog-server", () => ({
  getPublicBrowseCatalog: getPublicBrowseCatalogMock,
}));
vi.mock("@/catalog/storefront-public-server", () => ({
  getPublicStorefrontView: getPublicStorefrontViewMock,
}));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/components/site/page-transition", () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/commerce/catalog-item-detail", () => ({
  CatalogItemDetail: (props: { product: { name: string }; pricing: unknown }) => { detailProps.push(props); return <h1>{props.product.name}</h1>; },
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
    vi.clearAllMocks();
    detailProps.length = 0;
    requestCacheState.generation += 1;
    getPublicBrowseCatalogMock.mockRejectedValue(
      new Error("legacy browse loader must not own the retained route"),
    );
    getPublicStorefrontViewMock.mockResolvedValue({ catalog: projectedCatalog, pricing: { mode: "test", evaluatedAt: "2026-08-31T12:00:00.000Z", automaticPromotions: [] } });
  });

  it("renders an owner-published product through the safe storefront projection", async () => {
    render(
      await CatalogItemPage({ params: Promise.resolve({ slug: "tirzepatide" }) }),
    );

    expect(screen.getByRole("heading", { level: 1, name: "Tirzepatide" })).toBeVisible();
    expect(getPublicStorefrontViewMock).toHaveBeenCalledTimes(1);
    expect(getPublicBrowseCatalogMock).not.toHaveBeenCalled();
  });

  it("shares one catalog acquisition between metadata and page rendering per request", async () => {
    const params = Promise.resolve({ slug: "tirzepatide" });

    await generateMetadata({ params });
    render(await CatalogItemPage({ params }));

    expect(getPublicStorefrontViewMock).toHaveBeenCalledOnce();
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

  it("passes one exact pricing snapshot from the cached view to detail", async () => {
    const pricing = { mode: "test" as const, evaluatedAt: "2026-08-31T12:00:00.000Z", automaticPromotions: [] };
    getPublicStorefrontViewMock.mockResolvedValue({ catalog: projectedCatalog, pricing });
    await generateMetadata({ params: Promise.resolve({ slug: "tirzepatide" }) });
    render(await CatalogItemPage({ params: Promise.resolve({ slug: "tirzepatide" }) }));
    expect(getPublicStorefrontViewMock).toHaveBeenCalledOnce(); expect(detailProps[0]?.pricing).toBe(pricing);
  });
});
