import "server-only";

import { createStorefrontSearchHandler } from "@/search/storefront-search-handler";

const defaultGET = createStorefrontSearchHandler();

export async function GET(request: Request): Promise<Response> {
  return defaultGET(request);
}
