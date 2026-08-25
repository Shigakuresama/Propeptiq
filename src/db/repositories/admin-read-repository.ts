import {
  ADMIN_READ_LIMIT,
  requiredAdminReadCapability,
  type AdminReadResource,
  type AdminReadSnapshot,
  type AdminReadSnapshotFor,
  type SafePromotionConfiguration,
} from "@/admin/admin-read";
import { isVerifiedIdentityAt, type VerifiedIdentity } from "@/auth/identity";

export type AdminReadSqlClient = Readonly<{
  query: <Row extends object>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<Readonly<{ rows: Row[] }>>;
}>;

export type AdminReadTransactionOptions = Readonly<{
  isolationLevel: "serializable";
  readOnly: true;
}>;

export type AdminReadTransactionRunner = <Result>(
  work: (client: AdminReadSqlClient) => Promise<Result>,
  options: AdminReadTransactionOptions,
) => Promise<Result>;

export type AdminReadRequest<Resource extends AdminReadResource> = Readonly<{
  userId: string;
  identity: VerifiedIdentity;
  now: Date;
  resource: Resource;
}>;

export type AdminReadRepository = Readonly<{
  readSnapshot: <Resource extends AdminReadResource>(
    request: AdminReadRequest<Resource>,
  ) => Promise<AdminReadSnapshotFor<Resource>>;
}>;

type SnapshotItem<Resource extends AdminReadResource> =
  AdminReadSnapshotFor<Resource>["items"][number];

const queryLimit = ADMIN_READ_LIMIT + 1;

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Invalid database timestamp in admin read model");
  }
  return date.toISOString();
}

function nullableIso(value: Date | string | null): string | null {
  return value === null ? null : toIso(value);
}

function safeInteger(value: number | string): number {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) {
    throw new Error("Unsafe database integer in admin read model");
  }
  return numeric;
}

