import { createHash } from "node:crypto";

import {
  calculateVariantLinePrice,
  quantityDiscountBps,
  resolveEffectiveDiscount,
  type EligiblePromotion,
} from "@/domain/storefront-pricing";

import { normalizeCart } from "./cart-storage";
import type { CartPreview, CartPreviewItem } from "./preview-types";

export { canContinueFromPreview } from "./preview-types";
export type { CartPreview, CartPreviewItem } from "./preview-types";

export type CartPreviewVariant = Readonly<{
  variantId: string;
  productId: string;
  name: string;
  packageForm: string;
  baseUnitMinor: number;
  currency: "USD";
  priceStatus: "pending" | "active" | "unavailable";
  availability: "preview_only" | "available" | "unavailable";
  availableQuantity: number;
  eligiblePromotions: readonly EligiblePromotion[];
}>;

export type CartPreviewSource = Readonly<{
  variants: readonly CartPreviewVariant[];
}>;

function createPreviewToken(items: readonly CartPreviewItem[]): string {
  const facts = items.map((item) => ({
    variantId: item.variantId,
    name: item.name,
    packageForm: item.packageForm,
    unitAmountMinor: item.unitAmountMinor,
    currency: item.currency,
  }));
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex");
}

export function buildCartPreview(
  requested: unknown,
  source: CartPreviewSource,
  previousPreviewToken: string | null = null,
): CartPreview {
  const variantsById = new Map(source.variants.map((variant) => [variant.variantId, variant] as const));
  const items = normalizeCart(requested).map<CartPreviewItem>((line) => {
    const variant = variantsById.get(line.variantId);
    if (!variant) {
      return {
        variantId: line.variantId,
        quantity: line.quantity,
        available: false,
        name: null,
        packageForm: null,
        unitAmountMinor: null,
        lineSubtotalMinor: null,
        currency: null,
      };
    }
    const effectiveDiscount = resolveEffectiveDiscount({
      quantityDiscountBps: quantityDiscountBps(line.quantity),
      eligiblePromotions: variant.eligiblePromotions,
    });
    const price = calculateVariantLinePrice({
      variantId: variant.variantId,
      baseUnitMinor: variant.baseUnitMinor,
      quantity: line.quantity,
      priceStatus: variant.priceStatus,
      effectiveDiscount,
    });
    return {
      variantId: line.variantId,
      quantity: line.quantity,
      available:
        variant.availability === "available" &&
        line.quantity <= variant.availableQuantity &&
        price.checkoutReady,
      name: variant.name,
      packageForm: variant.packageForm,
      unitAmountMinor: price.effectiveUnitMinor,
      lineSubtotalMinor: price.lineSubtotalMinor,
      currency: variant.currency,
    };
  });
  const previewToken = createPreviewToken(items);
  const unavailable = items.some((item) => !item.available);
  const factsChanged = previousPreviewToken !== null && previousPreviewToken !== previewToken;
  const reasons: CartPreview["reasons"] = [
    ...(factsChanged ? (["server_facts_changed"] as const) : []),
    ...(unavailable ? (["product_unavailable"] as const) : []),
  ];

  return {
    items,
    subtotalMinor: items.reduce((total, item) => total + (item.lineSubtotalMinor ?? 0), 0),
    currency: items.find((item) => item.currency !== null)?.currency ?? null,
    taxMinor: null,
    shippingMinor: null,
    finalDiscountMinor: null,
    previewToken,
    requiresAcknowledgement: factsChanged || unavailable,
    reasons,
  };
}
