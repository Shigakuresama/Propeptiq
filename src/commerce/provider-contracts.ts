import {
  hashCanonicalEnvelope,
  isCanonicalUuid,
  type Sha256Hasher,
} from "@/commerce/checkout-identity";

type ContractFailure = Readonly<{
  ok: false;
  error: Readonly<{ code: "invalid_contract"; field: string }>;
}>;

type ContractResult<Value> =
  | Readonly<{ ok: true; value: Value }>
  | ContractFailure;

export type ProviderKind = "stripe" | "local_test";

export type CheckoutProviderFactsV1 = Readonly<{
  provider: ProviderKind;
  providerRequestSchemaVersion: 1;
  orderId: string;
  attemptId: string;
  providerCustomerEmail: string;
  providerOrigin: string;
  providerExpiresAt: string;
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
  lines: readonly Readonly<{
    productId: string;
    productName: string;
    packageForm: string;
    purchasedQuantity: number;
    postDiscountTotalMinor: number;
  }>[];
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
}>;

export type StripeVariantLine = Readonly<{
  variantId: string;
  productId: string;
  sku: string;
  productName: string;
  variantLabel: string;
  requestedQuantity: number;
  netLineMinor: number;
  baseUnitMinor: number;
  currency: "USD";
  priceBookId: string;
  priceVersion: number;
  stripeProductId: string;
  stripePriceId: string;
}>;

export type CheckoutProviderFactsV2 = Readonly<{
  provider: ProviderKind;
  providerRequestSchemaVersion: 2;
  orderId: string;
  attemptId: string;
  providerCustomerEmail: string;
  providerOrigin: string;
  providerExpiresAt: string;
  currency: "USD";
  destination: CheckoutProviderFactsV1["destination"];
  lines: readonly StripeVariantLine[];
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
}>;

export type StripeProviderBindingSnapshotV2 = Readonly<{
  schemaVersion: 2;
  lines: readonly StripeVariantLine[];
}>;

type StripeLineItemV1 = Readonly<{
  quantity: 1;
  price_data: Readonly<{
    currency: "usd";
    unit_amount: number;
    product_data: Readonly<{ name: string }>;
  }>;
}>;

type StripeMerchandiseLineV2 = Readonly<{
  quantity: 1;
  price_data: Readonly<{
    currency: "usd";
    unit_amount: number;
    product: string;
  }>;
}>;

type StripeComponentLineV2 = StripeLineItemV1;

export type StripeCheckoutRequestV1 = Readonly<{
  ui_mode: "hosted_page";
  mode: "payment";
  payment_method_types: readonly ["card"];
  success_url: string;
  cancel_url: string;
  client_reference_id: string;
  customer_email: string;
  expires_at: number;
  metadata: Readonly<{ orderId: string; attemptId: string }>;
  payment_intent_data: Readonly<{
    metadata: Readonly<{ orderId: string; attemptId: string }>;
    shipping: Readonly<{
      name: string;
      address: Readonly<{
        line1: string;
        line2?: string;
        city: string;
        state: string;
        postal_code: string;
        country: "US";
      }>;
    }>;
  }>;
  line_items: readonly StripeLineItemV1[];
}>;

export type StripeCheckoutRequestV2 = Readonly<
  Omit<StripeCheckoutRequestV1, "line_items"> & {
    allow_promotion_codes: false;
    line_items: readonly (StripeMerchandiseLineV2 | StripeComponentLineV2)[];
  }
>;

export type StripeCheckoutRequest = StripeCheckoutRequestV1 | StripeCheckoutRequestV2;

export type ProviderRefundRequestV1 = Readonly<{
  schemaVersion: 1;
  provider: ProviderKind;
  refundId: string;
  orderId: string;
  amountMinor: number;
  currency: "usd";
  paymentIntentId: string | null;
  chargeId: string | null;
  metadata: Readonly<{ orderId: string; refundId: string }>;
  providerIdempotencyKey: string;
}>;

const checkoutFactKeys = [
  "provider",
  "providerRequestSchemaVersion",
  "orderId",
  "attemptId",
  "providerCustomerEmail",
  "providerOrigin",
  "providerExpiresAt",
  "currency",
  "destination",
  "lines",
  "shippingMinor",
  "taxMinor",
  "totalMinor",
] as const;

const destinationKeys = [
  "recipientName",
  "line1",
  "line2",
  "city",
  "stateCode",
  "postalCode",
  "countryCode",
] as const;

const lineKeys = [
  "productId",
  "productName",
  "packageForm",
  "purchasedQuantity",
  "postDiscountTotalMinor",
] as const;

