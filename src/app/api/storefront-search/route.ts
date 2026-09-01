import "server-only";

import { getPublicStorefrontView } from "@/catalog/storefront-public-server";
import { getPublicStorefrontContentView } from "@/content/storefront-public-content-server";
import {
  buildStorefrontSearchIndex,
  type StorefrontSearchIndex,
  type StorefrontSearchIndexInput,
} from "@/search/storefront-index";

const UNAVAILABLE_DIAGNOSTIC = "STOREFRONT_SEARCH_INDEX_UNAVAILABLE" as const;

export type StorefrontSearchRouteDependencies = Readonly<{
  loadView?: () => Promise<unknown>;
  loadInformation?: () => unknown | Promise<unknown>;
  buildIndex?: (
    input: StorefrontSearchIndexInput,
  ) => StorefrontSearchIndex;
  reportUnavailable?: (code: typeof UNAVAILABLE_DIAGNOSTIC) => void;
}>;

function defaultUnavailableReporter(code: typeof UNAVAILABLE_DIAGNOSTIC): void {
  console.error(code);
}

function jsonResponse(
  body: unknown,
  status: number,
  cacheControl: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheControl,
    },
  });
}

function unavailableResponse(): Response {
  return jsonResponse(
    { code: "SEARCH_INDEX_UNAVAILABLE" },
    503,
    "no-store",
  );
}

export function createStorefrontSearchHandler(
  dependencies: StorefrontSearchRouteDependencies = {},
): (request: Request) => Promise<Response> {
  const loadView = dependencies.loadView ?? getPublicStorefrontView;
  const loadInformation =
    dependencies.loadInformation ??
      (async () => (await getPublicStorefrontContentView()).information);
  const buildIndex = dependencies.buildIndex ?? buildStorefrontSearchIndex;
  const reportUnavailable =
    dependencies.reportUnavailable ?? defaultUnavailableReporter;

  return async function storefrontSearchGET(request: Request): Promise<Response> {
    if (new URL(request.url).search.length > 0) {
      return jsonResponse(
        { code: "SEARCH_INDEX_QUERY_UNSUPPORTED" },
        400,
        "no-store",
      );
    }

    try {
      const view = await loadView();
      if (view === null || typeof view !== "object" || Array.isArray(view)) {
        throw new TypeError("Malformed storefront view");
      }
      const catalog = (view as Record<string, unknown>).catalog;
      if (
        catalog === null ||
        typeof catalog !== "object" ||
        Array.isArray(catalog)
      ) {
        throw new TypeError("Malformed storefront catalog");
      }
      const products = (catalog as Record<string, unknown>).products;
      if (!Array.isArray(products)) {
        throw new TypeError("Malformed storefront products");
      }

      const information = await loadInformation();
      if (!Array.isArray(information)) {
        throw new TypeError("Malformed approved information");
      }
      const index = buildIndex({
        products: products as StorefrontSearchIndexInput["products"],
        information: information as StorefrontSearchIndexInput["information"],
      });
      return jsonResponse(
        index,
        200,
        "public, max-age=0, must-revalidate",
      );
    } catch {
      try {
        reportUnavailable(UNAVAILABLE_DIAGNOSTIC);
      } catch {
        // Diagnostics are best-effort and must not change the safe response.
      }
      return unavailableResponse();
    }
  };
}

const defaultGET = createStorefrontSearchHandler();

export async function GET(request: Request): Promise<Response> {
  return defaultGET(request);
}
