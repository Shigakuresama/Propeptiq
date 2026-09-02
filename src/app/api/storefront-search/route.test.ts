import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PublicStorefrontProduct } from "@/catalog/storefront-public";
import type { ApprovedPublicInformation } from "@/content/public-information";
import type {
  StorefrontSearchIndex,
  StorefrontSearchIndexInput,
} from "@/search/storefront-index";

const {
  defaultLoadView,
  defaultLoadContentView,
  defaultBuildIndex,
} = vi.hoisted(() => ({
  defaultLoadView: vi.fn(),
  defaultLoadContentView: vi.fn(),
  defaultBuildIndex: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/catalog/storefront-public-server", () => ({
  getPublicStorefrontView: defaultLoadView,
}));
vi.mock("@/content/storefront-public-content-server", () => ({
  getPublicStorefrontContentView: defaultLoadContentView,
}));
vi.mock("@/search/storefront-index", () => ({
  buildStorefrontSearchIndex: defaultBuildIndex,
}));

import * as route from "./route";
import { GET } from "./route";
import { createStorefrontSearchHandler } from "@/search/storefront-search-handler";

const emptyIndex: StorefrontSearchIndex = Object.freeze({
  version: 1,
  entries: Object.freeze([]),
});
const safeIndex: StorefrontSearchIndex = Object.freeze({
  version: 1,
  entries: Object.freeze([
    Object.freeze({
      id: "product:synthetic-route-item",
      group: "products" as const,
      title: "Synthetic Route Item",
      href: "/catalog/items/synthetic-route-item",
      description: "Synthetic approved route description.",
      exactTerms: Object.freeze(["SYN-ROUTE-5"]),
      keywords: Object.freeze(["Synthetic category"]),
      popularityRank: 5,
    }),
  ]),
});
const defaultInformationRows = Object.freeze([
  Object.freeze({ synthetic: "default-information-row" }),
]);

function request(suffix = ""): Request {
  return new Request(`https://example.test/api/storefront-search${suffix}`);
}

function syntheticBrowseProduct(): PublicStorefrontProduct {
  return {
    kind: "browse_only",
    id: null,
    slug: "synthetic-route-item",
    name: "Synthetic Route Item",
    sourceName: "Synthetic Route Source",
    category: "Synthetic category",
    image: {
      src: "/synthetic-route-image.png",
      alt: "Synthetic route image",
      width: 640,
      height: 640,
    },
    displayConfigurations: [{
      displayCode: "SYN-ROUTE-5",
      packageForm: "5 mg synthetic package",
    }],
    defaultVariantId: null,
    variants: [],
    pricingState: "pricing_pending",
  };
}

function recursivelyCollectKeysAndValues(
  value: unknown,
  keys: string[] = [],
  values: unknown[] = [],
): Readonly<{ keys: readonly string[]; values: readonly unknown[] }> {
  if (Array.isArray(value)) {
    for (const item of value) recursivelyCollectKeysAndValues(item, keys, values);
    return { keys, values };
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      keys.push(key);
      values.push(nested);
      recursivelyCollectKeysAndValues(nested, keys, values);
    }
  }
  return { keys, values };
}

async function expectUnavailableResponse(
  handler: (request: Request) => Promise<Response>,
): Promise<string> {
  const response = await handler(request());
  const text = await response.text();

  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toBe("application/json");
  expect(JSON.parse(text)).toEqual({ code: "SEARCH_INDEX_UNAVAILABLE" });
  return text;
}

beforeEach(() => {
  vi.clearAllMocks();
  defaultLoadView.mockResolvedValue({
    catalog: { products: [{ synthetic: "default-product-row" }] },
  });
  defaultLoadContentView.mockResolvedValue({
    homepage: {
      whyChoose: [{
        id: "server-view-homepage-must-not-cross",
        title: "Server view homepage must not cross",
        body: "Server view body must not cross.",
      }],
      faqs: [],
    },
    information: defaultInformationRows,
  });
  defaultBuildIndex.mockReturnValue(safeIndex);
});

