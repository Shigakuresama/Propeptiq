import type { Result } from "@/domain/result";

export type PromotionKind =
  | "discount"
  | "bundle"
  | "subscription"
  | "loyalty"
  | "cross_sell";
export type PromotionStatus = "draft" | "active" | "retired";

export type PromotionRecord = Readonly<{
  authority: "server_resolved_promotion";
  id: string;
  version: number;
  code: string;
  name: string;
  kind: PromotionKind;
  status: PromotionStatus;
  currentlyEffective: boolean;
  amountMinor: number | null;
  currency: string | null;
  basisPoints: number | null;
  targetProductIds: readonly string[];
  targetPolicyGroupIds: readonly string[];
}>;

export type PromotionCalculationLine = Readonly<{
  authority: "server_resolved_price";
  productId: string;
  policyGroupId: string;
  grossSubtotalMinor: number;
}>;

export type PromotionCalculationInput = Readonly<{
  currency: string;
  lines: readonly PromotionCalculationLine[];
  promotions: readonly PromotionRecord[];
}>;

export type PromotionAllocation = Readonly<{
  productId: string;
  discountMinor: number;
}>;

export type PromotionCalculation = Readonly<{
  discountMinor: number;
  allocations: readonly PromotionAllocation[];
}>;

export type PromotionError = Readonly<{
  code:
    | "invalid_input"
    | "invalid_currency"
    | "invalid_line"
    | "multiple_promotions"
    | "promotion_not_active"
    | "promotion_not_current"
    | "unsupported_kind"
    | "promotion_not_applicable"
    | "currency_mismatch"
    | "invalid_discount"
    | "arithmetic_overflow";
  field: string;
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

function isDenseUniqueNonBlankStrings(value: unknown): value is readonly string[] {
  if (!isDenseArray(value)) return false;
  const seen = new Set<string>();
  for (const candidate of value) {
    if (!isNonBlankString(candidate) || seen.has(candidate)) return false;
    seen.add(candidate);
  }
  return true;
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

export function calculatePromotionDiscount(
  input: PromotionCalculationInput,
): Result<PromotionCalculation, PromotionError> {
  const fail = (code: PromotionError["code"], field: string) =>
    Object.freeze({
      ok: false as const,
      error: Object.freeze({ code, field }),
    });

  if (!isRecord(input)) return fail("invalid_input", "input");
  if (typeof input.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency)) {
    return fail("invalid_currency", "currency");
  }
  if (
    !isDenseArray(input.lines) ||
    input.lines.length === 0 ||
    !isDenseArray(input.promotions)
  ) {
    return fail(
      !isDenseArray(input.lines) || input.lines.length === 0
        ? "invalid_input"
        : "invalid_input",
      !isDenseArray(input.lines) || input.lines.length === 0
        ? "lines"
        : "promotions",
    );
  }

  const seenProductIds = new Set<string>();
  const lines: PromotionCalculationLine[] = [];
  for (let index = 0; index < input.lines.length; index += 1) {
    const line = input.lines[index];
    if (!isRecord(line)) return fail("invalid_line", `lines[${index}]`);
    if (line.authority !== "server_resolved_price") {
      return fail("invalid_input", `lines[${index}].authority`);
    }
    if (!isNonBlankString(line.productId) || seenProductIds.has(line.productId)) {
      return fail("invalid_line", `lines[${index}].productId`);
    }
    seenProductIds.add(line.productId);
    if (!isNonBlankString(line.policyGroupId)) {
      return fail("invalid_line", `lines[${index}].policyGroupId`);
    }
    if (
      !Number.isSafeInteger(line.grossSubtotalMinor) ||
      (line.grossSubtotalMinor as number) < 0
    ) {
      return fail("invalid_line", `lines[${index}].grossSubtotalMinor`);
    }
    lines.push({
      authority: "server_resolved_price",
      productId: line.productId,
      policyGroupId: line.policyGroupId,
      grossSubtotalMinor: line.grossSubtotalMinor as number,
    });
  }
  lines.sort((left, right) =>
    left.productId < right.productId
      ? -1
      : left.productId > right.productId
        ? 1
        : 0,
  );

  if (input.promotions.length > 1) {
    return fail("multiple_promotions", "promotions");
  }
  if (input.promotions.length === 0) {
    return Object.freeze({
      ok: true,
      value: deepFreeze({
        discountMinor: 0,
        allocations: lines.map((line) => ({
          productId: line.productId,
          discountMinor: 0,
        })),
      }),
    });
  }

  const promotion = input.promotions[0];
  if (!isRecord(promotion)) return fail("invalid_input", "promotions[0]");
  if (promotion.authority !== "server_resolved_promotion") {
    return fail("invalid_input", "promotions[0].authority");
  }
  for (const field of ["id", "code", "name"] as const) {
    if (!isNonBlankString(promotion[field])) {
      return fail("invalid_input", `promotions[0].${field}`);
    }
  }
  if (
    !Number.isSafeInteger(promotion.version) ||
    (promotion.version as number) <= 0
  ) {
    return fail("invalid_input", "promotions[0].version");
  }
  if (!["draft", "active", "retired"].includes(promotion.status as string)) {
    return fail("invalid_input", "promotions[0].status");
  }
  if (promotion.status !== "active") {
    return fail("promotion_not_active", "promotions[0].status");
  }
  if (typeof promotion.currentlyEffective !== "boolean") {
    return fail("invalid_input", "promotions[0].currentlyEffective");
  }
  if (!promotion.currentlyEffective) {
    return fail("promotion_not_current", "promotions[0].currentlyEffective");
  }
  if (
    !["discount", "bundle", "subscription", "loyalty", "cross_sell"].includes(
      promotion.kind as string,
    )
  ) {
    return fail("invalid_input", "promotions[0].kind");
  }
  if (promotion.kind !== "discount") {
    return fail("unsupported_kind", "promotions[0].kind");
  }
  if (!isDenseUniqueNonBlankStrings(promotion.targetProductIds)) {
    return fail("invalid_input", "promotions[0].targetProductIds");
  }
  if (!isDenseUniqueNonBlankStrings(promotion.targetPolicyGroupIds)) {
    return fail("invalid_input", "promotions[0].targetPolicyGroupIds");
  }

  const fixedShape =
    promotion.amountMinor !== null &&
    promotion.currency !== null &&
    promotion.basisPoints === null;
  const basisPointsShape =
    promotion.amountMinor === null &&
    promotion.currency === null &&
    promotion.basisPoints !== null;
  if (fixedShape === basisPointsShape) {
    return fail("invalid_discount", "promotions[0]");
  }

  if (fixedShape) {
    if (
      !Number.isSafeInteger(promotion.amountMinor) ||
      (promotion.amountMinor as number) <= 0
    ) {
      return fail("invalid_discount", "promotions[0].amountMinor");
    }
    if (
      typeof promotion.currency !== "string" ||
      !/^[A-Z]{3}$/.test(promotion.currency)
    ) {
      return fail("invalid_discount", "promotions[0].currency");
    }
    if (promotion.currency !== input.currency) {
      return fail("currency_mismatch", "promotions[0].currency");
    }
  } else if (
    !Number.isSafeInteger(promotion.basisPoints) ||
    (promotion.basisPoints as number) < 1 ||
    (promotion.basisPoints as number) > 10_000
  ) {
    return fail("invalid_discount", "promotions[0].basisPoints");
  }

  const productTargets = new Set(promotion.targetProductIds);
  const groupTargets = new Set(promotion.targetPolicyGroupIds);
  const eligibleLines = lines.filter(
    (line) =>
      productTargets.has(line.productId) ||
      groupTargets.has(line.policyGroupId),
  );
  if (eligibleLines.length === 0) {
    return fail("promotion_not_applicable", "promotions[0].targets");
  }

  let eligibleSubtotalMinor = 0;
  for (const line of eligibleLines) {
    const next = eligibleSubtotalMinor + line.grossSubtotalMinor;
    if (!Number.isSafeInteger(next)) {
      return fail("arithmetic_overflow", "eligibleSubtotalMinor");
    }
    eligibleSubtotalMinor = next;
  }

  let discountMinor: number;
  if (fixedShape) {
    discountMinor = Math.min(
      promotion.amountMinor as number,
      eligibleSubtotalMinor,
    );
  } else {
    const calculated =
      (BigInt(eligibleSubtotalMinor) *
        BigInt(promotion.basisPoints as number)) /
      10_000n;
    if (calculated > BigInt(Number.MAX_SAFE_INTEGER)) {
      return fail("arithmetic_overflow", "discountMinor");
    }
    discountMinor = Number(calculated);
  }

  const allocationByProductId = new Map<string, number>();
  if (discountMinor === 0 || eligibleSubtotalMinor === 0) {
    for (const line of eligibleLines) allocationByProductId.set(line.productId, 0);
  } else {
    const denominator = BigInt(eligibleSubtotalMinor);
    const shares = eligibleLines.map((line) => {
      const numerator =
        BigInt(discountMinor) * BigInt(line.grossSubtotalMinor);
      return {
        productId: line.productId,
        base: Number(numerator / denominator),
        remainder: numerator % denominator,
      };
    });
    let allocated = shares.reduce((sum, share) => sum + share.base, 0);
    shares.sort((left, right) => {
      if (left.remainder > right.remainder) return -1;
      if (left.remainder < right.remainder) return 1;
      return left.productId < right.productId
        ? -1
        : left.productId > right.productId
          ? 1
          : 0;
    });
    for (const share of shares) {
      if (allocated >= discountMinor) break;
      share.base += 1;
      allocated += 1;
    }
    for (const share of shares) {
      allocationByProductId.set(share.productId, share.base);
    }
  }

  return Object.freeze({
    ok: true,
    value: deepFreeze({
      discountMinor,
      allocations: lines.map((line) => ({
        productId: line.productId,
        discountMinor: allocationByProductId.get(line.productId) ?? 0,
      })),
    }),
  });
}
