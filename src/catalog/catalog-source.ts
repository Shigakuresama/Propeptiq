import type { ServerEnv } from "@/config/env-schema";

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

function hasProductionIdentity(environment: ServerEnv): boolean {
  return (
    environment.APP_ENV === "production" ||
    environment.VERCEL_ENV === "production" ||
    environment.VERCEL_TARGET_ENV?.trim().toLowerCase() === "production"
  );
}

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

export async function loadCatalogRecordSet(
  environment: ServerEnv,
  loadDemo: DemoLoader = defaultDemoLoader,
): Promise<CatalogRecordSet> {
  if (environment.CATALOG_DEMO_MODE !== "enabled") {
    return EMPTY_CATALOG_RECORD_SET;
  }

  assertCatalogDemoModeAllowed(environment);
  const records = await loadDemo();
  if (records.source !== "synthetic-demo") {
    throw new Error("Demo catalog loader returned a non-synthetic source");
  }
  return records;
}
