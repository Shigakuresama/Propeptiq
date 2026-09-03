import type { PublicStorefrontVariant } from "./storefront-public";
import {
  calculateVariantLinePrice,
  promotionApplies,
  quantityDiscountBps,
  resolveEffectiveDiscount,
  type EffectiveLinePrice,
} from "@/domain/storefront-pricing";

export type PricePresentationMode = "local" | "test" | "preview" | "production";

export type PublicStorefrontAutomaticPromotion = Readonly<{
  id: string;
  displayName: string;
  displayCode: string | null;
  discountBps: number;
  enabled: true;
  startAt: string | null;
  endAt: string | null;
  timezone: string;
  scope: Readonly<
    | { kind: "sitewide" }
    | { kind: "products"; productIds: readonly string[] }
    | { kind: "variants"; variantIds: readonly string[] }
  >;
  applicationMode: "automatic";
}>;

export type PublicStorefrontPricingContext = Readonly<{
  mode: PricePresentationMode;
  evaluatedAt: string;
  automaticPromotions: readonly PublicStorefrontAutomaticPromotion[];
}>;

export type PricePresentation =
  | Readonly<{
      state: "priced";
      purchaseState: "ready" | "checkout_unavailable" | "local_preview";
      price: Omit<EffectiveLinePrice, "checkoutReady">;
    }>
  | Readonly<{
      state: "pending";
      purchaseState: "pricing_pending";
      reason: "pricing_coming_soon";
    }>
  | Readonly<{
      state: "unavailable";
      purchaseState: "unavailable";
      reason: "unavailable";
    }>;

export function canAddPublicVariant(
  variant: Pick<PublicStorefrontVariant, "availability" | "priceStatus" | "baseUnitMinor" | "currency" | "checkoutReady">,
  mode: PricePresentationMode,
): boolean {
  if (variant.priceStatus === "active") {
    if (variant.availability === "available") return variant.checkoutReady === true && variant.baseUnitMinor !== null && Number.isSafeInteger(variant.baseUnitMinor) && variant.baseUnitMinor > 0 && variant.currency === "USD";
    return variant.availability === "preview_only" && variant.checkoutReady === false && mode !== "production" && variant.baseUnitMinor !== null && Number.isSafeInteger(variant.baseUnitMinor) && variant.baseUnitMinor > 0 && variant.currency === "USD";
  }
  if (variant.priceStatus === "pending") {
    return mode !== "production" && variant.availability === "preview_only" &&
      variant.baseUnitMinor === 0 && variant.currency === "USD" && variant.checkoutReady === false;
  }
  return false;
}

export type PublicVariantPurchaseState = "ready" | "checkout_unavailable" | "pricing_pending" | "unavailable" | "local_preview";

/** Pure status projection for selectors; intentionally performs no price arithmetic. */
export function publicVariantPurchaseState(
  variant: Pick<PublicStorefrontVariant, "availability" | "priceStatus" | "baseUnitMinor" | "currency" | "checkoutReady">,
  mode: PricePresentationMode,
): PublicVariantPurchaseState {
  if (variant.availability === "unavailable") return "unavailable";
  if (variant.priceStatus === "unavailable") return "pricing_pending";
  if (variant.priceStatus === "pending") {
    return variant.availability === "preview_only" && variant.baseUnitMinor === 0 && variant.currency === "USD" && variant.checkoutReady === false && mode !== "production"
      ? "local_preview"
      : "pricing_pending";
  }
  if (variant.priceStatus !== "active" || (variant.availability !== "available" && variant.availability !== "preview_only") || variant.baseUnitMinor === null || !Number.isSafeInteger(variant.baseUnitMinor) || variant.baseUnitMinor <= 0 || variant.currency !== "USD") return "pricing_pending";
  if (variant.availability === "preview_only") return variant.checkoutReady === false ? (mode === "production" ? "checkout_unavailable" : "local_preview") : "pricing_pending";
  return variant.checkoutReady === true ? "ready" : "checkout_unavailable";
}

export function formatStorefrontMoney(amountMinor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);
}

