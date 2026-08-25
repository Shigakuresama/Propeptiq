import "server-only";

import { serverEnv } from "@/env";

import { loadCatalogRecordSet } from "./catalog-source";
import { buildPublicCatalog } from "./public-catalog";
import type { PublicCatalog } from "./types";

export async function getPublicCatalog(): Promise<PublicCatalog> {
  const records = await loadCatalogRecordSet(serverEnv);
  return buildPublicCatalog(records);
}
