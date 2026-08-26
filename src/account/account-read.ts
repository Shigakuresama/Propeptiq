import type { BuyerStatus, ResearchPurpose } from "@/domain/eligibility";
import { isCanonicalUuid } from "@/commerce/checkout-identity";

export type AccountSummary = Readonly<{
  userId: string;
  status: BuyerStatus;
  ageConfirmedAt: string | null;
  researchPurpose: ResearchPurpose | null;
  organizationName: string | null;
  acceptedAttestationVersion: number | null;
  currentAttestationVersion: number | null;
  updatedAt: string;
}>;

export type OrderSummary = Readonly<{
  id: string;
  state: string;
  currency: string;
  totalMinor: number;
  paymentState: "pending_verification" | "paid" | "failed";
  refundState: "none" | "pending" | "partial" | "full" | "failed";
  holdState: "none" | "active";
  releaseState: "none" | "issued" | "revoked" | "expired" | "consumed";
  shipmentState: "none" | "pending" | "handed_off" | "delivered" | "exception";
  createdAt: string;
}>;

export type OrderDetail = OrderSummary & Readonly<{
  destinationStateCode: string;
  items: readonly Readonly<{
    id: string;
    productName: string;
    packageForm: string;
    quantity: number;
    unitAmountMinor: number;
    totalMinor: number;
  }>[];
}>;

export type AccountReadQueryPort = Readonly<{
  query: <T extends object>(
    sql: string,
    params?: unknown[],
  ) => Promise<Readonly<{ rows: T[] }>>;
}>;

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid account timestamp");
  return date.toISOString();
}

function money(value: number | string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("Invalid order amount");
  return parsed;
}

type OrderLifecycleRow = Readonly<{
  id: string;
  state: string;
  currency: string;
  totalMinor: number | string;
  verifiedPaymentCount: number | string;
  failedPaymentCount: number | string;
  refundCount: number | string;
  confirmedRefundMinor: number | string;
  pendingRefundCount: number | string;
  failedRefundCount: number | string;
  releaseCount: number | string;
  releaseState: string | null;
  shipmentCount: number | string;
  shipmentState: string | null;
  createdAt: Date | string;
}>;

const releaseStates = new Set(["issued", "revoked", "expired", "consumed"]);
const shipmentStates = new Set(["pending", "handed_off", "delivered", "exception"]);

function projectOrderSummary(row: OrderLifecycleRow): OrderSummary {
  const totalMinor = money(row.totalMinor);
  const verified = money(row.verifiedPaymentCount);
  const failedPayments = money(row.failedPaymentCount);
  const refundCount = money(row.refundCount);
  const confirmedRefundMinor = money(row.confirmedRefundMinor);
  const pendingRefundCount = money(row.pendingRefundCount);
  const failedRefundCount = money(row.failedRefundCount);
  const releaseCount = money(row.releaseCount);
  const shipmentCount = money(row.shipmentCount);
  if (
    !isCanonicalUuid(row.id) || verified > 1 || releaseCount > 1 || shipmentCount > 1 ||
    pendingRefundCount > refundCount || failedRefundCount > refundCount ||
    pendingRefundCount + failedRefundCount > refundCount || confirmedRefundMinor > totalMinor ||
    (releaseCount === 0) !== (row.releaseState === null) ||
    (shipmentCount === 0) !== (row.shipmentState === null) ||
    (row.releaseState !== null && !releaseStates.has(row.releaseState)) ||
    (row.shipmentState !== null && !shipmentStates.has(row.shipmentState))
  ) {
    throw new Error("Owner order lifecycle projection is not coherent");
  }
  const succeededRefundCount = refundCount - pendingRefundCount - failedRefundCount;
  if ((confirmedRefundMinor > 0) !== (succeededRefundCount > 0)) {
    throw new Error("Owner order lifecycle projection is not coherent");
  }
  const refundState: OrderSummary["refundState"] = pendingRefundCount > 0
    ? "pending"
    : confirmedRefundMinor === totalMinor && totalMinor > 0
      ? "full"
      : confirmedRefundMinor > 0
        ? "partial"
        : refundCount > 0 && failedRefundCount === refundCount
          ? "failed"
          : "none";
  return Object.freeze({
    id: row.id,
    state: row.state,
    currency: row.currency,
    totalMinor,
    paymentState: verified === 1 ? "paid" : failedPayments > 0 ? "failed" : "pending_verification",
    refundState,
    holdState: row.state === "paid_on_hold" ? "active" : "none",
    releaseState: (row.releaseState ?? "none") as OrderSummary["releaseState"],
    shipmentState: (row.shipmentState ?? "none") as OrderSummary["shipmentState"],
    createdAt: toIso(row.createdAt),
  });
}

