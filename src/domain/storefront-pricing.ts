import type { PriceStatus, StorefrontVariant } from "@/catalog/storefront-types";

const BASIS_POINT_DENOMINATOR = 10_000n;
const MAX_QUANTITY = 25;

export const QUANTITY_TIERS = Object.freeze([
  Object.freeze({ minQuantity: 1, discountBps: 0 }),
  Object.freeze({ minQuantity: 2, discountBps: 800 }),
  Object.freeze({ minQuantity: 3, discountBps: 1000 }),
  Object.freeze({ minQuantity: 10, discountBps: 3000 }),
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
  source: "quantity" | "promotion";
  discountBps: number;
  promotionId: string | null;
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

export function quantityDiscountBps(quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new RangeError("quantity must be an integer from 1 through 25");
  }
  return QUANTITY_TIERS.reduce(
    (discount, tier) => (quantity >= tier.minQuantity ? tier.discountBps : discount),
    0,
  );
}

type PromotionInterval = Readonly<{
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
}>;

function instant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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

  const start = promotion.startAt === null ? null : instant(promotion.startAt);
  const end = promotion.endAt === null ? null : instant(promotion.endAt);
  if ((promotion.startAt !== null && start === null) || (promotion.endAt !== null && end === null)) {
    return false;
  }
  const nowMs = now.valueOf();
  return (start === null || nowMs >= start) && (end === null || nowMs < end);
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
  if (bestPromotion !== undefined && bestPromotion.discountBps >= input.quantityDiscountBps) {
    return Object.freeze({
      source: "promotion",
      discountBps: bestPromotion.discountBps,
      promotionId: bestPromotion.id,
    });
  }
  return Object.freeze({
    source: "quantity",
    discountBps: input.quantityDiscountBps,
    promotionId: null,
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
    (input.priceStatus !== undefined &&
      input.priceStatus !== "pending" &&
      input.priceStatus !== "active" &&
      input.priceStatus !== "unavailable")
  ) {
    throw new RangeError("invalid variant line price input");
  }
  const effectiveDiscount = input.effectiveDiscount;
  if (
    (effectiveDiscount.source !== "quantity" && effectiveDiscount.source !== "promotion") ||
    (effectiveDiscount.promotionId !== null && !isNonBlankString(effectiveDiscount.promotionId)) ||
    (effectiveDiscount.source === "quantity" && effectiveDiscount.promotionId !== null) ||
    (effectiveDiscount.source === "promotion" && effectiveDiscount.promotionId === null) ||
    (effectiveDiscount.source === "promotion" && effectiveDiscount.discountBps === 0)
  ) {
    throw new RangeError("invalid effective discount");
  }

  const factor = BigInt(10_000 - effectiveDiscount.discountBps);
  const unit = roundHalfUp(BigInt(input.baseUnitMinor) * factor, BASIS_POINT_DENOMINATOR);
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
    effectiveUnitMinor: Number(unit),
    lineSubtotalMinor: Number(subtotal),
    lineSavingsMinor: Number(gross - subtotal),
    appliedPromotionIds: Object.freeze(appliedPromotionIds),
    checkoutReady: input.baseUnitMinor > 0 && (input.priceStatus === undefined || input.priceStatus === "active"),
  });
}
