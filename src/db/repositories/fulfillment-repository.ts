import "server-only";

import {
  canonicalJson,
  hashReviewSnapshot,
  isCanonicalUuid,
  isSha256,
  type KeyedUuidGenerator,
  type ReviewSnapshotHashInput,
  type Sha256Hasher,
} from "@/commerce/checkout-identity";
import {
  deriveProviderRestrictionsV1,
  type ProviderRestrictionEventRowV1,
} from "@/commerce/fulfillment-facts";
import {
  hasExactCheckoutProviderArtifact,
  hasExactProviderEventEnvelopeIdentity,
} from "@/commerce/payment-authority";
import type { ProviderKind } from "@/commerce/provider-contracts";
import { parseNormalizedProviderEventV1 } from "@/commerce/provider-events";
import type {
  FulfillmentCommandRepository,
  FulfillmentCommandResultV1,
} from "@/commerce/fulfillment-service";
import type { ExactReviewDecision } from "@/commerce/checkout-service";
import {
  resolveExactReviewRequest,
  type CheckoutSqlClient,
} from "@/db/repositories/checkout-repository";
import { runSerializableWithRetry } from "@/db/serializable-retry";
import {
  resolveDestination,
  type BuyerStatus,
  type DestinationRule,
} from "@/domain/eligibility";
import { evaluateFulfillment } from "@/domain/fulfillment";
import {
  transitionFulfillmentRelease,
  transitionOrder,
  type FulfillmentReleaseSnapshot,
  type OrderSnapshot,
  type OrderState,
} from "@/domain/orders";
import {
  transitionShipment as transitionShipmentState,
  type ShipmentSnapshot,
  type ShipmentState,
} from "@/domain/shipments";

export type FulfillmentSqlClient = CheckoutSqlClient;

export type FulfillmentTransactionRunner = <Value>(
  work: (client: FulfillmentSqlClient) => Promise<Value>,
  options: Readonly<{ isolationLevel: "serializable" }>,
) => Promise<Value>;

type CommandInput = Readonly<{
  actorUserId: string;
  actorClerkUserId: string;
  orderId: string;
  now: Date;
  correlationId: string;
}>;

type OrderRow = Readonly<{
  id: string;
  buyerUserId: string;
  attestationAcceptanceId: string;
  destinationStateCode: string;
  currency: string;
  totalMinor: number | string;
  state: OrderState;
}>;

type HistoricalAttestationRow = Readonly<{
  acceptanceId: string;
  buyerUserId: string;
  attestationVersionId: string;
}>;

type AttemptRow = Readonly<{
  id: string;
  orderId: string;
  buyerUserId: string;
  status: string;
  provider: string | null;
  providerRequestId: string | null;
  providerSessionId: string | null;
  providerRequestHash: string | null;
  providerRequestSchemaVersion: number | string | null;
  providerLivemode: boolean | null;
  providerScope: string | null;
  reviewAuthorizationMode: string | null;
}>;

type PaymentRow = Readonly<{
  id: string;
  providerEventDatabaseId: string;
  providerEventExternalId: string;
  eventType: string;
  providerPaymentId: string | null;
  idempotencyKey: string;
  amountMinor: number | string;
  currency: string;
  provider: string;
  providerEventStatus: string;
  sourceLivemode: boolean;
  normalizedPayload: unknown;
}>;

type RefundRow = Readonly<{
  id: string;
  orderId: string;
  requestedByUserId: string | null;
  verifiedPaymentEventId: string;
  provider: string;
  providerEventId: string | null;
  providerRefundId: string | null;
  idempotencyKey: string;
  requestedAmountMinor: number | string;
  confirmedAmountMinor: number | string | null;
  currency: string;
  status: string;
  origin: string;
  providerRequestHash: string | null;
  attemptCount: number | string;
  submittedAt: Date | string | null;
  confirmedAt: Date | string | null;
  lastErrorRedacted: string | null;
  sourceProvider: string | null;
  sourceProviderEventId: string | null;
  sourceStatus: string | null;
  sourceLivemode: boolean | null;
  normalizedPayload: unknown;
}>;

type ShipmentRow = Readonly<{
  id: string;
  orderId: string;
  fulfillmentReleaseId: string | null;
  state: ShipmentState;
  handedOffAt: Date | string | null;
  deliveredAt: Date | string | null;
}>;

type ReleaseRow = Readonly<{
  id: string;
  orderId: string;
  version: number | string;
  idempotencyKey: string;
  paymentEventId: string;
  reviewRequestId: string | null;
  state: "issued" | "revoked" | "expired" | "consumed";
  issuedAt: Date | string;
  expiresAt: Date | string;
  revokedAt: Date | string | null;
  expiredAt: Date | string | null;
  consumedAt: Date | string | null;
}>;

type ItemRow = Readonly<{
  id: string;
  orderId: string;
  productId: string;
  variantId: string | null;
  quantity: number | string;
  productStatus: string;
  policyGroupId: string;
  policyGroupActive: boolean;
}>;

type AddressRow = Readonly<{
  recipientName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateCode: string;
  postalCode: string;
  country: string;
}>;

type PolicyRow = Readonly<{
  id: string;
  scopeKind: "product" | "policy_group";
  productId: string | null;
  policyGroupId: string | null;
  stateCode: string;
  result: "allowed" | "review" | "blocked";
  version: number | string;
  active: boolean;
}>;

type ReservationRow = Readonly<{
  id: string;
  checkoutAttemptId: string;
  orderId: string;
  orderItemId: string;
  productId: string;
  lotId: string;
  quantityReserved: number | string;
  quantityRemaining: number | string;
  state: string;
}>;

type LotRow = Readonly<{
  id: string;
  productId: string;
  availableQuantity: number | string;
  status: string;
  expiresAt: Date | string | null;
}>;

type AttemptReviewBinding = Readonly<{
  checkoutAttemptId: string;
  orderId: string;
  reviewRequestId: string;
  reviewSnapshotHash: string;
  cartSnapshot: unknown;
}>;

type ReviewBindingRead = Readonly<
  | { status: "none" }
  | { status: "invalid" }
  | { status: "bound"; value: AttemptReviewBinding }
>;

type LockedCatalog = Readonly<{
  items: readonly ItemRow[];
  address: AddressRow | null;
  promotionIds: readonly string[];
  policies: readonly PolicyRow[];
}>;

type Discovery = Readonly<{
  order: OrderRow;
  attemptId: string | null;
  reviewBinding: AttemptReviewBinding | null;
  reviewInput: ReviewSnapshotHashInput | null;
  reviewNeeded: boolean;
  reviewAuthorizationMode: string | null;
}>;

type ExactPayment = Readonly<{
  payment: PaymentRow;
  attempt: AttemptRow;
  provider: ProviderKind;
  paymentIntentId: string;
  livemode: boolean;
  amountMinor: number;
}>;

type LockedFacts = Readonly<{
  order: OrderRow;
  payment: ExactPayment | null;
  refundPending: boolean;
  confirmedRefundAmountMinor: number;
  paymentDisputed: boolean;
  financialConflict: boolean;
  shipment: ShipmentRow | null;
  releases: readonly ReleaseRow[];
  catalog: LockedCatalog;
  reservations: readonly ReservationRow[];
  lots: readonly LotRow[];
  review: ExactReviewDecision | null;
  finalReviewHashMatches: boolean;
}>;

const fiveMinutesMs = 5 * 60 * 1000;
const paidStates = new Set<OrderState>([
  "paid_pending_fulfillment",
  "paid_on_hold",
]);

function safeInteger(value: unknown): number | null {
  const converted = Number(value);
  return Number.isSafeInteger(converted) ? converted : null;
}

function iso(value: Date | string): string | null {
  const converted = value instanceof Date ? value : new Date(value);
  return Number.isFinite(converted.getTime()) ? converted.toISOString() : null;
}

function providerKind(value: unknown): value is ProviderKind {
  return value === "stripe" || value === "local_test";
}

function reviewAuthorizationMode(
  value: unknown,
): "bound" | "none" | null {
  return value === "bound" || value === "none" ? value : null;
}

function boundedText(value: unknown, maximum = 200): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function validCommand(input: CommandInput): boolean {
  return (
    isCanonicalUuid(input.actorUserId) &&
    boundedText(input.actorClerkUserId) &&
    isCanonicalUuid(input.orderId) &&
    Number.isFinite(input.now.getTime()) &&
    boundedText(input.correlationId)
  );
}

async function readOrder(
  client: FulfillmentSqlClient,
  orderId: string,
  lock: boolean,
): Promise<OrderRow | null> {
  const result = await client.query<OrderRow>(
    `SELECT id::text AS id, buyer_user_id::text AS "buyerUserId",
            attestation_acceptance_id::text AS "attestationAcceptanceId",
            destination_state_code AS "destinationStateCode", currency,
            total_minor AS "totalMinor", state
     FROM orders WHERE id = $1::uuid${lock ? " FOR UPDATE" : ""}`,
    [orderId],
  );
  return result.rows.length === 1 ? result.rows[0]! : null;
}

async function readAttemptDiscovery(
  client: FulfillmentSqlClient,
  orderId: string,
): Promise<string | null> {
  const rows = await client.query<{
    normalizedPayload: unknown;
  }>(
    `SELECT source.normalized_payload AS "normalizedPayload"
     FROM payment_events payment
     JOIN provider_events source ON source.id = payment.provider_event_id
     WHERE payment.order_id = $1::uuid
       AND payment.event_type = 'payment_verified'
     ORDER BY payment.id`,
    [orderId],
  );
  if (rows.rows.length !== 1) return null;
  const source = parseNormalizedProviderEventV1(
    rows.rows[0]!.normalizedPayload,
  );
  return source?.kind === "checkout_session" && source.orderId === orderId
    ? source.attemptId
    : null;
}

