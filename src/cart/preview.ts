import { createHash } from "node:crypto";

import { resolveVariantPricePresentation, type PricePresentationMode } from "@/catalog/storefront-price-presentation";

import { normalizeCart } from "./cart-storage";
import { cartPreviewReasons } from "./preview-types";
import { CartPreviewProjectionError, composeCartPreviewSources } from "./storefront-preview-source";
import type {
  CartPreview,
  CartPreviewItem,
  SafeCartPreview,
  SafeCartPreviewItem,
} from "./preview-types";

export { canContinueFromPreview } from "./preview-types";
export type {
  CartPreview,
  CartPreviewItem,
  SafeCartPreview,
  SafeCartPreviewItem,
} from "./preview-types";

export type CartPreviewVariant = Readonly<{
  variantId: string;
  productId: string;
  name: string;
  packageForm: string;
  variantLabel: string;
  sku: string;
  baseUnitMinor: number | null;
  currency: "USD" | null;
  priceStatus: "pending" | "active" | "unavailable";
  availability: "preview_only" | "available" | "unavailable";
  checkoutReady: boolean;
  availableQuantity: number | null;
  eligiblePromotions: readonly Readonly<{ id: string; discountBps: number; displayLabel: string }>[];
}>;

export type CartPreviewVariantSource = Readonly<{
  variants: readonly CartPreviewVariant[];
}>;

export type CartPreviewSource = CartPreviewVariantSource & Readonly<{ mode: PricePresentationMode }>;

function createPreviewToken(items: readonly CartPreviewItem[]): string {
  return createHash("sha256").update(JSON.stringify(items)).digest("hex");
}

export function buildCartPreview(
  requested: unknown,
  source: CartPreviewSource,
  previousPreviewToken: string | null = null,
): CartPreview {
  const validated = composeCartPreviewSources(source);
  const variantsById = new Map(validated.variants.map((variant) => [variant.variantId, variant] as const));
  const items = normalizeCart(requested).map<CartPreviewItem>((line) => {
    const variant = variantsById.get(line.variantId);
    const unpriced: CartPreviewItem = {
      variantId: line.variantId,
      quantity: line.quantity,
      available: false,
      purchaseState: "unknown_variant",
      name: variant?.name ?? null,
      variantLabel: variant?.variantLabel ?? null,
      sku: variant?.sku ?? null,
      packageForm: variant?.packageForm ?? null,
      baseUnitMinor: null,
      unitAmountMinor: null,
      lineSubtotalMinor: null,
      lineSavingsMinor: null,
      effectiveDiscountBps: null,
      appliedPromotions: Object.freeze([]),
      currency: null,
    };
    if (!variant) return Object.freeze(unpriced);
    if (variant.availability === "unavailable" || variant.priceStatus === "unavailable") {
      return Object.freeze({ ...unpriced, purchaseState: "unavailable" });
    }
    const presentation = resolveVariantPricePresentation({
      variant: { ...variant, id: variant.variantId },
      quantity: line.quantity,
      mode: validated.mode,
      eligiblePromotions: variant.eligiblePromotions,
    });
    if (presentation.state !== "priced") return Object.freeze({ ...unpriced, purchaseState: presentation.purchaseState });
    const price = presentation.price;
    const purchaseState = presentation.purchaseState !== "ready" ? presentation.purchaseState
      : variant.availableQuantity === null ? "checkout_unavailable"
        : variant.availableQuantity < line.quantity ? "insufficient_quantity" : "ready";
    return Object.freeze({
      ...unpriced,
      purchaseState,
      available: purchaseState === "ready",
      baseUnitMinor: price.baseUnitMinor,
      unitAmountMinor: price.effectiveUnitMinor,
      lineSubtotalMinor: price.lineSubtotalMinor,
      lineSavingsMinor: price.lineSavingsMinor,
      effectiveDiscountBps: price.effectiveDiscountBps,
      appliedPromotions: Object.freeze(price.appliedPromotionIds.map((id) => Object.freeze({
        id, label: variant.eligiblePromotions.find((promotion) => promotion.id === id)!.displayLabel,
      }))),
      currency: variant.currency,
    });
  });
  const previewToken = createPreviewToken(items);
  const factsChanged = previousPreviewToken !== null && previousPreviewToken !== previewToken;
  const reasons = cartPreviewReasons(items, factsChanged);
  const subtotalMinor = items.reduce((total, item) => total + (item.lineSubtotalMinor ?? 0), 0);
  if (!Number.isSafeInteger(subtotalMinor)) throw new CartPreviewProjectionError("invalid_source");

  return Object.freeze({
    schemaVersion: 2,
    items: Object.freeze(items),
    subtotalMinor,
    currency: items.find((item) => item.currency !== null)?.currency ?? null,
    taxMinor: null,
    shippingMinor: null,
    finalDiscountMinor: null,
    previewToken,
    requiresAcknowledgement: reasons.length > 0,
    reasons,
  });
}

export function buildSafeCartPreview(
  items: readonly SafeCartPreviewItem[],
): SafeCartPreview {
  const frozenItems = Object.freeze(items.map((item) => Object.freeze({ ...item })));
  const currencies = new Set(
    frozenItems.flatMap((item) => item.currency === null ? [] : [item.currency]),
  );
  return Object.freeze({
    items: frozenItems,
    subtotalMinor: frozenItems.reduce(
      (sum, item) => sum + (item.lineSubtotalMinor ?? 0),
      0,
    ),
    currency: currencies.size === 1 ? [...currencies][0]! : null,
    taxMinor: null,
    shippingMinor: null,
    finalDiscountMinor: null,
  });
}
