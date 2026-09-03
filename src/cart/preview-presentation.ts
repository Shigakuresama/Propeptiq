import { calculateVariantLinePrice, quantityDiscountBps } from "@/domain/storefront-pricing";
import { createCartPreviewToken } from "./preview-token";
import { cartPreviewReasons, type CartPreview, type CartPreviewItem, type CartPreviewPurchaseState } from "./preview-types";

export const PREVIEW_PRESENTATION_STORAGE_KEY = "propeptiq.cart-preview.presentation.v2";

type PresentationStorage = Readonly<{
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => unknown;
}>;

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const own = Reflect.ownKeys(value);
  return own.length === keys.length && own.every((key) => typeof key === "string" && keys.includes(key) &&
    Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, "value"));
}

function denseArray(value: unknown, maximum: number): value is readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum || Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(Object.getOwnPropertyDescriptor(value, index) ?? {}, "value")) return false;
  }
  return true;
}

function money(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= maximum &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

function identifier(value: unknown): value is string {
  return boundedText(value, 128) && /^[A-Za-z0-9_-]+$/u.test(value);
}

function item(value: unknown): CartPreviewItem | null {
  if (!exactRecord(value, [
    "variantId", "quantity", "available", "purchaseState", "name", "variantLabel", "sku", "packageForm",
    "baseUnitMinor", "unitAmountMinor", "lineSubtotalMinor", "lineSavingsMinor", "effectiveDiscountBps", "appliedPromotions", "currency",
  ]) || !identifier(value.variantId) || !Number.isSafeInteger(value.quantity) || (value.quantity as number) < 1 || (value.quantity as number) > 25 ||
    typeof value.available !== "boolean" || typeof value.purchaseState !== "string" ||
    !["ready", "checkout_unavailable", "local_preview", "pricing_pending", "unavailable", "insufficient_quantity", "unknown_variant"].includes(value.purchaseState) ||
    value.available !== (value.purchaseState === "ready") || !denseArray(value.appliedPromotions, 1)) return null;

  const purchaseState = value.purchaseState as CartPreviewPurchaseState;
  const identity = [value.name, value.variantLabel, value.sku, value.packageForm];
  if (purchaseState === "unknown_variant" ? identity.some((field) => field !== null)
    : !boundedText(value.name, 240) || !boundedText(value.variantLabel, 240) || !boundedText(value.sku, 128) || !boundedText(value.packageForm, 240)) return null;

  const appliedPromotions: Array<Readonly<{ id: string; label: string }>> = [];
  for (const promotion of value.appliedPromotions) {
    if (!exactRecord(promotion, ["id", "label"]) || !identifier(promotion.id) || !boundedText(promotion.label, 240)) return null;
    appliedPromotions.push(Object.freeze({ id: promotion.id, label: promotion.label }));
  }
  const priced = ["ready", "checkout_unavailable", "local_preview", "insufficient_quantity"].includes(purchaseState);
  if (priced) {
    if (!money(value.baseUnitMinor) || !money(value.unitAmountMinor) || !money(value.lineSubtotalMinor) || !money(value.lineSavingsMinor) ||
      !money(value.effectiveDiscountBps) || value.effectiveDiscountBps > 10_000 || value.currency !== "USD" ||
      (value.baseUnitMinor === 0 && purchaseState !== "local_preview")) return null;
    const tier = quantityDiscountBps(value.quantity as number);
    const promotionId = appliedPromotions[0]?.id ?? null;
    if (promotionId === null ? value.effectiveDiscountBps !== tier : value.effectiveDiscountBps < tier || value.effectiveDiscountBps === 0) return null;
    const calculated = calculateVariantLinePrice({
      variantId: value.variantId, quantity: value.quantity as number, baseUnitMinor: value.baseUnitMinor,
      effectiveDiscount: { source: promotionId === null ? "quantity" : "promotion", discountBps: value.effectiveDiscountBps, promotionId },
    });
    if (calculated.effectiveUnitMinor !== value.unitAmountMinor || calculated.lineSubtotalMinor !== value.lineSubtotalMinor || calculated.lineSavingsMinor !== value.lineSavingsMinor) return null;
  } else if ([value.baseUnitMinor, value.unitAmountMinor, value.lineSubtotalMinor, value.lineSavingsMinor, value.effectiveDiscountBps, value.currency].some((field) => field !== null) || appliedPromotions.length !== 0) return null;

  return Object.freeze({
    variantId: value.variantId, quantity: value.quantity as number, available: value.available, purchaseState,
    name: value.name as string | null, variantLabel: value.variantLabel as string | null, sku: value.sku as string | null,
    packageForm: value.packageForm as string | null, baseUnitMinor: value.baseUnitMinor as number | null,
    unitAmountMinor: value.unitAmountMinor as number | null, lineSubtotalMinor: value.lineSubtotalMinor as number | null,
    lineSavingsMinor: value.lineSavingsMinor as number | null, effectiveDiscountBps: value.effectiveDiscountBps as number | null,
    appliedPromotions: Object.freeze(appliedPromotions), currency: value.currency as string | null,
  });
}

/** Validates display coherence only; this DTO is never checkout or payment authority. */
export function parsePreviewPresentation(value: unknown): CartPreview | null {
  try {
    if (!exactRecord(value, [
      "schemaVersion", "items", "subtotalMinor", "currency", "taxMinor", "shippingMinor", "finalDiscountMinor", "previewToken", "requiresAcknowledgement", "reasons",
    ]) || value.schemaVersion !== 2 || !denseArray(value.items, 50) || !money(value.subtotalMinor) ||
      (value.currency !== null && value.currency !== "USD") || value.taxMinor !== null || value.shippingMinor !== null || value.finalDiscountMinor !== null ||
      typeof value.previewToken !== "string" || !/^[a-f0-9]{64}$/u.test(value.previewToken) || typeof value.requiresAcknowledgement !== "boolean" || !denseArray(value.reasons, 6)) return null;
    const items: CartPreviewItem[] = [];
    const seen = new Set<string>();
    for (const candidate of value.items) {
      const projected = item(candidate);
      if (projected === null || seen.has(projected.variantId)) return null;
      seen.add(projected.variantId);
      items.push(projected);
    }
    const subtotalMinor = items.reduce((sum, line) => sum + (line.lineSubtotalMinor ?? 0), 0);
    const currency = items.find((line) => line.currency !== null)?.currency ?? null;
    const providedReasons = value.reasons;
    const reasons = cartPreviewReasons(items, providedReasons.includes("server_facts_changed"));
    if (!money(subtotalMinor) || subtotalMinor !== value.subtotalMinor || currency !== value.currency ||
      reasons.length !== providedReasons.length || reasons.some((reason, index) => reason !== providedReasons[index]) ||
      value.requiresAcknowledgement !== (reasons.length > 0)) return null;
    if (createCartPreviewToken(items) !== value.previewToken) return null;
    return Object.freeze({
      schemaVersion: 2, items: Object.freeze(items), subtotalMinor, currency, taxMinor: null, shippingMinor: null, finalDiscountMinor: null,
      previewToken: value.previewToken, requiresAcknowledgement: value.requiresAcknowledgement, reasons,
    });
  } catch {
    return null;
  }
}

export function loadPreviewPresentation(storage: Pick<PresentationStorage, "getItem">): CartPreview | null {
  try {
    const serialized = storage.getItem(PREVIEW_PRESENTATION_STORAGE_KEY);
    if (serialized === null || serialized.length > 128_000) return null;
    const envelope: unknown = JSON.parse(serialized);
    if (!exactRecord(envelope, ["schemaVersion", "preview"]) || envelope.schemaVersion !== 2) return null;
    return parsePreviewPresentation(envelope.preview);
  } catch {
    return null;
  }
}

export function savePreviewPresentation(storage: Pick<PresentationStorage, "setItem">, preview: CartPreview): void {
  const safe = parsePreviewPresentation(preview);
  if (safe === null) return;
  storage.setItem(PREVIEW_PRESENTATION_STORAGE_KEY, JSON.stringify({ schemaVersion: 2, preview: safe }));
}
