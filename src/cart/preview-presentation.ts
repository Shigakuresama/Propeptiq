import type { CartPreview, CartPreviewItem } from "./preview-types";

export const PREVIEW_PRESENTATION_STORAGE_KEY = "propeptiq.cart-preview.presentation.v1";

type PresentationStorage = Readonly<{
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => unknown;
}>;

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const own = Reflect.ownKeys(value);
  return own.length === keys.length && own.every((key) =>
    typeof key === "string" && keys.includes(key));
}

function nullableMoney(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= maximum &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

function item(value: unknown): CartPreviewItem | null {
  if (!exactRecord(value, [
    "variantId", "quantity", "available", "name", "packageForm",
    "unitAmountMinor", "lineSubtotalMinor", "currency",
  ])) return null;
  if (
    !boundedText(value.variantId, 128) || !/^[A-Za-z0-9_-]+$/u.test(value.variantId) ||
    !Number.isSafeInteger(value.quantity) || (value.quantity as number) < 1 || (value.quantity as number) > 25 ||
    typeof value.available !== "boolean" ||
    (value.name !== null && !boundedText(value.name, 240)) ||
    (value.packageForm !== null && !boundedText(value.packageForm, 240)) ||
    !nullableMoney(value.unitAmountMinor) || !nullableMoney(value.lineSubtotalMinor) ||
    (value.currency !== null && (typeof value.currency !== "string" || !/^[A-Z]{3}$/u.test(value.currency)))
  ) return null;
  return {
    variantId: value.variantId,
    quantity: value.quantity as number,
    available: value.available,
    name: value.name as string | null,
    packageForm: value.packageForm as string | null,
    unitAmountMinor: value.unitAmountMinor as number | null,
    lineSubtotalMinor: value.lineSubtotalMinor as number | null,
    currency: value.currency as string | null,
  };
}

export function parsePreviewPresentation(value: unknown): CartPreview | null {
  if (!exactRecord(value, [
    "items", "subtotalMinor", "currency", "taxMinor", "shippingMinor",
    "finalDiscountMinor", "previewToken", "requiresAcknowledgement", "reasons",
  ]) || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 50) {
    return null;
  }
  const items = value.items.map(item);
  if (items.some((candidate) => candidate === null)) return null;
  if (
    !nullableMoney(value.subtotalMinor) || value.subtotalMinor === null ||
    (value.currency !== null && (typeof value.currency !== "string" || !/^[A-Z]{3}$/u.test(value.currency))) ||
    value.taxMinor !== null || value.shippingMinor !== null || value.finalDiscountMinor !== null ||
    typeof value.previewToken !== "string" || !/^[a-f0-9]{64}$/u.test(value.previewToken) ||
    typeof value.requiresAcknowledgement !== "boolean" || !Array.isArray(value.reasons) ||
    value.reasons.length > 2 || new Set(value.reasons).size !== value.reasons.length ||
    value.reasons.some((reason) => reason !== "server_facts_changed" && reason !== "product_unavailable")
  ) return null;
  const projected = items as CartPreviewItem[];
  if (
    projected.reduce((total, line) => total + (line.lineSubtotalMinor ?? 0), 0) !== value.subtotalMinor ||
    (projected.some((line) => !line.available) !== value.reasons.includes("product_unavailable")) ||
    (value.requiresAcknowledgement !== (value.reasons.length > 0))
  ) return null;
  return {
    items: projected,
    subtotalMinor: value.subtotalMinor,
    currency: value.currency as string | null,
    taxMinor: null,
    shippingMinor: null,
    finalDiscountMinor: null,
    previewToken: value.previewToken,
    requiresAcknowledgement: value.requiresAcknowledgement,
    reasons: value.reasons as CartPreview["reasons"],
  };
}

export function loadPreviewPresentation(storage: Pick<PresentationStorage, "getItem">): CartPreview | null {
  try {
    const serialized = storage.getItem(PREVIEW_PRESENTATION_STORAGE_KEY);
    if (serialized === null || serialized.length > 64_000) return null;
    const envelope: unknown = JSON.parse(serialized);
    if (!exactRecord(envelope, ["schemaVersion", "preview"]) || envelope.schemaVersion !== 1) return null;
    return parsePreviewPresentation(envelope.preview);
  } catch {
    return null;
  }
}

export function savePreviewPresentation(
  storage: Pick<PresentationStorage, "setItem">,
  preview: CartPreview,
): void {
  const safe = parsePreviewPresentation(preview);
  if (safe === null) return;
  storage.setItem(PREVIEW_PRESENTATION_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, preview: safe }));
}