const canonicalLineKeys = [
  "variantId",
  "productId",
  "sku",
  "productName",
  "variantLabel",
  "requestedQuantity",
  "netLineMinor",
  "baseUnitMinor",
  "currency",
  "priceBookId",
  "priceVersion",
  "stripeProductId",
  "stripePriceId",
] as const;

const refundFactKeys = [
  "schemaVersion",
  "provider",
  "refundId",
  "orderId",
  "requestedAmountMinor",
  "currency",
  "paymentIntentId",
  "chargeId",
  "providerIdempotencyKey",
] as const;

const stateCodes = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI",
  "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI",
  "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC",
  "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT",
  "VT", "VA", "WA", "WV", "WI", "WY", "DC",
]);

function failure(field: string): ContractFailure {
  return Object.freeze({
    ok: false as const,
    error: Object.freeze({ code: "invalid_contract" as const, field }),
  });
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) return false;
  const actual = (ownKeys as string[]).toSorted();
  const expected = [...keys].toSorted();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function denseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function safeNonnegative(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function safePositive(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function canonicalText(value: unknown, minimum: number, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function canonicalEmail(value: unknown): value is string {
  return (
    canonicalText(value, 3, 254) &&
    value === value.toLowerCase() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)
  );
}

function loopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "[::1]"
  );
}

function unsafeStripeOriginHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.+$/u, "");
  return (
    loopbackHost(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.includes(":") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(normalized)
  );
}

function canonicalOrigin(value: unknown, provider: ProviderKind): value is string {
  if (typeof value !== "string" || !URL.canParse(value)) return false;
  const url = new URL(value);
  if (
    url.origin !== value ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return false;
  }
  if (provider === "local_test") {
    return url.protocol === "http:" && loopbackHost(url.hostname);
  }
  return url.protocol === "https:" && !unsafeStripeOriginHost(url.hostname);
}

function canonicalWholeSecond(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const instant = new Date(value);
  return (
    Number.isFinite(instant.getTime()) &&
    instant.getTime() % 1000 === 0 &&
    instant.toISOString() === value
  );
}

function validDestination(value: unknown): value is CheckoutProviderFactsV1["destination"] {
  if (!exactRecord(value, destinationKeys)) return false;
  return (
    canonicalText(value.recipientName, 1, 120) &&
    canonicalText(value.line1, 1, 120) &&
    (value.line2 === null || canonicalText(value.line2, 1, 120)) &&
    canonicalText(value.city, 1, 100) &&
    typeof value.stateCode === "string" &&
    stateCodes.has(value.stateCode) &&
    typeof value.postalCode === "string" &&
    /^\d{5}(?:-\d{4})?$/u.test(value.postalCode) &&
    value.countryCode === "US"
  );
}

function boundedLabel(name: string, packageForm: string, quantity: number): string {
  const suffix = ` · Qty ${quantity}`;
  const separator = " · ";
  const contentBudget = 120 - suffix.length - separator.length;
  const nameBudget = Math.min(name.length, Math.max(1, Math.ceil(contentBudget * 0.6)));
  const formBudget = Math.min(packageForm.length, Math.max(1, contentBudget - nameBudget));
  const clippedName = name.slice(0, nameBudget);
  const remaining = contentBudget - clippedName.length;
  const clippedForm = packageForm.slice(0, Math.min(formBudget, Math.max(1, remaining)));
  return `${clippedName}${separator}${clippedForm}${suffix}`;
}

function stripeLine(name: string, amountMinor: number): StripeLineItemV1 {
  return Object.freeze({
    quantity: 1 as const,
    price_data: Object.freeze({
      currency: "usd" as const,
      unit_amount: amountMinor,
      product_data: Object.freeze({ name }),
    }),
  });
}

function canonicalStripeReference(
  value: unknown,
  prefix: "prod_" | "price_",
): value is string {
  return (
    canonicalText(value, prefix.length + 1, 200) &&
    value.startsWith(prefix) &&
    /^[A-Za-z0-9_]+$/u.test(value)
  );
}