describe("GET /api/storefront-search", () => {
  it("exports only the supported GET route handler", () => {
    expect(Object.keys(route)).toEqual(["GET"]);
  });

  it("uses the pre-import storefront and content-view accessors and builder exactly once", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, must-revalidate",
    );
    await expect(response.json()).resolves.toEqual(safeIndex);
    expect(defaultLoadView).toHaveBeenCalledTimes(1);
    expect(defaultLoadContentView).toHaveBeenCalledTimes(1);
    expect(defaultBuildIndex).toHaveBeenCalledTimes(1);
    expect(defaultBuildIndex).toHaveBeenCalledWith({
      products: [{ synthetic: "default-product-row" }],
      information: [{ synthetic: "default-information-row" }],
    });
    const defaultInput = defaultBuildIndex.mock.calls[0]![0] as
      StorefrontSearchIndexInput;
    expect(Object.keys(defaultInput)).toEqual(["products", "information"]);
    expect(defaultInput.information).toBe(defaultInformationRows);
    expect(JSON.stringify(defaultBuildIndex.mock.calls[0])).not.toContain(
      "server-view-homepage-must-not-cross",
    );
  });

  it.each([
    [
      "synchronous content-view failure",
      () => { throw new Error("content-view-sync-sensitive-detail"); },
    ],
    [
      "rejected content-view failure",
      () => Promise.reject(new Error("content-view-reject-sensitive-detail")),
    ],
    ["null server view", () => Promise.resolve(null)],
    ["missing information", () => Promise.resolve({ homepage: {} })],
    [
      "non-array information",
      () => Promise.resolve({ homepage: {}, information: {} }),
    ],
  ])("contains a %s behind the fixed default-route failure", async (_label, loadContentView) => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    defaultLoadContentView.mockImplementationOnce(loadContentView);

    try {
      const text = await expectUnavailableResponse(GET);

      expect(defaultLoadView).toHaveBeenCalledTimes(1);
      expect(defaultLoadContentView).toHaveBeenCalledTimes(1);
      expect(defaultBuildIndex).not.toHaveBeenCalled();
      expect(errorLog.mock.calls).toEqual([
        ["STOREFRONT_SEARCH_INDEX_UNAVAILABLE"],
      ]);
      expect(text).not.toMatch(/content-view|sensitive|homepage/iu);
    } finally {
      errorLog.mockRestore();
    }
  });

  it("supports product-only and fully empty success through the injected factory", async () => {
    const product = syntheticBrowseProduct();
    const buildIndex = vi.fn((input: StorefrontSearchIndexInput) => {
      if (input.products.length === 0) return emptyIndex;
      return safeIndex;
    });
    const productOnly = createStorefrontSearchHandler({
      loadView: async () => ({ catalog: { products: [product] } }),
      loadInformation: () => [],
      buildIndex,
    });
    const fullyEmpty = createStorefrontSearchHandler({
      loadView: async () => ({ catalog: { products: [] } }),
      loadInformation: () => [],
      buildIndex,
    });

    await expect((await productOnly(request())).json()).resolves.toEqual(safeIndex);
    await expect((await fullyEmpty(request())).json()).resolves.toEqual(emptyIndex);
    expect(buildIndex).toHaveBeenNthCalledWith(1, {
      products: [product],
      information: [],
    });
    expect(buildIndex).toHaveBeenNthCalledWith(2, {
      products: [],
      information: [],
    });
  });

  it.each(["?q=synthetic-secret-query", "?q=", "?unsupported"])(
    "rejects the nonempty query string %s without echo, logging, loading, or reporting",
    async (suffix) => {
      const loadView = vi.fn();
      const loadInformation = vi.fn();
      const buildIndex = vi.fn();
      const reportUnavailable = vi.fn();
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const warningLog = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const handler = createStorefrontSearchHandler({
        loadView,
        loadInformation,
        buildIndex,
        reportUnavailable,
      });

      try {
        const response = await handler(request(suffix));
        const text = await response.text();

        expect(response.status).toBe(400);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("content-type")).toBe("application/json");
        expect(JSON.parse(text)).toEqual({
          code: "SEARCH_INDEX_QUERY_UNSUPPORTED",
        });
        expect(text).not.toContain("synthetic-secret-query");
        expect(loadView).not.toHaveBeenCalled();
        expect(loadInformation).not.toHaveBeenCalled();
        expect(buildIndex).not.toHaveBeenCalled();
        expect(reportUnavailable).not.toHaveBeenCalled();
        expect(errorLog).not.toHaveBeenCalled();
        expect(warningLog).not.toHaveBeenCalled();
      } finally {
        errorLog.mockRestore();
        warningLog.mockRestore();
      }
    },
  );

  it("treats a parser-normalized raw trailing question mark as query-free", async () => {
    const handler = createStorefrontSearchHandler({
      loadView: async () => ({ catalog: { products: [] } }),
      loadInformation: () => [],
      buildIndex: () => emptyIndex,
    });

    expect((await handler(request("?"))).status).toBe(200);
  });

  it.each([
    ["synchronous storefront failure", () => { throw new Error("sync-sensitive-detail"); }],
    ["rejected storefront failure", () => Promise.reject(new Error("async-sensitive-detail"))],
    ["missing catalog", async () => ({ unrelated: true })],
    ["missing products", async () => ({ catalog: {} })],
    ["non-array products", async () => ({ catalog: { products: {} } })],
  ])("contains %s as the exact safe unavailable response", async (_label, loadView) => {
    const loadViewSpy = vi.fn(loadView);
    const loadInformation = vi.fn();
    const buildIndex = vi.fn();
    const reportUnavailable = vi.fn();
    const handler = createStorefrontSearchHandler({
      loadView: loadViewSpy,
      loadInformation,
      buildIndex,
      reportUnavailable,
    });

    const text = await expectUnavailableResponse(handler);

    expect(loadViewSpy).toHaveBeenCalledTimes(1);
    expect(loadInformation).not.toHaveBeenCalled();
    expect(buildIndex).not.toHaveBeenCalled();
    expect(reportUnavailable).toHaveBeenCalledTimes(1);
    expect(reportUnavailable).toHaveBeenCalledWith(
      "STOREFRONT_SEARCH_INDEX_UNAVAILABLE",
    );
    expect(text).not.toMatch(/sync-sensitive|async-sensitive|unrelated/iu);
  });

  it("contains malformed approved-information results without a fake empty success", async () => {
    const product = syntheticBrowseProduct();
    const reportUnavailable = vi.fn();
    const invalidArrayHandler = createStorefrontSearchHandler({
      loadView: async () => ({ catalog: { products: [product] } }),
      loadInformation: () => ({}),
      buildIndex: () => emptyIndex,
      reportUnavailable,
    });

    await expectUnavailableResponse(invalidArrayHandler);
    expect(reportUnavailable).toHaveBeenCalledWith(
      "STOREFRONT_SEARCH_INDEX_UNAVAILABLE",
    );

    const actualIndex = await vi.importActual<
      typeof import("@/search/storefront-index")
    >("@/search/storefront-index");
    const malformedRecordHandler = createStorefrontSearchHandler({
      loadView: async () => ({ catalog: { products: [product] } }),
      loadInformation: () => [{
        id: "synthetic-malformed-information",
        title: "Synthetic malformed information",
        href: "/quality-records",
        description: "Synthetic malformed fixture.",
        keywords: [9],
        status: "approved",
      }] as unknown as readonly ApprovedPublicInformation[],
      buildIndex: actualIndex.buildStorefrontSearchIndex,
      reportUnavailable,
    });

    await expectUnavailableResponse(malformedRecordHandler);
    expect(reportUnavailable).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      "synchronous approved-information loader failure",
      () => { throw new Error("information-sync-sensitive-detail"); },
    ],
    [
      "rejected approved-information loader failure",
      () => Promise.reject(new Error("information-reject-sensitive-detail")),
    ],
  ])("contains an injected %s behind the fixed 503", async (_label, failingLoader) => {
    const loadView = vi.fn(async () => ({ catalog: { products: [] } }));
    const loadInformation = vi.fn(failingLoader);
    const buildIndex = vi.fn(() => emptyIndex);
    const reportUnavailable = vi.fn();
    const handler = createStorefrontSearchHandler({
      loadView,
      loadInformation,
      buildIndex,
      reportUnavailable,
    });

    const text = await expectUnavailableResponse(handler);

    expect(loadView).toHaveBeenCalledTimes(1);
    expect(loadInformation).toHaveBeenCalledTimes(1);
    expect(buildIndex).not.toHaveBeenCalled();
    expect(reportUnavailable.mock.calls).toEqual([
      ["STOREFRONT_SEARCH_INDEX_UNAVAILABLE"],
    ]);
    expect(text).not.toMatch(/information-(?:sync|reject)|sensitive/iu);
  });

  it.each([
    [
      "sparse display configurations",
      () => ({
        products: [{
          ...syntheticBrowseProduct(),
          displayConfigurations: new Array(1),
        }] as unknown as readonly PublicStorefrontProduct[],
        information: [] as readonly ApprovedPublicInformation[],
      }),
    ],
    [
      "sparse information keywords",
      () => ({
        products: [] as readonly PublicStorefrontProduct[],
        information: [{
          id: "synthetic-sparse-information",
          title: "Synthetic sparse information",
          href: "/quality-records",
          description: "Synthetic sparse information fixture.",
          keywords: new Array(1),
          status: "approved",
        }] as unknown as readonly ApprovedPublicInformation[],
      }),
    ],
  ] as const)("contains %s as the fixed 503 response", async (_label, makeInput) => {
    const input = makeInput();
    const actualIndex = await vi.importActual<
      typeof import("@/search/storefront-index")
    >("@/search/storefront-index");
    const reportUnavailable = vi.fn();
    const handler = createStorefrontSearchHandler({
      loadView: async () => ({ catalog: { products: input.products } }),
      loadInformation: () => input.information,
      buildIndex: actualIndex.buildStorefrontSearchIndex,
      reportUnavailable,
    });

    const text = await expectUnavailableResponse(handler);

    expect(reportUnavailable).toHaveBeenCalledWith(
      "STOREFRONT_SEARCH_INDEX_UNAVAILABLE",
    );
    expect(text).not.toMatch(/sparse|display|keyword/iu);
  });

  it("contains injected builder failures and never leaks the thrown value", async () => {
    const loadView = vi.fn(async () => ({ catalog: { products: [] } }));
    const loadInformation = vi.fn(() => []);
    const buildIndex = vi.fn(() => {
      throw new Error("builder-sensitive-detail");
    });
    const reportUnavailable = vi.fn();
    const handler = createStorefrontSearchHandler({
      loadView,
      loadInformation,
      buildIndex,
      reportUnavailable,
    });

    const text = await expectUnavailableResponse(handler);

    expect(loadView).toHaveBeenCalledTimes(1);
    expect(loadInformation).toHaveBeenCalledTimes(1);
    expect(buildIndex).toHaveBeenCalledTimes(1);
    expect(reportUnavailable).toHaveBeenCalledWith(
      "STOREFRONT_SEARCH_INDEX_UNAVAILABLE",
    );
    expect(text).not.toContain("builder-sensitive-detail");
  });

  it("contains serialization failures inside the same safe boundary", async () => {
    const reportUnavailable = vi.fn();
    const handler = createStorefrontSearchHandler({
      loadView: async () => ({ catalog: { products: [] } }),
      loadInformation: () => [],
      buildIndex: () => ({
        version: 1,
        entries: [{ unsafeBigInt: 1n }],
      }) as unknown as StorefrontSearchIndex,
      reportUnavailable,
    });

    const text = await expectUnavailableResponse(handler);

    expect(reportUnavailable).toHaveBeenCalledWith(
      "STOREFRONT_SEARCH_INDEX_UNAVAILABLE",
    );
    expect(text).not.toMatch(/BigInt|unsafeBigInt/iu);
  });

  it("suppresses a throwing reporter while retaining the fixed diagnostic contract", async () => {
    const reportUnavailable = vi.fn(() => {
      throw new Error("reporter-sensitive-detail");
    });
    const handler = createStorefrontSearchHandler({
      loadView: async () => {
        throw new Error("load-sensitive-detail");
      },
      reportUnavailable,
    });

    const text = await expectUnavailableResponse(handler);

    expect(reportUnavailable).toHaveBeenCalledTimes(1);
    expect(reportUnavailable).toHaveBeenCalledWith(
      "STOREFRONT_SEARCH_INDEX_UNAVAILABLE",
    );
    expect(text).not.toMatch(/reporter-sensitive|load-sensitive/iu);
  });

  it("reports only the literal fixed diagnostic through the default reporter", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    defaultLoadView.mockRejectedValueOnce(new Error("default-sensitive-detail"));

    try {
      const text = await expectUnavailableResponse(GET);

      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(errorLog).toHaveBeenCalledWith(
        "STOREFRONT_SEARCH_INDEX_UNAVAILABLE",
      );
      expect(text).not.toContain("default-sensitive-detail");
    } finally {
      errorLog.mockRestore();
    }
  });

  it("keeps the exact production content view information-empty without fabricated FAQ or Why copy", async () => {
    const actualContent = await vi.importActual<
      typeof import("@/content/storefront-public-content-server")
    >("@/content/storefront-public-content-server");
    const actualIndex = await vi.importActual<
      typeof import("@/search/storefront-index")
    >("@/search/storefront-index");
    const handler = createStorefrontSearchHandler({
      loadView: async () => ({ catalog: { products: [] } }),
      loadInformation: async () =>
        (await actualContent.getPublicStorefrontContentView()).information,
      buildIndex: actualIndex.buildStorefrontSearchIndex,
    });

    const response = await handler(request());
    const body = await response.json() as StorefrontSearchIndex;

    expect(response.status).toBe(200);
    expect(body).toEqual({ version: 1, entries: [] });
    expect(body.entries.filter(({ group }) => group === "information")).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/why choose|frequently asked|faq/iu);
  });

  it("serializes only the wrapper and eight SearchEntry fields without raw records or server-view leakage", async () => {
    const actualIndex = await vi.importActual<
      typeof import("@/search/storefront-index")
    >("@/search/storefront-index");
    const handler = createStorefrontSearchHandler({
      loadView: async () => ({
        catalog: {
          products: [syntheticBrowseProduct()],
          serverOnlyCatalogSecret: "catalog-sensitive-detail",
        },
        pricing: {
          provider: "provider-sensitive-detail",
          inventory: "inventory-sensitive-detail",
        },
      }),
      loadInformation: async () => [{
        id: "synthetic-approved-route-information",
        title: "Synthetic approved route information",
        href: "/quality-records",
        description: "Synthetic approved route information body.",
        keywords: ["synthetic approved route"],
        status: "approved",
        kind: "faq",
        sourceReferences: ["source-reference-sensitive-detail"],
        approvalNote: "approval-note-sensitive-detail",
        reviewedAt: "2026-08-31T00:00:00.000Z",
        effectiveAt: "2026-08-31T00:00:00.000Z",
        homepage: { whyChoose: "server-view-sensitive-detail" },
      }] as unknown as readonly ApprovedPublicInformation[],
      buildIndex: actualIndex.buildStorefrontSearchIndex,
    });
    const response = await handler(request());
    const body = await response.json() as unknown;

    expect(Object.keys(body as object)).toEqual(["version", "entries"]);
    const entries = (body as { entries: readonly Record<string, unknown>[] }).entries;
    for (const entry of entries) {
      expect(Object.keys(entry)).toEqual([
        "id",
        "group",
        "title",
        "href",
        "description",
        "exactTerms",
        "keywords",
        "popularityRank",
      ]);
    }

    const collected = recursivelyCollectKeysAndValues(body);
    const forbiddenKeys = [
      "status",
      "kind",
      "content",
      "homepage",
      "whyChoose",
      "faqs",
      "question",
      "answer",
      "anchor",
      "sourceReferences",
      "approvalNote",
      "reviewedAt",
      "effectiveAt",
      "productId",
      "variantId",
      "baseUnitMinor",
      "currency",
      "availability",
      "checkoutReady",
      "stripeProductId",
      "stripePriceId",
      "image",
      "provider",
      "inventory",
      "serverOnlyCatalogSecret",
    ];
    expect(collected.keys.filter((key) => forbiddenKeys.includes(key))).toEqual([]);
    expect(JSON.stringify(collected.values)).not.toMatch(
      /catalog-sensitive|provider-sensitive|inventory-sensitive|source-reference-sensitive|approval-note-sensitive|server-view-sensitive|2026-08-31/iu,
    );
  });

  it("keeps the endpoint boundary server-only, GET-only, and free of query scoring", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/app/api/storefront-search/route.ts"),
      "utf8",
    );
    const importSpecifiers = Array.from(
      source.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/gu),
      (match) => match[1]!,
    );

    expect(importSpecifiers.sort()).toEqual([
      "@/search/storefront-search-handler",
      "server-only",
    ]);
    expect(
      importSpecifiers.some((specifier) =>
        /(?:^|[/_-])(?:env|database|db|checkout|stripe|payment|inventory|provider|storefront-content)(?:$|[/_-])/iu
          .test(specifier),
      ),
    ).toBe(false);
    expect(source).not.toMatch(
      /\b(?:searchEntries|normalizeSearchText|scoreEntry|POST|PUT|PATCH|DELETE)\b/u,
    );
  });
});
