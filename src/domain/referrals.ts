import type { Result } from "@/domain/result";

export type ReferralPolicy = Readonly<{
  id: string; version: number; status: "draft" | "active" | "retired"; attributionDays: 30;
  referredDiscountBasisPoints: number; referredDiscountCapMinor: number; referrerPointsPerDollar: number;
  referrerRewardCapPoints: number; effectiveAt: string; supersededAt: string | null;
}>;

type ReferralError = Readonly<{ code: "invalid_policy" | "unexpected_field" | "invalid_input" | "invalid_amount" | "currency_mismatch" | "referral_code_expired" | "referral_code_inactive" | "first_order_required" | "self_referral_denied" | "buyer_already_rewarded"; field: string }>;

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isDenseArray(value: unknown): value is readonly unknown[] { return Array.isArray(value) && Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).every(Boolean); }
function nonBlank(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function safeInteger(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value); }
function isIso(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(new Date(value).valueOf()) && new Date(value).toISOString() === value; }
function extras(value: Record<string, unknown>, allowed: readonly string[]): string | null { const set = new Set(allowed); for (const key of Reflect.ownKeys(value)) if (typeof key !== "string" || !set.has(key)) return typeof key === "string" ? key : ""; let prototype = Object.getPrototypeOf(value) as object | null; while (prototype !== null && prototype !== Object.prototype) { for (const key of Reflect.ownKeys(prototype)) if (typeof key !== "string" || !set.has(key)) return typeof key === "string" ? key : ""; prototype = Object.getPrototypeOf(prototype) as object | null; } return null; }
function freeze<Value>(value: Value): Value { if (value !== null && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const nested of Object.values(value as Record<string, unknown>)) freeze(nested); } return value; }
function fail(code: ReferralError["code"], field: string): Result<never, ReferralError> { return Object.freeze({ ok: false, error: Object.freeze({ code, field }) }); }

export function parseReferralPolicy(input: unknown): Result<ReferralPolicy, ReferralError> {
  if (!isRecord(input)) return fail("invalid_policy", "policy");
  const extra = extras(input, ["id", "version", "status", "attributionDays", "referredDiscountBasisPoints", "referredDiscountCapMinor", "referrerPointsPerDollar", "referrerRewardCapPoints", "effectiveAt", "supersededAt"]);
  if (extra !== null) return fail("unexpected_field", extra);
  if (!nonBlank(input.id)) return fail("invalid_policy", "id");
  const version = input.version;
  if (!safeInteger(version) || version <= 0) return fail("invalid_policy", "version");
  if (input.status !== "draft" && input.status !== "active" && input.status !== "retired") return fail("invalid_policy", "status");
  for (const [field, expected] of [["attributionDays", 30], ["referredDiscountBasisPoints", 1_000], ["referredDiscountCapMinor", 2_500], ["referrerPointsPerDollar", 5], ["referrerRewardCapPoints", 2_500]] as const) {
    if (!safeInteger(input[field]) || input[field] !== expected) return fail("invalid_policy", field);
  }
  if (!isIso(input.effectiveAt) || (input.supersededAt !== null && !isIso(input.supersededAt))) return fail("invalid_policy", !isIso(input.effectiveAt) ? "effectiveAt" : "supersededAt");
  return Object.freeze({ ok: true, value: freeze({ ...input } as ReferralPolicy) });
}

