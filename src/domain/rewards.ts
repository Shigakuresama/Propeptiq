import type { Result } from "@/domain/result";

/** Maximum length of an immutable reward-ledger flow authority label. */
export const REWARD_LEDGER_SOURCE_TYPE_MAX_LENGTH = 64;

export type GrowthProgramStatus = "draft" | "active" | "retired";

export type LoyaltyPolicy = Readonly<{
  id: string;
  version: number;
  status: GrowthProgramStatus;
  pointsPerDollar: number;
  redemptionMinorPerPoint: number;
  minimumRedemptionPoints: number;
  maximumRedemptionBasisPoints: number;
  expiresAfterDays: null;
  effectiveAt: string;
  supersededAt: string | null;
}>;

export type RewardPolicyError = Readonly<{
  code:
    | "invalid_policy"
    | "unexpected_field"
    | "invalid_input"
    | "invalid_amount"
    | "invalid_points"
    | "currency_mismatch"
    | "below_minimum"
    | "redemption_cap_exceeded"
    | "insufficient_balance"
    | "negative_balance"
    | "arithmetic_overflow";
  field: string;
}>;

export type EarnedPoints = Readonly<{
  eligibleMerchandiseMinor: number;
  earnedPoints: number;
}>;

export type RewardRedemption = Readonly<{
  redemptionPoints: number;
  redemptionMinor: number;
  maximumPoints: number;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function unexpectedField(value: Record<string, unknown>, allowed: readonly string[]): string | null {
  const allowedKeys = new Set(allowed);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowedKeys.has(key)) return typeof key === "string" ? key : "";
  }
  let prototype = Object.getPrototypeOf(value) as object | null;
  while (prototype !== null && prototype !== Object.prototype) {
    for (const key of Reflect.ownKeys(prototype)) {
      if (typeof key !== "string" || !allowedKeys.has(key)) return typeof key === "string" ? key : "";
    }
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  return null;
}

function hasOwnFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => Object.hasOwn(value, field));
}

function isNonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function fail(code: RewardPolicyError["code"], field: string): Result<never, RewardPolicyError> {
  return Object.freeze({ ok: false, error: Object.freeze({ code, field }) });
}

export function parseLoyaltyPolicy(input: unknown): Result<LoyaltyPolicy, RewardPolicyError> {
  if (!isRecord(input)) return fail("invalid_policy", "policy");
  const fields = ["id", "version", "status", "pointsPerDollar", "redemptionMinorPerPoint", "minimumRedemptionPoints", "maximumRedemptionBasisPoints", "expiresAfterDays", "effectiveAt", "supersededAt"] as const;
  const extra = unexpectedField(input, fields);
  if (extra !== null) return fail("unexpected_field", extra);
  if (!hasOwnFields(input, fields)) return fail("invalid_policy", "policy");
  if (!isNonBlank(input.id)) return fail("invalid_policy", "id");
  const version = input.version;
  if (!isSafeInteger(version) || version <= 0) return fail("invalid_policy", "version");
  if (input.status !== "draft" && input.status !== "active" && input.status !== "retired") return fail("invalid_policy", "status");
  if (!isSafeInteger(input.pointsPerDollar) || input.pointsPerDollar !== 2) return fail("invalid_policy", "pointsPerDollar");
  if (!isSafeInteger(input.redemptionMinorPerPoint) || input.redemptionMinorPerPoint !== 1) return fail("invalid_policy", "redemptionMinorPerPoint");
  if (!isSafeInteger(input.minimumRedemptionPoints) || input.minimumRedemptionPoints !== 500) return fail("invalid_policy", "minimumRedemptionPoints");
  if (!isSafeInteger(input.maximumRedemptionBasisPoints) || input.maximumRedemptionBasisPoints !== 2_500) return fail("invalid_policy", "maximumRedemptionBasisPoints");
  if (input.expiresAfterDays !== null) return fail("invalid_policy", "expiresAfterDays");
  if (!isIsoTimestamp(input.effectiveAt)) return fail("invalid_policy", "effectiveAt");
  if (input.supersededAt !== null && !isIsoTimestamp(input.supersededAt)) return fail("invalid_policy", "supersededAt");
  if (input.supersededAt !== null && input.supersededAt < input.effectiveAt) return fail("invalid_policy", "supersededAt");
  return Object.freeze({ ok: true, value: deepFreeze({ ...input } as LoyaltyPolicy) });
}

