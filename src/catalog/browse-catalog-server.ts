import "server-only";

import { connection } from "next/server";

import { readServerEnv } from "@/env";

import {
  resolvePublishedBrowseCatalog,
  type PublishedBrowseCatalog,
} from "./browse-catalog-publication";
import { storefrontCatalogData } from "./storefront-catalog-data";

export async function getPublicBrowseCatalog(): Promise<PublishedBrowseCatalog> {
  await connection();
  const environment = readServerEnv();
  return resolvePublishedBrowseCatalog(
    environment.BROWSE_CATALOG_PUBLICATION,
    storefrontCatalogData.bindings,
  );
}
