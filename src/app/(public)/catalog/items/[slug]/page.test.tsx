import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { browseCatalogPublicationId } from "@/catalog/browse-catalog-publication";
import { storefrontCatalogData } from "@/catalog/storefront-catalog-data";
import {
  buildPublicStorefrontCatalog,
  storefrontImageMetadata,
} from "@/catalog/storefront-public";
import { publicCompoundResearch } from "@/content/compound-research";

const {
  getPublicBrowseCatalogMock,
  getPublicStorefrontViewMock,
  getCalculatorMock,
  notFoundMock,
  requestCacheState,
  detailProps,
} = vi.hoisted(() => ({
  getPublicBrowseCatalogMock: vi.fn(),
  getPublicStorefrontViewMock: vi.fn(),
  getCalculatorMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  requestCacheState: { generation: 0 },
  detailProps: [] as Array<{ product: unknown; pricing: unknown; relatedProducts: unknown; calculator: unknown; research: unknown }>,
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
vi.mock("@/config/concentration-calculator-server", () => ({
  getPublicConcentrationCalculatorConfiguration: getCalculatorMock,
}));
vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("@/components/site/page-transition", () => ({
  PageTransition: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/commerce/catalog-item-detail", () => ({
  CatalogItemDetail: (props: { product: { name: string }; pricing: unknown; relatedProducts: unknown; calculator: unknown; research: unknown }) => { detailProps.push(props); return <h1>{props.product.name}</h1>; },
}));

import CatalogItemPage, { generateMetadata } from "./page";
import { testCanonicalProduct, testPublicVariant } from "@/components/commerce/storefront-test-fixtures";

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
    getCalculatorMock.mockResolvedValue(null);
  });

  it("renders an owner-published product through the safe storefront projection", async () => {
    render(
      await CatalogItemPage({ params: Promise.resolve({ slug: "tirzepatide" }) }),
    );

    expect(screen.getByRole("heading", { level: 1, name: "Tirzepatide" })).toBeVisible();
    expect(getPublicStorefrontViewMock).toHaveBeenCalledTimes(1);
    expect(getCalculatorMock).toHaveBeenCalledTimes(1);
    expect(getPublicBrowseCatalogMock).not.toHaveBeenCalled();
    expect(detailProps[0]?.calculator).toBeNull();
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

  it("keeps a browse-only retained slug on the same snapshot route", async () => {
    getPublicStorefrontViewMock.mockResolvedValue({ catalog: projectedCatalog, pricing: { mode: "test", evaluatedAt: "2026-08-31T12:00:00.000Z", automaticPromotions: [] } });
    render(await CatalogItemPage({ params: Promise.resolve({ slug: "pinealon" }) }));
    expect(screen.getByRole("heading", { level: 1, name: "Pinealon" })).toBeVisible(); expect(screen.queryByRole("radio")).toBeNull();
  });

  it("uses a synthetic canonical view for exact metadata and panel-path pricing proof", async () => {
    const pricing = { mode: "test" as const, evaluatedAt: "2026-08-31T12:00:00.000Z", automaticPromotions: [] };
    const canonical = testCanonicalProduct([], { slug: "synthetic-canonical" });
    const catalog = { ...projectedCatalog, products: [canonical] };
    getPublicStorefrontViewMock.mockResolvedValue({ catalog, pricing });
    await expect(generateMetadata({ params: Promise.resolve({ slug: "synthetic-canonical" }) })).resolves.toMatchObject({ title: canonical.name });
    render(await CatalogItemPage({ params: Promise.resolve({ slug: "synthetic-canonical" }) }));
    expect(getPublicStorefrontViewMock).toHaveBeenCalledOnce(); expect(detailProps[0]?.pricing).toBe(pricing);
  });

  it("passes the configured filtered related slice and exact pricing reference", async () => {
    const pricing = { mode: "test" as const, evaluatedAt: "2026-08-31T12:00:00.000Z", automaticPromotions: [] };
    const first = testCanonicalProduct([testPublicVariant({ id: "related-first-v" })], { id: "related-first", slug: "related-first", name: "Related First" });
    const second = testCanonicalProduct([testPublicVariant({ id: "related-second-v" })], { id: "related-second", slug: "related-second", name: "Related Second" });
    const hidden = testCanonicalProduct([], { id: "related-hidden", slug: "related-hidden", name: "Related Hidden" });
    const current = testCanonicalProduct([], { slug: "synthetic-related-current", relatedProductIds: [second.id, first.id, first.id, hidden.id] });
    const catalog = { ...projectedCatalog, products: [first, current, hidden, second] };
    getPublicStorefrontViewMock.mockResolvedValue({ catalog, pricing });
    render(await CatalogItemPage({ params: Promise.resolve({ slug: current.slug }) }));
    expect(getPublicStorefrontViewMock).toHaveBeenCalledOnce();
    expect(detailProps[0]?.relatedProducts).toEqual([second, first]);
    expect(detailProps[0]?.relatedProducts).not.toContain(hidden);
    expect(detailProps[0]?.pricing).toBe(pricing);
  });

  it("forwards the exact safe calculator projection reference without reloading the catalog", async () => {
    const calculator = Object.freeze({
      title: "Synthetic approved calculator",
      body: "Synthetic approved body.",
      limits: Object.freeze({ maxVialMg: 100, maxDiluentMl: 50, maxSampleMl: 10 }),
    });
    const canonical = testCanonicalProduct([], { slug: "synthetic-calculator" });
    getPublicStorefrontViewMock.mockResolvedValue({
      catalog: { ...projectedCatalog, products: [canonical] },
      pricing: { mode: "test", evaluatedAt: "2026-08-31T12:00:00.000Z", automaticPromotions: [] },
    });
    getCalculatorMock.mockResolvedValue(calculator);

    render(await CatalogItemPage({ params: Promise.resolve({ slug: canonical.slug }) }));

    expect(getPublicStorefrontViewMock).toHaveBeenCalledOnce();
    expect(getCalculatorMock).toHaveBeenCalledOnce();
    expect(detailProps[0]?.calculator).toBe(calculator);
  });

  it("passes one exact verified bibliography entry and never the entire registry", async () => {
    const params = Promise.resolve({ slug: "tirzepatide" });
    await generateMetadata({ params });
    render(await CatalogItemPage({ params }));

    const research = detailProps[0]?.research;
    expect(research).toBe(publicCompoundResearch.compounds.find((entry) => entry.productSlug === "tirzepatide"));
    expect(research).toMatchObject({
      productSlug: "tirzepatide",
      studies: [{ pmid: "35658024" }, { pmid: "37385275" }],
    });
    expect(research).not.toHaveProperty("compounds");
    expect(JSON.stringify(research)).not.toMatch(/studiedAmount|outcomeSummary|verificationStatus|reviewedOn|benefitClaim|mechanism/u);
    expect(getPublicStorefrontViewMock).toHaveBeenCalledOnce();
  });

  it.each([
    ["5-amino-1mq", "5-amino-1mq"],
    ["aod-9604", "aod-9604"],
    ["ara-290", "ara-290"],
    ["bpc-157", "bpc-157"],
    ["cargrilintide", "cagrilintide"],
    ["cjc-1295-with-dac", "cjc-1295-with-dac"],
    ["ghk-cu", "ghk-cu"],
    ["hcg", "hcg"],
    ["igf-1-lr3", "igf-1-lr3"],
    ["ipamorelin", "ipamorelin"],
    ["mots-c", "mots-c"],
    ["nad-plus", "nad-plus"],
    ["retatrutide", "retatrutide"],
    ["semaglutide", "semaglutide"],
    ["sermorelin-acetate", "sermorelin-acetate"],
    ["ss-31", "ss-31"],
    ["survodutide", "survodutide"],
    ["tesmorelin", "tesamorelin"],
    ["thymosin-alpha-1", "thymosin-alpha-1"],
    ["tirzepatide", "tirzepatide"],
  ])("joins the exact approved compound on the %s product route", async (slug, compoundId) => {
    render(await CatalogItemPage({ params: Promise.resolve({ slug }) }));
    expect(detailProps[0]?.research).toMatchObject({ id: compoundId, productSlug: slug });
    expect(detailProps[0]?.research).not.toHaveProperty("compounds");
    expect(getPublicStorefrontViewMock).toHaveBeenCalledOnce();
  });

  it("does not infer a bibliography for an unmapped compound or similarly named blend", async () => {
    const canonical = testCanonicalProduct([], { slug: "tirzepatide-blend" });
    getPublicStorefrontViewMock.mockResolvedValue({
      catalog: { ...projectedCatalog, products: [canonical] },
      pricing: { mode: "test", evaluatedAt: "2026-08-31T12:00:00.000Z", automaticPromotions: [] },
    });
    render(await CatalogItemPage({ params: Promise.resolve({ slug: canonical.slug }) }));
    expect(detailProps[0]?.research).toBeNull();
  });

  it("keeps bibliography absent for a browse-only record even when its slug matches", async () => {
    const browseCatalog = buildPublicStorefrontCatalog({
      configuredPublicationId: browseCatalogPublicationId,
      catalogData: { products: [], bindings: { products: [], variants: [] } },
      runtimeVariantFacts: [],
      controlledContent: [],
      verifiedImageMetadata: storefrontImageMetadata,
    });
    getPublicStorefrontViewMock.mockResolvedValue({
      catalog: browseCatalog,
      pricing: { mode: "test", evaluatedAt: "2026-08-31T12:00:00.000Z", automaticPromotions: [] },
    });
    render(await CatalogItemPage({ params: Promise.resolve({ slug: "tirzepatide" }) }));
    expect(detailProps[0]?.product).toMatchObject({ kind: "browse_only", slug: "tirzepatide" });
    expect(detailProps[0]?.research).toBeNull();
    expect(getPublicStorefrontViewMock).toHaveBeenCalledOnce();
  });
});
