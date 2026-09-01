import "server-only";

import { connection } from "next/server";
import { cache } from "react";

import { hasProductionIdentity, type ServerEnv } from "@/config/env-schema";
import {
  resolveUnreconciledActiveConfiguredAutomaticPromotions,
  STOREFRONT_PROMOTIONS,
} from "@/config/storefront-promotions";
import { storefrontContentRecords, type ControlledContentRecord } from "@/content/storefront-content";
import { withRuntimeTransaction } from "@/db/runtime";
import { readServerEnv } from "@/env";
import { promotionApplies } from "@/domain/storefront-pricing";

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
import {
  projectAutomaticStorefrontPromotions,
  type PromotionProjectionDiagnostic,
} from "./storefront-promotion-projection";
import type { PricePresentationMode, PublicStorefrontPricingContext } from "./storefront-price-presentation";

export type PublicStorefrontView = Readonly<{ catalog: PublicStorefrontCatalog; pricing: PublicStorefrontPricingContext }>;

export function resolvePricePresentationMode(
  environment: Pick<ServerEnv, "APP_ENV" | "VERCEL_ENV" | "VERCEL_TARGET_ENV">,
  runtime: Readonly<{ nodeEnv: string | undefined }>,
): PricePresentationMode {
  const production = hasProductionIdentity(environment);
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
  reportPromotionDiagnostic?: (diagnostic: PromotionProjectionDiagnostic) => void;
  configuredPromotions?: unknown;
}>;

async function defaultDatabaseLoader(
  environment: ServerEnv,
): Promise<DatabaseCatalogRecordSet> {
  return withRuntimeTransaction(environment, loadDatabaseCatalogRecords);
}

function defaultPromotionDiagnosticReporter(
  diagnostic: PromotionProjectionDiagnostic,
): void {
  console.warn("storefront_promotion_omitted", {
    code: diagnostic.code,
    campaignKey: diagnostic.campaignKey,
  });
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
  let automaticPromotions = Object.freeze(
    [],
  ) as PublicStorefrontPricingContext["automaticPromotions"];
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
    const reportPromotionDiagnostic =
      dependencies.reportPromotionDiagnostic ?? defaultPromotionDiagnosticReporter;
    for (const diagnostic of promotionProjection.diagnostics) {
      reportPromotionDiagnostic(diagnostic);
    }
  }
  const unreconciled =
    resolveUnreconciledActiveConfiguredAutomaticPromotions(
      dependencies.configuredPromotions ?? STOREFRONT_PROMOTIONS,
      automaticPromotions,
      now,
    );
  runtimeVariantFacts = Object.freeze(
    runtimeVariantFacts.filter((fact) => {
      if (fact.priceStatus !== "active") return true;
      if (unreconciled === null) return false;
      return !unreconciled.some((promotion) =>
        promotionApplies(promotion, {
          productId: fact.productId,
          variantId: fact.variantId,
        }),
      );
    }),
  );
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

type PublicStorefrontViewCache = (
  acquire: () => Promise<PublicStorefrontView>,
) => () => Promise<PublicStorefrontView>;

export type PublicStorefrontRequestAccessorDependencies = Readonly<{
  connect?: () => Promise<unknown>;
  readEnvironment?: () => ServerEnv;
  loadView?: (environment: ServerEnv) => Promise<PublicStorefrontView>;
  cacheView?: PublicStorefrontViewCache;
}>;

export function createPublicStorefrontRequestAccessors(
  dependencies: PublicStorefrontRequestAccessorDependencies = {},
): Readonly<{
  getView: () => Promise<PublicStorefrontView>;
  getCatalog: () => Promise<PublicStorefrontCatalog>;
}> {
  const acquire = async (): Promise<PublicStorefrontView> => {
    await (dependencies.connect ?? connection)();
    const environment = (dependencies.readEnvironment ?? readServerEnv)();
    return (dependencies.loadView ?? ((currentEnvironment) =>
      loadPublicStorefrontView(currentEnvironment, {
        nodeEnv: process.env.NODE_ENV,
      })))(environment);
  };
  const getView = (dependencies.cacheView ?? ((currentAcquire) =>
    cache(currentAcquire)))(acquire);
  const getCatalog = async (): Promise<PublicStorefrontCatalog> =>
    (await getView()).catalog;
  return Object.freeze({ getView, getCatalog });
}

const publicStorefrontRequestAccessors = createPublicStorefrontRequestAccessors();

export const getPublicStorefrontView = publicStorefrontRequestAccessors.getView;
export const getPublicStorefrontCatalog = publicStorefrontRequestAccessors.getCatalog;
