import type { BuyerStatus, ResearchPurpose } from "@/domain/eligibility";

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
  const result = await client.query<{
    id: string;
    state: string;
    currency: string;
    totalMinor: number | string;
    createdAt: Date | string;
  }>(
    `
      SELECT id::text AS id, state, currency,
             total_minor AS "totalMinor", created_at AS "createdAt"
      FROM orders
      WHERE buyer_user_id = $1::uuid
      ORDER BY created_at DESC, id DESC
    `,
    [ownerUserId],
  );
  return result.rows.map((row) => ({
    ...row,
    totalMinor: money(row.totalMinor),
    createdAt: toIso(row.createdAt),
  }));
}

export async function loadOwnOrder(
  client: AccountReadQueryPort,
  ownerUserId: string,
  orderId: string,
): Promise<OrderDetail | null> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(ownerUserId) || !uuid.test(orderId)) return null;
  const order = await client.query<{
    id: string;
    state: string;
    currency: string;
    totalMinor: number | string;
    destinationStateCode: string;
    createdAt: Date | string;
  }>(
    `
      SELECT id::text AS id, state, currency, total_minor AS "totalMinor",
             destination_state_code AS "destinationStateCode",
             created_at AS "createdAt"
      FROM orders
      WHERE id = $1::uuid AND buyer_user_id = $2::uuid
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
    ...row,
    totalMinor: money(row.totalMinor),
    createdAt: toIso(row.createdAt),
    items: items.rows.map((item) => ({
      ...item,
      unitAmountMinor: money(item.unitAmountMinor),
      totalMinor: money(item.totalMinor),
    })),
  };
}