export function selectLastEligibleReferralClick(input: unknown): Result<Readonly<{ code: string; referrerActorId: string }>, ReferralError> {
  if (!isRecord(input)) return fail("invalid_input", "input");
  const extra = extras(input, ["policy", "orderAt", "clicks"]); if (extra !== null) return fail("unexpected_field", extra);
  const policy = parseReferralPolicy(input.policy); if (!policy.ok) return fail("invalid_input", "policy");
  if (!isIso(input.orderAt)) return fail("invalid_input", "orderAt");
  if (!isDenseArray(input.clicks)) return fail("invalid_input", "clicks");
  const orderAt = new Date(input.orderAt).valueOf();
  const clicks: Array<{ code: string; referrerActorId: string; status: "active" | "revoked"; clickedAt: number }> = [];
  for (let index = 0; index < input.clicks.length; index += 1) {
    const click = input.clicks[index]; if (!isRecord(click) || extras(click, ["code", "referrerActorId", "status", "clickedAt"]) !== null || !nonBlank(click.code) || !nonBlank(click.referrerActorId) || (click.status !== "active" && click.status !== "revoked") || !isIso(click.clickedAt)) return fail("invalid_input", `clicks[${index}]`);
    clicks.push({ code: click.code, referrerActorId: click.referrerActorId, status: click.status, clickedAt: new Date(click.clickedAt).valueOf() });
  }
  const active = clicks.filter((click) => click.status === "active");
  const eligible = active.filter((click) => click.clickedAt <= orderAt && orderAt - click.clickedAt <= policy.value.attributionDays * 86_400_000);
  if (eligible.length === 0) return fail(active.length === 0 ? "referral_code_inactive" : "referral_code_expired", "clicks");
  eligible.sort((left, right) => right.clickedAt - left.clickedAt || left.code.localeCompare(right.code));
  return Object.freeze({ ok: true, value: freeze({ code: eligible[0]!.code, referrerActorId: eligible[0]!.referrerActorId }) });
}

export function calculateReferralBenefit(input: unknown): Result<Readonly<{ discountMinor: number; referrerRewardPoints: number }>, ReferralError> {
  if (!isRecord(input)) return fail("invalid_input", "input");
  const extra = extras(input, ["policy", "referral", "buyerActorId", "isFirstEligibleOrder", "buyerPreviouslyRewarded", "preReferralMerchandiseMinor", "postDiscountMerchandiseMinor", "currency"]); if (extra !== null) return fail("unexpected_field", extra);
  const policy = parseReferralPolicy(input.policy); if (!policy.ok) return fail("invalid_input", "policy");
  if (!isRecord(input.referral) || extras(input.referral, ["code", "referrerActorId", "status"]) !== null || !nonBlank(input.referral.code) || !nonBlank(input.referral.referrerActorId) || (input.referral.status !== "active" && input.referral.status !== "revoked")) return fail("invalid_input", "referral");
  if (input.referral.status !== "active") return fail("referral_code_inactive", "referral");
  if (!nonBlank(input.buyerActorId) || typeof input.isFirstEligibleOrder !== "boolean" || typeof input.buyerPreviouslyRewarded !== "boolean") return fail("invalid_input", "referral");
  if (input.currency !== "USD") return fail("currency_mismatch", "currency");
  const preReferralMerchandiseMinor = input.preReferralMerchandiseMinor;
  const postDiscountMerchandiseMinor = input.postDiscountMerchandiseMinor;
  if (!safeInteger(preReferralMerchandiseMinor) || preReferralMerchandiseMinor < 0) return fail("invalid_amount", "preReferralMerchandiseMinor");
  if (!safeInteger(postDiscountMerchandiseMinor) || postDiscountMerchandiseMinor < 0) return fail("invalid_amount", "postDiscountMerchandiseMinor");
  if (!input.isFirstEligibleOrder) return fail("first_order_required", "referral");
  if (input.buyerActorId === input.referral.referrerActorId) return fail("self_referral_denied", "referral");
  if (input.buyerPreviouslyRewarded) return fail("buyer_already_rewarded", "referral");
  const discount = (BigInt(preReferralMerchandiseMinor) * BigInt(policy.value.referredDiscountBasisPoints)) / 10_000n;
  const reward = (BigInt(postDiscountMerchandiseMinor) * BigInt(policy.value.referrerPointsPerDollar)) / 100n;
  return Object.freeze({ ok: true, value: freeze({ discountMinor: Number(discount > BigInt(policy.value.referredDiscountCapMinor) ? BigInt(policy.value.referredDiscountCapMinor) : discount), referrerRewardPoints: Number(reward > BigInt(policy.value.referrerRewardCapPoints) ? BigInt(policy.value.referrerRewardCapPoints) : reward) }) });
}
