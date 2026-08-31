import "server-only";

import { connection } from "next/server";

import type { ServerEnv } from "@/config/env-schema";
import { storefrontContentRecords, type ControlledContentRecord } from "@/content/storefront-content";
import { withRuntimeTransaction } from "@/db/runtime";
import { readServerEnv } from "@/env";

import { resolvePublishedBrowseCatalog } from "./browse-catalog-publication";
import {
  loadDatabaseCatalogRecords,
  type DatabaseCatalogRecordSet,
} from "./database-catalog";
import { parseStorefrontBindings } from "./storefront-bindings";
import {
  storefrontCatalogData,
  type StorefrontCatalogData,
} from "./storefront-catalog-data";
import {
  buildPublicStorefrontCatalog,
  buildRuntimeVariantPresentationFacts,
  storefrontImageMetadata,
  type PublicStorefrontCatalog,
  type VerifiedStorefrontImageMetadata,
} from "./storefront-public";

export type StorefrontPublicServerDependencies = Readonly<{
  catalogData?: StorefrontCatalogData;
  controlledContent?: readonly ControlledContentRecord[];
  verifiedImageMetadata?: readonly VerifiedStorefrontImageMetadata[];
  loadDatabaseRecords?: (
    environment: ServerEnv,
  ) => Promise<DatabaseCatalogRecordSet>;
  now?: () => Date;
}>;

async function defaultDatabaseLoader(
  environment: ServerEnv,
): Promise<DatabaseCatalogRecordSet> {
  return withRuntimeTransaction(environment, loadDatabaseCatalogRecords);
}

export async function loadPublicStorefrontCatalog(
  environment: ServerEnv,
  dependencies: StorefrontPublicServerDependencies = {},
): Promise<PublicStorefrontCatalog> {
  const catalogData = dependencies.catalogData ?? storefrontCatalogData;
  const bindings = parseStorefrontBindings(catalogData.bindings);

  // Validate the owner publication before considering any runtime source.
  resolvePublishedBrowseCatalog(
    environment.BROWSE_CATALOG_PUBLICATION,
    bindings,
  );

  const shouldLoadDatabase =
    environment.DATABASE_MODE !== "disabled" &&
    environment.CATALOG_DEMO_MODE !== "enabled" &&
    catalogData.products.length > 0 &&
    bindings.products.length > 0;
  const now = (dependencies.now ?? (() => new Date()))();
  let runtimeVariantFacts = [] as ReturnType<
    typeof buildRuntimeVariantPresentationFacts
  >;
  if (shouldLoadDatabase) {
    const records = await (
      dependencies.loadDatabaseRecords ?? defaultDatabaseLoader
    )(environment);
    if (records.source !== "production") {
      throw new Error("Storefront database loader returned a non-production source");
    }
    runtimeVariantFacts = buildRuntimeVariantPresentationFacts({
      records,
      bindings,
      now,
    });
  }

  return buildPublicStorefrontCatalog({
    configuredPublicationId: environment.BROWSE_CATALOG_PUBLICATION,
    catalogData: { products: catalogData.products, bindings },
    runtimeVariantFacts,
    controlledContent: dependencies.controlledContent ?? storefrontContentRecords,
    verifiedImageMetadata:
      dependencies.verifiedImageMetadata ?? storefrontImageMetadata,
  });
}

export async function getPublicStorefrontCatalog(): Promise<PublicStorefrontCatalog> {
  await connection();
  const environment = readServerEnv();
  return loadPublicStorefrontCatalog(environment);
}
