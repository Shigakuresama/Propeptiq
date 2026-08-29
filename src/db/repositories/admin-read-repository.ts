import {
  MANUAL_REWARD_ADJUSTMENT_MAX_ABS_POINTS_V1,
} from "@/admin/admin-service";
import {
  ADMIN_READ_LIMIT,
  requiredAdminReadCapability,
  type AdminReadResource,
  type AdminReadSnapshot,
  type AdminReadSnapshotFor,
  type SafePromotionConfiguration,
} from "@/admin/admin-read";
import { isVerifiedIdentityAt, type VerifiedIdentity } from "@/auth/identity";
import { parseAffiliatePolicy } from "@/domain/affiliates";
import { parseReferralPolicy } from "@/domain/referrals";
import { parseLoyaltyPolicy } from "@/domain/rewards";
import { scanPublicCopy } from "@/domain/content-policy";

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
const referralCodePattern = /^ref_[A-Za-z0-9_-]{16,64}$/u;
const sharedSetCodePattern = /^set_[A-Za-z0-9_-]{16,64}$/u;
const affiliateCodePattern = /^aff_[A-Za-z0-9_-]{16,64}$/u;
const affiliateHandlePattern = /^@[A-Za-z0-9_][A-Za-z0-9._-]{1,63}$/u;
const controlCharacterPattern = /[\u0000-\u001f\u007f-\u009f]/u;
const recentRewardAdjustmentLimit = 20;
const affiliatePublicChannelMaxLength = 200;
const affiliateChannelReadPolicy = Object.freeze({
  version: "affiliate-channel-read-validation",
  activeLotEvidenceIds: Object.freeze([]) as readonly string[],
});

function safeAffiliatePublicChannel(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > affiliatePublicChannelMaxLength ||
    value.trim() !== value ||
    controlCharacterPattern.test(value)
  ) {
    throw new Error("Invalid affiliate application admin projection");
  }
  let canonical = affiliateHandlePattern.test(value);
  if (!canonical) {
    try {
      const parsed = new URL(value);
      canonical =
        parsed.protocol === "https:" &&
        parsed.username.length === 0 &&
        parsed.password.length === 0 &&
        parsed.hostname.length > 0 &&
        parsed.search.length === 0 &&
        parsed.hash.length === 0 &&
        parsed.toString() === value;
    } catch {
      canonical = false;
    }
  }
  if (
    !canonical ||
    !scanPublicCopy(
      { text: value, claims: [] },
      affiliateChannelReadPolicy,
    ).publishable
  ) {
    throw new Error("Invalid affiliate application admin projection");
  }
  return value;
}

function coherentAffiliateApplicationState(status: unknown, version: number): boolean {
  return (
    (status === "pending" && version === 1) ||
    ((status === "active" || status === "rejected") && version === 2) ||
    (status === "suspended" && version === 3)
  );
}

function safePublicLabel(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    [...value].length > 120 ||
    controlCharacterPattern.test(value)
  ) {
    throw new Error("Invalid shared set admin projection");
  }
  return value;
}

function recentRewardAdjustments(raw: unknown): SnapshotItem<"reward-adjustments">["recentAdjustments"] {
  const value = normalizeJson(raw);
  if (!Array.isArray(value) || value.length > recentRewardAdjustmentLimit) {
    throw new Error("Invalid reward adjustment admin projection");
  }
  return Object.freeze(value.map((candidate) => {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, ["adjustmentId", "delta", "occurredAt"]) ||
      typeof candidate.adjustmentId !== "string" ||
      !uuidPattern.test(candidate.adjustmentId) ||
      (typeof candidate.delta !== "number" && typeof candidate.delta !== "string") ||
      (typeof candidate.occurredAt !== "string" && !(candidate.occurredAt instanceof Date))
    ) {
      throw new Error("Invalid reward adjustment admin projection");
    }
    const delta = safeInteger(candidate.delta);
    if (delta === 0 || Math.abs(delta) > MANUAL_REWARD_ADJUSTMENT_MAX_ABS_POINTS_V1) {
      throw new Error("Invalid reward adjustment admin projection");
    }
    return Object.freeze({
      adjustmentId: candidate.adjustmentId,
      delta,
      occurredAt: toIso(candidate.occurredAt),
    });
  }));
}

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