async function readAttemptReviewAuthorizationMode(
  client: FulfillmentSqlClient,
  attemptId: string | null,
): Promise<string | null> {
  if (attemptId === null) return null;
  const result = await client.query<{ mode: string | null }>(
    `SELECT review_authorization_mode AS mode
     FROM checkout_attempts WHERE id = $1::uuid`,
    [attemptId],
  );
  return result.rows.length === 1 ? result.rows[0]!.mode : null;
}

async function readAttemptReviewBinding(
  client: FulfillmentSqlClient,
  attemptId: string | null,
  expectedOrderId: string,
  lock: boolean,
): Promise<ReviewBindingRead> {
  if (attemptId === null) return Object.freeze({ status: "none" });
  const bindings = await client.query<{
    checkoutAttemptId: string;
    orderId: string;
    reviewRequestId: string;
    reviewSnapshotHash: string;
  }>(
    `SELECT checkout_attempt_id::text AS "checkoutAttemptId",
            order_id::text AS "orderId",
            review_request_id::text AS "reviewRequestId",
            review_snapshot_hash AS "reviewSnapshotHash"
     FROM checkout_attempt_review_bindings
     WHERE checkout_attempt_id = $1::uuid${lock ? " FOR UPDATE" : ""}`,
    [attemptId],
  );
  if (bindings.rows.length === 0) return Object.freeze({ status: "none" });
  if (bindings.rows.length !== 1) return Object.freeze({ status: "invalid" });
  const binding = bindings.rows[0]!;
  if (
    binding.checkoutAttemptId !== attemptId ||
    binding.orderId !== expectedOrderId ||
    !isCanonicalUuid(binding.checkoutAttemptId) ||
    !isCanonicalUuid(binding.orderId) ||
    !isCanonicalUuid(binding.reviewRequestId) ||
    !isSha256(binding.reviewSnapshotHash)
  ) {
    return Object.freeze({ status: "invalid" });
  }
  const reviews = await client.query<{
    reviewRequestId: string;
    orderId: string;
    snapshotHash: string;
    cartSnapshot: unknown;
  }>(
    `SELECT id::text AS "reviewRequestId", order_id::text AS "orderId",
            snapshot_hash AS "snapshotHash", cart_snapshot AS "cartSnapshot"
     FROM review_requests
     WHERE id = $1::uuid AND order_id = $2::uuid AND snapshot_hash = $3${
       lock ? " FOR UPDATE" : ""
     }`,
    [binding.reviewRequestId, binding.orderId, binding.reviewSnapshotHash],
  );
  if (reviews.rows.length !== 1) return Object.freeze({ status: "invalid" });
  const review = reviews.rows[0]!;
  if (
    review.reviewRequestId !== binding.reviewRequestId ||
    review.orderId !== binding.orderId ||
    review.snapshotHash !== binding.reviewSnapshotHash
  ) {
    return Object.freeze({ status: "invalid" });
  }
  return Object.freeze({
    status: "bound" as const,
    value: Object.freeze({
      ...binding,
      cartSnapshot: review.cartSnapshot,
    }),
  });
}

async function readCatalog(
  client: FulfillmentSqlClient,
  orderId: string,
  destinationStateCode: string,
  now: Date,
  lock: boolean,
): Promise<LockedCatalog> {
  if (lock) {
    const lockedItems = await client.query<{
      id: string;
      productId: string;
    }>(
      `SELECT oi.id::text AS id, oi.product_id::text AS "productId"
       FROM order_items oi
       WHERE oi.order_id = $1::uuid
       ORDER BY oi.id FOR UPDATE`,
      [orderId],
    );
    const productIds = [
      ...new Set(lockedItems.rows.map((row) => row.productId)),
    ].toSorted();
    const lockedProducts = productIds.length === 0
      ? Object.freeze({ rows: [] as Array<{ policyGroupId: string }> })
      : await client.query<{ policyGroupId: string }>(
        `SELECT p.policy_group_id::text AS "policyGroupId"
         FROM products p
         WHERE p.id = ANY($1::uuid[])
         ORDER BY p.id FOR UPDATE`,
        [productIds],
      );
    const policyGroupIds = [
      ...new Set(lockedProducts.rows.map((row) => row.policyGroupId)),
    ].toSorted();
    if (policyGroupIds.length > 0) {
      await client.query(
        `SELECT pg.id::text AS id
         FROM product_policy_groups pg
         WHERE pg.id = ANY($1::uuid[])
         ORDER BY pg.id FOR UPDATE`,
        [policyGroupIds],
      );
    }
  }
  const itemRows = await client.query<ItemRow>(
    `SELECT oi.id::text AS id, oi.order_id::text AS "orderId",
            oi.product_id::text AS "productId",
            oi.variant_id::text AS "variantId", oi.quantity,
            p.status AS "productStatus",
            p.policy_group_id::text AS "policyGroupId",
            pg.active AS "policyGroupActive"
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     JOIN product_policy_groups pg ON pg.id = p.policy_group_id
     WHERE oi.order_id = $1::uuid
     ORDER BY oi.id`,
    [orderId],
  );
  const addressRows = await client.query<AddressRow>(
    `SELECT recipient_name AS "recipientName",
            address_line1 AS "addressLine1",
            address_line2 AS "addressLine2", city,
            state_code AS "stateCode", postal_code AS "postalCode",
            country
     FROM order_shipping_addresses WHERE order_id = $1::uuid${
       lock ? " FOR UPDATE" : ""
     }`,
    [orderId],
  );
  const promotionRows = await client.query<{ promotionId: string }>(
    `SELECT promotion_id::text AS "promotionId"
     FROM order_promotion_applications
     WHERE order_id = $1::uuid
     ORDER BY promotion_id${lock ? " FOR UPDATE" : ""}`,
    [orderId],
  );
  const policies = await client.query<PolicyRow>(
    `SELECT id::text AS id, scope_kind AS "scopeKind",
            product_id::text AS "productId",
            policy_group_id::text AS "policyGroupId",
            state_code AS "stateCode", result, version, active
     FROM destination_policies
     WHERE state_code = $1 AND active = true
       AND effective_at <= $2::timestamptz
       AND (superseded_at IS NULL OR superseded_at > $2::timestamptz)
       AND (product_id = ANY($3::uuid[]) OR policy_group_id = ANY($4::uuid[]))
     ORDER BY id${lock ? " FOR UPDATE" : ""}`,
    [
      destinationStateCode,
      now.toISOString(),
      itemRows.rows.map((row) => row.productId),
      itemRows.rows.map((row) => row.policyGroupId),
    ],
  );
  return Object.freeze({
    items: Object.freeze(itemRows.rows),
    address:
      addressRows.rows.length === 1 ? addressRows.rows[0]! : null,
    promotionIds: Object.freeze(
      promotionRows.rows.map((row) => row.promotionId),
    ),
    policies: Object.freeze(policies.rows),
  });
}

function destinationForItem(
  item: ItemRow,
  destinationStateCode: string,
  policies: readonly PolicyRow[],
) {
  const rules: DestinationRule[] = policies.map((policy) => ({
    id: policy.id,
    version: String(policy.version),
    active: policy.active,
    stateCode: policy.stateCode,
    status: policy.result,
    target:
      policy.scopeKind === "product"
        ? { kind: "product" as const, productId: policy.productId ?? "" }
        : {
            kind: "policy_group" as const,
            productPolicyGroupId: policy.policyGroupId ?? "",
          },
  }));
  return resolveDestination({
    productId: item.productId,
    productPolicyGroupId: item.policyGroupId,
    destinationCode: destinationStateCode,
    rules,
  });
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalReviewCart(
  value: unknown,
  catalogItems: readonly ItemRow[],
): Readonly<{
  items: readonly Readonly<{ variantId: string; quantity: number }>[];
  automaticPromotions: readonly Readonly<{ id: string; version: number }>[];
}> | null {
  const cartKeys = new Set([
    "schemaVersion",
    "kind",
    "items",
    "automaticPromotions",
  ]);
  if (
    !plainRecord(value) ||
    value.schemaVersion !== 2 ||
    value.kind !== "canonical_variant" ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.automaticPromotions) ||
    Reflect.ownKeys(value).length !== cartKeys.size ||
    Reflect.ownKeys(value).some(
      (key) => typeof key !== "string" || !cartKeys.has(key),
    )
  ) {
    return null;
  }
  const expected = new Map(
    catalogItems.map((item) => [item.variantId, safeInteger(item.quantity)]),
  );
  if (
    expected.size !== catalogItems.length ||
    [...expected].some(
      ([variantId, quantity]) =>
        variantId === null || quantity === null || quantity <= 0,
    )
  ) {
    return null;
  }
  const seenItems = new Set<string>();
  const items: Array<Readonly<{ variantId: string; quantity: number }>> = [];
  for (const item of value.items) {
    if (
      !plainRecord(item) ||
      Reflect.ownKeys(item).length !== 2 ||
      !Object.hasOwn(item, "variantId") ||
      !Object.hasOwn(item, "quantity") ||
      !isCanonicalUuid(item.variantId) ||
      !Number.isSafeInteger(item.quantity) ||
      (item.quantity as number) <= 0 ||
      seenItems.has(item.variantId) ||
      expected.get(item.variantId) !== item.quantity
    ) {
      return null;
    }
    seenItems.add(item.variantId);
    items.push(Object.freeze({
      variantId: item.variantId,
      quantity: item.quantity as number,
    }));
  }
  if (seenItems.size !== expected.size) {
    return null;
  }
  const seenPromotions = new Set<string>();
  const automaticPromotions: Array<Readonly<{ id: string; version: number }>> = [];
  for (const promotion of value.automaticPromotions) {
    if (
      !plainRecord(promotion) ||
      Reflect.ownKeys(promotion).length !== 2 ||
      !Object.hasOwn(promotion, "id") ||
      !Object.hasOwn(promotion, "version") ||
      !boundedText(promotion.id) ||
      !Number.isSafeInteger(promotion.version) ||
      (promotion.version as number) <= 0 ||
      seenPromotions.has(promotion.id)
    ) {
      return null;
    }
    seenPromotions.add(promotion.id);
    automaticPromotions.push(Object.freeze({
      id: promotion.id,
      version: promotion.version as number,
    }));
  }
  return Object.freeze({
    items: Object.freeze(items),
    automaticPromotions: Object.freeze(automaticPromotions),
  });
}

