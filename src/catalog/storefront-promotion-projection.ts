import { isStorefrontPromotionActive } from "@/domain/storefront-pricing";
import { storefrontPromotionInstantEpochNanoseconds } from "@/domain/storefront-promotion-time";
import {
  isStrictStorefrontPromotionInstant,
  isValidStorefrontPromotionTimezone,
  storefrontPromotionMatchesOwnerConfiguration,
} from "@/config/storefront-promotions";

import type {
  DatabaseCatalogPromotionRecord,
  DatabaseCatalogRecordSet,
} from "./database-catalog";
import type { PublicStorefrontAutomaticPromotion } from "./storefront-price-presentation";

export type PromotionProjectionDiagnostic = Readonly<{
  code:
    | "invalid_campaign"
    | "invalid_interval"
    | "invalid_scope"
    | "dangling_target"
    | "duplicate_campaign_key"
    | "configuration_mismatch";
  campaignKey: string | null;
}>;

export type PromotionProjectionResult = Readonly<{
  promotions: readonly PublicStorefrontAutomaticPromotion[];
  diagnostics: readonly PromotionProjectionDiagnostic[];
}>;

export { isStrictStorefrontPromotionInstant };

function validInstant(value: string | null): boolean {
  return value === null || isStrictStorefrontPromotionInstant(value);
}

function nonblank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validBps(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 10_000
  );
}

function publicCampaignKey(row: DatabaseCatalogPromotionRecord): string | null {
  return nonblank(row.campaignKey) ? row.campaignKey : null;
}

function addDiagnostic(
  diagnostics: PromotionProjectionDiagnostic[],
  code: PromotionProjectionDiagnostic["code"],
  row: DatabaseCatalogPromotionRecord,
): void {
  diagnostics.push({ code, campaignKey: publicCampaignKey(row) });
}

