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
import { projectAutomaticStorefrontPromotions } from "./storefront-promotion-projection";
import type { PricePresentationMode, PublicStorefrontPricingContext } from "./storefront-price-presentation";

export type PublicStorefrontView = Readonly<{ catalog: PublicStorefrontCatalog; pricing: PublicStorefrontPricingContext }>;

export function resolvePricePresentationMode(
  environment: Pick<ServerEnv, "APP_ENV" | "VERCEL_ENV" | "VERCEL_TARGET_ENV">,
  runtime: Readonly<{ nodeEnv: string | undefined }>,
): PricePresentationMode {
  const production = environment.APP_ENV === "production" || environment.VERCEL_ENV === "production" || environment.VERCEL_TARGET_ENV === "production";
  if (production) return "production";
  if (runtime.nodeEnv === "test") return "test";
  if (environment.APP_ENV === "preview") return "preview";
  return "local";
}

export type StorefrontPublicServerDependencies = Readonly<{
  catalogData?: StorefrontCatalogData;
  controlledContent?: readonly ControlledContentRecord[];
  verifiedImageMetadata?: readonly VerifiedStorefrontImageMetadata[];
  loadDatabaseRecords?: (
    environment: ServerEnv,
  ) => Promise<DatabaseCatalogRecordSet>;
  now?: () => Date;
  nodeEnv?: string;
  reportPromotionDiagnostic?: (diagnostic: unknown) => void;
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
  return (await loadPublicStorefrontView(environment, dependencies)).catalog;
}

export async function loadPublicStorefrontView(
  environment: ServerEnv,
  dependencies: StorefrontPublicServerDependencies = {},
): Promise<PublicStorefrontView> {
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
  let automaticPromotions = [] as PublicStorefrontPricingContext["automaticPromotions"];
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
    const promotionProjection = projectAutomaticStorefrontPromotions({ records, now });
    automaticPromotions = promotionProjection.promotions;
    for (const diagnostic of promotionProjection.diagnostics) dependencies.reportPromotionDiagnostic?.(diagnostic);
  }
  const catalog = buildPublicStorefrontCatalog({
    configuredPublicationId: environment.BROWSE_CATALOG_PUBLICATION,
    catalogData: { products: catalogData.products, bindings },
    runtimeVariantFacts,
    controlledContent: dependencies.controlledContent ?? storefrontContentRecords,
    verifiedImageMetadata:
      dependencies.verifiedImageMetadata ?? storefrontImageMetadata,
  });
  return Object.freeze({
    catalog,
    pricing: Object.freeze({ mode: resolvePricePresentationMode(environment, { nodeEnv: dependencies.nodeEnv ?? process.env.NODE_ENV }), evaluatedAt: now.toISOString(), automaticPromotions }),
  });
}

export async function getPublicStorefrontCatalog(): Promise<PublicStorefrontCatalog> {
  await connection();
  const environment = readServerEnv();
  return loadPublicStorefrontCatalog(environment);
}

export async function getPublicStorefrontView(): Promise<PublicStorefrontView> {
  await connection();
  const environment = readServerEnv();
  return loadPublicStorefrontView(environment, { nodeEnv: process.env.NODE_ENV });
}