function legacyReviewCart(
  value: unknown,
  catalogItems: readonly ItemRow[],
  promotionIds: readonly string[],
): Readonly<{
  items: readonly Readonly<{ productId: string; quantity: number }>[];
  promotionIds: readonly string[];
}> | null {
  const keys = new Set(["schemaVersion", "items", "promotionIds"]);
  if (
    !plainRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.promotionIds) ||
    Reflect.ownKeys(value).length !== keys.size ||
    Reflect.ownKeys(value).some(
      (key) => typeof key !== "string" || !keys.has(key),
    )
  ) return null;
  const expected = new Map(
    catalogItems.map((item) => [item.productId, safeInteger(item.quantity)]),
  );
  if (
    expected.size !== catalogItems.length ||
    [...expected.values()].some(
      (quantity) => quantity === null || quantity <= 0,
    )
  ) return null;
  const seen = new Set<string>();
  const items: Array<Readonly<{ productId: string; quantity: number }>> = [];
  for (const item of value.items) {
    if (
      !plainRecord(item) ||
      Reflect.ownKeys(item).length !== 2 ||
      !Object.hasOwn(item, "productId") ||
      !Object.hasOwn(item, "quantity") ||
      !isCanonicalUuid(item.productId) ||
      !Number.isSafeInteger(item.quantity) ||
      (item.quantity as number) <= 0 ||
      seen.has(item.productId) ||
      expected.get(item.productId) !== item.quantity
    ) return null;
    seen.add(item.productId);
    items.push(Object.freeze({
      productId: item.productId,
      quantity: item.quantity as number,
    }));
  }
  if (
    seen.size !== expected.size ||
    value.promotionIds.some((id) => !isCanonicalUuid(id)) ||
    new Set(value.promotionIds).size !== value.promotionIds.length ||
    canonicalJson([...value.promotionIds].toSorted()) !==
      canonicalJson([...promotionIds].toSorted())
  ) return null;
  return Object.freeze({
    items: Object.freeze(items),
    promotionIds: Object.freeze([...value.promotionIds]),
  });
}

function makeReviewInput(
  order: OrderRow,
  buyerStatus: BuyerStatus,
  historicalVersionId: string,
  catalog: LockedCatalog,
  binding: AttemptReviewBinding,
): ReviewSnapshotHashInput | null {
  if (catalog.items.length === 0 || catalog.address === null) return null;
  const reviewPolicies = catalog.items
    .map((item) =>
      destinationForItem(item, order.destinationStateCode, catalog.policies),
    )
    .filter(
      (resolution) =>
        resolution.status === "review" && resolution.ruleId !== null,
    )
    .map((resolution) => ({
      id: resolution.ruleId!,
      version: resolution.ruleVersion!,
    }));
  const shared = {
    orderId: order.id,
    buyerUserId: order.buyerUserId,
    buyerStatus,
    acceptedAttestationVersionId: historicalVersionId,
    currentAttestationVersionId: historicalVersionId,
    destination: Object.freeze({
      recipientName: catalog.address.recipientName,
      line1: catalog.address.addressLine1,
      line2: catalog.address.addressLine2,
      city: catalog.address.city,
      stateCode: catalog.address.stateCode,
      postalCode: catalog.address.postalCode,
      countryCode: catalog.address.country as "US",
    }),
    reviewPolicies: Object.freeze(reviewPolicies),
  } as const;
  const variantCount = catalog.items.filter(
    (item) => item.variantId !== null,
  ).length;
  if (variantCount === 0) {
    const snapshot = legacyReviewCart(
      binding.cartSnapshot,
      catalog.items,
      catalog.promotionIds,
    );
    if (snapshot === null) return null;
    return Object.freeze({
      ...shared,
      items: snapshot.items,
      promotionIds: snapshot.promotionIds,
    });
  }
  if (variantCount !== catalog.items.length) return null;
  const snapshot = canonicalReviewCart(binding.cartSnapshot, catalog.items);
  if (snapshot === null) return null;
  return Object.freeze({
    ...shared,
    items: snapshot.items,
    automaticPromotions: snapshot.automaticPromotions,
  });
}

async function preflight(
  client: FulfillmentSqlClient,
  orderId: string,
  now: Date,
): Promise<Discovery | null> {
  const order = await readOrder(client, orderId, false);
  if (order === null) return null;
  const historical = await client.query<HistoricalAttestationRow>(
    `SELECT aa.id::text AS "acceptanceId",
            aa.user_id::text AS "buyerUserId",
            aa.attestation_version_id::text AS "attestationVersionId"
     FROM attestation_acceptances aa
     JOIN attestation_versions av ON av.id = aa.attestation_version_id
     WHERE aa.id = $1::uuid AND aa.user_id = $2::uuid`,
    [order.attestationAcceptanceId, order.buyerUserId],
  );
  const profile = await client.query<{ status: BuyerStatus }>(
    `SELECT status FROM buyer_profiles WHERE user_id = $1::uuid`,
    [order.buyerUserId],
  );
  if (historical.rows.length !== 1 || profile.rows.length !== 1) return null;
  const catalog = await readCatalog(
    client,
    order.id,
    order.destinationStateCode,
    now,
    false,
  );
  const attemptId = await readAttemptDiscovery(client, order.id);
  const authorizationMode = await readAttemptReviewAuthorizationMode(
    client,
    attemptId,
  );
  const bindingRead = await readAttemptReviewBinding(
    client,
    attemptId,
    order.id,
    false,
  );
  if (bindingRead.status === "invalid") return null;
  const reviewBinding = bindingRead.status === "bound"
    ? bindingRead.value
    : null;
  const reviewInput = reviewBinding === null
    ? null
    : makeReviewInput(
        order,
        profile.rows[0]!.status,
        historical.rows[0]!.attestationVersionId,
        catalog,
        reviewBinding,
      );
  const currentReviewNeeded =
    profile.rows[0]!.status === "review" ||
    catalog.items.some(
      (item) =>
        destinationForItem(
          item,
          order.destinationStateCode,
          catalog.policies,
        ).status === "review",
    );
  return Object.freeze({
    order,
    attemptId,
    reviewBinding,
    reviewInput,
    reviewNeeded:
      order.state !== "fulfilled" &&
      (authorizationMode === "bound" || currentReviewNeeded),
    reviewAuthorizationMode: authorizationMode,
  });
}

async function lockActorAndBuyer(
  client: FulfillmentSqlClient,
  input: CommandInput,
  buyerUserId: string,
): Promise<BuyerStatus | null> {
  const ids = [...new Set([input.actorUserId, buyerUserId])].toSorted();
  const placeholders = ids.map((_, index) => `$${index + 1}::uuid`).join(",");
  const users = await client.query<{ id: string; clerkId: string }>(
    `SELECT id::text AS id, clerk_id AS "clerkId"
     FROM users WHERE id IN (${placeholders}) ORDER BY id FOR UPDATE`,
    ids,
  );
  const profiles = await client.query<{ userId: string; status: BuyerStatus }>(
    `SELECT user_id::text AS "userId", status
     FROM buyer_profiles WHERE user_id IN (${placeholders})
     ORDER BY user_id FOR UPDATE`,
    ids,
  );
  const roles = await client.query<{
    id: string;
    capability: string;
    revokedAt: Date | string | null;
  }>(
    `SELECT id::text AS id, capability, revoked_at AS "revokedAt"
     FROM staff_roles WHERE user_id = $1::uuid
     ORDER BY capability, id FOR UPDATE`,
    [input.actorUserId],
  );
  const actor = users.rows.find((row) => row.id === input.actorUserId);
  const buyerProfile = profiles.rows.find((row) => row.userId === buyerUserId);
  const actorProfile = profiles.rows.find(
    (row) => row.userId === input.actorUserId,
  );
  if (
    users.rows.length !== ids.length ||
    actor?.clerkId !== input.actorClerkUserId ||
    buyerProfile === undefined ||
    buyerProfile.status === "blocked" && input.actorUserId === buyerUserId ||
    actorProfile?.status === "blocked" ||
    !roles.rows.some(
      (role) =>
        role.capability === "fulfillment:release:consume" &&
        role.revokedAt === null,
    )
  ) {
    return null;
  }
  return buyerProfile.status;
}