function canonicalizeVariantLines(
  value: unknown,
): ContractResult<readonly StripeVariantLine[]> {
  if (!denseArray(value) || value.length < 1 || value.length > 50) {
    return failure("checkoutFacts.lines");
  }
  const seen = new Set<string>();
  const lines: StripeVariantLine[] = [];
  for (const candidate of value) {
    if (
      !exactRecord(candidate, canonicalLineKeys) ||
      !isCanonicalUuid(candidate.variantId) ||
      seen.has(candidate.variantId) ||
      !isCanonicalUuid(candidate.productId) ||
      !canonicalText(candidate.sku, 1, 120) ||
      !canonicalText(candidate.productName, 1, 200) ||
      !canonicalText(candidate.variantLabel, 1, 200) ||
      !Number.isSafeInteger(candidate.requestedQuantity) ||
      (candidate.requestedQuantity as number) < 1 ||
      (candidate.requestedQuantity as number) > 25 ||
      !safeNonnegative(candidate.netLineMinor) ||
      !safePositive(candidate.baseUnitMinor) ||
      candidate.currency !== "USD" ||
      !isCanonicalUuid(candidate.priceBookId) ||
      !Number.isSafeInteger(candidate.priceVersion) ||
      (candidate.priceVersion as number) < 1 ||
      !canonicalStripeReference(candidate.stripeProductId, "prod_") ||
      !canonicalStripeReference(candidate.stripePriceId, "price_")
    ) {
      return failure("checkoutFacts.lines");
    }
    seen.add(candidate.variantId);
    lines.push(Object.freeze({
      variantId: candidate.variantId,
      productId: candidate.productId,
      sku: candidate.sku,
      productName: candidate.productName,
      variantLabel: candidate.variantLabel,
      requestedQuantity: candidate.requestedQuantity as number,
      netLineMinor: candidate.netLineMinor,
      baseUnitMinor: candidate.baseUnitMinor,
      currency: "USD",
      priceBookId: candidate.priceBookId,
      priceVersion: candidate.priceVersion as number,
      stripeProductId: candidate.stripeProductId,
      stripePriceId: candidate.stripePriceId,
    }));
  }
  return Object.freeze({
    ok: true as const,
    value: Object.freeze(lines.toSorted((left, right) =>
      left.variantId.localeCompare(right.variantId))),
  });
}

export function createStripeProviderBindingSnapshotV2(
  value: unknown,
): ContractResult<StripeProviderBindingSnapshotV2> {
  const lines = canonicalizeVariantLines(value);
  return lines.ok
    ? Object.freeze({
        ok: true as const,
        value: Object.freeze({ schemaVersion: 2 as const, lines: lines.value }),
      })
    : lines;
}

function commonStripeCheckoutRequest(
  value: CheckoutProviderFactsV1 | CheckoutProviderFactsV2,
  lineItems: readonly (StripeLineItemV1 | StripeMerchandiseLineV2)[],
) {
  const metadata = Object.freeze({
    orderId: value.orderId,
    attemptId: value.attemptId,
  });
  const address = Object.freeze({
    line1: value.destination.line1,
    ...(value.destination.line2 === null
      ? {}
      : { line2: value.destination.line2 }),
    city: value.destination.city,
    state: value.destination.stateCode,
    postal_code: value.destination.postalCode,
    country: "US" as const,
  });
  const expiresAt = new Date(value.providerExpiresAt).getTime() / 1000;
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) return null;
  return Object.freeze({
    ui_mode: "hosted_page" as const,
    mode: "payment" as const,
    payment_method_types: Object.freeze(["card"] as const),
    success_url: `${value.providerOrigin}/checkout/success/${value.orderId}`,
    cancel_url: `${value.providerOrigin}/checkout`,
    client_reference_id: value.orderId,
    customer_email: value.providerCustomerEmail,
    expires_at: expiresAt,
    metadata,
    payment_intent_data: Object.freeze({
      metadata,
      shipping: Object.freeze({
        name: value.destination.recipientName,
        address,
      }),
    }),
    line_items: Object.freeze([...lineItems]),
  });
}

