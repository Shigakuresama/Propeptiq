import "server-only";

import { isCanonicalUuid, isSha256 } from "@/commerce/checkout-identity";
import {
  createStripeProviderBindingSnapshotV2,
  type ProviderKind,
  type StripeProviderBindingSnapshotV2,
} from "@/commerce/provider-contracts";
import type { CheckoutAttemptStatus } from "@/commerce/checkout-service";
import type { OrderState } from "@/domain/orders";
import type { CheckoutSqlClient } from "@/db/repositories/checkout-repository";

export type DurableCheckoutRequestDataV1 = Readonly<{
  buyerUserId: string;
  idempotencyKey: string;
  orderId: string;
  attemptId: string;
  requestHash: string;
  attemptStatus: CheckoutAttemptStatus;
  orderState: OrderState;
  provider: ProviderKind;
  providerIdempotencyKey: string;
  providerSessionId: string | null;
  providerRequestHash: string;
  providerExpiresAt: string;
  providerCustomerEmail: string;
  providerOrigin: string;
  providerRequestSchemaVersion: 1;
  providerLivemode: boolean;
  providerScope: string;
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

export type DurableCheckoutRequestDataV2 = Readonly<
  Omit<DurableCheckoutRequestDataV1, "providerRequestSchemaVersion" | "lines"> & {
    providerRequestSchemaVersion: 2;
    providerBindingSnapshot: StripeProviderBindingSnapshotV2;
  }
>;

declare const durableCheckoutRequest: unique symbol;
export type DurableCheckoutRequestV1 = DurableCheckoutRequestDataV1 & {
  readonly [durableCheckoutRequest]: true;
};
export type DurableCheckoutRequestV2 = DurableCheckoutRequestDataV2 & {
  readonly [durableCheckoutRequest]: true;
};
export type DurableCheckoutRequest =
  | DurableCheckoutRequestV1
  | DurableCheckoutRequestV2;

export type ProviderSessionCasResult = Readonly<{
  status: "applied" | "idempotent" | "conflict" | "terminal" | "nonpayable";
}>;

export type ProviderSessionRepository = Readonly<{
  load: (input: Readonly<{
    buyerUserId: string;
    idempotencyKey: string;
  }>) => Promise<DurableCheckoutRequest | null>;
  recordOpen: (
    durable: DurableCheckoutRequest,
    providerSessionId: string,
  ) => Promise<ProviderSessionCasResult>;
  recordUnknown: (
    durable: DurableCheckoutRequest,
    input: Readonly<{
      knownProviderSessionId: string | null;
      integrityFailure: boolean;
    }>,
  ) => Promise<ProviderSessionCasResult>;
}>;

type TransactionRunner = <Value>(
  work: (client: CheckoutSqlClient) => Promise<Value>,
) => Promise<Value>;

const durableRequests = new WeakSet<object>();
const attemptStatuses = new Set<CheckoutAttemptStatus>([
  "created",
  "open",
  "provider_unknown",
  "completed",
  "expired",
  "failed",
]);
const terminalStatuses = new Set<CheckoutAttemptStatus>([
  "completed",
  "expired",
  "failed",
]);
const orderStates = new Set<OrderState>([
  "draft",
  "eligibility_review",
  "compliance_hold",
  "ready_for_checkout",
  "checkout_pending",
  "payment_failed",
  "paid_pending_fulfillment",
  "paid_on_hold",
  "ready_for_fulfillment",
  "fulfillment_in_progress",
  "fulfilled",
  "cancelled",
]);

function safeInteger(value: unknown): number {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted) || converted < 0) {
    throw new Error("Durable checkout snapshot is incoherent");
  }
  return converted;
}