async function lockHistoricalAttestation(
  client: FulfillmentSqlClient,
  order: OrderRow,
): Promise<HistoricalAttestationRow | null> {
  const result = await client.query<HistoricalAttestationRow>(
    `SELECT aa.id::text AS "acceptanceId",
            aa.user_id::text AS "buyerUserId",
            aa.attestation_version_id::text AS "attestationVersionId"
     FROM attestation_acceptances aa
     JOIN attestation_versions av ON av.id = aa.attestation_version_id
     WHERE aa.id = $1::uuid AND aa.user_id = $2::uuid
     FOR UPDATE OF aa, av`,
    [order.attestationAcceptanceId, order.buyerUserId],
  );
  return result.rows.length === 1 ? result.rows[0]! : null;
}

async function lockAttempt(
  client: FulfillmentSqlClient,
  attemptId: string | null,
): Promise<AttemptRow | null> {
  if (attemptId === null) return null;
  const result = await client.query<AttemptRow>(
    `SELECT id::text AS id, order_id::text AS "orderId",
            buyer_user_id::text AS "buyerUserId", status, provider,
            provider_request_id AS "providerRequestId",
            provider_session_id AS "providerSessionId",
            provider_request_hash AS "providerRequestHash",
            provider_request_schema_version AS "providerRequestSchemaVersion",
            provider_livemode AS "providerLivemode",
            provider_scope AS "providerScope",
            review_authorization_mode AS "reviewAuthorizationMode"
     FROM checkout_attempts WHERE id = $1::uuid FOR UPDATE`,
    [attemptId],
  );
  return result.rows.length === 1 ? result.rows[0]! : null;
}

async function lockPayments(
  client: FulfillmentSqlClient,
  orderId: string,
): Promise<readonly PaymentRow[]> {
  const result = await client.query<PaymentRow>(
    `SELECT payment.id::text AS id,
            payment.provider_event_id::text AS "providerEventDatabaseId",
            source.provider_event_id AS "providerEventExternalId",
            payment.event_type AS "eventType",
            payment.provider_payment_id AS "providerPaymentId",
            payment.idempotency_key AS "idempotencyKey",
            payment.amount_minor AS "amountMinor", payment.currency,
            source.provider, source.status AS "providerEventStatus",
            source.livemode AS "sourceLivemode",
            source.normalized_payload AS "normalizedPayload"
     FROM payment_events payment
     JOIN provider_events source ON source.id = payment.provider_event_id
     WHERE payment.order_id = $1::uuid
     ORDER BY payment.id FOR UPDATE OF payment`,
    [orderId],
  );
  return result.rows;
}

async function lockRefunds(
  client: FulfillmentSqlClient,
  orderId: string,
): Promise<readonly RefundRow[]> {
  const result = await client.query<RefundRow>(
    `SELECT refund.id::text AS id,
            refund.order_id::text AS "orderId",
            refund.requested_by_user_id::text AS "requestedByUserId",
            refund.verified_payment_event_id::text AS "verifiedPaymentEventId",
            refund.provider, refund.provider_event_id::text AS "providerEventId",
            refund.provider_refund_id AS "providerRefundId",
            refund.idempotency_key AS "idempotencyKey",
            refund.requested_amount_minor AS "requestedAmountMinor",
            refund.confirmed_amount_minor AS "confirmedAmountMinor",
            refund.currency, refund.status, refund.origin,
            refund.provider_request_hash AS "providerRequestHash",
            refund.attempt_count AS "attemptCount",
            refund.submitted_at AS "submittedAt",
            refund.confirmed_at AS "confirmedAt",
            refund.last_error_redacted AS "lastErrorRedacted",
            source.provider AS "sourceProvider",
            source.provider_event_id AS "sourceProviderEventId",
            source.status AS "sourceStatus",
            source.livemode AS "sourceLivemode",
            source.normalized_payload AS "normalizedPayload"
     FROM refunds refund
     LEFT JOIN provider_events source ON source.id = refund.provider_event_id
     WHERE refund.order_id = $1::uuid
     ORDER BY refund.id FOR UPDATE OF refund`,
    [orderId],
  );
  return result.rows;
}

async function lockShipmentAndReleases(
  client: FulfillmentSqlClient,
  orderId: string,
): Promise<Readonly<{
  shipment: ShipmentRow | null;
  releases: readonly ReleaseRow[];
}>> {
  const shipmentRows = await client.query<ShipmentRow>(
    `SELECT id::text AS id, order_id::text AS "orderId",
            fulfillment_release_id::text AS "fulfillmentReleaseId",
            state, handed_off_at AS "handedOffAt",
            delivered_at AS "deliveredAt"
     FROM shipments WHERE order_id = $1::uuid FOR UPDATE`,
    [orderId],
  );
  const releases = await client.query<ReleaseRow>(
    `SELECT id::text AS id, order_id::text AS "orderId", version,
            idempotency_key AS "idempotencyKey",
            payment_event_id::text AS "paymentEventId",
            review_request_id::text AS "reviewRequestId", state,
            issued_at AS "issuedAt", expires_at AS "expiresAt",
            revoked_at AS "revokedAt", expired_at AS "expiredAt",
            consumed_at AS "consumedAt"
     FROM fulfillment_releases WHERE order_id = $1::uuid
     ORDER BY version FOR UPDATE`,
    [orderId],
  );
  return Object.freeze({
    shipment:
      shipmentRows.rows.length === 1 ? shipmentRows.rows[0]! : null,
    releases: Object.freeze(releases.rows),
  });
}

async function lockReservations(
  client: FulfillmentSqlClient,
  orderId: string,
): Promise<readonly ReservationRow[]> {
  const result = await client.query<ReservationRow>(
    `SELECT id::text AS id,
            checkout_attempt_id::text AS "checkoutAttemptId",
            order_id::text AS "orderId",
            order_item_id::text AS "orderItemId",
            product_id::text AS "productId", lot_id::text AS "lotId",
            quantity_reserved AS "quantityReserved",
            quantity_remaining AS "quantityRemaining", state
     FROM inventory_reservations WHERE order_id = $1::uuid
     ORDER BY id FOR UPDATE`,
    [orderId],
  );
  return Object.freeze(result.rows);
}

