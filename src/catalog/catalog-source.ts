import {
  hasProductionIdentity,
  type ServerEnv,
} from "@/config/env-schema";

import type { CatalogRecordSet } from "./types";

export const EMPTY_CATALOG_RECORD_SET: CatalogRecordSet = Object.freeze({
  source: "production",
  products: Object.freeze([]),
  prices: Object.freeze([]),
  lots: Object.freeze([]),
  coaDocuments: Object.freeze([]),
  claims: Object.freeze([]),
  promotions: Object.freeze([]),
  promotionTargets: Object.freeze([]),
});

type DemoLoader = () => Promise<CatalogRecordSet>;
type DatabaseLoader = (environment: ServerEnv) => Promise<CatalogRecordSet>;

export function assertCatalogDemoModeAllowed(environment: ServerEnv): void {
  if (
    environment.CATALOG_DEMO_MODE === "enabled" &&
    hasProductionIdentity(environment)
  ) {
    throw new Error(
      "CATALOG_DEMO_MODE cannot be enabled for a production identity",
    );
  }
}

async function defaultDemoLoader(): Promise<CatalogRecordSet> {
  const fixtureModule = await import("catalog-demo-fixtures");
  return fixtureModule.loadSyntheticDemoCatalogRecords();
}

async function unavailableDatabaseLoader(): Promise<CatalogRecordSet> {
  throw new Error("Configured database catalog adapter is unavailable");
}

export async function loadCatalogRecordSet(
  environment: ServerEnv,
  loadDemo: DemoLoader = defaultDemoLoader,
  loadDatabase: DatabaseLoader = unavailableDatabaseLoader,
): Promise<CatalogRecordSet> {
  assertCatalogDemoModeAllowed(environment);
  if (
    environment.CATALOG_DEMO_MODE === "enabled" &&
    environment.DATABASE_MODE === "live"
  ) {
    throw new Error("Catalog demo mode cannot mask a live database");
  }

  if (environment.CATALOG_DEMO_MODE === "enabled") {
    const records = await loadDemo();
    if (records.source !== "synthetic-demo") {
      throw new Error("Demo catalog loader returned a non-synthetic source");
    }
    return records;
  }

  if (environment.DATABASE_MODE === "disabled") {
    return EMPTY_CATALOG_RECORD_SET;
  }

  const records = await loadDatabase(environment);
  if (records.source !== "production") {
    throw new Error("Database catalog loader returned a non-production source");
  }
  return records;
}
