import type { PriceStatus, StorefrontVariant } from "@/catalog/storefront-types";
import {
  storefrontPromotionDateEpochNanoseconds,
  storefrontPromotionInstantEpochNanoseconds,
} from "./storefront-promotion-time";

const BASIS_POINT_DENOMINATOR = 10_000n;
const MAX_QUANTITY = 25;

export const QUANTITY_TIERS = Object.freeze([
  Object.freeze({ minBottleCount: 1, maxBottleCount: 1, discountBps: 0 }),
  Object.freeze({ minBottleCount: 2, maxBottleCount: 3, discountBps: 300 }),
  Object.freeze({ minBottleCount: 4, maxBottleCount: 10, discountBps: 600 }),
  Object.freeze({ minBottleCount: 11, maxBottleCount: null, discountBps: 3000 }),
] as const);

export type StorefrontPromotionScope =
  | Readonly<{ kind: "sitewide" }>
  | Readonly<{ kind: "products"; productIds: readonly string[] }>
  | Readonly<{ kind: "variants"; variantIds: readonly string[] }>;

/** The server-resolved promotion shape consumed by the storefront pricing seam. */
export type StorefrontPromotion = Readonly<{
  id: string;
  displayName?: string;
  displayCode?: string | null;
  /** Basis points are authoritative for pricing. */
  discountBps?: number;
  /** Retained as an optional display compatibility field for catalog projections. */
  percentage?: number;
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
  timezone?: string;
  scope: StorefrontPromotionScope;
  applicationMode: "automatic" | "code_required";
}>;

export type EligiblePromotion = Readonly<{
  id: string;
  discountBps: number;
}>;

export type EffectiveDiscount = Readonly<{
  source: "quantity" | "promotion" | "stacked";
  discountBps: number;
  promotionId: string | null;
  campaignDiscountBps: number;
  volumeDiscountBps: number;
}>;

export type EffectiveDiscountInput = Readonly<{
  quantityDiscountBps: number;
  eligiblePromotions: readonly EligiblePromotion[];
}>;

export type PromotionTarget =
  | Pick<StorefrontVariant, "id" | "productId">
  | Readonly<{ variantId: string; productId: string }>;

export type LinePriceInput = Readonly<{
  variantId: string;
  baseUnitMinor: number;
  quantity: number;
  effectiveDiscount: EffectiveDiscount;
  /** Pending and unavailable prices are previewable but cannot enter checkout. */
  priceStatus?: PriceStatus;
}>;

export type EffectiveLinePrice = Readonly<{
  variantId: string;
  quantity: number;
  baseUnitMinor: number;
  effectiveDiscountBps: number;
  campaignDiscountBps: number;
  volumeDiscountBps: number;
  campaignUnitMinor: number;
  lineCampaignSavingsMinor: number;
  lineVolumeSavingsMinor: number;
  effectiveUnitMinor: number;
  lineSubtotalMinor: number;
  lineSavingsMinor: number;
  appliedPromotionIds: readonly string[];
  checkoutReady: boolean;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidBasisPoints(value: unknown, allowZero = false): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    (allowZero ? value >= 0 : value >= 1) &&
    value <= 10_000
  );
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

export function quantityDiscountBps(quantity: number, packageQuantity = 1): number {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new RangeError("quantity must be an integer from 1 through 25");
  }
  const bottleCount = quantity * packageQuantity;
  if (!Number.isSafeInteger(packageQuantity) || packageQuantity < 1 || !Number.isSafeInteger(bottleCount)) {
    throw new RangeError("packageQuantity and bottle count must be positive safe integers");
  }
  return QUANTITY_TIERS.reduce(
    (discount, tier) => (bottleCount >= tier.minBottleCount ? tier.discountBps : discount),
    0,
  );
}

type PromotionInterval = Readonly<{
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
}>;