async function lockLots(
  client: FulfillmentSqlClient,
  reservations: readonly ReservationRow[],
): Promise<readonly LotRow[]> {
  const ids = [...new Set(reservations.map((row) => row.lotId))].toSorted();
  if (ids.length === 0) return Object.freeze([]);
  const result = await client.query<LotRow>(
    `SELECT id::text AS id, product_id::text AS "productId",
            available_quantity AS "availableQuantity", status,
            expires_at AS "expiresAt"
     FROM lots WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [ids],
  );
  return Object.freeze(result.rows);
}

function exactPayment(
  order: OrderRow,
  attempt: AttemptRow | null,
  payments: readonly PaymentRow[],
): ExactPayment | null {
  const verified = payments.filter((row) => row.eventType === "payment_verified");
  if (verified.length !== 1 || attempt === null) return null;
  const payment = verified[0]!;
  const source = parseNormalizedProviderEventV1(payment.normalizedPayload);
  const amountMinor = safeInteger(payment.amountMinor);
  const totalMinor = safeInteger(order.totalMinor);
  if (
    !providerKind(payment.provider) ||
    payment.providerEventStatus !== "processed" ||
    !boundedText(payment.providerPaymentId) ||
    amountMinor === null ||
    amountMinor <= 0 ||
    amountMinor !== totalMinor ||
    payment.currency !== order.currency ||
    payment.idempotencyKey !==
      `${payment.provider}:payment_intent:${payment.providerPaymentId}` ||
    source === null ||
    source.kind !== "checkout_session" ||
    !hasExactProviderEventEnvelopeIdentity(
      payment.providerEventExternalId,
      source,
    ) ||
    source.orderId !== order.id ||
    source.attemptId !== attempt.id ||
    source.paymentIntentId !== payment.providerPaymentId ||
    source.amountMinor !== amountMinor ||
    source.currency !== order.currency.toLowerCase() ||
    source.paymentStatus !== "paid" ||
    source.sessionStatus !== "complete" ||
    source.livemode !== payment.sourceLivemode ||
    attempt.orderId !== order.id ||
    attempt.buyerUserId !== order.buyerUserId ||
    attempt.status !== "completed" ||
    attempt.provider !== payment.provider ||
    attempt.providerRequestId !== `checkout_attempt:${attempt.id}` ||
    attempt.providerSessionId !== source.sessionId ||
    !hasExactCheckoutProviderArtifact({
      providerRequestHash: attempt.providerRequestHash,
      providerRequestSchemaVersion: attempt.providerRequestSchemaVersion,
    }) ||
    attempt.providerLivemode !== source.livemode ||
    !boundedText(attempt.providerScope)
  ) {
    return null;
  }
  return Object.freeze({
    payment,
    attempt,
    provider: payment.provider,
    paymentIntentId: payment.providerPaymentId,
    livemode: source.livemode,
    amountMinor,
  });
}

function exactSucceededRefund(
  refund: RefundRow,
  payment: ExactPayment,
  order: OrderRow,
): number | null {
  const requested = safeInteger(refund.requestedAmountMinor);
  const confirmed = safeInteger(refund.confirmedAmountMinor);
  const event = parseNormalizedProviderEventV1(refund.normalizedPayload);
  if (
    requested === null ||
    requested <= 0 ||
    confirmed === null ||
    confirmed !== requested ||
    refund.providerEventId === null ||
    !boundedText(refund.providerRefundId) ||
    refund.sourceProvider !== payment.provider ||
    refund.sourceStatus !== "processed" ||
    refund.sourceLivemode !== payment.livemode ||
    event === null ||
    event.kind !== "refund" ||
    !hasExactProviderEventEnvelopeIdentity(refund.sourceProviderEventId, event) ||
    event.status !== "succeeded" ||
    event.providerRefundId !== refund.providerRefundId ||
    event.paymentIntentId !== payment.paymentIntentId ||
    event.amountMinor !== confirmed ||
    event.currency !== order.currency.toLowerCase() ||
    event.livemode !== payment.livemode ||
    (refund.origin === "staff_requested"
      ? event.orderId !== order.id || event.refundRequestId !== refund.id
      : event.orderId !== null || event.refundRequestId !== null)
  ) {
    return null;
  }
  return confirmed;
}

function refundFacts(
  order: OrderRow,
  payment: ExactPayment | null,
  refunds: readonly RefundRow[],
): Readonly<{
  refundPending: boolean;
  confirmedRefundAmountMinor: number;
  conflict: boolean;
}> {
  if (payment === null) {
    return Object.freeze({
      refundPending: refunds.some((row) =>
        ["requested", "submitted"].includes(row.status),
      ),
      confirmedRefundAmountMinor: 0,
      conflict: refunds.length > 0,
    });
  }
  let refundPending = false;
  let confirmedRefundAmountMinor = 0;
  let conflict = false;
  for (const refund of refunds) {
    const requested = safeInteger(refund.requestedAmountMinor);
    const attempts = safeInteger(refund.attemptCount);
    const common =
      isCanonicalUuid(refund.id) &&
      refund.orderId === order.id &&
      refund.verifiedPaymentEventId === payment.payment.id &&
      refund.provider === payment.provider &&
      boundedText(refund.idempotencyKey) &&
      requested !== null &&
      requested > 0 &&
      refund.currency === order.currency &&
      attempts !== null &&
      attempts >= 0 &&
      (refund.providerRequestHash === null ||
        isSha256(refund.providerRequestHash));
    if (!common) {
      conflict = true;
      refundPending = true;
      continue;
    }
    if (refund.status === "requested" || refund.status === "submitted") {
      refundPending = true;
    }
    if (refund.status !== "succeeded") continue;
    const exact = exactSucceededRefund(refund, payment, order);
    if (exact === null) {
      conflict = true;
      refundPending = true;
      continue;
    }
    confirmedRefundAmountMinor += exact;
    if (
      !Number.isSafeInteger(confirmedRefundAmountMinor) ||
      confirmedRefundAmountMinor > payment.amountMinor
    ) {
      conflict = true;
      refundPending = true;
    }
  }
  return Object.freeze({
    refundPending,
    confirmedRefundAmountMinor,
    conflict,
  });
}

async function providerRestrictions(
  client: FulfillmentSqlClient,
  order: OrderRow,
  payment: ExactPayment | null,
  payments: readonly PaymentRow[],
): Promise<Readonly<{
  refundPending: boolean;
  paymentDisputed: boolean;
  conflict: boolean;
}>> {
  const unreconciled = payments.some(
    (row) => row.eventType === "unreconciled_refund_observed",
  );
  if (payment === null) {
    return Object.freeze({
      refundPending: unreconciled,
      paymentDisputed: false,
      conflict: unreconciled,
    });
  }
  const rows = await client.query<ProviderRestrictionEventRowV1>(
    `SELECT provider, provider_event_id AS "providerEventId",
            event_type AS "eventType", status, livemode,
            normalized_payload AS "normalizedPayload"
     FROM provider_events
     WHERE provider = $1
       AND livemode = $2
       AND normalized_payload->>'paymentIntentId' = $3
       AND event_type IN (
       'refund.created','refund.updated','refund.failed','charge.refunded',
       'charge.dispute.created','charge.dispute.updated','charge.dispute.closed'
     )
     ORDER BY id`,
    [payment.provider, payment.livemode, payment.paymentIntentId],
  );
  const derived = deriveProviderRestrictionsV1({
    provider: payment.provider,
    livemode: payment.livemode,
    paymentIntentId: payment.paymentIntentId,
    currency: order.currency,
    paidAmountMinor: payment.amountMinor,
    events: rows.rows,
  });
  return Object.freeze({
    refundPending: unreconciled || derived.refundPending,
    paymentDisputed: derived.paymentDisputed,
    conflict: derived.conflict,
  });
}

function combinedDestination(
  order: OrderRow,
  catalog: LockedCatalog,
): "allowed" | "review" | "blocked" | "unavailable" {
  const statuses = catalog.items.map(
    (item) =>
      destinationForItem(item, order.destinationStateCode, catalog.policies)
        .status,
  );
  if (statuses.includes("unavailable")) return "unavailable";
  if (statuses.includes("blocked")) return "blocked";
  if (statuses.includes("review")) return "review";
  return statuses.length > 0 ? "allowed" : "unavailable";
}

function reservationsComplete(facts: LockedFacts): boolean {
  if (facts.payment === null || facts.catalog.items.length === 0) return false;
  const expectedItems = new Set(facts.catalog.items.map((item) => item.id));
  const seen = new Set<string>();
  for (const item of facts.catalog.items) {
    const quantity = safeInteger(item.quantity);
    const matching = facts.reservations.filter(
      (reservation) => reservation.orderItemId === item.id,
    );
    let total = 0;
    for (const reservation of matching) {
      const reserved = safeInteger(reservation.quantityReserved);
      const remaining = safeInteger(reservation.quantityRemaining);
      if (
        seen.has(reservation.id) ||
        reservation.checkoutAttemptId !== facts.payment.attempt.id ||
        reservation.orderId !== facts.order.id ||
        reservation.productId !== item.productId ||
        reservation.state !== "active" ||
        reserved === null ||
        reserved <= 0 ||
        remaining !== reserved
      ) {
        return false;
      }
      seen.add(reservation.id);
      total += reserved;
    }
    if (quantity === null || total !== quantity) return false;
  }
  return (
    facts.reservations.length === seen.size &&
    facts.reservations.every((row) => expectedItems.has(row.orderItemId))
  );
}

function lotsAvailable(facts: LockedFacts, now: Date): boolean {
  if (facts.reservations.length === 0) return false;
  const byId = new Map(facts.lots.map((lot) => [lot.id, lot]));
  return facts.reservations.every((reservation) => {
    const lot = byId.get(reservation.lotId);
    const expiry = lot?.expiresAt === null ? null : iso(lot?.expiresAt ?? "");
    return (
      lot !== undefined &&
      lot.productId === reservation.productId &&
      lot.status === "released" &&
      (safeInteger(lot.availableQuantity) ?? -1) >= 0 &&
      (expiry === null || new Date(expiry).getTime() > now.getTime())
    );
  });
}

function reviewCoverage(
  facts: LockedFacts,
): Readonly<{
  buyerCovered: boolean;
  destinationCovered: boolean;
  reviewRequestId: string | null;
}> {
  const destinationStatus = combinedDestination(facts.order, facts.catalog);
  const reviewPolicyIds = facts.catalog.items
    .map((item) =>
      destinationForItem(
        item,
        facts.order.destinationStateCode,
        facts.catalog.policies,
      ),
    )
    .filter(
      (resolution) =>
        resolution.status === "review" && resolution.ruleId !== null,
    )
    .map((resolution) => resolution.ruleId!);
  const decision = facts.review;
  const exact =
    decision !== null &&
    decision.outcome === "approved" &&
    facts.finalReviewHashMatches;
  const destinationCovered =
    destinationStatus !== "review" ||
    (exact &&
      reviewPolicyIds.every((id) =>
        decision.destinationPolicyIds.includes(id),
      ));
  return Object.freeze({
    buyerCovered: exact && decision.coversBuyerReview,
    destinationCovered,
    reviewRequestId: exact ? decision.reviewRequestId : null,
  });
}

async function loadLockedFacts(
  client: FulfillmentSqlClient,
  input: CommandInput,
  sha256: Sha256Hasher,
  resolveReview: typeof resolveExactReviewRequest,
): Promise<Readonly<
  | { status: "ok"; facts: LockedFacts; buyerStatus: BuyerStatus }
  | { status: "unavailable" | "conflict" }
>> {
  const discovered = await preflight(client, input.orderId, input.now);
  if (discovered === null) return Object.freeze({ status: "conflict" });
  const buyerStatus = await lockActorAndBuyer(
    client,
    input,
    discovered.order.buyerUserId,
  );
  if (buyerStatus === null) return Object.freeze({ status: "unavailable" });
  const historical = await lockHistoricalAttestation(client, discovered.order);
  if (historical === null) return Object.freeze({ status: "conflict" });
  const attempt = await lockAttempt(client, discovered.attemptId);
  const order = await readOrder(client, input.orderId, true);
  if (
    order === null ||
    order.buyerUserId !== discovered.order.buyerUserId ||
    order.attestationAcceptanceId !== historical.acceptanceId ||
    historical.buyerUserId !== order.buyerUserId
  ) {
    return Object.freeze({ status: "conflict" });
  }
  const lockedBindingRead = await readAttemptReviewBinding(
    client,
    discovered.attemptId,
    order.id,
    true,
  );
  if (lockedBindingRead.status === "invalid") {
    return Object.freeze({ status: "conflict" });
  }
  const lockedBinding = lockedBindingRead.status === "bound"
    ? lockedBindingRead.value
    : null;
  const authorizationMode = attempt === null
    ? null
    : reviewAuthorizationMode(attempt.reviewAuthorizationMode);
  if (discovered.attemptId !== null && (
    authorizationMode === null ||
    authorizationMode !== reviewAuthorizationMode(discovered.reviewAuthorizationMode) ||
    (authorizationMode === "bound" && lockedBinding === null) ||
    (authorizationMode === "none" && lockedBinding !== null)
  )) {
    return Object.freeze({ status: "conflict" });
  }
  if (
    (lockedBinding === null) !== (discovered.reviewBinding === null) ||
    (lockedBinding !== null && discovered.reviewBinding !== null &&
      (lockedBinding.checkoutAttemptId !==
          discovered.reviewBinding.checkoutAttemptId ||
        lockedBinding.orderId !== discovered.reviewBinding.orderId ||
        lockedBinding.reviewRequestId !==
          discovered.reviewBinding.reviewRequestId ||
        lockedBinding.reviewSnapshotHash !==
          discovered.reviewBinding.reviewSnapshotHash ||
        canonicalJson(lockedBinding.cartSnapshot) !==
          canonicalJson(discovered.reviewBinding.cartSnapshot)))
  ) {
    return Object.freeze({ status: "conflict" });
  }
  let review: ExactReviewDecision | null = null;
  const resolvedReviewInput = discovered.reviewInput;
  if (discovered.reviewNeeded) {
    if (resolvedReviewInput === null || lockedBinding === null) {
      return Object.freeze({ status: "conflict" });
    }
    review = await resolveReview(client, resolvedReviewInput, sha256, {
      lock: true,
    });
    if (
      review === null ||
      review.outcome !== "approved" ||
      review.reviewRequestId !== lockedBinding.reviewRequestId ||
      review.reviewSnapshotHash !== lockedBinding.reviewSnapshotHash
    ) {
      return Object.freeze({ status: "conflict" });
    }
  }
  const payments = await lockPayments(client, order.id);
  const refunds = await lockRefunds(client, order.id);
  const shipmentRelease = await lockShipmentAndReleases(client, order.id);
  const catalog = await readCatalog(
    client,
    order.id,
    order.destinationStateCode,
    input.now,
    true,
  );
  const reservations = await lockReservations(client, order.id);
  const lots = await lockLots(client, reservations);
  const payment = exactPayment(order, attempt, payments);
  const refund = refundFacts(order, payment, refunds);
  const restrictions = await providerRestrictions(
    client,
    order,
    payment,
    payments,
  );
  const finalReviewInput = lockedBinding === null
    ? null
    : makeReviewInput(
        order,
        buyerStatus,
        historical.attestationVersionId,
        catalog,
        lockedBinding,
      );
  const finalReviewHash = finalReviewInput === null
    ? null
    : await hashReviewSnapshot(finalReviewInput, sha256);
  const finalReviewHashMatches =
    review === null
      ? !discovered.reviewNeeded
      : lockedBinding !== null &&
        finalReviewHash === lockedBinding.reviewSnapshotHash &&
        finalReviewHash === review.reviewSnapshotHash &&
        review.reviewRequestId === lockedBinding.reviewRequestId &&
        resolvedReviewInput !== null &&
        canonicalJson(finalReviewInput) === canonicalJson(resolvedReviewInput);
  return Object.freeze({
    status: "ok" as const,
    buyerStatus,
    facts: Object.freeze({
      order,
      payment,
      refundPending: refund.refundPending || restrictions.refundPending,
      confirmedRefundAmountMinor: refund.confirmedRefundAmountMinor,
      paymentDisputed: restrictions.paymentDisputed,
      financialConflict: refund.conflict || restrictions.conflict,
      shipment: shipmentRelease.shipment,
      releases: shipmentRelease.releases,
      catalog,
      reservations,
      lots,
      review,
      finalReviewHashMatches,
    }),
  });
}

function decisionFor(
  facts: LockedFacts,
  buyerStatus: BuyerStatus,
  now: Date,
  clearHold: boolean,
) {
  const destinationStatus = combinedDestination(facts.order, facts.catalog);
  const coverage = reviewCoverage(facts);
  const usesCoveredReview =
    (buyerStatus === "review" && coverage.buyerCovered) ||
    (destinationStatus === "review" && coverage.destinationCovered);
  return evaluateFulfillment({
    orderId: facts.order.id,
    verifiedPaymentEventId: facts.payment?.payment.id ?? null,
    refundPending: facts.refundPending || facts.financialConflict,
    confirmedRefundAmountMinor: facts.confirmedRefundAmountMinor,
    paymentDisputed: facts.paymentDisputed,
    orderHoldActive: clearHold ? false : facts.order.state === "paid_on_hold",
    buyerStatus,
    buyerReviewCovered:
      buyerStatus === "review" && coverage.buyerCovered,
    productsActive:
      facts.catalog.items.length > 0 &&
      facts.catalog.items.every(
        (item) =>
          item.productStatus === "active" && item.policyGroupActive,
      ),
    destinationStatus,
    destinationReviewCovered:
      destinationStatus === "review" && coverage.destinationCovered,
    inventoryReservationsComplete: reservationsComplete(facts),
    reservedLotsAvailable: lotsAvailable(facts, now),
    shipmentMetadataPresent:
      facts.catalog.address !== null &&
      facts.shipment !== null &&
      facts.shipment.state === "pending" &&
      facts.shipment.fulfillmentReleaseId === null &&
      facts.shipment.handedOffAt === null &&
      facts.shipment.deliveredAt === null,
    fulfillmentCapabilityEnabled: true,
    reviewRequestId: usesCoveredReview ? coverage.reviewRequestId : null,
  });
}

function orderSnapshot(
  facts: LockedFacts,
  lastVersion: number,
): OrderSnapshot {
  return Object.freeze({
    orderId: facts.order.id,
    state: facts.order.state,
    paymentEvidenceId: facts.payment?.payment.id ?? null,
    reviewRequestId: null,
    fulfillmentReleaseVersion: null,
    lastFulfillmentReleaseVersion: lastVersion,
    carrierHandoffAt: null,
  });
}

function latestReleaseSnapshot(
  facts: LockedFacts,
): FulfillmentReleaseSnapshot | null {
  const latest = facts.releases.at(-1);
  if (latest === undefined) {
    return Object.freeze({
      orderId: facts.order.id,
      state: "absent",
      version: null,
      lastVersion: 0,
      paymentEvidenceId: null,
      reviewRequestId: null,
      expiresAt: null,
    });
  }
  const version = safeInteger(latest.version);
  if (version === null || version <= 0) return null;
  if (latest.state === "issued" || latest.state === "consumed") {
    const expiresAt = iso(latest.expiresAt);
    if (expiresAt === null) return null;
    return Object.freeze({
      orderId: facts.order.id,
      state: latest.state,
      version,
      lastVersion: version,
      paymentEvidenceId: latest.paymentEventId,
      reviewRequestId: latest.reviewRequestId,
      expiresAt,
    });
  }
  return Object.freeze({
    orderId: facts.order.id,
    state: latest.state,
    version: null,
    lastVersion: version,
    paymentEvidenceId: null,
    reviewRequestId: null,
    expiresAt: null,
  });
}

async function exactTerminalReplay(
  client: FulfillmentSqlClient,
  facts: LockedFacts,
  keyedUuid: KeyedUuidGenerator,
): Promise<boolean> {
  if (
    facts.order.state !== "fulfilled" ||
    facts.payment === null ||
    facts.shipment === null ||
    !["handed_off", "delivered", "exception"].includes(
      facts.shipment.state,
    ) ||
    facts.shipment.fulfillmentReleaseId === null ||
    iso(facts.shipment.handedOffAt ?? "") === null
  ) {
    return false;
  }
  const consumed = facts.releases.filter((row) => row.state === "consumed");
  if (consumed.length !== 1) return false;
  const release = consumed[0]!;
  const version = safeInteger(release.version);
  const issuedAt = iso(release.issuedAt);
  const expiresAt = iso(release.expiresAt);
  const consumedAt = iso(release.consumedAt ?? "");
  if (
    version === null ||
    version <= 0 ||
    release.id !== keyedUuid(
      `fulfillment-release:${facts.order.id}:${version}`,
    ) ||
    release.idempotencyKey !==
      `fulfillment_release:${facts.order.id}:${version}` ||
    release.paymentEventId !== facts.payment.payment.id ||
    release.id !== facts.shipment.fulfillmentReleaseId ||
    issuedAt === null ||
    expiresAt === null ||
    consumedAt === null ||
    new Date(expiresAt).getTime() - new Date(issuedAt).getTime() !==
      fiveMinutesMs ||
    new Date(consumedAt).getTime() >= new Date(expiresAt).getTime()
  ) {
    return false;
  }
  if (
    release.reviewRequestId !== null &&
    !isCanonicalUuid(release.reviewRequestId)
  ) {
    return false;
  }
  if (facts.reservations.length === 0) return false;
  const lotById = new Map(facts.lots.map((row) => [row.id, row]));
  const events = await client.query<{
    id: string;
    idempotencyKey: string;
    lotId: string;
    orderId: string | null;
    orderItemId: string | null;
    reservationId: string | null;
    fulfillmentReleaseId: string | null;
    quantity: number | string;
    balanceAfter: number | string;
  }>(
    `SELECT id::text AS id, idempotency_key AS "idempotencyKey",
            lot_id::text AS "lotId", order_id::text AS "orderId",
            order_item_id::text AS "orderItemId",
            reservation_id::text AS "reservationId",
            fulfillment_release_id::text AS "fulfillmentReleaseId",
            quantity, balance_after AS "balanceAfter"
     FROM inventory_events
     WHERE order_id = $1::uuid AND event_type = 'consume'
     ORDER BY reservation_id`,
    [facts.order.id],
  );
  if (events.rows.length !== facts.reservations.length) return false;
  for (const reservation of facts.reservations) {
    const quantity = safeInteger(reservation.quantityReserved);
    const event = events.rows.find(
      (candidate) => candidate.reservationId === reservation.id,
    );
    const lot = lotById.get(reservation.lotId);
    const balanceAfter = safeInteger(event?.balanceAfter);
    if (
      reservation.state !== "consumed" ||
      safeInteger(reservation.quantityRemaining) !== 0 ||
      quantity === null ||
      event === undefined ||
      event.id !== keyedUuid(`inventory-consume:${reservation.id}`) ||
      event.idempotencyKey !== `inventory:consume:${reservation.id}` ||
      event.lotId !== reservation.lotId ||
      event.orderId !== facts.order.id ||
      event.orderItemId !== reservation.orderItemId ||
      event.fulfillmentReleaseId !== release.id ||
      safeInteger(event.quantity) !== quantity ||
      lot === undefined ||
      lot.productId !== reservation.productId ||
      balanceAfter === null ||
      balanceAfter < 0
    ) {
      return false;
    }
  }
  const effectId = keyedUuid(`fulfillment-handoff-effect:${release.id}`);
  const effect = await client.query<{
    id: string;
    orderId: string | null;
    providerEventId: string | null;
    effectType: string;
    payload: unknown;
    idempotencyKey: string;
  }>(
    `SELECT id::text AS id, order_id::text AS "orderId",
            provider_event_id::text AS "providerEventId",
            effect_type AS "effectType", payload,
            idempotency_key AS "idempotencyKey"
     FROM downstream_effects
     WHERE order_id = $1::uuid AND effect_type = 'fulfillment_handed_off'`,
    [facts.order.id],
  );
  const expectedPayload = {
    schemaVersion: 1,
    orderId: facts.order.id,
    shipmentId: facts.shipment.id,
    fulfillmentReleaseId: release.id,
  };
  return (
    effect.rows.length === 1 &&
    effect.rows[0]!.id === effectId &&
    effect.rows[0]!.orderId === facts.order.id &&
    effect.rows[0]!.providerEventId === null &&
    effect.rows[0]!.effectType === "fulfillment_handed_off" &&
    effect.rows[0]!.idempotencyKey ===
      `fulfillment_release:${release.id}:handoff` &&
    canonicalJson(effect.rows[0]!.payload) === canonicalJson(expectedPayload)
  );
}

async function insertAudit(
  client: FulfillmentSqlClient,
  input: CommandInput,
  action: string,
  metadata: unknown,
): Promise<void> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO admin_audit
       (actor_user_id, service_identity, action, resource_type, resource_id,
        correlation_id, metadata, occurred_at)
     VALUES ($1::uuid, NULL, $2, 'order', $3, $4, $5::jsonb,
             $6::timestamptz)
     RETURNING id::text AS id`,
    [
      input.actorUserId,
      action,
      input.orderId,
      input.correlationId,
      JSON.stringify(metadata),
      input.now.toISOString(),
    ],
  );
  if (result.rows.length !== 1) throw new Error("audit write conflict");
}

