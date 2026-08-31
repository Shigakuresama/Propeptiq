import type { DatabaseCatalogRecordSet } from "./database-catalog";
import type { PublicStorefrontAutomaticPromotion } from "./storefront-price-presentation";

export type PromotionProjectionDiagnostic = Readonly<{
  code: "invalid_campaign" | "invalid_interval" | "invalid_scope" | "dangling_target" | "duplicate_campaign_key";
  campaignKey: string | null;
}>;

export type PromotionProjectionResult = Readonly<{
  promotions: readonly PublicStorefrontAutomaticPromotion[];
  diagnostics: readonly PromotionProjectionDiagnostic[];
}>;

function validTimezone(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; }
}
function validInstant(value: string | null): boolean { return value === null || Number.isFinite(Date.parse(value)); }
function nonblank(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function validBps(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 10_000; }

export function projectAutomaticStorefrontPromotions(input: Readonly<{ records: DatabaseCatalogRecordSet; now: Date }>): PromotionProjectionResult {
  const diagnostics: PromotionProjectionDiagnostic[] = [];
  const active = input.records.promotions.filter((promotion) => promotion.campaignKey !== null && promotion.enabled && promotion.status === "active");
  const counts = new Map<string, number>();
  for (const row of active) if (row.campaignKey) counts.set(row.campaignKey, (counts.get(row.campaignKey) ?? 0) + 1);
  const products = new Set(input.records.products.map((row) => row.id));
  const variants = new Set(input.records.variants.map((row) => row.id));
  const output: PublicStorefrontAutomaticPromotion[] = [];
  for (const row of active) {
    const campaignKey = row.campaignKey;
    if (campaignKey && (counts.get(campaignKey) ?? 0) > 1) { diagnostics.push({ code: "duplicate_campaign_key", campaignKey }); continue; }
    const basisPoints = row.basisPoints;
    if (!nonblank(campaignKey) || !nonblank(row.name) || !validTimezone(row.timezone) || row.kind !== "discount" || row.applicationMode !== "automatic" || row.amountMinor !== null || row.currency !== null || !validBps(basisPoints)) { diagnostics.push({ code: "invalid_campaign", campaignKey: nonblank(campaignKey) ? campaignKey : null }); continue; }
    const start = row.startsAt; const end = row.endsAt;
    if (!validInstant(start) || !validInstant(end) || (start !== null && end !== null && Date.parse(end) <= Date.parse(start))) { diagnostics.push({ code: "invalid_interval", campaignKey }); continue; }
    const now = input.now.getTime();
    if ((start !== null && now < Date.parse(start)) || (end !== null && now >= Date.parse(end))) continue;
    const targets = input.records.promotionTargets.filter((target) => target.promotionId === row.id);
    const variantTargets = (input.records.promotionVariantTargets ?? []).filter((target) => target.promotionId === row.id);
    const productIds = targets.filter((target) => target.targetKind === "product").map((target) => target.productId);
    const groups = targets.filter((target) => target.targetKind === "policy_group");
    const targetVariantIds = variantTargets.map((target) => target.variantId);
    const hasDuplicates = new Set([...productIds.filter((id): id is string => id !== null), ...targetVariantIds]).size !== productIds.filter((id): id is string => id !== null).length + targetVariantIds.length;
    if (hasDuplicates || groups.length > 0 || (row.scope === "sitewide" && (targets.length > 0 || variantTargets.length > 0)) || row.scope === null) { diagnostics.push({ code: "invalid_scope", campaignKey }); continue; }
    if (row.scope === "products" && (productIds.length === 0 || productIds.some((id) => id === null || !products.has(id)) || variantTargets.length > 0)) { diagnostics.push({ code: productIds.some((id) => id === null || !products.has(id)) ? "dangling_target" : "invalid_scope", campaignKey }); continue; }
    if (row.scope === "variants" && (targetVariantIds.length === 0 || targetVariantIds.some((id) => !variants.has(id)) || productIds.length > 0)) { diagnostics.push({ code: targetVariantIds.some((id) => !variants.has(id)) ? "dangling_target" : "invalid_scope", campaignKey }); continue; }
    const scope = row.scope === "sitewide" ? { kind: "sitewide" as const } : row.scope === "products" ? { kind: "products" as const, productIds: Object.freeze(productIds as string[]) } : { kind: "variants" as const, variantIds: Object.freeze(targetVariantIds) };
    output.push(Object.freeze({ id: campaignKey, displayName: row.name, displayCode: row.code || null, discountBps: basisPoints, enabled: true, startAt: start, endAt: end, timezone: row.timezone, scope, applicationMode: "automatic" as const }));
  }
  output.sort((a, b) => a.id.localeCompare(b.id));
  return Object.freeze({ promotions: Object.freeze(output), diagnostics: Object.freeze(diagnostics) });
}
