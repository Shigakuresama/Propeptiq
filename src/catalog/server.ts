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

export type PublicCatalogReadResult = Readonly<
  | { status: "available"; catalog: PublicCatalog }
  | { status: "schema_unavailable"; catalog: PublicCatalog }
>;

async function reportMissingCatalogSchema(): Promise<void> {
  try {
    await Promise.resolve().then(() =>
      console.warn(CATALOG_SCHEMA_UNAVAILABLE_DIAGNOSTIC),
    );
  } catch {
    // Diagnostics are best effort and must not take a public reader down.
  }
}

export async function getPublicCatalogRead(): Promise<PublicCatalogReadResult> {
  await connection();
  const environment = readServerEnv();
  let schemaUnavailable = false;
  const records = await loadCatalogRecordSet(
    environment,
    undefined,
    (environment) =>
      withRuntimeTransaction(environment, async (client) => {
        try {
          return await loadDatabaseCatalogRecords(client);
        } catch (error: unknown) {
          if (!isMissingCatalogSchemaError(error)) throw error;
          schemaUnavailable = true;
          await reportMissingCatalogSchema();
          return EMPTY_CATALOG_RECORD_SET;
        }
      }),
  );
  return Object.freeze({
    status: schemaUnavailable ? "schema_unavailable" : "available",
    catalog: buildPublicCatalog(records),
  });
}

export async function getPublicCatalog(): Promise<PublicCatalog> {
  return (await getPublicCatalogRead()).catalog;
}