export async function loadOwnAccount(
  client: AccountReadQueryPort,
  ownerUserId: string,
): Promise<AccountSummary | null> {
  const result = await client.query<{
    userId: string;
    status: BuyerStatus;
    ageConfirmedAt: Date | string | null;
    researchPurpose: ResearchPurpose | null;
    organizationName: string | null;
    acceptedAttestationVersion: number | null;
    currentAttestationVersion: number | null;
    updatedAt: Date | string;
  }>(
    `
      SELECT bp.user_id::text AS "userId", bp.status,
             bp.age_confirmed_at AS "ageConfirmedAt",
             bp.research_purpose AS "researchPurpose",
             bp.organization_name AS "organizationName",
             accepted.version AS "acceptedAttestationVersion",
             current_version.version AS "currentAttestationVersion",
             bp.updated_at AS "updatedAt"
      FROM buyer_profiles bp
      LEFT JOIN LATERAL (
        SELECT av.version
        FROM attestation_acceptances aa
        JOIN attestation_versions av ON av.id = aa.attestation_version_id
        WHERE aa.user_id = bp.user_id
        ORDER BY av.version DESC LIMIT 1
      ) accepted ON true
      LEFT JOIN LATERAL (
        SELECT CASE WHEN count(*) = 1 THEN max(av.version) ELSE NULL END AS version
        FROM attestation_versions av
        WHERE av.effective_at <= CURRENT_TIMESTAMP
          AND (av.superseded_at IS NULL OR av.superseded_at > CURRENT_TIMESTAMP)
      ) current_version ON true
      WHERE bp.user_id = $1::uuid
    `,
    [ownerUserId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    ageConfirmedAt:
      row.ageConfirmedAt === null ? null : toIso(row.ageConfirmedAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export async function listOwnOrders(
  client: AccountReadQueryPort,
  ownerUserId: string,
): Promise<readonly OrderSummary[]> {
  if (!isCanonicalUuid(ownerUserId)) return [];
  const result = await client.query<OrderLifecycleRow>(
    `
      SELECT o.id::text AS id, o.state, o.currency,
             o.total_minor AS "totalMinor",
             (SELECT count(*) FROM payment_events pe WHERE pe.order_id = o.id AND pe.event_type = 'payment_verified') AS "verifiedPaymentCount",
             (SELECT count(*) FROM payment_events pe WHERE pe.order_id = o.id AND pe.event_type = 'payment_failed') AS "failedPaymentCount",
             (SELECT count(*) FROM refunds r WHERE r.order_id = o.id) AS "refundCount",
             (SELECT coalesce(sum(r.confirmed_amount_minor), 0) FROM refunds r WHERE r.order_id = o.id AND r.status = 'succeeded') AS "confirmedRefundMinor",
             (SELECT count(*) FROM refunds r WHERE r.order_id = o.id AND r.status IN ('requested','submitted')) AS "pendingRefundCount",
             (SELECT count(*) FROM refunds r WHERE r.order_id = o.id AND r.status IN ('failed','cancelled')) AS "failedRefundCount",
             (SELECT count(*) FROM fulfillment_releases fr WHERE fr.order_id = o.id) AS "releaseCount",
             (SELECT fr.state::text FROM fulfillment_releases fr WHERE fr.order_id = o.id ORDER BY fr.version DESC LIMIT 1) AS "releaseState",
             (SELECT count(*) FROM shipments s WHERE s.order_id = o.id) AS "shipmentCount",
             (SELECT s.state::text FROM shipments s WHERE s.order_id = o.id) AS "shipmentState",
             o.created_at AS "createdAt"
      FROM orders o
      WHERE o.buyer_user_id = $1::uuid
      ORDER BY o.created_at DESC, o.id DESC
    `,
    [ownerUserId],
  );
  return result.rows.map(projectOrderSummary);
}

export async function loadOwnOrder(
  client: AccountReadQueryPort,
  ownerUserId: string,
  orderId: string,
): Promise<OrderDetail | null> {
  if (!isCanonicalUuid(ownerUserId) || !isCanonicalUuid(orderId)) return null;
  const order = await client.query<OrderLifecycleRow & {
    destinationStateCode: string;
  }>(
    `
      SELECT o.id::text AS id, o.state, o.currency, o.total_minor AS "totalMinor",
             o.destination_state_code AS "destinationStateCode",
             (SELECT count(*) FROM payment_events pe WHERE pe.order_id = o.id AND pe.event_type = 'payment_verified') AS "verifiedPaymentCount",
             (SELECT count(*) FROM payment_events pe WHERE pe.order_id = o.id AND pe.event_type = 'payment_failed') AS "failedPaymentCount",
             (SELECT count(*) FROM refunds r WHERE r.order_id = o.id) AS "refundCount",
             (SELECT coalesce(sum(r.confirmed_amount_minor), 0) FROM refunds r WHERE r.order_id = o.id AND r.status = 'succeeded') AS "confirmedRefundMinor",
             (SELECT count(*) FROM refunds r WHERE r.order_id = o.id AND r.status IN ('requested','submitted')) AS "pendingRefundCount",
             (SELECT count(*) FROM refunds r WHERE r.order_id = o.id AND r.status IN ('failed','cancelled')) AS "failedRefundCount",
             (SELECT count(*) FROM fulfillment_releases fr WHERE fr.order_id = o.id) AS "releaseCount",
             (SELECT fr.state::text FROM fulfillment_releases fr WHERE fr.order_id = o.id ORDER BY fr.version DESC LIMIT 1) AS "releaseState",
             (SELECT count(*) FROM shipments s WHERE s.order_id = o.id) AS "shipmentCount",
             (SELECT s.state::text FROM shipments s WHERE s.order_id = o.id) AS "shipmentState",
             o.created_at AS "createdAt"
      FROM orders o
      WHERE o.id = $1::uuid AND o.buyer_user_id = $2::uuid
    `,
    [orderId, ownerUserId],
  );
  const row = order.rows[0];
  if (!row) return null;
  const items = await client.query<{
    id: string;
    productName: string;
    packageForm: string;
    quantity: number;
    unitAmountMinor: number | string;
    totalMinor: number | string;
  }>(
    `
      SELECT id::text AS id, product_name_snapshot AS "productName",
             package_form_snapshot AS "packageForm", quantity,
             unit_amount_minor AS "unitAmountMinor", total_minor AS "totalMinor"
      FROM order_items
      WHERE order_id = $1::uuid
      ORDER BY created_at, id
    `,
    [orderId],
  );
  return {
    ...projectOrderSummary(row),
    destinationStateCode: row.destinationStateCode,
    items: items.rows.map((item) => ({
      ...item,
      unitAmountMinor: money(item.unitAmountMinor),
      totalMinor: money(item.totalMinor),
    })),
  };
}