export function isStorefrontPromotionActive(
  promotion: PromotionInterval,
  now: Date,
): boolean {
  if (
    !isRecord(promotion) ||
    typeof promotion.enabled !== "boolean" ||
    (promotion.startAt !== null && typeof promotion.startAt !== "string") ||
    (promotion.endAt !== null && typeof promotion.endAt !== "string") ||
    !(now instanceof Date) ||
    !Number.isFinite(now.valueOf())
  ) {
    return false;
  }
  if (!promotion.enabled) return false;

  const start = promotion.startAt === null ? null : storefrontPromotionInstantEpochNanoseconds(promotion.startAt);
  const end = promotion.endAt === null ? null : storefrontPromotionInstantEpochNanoseconds(promotion.endAt);
  if ((promotion.startAt !== null && start === null) || (promotion.endAt !== null && end === null)) {
    return false;
  }
  const nowInstant = storefrontPromotionDateEpochNanoseconds(now);
  return nowInstant !== null &&
    (start === null || nowInstant >= start) &&
    (end === null || nowInstant < end);
}

export function promotionApplies(
  promotion: Pick<StorefrontPromotion, "scope">,
  target: PromotionTarget,
): boolean {
  if (!isRecord(promotion) || !isRecord(promotion.scope) || !isRecord(target)) return false;
  if (!isNonBlankString(target.productId)) return false;
  const scope = promotion.scope;
  if (scope.kind === "sitewide") return true;
  if (scope.kind === "products") {
    return (
      isDenseArray(scope.productIds) &&
      scope.productIds.every(isNonBlankString) &&
      scope.productIds.includes(target.productId)
    );
  }
  if (scope.kind === "variants") {
    const variantId = "id" in target ? target.id : target.variantId;
    return (
      isNonBlankString(variantId) &&
      isDenseArray(scope.variantIds) &&
      scope.variantIds.every(isNonBlankString) &&
      scope.variantIds.includes(variantId)
    );
  }
  return false;
}

export function resolveEffectiveDiscount(input: EffectiveDiscountInput): EffectiveDiscount {
  if (!isRecord(input) || !isValidBasisPoints(input.quantityDiscountBps, true) || !isDenseArray(input.eligiblePromotions)) {
    throw new RangeError("invalid effective discount input");
  }

  const seenIds = new Set<string>();
  const eligiblePromotions: EligiblePromotion[] = [];
  for (let index = 0; index < input.eligiblePromotions.length; index += 1) {
    const candidate = input.eligiblePromotions[index];
    if (
      !isRecord(candidate) ||
      !isNonBlankString(candidate.id) ||
      !isValidBasisPoints(candidate.discountBps) ||
      seenIds.has(candidate.id)
    ) {
      throw new RangeError(`invalid eligible promotion at index ${index}`);
    }
    seenIds.add(candidate.id);
    eligiblePromotions.push({ id: candidate.id, discountBps: candidate.discountBps });
  }
  eligiblePromotions.sort(
    (left, right) => right.discountBps - left.discountBps || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );

  const bestPromotion = eligiblePromotions[0];
  if (bestPromotion !== undefined) {
    return Object.freeze({
      source: input.quantityDiscountBps > 0 ? "stacked" : "promotion",
      discountBps: 10_000 - Number(roundHalfUp(
        BigInt(10_000 - bestPromotion.discountBps) * BigInt(10_000 - input.quantityDiscountBps),
        BASIS_POINT_DENOMINATOR,
      )),
      promotionId: bestPromotion.id,
      campaignDiscountBps: bestPromotion.discountBps,
      volumeDiscountBps: input.quantityDiscountBps,
    });
  }
  return Object.freeze({
    source: "quantity",
    discountBps: input.quantityDiscountBps,
    promotionId: null,
    campaignDiscountBps: 0,
    volumeDiscountBps: input.quantityDiscountBps,
  });
}

