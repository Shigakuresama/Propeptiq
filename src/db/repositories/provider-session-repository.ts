import "server-only";

import { isCanonicalUuid, isSha256 } from "@/commerce/checkout-identity";
import type { ProviderKind } from "@/commerce/provider-contracts";
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

declare const durableCheckoutRequest: unique symbol;
export type DurableCheckoutRequestV1 = DurableCheckoutRequestDataV1 & {
  readonly [durableCheckoutRequest]: true;
};

export type ProviderSessionCasResult = Readonly<{
  status: "applied" | "idempotent" | "conflict" | "terminal" | "nonpayable";
}>;

export type ProviderSessionRepository = Readonly<{
  load: (input: Readonly<{
    buyerUserId: string;
    idempotencyKey: string;
  }>) => Promise<DurableCheckoutRequestV1 | null>;
  recordOpen: (
    durable: DurableCheckoutRequestV1,
    providerSessionId: string,
  ) => Promise<ProviderSessionCasResult>;
  recordUnknown: (
    durable: DurableCheckoutRequestV1,
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

function mintDurable(
  data: DurableCheckoutRequestDataV1,
): DurableCheckoutRequestV1 {
  const value = { ...data };
  Object.defineProperty(value, "toJSON", {
    enumerable: false,
    value() {
      throw new Error("Durable checkout requests must never be serialized");
    },
  });
  const durable = Object.freeze(value) as DurableCheckoutRequestV1;
  durableRequests.add(durable);
  return durable;
}

export function projectDurableCheckoutRequestV1(
  value: unknown,
): DurableCheckoutRequestDataV1 | null {
  return typeof value === "object" && value !== null && durableRequests.has(value)
    ? (value as DurableCheckoutRequestDataV1)
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
): Promise<DurableCheckoutRequestV1 | null> {
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
     ORDER BY i.product_id`,
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
    row.providerRequestSchemaVersion !== 1 ||
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
  const lines = items.rows.map((item) => {
    const quantity = safeInteger(item.quantity);
    const unitAmountMinor = safeInteger(item.unitAmountMinor);
    const lineSubtotal = safeInteger(item.subtotalMinor);
    const lineDiscount = safeInteger(item.discountMinor);
    const lineTotal = safeInteger(item.totalMinor);
    const allocatedDiscount = safeInteger(item.allocatedDiscountMinor);
    if (
      !isCanonicalUuid(item.productId) ||
      seen.has(item.productId) ||
      !canonicalText(item.productName) ||
      !canonicalText(item.packageForm) ||
      item.currency !== "USD" ||
      quantity < 1 ||
      unitAmountMinor * quantity !== lineSubtotal ||
      lineDiscount !== allocatedDiscount ||
      lineSubtotal - lineDiscount !== lineTotal
    ) {
      throw new Error("Durable checkout snapshot is incoherent");
    }
    seen.add(item.productId);
    itemSubtotal += lineSubtotal;
    itemDiscount += lineDiscount;
    itemTotal += lineTotal;
    if (![itemSubtotal, itemDiscount, itemTotal].every(Number.isSafeInteger)) {
      throw new Error("Durable checkout snapshot is incoherent");
    }
    return Object.freeze({
      productId: item.productId,
      productName: item.productName,
      packageForm: item.packageForm,
      purchasedQuantity: quantity,
      postDiscountTotalMinor: lineTotal,
    });
  });
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
  return mintDurable({
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
    providerRequestSchemaVersion: 1,
    providerLivemode: row.providerLivemode,
    providerScope: row.providerScope,
    currency: "USD",
    destination: Object.freeze({
      recipientName: row.recipientName,
      line1: row.line1,
      line2: row.line2,
      city: row.city,
      stateCode: row.stateCode,
      postalCode: row.postalCode,
      countryCode: "US",
    }),
    lines: Object.freeze(lines),
    shippingMinor,
    taxMinor,
    totalMinor,
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
  durable: DurableCheckoutRequestDataV1,
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
  durable: DurableCheckoutRequestDataV1,
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
    durableValue: DurableCheckoutRequestV1,
    providerSessionId: string | null,
    target: "open" | "provider_unknown",
    integrityFailure: boolean,
  ): Promise<ProviderSessionCasResult> {
    const durable = projectDurableCheckoutRequestV1(durableValue);
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