function canonicalText(value: unknown, maximum = 200): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function canonicalSessionId(value: unknown): value is string {
  return canonicalText(value) && /^(?:cs_|cs_local_synthetic_)/u.test(value);
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

function coherentReplayNamespace(row: MainRow): boolean {
  if (
    !canonicalText(row.providerCustomerEmail, 254) ||
    row.providerCustomerEmail !== row.providerCustomerEmail.toLowerCase() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(row.providerCustomerEmail) ||
    typeof row.providerOrigin !== "string" ||
    !URL.canParse(row.providerOrigin)
  ) {
    return false;
  }
  const origin = new URL(row.providerOrigin);
  if (
    origin.origin !== row.providerOrigin ||
    origin.username !== "" ||
    origin.password !== "" ||
    origin.pathname !== "/" ||
    origin.search !== "" ||
    origin.hash !== ""
  ) {
    return false;
  }
  if (row.provider === "local_test") {
    return (
      row.providerLivemode === false &&
      row.providerScope === "local_test:synthetic-propeptiq-v1" &&
      origin.protocol === "http:" &&
      loopbackHost(origin.hostname)
    );
  }
  return (
    /^stripe:acct_[A-Za-z0-9]{8,64}$/u.test(row.providerScope) &&
    origin.protocol === "https:" &&
    !unsafeStripeOriginHost(origin.hostname)
  );
}

function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(value as string);
  if (!Number.isFinite(date.getTime()) || date.getTime() % 1000 !== 0) {
    throw new Error("Durable checkout snapshot is incoherent");
  }
  return date.toISOString();
}

function mintDurable<Data extends DurableCheckoutRequestDataV1 | DurableCheckoutRequestDataV2>(
  data: Data,
): Data & { readonly [durableCheckoutRequest]: true } {
  const value = { ...data };
  Object.defineProperty(value, "toJSON", {
    enumerable: false,
    value() {
      throw new Error("Durable checkout requests must never be serialized");
    },
  });
  const durable = Object.freeze(value) as Data & {
    readonly [durableCheckoutRequest]: true;
  };
  durableRequests.add(durable);
  return durable;
}

/**
 * Repository-adapter mint seam. In-memory/local repository adapters must pass
 * the same complete durable projection that the PostgreSQL loader produces;
 * callers never receive a structural shortcut around the opaque check.
 */
export function createRepositoryDurableCheckoutRequestV1(
  data: DurableCheckoutRequestDataV1,
): DurableCheckoutRequestV1 {
  if (
    !isCanonicalUuid(data.buyerUserId) ||
    !isCanonicalUuid(data.idempotencyKey) ||
    !isCanonicalUuid(data.orderId) ||
    !isCanonicalUuid(data.attemptId) ||
    !isSha256(data.requestHash) ||
    !attemptStatuses.has(data.attemptStatus) ||
    !orderStates.has(data.orderState) ||
    (data.provider !== "stripe" && data.provider !== "local_test") ||
    data.providerIdempotencyKey !== `checkout_attempt:${data.attemptId}` ||
    (data.providerSessionId !== null && !canonicalSessionId(data.providerSessionId)) ||
    !isSha256(data.providerRequestHash) ||
    iso(data.providerExpiresAt) !== data.providerExpiresAt ||
    !canonicalText(data.providerCustomerEmail, 254) ||
    !URL.canParse(data.providerOrigin) ||
    data.providerRequestSchemaVersion !== 1 ||
    typeof data.providerLivemode !== "boolean" ||
    !canonicalText(data.providerScope, 200) ||
    data.currency !== "USD" ||
    data.destination.countryCode !== "US" ||
    !canonicalText(data.destination.recipientName, 120) ||
    !canonicalText(data.destination.line1, 120) ||
    (data.destination.line2 !== null && !canonicalText(data.destination.line2, 120)) ||
    !canonicalText(data.destination.city, 100) ||
    !/^[A-Z]{2}$/u.test(data.destination.stateCode) ||
    !/^\d{5}(?:-\d{4})?$/u.test(data.destination.postalCode) ||
    !Array.isArray(data.lines) || data.lines.length < 1 || data.lines.length > 50 ||
    !Number.isSafeInteger(data.shippingMinor) || data.shippingMinor < 0 ||
    !Number.isSafeInteger(data.taxMinor) || data.taxMinor < 0 ||
    !Number.isSafeInteger(data.totalMinor) || data.totalMinor <= 0
  ) {
    throw new Error("Durable checkout snapshot is incoherent");
  }
  const origin = new URL(data.providerOrigin);
  const providerNamespaceCoherent = data.provider === "local_test"
    ? data.providerLivemode === false &&
      data.providerScope === "local_test:synthetic-propeptiq-v1" &&
      origin.protocol === "http:" && loopbackHost(origin.hostname)
    : /^stripe:acct_[A-Za-z0-9]{8,64}$/u.test(data.providerScope) &&
      origin.protocol === "https:" && !unsafeStripeOriginHost(origin.hostname);
  const seen = new Set<string>();
  let merchandiseMinor = 0;
  for (const line of data.lines) {
    if (
      !isCanonicalUuid(line.productId) || seen.has(line.productId) ||
      !canonicalText(line.productName) || !canonicalText(line.packageForm) ||
      !Number.isSafeInteger(line.purchasedQuantity) || line.purchasedQuantity < 1 || line.purchasedQuantity > 25 ||
      !Number.isSafeInteger(line.postDiscountTotalMinor) || line.postDiscountTotalMinor < 0
    ) throw new Error("Durable checkout snapshot is incoherent");
    seen.add(line.productId);
    merchandiseMinor += line.postDiscountTotalMinor;
    if (!Number.isSafeInteger(merchandiseMinor)) throw new Error("Durable checkout snapshot is incoherent");
  }
  if (!providerNamespaceCoherent || merchandiseMinor + data.shippingMinor + data.taxMinor !== data.totalMinor) {
    throw new Error("Durable checkout snapshot is incoherent");
  }
  return mintDurable(Object.freeze({
    ...data,
    destination: Object.freeze({ ...data.destination }),
    lines: Object.freeze(data.lines.map((line) => Object.freeze({ ...line }))),
  }));
}