function hasDuplicate(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function projectScope(
  row: DatabaseCatalogPromotionRecord,
  records: DatabaseCatalogRecordSet,
  products: ReadonlySet<string>,
  variants: ReadonlySet<string>,
):
  | Readonly<{
      ok: true;
      scope: PublicStorefrontAutomaticPromotion["scope"];
    }>
  | Readonly<{
      ok: false;
      code: "invalid_scope" | "dangling_target";
    }> {
  const targets = records.promotionTargets.filter(
    (target) => target.promotionId === row.id,
  );
  const variantTargets = records.promotionVariantTargets.filter(
    (target) => target.promotionId === row.id,
  );

  if (row.scope === "sitewide") {
    return targets.length === 0 && variantTargets.length === 0
      ? { ok: true, scope: { kind: "sitewide" } }
      : { ok: false, code: "invalid_scope" };
  }

  if (row.scope === "products") {
    if (
      targets.some(
        (target) =>
          target.targetKind !== "product" || target.policyGroupId !== null,
      ) ||
      variantTargets.length > 0
    ) {
      return { ok: false, code: "invalid_scope" };
    }
    const productIds = targets.flatMap((target) =>
      typeof target.productId === "string" && target.productId.trim() !== ""
        ? [target.productId]
        : [],
    );
    if (productIds.length !== targets.length) {
      return { ok: false, code: "dangling_target" };
    }
    if (productIds.length === 0 || hasDuplicate(productIds)) {
      return { ok: false, code: "invalid_scope" };
    }
    if (productIds.some((productId) => !products.has(productId))) {
      return { ok: false, code: "dangling_target" };
    }
    return {
      ok: true,
      scope: {
        kind: "products",
        productIds: Object.freeze(
          [...productIds].sort((left, right) => left.localeCompare(right, "en-US")),
        ),
      },
    };
  }

  if (row.scope === "variants") {
    if (targets.length > 0) return { ok: false, code: "invalid_scope" };
    const variantIds = variantTargets.flatMap((target) =>
      typeof target.variantId === "string" && target.variantId.trim() !== ""
        ? [target.variantId]
        : [],
    );
    if (variantIds.length !== variantTargets.length) {
      return { ok: false, code: "dangling_target" };
    }
    if (variantIds.length === 0 || hasDuplicate(variantIds)) {
      return { ok: false, code: "invalid_scope" };
    }
    if (variantIds.some((variantId) => !variants.has(variantId))) {
      return { ok: false, code: "dangling_target" };
    }
    return {
      ok: true,
      scope: {
        kind: "variants",
        variantIds: Object.freeze(
          [...variantIds].sort((left, right) => left.localeCompare(right, "en-US")),
        ),
      },
    };
  }

  return { ok: false, code: "invalid_scope" };
}

type ActiveCandidate = Readonly<{
  row: DatabaseCatalogPromotionRecord;
  promotion: PublicStorefrontAutomaticPromotion;
}>;

export function projectAutomaticStorefrontPromotions(input: Readonly<{
  records: DatabaseCatalogRecordSet;
  now: Date;
}>): PromotionProjectionResult {
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) {
    const diagnostic: PromotionProjectionDiagnostic = Object.freeze({
      code: "invalid_interval",
      campaignKey: null,
    });
    return Object.freeze({
      promotions: Object.freeze([]),
      diagnostics: Object.freeze([diagnostic]),
    });
  }

  const diagnostics: PromotionProjectionDiagnostic[] = [];
  const products = new Set(input.records.products.map((row) => row.id));
  const variants = new Set(input.records.variants.map((row) => row.id));
  const candidates: ActiveCandidate[] = [];

  for (const row of input.records.promotions) {
    if (!row.enabled || row.status !== "active") continue;
    if (row.applicationMode === "code_required") continue;
    if (
      !nonblank(row.campaignKey) ||
      !nonblank(row.name) ||
      !isValidStorefrontPromotionTimezone(row.timezone) ||
      row.kind !== "discount" ||
      row.applicationMode !== "automatic" ||
      row.amountMinor !== null ||
      row.currency !== null ||
      !validBps(row.basisPoints)
    ) {
      addDiagnostic(diagnostics, "invalid_campaign", row);
      continue;
    }
    const startsAtEpochNanoseconds =
      row.startsAt === null
        ? null
        : storefrontPromotionInstantEpochNanoseconds(row.startsAt);
    const endsAtEpochNanoseconds =
      row.endsAt === null
        ? null
        : storefrontPromotionInstantEpochNanoseconds(row.endsAt);
    if (
      !validInstant(row.startsAt) ||
      !validInstant(row.endsAt) ||
      (row.startsAt !== null &&
        row.endsAt !== null &&
        (startsAtEpochNanoseconds === null ||
          endsAtEpochNanoseconds === null ||
          endsAtEpochNanoseconds <= startsAtEpochNanoseconds))
    ) {
      addDiagnostic(diagnostics, "invalid_interval", row);
      continue;
    }
    if (
      !isStorefrontPromotionActive(
        {
          enabled: row.enabled,
          startAt: row.startsAt,
          endAt: row.endsAt,
        },
        input.now,
      )
    ) continue;

    const scope = projectScope(row, input.records, products, variants);
    if (!scope.ok) {
      addDiagnostic(diagnostics, scope.code, row);
      continue;
    }

    candidates.push({
      row,
      promotion: Object.freeze({
        id: row.campaignKey,
        displayName: row.name,
        displayCode: nonblank(row.code) ? row.code : null,
        discountBps: row.basisPoints,
        enabled: true,
        startAt: row.startsAt,
        endAt: row.endsAt,
        timezone: row.timezone,
        scope: Object.freeze(scope.scope),
        applicationMode: "automatic",
      }),
    });
  }

  const campaignCounts = new Map<string, number>();
  for (const { promotion } of candidates) {
    campaignCounts.set(
      promotion.id,
      (campaignCounts.get(promotion.id) ?? 0) + 1,
    );
  }
  const duplicateKeys = [...campaignCounts]
    .filter(([, count]) => count > 1)
    .map(([campaignKey]) => campaignKey)
    .sort((left, right) => left.localeCompare(right, "en-US"));
  for (const campaignKey of duplicateKeys) {
    diagnostics.push({ code: "duplicate_campaign_key", campaignKey });
  }

  const promotions = candidates
    .filter(({ promotion }) => (campaignCounts.get(promotion.id) ?? 0) === 1)
    .flatMap(({ promotion }) => {
      if (!storefrontPromotionMatchesOwnerConfiguration(promotion)) {
        diagnostics.push({
          code: "configuration_mismatch",
          campaignKey: promotion.id,
        });
        return [];
      }
      return [promotion];
    })
    .sort((left, right) => left.id.localeCompare(right.id, "en-US"));
  diagnostics.sort(
    (left, right) =>
      (left.campaignKey ?? "").localeCompare(right.campaignKey ?? "", "en-US") ||
      left.code.localeCompare(right.code, "en-US"),
  );

  return Object.freeze({
    promotions: Object.freeze(promotions),
    diagnostics: Object.freeze(diagnostics),
  });
}
