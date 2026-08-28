import type { Result } from "@/domain/result";

export type AffiliatePolicy = Readonly<{
  id: string; version: number; status: "draft" | "active" | "retired"; attributionDays: 30;
  firstOrderCommissionBasisPoints: number; reorderCommissionBasisPoints: number; reorderWindowDays: number;
  approvalDelayDays: number; payoutThresholdMinor: number; currency: "USD"; effectiveAt: string; supersededAt: string | null;
}>;

type AffiliateError = Readonly<{ code: "invalid_policy" | "unexpected_field" | "invalid_input" | "invalid_amount" | "currency_mismatch" | "partner_suspended" | "arithmetic_overflow"; field: string }>;
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function extras(value: Record<string, unknown>, allowed: readonly string[]): string | null { const set = new Set(allowed); for (const key of Reflect.ownKeys(value)) if (typeof key !== "string" || !set.has(key)) return typeof key === "string" ? key : ""; let prototype = Object.getPrototypeOf(value) as object | null; while (prototype !== null && prototype !== Object.prototype) { for (const key of Reflect.ownKeys(prototype)) if (typeof key !== "string" || !set.has(key)) return typeof key === "string" ? key : ""; prototype = Object.getPrototypeOf(prototype) as object | null; } return null; }
function isIso(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(new Date(value).valueOf()) && new Date(value).toISOString() === value; }
function safeInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value); }
function freeze<Value>(value: Value): Value { if (value !== null && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const nested of Object.values(value as Record<string, unknown>)) freeze(nested); } return value; }
function fail(code: AffiliateError["code"], field: string): Result<never, AffiliateError> { return Object.freeze({ ok: false, error: Object.freeze({ code, field }) }); }

export function parseAffiliatePolicy(input: unknown): Result<AffiliatePolicy, AffiliateError> {
  if (!isRecord(input)) return fail("invalid_policy", "policy");
  const extra = extras(input, ["id", "version", "status", "attributionDays", "firstOrderCommissionBasisPoints", "reorderCommissionBasisPoints", "reorderWindowDays", "approvalDelayDays", "payoutThresholdMinor", "currency", "effectiveAt", "supersededAt"]); if (extra !== null) return fail("unexpected_field", extra);
  if (typeof input.id !== "string" || input.id.trim().length === 0) return fail("invalid_policy", "id");
  const version = input.version;
  if (!safeInteger(version) || version <= 0) return fail("invalid_policy", "version");
  if (input.status !== "draft" && input.status !== "active" && input.status !== "retired") return fail("invalid_policy", "status");
  for (const [field, expected] of [["attributionDays", 30], ["firstOrderCommissionBasisPoints", 1_000], ["reorderCommissionBasisPoints", 500], ["reorderWindowDays", 180], ["approvalDelayDays", 30], ["payoutThresholdMinor", 5_000]] as const) if (!safeInteger(input[field]) || input[field] !== expected) return fail("invalid_policy", field);
  if (input.currency !== "USD") return fail("invalid_policy", "currency");
  if (!isIso(input.effectiveAt) || (input.supersededAt !== null && !isIso(input.supersededAt))) return fail("invalid_policy", !isIso(input.effectiveAt) ? "effectiveAt" : "supersededAt");
  return Object.freeze({ ok: true, value: freeze({ ...input } as AffiliatePolicy) });
}

export function calculateAffiliateCommission(input: unknown): Result<Readonly<{ commissionMinor: number; reversalMinor: number; netCommissionMinor: number }>, AffiliateError> {
  if (!isRecord(input)) return fail("invalid_input", "input");
  const extra = extras(input, ["policy", "partnerStatus", "orderKind", "daysSinceFirstQualifiedOrder", "postDiscountMerchandiseMinor", "refundedMerchandiseMinor", "currency"]); if (extra !== null) return fail("unexpected_field", extra);
  const policy = parseAffiliatePolicy(input.policy); if (!policy.ok) return fail("invalid_input", "policy");
  if (input.partnerStatus !== "active" && input.partnerStatus !== "suspended") return fail("invalid_input", "partnerStatus");
  if (input.partnerStatus === "suspended") return fail("partner_suspended", "partnerStatus");
  if (input.orderKind !== "first" && input.orderKind !== "reorder") return fail("invalid_input", "orderKind");
  const daysSinceFirstQualifiedOrder = input.daysSinceFirstQualifiedOrder;
  if ((input.orderKind === "first" && daysSinceFirstQualifiedOrder !== null) || (input.orderKind === "reorder" && (!safeInteger(daysSinceFirstQualifiedOrder) || daysSinceFirstQualifiedOrder < 0))) return fail("invalid_input", "daysSinceFirstQualifiedOrder");
  const postDiscountMerchandiseMinor = input.postDiscountMerchandiseMinor;
  const refundedMerchandiseMinor = input.refundedMerchandiseMinor;
  if (!safeInteger(postDiscountMerchandiseMinor) || postDiscountMerchandiseMinor < 0) return fail("invalid_amount", "postDiscountMerchandiseMinor");
  if (!safeInteger(refundedMerchandiseMinor) || refundedMerchandiseMinor < 0 || refundedMerchandiseMinor > postDiscountMerchandiseMinor) return fail("invalid_amount", "refundedMerchandiseMinor");
  if (input.currency !== policy.value.currency) return fail("currency_mismatch", "currency");
  const basisPoints = input.orderKind === "first" ? policy.value.firstOrderCommissionBasisPoints : (daysSinceFirstQualifiedOrder as number) <= policy.value.reorderWindowDays ? policy.value.reorderCommissionBasisPoints : 0;
  const commission = (BigInt(postDiscountMerchandiseMinor) * BigInt(basisPoints)) / 10_000n;
  if (commission > BigInt(Number.MAX_SAFE_INTEGER)) return fail("arithmetic_overflow", "commissionMinor");
  const reversal = postDiscountMerchandiseMinor === 0 ? 0n : (commission * BigInt(refundedMerchandiseMinor)) / BigInt(postDiscountMerchandiseMinor);
  return Object.freeze({ ok: true, value: freeze({ commissionMinor: Number(commission), reversalMinor: Number(reversal), netCommissionMinor: Number(commission - reversal) }) });
}

export function isAffiliatePayoutEligible(input: unknown): Result<Readonly<{ eligible: boolean; shortfallMinor: number }>, AffiliateError> {
  if (!isRecord(input)) return fail("invalid_input", "input");
  const extra = extras(input, ["policy", "approvedUnpaidCommissionMinor", "currency"]); if (extra !== null) return fail("unexpected_field", extra);
  const policy = parseAffiliatePolicy(input.policy); if (!policy.ok) return fail("invalid_input", "policy");
  const approvedUnpaidCommissionMinor = input.approvedUnpaidCommissionMinor;
  if (!safeInteger(approvedUnpaidCommissionMinor) || approvedUnpaidCommissionMinor < 0) return fail("invalid_amount", "approvedUnpaidCommissionMinor");
  if (input.currency !== policy.value.currency) return fail("currency_mismatch", "currency");
  const shortfallMinor = Math.max(0, policy.value.payoutThresholdMinor - approvedUnpaidCommissionMinor);
  return Object.freeze({ ok: true, value: freeze({ eligible: shortfallMinor === 0, shortfallMinor }) });
}