export function createRepositoryDurableCheckoutRequestV2(
  data: DurableCheckoutRequestDataV2,
): DurableCheckoutRequestV2 {
  const canonicalBinding = createStripeProviderBindingSnapshotV2(
    data.providerBindingSnapshot.lines,
  );
  if (
    !isCanonicalUuid(data.buyerUserId) ||
    !isCanonicalUuid(data.idempotencyKey) ||
    !isCanonicalUuid(data.orderId) ||
    !isCanonicalUuid(data.attemptId) ||
    !isSha256(data.requestHash) ||
    !attemptStatuses.has(data.attemptStatus) ||
    !orderStates.has(data.orderState) ||
    (data.provider !== "stripe" && data.provider !== "local_test") ||
    data.providerIdempotencyKey !== `checkout_attempt:${data.attemptId}` ||
    (data.providerSessionId !== null && !canonicalSessionId(data.providerSessionId)) ||
    !isSha256(data.providerRequestHash) ||
    iso(data.providerExpiresAt) !== data.providerExpiresAt ||
    !canonicalText(data.providerCustomerEmail, 254) ||
    !URL.canParse(data.providerOrigin) ||
    data.providerRequestSchemaVersion !== 2 ||
    typeof data.providerLivemode !== "boolean" ||
    !canonicalText(data.providerScope, 200) ||
    data.currency !== "USD" ||
    data.destination.countryCode !== "US" ||
    !canonicalText(data.destination.recipientName, 120) ||
    !canonicalText(data.destination.line1, 120) ||
    (data.destination.line2 !== null && !canonicalText(data.destination.line2, 120)) ||
    !canonicalText(data.destination.city, 100) ||
    !/^[A-Z]{2}$/u.test(data.destination.stateCode) ||
    !/^\d{5}(?:-\d{4})?$/u.test(data.destination.postalCode) ||
    data.providerBindingSnapshot.schemaVersion !== 2 ||
    !canonicalBinding.ok ||
    JSON.stringify(canonicalBinding.value) !== JSON.stringify(data.providerBindingSnapshot) ||
    !Number.isSafeInteger(data.shippingMinor) || data.shippingMinor < 0 ||
    !Number.isSafeInteger(data.taxMinor) || data.taxMinor < 0 ||
    !Number.isSafeInteger(data.totalMinor) || data.totalMinor <= 0
  ) {
    throw new Error("Durable checkout snapshot is incoherent");
  }
  const origin = new URL(data.providerOrigin);
  const providerNamespaceCoherent = data.provider === "local_test"
    ? data.providerLivemode === false &&
      data.providerScope === "local_test:synthetic-propeptiq-v1" &&
      origin.protocol === "http:" && loopbackHost(origin.hostname)
    : /^stripe:acct_[A-Za-z0-9]{8,64}$/u.test(data.providerScope) &&
      origin.protocol === "https:" && !unsafeStripeOriginHost(origin.hostname);
  const merchandiseMinor = canonicalBinding.value.lines.reduce(
    (sum, line) => sum + line.netLineMinor,
    0,
  );
  if (
    !providerNamespaceCoherent ||
    !Number.isSafeInteger(merchandiseMinor) ||
    merchandiseMinor + data.shippingMinor + data.taxMinor !== data.totalMinor
  ) {
    throw new Error("Durable checkout snapshot is incoherent");
  }
  return mintDurable(Object.freeze({
    ...data,
    destination: Object.freeze({ ...data.destination }),
    providerBindingSnapshot: canonicalBinding.value,
  }));
}