function nullableSafeInteger(value: number | string | null): number | null {
  return value === null ? null : safeInteger(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeProductIds(value: unknown, minimum: number): readonly string[] | null {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > 100 ||
    value.some((id) => typeof id !== "string" || !uuidPattern.test(id)) ||
    new Set(value).size !== value.length
  ) {
    return null;
  }
  return Object.freeze([...value]) as readonly string[];
}

function safePromotionConfiguration(
  kind: "discount" | "bundle" | "subscription" | "loyalty" | "cross_sell",
  raw: unknown,
): SafePromotionConfiguration {
  const value = normalizeJson(raw);
  if (!isRecord(value)) return { kind: "invalid" };
  if (kind === "discount") {
    return hasExactKeys(value, []) ? { kind: "discount" } : { kind: "invalid" };
  }
  if (kind === "bundle" || kind === "cross_sell") {
    if (!hasExactKeys(value, ["productIds"])) return { kind: "invalid" };
    const productIds = safeProductIds(value.productIds, kind === "bundle" ? 2 : 1);
    return productIds ? { kind, productIds } : { kind: "invalid" };
  }
  if (kind === "subscription") {
    if (!hasExactKeys(value, ["interval", "intervalCount"])) return { kind: "invalid" };
    const interval = value.interval;
    const intervalCount = value.intervalCount;
    if (
      (interval !== "month" && interval !== "year") ||
      typeof intervalCount !== "number" ||
      !Number.isSafeInteger(intervalCount) ||
      intervalCount < 1 ||
      intervalCount > 12
    ) {
      return { kind: "invalid" };
    }
    return { kind: "subscription", interval, intervalCount };
  }
  if (!hasExactKeys(value, ["pointsPerDollar"])) return { kind: "invalid" };
  const pointsPerDollar = value.pointsPerDollar;
  if (
    typeof pointsPerDollar !== "number" ||
    !Number.isSafeInteger(pointsPerDollar) ||
    pointsPerDollar < 1 ||
    pointsPerDollar > 100
  ) {
    return { kind: "invalid" };
  }
  return { kind: "loyalty", pointsPerDollar };
}

function promotionTargets(raw: unknown): readonly Readonly<{
  kind: "product" | "policy_group";
  id: string;
}>[] {
  const value = normalizeJson(raw);
  if (!Array.isArray(value) || value.length > 100) {
    throw new Error("Invalid promotion-target projection");
  }
  return Object.freeze(
    value.map((candidate) => {
      if (
        !isRecord(candidate) ||
        (candidate.kind !== "product" && candidate.kind !== "policy_group") ||
        typeof candidate.id !== "string" ||
        !uuidPattern.test(candidate.id)
      ) {
        throw new Error("Invalid promotion-target projection");
      }
      return Object.freeze({ kind: candidate.kind, id: candidate.id });
    }),
  );
}

async function assertPersistedAuthority(
  client: AdminReadSqlClient,
  request: AdminReadRequest<AdminReadResource>,
): Promise<void> {
  const capability = requiredAdminReadCapability(request.resource);
  const result = await client.query<{ authorized: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM users u
        JOIN staff_roles sr ON sr.user_id = u.id
          AND sr.capability = $3 AND sr.revoked_at IS NULL
        LEFT JOIN buyer_profiles bp ON bp.user_id = u.id
        WHERE u.id = $1::uuid AND u.clerk_id = $2
          AND (bp.status IS NULL OR bp.status <> 'blocked')
      ) AS authorized
    `,
    [request.userId, request.identity.clerkUserId, capability],
  );
  if (result.rows[0]?.authorized !== true) {
    throw new Error(`Persisted ${capability} capability is required`);
  }
}

async function boundedRows<Row extends object, Item>(
  client: AdminReadSqlClient,
  sql: string,
  project: (row: Row) => Readonly<Item>,
): Promise<Readonly<{ items: readonly Readonly<Item>[]; truncated: boolean }>> {
  const result = await client.query<Row>(sql, [queryLimit]);
  return Object.freeze({
    items: Object.freeze(result.rows.slice(0, ADMIN_READ_LIMIT).map(project)),
    truncated: result.rows.length > ADMIN_READ_LIMIT,
  });
}

function snapshot<Resource extends AdminReadResource, Item>(
  resource: Resource,
  result: Readonly<{ items: readonly Readonly<Item>[]; truncated: boolean }>,
): Readonly<{
  resource: Resource;
  limit: typeof ADMIN_READ_LIMIT;
  truncated: boolean;
  items: readonly Readonly<Item>[];
}> {
  return Object.freeze({
    resource,
    limit: ADMIN_READ_LIMIT,
    truncated: result.truncated,
    items: result.items,
  });
}

async function loadSnapshot(
  client: AdminReadSqlClient,
  resource: AdminReadResource,
): Promise<AdminReadSnapshot> {
  switch (resource) {
    case "products": {
      const result = await boundedRows<{
        id: string;
        slug: string;
        name: string;
        packageForm: string;
        materialIdentity: string;
        policyGroupId: string;
        policyGroupName: string;
        status: "draft" | "active" | "retired";
        createdAt: Date | string;
        updatedAt: Date | string;
      }, SnapshotItem<"products">>(
        client,
        `
          SELECT p.id::text AS id, p.slug, p.name,
                 p.package_form AS "packageForm",
                 p.material_identity AS "materialIdentity",
                 p.policy_group_id::text AS "policyGroupId",
                 pg.name AS "policyGroupName", p.status,
                 p.created_at AS "createdAt", p.updated_at AS "updatedAt"
          FROM products p
          JOIN product_policy_groups pg ON pg.id = p.policy_group_id
          ORDER BY p.updated_at DESC, p.id DESC
          LIMIT $1
        `,
        (row) => ({
          ...row,
          createdAt: toIso(row.createdAt),
          updatedAt: toIso(row.updatedAt),
        }),
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "products" }>;
    }
    case "prices": {
      const result = await boundedRows<{
        id: string;
        productId: string;
        productName: string;
        version: number | string;
        amountMinor: number | string;
        currency: string;
        effectiveAt: Date | string;
        supersededAt: Date | string | null;
        createdAt: Date | string;
      }, SnapshotItem<"prices">>(
        client,
        `
          SELECT pp.id::text AS id, pp.product_id::text AS "productId",
                 p.name AS "productName", pp.version,
                 pp.amount_minor AS "amountMinor", pp.currency,
                 pp.effective_at AS "effectiveAt", pp.superseded_at AS "supersededAt",
                 pp.created_at AS "createdAt"
          FROM product_prices pp
          JOIN products p ON p.id = pp.product_id
          ORDER BY pp.effective_at DESC, pp.version DESC, pp.id DESC
          LIMIT $1
        `,
        (row) => ({
          ...row,
          version: safeInteger(row.version),
          amountMinor: safeInteger(row.amountMinor),
          effectiveAt: toIso(row.effectiveAt),
          supersededAt: nullableIso(row.supersededAt),
          createdAt: toIso(row.createdAt),
        }),
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "prices" }>;
    }
    case "policy-groups": {
      const result = await boundedRows<{
        id: string;
        slug: string;
        name: string;
        active: boolean;
        createdAt: Date | string;
        updatedAt: Date | string;
      }, SnapshotItem<"policy-groups">>(
        client,
        `
          SELECT id::text AS id, slug, name, active,
                 created_at AS "createdAt", updated_at AS "updatedAt"
          FROM product_policy_groups
          ORDER BY updated_at DESC, id DESC
          LIMIT $1
        `,
        (row) => ({ ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) }),
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "policy-groups" }>;
    }
    case "lots": {
      const result = await boundedRows<{
        id: string;
        productId: string;
        productName: string;
        supplierName: string;
        supplierLotCode: string;
        analyticalMethod: string | null;
        receivedQuantity: number | string;
        availableQuantity: number | string;
        status: "draft" | "quarantined" | "released" | "exhausted" | "recalled";
        manufacturedAt: Date | string | null;
        expiresAt: Date | string | null;
        createdAt: Date | string;
        updatedAt: Date | string;
      }, SnapshotItem<"lots">>(
        client,
        `
          SELECT l.id::text AS id, l.product_id::text AS "productId",
                 p.name AS "productName", l.supplier_name AS "supplierName",
                 l.supplier_lot_code AS "supplierLotCode",
                 l.analytical_method AS "analyticalMethod",
                 l.received_quantity AS "receivedQuantity",
                 l.available_quantity AS "availableQuantity", l.status,
                 l.manufactured_at AS "manufacturedAt", l.expires_at AS "expiresAt",
                 l.created_at AS "createdAt", l.updated_at AS "updatedAt"
          FROM lots l
          JOIN products p ON p.id = l.product_id
          ORDER BY l.updated_at DESC, l.id DESC
          LIMIT $1
        `,
        (row) => ({
          ...row,
          receivedQuantity: safeInteger(row.receivedQuantity),
          availableQuantity: safeInteger(row.availableQuantity),
          manufacturedAt: nullableIso(row.manufacturedAt),
          expiresAt: nullableIso(row.expiresAt),
          createdAt: toIso(row.createdAt),
          updatedAt: toIso(row.updatedAt),
        }),
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "lots" }>;
    }
    case "coas": {
      const result = await boundedRows<{
        id: string;
        lotId: string;
        productId: string;
        supplierLotCode: string;
        evidenceHash: string;
        public: boolean;
        active: boolean;
        issuedAt: Date | string | null;
        createdAt: Date | string;
        rowVersion: string;
      }, SnapshotItem<"coas">>(
        client,
        `
          SELECT c.id::text AS id, c.lot_id::text AS "lotId",
                 l.product_id::text AS "productId",
                 l.supplier_lot_code AS "supplierLotCode",
                 c.evidence_hash AS "evidenceHash", c.public, c.active,
                 c.issued_at AS "issuedAt", c.created_at AS "createdAt",
                 c.xmin::text AS "rowVersion"
          FROM coa_documents c
          JOIN lots l ON l.id = c.lot_id
          ORDER BY c.created_at DESC, c.id DESC
          LIMIT $1
        `,
        (row) => ({
          ...row,
          issuedAt: nullableIso(row.issuedAt),
          createdAt: toIso(row.createdAt),
        }),
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "coas" }>;
    }
    case "analytical-claims": {
      const result = await boundedRows<{
        id: string;
        productId: string;
        productName: string;
        lotId: string;
        supplierLotCode: string;
        coaDocumentId: string;
        evidenceHash: string;
        text: string;
        active: boolean;
        createdAt: Date | string;
        updatedAt: Date | string;
      }, SnapshotItem<"analytical-claims">>(
        client,
        `
          SELECT ac.id::text AS id, ac.product_id::text AS "productId",
                 p.name AS "productName", ac.lot_id::text AS "lotId",
                 l.supplier_lot_code AS "supplierLotCode",
                 ac.coa_document_id::text AS "coaDocumentId",
                 c.evidence_hash AS "evidenceHash", ac.text, ac.active,
                 ac.created_at AS "createdAt", ac.updated_at AS "updatedAt"
          FROM analytical_claims ac
          JOIN products p ON p.id = ac.product_id
          JOIN lots l ON l.id = ac.lot_id
          JOIN coa_documents c ON c.id = ac.coa_document_id
          ORDER BY ac.updated_at DESC, ac.id DESC
          LIMIT $1
        `,
        (row) => ({ ...row, createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) }),
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "analytical-claims" }>;
    }
    case "attestations": {
      const result = await boundedRows<{
        id: string;
        version: number | string;
        contentHash: string;
        policyText: string;
        effectiveAt: Date | string;
        supersededAt: Date | string | null;
        createdAt: Date | string;
      }, SnapshotItem<"attestations">>(
        client,
        `
          SELECT id::text AS id, version, content_hash AS "contentHash",
                 policy_text AS "policyText", effective_at AS "effectiveAt",
                 superseded_at AS "supersededAt", created_at AS "createdAt"
          FROM attestation_versions
          ORDER BY version DESC, id DESC
          LIMIT $1
        `,
        (row) => ({
          ...row,
          version: safeInteger(row.version),
          effectiveAt: toIso(row.effectiveAt),
          supersededAt: nullableIso(row.supersededAt),
          createdAt: toIso(row.createdAt),
        }),
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "attestations" }>;
    }
    case "destination-rules": {
      const result = await boundedRows<{
        id: string;
        scopeKind: "product" | "policy_group";
        productId: string | null;
        policyGroupId: string | null;
        targetLabel: string;
        stateCode: string;
        result: "allowed" | "review" | "blocked";
        version: number | string;
        active: boolean;
        effectiveAt: Date | string;
        supersededAt: Date | string | null;
        createdAt: Date | string;
      }, SnapshotItem<"destination-rules">>(
        client,
        `
          SELECT dp.id::text AS id, dp.scope_kind AS "scopeKind",
                 dp.product_id::text AS "productId",
                 dp.policy_group_id::text AS "policyGroupId",
                 COALESCE(p.name, pg.name) AS "targetLabel",
                 dp.state_code AS "stateCode", dp.result, dp.version, dp.active,
                 dp.effective_at AS "effectiveAt", dp.superseded_at AS "supersededAt",
                 dp.created_at AS "createdAt"
          FROM destination_policies dp
          LEFT JOIN products p ON p.id = dp.product_id
          LEFT JOIN product_policy_groups pg ON pg.id = dp.policy_group_id
          ORDER BY dp.effective_at DESC, dp.version DESC, dp.id DESC
          LIMIT $1
        `,
        (row) => ({
          ...row,
          version: safeInteger(row.version),
          effectiveAt: toIso(row.effectiveAt),
          supersededAt: nullableIso(row.supersededAt),
          createdAt: toIso(row.createdAt),
        }),
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "destination-rules" }>;
    }
    case "promotions": {
      const result = await boundedRows<{
        id: string;
        code: string;
        version: number | string;
        name: string;
        kind: "discount" | "bundle" | "subscription" | "loyalty" | "cross_sell";
        status: "draft" | "active" | "retired";
        amountMinor: number | string | null;
        basisPoints: number | string | null;
        currency: string | null;
        configuration: unknown;
        targets: unknown;
        startsAt: Date | string | null;
        endsAt: Date | string | null;
        createdAt: Date | string;
        updatedAt: Date | string;
      }, SnapshotItem<"promotions">>(
        client,
        `
          SELECT pr.id::text AS id, pr.code, pr.version, pr.name, pr.kind, pr.status,
                 pr.amount_minor AS "amountMinor", pr.basis_points AS "basisPoints",
                 pr.currency, pr.configuration,
                 COALESCE((
                   SELECT jsonb_agg(
                     jsonb_build_object(
                       'kind', target_rows.target_kind,
                       'id', target_rows.target_id
                     ) ORDER BY target_rows.target_kind, target_rows.target_id
                   )
                   FROM (
                     SELECT pt.target_kind,
                            COALESCE(pt.product_id, pt.policy_group_id)::text AS target_id
                     FROM promotion_targets pt
                     WHERE pt.promotion_id = pr.id
                   ) target_rows
                 ), '[]'::jsonb) AS targets,
                 pr.starts_at AS "startsAt", pr.ends_at AS "endsAt",
                 pr.created_at AS "createdAt", pr.updated_at AS "updatedAt"
          FROM promotions pr
          ORDER BY pr.updated_at DESC, pr.id DESC
          LIMIT $1
        `,
        (row) => ({
          ...row,
          version: safeInteger(row.version),
          amountMinor: nullableSafeInteger(row.amountMinor),
          basisPoints: nullableSafeInteger(row.basisPoints),
          configuration: safePromotionConfiguration(row.kind, row.configuration),
          targets: promotionTargets(row.targets),
          startsAt: nullableIso(row.startsAt),
          endsAt: nullableIso(row.endsAt),
          createdAt: toIso(row.createdAt),
          updatedAt: toIso(row.updatedAt),
        }),
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "promotions" }>;
    }
    case "buyers": {
      const result = await boundedRows<{
        userId: string;
        status: "active" | "review" | "blocked";
        emailVerifiedAt: Date | string | null;
        ageConfirmedAt: Date | string | null;
        researchPurpose: "in_vitro" | "analytical" | "educational" | "other_laboratory" | null;
        organizationName: string | null;
        createdAt: Date | string;
        updatedAt: Date | string;
      }, SnapshotItem<"buyers">>(
        client,
        `
          SELECT bp.user_id::text AS "userId", bp.status,
                 u.email_verified_at AS "emailVerifiedAt",
                 bp.age_confirmed_at AS "ageConfirmedAt",
                 bp.research_purpose AS "researchPurpose",
                 bp.organization_name AS "organizationName",
                 bp.created_at AS "createdAt", bp.updated_at AS "updatedAt"
          FROM buyer_profiles bp
          JOIN users u ON u.id = bp.user_id
          ORDER BY bp.updated_at DESC, bp.user_id DESC
          LIMIT $1
        `,
        (row) => ({
          ...row,
          emailVerifiedAt: nullableIso(row.emailVerifiedAt),
          ageConfirmedAt: nullableIso(row.ageConfirmedAt),
          createdAt: toIso(row.createdAt),
          updatedAt: toIso(row.updatedAt),
        }),
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "buyers" }>;
    }
    case "review-requests": {
      const result = await boundedRows<{
        id: string;
        userId: string;
        orderId: string;
        snapshotHash: string;
        buyerStatusSnapshot: "active" | "review" | "blocked";
        attestationVersionId: string;
        attestationVersion: number | string;
        destinationStateCode: string;
        buyerReviewRequired: boolean;
        destinationReviewRequired: boolean;
        outcome: "approved" | "rejected" | null;
        decidedByUserId: string | null;
        decidedAt: Date | string | null;
        coversBuyerReview: boolean | null;
        createdAt: Date | string;
      }, SnapshotItem<"review-requests">>(
        client,
        `
          SELECT rr.id::text AS id, rr.user_id::text AS "userId",
                 rr.order_id::text AS "orderId", rr.snapshot_hash AS "snapshotHash",
                 rr.buyer_status_snapshot AS "buyerStatusSnapshot",
                 rr.attestation_version_id::text AS "attestationVersionId",
                 av.version AS "attestationVersion",
                 rr.destination_state_code AS "destinationStateCode",
                 rr.buyer_review_required AS "buyerReviewRequired",
                 rr.destination_review_required AS "destinationReviewRequired",
                 rr.outcome, rr.decided_by_user_id::text AS "decidedByUserId",
                 rr.decided_at AS "decidedAt", rr.covers_buyer_review AS "coversBuyerReview",
                 rr.created_at AS "createdAt"
          FROM review_requests rr
          JOIN attestation_versions av ON av.id = rr.attestation_version_id
          ORDER BY rr.created_at DESC, rr.id DESC
          LIMIT $1
        `,
        (row) => ({
          ...row,
          attestationVersion: safeInteger(row.attestationVersion),
          decidedAt: nullableIso(row.decidedAt),
          createdAt: toIso(row.createdAt),
        }),
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "review-requests" }>;
    }
    case "orders": {
      const result = await boundedRows<{
        id: string;
        buyerUserId: string;
        buyerStatusSnapshot: "active" | "review" | "blocked";
        attestationAcceptanceId: string;
        attestationVersion: number | string;
        destinationStateCode: string;
        currency: string;
        subtotalMinor: number | string;
        discountMinor: number | string;
        taxMinor: number | string;
        shippingMinor: number | string;
        totalMinor: number | string;
        state: string;
        itemCount: number | string;
        verifiedPaymentEventCount: number | string;
        currentReleaseState: "issued" | "revoked" | "expired" | "consumed" | null;
        createdAt: Date | string;
        updatedAt: Date | string;
      }, SnapshotItem<"orders">>(
        client,
        `
          SELECT o.id::text AS id, o.buyer_user_id::text AS "buyerUserId",
                 o.buyer_status_snapshot AS "buyerStatusSnapshot",
                 o.attestation_acceptance_id::text AS "attestationAcceptanceId",
                 av.version AS "attestationVersion",
                 o.destination_state_code AS "destinationStateCode", o.currency,
                 o.subtotal_minor AS "subtotalMinor", o.discount_minor AS "discountMinor",
                 o.tax_minor AS "taxMinor", o.shipping_minor AS "shippingMinor",
                 o.total_minor AS "totalMinor", o.state,
                 (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id) AS "itemCount",
                 (SELECT count(*) FROM payment_events pe
                   WHERE pe.order_id = o.id AND pe.event_type = 'payment_verified')
                   AS "verifiedPaymentEventCount",
                 (SELECT fr.state FROM fulfillment_releases fr
                   WHERE fr.order_id = o.id ORDER BY fr.version DESC LIMIT 1)
                   AS "currentReleaseState",
                 o.created_at AS "createdAt", o.updated_at AS "updatedAt"
          FROM orders o
          JOIN attestation_acceptances aa ON aa.id = o.attestation_acceptance_id
          JOIN attestation_versions av ON av.id = aa.attestation_version_id
          ORDER BY o.updated_at DESC, o.id DESC
          LIMIT $1
        `,
        (row) => ({
          ...row,
          attestationVersion: safeInteger(row.attestationVersion),
          subtotalMinor: safeInteger(row.subtotalMinor),
          discountMinor: safeInteger(row.discountMinor),
          taxMinor: safeInteger(row.taxMinor),
          shippingMinor: safeInteger(row.shippingMinor),
          totalMinor: safeInteger(row.totalMinor),
          itemCount: safeInteger(row.itemCount),
          verifiedPaymentEventCount: safeInteger(row.verifiedPaymentEventCount),
          providerExecutionBoundary: "task6_managed" as const,
          createdAt: toIso(row.createdAt),
          updatedAt: toIso(row.updatedAt),
        }),
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "orders" }>;
    }
    case "refunds": {
      const result = await boundedRows<{
        id: string;
        orderId: string;
        requestedByUserId: string;
        verifiedPaymentEventId: string;
        provider: string;
        requestedAmountMinor: number | string;
        confirmedAmountMinor: number | string | null;
        currency: string;
        status: "requested" | "submitted" | "succeeded" | "failed" | "cancelled";
        reasonRedacted: string | null;
        requestedAt: Date | string;
        confirmedAt: Date | string | null;
        providerRefundRecorded: boolean;
      }, SnapshotItem<"refunds">>(
        client,
        `
          SELECT r.id::text AS id, r.order_id::text AS "orderId",
                 r.requested_by_user_id::text AS "requestedByUserId",
                 r.verified_payment_event_id::text AS "verifiedPaymentEventId",
                 r.provider, r.requested_amount_minor AS "requestedAmountMinor",
                 r.confirmed_amount_minor AS "confirmedAmountMinor", r.currency, r.status,
                 r.reason_redacted AS "reasonRedacted", r.requested_at AS "requestedAt",
                 r.confirmed_at AS "confirmedAt",
                 (r.provider_refund_id IS NOT NULL) AS "providerRefundRecorded"
          FROM refunds r
          ORDER BY r.requested_at DESC, r.id DESC
          LIMIT $1
        `,
        (row) => ({
          ...row,
          requestedAmountMinor: safeInteger(row.requestedAmountMinor),
          confirmedAmountMinor: nullableSafeInteger(row.confirmedAmountMinor),
          requestedAt: toIso(row.requestedAt),
          confirmedAt: nullableIso(row.confirmedAt),
          providerExecutionBoundary: "task6_managed" as const,
        }),
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "refunds" }>;
    }
    case "shipments": {
      const result = await boundedRows<{
        id: string;
        orderId: string;
        fulfillmentReleaseId: string | null;
        releaseState: "issued" | "revoked" | "expired" | "consumed" | null;
        releaseVersion: number | string | null;
        releaseExpiresAt: Date | string | null;
        carrier: string;
        trackingReference: string;
        state: "pending" | "handed_off" | "delivered" | "exception";
        handedOffAt: Date | string | null;
        deliveredAt: Date | string | null;
        createdAt: Date | string;
        updatedAt: Date | string;
      }, SnapshotItem<"shipments">>(
        client,
        `
          SELECT s.id::text AS id, s.order_id::text AS "orderId",
                 s.fulfillment_release_id::text AS "fulfillmentReleaseId",
                 fr.state AS "releaseState", fr.version AS "releaseVersion",
                 fr.expires_at AS "releaseExpiresAt", s.carrier,
                 s.tracking_reference AS "trackingReference", s.state,
                 s.handed_off_at AS "handedOffAt", s.delivered_at AS "deliveredAt",
                 s.created_at AS "createdAt", s.updated_at AS "updatedAt"
          FROM shipments s
          LEFT JOIN fulfillment_releases fr ON fr.id = s.fulfillment_release_id
          ORDER BY s.updated_at DESC, s.id DESC
          LIMIT $1
        `,
        (row) => ({
          ...row,
          releaseVersion:
            row.releaseVersion === null ? null : safeInteger(row.releaseVersion),
          releaseExpiresAt: nullableIso(row.releaseExpiresAt),
          handedOffAt: nullableIso(row.handedOffAt),
          deliveredAt: nullableIso(row.deliveredAt),
          createdAt: toIso(row.createdAt),
          updatedAt: toIso(row.updatedAt),
          handoffConfirmationBoundary: "task6_managed" as const,
        }),
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "shipments" }>;
    }
    case "staff": {
      const result = await boundedRows<{
        roleId: string;
        userId: string;
        capability: string | null;
        recognizedCapability: boolean;
        active: boolean;
        grantedByUserId: string | null;
        grantedAt: Date | string;
        revokedByUserId: string | null;
        revokedAt: Date | string | null;
      }, SnapshotItem<"staff">>(
        client,
        `
          SELECT sr.id::text AS "roleId", sr.user_id::text AS "userId",
                 CASE WHEN sr.capability IN (
                   'review:decide', 'catalog:publish', 'destination:manage',
                   'promotion:manage', 'order:read:any', 'payment:reconcile',
                   'refund:request', 'fulfillment:release:consume', 'staff:manage'
                 ) THEN sr.capability ELSE NULL END AS capability,
                 (sr.capability IN (
                   'review:decide', 'catalog:publish', 'destination:manage',
                   'promotion:manage', 'order:read:any', 'payment:reconcile',
                   'refund:request', 'fulfillment:release:consume', 'staff:manage'
                 )) AS "recognizedCapability",
                 (sr.revoked_at IS NULL) AS active,
                 sr.granted_by_user_id::text AS "grantedByUserId",
                 sr.granted_at AS "grantedAt",
                 sr.revoked_by_user_id::text AS "revokedByUserId",
                 sr.revoked_at AS "revokedAt"
          FROM staff_roles sr
          ORDER BY sr.granted_at DESC, sr.id DESC
          LIMIT $1
        `,
        (row) => ({
          ...row,
          grantedAt: toIso(row.grantedAt),
          revokedAt: nullableIso(row.revokedAt),
        }),
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "staff" }>;
    }
    case "audit": {
      const result = await boundedRows<{
        id: string;
        actorKind: "user" | "service";
        actorUserId: string | null;
        action: string;
        resourceType: string;
        resourceId: string;
        correlationId: string;
        occurredAt: Date | string;
      }, SnapshotItem<"audit">>(
        client,
        `
          SELECT a.id::text AS id,
                 CASE WHEN a.actor_user_id IS NULL THEN 'service' ELSE 'user' END AS "actorKind",
                 a.actor_user_id::text AS "actorUserId", a.action,
                 a.resource_type AS "resourceType", a.resource_id AS "resourceId",
                 a.correlation_id AS "correlationId", a.occurred_at AS "occurredAt"
          FROM admin_audit a
          ORDER BY a.occurred_at DESC, a.id DESC
          LIMIT $1
        `,
        (row) => ({ ...row, occurredAt: toIso(row.occurredAt) }),
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "audit" }>;
    }
  }
}

export function createPostgresAdminReadRepository(
  runTransaction: AdminReadTransactionRunner,
): AdminReadRepository {
  return Object.freeze({
    async readSnapshot<Resource extends AdminReadResource>(
      request: AdminReadRequest<Resource>,
    ): Promise<AdminReadSnapshotFor<Resource>> {
      if (
        !isVerifiedIdentityAt(request.identity, request.now) ||
        !request.identity.mfaConfigured ||
        !request.identity.secondFactorCompleted
      ) {
        throw new Error("A current verified staff identity and MFA are required");
      }
      return runTransaction(
        async (client) => {
          await client.query("SET TRANSACTION READ ONLY");
          await assertPersistedAuthority(client, request);
          return loadSnapshot(client, request.resource) as Promise<AdminReadSnapshotFor<Resource>>;
        },
        { isolationLevel: "serializable", readOnly: true },
      );
    },
  });
}
