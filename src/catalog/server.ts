import "server-only";

import { connection } from "next/server";

import { readServerEnv } from "@/env";
import { withRuntimeTransaction } from "@/db/runtime";

import {
  EMPTY_CATALOG_RECORD_SET,
  loadCatalogRecordSet,
} from "./catalog-source";
import {
  CATALOG_SCHEMA_UNAVAILABLE_DIAGNOSTIC,
  isMissingCatalogSchemaError,
} from "./catalog-schema-availability";
import { loadDatabaseCatalogRecords } from "./database-catalog";
import { buildPublicCatalog } from "./public-catalog";
import type { PublicCatalog } from "./types";

async function reportMissingCatalogSchema(): Promise<void> {
  try {
    await Promise.resolve().then(() => {
      console.warn(CATALOG_SCHEMA_UNAVAILABLE_DIAGNOSTIC);
    });
  } catch {
    // Diagnostics are best effort and must not take a public reader down.
  }
}

export async function getPublicCatalog(): Promise<PublicCatalog> {
  await connection();
  const environment = readServerEnv();
  const records = await loadCatalogRecordSet(
    environment,
    undefined,
    (environment) =>
      withRuntimeTransaction(environment, async (client) => {
        try {
          return await loadDatabaseCatalogRecords(client);
        } catch (error: unknown) {
          if (!isMissingCatalogSchemaError(error)) throw error;
          await reportMissingCatalogSchema();
          return EMPTY_CATALOG_RECORD_SET;
        }
      }),
  );
  return buildPublicCatalog(records);
}