type GrowthLifecycleRow = {
  id: string;
  version: number | string;
  status: "draft" | "active" | "superseded";
  effectiveAt: Date | string;
  retiredAt: Date | string | null;
};

function growthLifecycle(row: GrowthLifecycleRow) {
  return {
    id: row.id,
    version: safeInteger(row.version),
    status: row.status === "superseded" ? "retired" as const : row.status,
    effectiveAt: toIso(row.effectiveAt),
    retiredAt: nullableIso(row.retiredAt),
  };
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
    case "loyalty-policies": {
      const result = await boundedRows<GrowthLifecycleRow & {
        pointsPerDollar: number | string;
        redemptionMinorPerPoint: number | string;
        minimumRedemptionPoints: number | string;
        maximumRedemptionBasisPoints: number | string;
        expiresAfterDays: number | string | null;
      }, SnapshotItem<"loyalty-policies">>(
        client,
        `
          SELECT id::text AS id, version, status,
                 effective_at AS "effectiveAt", superseded_at AS "retiredAt",
                 points_per_dollar AS "pointsPerDollar",
                 redemption_minor_per_point AS "redemptionMinorPerPoint",
                 minimum_redemption_points AS "minimumRedemptionPoints",
                 maximum_redemption_basis_points AS "maximumRedemptionBasisPoints",
                 expires_after_days AS "expiresAfterDays"
          FROM loyalty_policies
          ORDER BY version DESC, id DESC
          LIMIT $1
        `,
        (row) => {
          const lifecycle = growthLifecycle(row);
          const economics = {
            pointsPerDollar: safeInteger(row.pointsPerDollar),
            redemptionMinorPerPoint: safeInteger(row.redemptionMinorPerPoint),
            minimumRedemptionPoints: safeInteger(row.minimumRedemptionPoints),
            maximumRedemptionBasisPoints: safeInteger(row.maximumRedemptionBasisPoints),
            expiresAfterDays: row.expiresAfterDays,
          };
          const parsed = parseLoyaltyPolicy({
            id: lifecycle.id,
            version: lifecycle.version,
            status: lifecycle.status,
            effectiveAt: lifecycle.effectiveAt,
            ...economics,
            supersededAt: lifecycle.retiredAt,
          });
          if (!parsed.ok) throw new Error("Invalid loyalty policy admin projection");
          return { ...lifecycle, ...economics, expiresAfterDays: null };
        },
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "loyalty-policies" }>;
    }
    case "referral-policies": {
      const result = await boundedRows<GrowthLifecycleRow & {
        attributionDays: number | string;
        referredDiscountBasisPoints: number | string;
        referredDiscountCapMinor: number | string;
        referrerPointsPerDollar: number | string;
        referrerRewardCapPoints: number | string;
      }, SnapshotItem<"referral-policies">>(
        client,
        `
          SELECT id::text AS id, version, status,
                 effective_at AS "effectiveAt", superseded_at AS "retiredAt",
                 attribution_days AS "attributionDays",
                 referred_discount_basis_points AS "referredDiscountBasisPoints",
                 referred_discount_cap_minor AS "referredDiscountCapMinor",
                 referrer_points_per_dollar AS "referrerPointsPerDollar",
                 referrer_reward_cap_points AS "referrerRewardCapPoints"
          FROM referral_policies
          ORDER BY version DESC, id DESC
          LIMIT $1
        `,
        (row) => {
          const lifecycle = growthLifecycle(row);
          const economics = {
            attributionDays: safeInteger(row.attributionDays),
            referredDiscountBasisPoints: safeInteger(row.referredDiscountBasisPoints),
            referredDiscountCapMinor: safeInteger(row.referredDiscountCapMinor),
            referrerPointsPerDollar: safeInteger(row.referrerPointsPerDollar),
            referrerRewardCapPoints: safeInteger(row.referrerRewardCapPoints),
          };
          const parsed = parseReferralPolicy({
            id: lifecycle.id,
            version: lifecycle.version,
            status: lifecycle.status,
            effectiveAt: lifecycle.effectiveAt,
            ...economics,
            supersededAt: lifecycle.retiredAt,
          });
          if (!parsed.ok) throw new Error("Invalid referral policy admin projection");
          return { ...lifecycle, ...economics };
        },
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "referral-policies" }>;
    }
    case "affiliate-policies": {
      const result = await boundedRows<GrowthLifecycleRow & {
        attributionDays: number | string;
        firstOrderCommissionBasisPoints: number | string;
        reorderCommissionBasisPoints: number | string;
        reorderWindowDays: number | string;
        approvalDelayDays: number | string;
        payoutThresholdMinor: number | string;
        currency: string;
      }, SnapshotItem<"affiliate-policies">>(
        client,
        `
          SELECT id::text AS id, version, status,
                 effective_at AS "effectiveAt", superseded_at AS "retiredAt",
                 attribution_days AS "attributionDays",
                 first_order_commission_basis_points AS "firstOrderCommissionBasisPoints",
                 reorder_commission_basis_points AS "reorderCommissionBasisPoints",
                 reorder_window_days AS "reorderWindowDays",
                 approval_delay_days AS "approvalDelayDays",
                 payout_threshold_minor AS "payoutThresholdMinor", currency
          FROM affiliate_policies
          ORDER BY version DESC, id DESC
          LIMIT $1
        `,
        (row) => {
          const lifecycle = growthLifecycle(row);
          const economics = {
            attributionDays: safeInteger(row.attributionDays),
            firstOrderCommissionBasisPoints: safeInteger(row.firstOrderCommissionBasisPoints),
            reorderCommissionBasisPoints: safeInteger(row.reorderCommissionBasisPoints),
            reorderWindowDays: safeInteger(row.reorderWindowDays),
            approvalDelayDays: safeInteger(row.approvalDelayDays),
            payoutThresholdMinor: safeInteger(row.payoutThresholdMinor),
            currency: row.currency,
          };
          const parsed = parseAffiliatePolicy({
            id: lifecycle.id,
            version: lifecycle.version,
            status: lifecycle.status,
            effectiveAt: lifecycle.effectiveAt,
            ...economics,
            supersededAt: lifecycle.retiredAt,
          });
          if (!parsed.ok) throw new Error("Invalid affiliate policy admin projection");
          return { ...lifecycle, ...economics, currency: "USD" };
        },
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "affiliate-policies" }>;
    }
    case "reward-adjustments": {
      const result = await boundedRows<{
        rewardAccountId: string;
        pendingPoints: number | string;
        availablePoints: number | string;
        recentAdjustments: unknown;
      }, SnapshotItem<"reward-adjustments">>(
        client,
        `
          SELECT ra.id::text AS "rewardAccountId",
                 ra.pending_points AS "pendingPoints",
                 ra.available_points AS "availablePoints",
                 COALESCE((
                   SELECT jsonb_agg(
                     jsonb_build_object(
                       'adjustmentId', recent.id::text,
                       'delta', recent.available_points_delta,
                       'occurredAt', recent.occurred_at
                     ) ORDER BY recent.occurred_at DESC, recent.id DESC
                   )
                   FROM (
                     SELECT id, available_points_delta, occurred_at
                     FROM reward_ledger_entries
                     WHERE reward_account_id = ra.id
                       AND kind = 'admin_adjustment'
                       AND source_type = 'admin_adjustment'
                     ORDER BY occurred_at DESC, id DESC
                     LIMIT ${recentRewardAdjustmentLimit}
                   ) recent
                 ), '[]'::jsonb) AS "recentAdjustments"
          FROM reward_accounts ra
          ORDER BY ra.updated_at DESC, ra.id DESC
          LIMIT $1
        `,
        (row) => {
          if (!uuidPattern.test(row.rewardAccountId)) {
            throw new Error("Invalid reward adjustment admin projection");
          }
          return Object.freeze({
            rewardAccountId: row.rewardAccountId,
            pendingPoints: safeInteger(row.pendingPoints),
            availablePoints: safeInteger(row.availablePoints),
            recentAdjustments: recentRewardAdjustments(row.recentAdjustments),
          });
        },
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "reward-adjustments" }>;
    }
    case "referral-codes": {
      const result = await boundedRows<{
        referralCodeId: string;
        code: string;
        status: "active" | "revoked";
        createdAt: Date | string;
        revokedAt: Date | string | null;
      }, SnapshotItem<"referral-codes">>(
        client,
        `
          SELECT id::text AS "referralCodeId", code, status,
                 created_at AS "createdAt", revoked_at AS "revokedAt"
          FROM referral_codes
          ORDER BY created_at DESC, id DESC
          LIMIT $1
        `,
        (row) => {
          const createdAt = toIso(row.createdAt);
          const revokedAt = nullableIso(row.revokedAt);
          if (
            !uuidPattern.test(row.referralCodeId) ||
            !referralCodePattern.test(row.code) ||
            (row.status !== "active" && row.status !== "revoked") ||
            (row.status === "active") !== (revokedAt === null) ||
            (revokedAt !== null && new Date(revokedAt).getTime() < new Date(createdAt).getTime())
          ) {
            throw new Error("Invalid referral code admin projection");
          }
          return Object.freeze({
            referralCodeId: row.referralCodeId,
            code: row.code,
            status: row.status,
            createdAt,
            revokedAt,
          });
        },
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "referral-codes" }>;
    }
    case "shared-sets": {
      const result = await boundedRows<{
        sharedSetId: string;
        publicCode: string;
        label: string;
        active: boolean;
        itemCount: number | string;
        createdAt: Date | string;
        updatedAt: Date | string;
        deactivatedAt: Date | string | null;
      }, SnapshotItem<"shared-sets">>(
        client,
        `
          SELECT s.id::text AS "sharedSetId", s.public_code AS "publicCode",
                 s.label, s.active,
                 (SELECT count(*) FROM shared_research_set_items i
                  WHERE i.shared_set_id = s.id) AS "itemCount",
                 s.created_at AS "createdAt", s.updated_at AS "updatedAt",
                 s.deactivated_at AS "deactivatedAt"
          FROM shared_research_sets s
          ORDER BY s.updated_at DESC, s.id DESC
          LIMIT $1
        `,
        (row) => {
          const itemCount = safeInteger(row.itemCount);
          const createdAt = toIso(row.createdAt);
          const updatedAt = toIso(row.updatedAt);
          const deactivatedAt = nullableIso(row.deactivatedAt);
          if (
            !uuidPattern.test(row.sharedSetId) ||
            !sharedSetCodePattern.test(row.publicCode) ||
            typeof row.active !== "boolean" ||
            itemCount < 2 ||
            itemCount > 8 ||
            new Date(updatedAt).getTime() < new Date(createdAt).getTime() ||
            row.active !== (deactivatedAt === null) ||
            (deactivatedAt !== null && deactivatedAt !== updatedAt)
          ) {
            throw new Error("Invalid shared set admin projection");
          }
          return Object.freeze({
            sharedSetId: row.sharedSetId,
            publicCode: row.publicCode,
            label: safePublicLabel(row.label),
            active: row.active,
            itemCount,
            createdAt,
            updatedAt,
            deactivatedAt,
          });
        },
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "shared-sets" }>;
    }
    case "affiliate-applications": {
      const result = await boundedRows<{
        affiliateProfileId: string;
        publicCode: string;
        status: "pending" | "active" | "rejected" | "suspended";
        version: number | string;
        publicChannel: string;
        promotionMethod: "website" | "social" | "email" | "other";
        createdAt: Date | string;
        updatedAt: Date | string;
      }, SnapshotItem<"affiliate-applications">>(
        client,
        `
          SELECT id::text AS "affiliateProfileId", public_code AS "publicCode",
                 status, version, public_channel AS "publicChannel",
                 promotion_method AS "promotionMethod",
                 created_at AS "createdAt", updated_at AS "updatedAt"
          FROM affiliate_profiles
          ORDER BY updated_at DESC, id DESC
          LIMIT $1
        `,
        (row) => {
          const version = safeInteger(row.version);
          const createdAt = toIso(row.createdAt);
          const updatedAt = toIso(row.updatedAt);
          if (
            !uuidPattern.test(row.affiliateProfileId) ||
            !affiliateCodePattern.test(row.publicCode) ||
            !coherentAffiliateApplicationState(row.status, version) ||
            (row.promotionMethod !== "website" &&
              row.promotionMethod !== "social" &&
              row.promotionMethod !== "email" &&
              row.promotionMethod !== "other") ||
            new Date(updatedAt).getTime() < new Date(createdAt).getTime()
          ) {
            throw new Error("Invalid affiliate application admin projection");
          }
          return Object.freeze({
            affiliateProfileId: row.affiliateProfileId,
            publicCode: row.publicCode,
            status: row.status,
            version,
            publicChannel: safeAffiliatePublicChannel(row.publicChannel),
            promotionMethod: row.promotionMethod,
            createdAt,
            updatedAt,
          });
        },
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "affiliate-applications" }>;
    }
    case "referral-conversions": {
      const result = await boundedRows<{
        conversionId: string;
        referralPolicyVersion: number | string;
        referredDiscountMinor: number | string;
        referrerRewardPoints: number | string;
        status: "pending" | "qualified" | "reversed";
        createdAt: Date | string;
        qualifiedAt: Date | string | null;
        reversedAt: Date | string | null;
      }, SnapshotItem<"referral-conversions">>(
        client,
        `
          SELECT id::text AS "conversionId",
                 referral_policy_version AS "referralPolicyVersion",
                 referred_discount_minor AS "referredDiscountMinor",
                 referrer_reward_points AS "referrerRewardPoints",
                 status, created_at AS "createdAt",
                 qualified_at AS "qualifiedAt", reversed_at AS "reversedAt"
          FROM referral_conversions
          ORDER BY created_at DESC, id DESC
          LIMIT $1
        `,
        (row) => {
          const referralPolicyVersion = safeInteger(row.referralPolicyVersion);
          const referredDiscountMinor = safeInteger(row.referredDiscountMinor);
          const referrerRewardPoints = safeInteger(row.referrerRewardPoints);
          const createdAt = toIso(row.createdAt);
          const qualifiedAt = nullableIso(row.qualifiedAt);
          const reversedAt = nullableIso(row.reversedAt);
          const createdTime = new Date(createdAt).getTime();
          const qualifiedTime = qualifiedAt === null ? null : new Date(qualifiedAt).getTime();
          const reversedTime = reversedAt === null ? null : new Date(reversedAt).getTime();
          const coherentState =
            (row.status === "pending" && qualifiedAt === null && reversedAt === null) ||
            (row.status === "qualified" && qualifiedAt !== null && reversedAt === null) ||
            (row.status === "reversed" && reversedAt !== null);
          if (
            !uuidPattern.test(row.conversionId) ||
            referralPolicyVersion < 1 ||
            referredDiscountMinor < 0 ||
            referrerRewardPoints < 0 ||
            !coherentState ||
            (qualifiedTime !== null && qualifiedTime < createdTime) ||
            (reversedTime !== null && reversedTime < createdTime) ||
            (qualifiedTime !== null && reversedTime !== null && reversedTime < qualifiedTime)
          ) {
            throw new Error("Invalid referral conversion admin projection");
          }
          return Object.freeze({
            conversionId: row.conversionId,
            referralPolicyVersion,
            referredDiscountMinor,
            referrerRewardPoints,
            status: row.status,
            createdAt,
            qualifiedAt,
            reversedAt,
          });
        },
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "referral-conversions" }>;
    }
    case "commissions": {
      const result = await boundedRows<{
        commissionId: string;
        affiliateProfileId: string;
        affiliatePolicyVersion: number | string;
        grossCommissionMinor: number | string;
        reversedCommissionMinor: number | string;
        status: "pending" | "approved" | "paid" | "reversed";
        approvalEligibleAt: Date | string | null;
        payoutId: string | null;
        createdAt: Date | string;
        updatedAt: Date | string;
      }, SnapshotItem<"commissions">>(
        client,
        `
          SELECT id::text AS "commissionId",
                 affiliate_profile_id::text AS "affiliateProfileId",
                 affiliate_policy_version AS "affiliatePolicyVersion",
                 gross_commission_minor AS "grossCommissionMinor",
                 reversed_commission_minor AS "reversedCommissionMinor",
                 status, approval_eligible_at AS "approvalEligibleAt",
                 payout_id::text AS "payoutId", created_at AS "createdAt",
                 updated_at AS "updatedAt"
          FROM affiliate_commissions
          ORDER BY updated_at DESC, id DESC
          LIMIT $1
        `,
        (row) => {
          const affiliatePolicyVersion = safeInteger(row.affiliatePolicyVersion);
          const grossCommissionMinor = safeInteger(row.grossCommissionMinor);
          const reversedCommissionMinor = safeInteger(row.reversedCommissionMinor);
          const netCommissionMinor = grossCommissionMinor - reversedCommissionMinor;
          const createdAt = toIso(row.createdAt);
          const updatedAt = toIso(row.updatedAt);
          const approvalEligibleAt = nullableIso(row.approvalEligibleAt);
          const payoutCoherent =
            ((row.status === "pending" || row.status === "reversed") && row.payoutId === null) ||
            row.status === "approved" ||
            (row.status === "paid" && row.payoutId !== null);
          if (
            !uuidPattern.test(row.commissionId) ||
            !uuidPattern.test(row.affiliateProfileId) ||
            affiliatePolicyVersion < 1 ||
            grossCommissionMinor < 1 ||
            reversedCommissionMinor < 0 ||
            reversedCommissionMinor > grossCommissionMinor ||
            !Number.isSafeInteger(netCommissionMinor) ||
            (row.status !== "pending" && row.status !== "approved" &&
              row.status !== "paid" && row.status !== "reversed") ||
            !payoutCoherent ||
            (row.payoutId !== null && !uuidPattern.test(row.payoutId)) ||
            new Date(updatedAt).getTime() < new Date(createdAt).getTime() ||
            (approvalEligibleAt !== null &&
              new Date(approvalEligibleAt).getTime() <= new Date(createdAt).getTime())
          ) {
            throw new Error("Invalid affiliate commission admin projection");
          }
          return Object.freeze({
            commissionId: row.commissionId,
            affiliateProfileId: row.affiliateProfileId,
            affiliatePolicyVersion,
            grossCommissionMinor,
            reversedCommissionMinor,
            netCommissionMinor,
            status: row.status,
            approvalEligibleAt,
            payoutId: row.payoutId,
            createdAt,
            updatedAt,
          });
        },
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "commissions" }>;
    }
    case "payouts": {
      const result = await boundedRows<{
        payoutId: string;
        affiliateProfileId: string;
        affiliatePolicyVersion: number | string;
        amountMinor: number | string;
        currency: string;
        state: "pending" | "paid" | "cancelled";
        version: number | string;
        commissionCount: number | string;
        externalEvidenceRecorded: boolean;
        createdAt: Date | string;
        paidAt: Date | string | null;
      }, SnapshotItem<"payouts">>(
        client,
        `
          SELECT p.id::text AS "payoutId",
                 p.affiliate_profile_id::text AS "affiliateProfileId",
                 p.affiliate_policy_version AS "affiliatePolicyVersion",
                 p.amount_minor AS "amountMinor", p.currency, p.state, p.version,
                 (SELECT count(*) FROM affiliate_payout_commissions pc
                  WHERE pc.payout_id = p.id) AS "commissionCount",
                 (p.external_provider IS NOT NULL AND p.external_reference IS NOT NULL)
                   AS "externalEvidenceRecorded",
                 p.created_at AS "createdAt", p.paid_at AS "paidAt"
          FROM affiliate_payouts p
          ORDER BY p.created_at DESC, p.id DESC
          LIMIT $1
        `,
        (row) => {
          const affiliatePolicyVersion = safeInteger(row.affiliatePolicyVersion);
          const amountMinor = safeInteger(row.amountMinor);
          const version = safeInteger(row.version);
          const commissionCount = safeInteger(row.commissionCount);
          const createdAt = toIso(row.createdAt);
          const paidAt = nullableIso(row.paidAt);
          const paid = row.state === "paid";
          if (
            !uuidPattern.test(row.payoutId) ||
            !uuidPattern.test(row.affiliateProfileId) ||
            affiliatePolicyVersion < 1 ||
            amountMinor < 1 ||
            row.currency !== "USD" ||
            (row.state !== "pending" && row.state !== "paid" && row.state !== "cancelled") ||
            version < 1 ||
            commissionCount < 1 ||
            typeof row.externalEvidenceRecorded !== "boolean" ||
            paid !== (paidAt !== null) ||
            paid !== row.externalEvidenceRecorded ||
            (paidAt !== null && new Date(paidAt).getTime() < new Date(createdAt).getTime())
          ) {
            throw new Error("Invalid affiliate payout admin projection");
          }
          return Object.freeze({
            payoutId: row.payoutId,
            affiliateProfileId: row.affiliateProfileId,
            affiliatePolicyVersion,
            amountMinor,
            currency: "USD" as const,
            state: row.state,
            version,
            commissionCount,
            externalEvidenceRecorded: row.externalEvidenceRecorded,
            createdAt,
            paidAt,
          });
        },
      );
      return snapshot(resource, result) as Extract<AdminReadSnapshot, { resource: "payouts" }>;
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
        failedPaymentEventCount: number | string;
        refundCount: number | string;
        confirmedRefundMinor: number | string;
        pendingRefundCount: number | string;
        failedRefundCount: number | string;
        releaseCount: number | string;
        currentReleaseState: "issued" | "revoked" | "expired" | "consumed" | null;
        releaseVersion: number | string | null;
        shipmentCount: number | string;
        shipmentState: "pending" | "handed_off" | "delivered" | "exception" | null;
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
                 (SELECT count(*) FROM payment_events pe
                   WHERE pe.order_id = o.id AND pe.event_type = 'payment_failed')
                   AS "failedPaymentEventCount",
                 (SELECT count(*) FROM refunds r WHERE r.order_id = o.id)
                   AS "refundCount",
                 (SELECT coalesce(sum(r.confirmed_amount_minor), 0) FROM refunds r
                   WHERE r.order_id = o.id AND r.status = 'succeeded')
                   AS "confirmedRefundMinor",
                 (SELECT count(*) FROM refunds r
                   WHERE r.order_id = o.id AND r.status IN ('requested','submitted'))
                   AS "pendingRefundCount",
                 (SELECT count(*) FROM refunds r
                   WHERE r.order_id = o.id AND r.status IN ('failed','cancelled'))
                   AS "failedRefundCount",
                 (SELECT count(*) FROM fulfillment_releases fr WHERE fr.order_id = o.id)
                   AS "releaseCount",
                 (SELECT fr.state FROM fulfillment_releases fr
                   WHERE fr.order_id = o.id ORDER BY fr.version DESC LIMIT 1)
                   AS "currentReleaseState",
                 (SELECT fr.version FROM fulfillment_releases fr
                   WHERE fr.order_id = o.id ORDER BY fr.version DESC LIMIT 1)
                   AS "releaseVersion",
                 (SELECT count(*) FROM shipments s WHERE s.order_id = o.id)
                   AS "shipmentCount",
                 (SELECT s.state FROM shipments s WHERE s.order_id = o.id)
                   AS "shipmentState",
                 o.created_at AS "createdAt", o.updated_at AS "updatedAt"
          FROM orders o
          JOIN attestation_acceptances aa ON aa.id = o.attestation_acceptance_id
          JOIN attestation_versions av ON av.id = aa.attestation_version_id
          ORDER BY o.updated_at DESC, o.id DESC
          LIMIT $1
        `,
        (row) => {
          const subtotalMinor = safeInteger(row.subtotalMinor);
          const discountMinor = safeInteger(row.discountMinor);
          const taxMinor = safeInteger(row.taxMinor);
          const shippingMinor = safeInteger(row.shippingMinor);
          const totalMinor = safeInteger(row.totalMinor);
          const verifiedPaymentEventCount = safeInteger(row.verifiedPaymentEventCount);
          const failedPaymentEventCount = safeInteger(row.failedPaymentEventCount);
          const refundCount = safeInteger(row.refundCount);
          const confirmedRefundMinor = safeInteger(row.confirmedRefundMinor);
          const pendingRefundCount = safeInteger(row.pendingRefundCount);
          const failedRefundCount = safeInteger(row.failedRefundCount);
          const releaseCount = safeInteger(row.releaseCount);
          const releaseVersion = nullableSafeInteger(row.releaseVersion);
          const shipmentCount = safeInteger(row.shipmentCount);
          if (
            [subtotalMinor, discountMinor, taxMinor, shippingMinor, totalMinor,
              verifiedPaymentEventCount, failedPaymentEventCount, refundCount,
              confirmedRefundMinor, pendingRefundCount, failedRefundCount,
              releaseCount, shipmentCount].some((value) => value < 0) ||
            verifiedPaymentEventCount > 1 || discountMinor > subtotalMinor ||
            totalMinor !== subtotalMinor - discountMinor + shippingMinor + taxMinor ||
            confirmedRefundMinor > totalMinor || pendingRefundCount > refundCount ||
            failedRefundCount > refundCount || pendingRefundCount + failedRefundCount > refundCount ||
            (releaseCount === 0) !== (row.currentReleaseState === null) ||
            (releaseCount === 0) !== (releaseVersion === null) ||
            (releaseVersion !== null && (releaseVersion < 1 || releaseVersion > releaseCount)) ||
            shipmentCount > 1 || (shipmentCount === 0) !== (row.shipmentState === null)
          ) {
            throw new Error("Incoherent commerce lifecycle in admin read model");
          }
          const succeededRefundCount = refundCount - pendingRefundCount - failedRefundCount;
          if ((confirmedRefundMinor > 0) !== (succeededRefundCount > 0)) {
            throw new Error("Incoherent commerce lifecycle in admin read model");
          }
          const refundState = pendingRefundCount > 0
            ? "pending" as const
            : confirmedRefundMinor === totalMinor && totalMinor > 0
              ? "full" as const
              : confirmedRefundMinor > 0
                ? "partial" as const
                : refundCount > 0 && failedRefundCount === refundCount
                  ? "failed" as const
                  : "none" as const;
          return {
            id: row.id,
            buyerUserId: row.buyerUserId,
            buyerStatusSnapshot: row.buyerStatusSnapshot,
            attestationAcceptanceId: row.attestationAcceptanceId,
            attestationVersion: safeInteger(row.attestationVersion),
            destinationStateCode: row.destinationStateCode,
            currency: row.currency,
            subtotalMinor,
            discountMinor,
            taxMinor,
            shippingMinor,
            totalMinor,
            state: row.state,
            itemCount: safeInteger(row.itemCount),
            verifiedPaymentEventCount,
            paymentState: verifiedPaymentEventCount === 1
              ? "paid" as const
              : failedPaymentEventCount > 0 ? "failed" as const : "pending_verification" as const,
            refundState,
            holdState: row.state === "paid_on_hold" ? "active" as const : "none" as const,
            currentReleaseState: row.currentReleaseState,
            releaseVersion,
            shipmentState: row.shipmentState,
            providerExecutionBoundary: "task6_managed" as const,
            createdAt: toIso(row.createdAt),
            updatedAt: toIso(row.updatedAt),
          };
        },
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
