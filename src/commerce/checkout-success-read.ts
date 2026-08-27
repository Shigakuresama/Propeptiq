import "server-only";

import { isCanonicalUuid } from "@/commerce/checkout-identity";

export type CheckoutSuccessReadModel = Readonly<{
  orderId: string;
  state: string;
  currency: "USD";
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  taxMinor: number;
  totalMinor: number;
  paymentState: "pending_verification" | "paid" | "failed";
  refundState: "none" | "pending" | "partial" | "full" | "failed";
  holdState: "none" | "active";
  releaseState: "none" | "issued" | "revoked" | "expired" | "consumed";
  shipmentState: "none" | "pending" | "handed_off" | "delivered" | "exception";
  createdAt: string;
  updatedAt: string;
  items: readonly Readonly<{
    id: string;
    productName: string;
    packageForm: string;
    quantity: number;
    unitAmountMinor: number;
    subtotalMinor: number;
    discountMinor: number;
    totalMinor: number;
  }>[];
}>;

export type CheckoutSuccessQueryPort = Readonly<{
  query: <Row extends object>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<Readonly<{ rows: Row[] }>>;
}>;

function integer(value: unknown): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error("Checkout success projection is not coherent");
  return number;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" && !(value instanceof Date)) throw new Error("Checkout success projection is not coherent");
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Checkout success projection is not coherent");
  return date.toISOString();
}

const orderStates = new Set([
  "draft", "eligibility_review", "compliance_hold", "ready_for_checkout",
  "checkout_pending", "payment_failed", "paid_pending_fulfillment", "paid_on_hold",
  "ready_for_fulfillment", "fulfillment_in_progress", "fulfilled", "cancelled",
]);
const releaseStates = new Set(["issued", "revoked", "expired", "consumed"]);
const shipmentStates = new Set(["pending", "handed_off", "delivered", "exception"]);