export function resolvePublicVariantPrice(input: Readonly<{
  variant: PublicStorefrontVariant;
  productId: string;
  quantity: number;
  pricing: PublicStorefrontPricingContext;
}>): PricePresentation {
  const { variant, pricing } = input;
  if (variant.availability === "unavailable") {
    return {
      state: "unavailable",
      purchaseState: "unavailable",
      reason: "unavailable",
    };
  }

  const activePrice =
    variant.priceStatus === "active" &&
    (variant.availability === "available" || variant.availability === "preview_only") &&
    variant.baseUnitMinor !== null &&
    Number.isSafeInteger(variant.baseUnitMinor) &&
    variant.baseUnitMinor > 0 &&
    variant.currency === "USD" &&
    (variant.availability !== "preview_only" || variant.checkoutReady === false);
  const previewZero =
    variant.priceStatus === "pending" &&
    variant.availability === "preview_only" &&
    variant.baseUnitMinor === 0 &&
    variant.currency === "USD" &&
    variant.checkoutReady === false &&
    pricing.mode !== "production";

  if (!activePrice && !previewZero) {
    return {
      state: "pending",
      purchaseState: "pricing_pending",
      reason: "pricing_coming_soon",
    };
  }

  const eligiblePromotions = pricing.automaticPromotions
    .filter((promotion) => promotionApplies(promotion, { id: variant.id, productId: input.productId }))
    .map((promotion) => ({ id: promotion.id, discountBps: promotion.discountBps }));
  const effectiveDiscount = resolveEffectiveDiscount({
    quantityDiscountBps: quantityDiscountBps(input.quantity),
    eligiblePromotions,
  });
  const calculated = calculateVariantLinePrice({
    variantId: variant.id,
    baseUnitMinor: variant.baseUnitMinor,
    quantity: input.quantity,
    priceStatus: variant.priceStatus,
    effectiveDiscount,
  });
  const publicPrice: Omit<EffectiveLinePrice, "checkoutReady"> = Object.freeze({
    variantId: calculated.variantId,
    quantity: calculated.quantity,
    baseUnitMinor: calculated.baseUnitMinor,
    effectiveDiscountBps: calculated.effectiveDiscountBps,
    effectiveUnitMinor: calculated.effectiveUnitMinor,
    lineSubtotalMinor: calculated.lineSubtotalMinor,
    lineSavingsMinor: calculated.lineSavingsMinor,
    appliedPromotionIds: calculated.appliedPromotionIds,
  });
  return {
    state: "priced",
    purchaseState: previewZero
      ? "local_preview"
      : variant.availability === "preview_only"
        ? (pricing.mode === "production" ? "checkout_unavailable" : "local_preview")
        : variant.checkoutReady === true ? "ready" : "checkout_unavailable",
    price: publicPrice,
  };
}

export function selectCardVariant(input: Readonly<{ product: { kind: "canonical"; id: string; variants: readonly PublicStorefrontVariant[]; defaultVariantId: string }; pricing: PublicStorefrontPricingContext }>): PublicStorefrontVariant | null {
  const candidates = input.product.variants.flatMap((variant) => {
    if (variant.availability === "unavailable") return [];
    const presentation = resolvePublicVariantPrice({ variant, productId: input.product.id, quantity: 1, pricing: input.pricing });
    return presentation.state === "priced" && presentation.price.baseUnitMinor > 0
      ? [{ variant, amount: presentation.price.effectiveUnitMinor }]
      : [];
  });
  const explicitDefault = candidates.find(
    (candidate) => candidate.variant.id === input.product.defaultVariantId,
  );
  if (explicitDefault) return explicitDefault.variant;
  return [...candidates].sort((a, b) => a.amount - b.amount || a.variant.label.localeCompare(b.variant.label, "en-US") || a.variant.id.localeCompare(b.variant.id))[0]?.variant ?? input.product.variants.find((variant) => variant.id === input.product.defaultVariantId) ?? null;
}

export function summarizePublicStorefrontVariants(
  variants: readonly Pick<PublicStorefrontVariant, "label" | "amount">[],
): string {
  if (variants.length === 1) {
    const only = variants[0]!;
    return only.amount === null
      ? only.label
      : `${only.amount.value} ${only.amount.unit}`;
  }

  const amounts = variants.map((variant) => variant.amount);
  const unit = amounts[0]?.unit;
  if (
    variants.length === 0 ||
    unit === undefined ||
    amounts.some(
      (amount) =>
        amount === null ||
        amount.unit !== unit ||
        !Number.isFinite(amount.value) ||
        amount.value <= 0,
    )
  ) {
    return "Multiple options";
  }

  return `From ${Math.min(...amounts.map((amount) => amount!.value))} ${unit}`;
}
