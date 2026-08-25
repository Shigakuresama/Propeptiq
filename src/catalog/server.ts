import "server-only";

import { connection } from "next/server";

import { readServerEnv } from "@/env";
import { withRuntimeTransaction } from "@/db/runtime";

import { loadCatalogRecordSet } from "./catalog-source";
import { loadDatabaseCatalogRecords } from "./database-catalog";
import { buildPublicCatalog } from "./public-catalog";
import type { PublicCatalog } from "./types";

export async function getPublicCatalog(): Promise<PublicCatalog> {
  await connection();
  const environment = readServerEnv();
  const records = await loadCatalogRecordSet(
    environment,
    undefined,
    (environment) =>
      withRuntimeTransaction(environment, loadDatabaseCatalogRecords),
  );
  return buildPublicCatalog(records);
}