export function projectDurableCheckoutRequestV1(
  value: unknown,
): DurableCheckoutRequestDataV1 | null {
  return typeof value === "object" && value !== null && durableRequests.has(value) &&
    (value as { providerRequestSchemaVersion?: unknown }).providerRequestSchemaVersion === 1
    ? (value as DurableCheckoutRequestDataV1)
    : null;
}

export function projectDurableCheckoutRequest(
  value: unknown,
): DurableCheckoutRequestDataV1 | DurableCheckoutRequestDataV2 | null {
  return typeof value === "object" && value !== null && durableRequests.has(value)
    ? (value as DurableCheckoutRequestDataV1 | DurableCheckoutRequestDataV2)
    : null;
}

type MainRow = {
  buyerUserId: string;
  idempotencyKey: string;
  orderId: string;
  attemptId: string;
  requestHash: string;
  attemptStatus: CheckoutAttemptStatus;
  orderState: OrderState;
  provider: ProviderKind;
  providerIdempotencyKey: string;
  providerSessionId: string | null;
  providerRequestHash: string;
  providerExpiresAt: Date | string;
  providerCustomerEmail: string;
  providerOrigin: string;
  providerRequestSchemaVersion: number;
  providerBindingSnapshot: unknown;
  providerLivemode: boolean;
  providerScope: string;
  currency: string;
  subtotalMinor: number | string;
  discountMinor: number | string;
  shippingMinor: number | string;
  taxMinor: number | string;
  totalMinor: number | string;
  recipientName: string;
  line1: string;
  line2: string | null;
  city: string;
  stateCode: string;
  postalCode: string;
  countryCode: string;
};

type ItemRow = {
  productId: string;
  variantId: string | null;
  productPriceId: string;
  productName: string;
  packageForm: string;
  quantity: number | string;
  unitAmountMinor: number | string;
  subtotalMinor: number | string;
  discountMinor: number | string;
  totalMinor: number | string;
  allocatedDiscountMinor: number | string;
  currency: string;
};

