import {
  canonicalReviewPolicies,
  canonicalJson,
  hashCanonicalEnvelope,
  hashReviewSnapshot,
  isCanonicalUuid,
  type KeyedUuidGenerator,
  type ReviewSnapshotHashInput,
  type Sha256Hasher,
} from "@/commerce/checkout-identity";
import {
  projectLoadedCheckoutAttempt,
  type AuthoritativeCheckoutFacts,
  type AuthoritativeCheckoutItemFact,
  type AuthoritativeCheckoutPlanData,
  type BrowserCheckoutQuote,
  type CheckoutAttemptStatus,
  type CheckoutPrepareResult,
  type CheckoutRepository,
  type DefiniteFailureReleaseInput,
  type DefiniteFailureReleaseResult,
  type ExactReviewDecision,
  type FactLoadResult,
  type StoredCheckoutAttempt,
} from "@/commerce/checkout-service";
import type { ProviderPreparation } from "@/commerce/checkout-ports";
import type { CheckoutRequest } from "@/domain/checkout";
import {
  evaluateCheckout,
  resolveDestination,
  type BuyerStatus,
  type DestinationRule,
} from "@/domain/eligibility";
import type { PromotionRecord } from "@/domain/promotions";
import {
  releaseCheckoutRewardsInTransaction,
  reserveCheckoutRewardsInTransaction,
} from "@/growth/rewards-service";
import {
  bindCustomerReferralOrderInTransaction,
  ReferralBindingConflict,
} from "@/growth/referral-service";
import {
  AffiliateBindingConflict,
  bindAffiliateOrderInTransaction,
} from "@/growth/affiliate-service";
import {
  transitionOrder,
  type OrderSnapshot,
  type OrderState,
} from "@/domain/orders";
import { runSerializableWithRetry } from "@/db/serializable-retry";

export type CheckoutSqlClient = Readonly<{
  query: <Row extends object>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<Readonly<{ rows: Row[] }>>;
}>;

export type CheckoutTransactionRunner = <Value>(
  work: (client: CheckoutSqlClient) => Promise<Value>,
  options: Readonly<{ isolationLevel: "serializable" }>,
) => Promise<Value>;

type BuyerFacts = AuthoritativeCheckoutFacts["buyer"];

type ProductCore = Readonly<{
  productId: string;
  productName: string;
  packageForm: string;
  policyGroupId: string;
  productActive: boolean;
  policyGroupActive: boolean;
  price: AuthoritativeCheckoutItemFact["price"];
}>;

const orderStatesBeforePayment = new Set(["checkout_pending", "payment_failed"]);

function lockSuffix(lock: boolean, aliases?: string): string {
  if (!lock) return "";
  return aliases ? ` FOR UPDATE OF ${aliases}` : " FOR UPDATE";
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid database timestamp");
  return date.toISOString();
}

function safeInteger(value: number | string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error("Unsafe database integer");
  return result;
}