export function buildStripeCheckoutRequestV2(
  value: unknown,
): ContractResult<StripeCheckoutRequestV2> {
  if (!exactRecord(value, checkoutFactKeys)) return failure("checkoutFacts");
  if (
    (value.provider !== "stripe" && value.provider !== "local_test") ||
    value.providerRequestSchemaVersion !== 2 ||
    !isCanonicalUuid(value.orderId) ||
    !isCanonicalUuid(value.attemptId) ||
    !canonicalEmail(value.providerCustomerEmail) ||
    !canonicalOrigin(value.providerOrigin, value.provider) ||
    !canonicalWholeSecond(value.providerExpiresAt) ||
    value.currency !== "USD" ||
    !validDestination(value.destination) ||
    !safeNonnegative(value.shippingMinor) ||
    !safeNonnegative(value.taxMinor) ||
    !safePositive(value.totalMinor)
  ) {
    return failure("checkoutFacts");
  }
  const canonicalLines = canonicalizeVariantLines(value.lines);
  if (!canonicalLines.ok) return canonicalLines;
  let sum = 0;
  const lineItems: Array<StripeMerchandiseLineV2 | StripeComponentLineV2> = [];
  for (const line of canonicalLines.value) {
    sum += line.netLineMinor;
    if (!Number.isSafeInteger(sum)) return failure("checkoutFacts.totalMinor");
    lineItems.push(Object.freeze({
      quantity: 1 as const,
      price_data: Object.freeze({
        currency: "usd" as const,
        unit_amount: line.netLineMinor,
        product: line.stripeProductId,
      }),
    }));
  }
  sum += value.shippingMinor + value.taxMinor;
  if (!Number.isSafeInteger(sum) || sum !== value.totalMinor) {
    return failure("checkoutFacts.totalMinor");
  }
  if (value.shippingMinor > 0) lineItems.push(stripeLine("Shipping", value.shippingMinor));
  if (value.taxMinor > 0) lineItems.push(stripeLine("Sales tax", value.taxMinor));
  const common = commonStripeCheckoutRequest(
    value as CheckoutProviderFactsV2,
    lineItems,
  );
  if (common === null) return failure("checkoutFacts.providerExpiresAt");
  return Object.freeze({
    ok: true as const,
    value: Object.freeze({
      ...common,
      allow_promotion_codes: false as const,
      line_items: Object.freeze(lineItems),
    }),
  });
}

export function buildStripeCheckoutRequestV1(
  value: unknown,
): ContractResult<StripeCheckoutRequestV1> {
  if (!exactRecord(value, checkoutFactKeys)) return failure("checkoutFacts");
  if (
    (value.provider !== "stripe" && value.provider !== "local_test") ||
    value.providerRequestSchemaVersion !== 1 ||
    !isCanonicalUuid(value.orderId) ||
    !isCanonicalUuid(value.attemptId) ||
    !canonicalEmail(value.providerCustomerEmail) ||
    !canonicalOrigin(value.providerOrigin, value.provider) ||
    !canonicalWholeSecond(value.providerExpiresAt) ||
    value.currency !== "USD" ||
    !validDestination(value.destination) ||
    !denseArray(value.lines) ||
    value.lines.length < 1 ||
    value.lines.length > 50 ||
    !safeNonnegative(value.shippingMinor) ||
    !safeNonnegative(value.taxMinor) ||
    !safePositive(value.totalMinor)
  ) {
    return failure("checkoutFacts");
  }

  const seen = new Set<string>();
  const lines: Array<CheckoutProviderFactsV1["lines"][number]> = [];
  let sum = 0;
  for (const candidate of value.lines) {
    if (
      !exactRecord(candidate, lineKeys) ||
      !isCanonicalUuid(candidate.productId) ||
      seen.has(candidate.productId) ||
      !canonicalText(candidate.productName, 1, 200) ||
      !canonicalText(candidate.packageForm, 1, 200) ||
      !Number.isInteger(candidate.purchasedQuantity) ||
      (candidate.purchasedQuantity as number) < 1 ||
      (candidate.purchasedQuantity as number) > 25 ||
      !safeNonnegative(candidate.postDiscountTotalMinor)
    ) {
      return failure("checkoutFacts.lines");
    }
    seen.add(candidate.productId);
    sum += candidate.postDiscountTotalMinor;
    if (!Number.isSafeInteger(sum)) return failure("checkoutFacts.totalMinor");
    lines.push(candidate as CheckoutProviderFactsV1["lines"][number]);
  }
  sum += value.shippingMinor + value.taxMinor;
  if (!Number.isSafeInteger(sum) || sum !== value.totalMinor) {
    return failure("checkoutFacts.totalMinor");
  }

  const metadata = Object.freeze({
    orderId: value.orderId,
    attemptId: value.attemptId,
  });
  const address = Object.freeze({
    line1: value.destination.line1,
    ...(value.destination.line2 === null
      ? {}
      : { line2: value.destination.line2 }),
    city: value.destination.city,
    state: value.destination.stateCode,
    postal_code: value.destination.postalCode,
    country: "US" as const,
  });
  const lineItems = lines
    .toSorted((left, right) =>
      left.productId < right.productId ? -1 : left.productId > right.productId ? 1 : 0,
    )
    .map((line) =>
      stripeLine(
        boundedLabel(line.productName, line.packageForm, line.purchasedQuantity),
        line.postDiscountTotalMinor,
      ),
    );
  if (value.shippingMinor > 0) {
    lineItems.push(stripeLine("Shipping", value.shippingMinor));
  }
  if (value.taxMinor > 0) {
    lineItems.push(stripeLine("Sales tax", value.taxMinor));
  }
  if (lineItems.length > 52) return failure("checkoutFacts.lines");

  const expiresAt = new Date(value.providerExpiresAt).getTime() / 1000;
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
    return failure("checkoutFacts.providerExpiresAt");
  }
  const request = Object.freeze({
    ui_mode: "hosted_page" as const,
    mode: "payment" as const,
    payment_method_types: Object.freeze(["card"] as const),
    success_url: `${value.providerOrigin}/checkout/success/${value.orderId}`,
    cancel_url: `${value.providerOrigin}/checkout`,
    client_reference_id: value.orderId,
    customer_email: value.providerCustomerEmail,
    expires_at: expiresAt,
    metadata,
    payment_intent_data: Object.freeze({
      metadata,
      shipping: Object.freeze({
        name: value.destination.recipientName,
        address,
      }),
    }),
    line_items: Object.freeze(lineItems),
  });
  return Object.freeze({ ok: true as const, value: request });
}