async function loadDurable(
  client: CheckoutSqlClient,
  input: Readonly<{ buyerUserId: string; idempotencyKey: string }>,
): Promise<DurableCheckoutRequest | null> {
  if (!isCanonicalUuid(input.buyerUserId) || !isCanonicalUuid(input.idempotencyKey)) {
    return null;
  }
  const main = await client.query<MainRow>(
    `SELECT a.buyer_user_id::text AS "buyerUserId",
            a.idempotency_key AS "idempotencyKey",
            a.order_id::text AS "orderId", a.id::text AS "attemptId",
            a.request_hash AS "requestHash", a.status AS "attemptStatus",
            o.state AS "orderState", a.provider,
            a.provider_request_id AS "providerIdempotencyKey",
            a.provider_session_id AS "providerSessionId",
            a.provider_request_hash AS "providerRequestHash",
            a.expires_at AS "providerExpiresAt",
            a.provider_customer_email AS "providerCustomerEmail",
            a.provider_origin AS "providerOrigin",
            a.provider_request_schema_version AS "providerRequestSchemaVersion",
            a.provider_binding_snapshot AS "providerBindingSnapshot",
            a.provider_livemode AS "providerLivemode",
            a.provider_scope AS "providerScope", o.currency,
            o.subtotal_minor AS "subtotalMinor",
            o.discount_minor AS "discountMinor",
            o.shipping_minor AS "shippingMinor", o.tax_minor AS "taxMinor",
            o.total_minor AS "totalMinor", s.recipient_name AS "recipientName",
            s.address_line1 AS "line1", s.address_line2 AS "line2",
            s.city, s.state_code AS "stateCode", s.postal_code AS "postalCode",
            s.country AS "countryCode"
     FROM checkout_attempts a
     JOIN orders o ON o.id = a.order_id AND o.buyer_user_id = a.buyer_user_id
     JOIN order_shipping_addresses s ON s.order_id = o.id
     WHERE a.buyer_user_id = $1::uuid AND a.idempotency_key = $2`,
    [input.buyerUserId, input.idempotencyKey],
  );
  if (main.rows.length === 0) return null;
  if (main.rows.length !== 1) throw new Error("Durable checkout snapshot is incoherent");
  const row = main.rows[0]!;
  const items = await client.query<ItemRow>(
    `SELECT i.product_id::text AS "productId",
            i.variant_id::text AS "variantId",
            i.product_price_id::text AS "productPriceId",
            i.product_name_snapshot AS "productName",
            i.package_form_snapshot AS "packageForm", i.quantity,
            i.unit_amount_minor AS "unitAmountMinor",
            i.subtotal_minor AS "subtotalMinor",
            i.discount_minor AS "discountMinor", i.total_minor AS "totalMinor",
            COALESCE(sum(a.allocated_discount_minor), 0) AS "allocatedDiscountMinor",
            i.currency
     FROM order_items i
     LEFT JOIN order_promotion_allocations a
       ON a.order_id = i.order_id AND a.order_item_id = i.id
     WHERE i.order_id = $1::uuid
     GROUP BY i.id
     ORDER BY COALESCE(i.variant_id, i.product_id)`,
    [row.orderId],
  );
  if (
    !isCanonicalUuid(row.orderId) ||
    !isCanonicalUuid(row.attemptId) ||
    !isSha256(row.requestHash) ||
    !attemptStatuses.has(row.attemptStatus) ||
    !orderStates.has(row.orderState) ||
    (row.provider !== "stripe" && row.provider !== "local_test") ||
    row.providerIdempotencyKey !== `checkout_attempt:${row.attemptId}` ||
    (row.providerSessionId !== null && !canonicalSessionId(row.providerSessionId)) ||
    !isSha256(row.providerRequestHash) ||
    (row.providerRequestSchemaVersion !== 1 && row.providerRequestSchemaVersion !== 2) ||
    (row.providerRequestSchemaVersion === 1 && row.providerBindingSnapshot !== null) ||
    (row.providerRequestSchemaVersion === 2 && row.providerBindingSnapshot === null) ||
    typeof row.providerLivemode !== "boolean" ||
    !coherentReplayNamespace(row) ||
    row.currency !== "USD" ||
    row.countryCode !== "US" ||
    items.rows.length < 1 ||
    items.rows.length > 50
  ) {
    throw new Error("Durable checkout snapshot is incoherent");
  }
  const subtotalMinor = safeInteger(row.subtotalMinor);
  const discountMinor = safeInteger(row.discountMinor);
  const shippingMinor = safeInteger(row.shippingMinor);
  const taxMinor = safeInteger(row.taxMinor);
  const totalMinor = safeInteger(row.totalMinor);
  const seen = new Set<string>();
  let itemSubtotal = 0;
  let itemDiscount = 0;
  let itemTotal = 0;
  const legacyLines: DurableCheckoutRequestDataV1["lines"][number][] = [];
  for (const item of items.rows) {
    const quantity = safeInteger(item.quantity);
    const unitAmountMinor = safeInteger(item.unitAmountMinor);
    const lineSubtotal = safeInteger(item.subtotalMinor);
    const lineDiscount = safeInteger(item.discountMinor);
    const lineTotal = safeInteger(item.totalMinor);
    const allocatedDiscount = safeInteger(item.allocatedDiscountMinor);
    const identity = row.providerRequestSchemaVersion === 1
      ? item.productId
      : item.variantId;
    if (
      !isCanonicalUuid(item.productId) ||
      (row.providerRequestSchemaVersion === 1
        ? item.variantId !== null
        : !isCanonicalUuid(item.variantId)) ||
      identity === null ||
      seen.has(identity) ||
      !canonicalText(item.productName) ||
      !canonicalText(item.packageForm) ||
      item.currency !== "USD" ||
      quantity < 1 ||
      unitAmountMinor * quantity !== lineSubtotal ||
      (row.providerRequestSchemaVersion === 1 && lineDiscount !== allocatedDiscount) ||
      lineSubtotal - lineDiscount !== lineTotal
    ) {
      throw new Error("Durable checkout snapshot is incoherent");
    }
    seen.add(identity);
    itemSubtotal += lineSubtotal;
    itemDiscount += lineDiscount;
    itemTotal += lineTotal;
    if (![itemSubtotal, itemDiscount, itemTotal].every(Number.isSafeInteger)) {
      throw new Error("Durable checkout snapshot is incoherent");
    }
    if (row.providerRequestSchemaVersion === 1) {
      legacyLines.push(Object.freeze({
        productId: item.productId,
        productName: item.productName,
        packageForm: item.packageForm,
        purchasedQuantity: quantity,
        postDiscountTotalMinor: lineTotal,
      }));
    }
  }
  let bindingSnapshot: StripeProviderBindingSnapshotV2 | null = null;
  if (row.providerRequestSchemaVersion === 2) {
    const snapshotRecord = typeof row.providerBindingSnapshot === "object" &&
      row.providerBindingSnapshot !== null &&
      !Array.isArray(row.providerBindingSnapshot)
        ? row.providerBindingSnapshot as Record<string, unknown>
        : null;
    const snapshotKeys = snapshotRecord === null
      ? []
      : Reflect.ownKeys(snapshotRecord).toSorted();
    const rawSnapshotLines = snapshotRecord?.lines;
    const parsed = snapshotRecord?.schemaVersion === 2
      ? createStripeProviderBindingSnapshotV2(rawSnapshotLines)
      : null;
    if (
      snapshotKeys.length !== 2 ||
      snapshotKeys[0] !== "lines" ||
      snapshotKeys[1] !== "schemaVersion" ||
      parsed === null ||
      !parsed.ok ||
      !Array.isArray(rawSnapshotLines) ||
      parsed.value.lines.length !== items.rows.length ||
      rawSnapshotLines.some((line, index) =>
        typeof line !== "object" ||
        line === null ||
        Array.isArray(line) ||
        (line as Record<string, unknown>).variantId !== parsed.value.lines[index]?.variantId)
    ) {
      throw new Error("Durable checkout snapshot is incoherent");
    }
    const itemByVariant = new Map(items.rows.map((item) => [item.variantId, item] as const));
    if (itemByVariant.has(null) || itemByVariant.size !== items.rows.length) {
      throw new Error("Durable checkout snapshot is incoherent");
    }
    for (const line of parsed.value.lines) {
      const item = itemByVariant.get(line.variantId);
      if (
        item === undefined ||
        item.productId !== line.productId ||
        item.productPriceId !== line.priceBookId ||
        safeInteger(item.quantity) !== line.requestedQuantity ||
        safeInteger(item.unitAmountMinor) !== line.baseUnitMinor ||
        safeInteger(item.totalMinor) !== line.netLineMinor ||
        item.currency !== line.currency
      ) {
        throw new Error("Durable checkout snapshot is incoherent");
      }
    }
    bindingSnapshot = parsed.value;
  }
  if (
    itemSubtotal !== subtotalMinor ||
    itemDiscount !== discountMinor ||
    itemTotal + shippingMinor + taxMinor !== totalMinor ||
    totalMinor <= 0 ||
    !canonicalText(row.recipientName, 120) ||
    !canonicalText(row.line1, 120) ||
    (row.line2 !== null && !canonicalText(row.line2, 120)) ||
    !canonicalText(row.city, 100)
  ) {
    throw new Error("Durable checkout snapshot is incoherent");
  }
  const common = {
    buyerUserId: row.buyerUserId,
    idempotencyKey: row.idempotencyKey,
    orderId: row.orderId,
    attemptId: row.attemptId,
    requestHash: row.requestHash,
    attemptStatus: row.attemptStatus,
    orderState: row.orderState,
    provider: row.provider,
    providerIdempotencyKey: row.providerIdempotencyKey,
    providerSessionId: row.providerSessionId,
    providerRequestHash: row.providerRequestHash,
    providerExpiresAt: iso(row.providerExpiresAt),
    providerCustomerEmail: row.providerCustomerEmail,
    providerOrigin: row.providerOrigin,
    providerLivemode: row.providerLivemode,
    providerScope: row.providerScope,
    currency: "USD" as const,
    destination: Object.freeze({
      recipientName: row.recipientName,
      line1: row.line1,
      line2: row.line2,
      city: row.city,
      stateCode: row.stateCode,
      postalCode: row.postalCode,
      countryCode: "US" as const,
    }),
    shippingMinor,
    taxMinor,
    totalMinor,
  };
  return row.providerRequestSchemaVersion === 1
    ? createRepositoryDurableCheckoutRequestV1({
        ...common,
        providerRequestSchemaVersion: 1,
        lines: Object.freeze(legacyLines),
      })
    : createRepositoryDurableCheckoutRequestV2({
        ...common,
        providerRequestSchemaVersion: 2,
        providerBindingSnapshot: bindingSnapshot!,
      });
}

