import type { Result } from "@/domain/result";
import type { SafeCartPreview } from "@/cart/preview-types";

export type CheckoutDestination = Readonly<{
  recipientName: string;
  line1: string;
  line2: string | null;
  city: string;
  stateCode: string;
  postalCode: string;
  countryCode: "US";
}>;

export type CheckoutLineRequest = Readonly<{
  variantId: string;
  quantity: number;
}>;

export type CheckoutQuoteRequest = Readonly<{
  items: readonly CheckoutLineRequest[];
  destination: CheckoutDestination;
  rewardRedemptionPoints?: number;
}>;

export type CheckoutRequest = CheckoutQuoteRequest &
  Readonly<{ pricingRevision: string }>;

export type CheckoutUnavailable = Readonly<{
  status: "CHECKOUT_UNAVAILABLE";
  reasons: readonly Readonly<{
    variantId: string;
    code:
      | "pricing_coming_soon"
      | "payment_mapping_missing"
      | "unavailable"
      | "invalid_currency";
  }>[];
}>;

export type PriceChanged = Readonly<{
  status: "PRICE_CHANGED";
  pricingRevision: string;
  cart: SafeCartPreview;
}>;

export type CheckoutRequestError = Readonly<{
  code:
    | "invalid_request"
    | "unexpected_field"
    | "invalid_items"
    | "invalid_variant_id"
    | "invalid_quantity"
    | "duplicate_variant"
    | "invalid_destination"
    | "invalid_pricing_revision"
    | "invalid_reward_redemption_points";
  field: string;
}>;

const US_STATE_CODES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(
    " ",
  ),
);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;

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

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

function firstUnexpectedField(
  value: Record<string, unknown>,
  allowed: readonly string[],
): string | null {
  const allowedSet = new Set(allowed);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowedSet.has(key)) {
      return typeof key === "string" ? key : "";
    }
  }
  for (const key in value) {
    if (!Object.hasOwn(value, key) && !allowedSet.has(key)) return key;
  }
  let prototype = Object.getPrototypeOf(value) as object | null;
  while (prototype !== null && prototype !== Object.prototype) {
    for (const key of Reflect.ownKeys(prototype)) {
      if (typeof key !== "string" || !allowedSet.has(key)) {
        return typeof key === "string" ? key : "";
      }
    }
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  return null;
}

function normalizedText(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): string | null {
  if (typeof value !== "string" || CONTROL_CHARACTER_PATTERN.test(value)) {
    return null;
  }
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length >= minimumLength &&
    normalized.length <= maximumLength
    ? normalized
    : null;
}

