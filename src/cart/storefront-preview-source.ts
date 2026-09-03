import "server-only";

import type { PublicStorefrontView } from "@/catalog/storefront-public-server";
import { promotionApplies } from "@/domain/storefront-pricing";
import type { CartPreviewSource, CartPreviewVariant, CartPreviewVariantSource } from "./preview";

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
    requireFact(!!view?.catalog && !!view.pricing && denseArray(view.catalog.products) && denseArray(view.pricing.automaticPromotions));
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
          eligiblePromotions: view.pricing.automaticPromotions
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