type LockedAttemptRow = {
  attemptId: string;
  orderId: string;
  buyerUserId: string;
  idempotencyKey: string;
  requestHash: string;
  status: CheckoutAttemptStatus;
  provider: ProviderKind;
  providerIdempotencyKey: string;
  providerSessionId: string | null;
  providerRequestHash: string;
  providerExpiresAt: Date | string;
  providerCustomerEmail: string;
  providerOrigin: string;
  providerRequestSchemaVersion: number;
  providerLivemode: boolean;
  providerScope: string;
};

function exactLockedIdentity(
  row: LockedAttemptRow,
  durable: DurableCheckoutRequestDataV1 | DurableCheckoutRequestDataV2,
): boolean {
  return (
    row.attemptId === durable.attemptId &&
    row.orderId === durable.orderId &&
    row.buyerUserId === durable.buyerUserId &&
    row.idempotencyKey === durable.idempotencyKey &&
    row.requestHash === durable.requestHash &&
    row.provider === durable.provider &&
    row.providerIdempotencyKey === durable.providerIdempotencyKey &&
    row.providerRequestHash === durable.providerRequestHash &&
    iso(row.providerExpiresAt) === durable.providerExpiresAt &&
    row.providerCustomerEmail === durable.providerCustomerEmail &&
    row.providerOrigin === durable.providerOrigin &&
    row.providerRequestSchemaVersion === durable.providerRequestSchemaVersion &&
    row.providerLivemode === durable.providerLivemode &&
    row.providerScope === durable.providerScope
  );
}