function parseRequest(
  input: unknown,
  requirePricingRevision: boolean,
): Result<CheckoutQuoteRequest | CheckoutRequest, CheckoutRequestError> {
  const fail = (code: CheckoutRequestError["code"], field: string) =>
    Object.freeze({
      ok: false as const,
      error: Object.freeze({ code, field }),
    });

  if (!isRecord(input)) return fail("invalid_request", "request");
  const allowed = [
    "items",
    "destination",
    ...(requirePricingRevision ? ["pricingRevision"] : []),
    "rewardRedemptionPoints",
  ];
  const unexpectedRequestField = firstUnexpectedField(input, allowed);
  if (unexpectedRequestField !== null) {
    return fail(
      "unexpected_field",
      unexpectedRequestField.length > 0
        ? `request.${unexpectedRequestField}`
        : "request",
    );
  }

  if (
    !Object.hasOwn(input, "items") ||
    !isDenseArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > 50
  ) {
    return fail("invalid_items", "items");
  }
  const items: Array<{ variantId: string; quantity: number }> = [];
  const variantIds = new Set<string>();
  for (let index = 0; index < input.items.length; index += 1) {
    const item = input.items[index];
    if (!isRecord(item)) {
      return fail("invalid_variant_id", `items[${index}].variantId`);
    }
    const unexpectedItemField = firstUnexpectedField(item, [
      "variantId",
      "quantity",
    ]);
    if (unexpectedItemField !== null) {
      return fail(
        "unexpected_field",
        unexpectedItemField.length > 0
          ? `items[${index}].${unexpectedItemField}`
          : `items[${index}]`,
      );
    }
    if (
      !Object.hasOwn(item, "variantId") ||
      typeof item.variantId !== "string" ||
      !UUID_PATTERN.test(item.variantId)
    ) {
      return fail("invalid_variant_id", `items[${index}].variantId`);
    }
    const variantId = item.variantId.toLowerCase();
    if (variantIds.has(variantId)) {
      return fail("duplicate_variant", `items[${index}].variantId`);
    }
    variantIds.add(variantId);
    if (
      !Object.hasOwn(item, "quantity") ||
      !Number.isSafeInteger(item.quantity) ||
      (item.quantity as number) < 1 ||
      (item.quantity as number) > 25
    ) {
      return fail("invalid_quantity", `items[${index}].quantity`);
    }
    items.push({ variantId, quantity: item.quantity as number });
  }

  if (!Object.hasOwn(input, "destination") || !isRecord(input.destination)) {
    return fail("invalid_destination", "destination");
  }
  const destination = input.destination;
  const destinationFields = [
    "recipientName",
    "line1",
    "line2",
    "city",
    "stateCode",
    "postalCode",
    "countryCode",
  ] as const;
  const unexpectedDestinationField = firstUnexpectedField(
    destination,
    destinationFields,
  );
  if (unexpectedDestinationField !== null) {
    return fail(
      "unexpected_field",
      unexpectedDestinationField.length > 0
        ? `destination.${unexpectedDestinationField}`
        : "destination",
    );
  }

  const recipientName =
    Object.hasOwn(destination, "recipientName") &&
    normalizedText(destination.recipientName, 1, 120);
  if (!recipientName) {
    return fail("invalid_destination", "destination.recipientName");
  }
  const line1 =
    Object.hasOwn(destination, "line1") &&
    normalizedText(destination.line1, 1, 120);
  if (!line1) return fail("invalid_destination", "destination.line1");
  if (!Object.hasOwn(destination, "line2")) {
    return fail("invalid_destination", "destination.line2");
  }
  const line2 =
    destination.line2 === null
      ? null
      : normalizedText(destination.line2, 1, 120);
  if (destination.line2 !== null && line2 === null) {
    return fail("invalid_destination", "destination.line2");
  }
  const city =
    Object.hasOwn(destination, "city") &&
    normalizedText(destination.city, 1, 100);
  if (!city) return fail("invalid_destination", "destination.city");
  if (
    !Object.hasOwn(destination, "stateCode") ||
    typeof destination.stateCode !== "string" ||
    CONTROL_CHARACTER_PATTERN.test(destination.stateCode)
  ) {
    return fail("invalid_destination", "destination.stateCode");
  }
  const stateCode = destination.stateCode.trim().toUpperCase();
  if (!US_STATE_CODES.has(stateCode)) {
    return fail("invalid_destination", "destination.stateCode");
  }
  if (
    !Object.hasOwn(destination, "postalCode") ||
    typeof destination.postalCode !== "string" ||
    CONTROL_CHARACTER_PATTERN.test(destination.postalCode)
  ) {
    return fail("invalid_destination", "destination.postalCode");
  }
  const postalCode = destination.postalCode.trim();
  if (!/^\d{5}(?:-\d{4})?$/.test(postalCode)) {
    return fail("invalid_destination", "destination.postalCode");
  }
  if (
    !Object.hasOwn(destination, "countryCode") ||
    destination.countryCode !== "US"
  ) {
    return fail("invalid_destination", "destination.countryCode");
  }

  if (
    requirePricingRevision &&
    (!Object.hasOwn(input, "pricingRevision") ||
      typeof input.pricingRevision !== "string" ||
      !SHA256_PATTERN.test(input.pricingRevision))
  ) {
    return fail("invalid_pricing_revision", "pricingRevision");
  }
  const hasRewardRedemptionPoints = Object.hasOwn(
    input,
    "rewardRedemptionPoints",
  );
  if (
    hasRewardRedemptionPoints &&
    (!Number.isSafeInteger(input.rewardRedemptionPoints) ||
      (input.rewardRedemptionPoints as number) <= 0)
  ) {
    return fail(
      "invalid_reward_redemption_points",
      "rewardRedemptionPoints",
    );
  }

  items.sort((left, right) => left.variantId.localeCompare(right.variantId));
  const value = deepFreeze({
    items,
    destination: {
      recipientName,
      line1,
      line2,
      city,
      stateCode,
      postalCode,
      countryCode: "US" as const,
    },
    ...(requirePricingRevision
      ? { pricingRevision: input.pricingRevision as string }
      : {}),
    ...(hasRewardRedemptionPoints
      ? { rewardRedemptionPoints: input.rewardRedemptionPoints as number }
      : {}),
  });
  return Object.freeze({ ok: true as const, value });
}

export function parseCheckoutQuoteRequest(
  input: unknown,
): Result<CheckoutQuoteRequest, CheckoutRequestError> {
  return parseRequest(input, false) as Result<
    CheckoutQuoteRequest,
    CheckoutRequestError
  >;
}

export function parseCheckoutRequest(
  input: unknown,
): Result<CheckoutRequest, CheckoutRequestError> {
  return parseRequest(input, true) as Result<
    CheckoutRequest,
    CheckoutRequestError
  >;
}
