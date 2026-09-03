export type CartPreviewPurchaseState = "ready" | "checkout_unavailable" | "local_preview" | "pricing_pending" | "unavailable" | "insufficient_quantity" | "unknown_variant";

export type CartPreviewItem = Readonly<{
  variantId: string;
  quantity: number;
  available: boolean;
  purchaseState: CartPreviewPurchaseState;
  name: string | null;
  packageForm: string | null;
  variantLabel: string | null;
  sku: string | null;
  baseUnitMinor: number | null;
  unitAmountMinor: number | null;
  lineSubtotalMinor: number | null;
  lineSavingsMinor: number | null;
  effectiveDiscountBps: number | null;
  appliedPromotions: readonly Readonly<{ id: string; label: string }>[];
  currency: string | null;
}>;

export type SafeCartPreviewItem = Readonly<{
  variantId: string;
  quantity: number;
  available: boolean;
  name: string | null;
  packageForm: string | null;
  variantLabel: string | null;
  sku: string | null;
  unitAmountMinor: number | null;
  lineSubtotalMinor: number | null;
  currency: string | null;
}>;

export type SafeCartPreview = Readonly<{
  items: readonly SafeCartPreviewItem[];
  subtotalMinor: number;
  currency: string | null;
  taxMinor: null;
  shippingMinor: null;
  finalDiscountMinor: null;
}>;

export const CART_PREVIEW_REASON_ORDER = [
  "server_facts_changed", "checkout_unavailable", "pricing_pending", "product_unavailable", "insufficient_quantity", "unknown_variant",
] as const;

export type CartPreview = Readonly<{
  schemaVersion: 2;
  items: readonly CartPreviewItem[];
  subtotalMinor: number;
  currency: string | null;
  taxMinor: null;
  shippingMinor: null;
  finalDiscountMinor: null;
  previewToken: string;
  requiresAcknowledgement: boolean;
  reasons: readonly (typeof CART_PREVIEW_REASON_ORDER)[number][];
}>;

export function cartPreviewReasons(items: readonly CartPreviewItem[], factsChanged: boolean): CartPreview["reasons"] {
  const states = new Set(items.map((item) => item.purchaseState));
  return Object.freeze(CART_PREVIEW_REASON_ORDER.filter((reason) => {
    if (reason === "server_facts_changed") return factsChanged;
    if (reason === "checkout_unavailable") return states.has("checkout_unavailable") || states.has("local_preview");
    if (reason === "product_unavailable") return states.has("unavailable");
    return states.has(reason);
  }));
}

export function canContinueFromPreview(
  preview: CartPreview,
  acknowledgedPreviewToken: string | null,
): boolean {
  if (preview.items.length === 0 || preview.items.some((item) => item.purchaseState !== "ready" || !item.available)) return false;
  return !preview.reasons.includes("server_facts_changed") || acknowledgedPreviewToken === preview.previewToken;
}
