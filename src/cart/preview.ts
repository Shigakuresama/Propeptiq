import { createHash } from "node:crypto";

import type { PublicCatalog } from "@/catalog/types";

import { normalizeCart } from "./cart-storage";
import type { CartPreview, CartPreviewItem } from "./preview-types";

export { canContinueFromPreview } from "./preview-types";
export type { CartPreview, CartPreviewItem } from "./preview-types";

function createPreviewToken(items: readonly CartPreviewItem[]): string {
  const facts = items.map((item) => ({
    productId: item.productId,
    name: item.name,
    packageForm: item.packageForm,
    unitAmountMinor: item.unitAmountMinor,
    currency: item.currency,
  }));
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}

export function buildCartPreview(
  requested: unknown,
  catalog: PublicCatalog,
  previousPreviewToken: string | null = null,
): CartPreview {
  const items = normalizeCart(requested).map<CartPreviewItem>((line) => {
    const product = catalog.products.find(
      (candidate) => candidate.id === line.productId,
    );
    const available = Boolean(
      product && line.quantity <= product.availableQuantity,
    );
    return {
      productId: line.productId,
      quantity: line.quantity,
      available,
      name: product?.name ?? null,
      packageForm: product?.packageForm ?? null,
      unitAmountMinor: product?.price.amountMinor ?? null,
      lineSubtotalMinor: product
        ? product.price.amountMinor * line.quantity
        : null,
      currency: product?.price.currency ?? null,
    };
  });
  const previewToken = createPreviewToken(items);
  const unavailable = items.some((item) => !item.available);
  const factsChanged =
    previousPreviewToken !== null && previousPreviewToken !== previewToken;
  const reasons: CartPreview["reasons"] = [
    ...(factsChanged ? (["server_facts_changed"] as const) : []),
    ...(unavailable ? (["product_unavailable"] as const) : []),
  ];

  return {
    items,
    subtotalMinor: items.reduce(
      (total, item) => total + (item.lineSubtotalMinor ?? 0),
      0,
    ),
    currency:
      items.find((item) => item.currency !== null)?.currency ?? null,
    taxMinor: null,
    shippingMinor: null,
    finalDiscountMinor: null,
    previewToken,
    requiresAcknowledgement: factsChanged || unavailable,
    reasons,
  };
}
