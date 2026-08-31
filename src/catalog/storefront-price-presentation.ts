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
  | Readonly<{ state: "priced"; price: EffectiveLinePrice }>
  | Readonly<{ state: "pending"; reason: "pricing_coming_soon" }>
  | Readonly<{ state: "unavailable"; reason: "unavailable" | "checkout_unavailable" }>;

export function canAddPublicVariant(
  variant: Pick<PublicStorefrontVariant, "availability" | "priceStatus" | "baseUnitMinor" | "currency" | "checkoutReady">,
  mode: PricePresentationMode,
): boolean {
  if (variant.priceStatus === "active") {
    return variant.availability === "available" &&
      variant.baseUnitMinor !== null && Number.isSafeInteger(variant.baseUnitMinor) &&
      variant.baseUnitMinor > 0 && variant.currency === "USD" && variant.checkoutReady === true;
  }
  if (variant.priceStatus === "pending") {
    return mode !== "production" && variant.availability === "preview_only" &&
      variant.baseUnitMinor === 0 && variant.currency === "USD" && variant.checkoutReady === false;
  }
  return false;
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
  if (variant.availability === "unavailable") return { state: "unavailable", reason: "unavailable" };
  const previewZero = variant.priceStatus === "pending" && pricing.mode !== "production" &&
    variant.baseUnitMinor === 0 && variant.currency === "USD";
  if (variant.baseUnitMinor === null || variant.currency === null ||
      (variant.priceStatus !== "active" && !previewZero) ||
      (variant.priceStatus === "active" && (!Number.isSafeInteger(variant.baseUnitMinor) || variant.baseUnitMinor <= 0 || variant.currency !== "USD"))) {
    return { state: "pending", reason: "pricing_coming_soon" };
  }
  const eligiblePromotions = pricing.automaticPromotions
    .filter((promotion) => promotionApplies(promotion, { id: variant.id, productId: input.productId }))
    .map((promotion) => ({ id: promotion.id, discountBps: promotion.discountBps }));
  const effectiveDiscount = resolveEffectiveDiscount({
    quantityDiscountBps: quantityDiscountBps(input.quantity),
    eligiblePromotions,
  });
  return { state: "priced", price: calculateVariantLinePrice({
    variantId: variant.id,
    baseUnitMinor: variant.baseUnitMinor,
    quantity: input.quantity,
    priceStatus: variant.priceStatus,
    effectiveDiscount,
  }) };
}

export function selectCardVariant(product: { kind: "canonical"; variants: readonly PublicStorefrontVariant[]; defaultVariantId: string }): PublicStorefrontVariant | null {
  const candidates = product.variants.filter((variant) => variant.availability !== "unavailable" && variant.baseUnitMinor !== null && variant.currency !== null);
  return [...candidates].sort((a, b) => (a.baseUnitMinor! - b.baseUnitMinor!) || a.label.localeCompare(b.label, "en-US") || a.id.localeCompare(b.id))[0] ?? product.variants.find((variant) => variant.id === product.defaultVariantId) ?? null;
}