export function hashProviderCheckoutRequest(
  value: Readonly<{
    provider: ProviderKind;
    providerRequestSchemaVersion: number;
    request: StripeCheckoutRequest;
    providerBindingSnapshot?: StripeProviderBindingSnapshotV2 | null;
  }>,
  sha256: Sha256Hasher,
): Promise<string> {
  if (
    (value.provider !== "stripe" && value.provider !== "local_test") ||
    !Number.isSafeInteger(value.providerRequestSchemaVersion) ||
    (value.providerRequestSchemaVersion !== 1 &&
      value.providerRequestSchemaVersion !== 2)
  ) {
    throw new Error("Invalid provider Checkout hash envelope");
  }
  if (
    value.providerRequestSchemaVersion === 1 &&
    value.providerBindingSnapshot !== undefined &&
    value.providerBindingSnapshot !== null
  ) {
    throw new Error("Invalid provider Checkout hash envelope");
  }
  if (
    value.providerRequestSchemaVersion === 2 &&
    (value.providerBindingSnapshot?.schemaVersion !== 2 ||
      !createStripeProviderBindingSnapshotV2(
        value.providerBindingSnapshot.lines,
      ).ok)
  ) {
    throw new Error("Invalid provider Checkout hash envelope");
  }
  return hashCanonicalEnvelope(
    {
      schemaVersion: value.providerRequestSchemaVersion,
      provider: value.provider,
      kind: "hosted_checkout",
      request: value.request,
      ...(value.providerRequestSchemaVersion === 2
        ? { providerBindingSnapshot: value.providerBindingSnapshot }
        : {}),
    },
    sha256,
  );
}

function providerReference(value: unknown): value is string {
  return canonicalText(value, 3, 200);
}

export function buildProviderRefundRequestV1(
  value: unknown,
): ContractResult<ProviderRefundRequestV1> {
  if (!exactRecord(value, refundFactKeys)) return failure("refundFacts");
  const paymentIntent = value.paymentIntentId;
  const charge = value.chargeId;
  if (
    value.schemaVersion !== 1 ||
    (value.provider !== "stripe" && value.provider !== "local_test") ||
    !isCanonicalUuid(value.refundId) ||
    !isCanonicalUuid(value.orderId) ||
    !safePositive(value.requestedAmountMinor) ||
    value.currency !== "USD" ||
    !(
      (providerReference(paymentIntent) && charge === null) ||
      (paymentIntent === null && providerReference(charge))
    ) ||
    value.providerIdempotencyKey !== `refund_request:${value.refundId}` ||
    !canonicalText(value.providerIdempotencyKey, 1, 200)
  ) {
    return failure("refundFacts");
  }
  const request = Object.freeze({
    schemaVersion: 1 as const,
    provider: value.provider,
    refundId: value.refundId,
    orderId: value.orderId,
    amountMinor: value.requestedAmountMinor,
    currency: "usd" as const,
    paymentIntentId: paymentIntent as string | null,
    chargeId: charge as string | null,
    metadata: Object.freeze({ orderId: value.orderId, refundId: value.refundId }),
    providerIdempotencyKey: value.providerIdempotencyKey,
  });
  return Object.freeze({ ok: true as const, value: request });
}

export function hashProviderRefundRequest(
  request: ProviderRefundRequestV1,
  sha256: Sha256Hasher,
): Promise<string> {
  return hashCanonicalEnvelope(
    {
      schemaVersion: 1,
      provider: request.provider,
      kind: "refund",
      request,
    },
    sha256,
  );
}