function parseCalculationInput(input: unknown): Result<Readonly<Record<string, unknown>>, RewardPolicyError> {
  if (!isRecord(input)) return fail("invalid_input", "input");
  const extra = unexpectedField(input, ["policy", "merchandiseSubtotalMinor", "promotionDiscountMinor", "referralDiscountMinor", "redeemedPoints", "taxMinor", "shippingMinor"]);
  if (extra !== null) return fail("unexpected_field", extra);
  for (const field of ["merchandiseSubtotalMinor", "promotionDiscountMinor", "referralDiscountMinor", "redeemedPoints", "taxMinor", "shippingMinor"] as const) {
    if (!isSafeInteger(input[field]) || input[field] < 0) return fail("invalid_amount", field);
  }
  return Object.freeze({ ok: true, value: input });
}

export function calculateEarnedPoints(input: unknown): Result<EarnedPoints, RewardPolicyError> {
  const parsed = parseCalculationInput(input);
  if (!parsed.ok) return parsed;
  const policy = parseLoyaltyPolicy(parsed.value.policy);
  if (!policy.ok) return policy.error.field === "policy" ? policy : fail("invalid_input", "policy");
  const value = parsed.value;
  const discounts = (value.promotionDiscountMinor as number) + (value.referralDiscountMinor as number) + (value.redeemedPoints as number) * policy.value.redemptionMinorPerPoint;
  if (!Number.isSafeInteger(discounts) || discounts > (value.merchandiseSubtotalMinor as number)) {
    return fail("invalid_amount", discounts > (value.merchandiseSubtotalMinor as number) ? "promotionDiscountMinor" : "redeemedPoints");
  }
  const eligibleMerchandiseMinor = (value.merchandiseSubtotalMinor as number) - discounts;
  const earned = (BigInt(eligibleMerchandiseMinor) * BigInt(policy.value.pointsPerDollar)) / 100n;
  if (earned > BigInt(Number.MAX_SAFE_INTEGER)) return fail("arithmetic_overflow", "earnedPoints");
  return Object.freeze({ ok: true, value: deepFreeze({ eligibleMerchandiseMinor, earnedPoints: Number(earned) }) });
}

export function calculateRewardRedemption(input: unknown): Result<RewardRedemption, RewardPolicyError> {
  if (!isRecord(input)) return fail("invalid_input", "input");
  const extra = unexpectedField(input, ["policy", "requestedPoints", "availablePoints", "postPromotionMerchandiseMinor", "currency"]);
  if (extra !== null) return fail("unexpected_field", extra);
  const policy = parseLoyaltyPolicy(input.policy);
  if (!policy.ok) return fail("invalid_input", "policy");
  if (input.currency !== "USD") return fail("currency_mismatch", "currency");
  const requestedPoints = input.requestedPoints;
  const availablePoints = input.availablePoints;
  const postPromotionMerchandiseMinor = input.postPromotionMerchandiseMinor;
  if (!isSafeInteger(requestedPoints) || requestedPoints <= 0) return fail("invalid_points", "requestedPoints");
  if (!isSafeInteger(availablePoints)) return fail("invalid_points", "availablePoints");
  if (availablePoints < 0) return fail("negative_balance", "requestedPoints");
  if (!isSafeInteger(postPromotionMerchandiseMinor) || postPromotionMerchandiseMinor < 0) return fail("invalid_amount", "postPromotionMerchandiseMinor");
  if (requestedPoints < policy.value.minimumRedemptionPoints) return fail("below_minimum", "requestedPoints");
  if (requestedPoints > availablePoints) return fail("insufficient_balance", "requestedPoints");
  const maximumMinor = (BigInt(postPromotionMerchandiseMinor) * BigInt(policy.value.maximumRedemptionBasisPoints)) / 10_000n;
  const maximumPoints = maximumMinor / BigInt(policy.value.redemptionMinorPerPoint);
  if (maximumPoints > BigInt(Number.MAX_SAFE_INTEGER)) return fail("arithmetic_overflow", "maximumPoints");
  if (BigInt(requestedPoints) > maximumPoints) return fail("redemption_cap_exceeded", "requestedPoints");
  const redemptionMinor = BigInt(requestedPoints) * BigInt(policy.value.redemptionMinorPerPoint);
  if (redemptionMinor > BigInt(Number.MAX_SAFE_INTEGER)) return fail("arithmetic_overflow", "redemptionMinor");
  return Object.freeze({ ok: true, value: deepFreeze({ redemptionPoints: requestedPoints, redemptionMinor: Number(redemptionMinor), maximumPoints: Number(maximumPoints) }) });
}