export async function loadCheckoutSuccess(
  client: CheckoutSuccessQueryPort,
  ownerUserId: string,
  orderId: string,
): Promise<CheckoutSuccessReadModel | null> {
  if (!isCanonicalUuid(ownerUserId) || !isCanonicalUuid(orderId)) return null;
  const order = await client.query<{
    orderId: string; state: string; currency: string;
    subtotalMinor: number | string; discountMinor: number | string;
    shippingMinor: number | string; taxMinor: number | string; totalMinor: number | string;
    verifiedPaymentCount: number | string; failedPaymentCount: number | string;
    refundCount: number | string; confirmedRefundMinor: number | string; pendingRefundCount: number | string;
    succeededRefundCount?: number | string; failedRefundCount?: number | string;
    releaseCount: number | string; releaseVersion?: number | string | null; releaseState: string | null;
    shipmentCount: number | string; shipmentState: string | null;
    createdAt: Date | string; updatedAt: Date | string;
  }>(
    `
      SELECT o.id::text AS "orderId", o.state, o.currency,
             o.subtotal_minor AS "subtotalMinor", o.discount_minor AS "discountMinor",
             o.shipping_minor AS "shippingMinor", o.tax_minor AS "taxMinor",
             o.total_minor AS "totalMinor",
             (SELECT count(*) FROM payment_events pe WHERE pe.order_id = o.id AND pe.event_type = 'payment_verified') AS "verifiedPaymentCount",
             (SELECT count(*) FROM payment_events pe WHERE pe.order_id = o.id AND pe.event_type = 'payment_failed') AS "failedPaymentCount",
             (SELECT count(*) FROM refunds r WHERE r.order_id = o.id) AS "refundCount",
             (SELECT coalesce(sum(r.confirmed_amount_minor), 0) FROM refunds r WHERE r.order_id = o.id AND r.status = 'succeeded') AS "confirmedRefundMinor",
             (SELECT count(*) FROM refunds r WHERE r.order_id = o.id AND r.status IN ('requested','submitted')) AS "pendingRefundCount",
             (SELECT count(*) FROM refunds r WHERE r.order_id = o.id AND r.status = 'succeeded') AS "succeededRefundCount",
             (SELECT count(*) FROM refunds r WHERE r.order_id = o.id AND r.status IN ('failed','cancelled')) AS "failedRefundCount",
             (SELECT count(*) FROM fulfillment_releases fr WHERE fr.order_id = o.id) AS "releaseCount",
             (SELECT fr.version FROM fulfillment_releases fr WHERE fr.order_id = o.id ORDER BY fr.version DESC LIMIT 1) AS "releaseVersion",
             (SELECT fr.state::text FROM fulfillment_releases fr WHERE fr.order_id = o.id ORDER BY fr.version DESC LIMIT 1) AS "releaseState",
             (SELECT count(*) FROM shipments s WHERE s.order_id = o.id) AS "shipmentCount",
             (SELECT s.state::text FROM shipments s WHERE s.order_id = o.id) AS "shipmentState",
             o.created_at AS "createdAt", o.updated_at AS "updatedAt"
      FROM orders o
      WHERE o.id = $1::uuid AND o.buyer_user_id = $2::uuid
    `,
    [orderId, ownerUserId],
  );
  if (order.rows.length === 0) return null;
  if (order.rows.length !== 1) throw new Error("Checkout success projection is not coherent");
  const row = order.rows[0]!;
  const subtotalMinor = integer(row.subtotalMinor);
  const discountMinor = integer(row.discountMinor);
  const shippingMinor = integer(row.shippingMinor);
  const taxMinor = integer(row.taxMinor);
  const totalMinor = integer(row.totalMinor);
  const verified = integer(row.verifiedPaymentCount);
  const failedPayments = integer(row.failedPaymentCount);
  const refundCount = integer(row.refundCount);
  const confirmedRefundMinor = integer(row.confirmedRefundMinor);
  const pendingRefundCount = integer(row.pendingRefundCount);
  const succeededRefundCount = integer(row.succeededRefundCount ?? 0);
  const failedRefundCount = integer(row.failedRefundCount ?? 0);
  const releaseCount = integer(row.releaseCount);
  const releaseVersion = row.releaseVersion === null || row.releaseVersion === undefined
    ? null
    : integer(row.releaseVersion);
  const shipmentCount = integer(row.shipmentCount);
  if (
    row.orderId !== orderId || !orderStates.has(row.state) || row.currency !== "USD" ||
    discountMinor > subtotalMinor || totalMinor !== subtotalMinor - discountMinor + shippingMinor + taxMinor ||
    verified > 1 || shipmentCount > 1 ||
    pendingRefundCount + succeededRefundCount + failedRefundCount !== refundCount ||
    (succeededRefundCount === 0 && confirmedRefundMinor !== 0) ||
    (releaseCount === 0) !== (row.releaseState === null) ||
    (releaseCount === 0) !== (releaseVersion === null) ||
    (releaseVersion !== null && (releaseVersion < 1 || releaseVersion > releaseCount)) ||
    (shipmentCount === 0) !== (row.shipmentState === null) ||
    (row.releaseState !== null && !releaseStates.has(row.releaseState)) ||
    (row.shipmentState !== null && !shipmentStates.has(row.shipmentState)) ||
    confirmedRefundMinor > totalMinor
  ) throw new Error("Checkout success projection is not coherent");

  const itemsResult = await client.query<{
    id: string; productName: string; packageForm: string; quantity: number | string;
    unitAmountMinor: number | string; subtotalMinor: number | string;
    discountMinor: number | string; totalMinor: number | string;
  }>(
    `
      SELECT oi.id::text AS id, oi.product_name_snapshot AS "productName",
             oi.package_form_snapshot AS "packageForm", oi.quantity,
             oi.unit_amount_minor AS "unitAmountMinor", oi.subtotal_minor AS "subtotalMinor",
             oi.discount_minor AS "discountMinor", oi.total_minor AS "totalMinor"
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.order_id = $1::uuid AND o.buyer_user_id = $2::uuid
      ORDER BY oi.created_at, oi.id
    `,
    [orderId, ownerUserId],
  );
  if (itemsResult.rows.length < 1 || itemsResult.rows.length > 50) throw new Error("Checkout success projection is not coherent");
  const items = itemsResult.rows.map((item) => {
    const quantity = integer(item.quantity);
    const unitAmountMinor = integer(item.unitAmountMinor);
    const itemSubtotal = integer(item.subtotalMinor);
    const itemDiscount = integer(item.discountMinor);
    const itemTotal = integer(item.totalMinor);
    if (!isCanonicalUuid(item.id) || quantity < 1 || quantity > 25 || typeof item.productName !== "string" || !item.productName.trim() || typeof item.packageForm !== "string" || !item.packageForm.trim() || itemSubtotal !== unitAmountMinor * quantity || itemDiscount > itemSubtotal || itemTotal !== itemSubtotal - itemDiscount) {
      throw new Error("Checkout success projection is not coherent");
    }
    return Object.freeze({ id: item.id, productName: item.productName, packageForm: item.packageForm, quantity, unitAmountMinor, subtotalMinor: itemSubtotal, discountMinor: itemDiscount, totalMinor: itemTotal });
  });
  const paymentState = verified === 1 ? "paid" : failedPayments > 0 ? "failed" : "pending_verification";
  const refundState = pendingRefundCount > 0
    ? "pending"
    : confirmedRefundMinor === totalMinor && totalMinor > 0
      ? "full"
      : confirmedRefundMinor > 0
        ? "partial"
        : refundCount > 0 && failedRefundCount === refundCount
          ? "failed"
          : "none";
  return Object.freeze({
    orderId,
    state: row.state,
    currency: "USD",
    subtotalMinor, discountMinor, shippingMinor, taxMinor, totalMinor,
    paymentState,
    refundState,
    holdState: row.state === "paid_on_hold" ? "active" : "none",
    releaseState: (row.releaseState ?? "none") as CheckoutSuccessReadModel["releaseState"],
    shipmentState: (row.shipmentState ?? "none") as CheckoutSuccessReadModel["shipmentState"],
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
    items: Object.freeze(items),
  });
}
