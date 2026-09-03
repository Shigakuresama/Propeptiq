import "server-only";

import type { PublicStorefrontView } from "@/catalog/storefront-public-server";
import {
  isValidStorefrontPromotionTimezone,
} from "@/config/storefront-promotions";
import {
  isStrictStorefrontPromotionInstant,
  storefrontPromotionInstantEpochNanoseconds,
} from "@/domain/storefront-promotion-time";
import { promotionApplies } from "@/domain/storefront-pricing";
import type {
  PublicStorefrontAutomaticPromotion,
} from "@/catalog/storefront-price-presentation";
import type { CartPreviewSource, CartPreviewVariant, CartPreviewVariantSource } from "./preview";

const MAX_PUBLIC_AUTOMATIC_PROMOTIONS = 1_000;
const MAX_PROMOTION_SCOPE_TARGETS = 1_000;
const promotionKeys = Object.freeze([
  "id",
  "displayName",
  "displayCode",
  "discountBps",
  "enabled",
  "startAt",
  "endAt",
  "timezone",
  "scope",
  "applicationMode",
] as const);

export class CartPreviewProjectionError extends Error {
  constructor(readonly code: "invalid_source" | "duplicate_variant") {
    super("The cart preview source could not be projected.");
    this.name = "CartPreviewProjectionError";
  }
}

function requireFact(valid: boolean): asserts valid {
  if (!valid) throw new CartPreviewProjectionError("invalid_source");
}

function text(value: unknown, maximum = 240): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

function identifier(value: unknown): value is string {
  return text(value, 128) && /^[A-Za-z0-9_-]+$/u.test(value);
}

function nonnegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function denseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, index) ?? {}, "value")) return false;
  }
  return true;
}

function exactDataObject(
  value: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== expectedKeys.length || keys.some(
    (key) => typeof key !== "string" || !expectedKeys.includes(key),
  )) return null;
  const snapshot: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) return null;
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function denseArraySnapshot(
  value: unknown,
  maximumLength: number,
): readonly unknown[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (lengthDescriptor === undefined || !("value" in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0 ||
    lengthDescriptor.value > maximumLength) return null;
  const length = lengthDescriptor.value as number;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1 || keys.some((key) =>
    key !== "length" && (typeof key !== "string" || !/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= length)
  )) return null;
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor)) return null;
    snapshot.push(descriptor.value);
  }
  return snapshot;
}

function promotionScope(
  value: unknown,
): PublicStorefrontAutomaticPromotion["scope"] | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const kind = Object.getOwnPropertyDescriptor(value, "kind");
  if (kind === undefined || !("value" in kind)) return null;
  if (kind.value === "sitewide") {
    return exactDataObject(value, ["kind"]) === null
      ? null
      : Object.freeze({ kind: "sitewide" });
  }
  const targetKey = kind.value === "products"
    ? "productIds"
    : kind.value === "variants"
      ? "variantIds"
      : null;
  if (targetKey === null) return null;
  const scope = exactDataObject(value, ["kind", targetKey]);
  if (scope === null) return null;
  const targets = denseArraySnapshot(scope[targetKey], MAX_PROMOTION_SCOPE_TARGETS);
  if (targets === null || targets.length === 0 || !targets.every(identifier) ||
    new Set(targets).size !== targets.length) return null;
  const frozenTargets = Object.freeze([...(targets as readonly string[])]);
  return kind.value === "products"
    ? Object.freeze({ kind: "products", productIds: frozenTargets })
    : Object.freeze({ kind: "variants", variantIds: frozenTargets });
}

function activePromotionSnapshot(
  evaluatedAtValue: unknown,
  promotionValue: unknown,
): readonly PublicStorefrontAutomaticPromotion[] {
  requireFact(isStrictStorefrontPromotionInstant(evaluatedAtValue));
  const evaluatedAt = storefrontPromotionInstantEpochNanoseconds(evaluatedAtValue);
  requireFact(evaluatedAt !== null);
  const candidates = denseArraySnapshot(
    promotionValue,
    MAX_PUBLIC_AUTOMATIC_PROMOTIONS,
  );
  requireFact(candidates !== null);
  const seen = new Set<string>();
  const promotions: PublicStorefrontAutomaticPromotion[] = [];
  for (const candidate of candidates) {
    const promotion = exactDataObject(candidate, promotionKeys);
    requireFact(promotion !== null);
    requireFact(identifier(promotion.id) && !seen.has(promotion.id));
    const id = promotion.id;
    requireFact(text(promotion.displayName));
    const displayName = promotion.displayName;
    requireFact(promotion.displayCode === null || text(promotion.displayCode, 128));
    const displayCode = promotion.displayCode;
    requireFact(typeof promotion.discountBps === "number" &&
      Number.isSafeInteger(promotion.discountBps) && promotion.discountBps >= 1 &&
      promotion.discountBps <= 10_000);
    const discountBps = promotion.discountBps;
    requireFact(promotion.enabled === true &&
      promotion.applicationMode === "automatic");
    requireFact(promotion.startAt === null ||
      isStrictStorefrontPromotionInstant(promotion.startAt));
    const startAtValue = promotion.startAt;
    requireFact(promotion.endAt === null ||
      isStrictStorefrontPromotionInstant(promotion.endAt));
    const endAtValue = promotion.endAt;
    const scope = promotionScope(promotion.scope);
    requireFact(scope !== null);
    requireFact(text(promotion.timezone, 128) &&
      isValidStorefrontPromotionTimezone(promotion.timezone));
    const timezone = promotion.timezone;
    const startAt = startAtValue !== null
      ? storefrontPromotionInstantEpochNanoseconds(startAtValue)
      : null;
    const endAt = endAtValue !== null
      ? storefrontPromotionInstantEpochNanoseconds(endAtValue)
      : null;
    requireFact((startAtValue === null || startAt !== null) &&
      (endAtValue === null || endAt !== null) &&
      (startAt === null || endAt === null || endAt > startAt) &&
      (startAt === null || evaluatedAt >= startAt) &&
      (endAt === null || evaluatedAt < endAt));
    seen.add(id);
    promotions.push(Object.freeze({
      id,
      displayName,
      displayCode,
      discountBps,
      enabled: true,
      startAt: startAtValue,
      endAt: endAtValue,
      timezone,
      scope,
      applicationMode: "automatic",
    }));
  }
  return Object.freeze(promotions);
}

