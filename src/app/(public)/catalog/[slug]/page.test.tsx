import { beforeEach, describe, expect, it, vi } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildPublicStorefrontCatalog,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";

const {
  getPublicStorefrontViewMock,
  legacyGetPublicCatalogMock,
  notFoundMock,
  redirectMock,
  requestCacheState,
} = vi.hoisted(() => ({
  getPublicStorefrontViewMock: vi.fn(),
  legacyGetPublicCatalogMock: vi.fn(() => {
    throw new Error("legacy catalog bypass invoked");
  }),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirectMock: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
  requestCacheState: { generation: 0 },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <Args extends unknown[], Result>(loader: (...args: Args) => Result) => {
      let cached: { generation: number; result: Result } | undefined;
      return (...args: Args): Result => {
        if (!cached || cached.generation !== requestCacheState.generation) {
          cached = { generation: requestCacheState.generation, result: loader(...args) };
        }
        return cached.result;
      };
    },
  };
});

vi.mock("@/catalog/server", () => ({ getPublicCatalog: legacyGetPublicCatalogMock }));
vi.mock("@/catalog/storefront-public-server", () => ({
  getPublicStorefrontView: getPublicStorefrontViewMock,
}));
vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}));

import LegacyProductPage, { generateMetadata } from "./page";

const projectedCatalog = buildPublicStorefrontCatalog({
  configuredPublicationId: browseCatalogPublicationId,
  catalogData: storefrontCatalogData,
  runtimeVariantFacts: [],
  controlledContent: [],
  verifiedImageMetadata: storefrontImageMetadata,
});

const pricing = Object.freeze({
  mode: "test" as const,
  evaluatedAt: "2026-08-31T12:00:00.000Z",
  automaticPromotions: Object.freeze([]),
});

describe("legacy catalog product route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestCacheState.generation += 1;
    getPublicStorefrontViewMock.mockResolvedValue({ catalog: projectedCatalog, pricing });
  });

  it("redirects an owner-published slug to its canonical item route", async () => {
    await expect(
      LegacyProductPage({ params: Promise.resolve({ slug: "tirzepatide" }) }),
    ).rejects.toThrow("NEXT_REDIRECT:/catalog/items/tirzepatide");

    expect(redirectMock).toHaveBeenCalledOnce();
    expect(redirectMock).toHaveBeenCalledWith("/catalog/items/tirzepatide");
    expect(getPublicStorefrontViewMock).toHaveBeenCalledOnce();
    expect(legacyGetPublicCatalogMock).not.toHaveBeenCalled();
  });

  it("keeps an unknown slug on the not-found path without redirecting", async () => {
    await expect(
      LegacyProductPage({ params: Promise.resolve({ slug: "not-a-real-item" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(legacyGetPublicCatalogMock).not.toHaveBeenCalled();
  });

  it("fails closed when the authoritative storefront view cannot be loaded", async () => {
    const readError = new Error("authoritative storefront unavailable");
    getPublicStorefrontViewMock.mockRejectedValue(readError);

    await expect(
      LegacyProductPage({ params: Promise.resolve({ slug: "tirzepatide" }) }),
    ).rejects.toBe(readError);

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(legacyGetPublicCatalogMock).not.toHaveBeenCalled();
  });

  it("uses the canonical storefront record for legacy-route metadata", async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "tirzepatide" }) }),
    ).resolves.toEqual({
      title: "Tirzepatide",
      description: "Browse supplied catalog configurations for Tirzepatide.",
      alternates: { canonical: "/catalog/items/tirzepatide" },
    });

    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "not-a-real-item" }) }),
    ).resolves.toEqual({ title: "Catalog item unavailable" });
  });

  it("shares one authoritative acquisition between metadata and redirect per request", async () => {
    const params = Promise.resolve({ slug: "tirzepatide" });

    await generateMetadata({ params });
    await expect(LegacyProductPage({ params })).rejects.toThrow(
      "NEXT_REDIRECT:/catalog/items/tirzepatide",
    );

    expect(getPublicStorefrontViewMock).toHaveBeenCalledOnce();
  });
});