function nonblank(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim() === value &&
    value.length > 0 &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function uniqueStrings(values: readonly string[]): boolean {
  return values.length === new Set(values).size;
}

function isTimestampAtOrBefore(
  value: Date | string | null,
  authoritativeNow: Date,
): boolean {
  if (value === null) return false;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp <= authoritativeNow.getTime();
}

async function readBuyerFacts(
  client: CheckoutSqlClient,
  buyerUserId: string,
  now: Date,
  lock: boolean,
): Promise<BuyerFacts | null> {
  type UserRow = { userId: string; emailVerifiedAt: Date | string | null };
  const user = await client.query<UserRow>(
    `SELECT id::text AS "userId", email_verified_at AS "emailVerifiedAt"
     FROM users WHERE id = $1::uuid${lockSuffix(lock)}`,
    [buyerUserId],
  );
  if (user.rows.length !== 1) return null;

  type ProfileRow = { status: BuyerStatus };
  const profile = await client.query<ProfileRow>(
    `SELECT status FROM buyer_profiles
     WHERE user_id = $1::uuid${lockSuffix(lock)}`,
    [buyerUserId],
  );
  if (profile.rows.length !== 1) return null;

  type AttestationRow = { id: string; version: number | string };
  const attestations = await client.query<AttestationRow>(
    `SELECT id::text AS id, version
     FROM attestation_versions
     WHERE effective_at <= $1::timestamptz AND superseded_at IS NULL
     ORDER BY version, id${lockSuffix(lock)}`,
    [now.toISOString()],
  );
  if (attestations.rows.length !== 1) return null;
  const attestation = attestations.rows[0]!;

  type AcceptanceRow = { id: string; attestationVersionId: string };
  const acceptances = await client.query<AcceptanceRow>(
    `SELECT id::text AS id,
            attestation_version_id::text AS "attestationVersionId"
     FROM attestation_acceptances
     WHERE user_id = $1::uuid AND attestation_version_id = $2::uuid
       AND accepted_at <= $3::timestamptz
     ORDER BY id${lockSuffix(lock)}`,
    [buyerUserId, attestation.id, now.toISOString()],
  );
  if (acceptances.rows.length > 1) return null;
  const acceptance = acceptances.rows[0] ?? null;
  return Object.freeze({
    userId: user.rows[0]!.userId,
    emailVerified: isTimestampAtOrBefore(user.rows[0]!.emailVerifiedAt, now),
    status: profile.rows[0]!.status,
    currentAttestationVersionId: attestation.id,
    currentAttestationVersion: safeInteger(attestation.version),
    attestationAcceptanceId: acceptance?.id ?? null,
    acceptedAttestationVersionId: acceptance?.attestationVersionId ?? null,
  });
}

async function readProductCores(
  client: CheckoutSqlClient,
  productIds: readonly string[],
  now: Date,
  lock: boolean,
): Promise<readonly ProductCore[] | null> {
  type ProductRow = {
    productId: string;
    productName: string;
    packageForm: string;
    policyGroupId: string;
    productStatus: "draft" | "active" | "retired";
    policyGroupActive: boolean;
  };
  type PriceRow = {
    id: string;
    version: number | string;
    amountMinor: number | string;
    currency: string;
    effectiveAt: Date | string;
    supersededAt: Date | string | null;
  };
  const productRows = new Map<string, ProductRow>();
  for (const productId of [...productIds].toSorted()) {
    const product = await client.query<ProductRow>(
      `SELECT p.id::text AS "productId", p.name AS "productName",
              p.package_form AS "packageForm",
              p.policy_group_id::text AS "policyGroupId",
              p.status AS "productStatus", g.active AS "policyGroupActive"
       FROM products p
       JOIN product_policy_groups g ON g.id = p.policy_group_id
       WHERE p.id = $1::uuid${lockSuffix(lock, "p, g")}`,
      [productId],
    );
    if (product.rows.length !== 1) return null;
    productRows.set(productId, product.rows[0]!);
  }

  const result: ProductCore[] = [];
  for (const productId of [...productIds].toSorted()) {
    const prices = await client.query<PriceRow>(
      `SELECT id::text AS id, version, amount_minor AS "amountMinor",
              currency, effective_at AS "effectiveAt",
              superseded_at AS "supersededAt"
       FROM product_prices
       WHERE product_id = $1::uuid AND currency = 'USD'
         AND effective_at <= $2::timestamptz AND superseded_at IS NULL
       ORDER BY version, id${lockSuffix(lock)}`,
      [productId, now.toISOString()],
    );
    if (prices.rows.length !== 1) return null;
    const row = productRows.get(productId)!;
    const price = prices.rows[0]!;
    if (
      !nonblank(row.productName) ||
      !nonblank(row.packageForm) ||
      !isCanonicalUuid(row.policyGroupId) ||
      price.currency !== "USD" ||
      price.supersededAt !== null
    ) {
      return null;
    }
    result.push(
      Object.freeze({
        productId: row.productId,
        productName: row.productName,
        packageForm: row.packageForm,
        policyGroupId: row.policyGroupId,
        productActive: row.productStatus === "active",
        policyGroupActive: row.policyGroupActive,
        price: Object.freeze({
          id: price.id,
          version: safeInteger(price.version),
          amountMinor: safeInteger(price.amountMinor),
          currency: "USD" as const,
          effectiveAt: toIso(price.effectiveAt),
          supersededAt: null,
        }),
      }),
    );
  }
  return Object.freeze(result);
}

async function readPromotion(
  client: CheckoutSqlClient,
  promotionIds: readonly string[],
  now: Date,
  lock: boolean,
): Promise<PromotionRecord | null | undefined> {
  if (promotionIds.length === 0) return null;
  if (promotionIds.length !== 1) return undefined;
  type PromotionRow = {
    id: string;
    code: string;
    version: number | string;
    name: string;
    kind: PromotionRecord["kind"];
    status: PromotionRecord["status"];
    amountMinor: number | string | null;
    currency: string | null;
    basisPoints: number | string | null;
    startsAt: Date | string | null;
    endsAt: Date | string | null;
  };
  const parent = await client.query<PromotionRow>(
    `SELECT id::text AS id, code, version, name, kind, status,
            amount_minor AS "amountMinor", currency,
            basis_points AS "basisPoints", starts_at AS "startsAt",
            ends_at AS "endsAt"
     FROM promotions WHERE id = $1::uuid${lockSuffix(lock)}`,
    [promotionIds[0]],
  );
  if (parent.rows.length !== 1) return undefined;

  type TargetRow = {
    targetKind: "product" | "policy_group";
    targetId: string;
  };
  const targets = await client.query<TargetRow>(
    `SELECT target_kind AS "targetKind",
            COALESCE(product_id, policy_group_id)::text AS "targetId"
     FROM promotion_targets
     WHERE promotion_id = $1::uuid
     ORDER BY target_kind, COALESCE(product_id, policy_group_id)${lockSuffix(lock)}`,
    [promotionIds[0]],
  );
  const row = parent.rows[0]!;
  const startsMs = row.startsAt === null ? null : new Date(row.startsAt).getTime();
  const endsMs = row.endsAt === null ? null : new Date(row.endsAt).getTime();
  const nowMs = now.getTime();
  const productTargets = targets.rows
    .filter((target) => target.targetKind === "product")
    .map((target) => target.targetId);
  const groupTargets = targets.rows
    .filter((target) => target.targetKind === "policy_group")
    .map((target) => target.targetId);
  if (
    !uniqueStrings(productTargets) ||
    !uniqueStrings(groupTargets) ||
    targets.rows.some((target) => !isCanonicalUuid(target.targetId))
  ) {
    return undefined;
  }
  return Object.freeze({
    authority: "server_resolved_promotion" as const,
    id: row.id,
    version: safeInteger(row.version),
    code: row.code,
    name: row.name,
    kind: row.kind,
    status: row.status,
    currentlyEffective:
      row.status === "active" &&
      (startsMs === null || startsMs <= nowMs) &&
      (endsMs === null || endsMs > nowMs),
    amountMinor: row.amountMinor === null ? null : safeInteger(row.amountMinor),
    currency: row.currency,
    basisPoints: row.basisPoints === null ? null : safeInteger(row.basisPoints),
    targetProductIds: Object.freeze(productTargets),
    targetPolicyGroupIds: Object.freeze(groupTargets),
  });
}

async function readDestinations(
  client: CheckoutSqlClient,
  cores: readonly ProductCore[],
  stateCode: string,
  now: Date,
  lock: boolean,
): Promise<ReadonlyMap<string, AuthoritativeCheckoutItemFact["destination"]>> {
  const result = new Map<string, AuthoritativeCheckoutItemFact["destination"]>();
  for (const core of cores) {
    type PolicyRow = {
      id: string;
      scopeKind: "product" | "policy_group";
      productId: string | null;
      policyGroupId: string | null;
      stateCode: string;
      result: "allowed" | "review" | "blocked";
      version: number | string;
      active: boolean;
    };
    const policies = await client.query<PolicyRow>(
      `SELECT id::text AS id, scope_kind AS "scopeKind",
              product_id::text AS "productId",
              policy_group_id::text AS "policyGroupId",
              state_code AS "stateCode", result, version, active
       FROM destination_policies
       WHERE state_code = $1
         AND active = true
         AND effective_at <= $2::timestamptz
         AND superseded_at IS NULL
         AND (product_id = $3::uuid OR policy_group_id = $4::uuid)
       ORDER BY scope_kind, id${lockSuffix(lock)}`,
      [stateCode, now.toISOString(), core.productId, core.policyGroupId],
    );
    const rules: DestinationRule[] = policies.rows.map((policy) => ({
      id: policy.id,
      version: String(safeInteger(policy.version)),
      active: policy.active,
      stateCode: policy.stateCode,
      status: policy.result,
      target:
        policy.scopeKind === "product"
          ? { kind: "product", productId: policy.productId! }
          : {
              kind: "policy_group",
              productPolicyGroupId: policy.policyGroupId!,
            },
    }));
    result.set(
      core.productId,
      resolveDestination({
        productId: core.productId,
        productPolicyGroupId: core.policyGroupId,
        destinationCode: stateCode,
        rules,
      }),
    );
  }
  return result;
}

async function readLots(
  client: CheckoutSqlClient,
  productIds: readonly string[],
  now: Date,
  lock: boolean,
): Promise<ReadonlyMap<string, AuthoritativeCheckoutItemFact["eligibleLots"]>> {
  type LotRow = {
    id: string;
    productId: string;
    receivedQuantity: number | string;
    availableQuantity: number | string;
    status: "released";
    expiresAt: Date | string | null;
  };
  // Locking is global lot UUID order. Business allocation below deliberately
  // uses a separate product/expiry/lot preference.
  const lots = await client.query<LotRow>(
    `SELECT id::text AS id, product_id::text AS "productId",
            received_quantity AS "receivedQuantity",
            available_quantity AS "availableQuantity", status,
            expires_at AS "expiresAt"
     FROM lots
     WHERE product_id = ANY($1::uuid[]) AND status = 'released'
       AND available_quantity > 0
       AND (expires_at IS NULL OR expires_at > $2::timestamptz)
     ORDER BY id${lockSuffix(lock)}`,
    [[...productIds], now.toISOString()],
  );
  const allRows = lots.rows;
  const result = new Map<
    string,
    AuthoritativeCheckoutItemFact["eligibleLots"]
  >();
  for (const productId of productIds) {
    result.set(
      productId,
      Object.freeze(
        allRows
          .filter((row) => row.productId === productId)
          .map((row) =>
            Object.freeze({
              id: row.id,
              status: "released" as const,
              receivedQuantity: safeInteger(row.receivedQuantity),
              availableQuantity: safeInteger(row.availableQuantity),
              expiresAt: row.expiresAt === null ? null : toIso(row.expiresAt),
            }),
          ),
      ),
    );
  }
  return result;
}

function assembleFacts(
  buyer: BuyerFacts,
  cores: readonly ProductCore[],
  promotion: PromotionRecord | null,
  destinations: ReadonlyMap<
    string,
    AuthoritativeCheckoutItemFact["destination"]
  >,
  lots: ReadonlyMap<string, AuthoritativeCheckoutItemFact["eligibleLots"]>,
): AuthoritativeCheckoutFacts {
  return Object.freeze({
    buyer,
    items: Object.freeze(
      cores.map((core) =>
        Object.freeze({
          ...core,
          destination: destinations.get(core.productId)!,
          eligibleLots: lots.get(core.productId) ?? Object.freeze([]),
        }),
      ),
    ),
    promotion,
  });
}

async function loadFactsFromClient(
  client: CheckoutSqlClient,
  input: Readonly<{
    buyerUserId: string;
    request: CheckoutRequest;
    now: Date;
    lock: boolean;
    buyer?: BuyerFacts;
    beforeLots?: () => Promise<void>;
  }>,
): Promise<FactLoadResult> {
  const buyer =
    input.buyer ??
    (await readBuyerFacts(client, input.buyerUserId, input.now, input.lock));
  if (buyer === null) return { ok: false, reasons: ["account_required"] };
  const productIds = input.request.items.map((item) => item.productId);
  const cores = await readProductCores(client, productIds, input.now, input.lock);
  if (cores === null || cores.length !== productIds.length) {
    return { ok: false, reasons: ["product_catalog_incomplete"] };
  }
  const promotion = await readPromotion(
    client,
    input.request.promotionIds,
    input.now,
    input.lock,
  );
  if (promotion === undefined) {
    return { ok: false, reasons: ["promotion_invalid"] };
  }
  const destinations = await readDestinations(
    client,
    cores,
    input.request.destination.stateCode,
    input.now,
    input.lock,
  );
  await input.beforeLots?.();
  const lots = await readLots(client, productIds, input.now, input.lock);
  return { ok: true, value: assembleFacts(buyer, cores, promotion, destinations, lots) };
}

type ReviewRow = {
  reviewRequestId: string;
  orderId: string;
  userId: string;
  snapshotHash: string;
  outcome: "approved" | "rejected" | null;
  decidedByUserId: string | null;
  decidedAt: Date | string | null;
  coversBuyerReview: boolean | null;
};

async function findExactReviewByHash(
  client: CheckoutSqlClient,
  input: Readonly<{
    orderId: string;
    buyerUserId: string;
    snapshotHash: string;
  }>,
  lock: boolean,
): Promise<ExactReviewDecision | null> {
  const review = await client.query<ReviewRow>(
    `SELECT id::text AS "reviewRequestId", order_id::text AS "orderId",
            user_id::text AS "userId", snapshot_hash AS "snapshotHash",
            outcome, decided_by_user_id::text AS "decidedByUserId",
            decided_at AS "decidedAt", covers_buyer_review AS "coversBuyerReview"
     FROM review_requests
     WHERE order_id = $1::uuid AND user_id = $2::uuid AND snapshot_hash = $3
     ORDER BY id${lockSuffix(lock)}`,
    [input.orderId, input.buyerUserId, input.snapshotHash],
  );
  if (review.rows.length === 0) return null;
  if (review.rows.length !== 1) throw new Error("Duplicate exact review request");
  const row = review.rows[0]!;
  const pending =
    row.outcome === null &&
    row.decidedByUserId === null &&
    row.decidedAt === null &&
    row.coversBuyerReview === null;
  if (pending) return null;
  if (
    row.outcome === null ||
    row.decidedByUserId === null ||
    row.decidedAt === null ||
    row.coversBuyerReview === null
  ) {
    throw new Error("Incoherent exact review decision");
  }
  type PolicyRow = { destinationPolicyId: string; covered: boolean };
  const policies = await client.query<PolicyRow>(
    `SELECT destination_policy_id::text AS "destinationPolicyId", covered
     FROM review_request_destination_policies
     WHERE review_request_id = $1::uuid
     ORDER BY destination_policy_id${lockSuffix(lock)}`,
    [row.reviewRequestId],
  );
  return Object.freeze({
    reviewRequestId: row.reviewRequestId,
    reviewSnapshotHash: row.snapshotHash,
    outcome: row.outcome,
    coversBuyerReview: row.coversBuyerReview,
    destinationPolicyIds: Object.freeze(
      policies.rows
        .filter((policy) => policy.covered)
        .map((policy) => policy.destinationPolicyId),
    ),
  });
}

export async function resolveExactReviewRequest(
  client: CheckoutSqlClient,
  input: ReviewSnapshotHashInput,
  sha256: Sha256Hasher,
  options: Readonly<{ lock?: boolean }> = {},
): Promise<ExactReviewDecision | null> {
  const snapshotHash = await hashReviewSnapshot(input, sha256);
  type SnapshotRow = {
    reviewRequestId: string;
    buyerStatusSnapshot: BuyerStatus;
    attestationVersionId: string;
    destinationStateCode: string;
    cartSnapshot: unknown;
    buyerReviewRequired: boolean;
    destinationReviewRequired: boolean;
  };
  const snapshot = await client.query<SnapshotRow>(
    `SELECT id::text AS "reviewRequestId",
            buyer_status_snapshot AS "buyerStatusSnapshot",
            attestation_version_id::text AS "attestationVersionId",
            destination_state_code AS "destinationStateCode",
            cart_snapshot AS "cartSnapshot",
            buyer_review_required AS "buyerReviewRequired",
            destination_review_required AS "destinationReviewRequired"
     FROM review_requests
     WHERE order_id = $1::uuid AND user_id = $2::uuid AND snapshot_hash = $3
     ORDER BY id${lockSuffix(options.lock ?? false)}`,
    [input.orderId, input.buyerUserId, snapshotHash],
  );
  if (snapshot.rows.length !== 1) return null;
  const row = snapshot.rows[0]!;
  const expectedPolicyIds = canonicalReviewPolicies(input.reviewPolicies).map(
    (policy) => policy.id,
  );
  type PolicyIdentityRow = { destinationPolicyId: string };
  const linkedPolicies = await client.query<PolicyIdentityRow>(
    `SELECT destination_policy_id::text AS "destinationPolicyId"
     FROM review_request_destination_policies
     WHERE review_request_id = $1::uuid
     ORDER BY destination_policy_id${lockSuffix(options.lock ?? false)}`,
    [row.reviewRequestId],
  );
  const actualPolicyIds = linkedPolicies.rows.map(
    (policy) => policy.destinationPolicyId,
  );
  const expectedCart = {
    schemaVersion: 1,
    items: input.items,
    promotionIds: input.promotionIds,
  };
  if (
    row.buyerStatusSnapshot !== input.buyerStatus ||
    row.attestationVersionId !== input.acceptedAttestationVersionId ||
    row.attestationVersionId !== input.currentAttestationVersionId ||
    row.destinationStateCode !== input.destination.stateCode ||
    row.buyerReviewRequired !== (input.buyerStatus === "review") ||
    row.destinationReviewRequired !== (expectedPolicyIds.length > 0) ||
    canonicalJson(row.cartSnapshot) !== canonicalJson(expectedCart) ||
    canonicalJson(actualPolicyIds) !== canonicalJson(expectedPolicyIds)
  ) {
    return null;
  }
  return findExactReviewByHash(
    client,
    {
      orderId: input.orderId,
      buyerUserId: input.buyerUserId,
      snapshotHash,
    },
    options.lock ?? false,
  );
}

async function storedAttemptFromClient(
  client: CheckoutSqlClient,
  input: Readonly<{ buyerUserId: string; idempotencyKey: string }>,
  lock: boolean,
  lockItems: boolean = lock,
): Promise<StoredCheckoutAttempt | null> {
  type AttemptRow = {
    orderId: string;
    attemptId: string;
    requestHash: string;
    status: CheckoutAttemptStatus;
    orderState: OrderState;
    permitted: boolean;
    reviewRequired: boolean;
    reasons: string[];
    subtotalMinor: number | string;
    discountMinor: number | string;
    taxMinor: number | string;
    shippingMinor: number | string;
    totalMinor: number | string;
    currency: string;
    hasReservations: boolean;
  };
  const attempt = await client.query<AttemptRow>(
    `SELECT a.order_id::text AS "orderId", a.id::text AS "attemptId",
            a.request_hash AS "requestHash", a.status, a.permitted,
            a.review_required AS "reviewRequired", a.reasons,
            o.subtotal_minor AS "subtotalMinor",
            o.discount_minor AS "discountMinor", o.tax_minor AS "taxMinor",
            o.shipping_minor AS "shippingMinor", o.total_minor AS "totalMinor",
             o.currency, o.state AS "orderState",
            EXISTS (SELECT 1 FROM inventory_reservations r
                    WHERE r.checkout_attempt_id = a.id) AS "hasReservations"
     FROM checkout_attempts a
     JOIN orders o ON o.id = a.order_id
     WHERE a.buyer_user_id = $1::uuid AND a.idempotency_key = $2${lockSuffix(lock, "a")}`,
    [input.buyerUserId, input.idempotencyKey],
  );
  if (attempt.rows.length === 0) return null;
  if (attempt.rows.length !== 1) throw new Error("Duplicate checkout attempt key");
  const row = attempt.rows[0]!;
  type ItemRow = {
    productId: string;
    productName: string;
    packageForm: string;
    quantity: number | string;
    unitAmountMinor: number | string;
    subtotalMinor: number | string;
    discountMinor: number | string;
    totalMinor: number | string;
  };
  const items = await client.query<ItemRow>(
    `SELECT product_id::text AS "productId",
            product_name_snapshot AS "productName",
            package_form_snapshot AS "packageForm", quantity,
            unit_amount_minor AS "unitAmountMinor",
            subtotal_minor AS "subtotalMinor",
            discount_minor AS "discountMinor", total_minor AS "totalMinor"
     FROM order_items WHERE order_id = $1::uuid
     ORDER BY product_id${lockSuffix(lockItems)}`,
    [row.orderId],
  );
  const quoteSnapshot: BrowserCheckoutQuote | null =
    row.currency === "USD" && items.rows.length > 0
      ? Object.freeze({
          status: row.reviewRequired ? "review_required" : "ready",
          reviewRequired: row.reviewRequired,
          reasons: Object.freeze([...row.reasons]),
          currency: "USD" as const,
          subtotalMinor: safeInteger(row.subtotalMinor),
          discountMinor: safeInteger(row.discountMinor),
          shippingMinor: safeInteger(row.shippingMinor),
          taxMinor: safeInteger(row.taxMinor),
          totalMinor: safeInteger(row.totalMinor),
          lines: Object.freeze(
            items.rows.map((item) =>
              Object.freeze({
                productId: item.productId,
                productName: item.productName,
                packageForm: item.packageForm,
                quantity: safeInteger(item.quantity),
                unitAmountMinor: safeInteger(item.unitAmountMinor),
                subtotalMinor: safeInteger(item.subtotalMinor),
                discountMinor: safeInteger(item.discountMinor),
                totalMinor: safeInteger(item.totalMinor),
              }),
            ),
          ),
        })
      : null;
  return Object.freeze({
    orderId: row.orderId,
    attemptId: row.attemptId,
    requestHash: row.requestHash,
    status: row.status,
    orderState: row.orderState,
    permitted: row.permitted,
    reviewRequired: row.reviewRequired,
    hasReservations: row.hasReservations,
    quoteSnapshot,
  });
}

function gateProjection(decision: AuthoritativeCheckoutPlanData["decision"]) {
  const reasons = new Set(decision.reasons);
  const gate = (
    blocked: readonly string[],
    review: readonly string[] = [],
  ): "pass" | "review" | "blocked" =>
    blocked.some((reason) => reasons.has(reason))
      ? "blocked"
      : review.some((reason) => reasons.has(reason))
        ? "review"
        : "pass";
  return {
    account: gate(
      ["account_required", "buyer_blocked", "review_rejected"],
      ["buyer_review_required"],
    ),
    attestation: gate(["attestation_not_current"]),
    product: gate(["product_inactive", "product_catalog_incomplete"]),
    destination: gate(
      ["destination_blocked", "destination_unavailable"],
      ["destination_review_required"],
    ),
    inventory: gate(["inventory_unavailable"]),
    paymentProvider: gate(["payment_provider_unavailable"]),
  } as const;
}

function baseOrderSnapshot(orderId: string, state: OrderState): OrderSnapshot {
  return Object.freeze({
    orderId,
    state,
    paymentEvidenceId: null,
    reviewRequestId: null,
    fulfillmentReleaseVersion: null,
    lastFulfillmentReleaseVersion: 0,
    carrierHandoffAt: null,
  });
}

function authoritativePreparationState(
  plan: AuthoritativeCheckoutPlanData,
): "eligibility_review" | "checkout_pending" {
  const started = transitionOrder(baseOrderSnapshot(plan.identity.orderId, "draft"), {
    type: "start_eligibility",
  });
  if (!started.ok) throw new Error("Order eligibility transition rejected");
  if (plan.decision.reviewRequired) return "eligibility_review";
  const eligible = transitionOrder(started.value.snapshot, {
    type: "eligibility_passed",
    decision: plan.decision,
  });
  if (!eligible.ok) throw new Error("Authoritative eligibility transition rejected");
  const checkout = transitionOrder(eligible.value.snapshot, {
    type: "begin_checkout",
  });
  if (!checkout.ok || checkout.value.snapshot.state !== "checkout_pending") {
    throw new Error("Authoritative checkout transition rejected");
  }
  return checkout.value.snapshot.state;
}

function authoritativeCancellationState(
  orderId: string,
  initialState: "eligibility_review" | "checkout_pending" | "payment_failed",
  providerEvidenceId?: string,
  reason?: "payment_failed" | "checkout_expired",
): "cancelled" {
  let snapshot = baseOrderSnapshot(orderId, initialState);
  if (snapshot.state === "checkout_pending") {
    if (!providerEvidenceId || !reason) {
      throw new Error("Provider evidence is required to close checkout");
    }
    const closed = transitionOrder(snapshot, {
      type: "checkout_closed",
      source: "provider_retrieval",
      reason,
      providerEvidenceId,
    });
    if (!closed.ok) throw new Error("Provider checkout close transition rejected");
    snapshot = closed.value.snapshot;
  }
  const cancelled = transitionOrder(snapshot, { type: "cancel" });
  if (!cancelled.ok || cancelled.value.snapshot.state !== "cancelled") {
    throw new Error("Order cancellation transition rejected");
  }
  return cancelled.value.snapshot.state;
}

function currentDecision(
  plan: AuthoritativeCheckoutPlanData,
  facts: AuthoritativeCheckoutFacts,
  exactReview: ExactReviewDecision | null,
) {
  return evaluateCheckout({
    authenticated: true,
    buyerStatus: facts.buyer.emailVerified ? facts.buyer.status : null,
    acceptedAttestationVersion: facts.buyer.acceptedAttestationVersionId,
    currentAttestationVersion: facts.buyer.currentAttestationVersionId,
    items: facts.items.map((item) => ({
      productId: item.productId,
      active: item.productActive && item.policyGroupActive,
      catalogComplete: true,
      destination: item.destination,
      inventoryAvailable:
        item.eligibleLots.reduce(
          (sum, lot) => sum + lot.availableQuantity,
          0,
        ) >=
        plan.request.items.find(
          (candidate) => candidate.productId === item.productId,
        )!.quantity,
    })),
    paymentProviderAvailable: !plan.decision.reasons.includes(
      "payment_provider_unavailable",
    ),
    reviewSnapshotHash: plan.reviewSnapshotHash,
    reviewDecision:
      exactReview === null
        ? null
        : {
            reviewSnapshotHash: exactReview.reviewSnapshotHash,
            outcome: exactReview.outcome,
            coversBuyerReview: exactReview.coversBuyerReview,
            destinationRuleIds: exactReview.destinationPolicyIds,
          },
  });
}

async function writeCommercialSnapshots(
  client: CheckoutSqlClient,
  plan: AuthoritativeCheckoutPlanData,
  providerPreparation: ProviderPreparation | null,
  state: "eligibility_review" | "checkout_pending",
  existing: StoredCheckoutAttempt | null,
): Promise<ReadonlyMap<string, string> | null> {
  if (plan.totals === null || plan.shippingQuote?.status !== "ready" || plan.taxQuote?.status !== "ready") {
    throw new Error("Truthful commercial snapshot is incomplete");
  }
  const totals = plan.totals;
  if (authoritativePreparationState(plan) !== state) {
    throw new Error("Requested order snapshot state is not authoritative");
  }
  if (existing === null) {
    await client.query(
      `INSERT INTO orders
        (id, buyer_user_id, buyer_status_snapshot, attestation_acceptance_id,
         destination_state_code, currency, subtotal_minor, discount_minor,
         tax_minor, shipping_minor, total_minor, state, created_at, updated_at)
       VALUES
        ($1::uuid, $2::uuid, $3::buyer_status, $4::uuid, $5, 'USD',
         $6, $7, $8, $9, $10, $11::order_state, $12::timestamptz, $12::timestamptz)`,
      [
        plan.identity.orderId,
        plan.buyerUserId,
        plan.facts.buyer.status,
        plan.facts.buyer.attestationAcceptanceId,
        plan.request.destination.stateCode,
        totals.subtotalMinor,
        totals.discountMinor,
        totals.taxMinor,
        totals.shippingMinor,
        totals.totalMinor,
        state,
        plan.authoritativeAt.toISOString(),
      ],
    );
  } else {
    const updated = await client.query<{ id: string }>(
      `UPDATE orders SET buyer_status_snapshot = $2::buyer_status,
          attestation_acceptance_id = $3::uuid, destination_state_code = $4,
          currency = 'USD', subtotal_minor = $5, discount_minor = $6,
          tax_minor = $7, shipping_minor = $8, total_minor = $9,
          state = $10::order_state, updated_at = $11::timestamptz
       WHERE id = $1::uuid AND state = 'eligibility_review'
       RETURNING id::text AS id`,
      [
        plan.identity.orderId,
        plan.facts.buyer.status,
        plan.facts.buyer.attestationAcceptanceId,
        plan.request.destination.stateCode,
        totals.subtotalMinor,
        totals.discountMinor,
        totals.taxMinor,
        totals.shippingMinor,
        totals.totalMinor,
        state,
        plan.authoritativeAt.toISOString(),
      ],
    );
    if (updated.rows.length !== 1) return null;
    await client.query(
      `DELETE FROM order_promotion_allocations WHERE order_id = $1::uuid`,
      [plan.identity.orderId],
    );
    await client.query(
      `DELETE FROM order_promotion_applications WHERE order_id = $1::uuid`,
      [plan.identity.orderId],
    );
    await client.query(`DELETE FROM order_shipping_addresses WHERE order_id = $1::uuid`, [
      plan.identity.orderId,
    ]);
    await client.query(`DELETE FROM order_items WHERE order_id = $1::uuid`, [
      plan.identity.orderId,
    ]);
  }

  const factByProduct = new Map(
    plan.facts.items.map((item) => [item.productId, item]),
  );
  const itemIds = new Map<string, string>();
  for (const line of totals.lines.toSorted((a, b) => a.productId.localeCompare(b.productId))) {
    const fact = factByProduct.get(line.productId)!;
    const orderItemId = plan.identity.keyedUuid(`item:${line.productId}`);
    itemIds.set(line.productId, orderItemId);
    await client.query(
      `INSERT INTO order_items
        (id, order_id, product_id, product_price_id, destination_policy_id,
         product_name_snapshot, package_form_snapshot, currency,
         unit_amount_minor, quantity, subtotal_minor, discount_minor,
         total_minor, created_at)
       VALUES
        ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
         $6, $7, 'USD', $8, $9, $10, $11, $12, $13::timestamptz)`,
      [
        orderItemId,
        plan.identity.orderId,
        line.productId,
        fact.price.id,
        fact.destination.ruleId,
        fact.productName,
        fact.packageForm,
        line.unitAmountMinor,
        line.quantity,
        line.subtotalMinor,
        line.discountMinor,
        line.totalMinor,
        plan.authoritativeAt.toISOString(),
      ],
    );
  }

  if (
    plan.facts.promotion !== null &&
    plan.selectedAcquisitionSource === "promotion"
  ) {
    const promotion = plan.facts.promotion;
    const applicationId = plan.identity.keyedUuid("promotion-application");
    await client.query(
      `INSERT INTO order_promotion_applications
        (id, order_id, promotion_id, promotion_version, code_snapshot,
         name_snapshot, kind_snapshot, applied_discount_minor, created_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6,
               $7::promotion_kind, $8, $9::timestamptz)`,
      [
        applicationId,
        plan.identity.orderId,
        promotion.id,
        promotion.version,
        promotion.code,
        promotion.name,
        promotion.kind,
        plan.promotionDiscountMinor,
        plan.authoritativeAt.toISOString(),
      ],
    );
    for (const allocation of plan.promotionAllocations) {
      await client.query(
        `INSERT INTO order_promotion_allocations
          (id, application_id, order_id, order_item_id, allocated_discount_minor)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5)`,
        [
          plan.identity.keyedUuid(`promotion-allocation:${allocation.productId}`),
          applicationId,
          plan.identity.orderId,
          itemIds.get(allocation.productId),
          allocation.discountMinor,
        ],
      );
    }
  }

  const destination = plan.request.destination;
  await client.query(
    `INSERT INTO order_shipping_addresses
      (order_id, recipient_name, address_line1, address_line2, city,
       state_code, postal_code, country, created_at, updated_at)
     VALUES
      ($1::uuid, $2, $3, $4, $5, $6, $7, 'US', $8::timestamptz, $8::timestamptz)`,
    [
      plan.identity.orderId,
      destination.recipientName,
      destination.line1,
      destination.line2,
      destination.city,
      destination.stateCode,
      destination.postalCode,
      plan.authoritativeAt.toISOString(),
    ],
  );

  const gates = gateProjection(plan.decision);
  const attemptValues = [
    plan.identity.attemptId,
    plan.identity.orderId,
    plan.buyerUserId,
    plan.idempotencyKey,
    plan.requestHash,
    gates.account,
    gates.attestation,
    gates.product,
    gates.destination,
    gates.inventory,
    gates.paymentProvider,
    plan.decision.permitted,
    plan.decision.reviewRequired,
    [...plan.decision.reasons],
    plan.taxQuote.reference,
    plan.shippingQuote.reference,
    plan.shippingQuote.service,
    providerPreparation?.provider ?? null,
    providerPreparation?.providerIdempotencyKey ?? null,
    providerPreparation?.providerRequestHash ?? null,
    providerPreparation?.providerExpiresAt ?? null,
    providerPreparation?.providerCustomerEmail ?? null,
    providerPreparation?.providerOrigin ?? null,
    providerPreparation?.providerRequestSchemaVersion ?? null,
    providerPreparation?.providerLivemode ?? null,
    providerPreparation?.providerScope ?? null,
    plan.authoritativeAt.toISOString(),
  ] as const;
  if (existing === null) {
    await client.query(
      `INSERT INTO checkout_attempts
        (id, order_id, buyer_user_id, idempotency_key, request_hash, status,
         account_gate, attestation_gate, product_gate, destination_gate,
         inventory_gate, payment_provider_gate, permitted, review_required,
         reasons, tax_ready, shipping_ready, tax_quote_reference,
         shipping_quote_reference, shipping_service, provider,
         provider_request_id, provider_request_hash, expires_at,
         provider_customer_email, provider_origin,
         provider_request_schema_version, provider_livemode, provider_scope,
         created_at)
       VALUES
        ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'created',
         $6::checkout_gate_result, $7::checkout_gate_result,
         $8::checkout_gate_result, $9::checkout_gate_result,
         $10::checkout_gate_result, $11::checkout_gate_result,
         $12, $13, $14::text[], true, true, $15, $16, $17,
         $18, $19, $20, $21::timestamptz, $22, $23, $24, $25, $26,
         $27::timestamptz)`,
      attemptValues,
    );
  } else {
    await client.query(
      `UPDATE checkout_attempts SET
         status = 'created', account_gate = $6::checkout_gate_result,
         attestation_gate = $7::checkout_gate_result,
         product_gate = $8::checkout_gate_result,
         destination_gate = $9::checkout_gate_result,
         inventory_gate = $10::checkout_gate_result,
         payment_provider_gate = $11::checkout_gate_result,
         permitted = $12, review_required = $13, reasons = $14::text[],
         tax_ready = true, shipping_ready = true,
         tax_quote_reference = $15, shipping_quote_reference = $16,
         shipping_service = $17, provider = $18,
         provider_request_id = $19, provider_session_id = NULL,
         provider_request_hash = $20, expires_at = $21::timestamptz,
         provider_customer_email = $22, provider_origin = $23,
         provider_request_schema_version = $24, provider_livemode = $25,
         provider_scope = $26
       WHERE id = $1::uuid AND order_id = $2::uuid AND buyer_user_id = $3::uuid
         AND idempotency_key = $4 AND request_hash = $5`,
      attemptValues.slice(0, 26),
    );
  }
  return itemIds;
}

async function createOrLoadPendingReview(
  client: CheckoutSqlClient,
  plan: AuthoritativeCheckoutPlanData,
): Promise<string> {
  if (plan.reviewSnapshotHash === null) throw new Error("Review hash is required");
  type ExistingRow = { id: string; orderId: string; userId: string };
  const collision = await client.query<ExistingRow>(
    `SELECT id::text AS id, order_id::text AS "orderId", user_id::text AS "userId"
     FROM review_requests WHERE snapshot_hash = $1`,
    [plan.reviewSnapshotHash],
  );
  if (collision.rows.length > 0) {
    const row = collision.rows[0]!;
    if (row.orderId !== plan.identity.orderId || row.userId !== plan.buyerUserId) {
      throw new Error("Review snapshot hash ownership conflict");
    }
    return row.id;
  }
  const reviewId = plan.identity.keyedUuid(`review:${plan.reviewSnapshotHash}`);
  const reviewPolicyIds = canonicalReviewPolicies(
    plan.facts.items
      .filter((item) => item.destination.status === "review")
      .map((item) => ({
        id: item.destination.ruleId!,
        version: item.destination.ruleVersion!,
      })),
  ).map((policy) => policy.id);
  await client.query(
    `INSERT INTO review_requests
      (id, user_id, order_id, snapshot_hash, buyer_status_snapshot,
       attestation_version_id, destination_state_code, cart_snapshot,
       buyer_review_required, destination_review_required, created_at)
     VALUES
      ($1::uuid, $2::uuid, $3::uuid, $4, $5::buyer_status, $6::uuid,
       $7, $8::jsonb, $9, $10, $11::timestamptz)`,
    [
      reviewId,
      plan.buyerUserId,
      plan.identity.orderId,
      plan.reviewSnapshotHash,
      plan.facts.buyer.status,
      plan.facts.buyer.currentAttestationVersionId,
      plan.request.destination.stateCode,
      JSON.stringify({
        schemaVersion: 1,
        items: plan.request.items,
        promotionIds: plan.request.promotionIds,
      }),
      plan.facts.buyer.status === "review",
      reviewPolicyIds.length > 0,
      plan.authoritativeAt.toISOString(),
    ],
  );
  for (const policyId of reviewPolicyIds) {
    await client.query(
      `INSERT INTO review_request_destination_policies
        (review_request_id, destination_policy_id, covered)
       VALUES ($1::uuid, $2::uuid, false)`,
      [reviewId, policyId],
    );
  }
  return reviewId;
}

async function reserveInventory(
  client: CheckoutSqlClient,
  plan: AuthoritativeCheckoutPlanData,
  providerPreparation: ProviderPreparation,
  itemIds: ReadonlyMap<string, string>,
): Promise<void> {
  const requestedByProduct = new Map(
    plan.request.items.map((item) => [item.productId, item.quantity]),
  );
  for (const fact of plan.facts.items.toSorted((a, b) => a.productId.localeCompare(b.productId))) {
    let remaining = requestedByProduct.get(fact.productId)!;
    const allocationLots = fact.eligibleLots.toSorted((left, right) => {
      if (left.expiresAt === null && right.expiresAt !== null) return 1;
      if (left.expiresAt !== null && right.expiresAt === null) return -1;
      if (left.expiresAt !== null && right.expiresAt !== null) {
        const expiry = left.expiresAt.localeCompare(right.expiresAt);
        if (expiry !== 0) return expiry;
      }
      return left.id.localeCompare(right.id);
    });
    for (const lot of allocationLots) {
      if (remaining === 0) break;
      const allocation = Math.min(remaining, lot.availableQuantity);
      type BalanceRow = { balanceAfter: number | string };
      const updated = await client.query<BalanceRow>(
        `UPDATE lots SET available_quantity = available_quantity - $2,
                         updated_at = $3::timestamptz
         WHERE id = $1::uuid AND status = 'released'
           AND available_quantity >= $2
         RETURNING available_quantity AS "balanceAfter"`,
        [lot.id, allocation, plan.authoritativeAt.toISOString()],
      );
      if (updated.rows.length !== 1) throw new Error("Inventory allocation lost");
      const orderItemId = itemIds.get(fact.productId)!;
      const reservationId = plan.identity.keyedUuid(
        `reservation:${orderItemId}:${lot.id}`,
      );
      await client.query(
        `INSERT INTO inventory_reservations
          (id, checkout_attempt_id, idempotency_key, order_id, order_item_id,
           product_id, lot_id, quantity_reserved, quantity_remaining, state,
           expires_at, created_at, updated_at)
         VALUES
          ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6::uuid, $7::uuid,
           $8, $8, 'active', $9::timestamptz, $10::timestamptz, $10::timestamptz)`,
        [
          reservationId,
          plan.identity.attemptId,
          `reservation:${plan.identity.attemptId}:${orderItemId}:${lot.id}`,
          plan.identity.orderId,
          orderItemId,
          fact.productId,
          lot.id,
          allocation,
          providerPreparation.providerExpiresAt,
          plan.authoritativeAt.toISOString(),
        ],
      );
      await client.query(
        `INSERT INTO inventory_events
          (id, idempotency_key, event_type, lot_id, order_id, order_item_id,
           reservation_id, quantity, balance_after, occurred_at)
         VALUES
          ($1::uuid, $2, 'reservation', $3::uuid, $4::uuid, $5::uuid,
           $6::uuid, $7, $8, $9::timestamptz)`,
        [
          plan.identity.keyedUuid(`inventory-event:reservation:${reservationId}`),
          `inventory:reservation:${reservationId}`,
          lot.id,
          plan.identity.orderId,
          orderItemId,
          reservationId,
          allocation,
          safeInteger(updated.rows[0]!.balanceAfter),
          plan.authoritativeAt.toISOString(),
        ],
      );
      remaining -= allocation;
    }
    if (remaining !== 0) throw new Error("Inventory became insufficient");
  }
}

async function prepareInTransaction(
  client: CheckoutSqlClient,
  plan: AuthoritativeCheckoutPlanData,
  providerPreparation: ProviderPreparation | null,
  sha256: Sha256Hasher,
): Promise<CheckoutPrepareResult> {
  const buyer = await readBuyerFacts(
    client,
    plan.buyerUserId,
    plan.authoritativeAt,
    true,
  );
  if (buyer === null) return { status: "facts_changed_retry" };

  let existing = await storedAttemptFromClient(
    client,
    { buyerUserId: plan.buyerUserId, idempotencyKey: plan.idempotencyKey },
    true,
    false,
  );
  if (existing !== null) {
    if (existing.requestHash !== plan.requestHash) {
      return { status: "idempotency_conflict" };
    }
    if (
      existing.orderId !== plan.identity.orderId ||
      existing.attemptId !== plan.identity.attemptId
    ) {
      return { status: "idempotency_conflict" };
    }
    const mutableReview =
      existing.status === "created" &&
      !existing.permitted &&
      existing.reviewRequired &&
      !existing.hasReservations;
    if (!mutableReview) {
      return projectLoadedCheckoutAttempt(existing);
    }
    type LockedOrderRow = { id: string; state: OrderState };
    const lockedOrder = await client.query<LockedOrderRow>(
      `SELECT id::text AS id, state
       FROM orders WHERE id = $1::uuid FOR UPDATE`,
      [existing.orderId],
    );
    if (lockedOrder.rows.length !== 1) return { status: "facts_changed_retry" };
    existing = Object.freeze({
      ...existing,
      orderState: lockedOrder.rows[0]!.state,
    });
    if (existing.orderState !== "eligibility_review") {
      return projectLoadedCheckoutAttempt(existing);
    }
  }

  if (existing === null) {
    // No order exists yet; its stable ID is checked for collision without locking a
    // parent that this transaction will create.
    const orderCollision = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM orders WHERE id = $1::uuid`,
      [plan.identity.orderId],
    );
    if (orderCollision.rows.length > 0) return { status: "idempotency_conflict" };
  }

  if (plan.reviewSnapshotHash !== null && existing !== null) {
    const lockedReviews = await client.query<{ id: string }>(
      `SELECT id::text AS id FROM review_requests
       WHERE order_id = $1::uuid AND snapshot_hash = $2
       ORDER BY id FOR UPDATE`,
      [plan.identity.orderId, plan.reviewSnapshotHash],
    );
    if (lockedReviews.rows.length > 1) {
      throw new Error("Duplicate exact review request");
    }
    if (lockedReviews.rows.length === 1) {
      await client.query(
        `SELECT destination_policy_id
         FROM review_request_destination_policies
         WHERE review_request_id = $1::uuid
         ORDER BY destination_policy_id FOR UPDATE`,
        [lockedReviews.rows[0]!.id],
      );
    }
  }
  if (existing !== null) {
    await client.query(
      `SELECT id FROM order_items WHERE order_id = $1::uuid ORDER BY id FOR UPDATE`,
      [plan.identity.orderId],
    );
  }

  const loaded = await loadFactsFromClient(client, {
    buyerUserId: plan.buyerUserId,
    request: plan.request,
    now: plan.authoritativeAt,
    lock: true,
    buyer,
    beforeLots: async () => {
      if (existing !== null) {
        await client.query(
          `SELECT id FROM inventory_reservations
           WHERE checkout_attempt_id = $1::uuid ORDER BY id FOR UPDATE`,
          [plan.identity.attemptId],
        );
      }
    },
  });
  if (!loaded.ok) return { status: "facts_changed_retry" };
  const facts = loaded.value;
  const factsHash = await hashCanonicalEnvelope(
    {
      schemaVersion: 1,
      kind: "authoritative_checkout_facts",
      authoritativeAt: plan.authoritativeAt.toISOString(),
      request: plan.request,
      facts,
    },
    sha256,
  );
  if (factsHash !== plan.factsHash) return { status: "facts_changed_retry" };

  if (plan.reviewSnapshotHash !== null) {
    if (facts.buyer.acceptedAttestationVersionId === null) {
      return { status: "facts_changed_retry" };
    }
    const recomputed = await hashReviewSnapshot(
      {
        orderId: plan.identity.orderId,
        buyerUserId: plan.buyerUserId,
        buyerStatus: facts.buyer.status,
        acceptedAttestationVersionId:
          facts.buyer.acceptedAttestationVersionId,
        currentAttestationVersionId: facts.buyer.currentAttestationVersionId,
        items: plan.request.items,
        promotionIds: plan.request.promotionIds,
        destination: plan.request.destination,
        reviewPolicies: facts.items
          .filter((item) => item.destination.status === "review")
          .map((item) => ({
            id: item.destination.ruleId!,
            version: item.destination.ruleVersion!,
          })),
      },
      sha256,
    );
    if (recomputed !== plan.reviewSnapshotHash) {
      return { status: "facts_changed_retry" };
    }
  }
  const exactReview =
    plan.reviewSnapshotHash === null || existing === null
      ? null
      : await findExactReviewByHash(
          client,
          {
            orderId: plan.identity.orderId,
            buyerUserId: plan.buyerUserId,
            snapshotHash: plan.reviewSnapshotHash,
          },
          false,
        );
  const decision = currentDecision(plan, facts, exactReview);

  if (
    decision.reasons.length === 1 &&
    decision.reasons[0] === "review_rejected" &&
    exactReview?.outcome === "rejected" &&
    existing !== null
  ) {
    authoritativeCancellationState(plan.identity.orderId, "eligibility_review");
    await client.query(
      `UPDATE checkout_attempts SET status = 'failed', permitted = false,
          review_required = false, reasons = ARRAY['review_rejected']::text[]
       WHERE id = $1::uuid AND status = 'created' AND permitted = false`,
      [plan.identity.attemptId],
    );
    await client.query(
      `UPDATE orders SET state = 'cancelled', updated_at = $2::timestamptz
       WHERE id = $1::uuid AND state = 'eligibility_review'`,
      [plan.identity.orderId, plan.authoritativeAt.toISOString()],
    );
    return {
      status: "review_rejected",
      orderId: plan.identity.orderId,
      attemptId: plan.identity.attemptId,
    };
  }

  if (
    decision.permitted !== plan.decision.permitted ||
    decision.reviewRequired !== plan.decision.reviewRequired ||
    decision.reasons.join("|") !== plan.decision.reasons.join("|")
  ) {
    return { status: "facts_changed_retry" };
  }

  if (decision.reviewRequired) {
    if (providerPreparation !== null) return { status: "facts_changed_retry" };
    const itemIds = await writeCommercialSnapshots(
      client,
      { ...plan, facts, decision },
      null,
      "eligibility_review",
      existing,
    );
    if (itemIds === null) return { status: "facts_changed_retry" };
    const reviewRequestId = await createOrLoadPendingReview(client, {
      ...plan,
      facts,
      decision,
    });
    return {
      status: "review_required",
      orderId: plan.identity.orderId,
      attemptId: plan.identity.attemptId,
      reviewRequestId,
      quote: plan.browserQuote,
    };
  }

  if (!decision.permitted || providerPreparation === null) {
    return { status: "facts_changed_retry" };
  }

  // Final locked review re-read and gate evaluation immediately before any
  // authority or inventory write. The order -> exact review lock is retained.
  const finalReview =
    plan.reviewSnapshotHash === null
      ? null
      : await findExactReviewByHash(
          client,
          {
            orderId: plan.identity.orderId,
            buyerUserId: plan.buyerUserId,
            snapshotHash: plan.reviewSnapshotHash,
          },
          false,
        );
  const finalDecision = currentDecision(plan, facts, finalReview);
  if (!finalDecision.permitted || finalDecision.reviewRequired) {
    return { status: "facts_changed_retry" };
  }

  const itemIds = await writeCommercialSnapshots(
    client,
    { ...plan, facts, decision: finalDecision },
    providerPreparation,
    "checkout_pending",
    existing,
  );
  if (itemIds === null) return { status: "facts_changed_retry" };
  if (plan.referralQuote !== null && plan.affiliateQuote !== null) {
    throw new AffiliateBindingConflict();
  }
  if (plan.referralQuote !== null) {
    await bindCustomerReferralOrderInTransaction(client, {
      attributionId: plan.identity.keyedUuid("customer-referral-attribution"),
      conversionId: plan.identity.keyedUuid("customer-referral-conversion"),
      buyerUserId: plan.buyerUserId,
      orderId: plan.identity.orderId,
      idempotencyKey: `customer-referral:${plan.idempotencyKey}`,
      quote: plan.referralQuote,
      referredDiscountMinor: plan.referralDiscountMinor,
      boundAt: plan.authoritativeAt,
    });
  }
  if (plan.affiliateQuote !== null) {
    await bindAffiliateOrderInTransaction(client, {
      attributionId: plan.identity.keyedUuid("affiliate-attribution"),
      buyerUserId: plan.buyerUserId,
      orderId: plan.identity.orderId,
      quote: plan.affiliateQuote,
      boundAt: plan.authoritativeAt,
    });
  }
  if (plan.rewardsQuote?.status === "applied") {
    const rewardReservation = await reserveCheckoutRewardsInTransaction(
      client,
      {
        buyerUserId: plan.buyerUserId,
        rewardAccountId: plan.rewardsQuote.rewardAccountId,
        orderId: plan.identity.orderId,
        checkoutAttemptId: plan.identity.attemptId,
        loyaltyPolicyId: plan.rewardsQuote.loyaltyPolicyId,
        loyaltyPolicyVersion: plan.rewardsQuote.loyaltyPolicyVersion,
        termsVersionId: plan.rewardsQuote.termsVersionId,
        termsContentHash: plan.rewardsQuote.termsContentHash,
        idempotencyKey: plan.idempotencyKey,
        redemptionPoints: plan.rewardsQuote.redemptionPoints,
        redemptionMinor: plan.rewardsQuote.redemptionMinor,
        reservedAt: plan.authoritativeAt,
      },
      plan.identity.keyedUuid,
    );
    if (
      rewardReservation.status !== "reserved" &&
      rewardReservation.status !== "idempotent"
    ) {
      throw new RewardReservationRejected();
    }
  }
  await reserveInventory(client, { ...plan, facts, decision: finalDecision }, providerPreparation, itemIds);
  return {
    status: "prepared",
    orderId: plan.identity.orderId,
    attemptId: plan.identity.attemptId,
    reviewRequestId: finalReview?.reviewRequestId ?? null,
    quote: plan.browserQuote,
  };
}

function isDefiniteFailureInput(value: unknown): value is DefiniteFailureReleaseInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as DefiniteFailureReleaseInput;
  const keys = Object.keys(candidate).toSorted();
  const expected = [
    "authority",
    "cause",
    "providerEvidenceId",
    "attemptId",
    "orderId",
    "provider",
    "providerIdempotencyKey",
    "targetAttemptStatus",
    ...(candidate.cause === "verified_expiry"
      ? [
          "providerSessionId",
          "providerLivemode",
          "providerScope",
          "amountMinor",
          "currency",
        ]
      : []),
  ].toSorted();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index]) &&
    candidate.authority === "authoritative_provider_terminal" &&
    ((candidate.cause === "definite_rejection" && candidate.targetAttemptStatus === "failed") ||
      (candidate.cause === "verified_expiry" && candidate.targetAttemptStatus === "expired")) &&
    nonblank(candidate.providerEvidenceId) &&
    (candidate.cause !== "verified_expiry" ||
      (nonblank(candidate.providerSessionId) &&
        typeof candidate.providerLivemode === "boolean" &&
        nonblank(candidate.providerScope) &&
        Number.isSafeInteger(candidate.amountMinor) &&
        candidate.amountMinor > 0 &&
        candidate.currency === "USD")) &&
    isCanonicalUuid(candidate.attemptId) &&
    isCanonicalUuid(candidate.orderId) &&
    (candidate.provider === "stripe" || candidate.provider === "local_test") &&
    candidate.providerIdempotencyKey === `checkout_attempt:${candidate.attemptId}`
  );
}

function isCheckoutIdentityRace(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (Reflect.get(error, "code") !== "23505") return false;
  const constraint = Reflect.get(error, "constraint");
  return (
    constraint === "checkout_attempts_buyer_idempotency_unique" ||
    constraint === "checkout_attempts_pkey" ||
    constraint === "orders_pkey"
  );
}

class RewardReservationRejected extends Error {
  constructor() {
    super("Authoritative reward reservation was rejected");
    this.name = "RewardReservationRejected";
  }
}

export async function releaseCheckoutReservationsForDefiniteFailureInTransaction(
  client: CheckoutSqlClient,
  buyerUserId: string,
  input: DefiniteFailureReleaseInput,
  keyedUuid: KeyedUuidGenerator,
): Promise<DefiniteFailureReleaseResult> {
  await client.query(`SELECT id FROM users WHERE id = $1::uuid FOR UPDATE`, [buyerUserId]);
  await client.query(
    `SELECT user_id FROM buyer_profiles WHERE user_id = $1::uuid FOR UPDATE`,
    [buyerUserId],
  );
  type AttemptRow = {
    status: StoredCheckoutAttempt["status"];
    orderId: string;
    buyerUserId: string;
    provider: string | null;
    providerRequestId: string | null;
    providerSessionId: string | null;
    providerLivemode: boolean | null;
    providerScope: string | null;
  };
  const attempt = await client.query<AttemptRow>(
    `SELECT status, order_id::text AS "orderId",
            buyer_user_id::text AS "buyerUserId", provider,
            provider_request_id AS "providerRequestId",
             provider_session_id AS "providerSessionId",
             provider_livemode AS "providerLivemode",
             provider_scope AS "providerScope"
     FROM checkout_attempts WHERE id = $1::uuid FOR UPDATE`,
    [input.attemptId],
  );
  if (attempt.rows.length !== 1) return { status: "conflict" };
  const attemptRow = attempt.rows[0]!;
  if (
    attemptRow.orderId !== input.orderId ||
    attemptRow.buyerUserId !== buyerUserId ||
    attemptRow.provider !== input.provider ||
    attemptRow.providerRequestId !== input.providerIdempotencyKey ||
    (input.cause === "verified_expiry" &&
      (attemptRow.providerSessionId !== null &&
        attemptRow.providerSessionId !== input.providerSessionId ||
        attemptRow.providerLivemode !== input.providerLivemode ||
        attemptRow.providerScope !== input.providerScope))
  ) {
    return { status: "conflict" };
  }
  type OrderRow = {
    state: string;
    totalMinor: number | string;
    currency: string;
  };
  const order = await client.query<OrderRow>(
    `SELECT state, total_minor AS "totalMinor", currency
     FROM orders WHERE id = $1::uuid FOR UPDATE`,
    [input.orderId],
  );
  if (order.rows.length !== 1) return { status: "conflict" };
  if (
    input.cause === "verified_expiry" &&
    (safeInteger(order.rows[0]!.totalMinor) !== input.amountMinor ||
      order.rows[0]!.currency !== input.currency)
  ) {
    return { status: "conflict" };
  }

  type PaymentRow = { eventType: string };
  const payments = await client.query<PaymentRow>(
    `SELECT event_type AS "eventType" FROM payment_events
     WHERE order_id = $1::uuid ORDER BY id FOR UPDATE`,
    [input.orderId],
  );
  if (payments.rows.some((payment) => payment.eventType === "payment_verified")) {
    return { status: "payment_verified" };
  }

  type ReservationRow = {
    id: string;
    state: "active" | "consumed" | "released" | "expired";
    quantityReserved: number | string;
    quantityRemaining: number | string;
    lotId: string;
    orderItemId: string;
  };
  const reservations = await client.query<ReservationRow>(
    `SELECT id::text AS id, state, quantity_reserved AS "quantityReserved",
            quantity_remaining AS "quantityRemaining", lot_id::text AS "lotId",
            order_item_id::text AS "orderItemId"
     FROM inventory_reservations
     WHERE checkout_attempt_id = $1::uuid
     ORDER BY id FOR UPDATE`,
    [input.attemptId],
  );
  if (reservations.rows.length === 0) return { status: "conflict" };
  const terminalState = input.targetAttemptStatus === "expired" ? "expired" : "released";
  const allTerminal = reservations.rows.every(
    (reservation) =>
      reservation.state === terminalState &&
      safeInteger(reservation.quantityRemaining) === 0,
  );
  const rewardsRelease = await releaseCheckoutRewardsInTransaction(
    client,
    {
      buyerUserId,
      orderId: input.orderId,
      checkoutAttemptId: input.attemptId,
      releasedAt: new Date(),
    },
    keyedUuid,
  );
  if (rewardsRelease === "conflict") return { status: "conflict" };
  if (attemptRow.status === input.targetAttemptStatus && allTerminal) {
    return { status: "already_released" };
  }
  if (
    !orderStatesBeforePayment.has(order.rows[0]!.state) ||
    !(
      ["created", "open", "provider_unknown"].includes(attemptRow.status) ||
      (input.cause === "verified_expiry" && attemptRow.status === "completed")
    ) ||
    reservations.rows.some(
      (reservation) =>
        reservation.state !== "active" ||
        safeInteger(reservation.quantityRemaining) !==
          safeInteger(reservation.quantityReserved),
    )
  ) {
    return { status: "conflict" };
  }
  const cancelledOrderState = authoritativeCancellationState(
    input.orderId,
    order.rows[0]!.state as "checkout_pending" | "payment_failed",
    input.providerEvidenceId,
    input.cause === "verified_expiry" ? "checkout_expired" : "payment_failed",
  );

  const lotIds = [...new Set(reservations.rows.map((row) => row.lotId))].toSorted();
  for (const lotId of lotIds) {
    await client.query(`SELECT id FROM lots WHERE id = $1::uuid FOR UPDATE`, [lotId]);
  }
  for (const reservation of reservations.rows) {
    type LotRow = { balanceAfter: number | string };
    const lot = await client.query<LotRow>(
      `UPDATE lots SET available_quantity = available_quantity + $2,
                       updated_at = now()
       WHERE id = $1::uuid
         AND available_quantity + $2 <= received_quantity
       RETURNING available_quantity AS "balanceAfter"`,
      [reservation.lotId, safeInteger(reservation.quantityReserved)],
    );
    if (lot.rows.length !== 1) throw new Error("Inventory release exceeds received stock");
    await client.query(
      `UPDATE inventory_reservations
       SET state = $2::reservation_state, quantity_remaining = 0, updated_at = now()
       WHERE id = $1::uuid AND state = 'active'`,
      [reservation.id, terminalState],
    );
    const eventId = keyedUuid(`inventory-event:release:${reservation.id}`);
    if (!isCanonicalUuid(eventId)) throw new Error("Invalid deterministic release event UUID");
    await client.query(
      `INSERT INTO inventory_events
        (id, idempotency_key, event_type, lot_id, order_id, order_item_id,
         reservation_id, fulfillment_release_id, quantity, balance_after)
       VALUES
        ($1::uuid, $2, 'release', $3::uuid, $4::uuid, $5::uuid,
         $6::uuid, NULL, $7, $8)`,
      [
        eventId,
        `inventory:release:${reservation.id}`,
        reservation.lotId,
        input.orderId,
        reservation.orderItemId,
        reservation.id,
        safeInteger(reservation.quantityReserved),
        safeInteger(lot.rows[0]!.balanceAfter),
      ],
    );
  }
  await client.query(
    `UPDATE checkout_attempts
     SET status = $2::checkout_attempt_status,
         provider_session_id = CASE WHEN $2 = 'expired'
           THEN COALESCE(provider_session_id, $3) ELSE provider_session_id END
     WHERE id = $1::uuid`,
    [
      input.attemptId,
      input.targetAttemptStatus,
      input.cause === "verified_expiry" ? input.providerSessionId : null,
    ],
  );
  await client.query(
    `UPDATE orders SET state = $2::order_state, updated_at = now()
     WHERE id = $1::uuid`,
    [input.orderId, cancelledOrderState],
  );
  return { status: "released" };
}

export function createPostgresCheckoutRepository(dependencies: Readonly<{
  client: CheckoutSqlClient;
  runTransaction: CheckoutTransactionRunner;
  sha256: Sha256Hasher;
  keyedUuid?: KeyedUuidGenerator;
  retrySleep?: (
    retryNumber: 1 | 2,
    sqlState: "40001" | "40P01",
  ) => Promise<void>;
}>): CheckoutRepository {
  const releaseKeyedUuid = dependencies.keyedUuid;
  const retryOptions =
    dependencies.retrySleep === undefined
      ? {}
      : { sleep: dependencies.retrySleep };
  return Object.freeze({
    findAttempt(input) {
      return storedAttemptFromClient(dependencies.client, input, false);
    },
    loadFacts(input) {
      return loadFactsFromClient(dependencies.client, { ...input, lock: false });
    },
    findExactReview(input) {
      return findExactReviewByHash(dependencies.client, input, false);
    },
    async prepare(plan, providerPreparation) {
      try {
        return await runSerializableWithRetry(
          () =>
            dependencies.runTransaction(
              (client) =>
                prepareInTransaction(
                  client,
                  plan,
                  providerPreparation,
                  dependencies.sha256,
                ),
              { isolationLevel: "serializable" },
            ),
          retryOptions,
        );
      } catch (error) {
        if (
          error instanceof RewardReservationRejected ||
          error instanceof ReferralBindingConflict ||
          error instanceof AffiliateBindingConflict
        ) {
          return { status: "facts_changed_retry" };
        }
        if (!isCheckoutIdentityRace(error)) throw error;
        const winner = await storedAttemptFromClient(
          dependencies.client,
          {
            buyerUserId: plan.buyerUserId,
            idempotencyKey: plan.idempotencyKey,
          },
          false,
        );
        if (winner === null) throw error;
        if (winner.requestHash !== plan.requestHash) {
          return { status: "idempotency_conflict" };
        }
        return projectLoadedCheckoutAttempt(winner);
      }
    },
    async releaseDefiniteFailure(input) {
      if (!isDefiniteFailureInput(input) || releaseKeyedUuid === undefined) {
        return { status: "conflict" };
      }
      type BuyerRow = { buyerUserId: string };
      const discovered = await dependencies.client.query<BuyerRow>(
        `SELECT buyer_user_id::text AS "buyerUserId"
         FROM checkout_attempts WHERE id = $1::uuid AND order_id = $2::uuid`,
        [input.attemptId, input.orderId],
      );
      if (discovered.rows.length !== 1) return { status: "conflict" };
      return runSerializableWithRetry(
        () =>
          dependencies.runTransaction(
            (client) =>
              releaseCheckoutReservationsForDefiniteFailureInTransaction(
                client,
                discovered.rows[0]!.buyerUserId,
                input,
                releaseKeyedUuid,
              ),
            { isolationLevel: "serializable" },
          ),
        retryOptions,
      );
    },
  });
}