function freezeVariant(row: CartPreviewVariant): CartPreviewVariant {
  requireFact(!!row && identifier(row.variantId) && identifier(row.productId) && text(row.name) &&
    text(row.variantLabel) && text(row.sku, 128) && text(row.packageForm) &&
    (row.baseUnitMinor === null || nonnegative(row.baseUnitMinor)) &&
    (row.currency === null || row.currency === "USD") &&
    ["pending", "active", "unavailable"].includes(row.priceStatus) &&
    ["preview_only", "available", "unavailable"].includes(row.availability) &&
    typeof row.checkoutReady === "boolean" &&
    (row.availableQuantity === null || nonnegative(row.availableQuantity)) && denseArray(row.eligiblePromotions));
  const seenPromotions = new Set<string>();
  const eligiblePromotions = row.eligiblePromotions.map((promotion) => {
    requireFact(!!promotion && identifier(promotion.id) && text(promotion.displayLabel) &&
      Number.isSafeInteger(promotion.discountBps) && promotion.discountBps > 0 && promotion.discountBps <= 10_000 &&
      !seenPromotions.has(promotion.id));
    seenPromotions.add(promotion.id);
    return Object.freeze({ id: promotion.id, discountBps: promotion.discountBps, displayLabel: promotion.displayLabel });
  });
  return Object.freeze({
    variantId: row.variantId, productId: row.productId, name: row.name,
    variantLabel: row.variantLabel, sku: row.sku, packageForm: row.packageForm,
    baseUnitMinor: row.baseUnitMinor, currency: row.currency, priceStatus: row.priceStatus,
    availability: row.availability, checkoutReady: row.checkoutReady, availableQuantity: row.availableQuantity,
    eligiblePromotions: Object.freeze(eligiblePromotions),
  });
}

/** The primary public source owns the mode; supplemental sources only supply rows. */
export function composeCartPreviewSources(
  primary: CartPreviewSource,
  ...additional: readonly CartPreviewVariantSource[]
): CartPreviewSource {
  requireFact(!!primary && ["local", "test", "preview", "production"].includes(primary.mode));
  const seen = new Set<string>();
  const variants: CartPreviewVariant[] = [];
  for (const source of [primary, ...additional]) {
    requireFact(!!source && denseArray(source.variants));
    for (const candidate of source.variants) {
      const row = freezeVariant(candidate);
      if (seen.has(row.variantId)) throw new CartPreviewProjectionError("duplicate_variant");
      seen.add(row.variantId);
      variants.push(row);
    }
  }
  return Object.freeze({ mode: primary.mode, variants: Object.freeze(variants) });
}

/** Copies only already-public display facts. It never grants inventory or checkout authority. */
export function projectPublicStorefrontPreviewSource(view: PublicStorefrontView): CartPreviewSource {
  try {
    requireFact(!!view?.catalog && !!view.pricing && denseArray(view.catalog.products));
    const automaticPromotions = activePromotionSnapshot(
      view.pricing.evaluatedAt,
      view.pricing.automaticPromotions,
    );
    const variants: CartPreviewVariant[] = [];
    for (const product of view.catalog.products) {
      requireFact(!!product && (product.kind === "canonical" || product.kind === "browse_only"));
      if (product.kind === "browse_only") continue;
      requireFact(denseArray(product.variants));
      for (const variant of product.variants) {
        requireFact(!!variant && Number.isSafeInteger(variant.packageQuantity) && variant.packageQuantity > 0 &&
          ["preview_only", "available", "unavailable"].includes(variant.availability));
        variants.push({
          variantId: variant.id, productId: product.id, name: product.name,
          variantLabel: variant.label, sku: variant.sku,
          packageForm: `${variant.packageQuantity} ${variant.packageQuantity === 1 ? "bottle" : "bottles"}`,
          baseUnitMinor: variant.baseUnitMinor, currency: variant.currency, priceStatus: variant.priceStatus,
          availability: variant.availability === "unavailable" || variant.priceStatus === "unavailable" ? "unavailable" : "preview_only",
          availableQuantity: null, checkoutReady: false,
          eligiblePromotions: automaticPromotions
            .filter((promotion) => promotionApplies(promotion, { id: variant.id, productId: product.id }))
            .map((promotion) => ({ id: promotion.id, discountBps: promotion.discountBps, displayLabel: promotion.displayCode ?? promotion.displayName })),
        });
      }
    }
    return composeCartPreviewSources({ mode: view.pricing.mode, variants });
  } catch (error: unknown) {
    if (error instanceof CartPreviewProjectionError) throw error;
    throw new CartPreviewProjectionError("invalid_source");
  }
}