async function lockCasRows(
  client: CheckoutSqlClient,
  durable: DurableCheckoutRequestDataV1 | DurableCheckoutRequestDataV2,
): Promise<Readonly<{ attempt: LockedAttemptRow; orderState: OrderState }> | null> {
  const buyer = await client.query<{ id: string }>(
    `SELECT id::text AS id FROM users WHERE id = $1::uuid FOR UPDATE`,
    [durable.buyerUserId],
  );
  if (buyer.rows.length !== 1) return null;
  const attempts = await client.query<LockedAttemptRow>(
    `SELECT id::text AS "attemptId", order_id::text AS "orderId",
            buyer_user_id::text AS "buyerUserId", idempotency_key AS "idempotencyKey",
            request_hash AS "requestHash", status, provider,
            provider_request_id AS "providerIdempotencyKey",
            provider_session_id AS "providerSessionId",
            provider_request_hash AS "providerRequestHash", expires_at AS "providerExpiresAt",
            provider_customer_email AS "providerCustomerEmail",
            provider_origin AS "providerOrigin",
            provider_request_schema_version AS "providerRequestSchemaVersion",
            provider_livemode AS "providerLivemode", provider_scope AS "providerScope"
     FROM checkout_attempts
     WHERE buyer_user_id = $1::uuid AND idempotency_key = $2
     FOR UPDATE`,
    [durable.buyerUserId, durable.idempotencyKey],
  );
  if (attempts.rows.length !== 1 || !exactLockedIdentity(attempts.rows[0]!, durable)) {
    return null;
  }
  const order = await client.query<{ state: OrderState }>(
    `SELECT state FROM orders
     WHERE id = $1::uuid AND buyer_user_id = $2::uuid FOR UPDATE`,
    [durable.orderId, durable.buyerUserId],
  );
  return order.rows.length === 1
    ? Object.freeze({ attempt: attempts.rows[0]!, orderState: order.rows[0]!.state })
    : null;
}

