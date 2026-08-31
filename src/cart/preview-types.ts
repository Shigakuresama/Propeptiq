export type CartPreviewItem = {
  variantId: string;
  quantity: number;
  available: boolean;
  name: string | null;
  packageForm: string | null;
  variantLabel?: string | null;
  sku?: string | null;
  unitAmountMinor: number | null;
  lineSubtotalMinor: number | null;
  currency: string | null;
};

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

export type CartPreview = {
  items: readonly CartPreviewItem[];
  subtotalMinor: number;
  currency: string | null;
  taxMinor: null;
  shippingMinor: null;
  finalDiscountMinor: null;
  previewToken: string;
  requiresAcknowledgement: boolean;
  reasons: readonly ("server_facts_changed" | "product_unavailable")[];
};

export function canContinueFromPreview(
  preview: CartPreview,
  acknowledgedPreviewToken: string | null,
): boolean {
  if (preview.items.length === 0 || preview.items.some((item) => !item.available)) return false;
  return !preview.requiresAcknowledgement || acknowledgedPreviewToken === preview.previewToken;
}
