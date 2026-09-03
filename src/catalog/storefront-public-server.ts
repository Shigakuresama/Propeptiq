import "server-only";

import { connection } from "next/server";
import { cache } from "react";

import { hasProductionIdentity, type ServerEnv } from "@/config/env-schema";
import {
  resolveActiveConfiguredAutomaticPromotions,
  storefrontPromotionMatchesConfiguration,
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
  buildConfiguredDisplayVariantFacts,
  buildRuntimeVariantPresentationFacts,
  storefrontImageMetadata,
  type PublicStorefrontCatalog,
  type VerifiedStorefrontImageMetadata,
} from "./storefront-public";
import {
  projectAutomaticStorefrontPromotions,
  type PromotionProjectionDiagnostic,
} from "./storefront-promotion-projection";
import type { PricePresentationMode, PublicStorefrontAutomaticPromotion, PublicStorefrontPricingContext } from "./storefront-price-presentation";

export type PublicStorefrontView = Readonly<{ catalog: PublicStorefrontCatalog; pricing: PublicStorefrontPricingContext }>;

export const STOREFRONT_CATALOG_DATABASE_UNAVAILABLE =
  "STOREFRONT_CATALOG_DATABASE_UNAVAILABLE" as const;

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
  reportCatalogDatabaseUnavailable?: (
    diagnostic: typeof STOREFRONT_CATALOG_DATABASE_UNAVAILABLE,
  ) => void | Promise<void>;
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

function defaultCatalogDatabaseUnavailableReporter(
  diagnostic: typeof STOREFRONT_CATALOG_DATABASE_UNAVAILABLE,
): void {
  console.warn(diagnostic);
}

function ownStringCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, "code");
    return descriptor !== undefined && "value" in descriptor &&
      typeof descriptor.value === "string"
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
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
  let databaseOwnedVariantIds = new Set<string>();
  if (shouldLoadDatabase) {
    let records: DatabaseCatalogRecordSet | undefined;
    let databaseUnavailable = false;
    try {
      records = await (
        dependencies.loadDatabaseRecords ?? defaultDatabaseLoader
      )(environment);
    } catch (error: unknown) {
      if (ownStringCode(error) !== "42P01") throw error;
      databaseUnavailable = true;
      try {
        await (dependencies.reportCatalogDatabaseUnavailable ??
          defaultCatalogDatabaseUnavailableReporter)(
          STOREFRONT_CATALOG_DATABASE_UNAVAILABLE,
        );
      } catch {
        // A diagnostic failure must not take the public storefront down.
      }
    }
    if (databaseUnavailable) {
      records = undefined;
    }
    if (!databaseUnavailable && records === undefined) {
      throw new Error("Storefront database loader returned no records");
    }
    let projected: Readonly<{
      databaseOwnedVariantIds: Set<string>;
      runtimeVariantFacts: ReturnType<typeof buildRuntimeVariantPresentationFacts>;
      automaticPromotions: PublicStorefrontPricingContext["automaticPromotions"];
      diagnostics: readonly PromotionProjectionDiagnostic[];
    }> | undefined;
    if (records !== undefined) {
      if (records.source !== "production") {
        throw new Error("Storefront database loader returned a non-production source");
      }
      const stagedDatabaseOwnedVariantIds = new Set(records.variants.map((variant) => variant.id));
      const stagedRuntimeVariantFacts = buildRuntimeVariantPresentationFacts({
        records,
        bindings,
        now,
      });
      const promotionProjection = projectAutomaticStorefrontPromotions({ records, now });
      projected = Object.freeze({
        databaseOwnedVariantIds: stagedDatabaseOwnedVariantIds,
        runtimeVariantFacts: stagedRuntimeVariantFacts,
        automaticPromotions: promotionProjection.promotions,
        diagnostics: promotionProjection.diagnostics,
      });
    }
    if (projected !== undefined) {
      databaseOwnedVariantIds = projected.databaseOwnedVariantIds;
      runtimeVariantFacts = projected.runtimeVariantFacts;
      automaticPromotions = projected.automaticPromotions;
      const reportPromotionDiagnostic =
        dependencies.reportPromotionDiagnostic ?? defaultPromotionDiagnosticReporter;
      for (const diagnostic of projected.diagnostics) {
        reportPromotionDiagnostic(diagnostic);
      }
    }
  }
  const configuredDisplayFacts = buildConfiguredDisplayVariantFacts({ ...catalogData, bindings });
  runtimeVariantFacts = Object.freeze([
    ...runtimeVariantFacts,
    ...configuredDisplayFacts.filter((fact) => !databaseOwnedVariantIds.has(fact.variantId)),
  ]);
  const staticDisplayIds = new Set(configuredDisplayFacts.map((fact) => fact.variantId));
  const survivingStaticIds = new Set([...staticDisplayIds].filter((id) => !databaseOwnedVariantIds.has(id)));
  const activeConfigured = resolveActiveConfiguredAutomaticPromotions(
    dependencies.configuredPromotions ?? STOREFRONT_PROMOTIONS, now,
  );
  const authoritativePromotions = automaticPromotions;
  const dbFactIds = new Set(runtimeVariantFacts.filter((fact) => !survivingStaticIds.has(fact.variantId)).map((fact) => fact.variantId));
  const scopedPromotions: PublicStorefrontAutomaticPromotion[] = [];
  if (activeConfigured !== null) {
    for (const configuration of activeConfigured) {
      if (!configuration.enabled || configuration.applicationMode !== "automatic") continue;
      const authoritative = authoritativePromotions.find((promotion) => promotion.id === configuration.id);
      const exact = authoritative !== undefined && storefrontPromotionMatchesConfiguration(authoritative, configuration);
      const staticIds = [...survivingStaticIds].filter((variantId) => {
        const fact = configuredDisplayFacts.find((candidate) => candidate.variantId === variantId);
        return fact !== undefined && promotionApplies(configuration, { id: variantId, productId: fact.productId, variantId });
      });
      const dbIds = exact && authoritative
        ? [...dbFactIds].filter((variantId) => {
            const fact = runtimeVariantFacts.find((candidate) => candidate.variantId === variantId);
            return fact !== undefined && promotionApplies(authoritative, { id: variantId, productId: fact.productId, variantId });
          })
        : [];
      const variantIds = [...new Set([...staticIds, ...dbIds])];
      if (variantIds.length === 0) continue;
      scopedPromotions.push(Object.freeze({ ...configuration, enabled: true as const, applicationMode: "automatic" as const,
        scope: Object.freeze({ kind: "variants" as const, variantIds: Object.freeze(variantIds) }) }));
    }
  }
  for (const authoritative of authoritativePromotions) {
    if (scopedPromotions.some((promotion) => promotion.id === authoritative.id) ||
      activeConfigured?.some((configuration) => configuration.id === authoritative.id)) continue;
    const variantIds = [...dbFactIds].filter((variantId) => {
      const fact = runtimeVariantFacts.find((candidate) => candidate.variantId === variantId);
      return fact !== undefined && promotionApplies(authoritative, { id: variantId, productId: fact.productId, variantId });
    });
    if (variantIds.length > 0) scopedPromotions.push(Object.freeze({ ...authoritative,
      scope: Object.freeze({ kind: "variants" as const, variantIds: Object.freeze(variantIds) }) }));
  }
  automaticPromotions = Object.freeze(scopedPromotions);
  const configuredById = activeConfigured;
  runtimeVariantFacts = Object.freeze(runtimeVariantFacts.filter((fact) => {
    if (fact.priceStatus !== "active") return true;
    if (configuredById === null) return false;
    if (survivingStaticIds.has(fact.variantId)) return true;
    return configuredById.every((configuration) => {
      if (!configuration.enabled || configuration.applicationMode !== "automatic") return true;
      if (!promotionApplies(configuration, { id: fact.variantId, productId: fact.productId, variantId: fact.variantId })) return true;
      const authoritative = authoritativePromotions.find((promotion) => promotion.id === configuration.id);
      return authoritative !== undefined && storefrontPromotionMatchesConfiguration(authoritative, configuration);
    });
  }));
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