export function createProviderSessionRepository(input: Readonly<{
  client: CheckoutSqlClient;
  runTransaction: TransactionRunner;
}>): ProviderSessionRepository {
  async function record(
    durableValue: DurableCheckoutRequest,
    providerSessionId: string | null,
    target: "open" | "provider_unknown",
    integrityFailure: boolean,
  ): Promise<ProviderSessionCasResult> {
    const durable = projectDurableCheckoutRequest(durableValue);
    if (
      durable === null ||
      (providerSessionId !== null && !canonicalSessionId(providerSessionId))
    ) {
      return Object.freeze({ status: "conflict" });
    }
    return input.runTransaction(async (client) => {
      const locked = await lockCasRows(client, durable);
      if (locked === null) return Object.freeze({ status: "conflict" as const });
      const current = locked.attempt;
      if (terminalStatuses.has(current.status)) {
        return Object.freeze({ status: "terminal" as const });
      }
      if (
        current.providerSessionId !== null &&
        providerSessionId !== null &&
        current.providerSessionId !== providerSessionId
      ) {
        return Object.freeze({ status: "conflict" as const });
      }
      const learnedId = current.providerSessionId ?? providerSessionId;
      const nonpayable = locked.orderState !== "checkout_pending";
      if (nonpayable) {
        if (current.status === "created" || current.status === "provider_unknown" || current.status === "open") {
          await client.query(
            `UPDATE checkout_attempts
             SET status = 'provider_unknown', provider_session_id = $2
             WHERE id = $1::uuid`,
            [durable.attemptId, learnedId],
          );
        }
        return Object.freeze({ status: "nonpayable" as const });
      }
      if (target === "open") {
        if (learnedId === null) return Object.freeze({ status: "conflict" as const });
        if (current.status === "open") {
          return Object.freeze({ status: "idempotent" as const });
        }
        if (current.status !== "created" && current.status !== "provider_unknown") {
          return Object.freeze({ status: "conflict" as const });
        }
        await client.query(
          `UPDATE checkout_attempts
           SET status = 'open', provider_session_id = $2
           WHERE id = $1::uuid`,
          [durable.attemptId, learnedId],
        );
        return Object.freeze({ status: "applied" as const });
      }
      if (current.status === "open" && !integrityFailure) {
        return Object.freeze({ status: "idempotent" as const });
      }
      if (
        current.status !== "created" &&
        current.status !== "provider_unknown" &&
        current.status !== "open"
      ) {
        return Object.freeze({ status: "conflict" as const });
      }
      const alreadyUnknown =
        current.status === "provider_unknown" &&
        current.providerSessionId === learnedId;
      if (!alreadyUnknown) {
        await client.query(
          `UPDATE checkout_attempts
           SET status = 'provider_unknown', provider_session_id = $2
           WHERE id = $1::uuid`,
          [durable.attemptId, learnedId],
        );
      }
      return Object.freeze({
        status: alreadyUnknown ? ("idempotent" as const) : ("applied" as const),
      });
    });
  }

  return Object.freeze({
    load: (loadInput) => loadDurable(input.client, loadInput),
    recordOpen: (durable, providerSessionId) =>
      record(durable, providerSessionId, "open", false),
    recordUnknown: (durable, unknownInput) =>
      record(
        durable,
        unknownInput.knownProviderSessionId,
        "provider_unknown",
        unknownInput.integrityFailure,
      ),
  });
}