export function createFulfillmentRepository(input: Readonly<{
  runSerializableTransaction: FulfillmentTransactionRunner;
  sha256: Sha256Hasher;
  keyedUuid: KeyedUuidGenerator;
  retrySleep?: (
    retryNumber: 1 | 2,
    sqlState: "40001" | "40P01",
  ) => Promise<void>;
  afterWriteStage?: (stage: string) => Promise<void>;
  resolveExactReviewRequest?: typeof resolveExactReviewRequest;
}>): FulfillmentCommandRepository {
  const resolveReview =
    input.resolveExactReviewRequest ?? resolveExactReviewRequest;
  const transaction = <Value>(
    work: (client: FulfillmentSqlClient) => Promise<Value>,
  ) =>
    runSerializableWithRetry(
      () =>
        input.runSerializableTransaction(work, {
          isolationLevel: "serializable",
        }),
      input.retrySleep === undefined ? {} : { sleep: input.retrySleep },
    );

  const clearHold = (command: CommandInput) =>
    transaction(async (client): Promise<FulfillmentCommandResultV1> => {
      if (!validCommand(command)) return Object.freeze({ status: "unavailable" });
      const loaded = await loadLockedFacts(
        client,
        command,
        input.sha256,
        resolveReview,
      );
      if (loaded.status !== "ok") return loaded;
      const { facts, buyerStatus } = loaded;
      if (facts.order.state === "paid_pending_fulfillment") {
        return Object.freeze({ status: "already_clear" });
      }
      if (facts.order.state !== "paid_on_hold") {
        return Object.freeze({ status: "ineligible" });
      }
      const decision = decisionFor(facts, buyerStatus, command.now, true);
      if (!decision.permitted || facts.payment === null) {
        return Object.freeze({ status: "denied", reasons: decision.reasons });
      }
      const transition = transitionOrder(
        orderSnapshot(
          facts,
          facts.releases.reduce(
            (maximum, row) => Math.max(maximum, safeInteger(row.version) ?? 0),
            0,
          ),
        ),
        { type: "clear_fulfillment_hold", decision },
      );
      if (!transition.ok || transition.value.snapshot.state !== "paid_pending_fulfillment") {
        return Object.freeze({ status: "conflict" });
      }
      const updated = await client.query<{ id: string }>(
        `UPDATE orders SET state = 'paid_pending_fulfillment',
                           updated_at = $2::timestamptz
         WHERE id = $1::uuid AND state = 'paid_on_hold'
         RETURNING id::text AS id`,
        [facts.order.id, command.now.toISOString()],
      );
      if (updated.rows.length !== 1) throw new Error("order clear conflict");
      await insertAudit(client, command, "fulfillment.hold.cleared", {
        schemaVersion: 1,
        paymentEventId: facts.payment.payment.id,
      });
      return Object.freeze({ status: "cleared" });
    });

  const handoff = (command: CommandInput) =>
    transaction(async (client): Promise<FulfillmentCommandResultV1> => {
      if (!validCommand(command)) return Object.freeze({ status: "unavailable" });
      const loaded = await loadLockedFacts(
        client,
        command,
        input.sha256,
        resolveReview,
      );
      if (loaded.status !== "ok") return loaded;
      const { facts, buyerStatus } = loaded;
      if (facts.order.state === "fulfilled") {
        return Object.freeze({
          status: (await exactTerminalReplay(client, facts, input.keyedUuid))
            ? "already_handed_off"
            : "conflict",
        });
      }
      if (!paidStates.has(facts.order.state)) {
        return Object.freeze({ status: "ineligible" });
      }
      const decision = decisionFor(facts, buyerStatus, command.now, false);
      if (!decision.permitted || facts.payment === null) {
        if (facts.order.state === "paid_on_hold") {
          return Object.freeze({ status: "held", reasons: decision.reasons });
        }
        const held = transitionOrder(
          orderSnapshot(
            facts,
            facts.releases.reduce(
              (maximum, row) => Math.max(maximum, safeInteger(row.version) ?? 0),
              0,
            ),
          ),
          { type: "post_payment_hold", decision },
        );
        if (!held.ok || held.value.snapshot.state !== "paid_on_hold") {
          return Object.freeze({ status: "conflict" });
        }
        const updated = await client.query<{ id: string }>(
          `UPDATE orders SET state = 'paid_on_hold', updated_at = $2::timestamptz
           WHERE id = $1::uuid AND state = 'paid_pending_fulfillment'
           RETURNING id::text AS id`,
          [facts.order.id, command.now.toISOString()],
        );
        if (updated.rows.length !== 1) throw new Error("order hold conflict");
        await insertAudit(client, command, "fulfillment.handoff.denied", {
          schemaVersion: 1,
          paymentEventId: facts.payment?.payment.id ?? null,
          reasons: decision.reasons,
        });
        return Object.freeze({ status: "held", reasons: decision.reasons });
      }
      if (
        facts.order.state !== "paid_pending_fulfillment" ||
        facts.shipment === null ||
        facts.shipment.state !== "pending" ||
        facts.releases.some((row) => row.state === "issued" || row.state === "consumed")
      ) {
        return Object.freeze({ status: "conflict" });
      }
      const priorRelease = latestReleaseSnapshot(facts);
      if (priorRelease === null) return Object.freeze({ status: "conflict" });
      const version = priorRelease.lastVersion + 1;
      const releaseId = input.keyedUuid(
        `fulfillment-release:${facts.order.id}:${version}`,
      );
      const expiresAt = new Date(command.now.getTime() + fiveMinutesMs);
      if (!isCanonicalUuid(releaseId)) return Object.freeze({ status: "conflict" });
      const issued = transitionFulfillmentRelease(priorRelease, {
        type: "issue",
        now: command.now.toISOString(),
        decision,
        version,
        paymentEvidenceId: facts.payment.payment.id,
        expiresAt: expiresAt.toISOString(),
      });
      if (!issued.ok) return Object.freeze({ status: "conflict" });
      const insertedRelease = await client.query<{ id: string }>(
        `INSERT INTO fulfillment_releases
           (id, order_id, version, idempotency_key, payment_event_id,
            review_request_id, state, issued_at, expires_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::uuid,
                 'issued', $7::timestamptz, $8::timestamptz)
         RETURNING id::text AS id`,
        [
          releaseId,
          facts.order.id,
          version,
          `fulfillment_release:${facts.order.id}:${version}`,
          facts.payment.payment.id,
          decision.reviewRequestId,
          command.now.toISOString(),
          expiresAt.toISOString(),
        ],
      );
      if (insertedRelease.rows.length !== 1) throw new Error("release insert conflict");
      await input.afterWriteStage?.("release_inserted");
      const initialOrder = orderSnapshot(facts, priorRelease.lastVersion);
      const releasedOrder = transitionOrder(initialOrder, {
        type: "release_for_fulfillment",
        decision,
        paymentEvidenceId: facts.payment.payment.id,
        fulfillmentReleaseVersion: version,
      });
      if (!releasedOrder.ok) throw new Error("release transition conflict");
      const begunOrder = transitionOrder(releasedOrder.value.snapshot, {
        type: "begin_fulfillment",
        now: command.now.toISOString(),
        decision,
        release: issued.value,
      });
      if (!begunOrder.ok) throw new Error("begin transition conflict");
      const lotById = new Map(facts.lots.map((lot) => [lot.id, lot]));
      for (const reservation of facts.reservations) {
        const quantity = safeInteger(reservation.quantityReserved);
        const lot = lotById.get(reservation.lotId);
        const balance = safeInteger(lot?.availableQuantity);
        const consumeId = input.keyedUuid(`inventory-consume:${reservation.id}`);
        if (
          quantity === null ||
          quantity <= 0 ||
          balance === null ||
          !isCanonicalUuid(consumeId)
        ) {
          throw new Error("reservation consume conflict");
        }
        const updated = await client.query<{ id: string }>(
          `UPDATE inventory_reservations
           SET state = 'consumed', quantity_remaining = 0,
               updated_at = $4::timestamptz
           WHERE id = $1::uuid AND order_id = $2::uuid
             AND state = 'active' AND quantity_remaining = $3
             AND quantity_reserved = $3
           RETURNING id::text AS id`,
          [
            reservation.id,
            facts.order.id,
            quantity,
            command.now.toISOString(),
          ],
        );
        if (updated.rows.length !== 1) throw new Error("reservation update conflict");
        const event = await client.query<{ id: string }>(
          `INSERT INTO inventory_events
             (id, idempotency_key, event_type, lot_id, order_id,
              order_item_id, reservation_id, fulfillment_release_id,
              quantity, balance_after, occurred_at)
           VALUES ($1::uuid, $2, 'consume', $3::uuid, $4::uuid,
                   $5::uuid, $6::uuid, $7::uuid, $8, $9,
                   $10::timestamptz)
           RETURNING id::text AS id`,
          [
            consumeId,
            `inventory:consume:${reservation.id}`,
            reservation.lotId,
            facts.order.id,
            reservation.orderItemId,
            reservation.id,
            releaseId,
            quantity,
            balance,
            command.now.toISOString(),
          ],
        );
        if (event.rows.length !== 1) throw new Error("consume event conflict");
      }
      await input.afterWriteStage?.("reservations_consumed");
      const consumed = transitionFulfillmentRelease(issued.value, {
        type: "consume",
        now: command.now.toISOString(),
        decision,
      });
      if (!consumed.ok) throw new Error("release consume transition conflict");
      const consumedWrite = await client.query<{ id: string }>(
        `UPDATE fulfillment_releases
         SET state = 'consumed', consumed_at = $2::timestamptz
         WHERE id = $1::uuid AND state = 'issued'
           AND consumed_at IS NULL AND revoked_at IS NULL AND expired_at IS NULL
         RETURNING id::text AS id`,
        [releaseId, command.now.toISOString()],
      );
      if (consumedWrite.rows.length !== 1) throw new Error("release consume conflict");
      await input.afterWriteStage?.("release_consumed");
      const shipment = await client.query<{ id: string }>(
        `UPDATE shipments
         SET fulfillment_release_id = $2::uuid, state = 'handed_off',
             handed_off_at = $3::timestamptz, delivered_at = NULL,
             updated_at = $3::timestamptz
         WHERE id = $1::uuid AND order_id = $4::uuid
           AND state = 'pending' AND fulfillment_release_id IS NULL
           AND handed_off_at IS NULL AND delivered_at IS NULL
         RETURNING id::text AS id`,
        [
          facts.shipment.id,
          releaseId,
          command.now.toISOString(),
          facts.order.id,
        ],
      );
      if (shipment.rows.length !== 1) throw new Error("shipment handoff conflict");
      await input.afterWriteStage?.("shipment_handed_off");
      const handedOffOrder = transitionOrder(begunOrder.value.snapshot, {
        type: "carrier_handoff",
        carrierHandoffAt: command.now.toISOString(),
        recordedAt: command.now.toISOString(),
        consumedRelease: consumed.value,
      });
      if (!handedOffOrder.ok || handedOffOrder.value.snapshot.state !== "fulfilled") {
        throw new Error("carrier handoff transition conflict");
      }
      const orderWrite = await client.query<{ id: string }>(
        `UPDATE orders SET state = 'fulfilled', updated_at = $2::timestamptz
         WHERE id = $1::uuid AND state = 'paid_pending_fulfillment'
         RETURNING id::text AS id`,
        [facts.order.id, command.now.toISOString()],
      );
      if (orderWrite.rows.length !== 1) throw new Error("order handoff conflict");
      await input.afterWriteStage?.("order_fulfilled");
      const effectId = input.keyedUuid(
        `fulfillment-handoff-effect:${releaseId}`,
      );
      if (!isCanonicalUuid(effectId)) throw new Error("effect identity conflict");
      const effectPayload = {
        schemaVersion: 1,
        orderId: facts.order.id,
        shipmentId: facts.shipment.id,
        fulfillmentReleaseId: releaseId,
      };
      const effect = await client.query<{ id: string }>(
        `INSERT INTO downstream_effects
           (id, order_id, provider_event_id, effect_type, payload,
            idempotency_key, status, attempt_count, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, NULL, 'fulfillment_handed_off',
                 $3::jsonb, $4, 'pending', 0,
                 $5::timestamptz, $5::timestamptz)
         RETURNING id::text AS id`,
        [
          effectId,
          facts.order.id,
          JSON.stringify(effectPayload),
          `fulfillment_release:${releaseId}:handoff`,
          command.now.toISOString(),
        ],
      );
      if (effect.rows.length !== 1) throw new Error("handoff effect conflict");
      await input.afterWriteStage?.("effect_inserted");
      await insertAudit(client, command, "fulfillment.handed_off", {
        schemaVersion: 1,
        paymentEventId: facts.payment.payment.id,
        fulfillmentReleaseId: releaseId,
        shipmentId: facts.shipment.id,
      });
      await input.afterWriteStage?.("audit_inserted");
      return Object.freeze({ status: "handed_off" });
    });

  const transitionShipment = (
    command: CommandInput & Readonly<{ action: "deliver" | "record_exception" }>,
  ) =>
    transaction(async (client): Promise<FulfillmentCommandResultV1> => {
      if (!validCommand(command)) return Object.freeze({ status: "unavailable" });
      const loaded = await loadLockedFacts(
        client,
        command,
        input.sha256,
        resolveReview,
      );
      if (loaded.status !== "ok") return loaded;
      const { facts } = loaded;
      if (
        facts.order.state !== "fulfilled" ||
        facts.shipment === null ||
        facts.shipment.fulfillmentReleaseId === null ||
        facts.shipment.handedOffAt === null
      ) {
        return Object.freeze({ status: "ineligible" });
      }
      const attached = facts.releases.filter(
        (release) => release.id === facts.shipment!.fulfillmentReleaseId,
      );
      if (attached.length !== 1 || attached[0]!.state !== "consumed") {
        return Object.freeze({ status: "conflict" });
      }
      const snapshot: ShipmentSnapshot = Object.freeze({
        shipmentId: facts.shipment.id,
        orderId: facts.order.id,
        fulfillmentReleaseId: facts.shipment.fulfillmentReleaseId,
        state: facts.shipment.state,
        handedOffAt: iso(facts.shipment.handedOffAt),
        deliveredAt:
          facts.shipment.deliveredAt === null
            ? null
            : iso(facts.shipment.deliveredAt),
      });
      const result = transitionShipmentState(snapshot, {
        type: command.action,
        now: command.now.toISOString(),
      });
      if (!result.ok) return Object.freeze({ status: "conflict" });
      if (!result.changed) {
        return Object.freeze({
          status:
            command.action === "deliver"
              ? "already_delivered"
              : "already_exception",
        });
      }
      const newState = result.snapshot.state;
      const write = await client.query<{ id: string }>(
        `UPDATE shipments
         SET state = $2, delivered_at = $3::timestamptz,
             updated_at = $4::timestamptz
         WHERE id = $1::uuid AND order_id = $5::uuid AND state = $6
           AND fulfillment_release_id = $7::uuid
         RETURNING id::text AS id`,
        [
          facts.shipment.id,
          newState,
          result.snapshot.deliveredAt,
          command.now.toISOString(),
          facts.order.id,
          facts.shipment.state,
          facts.shipment.fulfillmentReleaseId,
        ],
      );
      if (write.rows.length !== 1) throw new Error("shipment transition conflict");
      const action =
        command.action === "deliver"
          ? "shipment.delivered"
          : "shipment.exception.recorded";
      await insertAudit(client, command, action, {
        schemaVersion: 1,
        fulfillmentReleaseId: facts.shipment.fulfillmentReleaseId,
      });
      return Object.freeze({
        status: command.action === "deliver" ? "delivered" : "exception",
      });
    });

  return Object.freeze({ clearHold, handoff, transitionShipment });
}
