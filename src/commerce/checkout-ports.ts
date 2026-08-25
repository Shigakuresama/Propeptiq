import { isSha256 } from "@/commerce/checkout-identity";

type ContractError = Readonly<{
  code: "invalid_contract";
  field: string;
}>;

type ContractResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; error: ContractError }>;

export type QuoteUnavailableReason =
  | "temporarily_unavailable"
  | "unsupported_destination"
  | "configuration_unavailable";

export type ShippingQuoteRequest = Readonly<{
  schemaVersion: 1;
  bindingHash: string;
  items: readonly Readonly<{
    productId: string;
    quantity: number;
    netAmountMinor: number;
  }>[];
  merchandiseTotalMinor: number;
  currency: "USD";
  destination: Readonly<{
    recipientName: string;
    line1: string;
    line2: string | null;
    city: string;
    stateCode: string;
    postalCode: string;
    countryCode: "US";
  }>;
}>;

export type TaxQuoteRequest = Readonly<{
  schemaVersion: 1;
  bindingHash: string;
  items: readonly Readonly<{
    productId: string;
    quantity: number;
    netAmountMinor: number;
  }>[];
  merchandiseTotalMinor: number;
  shippingMinor: number;
  shippingReference: string;
  shippingService: string;
  currency: "USD";
  destination: ShippingQuoteRequest["destination"];
}>;

export type ShippingQuote =
  | Readonly<{
      status: "ready";
      bindingHash: string;
      reference: string;
      service: string;
      amountMinor: number;
      currency: "USD";
    }>
  | Readonly<{ status: "unavailable"; reason: QuoteUnavailableReason }>;

export type TaxQuote =
  | Readonly<{
      status: "ready";
      bindingHash: string;
      reference: string;
      amountMinor: number;
      currency: "USD";
    }>
  | Readonly<{ status: "unavailable"; reason: QuoteUnavailableReason }>;

export type ShippingQuotePort = Readonly<{
  quoteShipping: (request: ShippingQuoteRequest) => Promise<unknown>;
}>;

export type TaxQuotePort = Readonly<{
  quoteTax: (request: TaxQuoteRequest) => Promise<unknown>;
}>;

export type ProviderPreparation = Readonly<{
  authority: "server_prepared_provider_request";
  provider: "stripe" | "local_test";
  providerIdempotencyKey: string;
  providerRequestHash: string;
  providerExpiresAt: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) return false;
  const actual = (ownKeys as string[]).toSorted();
  const wanted = [...expected].toSorted();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

function nonblank(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    value.length <= 200 &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function safeMoney(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function fail(field: string): ContractResult<never> {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code: "invalid_contract", field }),
  });
}

const unavailableReasons = new Set<QuoteUnavailableReason>([
  "temporarily_unavailable",
  "unsupported_destination",
  "configuration_unavailable",
]);

function parseUnavailable(
  value: Record<string, unknown>,
): ContractResult<Readonly<{ status: "unavailable"; reason: QuoteUnavailableReason }>> {
  if (
    !exactKeys(value, ["status", "reason"]) ||
    value.status !== "unavailable" ||
    !unavailableReasons.has(value.reason as QuoteUnavailableReason)
  ) {
    return fail("quote");
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      status: "unavailable" as const,
      reason: value.reason as QuoteUnavailableReason,
    }),
  });
}

export function parseShippingQuoteResult(
  value: unknown,
  expected: Readonly<{ bindingHash: string; currency: "USD" }>,
): ContractResult<ShippingQuote> {
  if (!isRecord(value)) return fail("shippingQuote");
  if (value.status === "unavailable") return parseUnavailable(value);
  if (
    !exactKeys(value, [
      "status",
      "bindingHash",
      "reference",
      "service",
      "amountMinor",
      "currency",
    ]) ||
    value.status !== "ready" ||
    value.bindingHash !== expected.bindingHash ||
    !isSha256(value.bindingHash) ||
    !nonblank(value.reference) ||
    !nonblank(value.service) ||
    !safeMoney(value.amountMinor) ||
    value.currency !== expected.currency
  ) {
    return fail("shippingQuote");
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      status: "ready" as const,
      bindingHash: value.bindingHash,
      reference: value.reference,
      service: value.service,
      amountMinor: value.amountMinor,
      currency: "USD" as const,
    }),
  });
}

export function parseTaxQuoteResult(
  value: unknown,
  expected: Readonly<{ bindingHash: string; currency: "USD" }>,
): ContractResult<TaxQuote> {
  if (!isRecord(value)) return fail("taxQuote");
  if (value.status === "unavailable") return parseUnavailable(value);
  if (
    !exactKeys(value, [
      "status",
      "bindingHash",
      "reference",
      "amountMinor",
      "currency",
    ]) ||
    value.status !== "ready" ||
    value.bindingHash !== expected.bindingHash ||
    !isSha256(value.bindingHash) ||
    !nonblank(value.reference) ||
    !safeMoney(value.amountMinor) ||
    value.currency !== expected.currency
  ) {
    return fail("taxQuote");
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      status: "ready" as const,
      bindingHash: value.bindingHash,
      reference: value.reference,
      amountMinor: value.amountMinor,
      currency: "USD" as const,
    }),
  });
}

export function parseProviderPreparation(
  value: unknown,
  expected: Readonly<{ attemptId: string; now: Date }>,
): ContractResult<ProviderPreparation> {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "authority",
      "provider",
      "providerIdempotencyKey",
      "providerRequestHash",
      "providerExpiresAt",
    ]) ||
    value.authority !== "server_prepared_provider_request" ||
    (value.provider !== "stripe" && value.provider !== "local_test") ||
    value.providerIdempotencyKey !==
      `checkout_attempt:${expected.attemptId}` ||
    !isSha256(value.providerRequestHash) ||
    typeof value.providerExpiresAt !== "string"
  ) {
    return fail("providerPreparation");
  }
  const expiresAt = new Date(value.providerExpiresAt);
  const nowMs = expected.now.getTime();
  const expiresMs = expiresAt.getTime();
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(expiresMs) ||
    expiresAt.toISOString() !== value.providerExpiresAt ||
    expiresMs - nowMs < 30 * 60 * 1000 ||
    expiresMs - nowMs > 24 * 60 * 60 * 1000
  ) {
    return fail("providerPreparation.providerExpiresAt");
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      authority: "server_prepared_provider_request" as const,
      provider: value.provider,
      providerIdempotencyKey: value.providerIdempotencyKey,
      providerRequestHash: value.providerRequestHash,
      providerExpiresAt: value.providerExpiresAt,
    }),
  });
}