export function calculateVariantLinePrice(input: LinePriceInput): EffectiveLinePrice {
  if (
    !isRecord(input) ||
    !isNonBlankString(input.variantId) ||
    !Number.isSafeInteger(input.baseUnitMinor) ||
    input.baseUnitMinor < 0 ||
    !Number.isSafeInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > MAX_QUANTITY ||
    !isRecord(input.effectiveDiscount) ||
    !isValidBasisPoints(input.effectiveDiscount.discountBps, true) ||
    !isValidBasisPoints(input.effectiveDiscount.campaignDiscountBps, true) ||
    !isValidBasisPoints(input.effectiveDiscount.volumeDiscountBps, true) ||
    (input.priceStatus !== undefined &&
      input.priceStatus !== "pending" &&
      input.priceStatus !== "active" &&
      input.priceStatus !== "unavailable")
  ) {
    throw new RangeError("invalid variant line price input");
  }
  const effectiveDiscount = input.effectiveDiscount;
  if (
    (effectiveDiscount.source !== "quantity" && effectiveDiscount.source !== "promotion" && effectiveDiscount.source !== "stacked") ||
    (effectiveDiscount.promotionId !== null && !isNonBlankString(effectiveDiscount.promotionId)) ||
    (effectiveDiscount.source === "quantity" && effectiveDiscount.promotionId !== null) ||
    (effectiveDiscount.source !== "quantity" && effectiveDiscount.promotionId === null) ||
    (effectiveDiscount.source === "quantity" && effectiveDiscount.campaignDiscountBps !== 0) ||
    (effectiveDiscount.source !== "quantity" && effectiveDiscount.campaignDiscountBps === 0) ||
    (effectiveDiscount.source === "promotion" && effectiveDiscount.volumeDiscountBps !== 0) ||
    (effectiveDiscount.source === "stacked" && effectiveDiscount.volumeDiscountBps === 0)
  ) {
    throw new RangeError("invalid effective discount");
  }

  const resolved = resolveEffectiveDiscount({
    quantityDiscountBps: effectiveDiscount.volumeDiscountBps,
    eligiblePromotions: effectiveDiscount.promotionId === null ? [] : [{ id: effectiveDiscount.promotionId, discountBps: effectiveDiscount.campaignDiscountBps }],
  });
  if (resolved.discountBps !== effectiveDiscount.discountBps) throw new RangeError("inconsistent effective discount");
  const campaignUnit = roundHalfUp(BigInt(input.baseUnitMinor) * BigInt(10_000 - effectiveDiscount.campaignDiscountBps), BASIS_POINT_DENOMINATOR);
  const unit = roundHalfUp(campaignUnit * BigInt(10_000 - effectiveDiscount.volumeDiscountBps), BASIS_POINT_DENOMINATOR);
  const subtotal = unit * BigInt(input.quantity);
  const gross = BigInt(input.baseUnitMinor) * BigInt(input.quantity);
  const maximum = BigInt(Number.MAX_SAFE_INTEGER);
  if (subtotal > maximum || gross > maximum) {
    throw new RangeError("line amount exceeds safe integer range");
  }

  const appliedPromotionIds = effectiveDiscount.promotionId === null ? [] : [effectiveDiscount.promotionId];
  return Object.freeze({
    variantId: input.variantId,
    quantity: input.quantity,
    baseUnitMinor: input.baseUnitMinor,
    effectiveDiscountBps: effectiveDiscount.discountBps,
    campaignDiscountBps: effectiveDiscount.campaignDiscountBps,
    volumeDiscountBps: effectiveDiscount.volumeDiscountBps,
    campaignUnitMinor: Number(campaignUnit),
    lineCampaignSavingsMinor: Number((BigInt(input.baseUnitMinor) - campaignUnit) * BigInt(input.quantity)),
    lineVolumeSavingsMinor: Number((campaignUnit - unit) * BigInt(input.quantity)),
    effectiveUnitMinor: Number(unit),
    lineSubtotalMinor: Number(subtotal),
    lineSavingsMinor: Number(gross - subtotal),
    appliedPromotionIds: Object.freeze(appliedPromotionIds),
    checkoutReady: input.baseUnitMinor > 0 && (input.priceStatus === undefined || input.priceStatus === "active"),
  });
}
