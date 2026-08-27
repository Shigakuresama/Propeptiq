import "server-only";

import {
  isCanonicalUuid,
  isSha256,
  type Sha256Hasher,
} from "@/commerce/checkout-identity";
import type { ExpectedProviderContextV1 } from "@/commerce/payment-provider";
import {
  hasExactCheckoutProviderArtifact,
  hasExactProviderEventEnvelopeIdentity,
} from "@/commerce/payment-authority";
import {
  buildProviderRefundRequestV1,
  hashProviderRefundRequest,
  type ProviderKind,
  type ProviderRefundRequestV1,
} from "@/commerce/provider-contracts";
import { parseNormalizedProviderEventV1 } from "@/commerce/provider-events";
import type {
  RefundClaimDescriptorV1,
  RefundCommandRepository,
  RefundCommandResultV1,
  StrictRefundProviderResultV1,
} from "@/commerce/refund-service";
import { runSerializableWithRetry } from "@/db/serializable-retry";

export type RefundFulfillmentSqlClient = Readonly<{
  query: <Row extends object>(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<Readonly<{ rows: Row[] }>>;
}>;

export type RefundFulfillmentTransactionRunner = <Value>(
  work: (client: RefundFulfillmentSqlClient) => Promise<Value>,
  options: Readonly<{ isolationLevel: "serializable" }>,
) => Promise<Value>;

type RefundStatus =
  | "requested"
  | "submitted"
  | "succeeded"
  | "failed"
  | "cancelled";

type DiscoveryRow = Readonly<{
  orderId: string;
  normalizedPayload: unknown;
}>;

type ActorRow = Readonly<{ id: string; clerkId: string }>;
type ProfileRow = Readonly<{ userId: string; status: string }>;
type RoleRow = Readonly<{
  id: string;
  capability: string;
  revokedAt: Date | string | null;
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
}>;

type OrderRow = Readonly<{
  id: string;
  buyerUserId: string;
  state: string;
  currency: string;
  totalMinor: number | string;
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
  status: RefundStatus;
  origin: "staff_requested" | "provider_observed";
  providerRequestHash: string | null;
  attemptCount: number | string;
  submittedAt: Date | string | null;
  lastErrorRedacted: string | null;
  sourceProvider: string | null;
  sourceProviderEventId: string | null;
  sourceStatus: string | null;
  sourceLivemode: boolean | null;
  normalizedPayload: unknown;
}>;

type LockedRefundFacts = Readonly<{
  attempt: AttemptRow;
  order: OrderRow;
  payment: PaymentRow;
  target: RefundRow;
  paymentIntentId: string;
  provider: ProviderKind;
  livemode: boolean;
  providerScope: string;
  requestedAmountMinor: number;
}>;

type LockedFactsResult =
  | Readonly<{ status: "ok"; facts: LockedRefundFacts }>
  | Readonly<{ status: "unavailable" | "ineligible" | "conflict" }>;

type TerminalRefundStatus = "succeeded" | "failed" | "cancelled";

const terminalRefundStatuses = new Set<RefundStatus>([
  "succeeded",
  "failed",
  "cancelled",
]);

function isTerminalRefundStatus(
  status: RefundStatus,
): status is TerminalRefundStatus {
  return terminalRefundStatuses.has(status);
}

function safeInteger(value: unknown): number | null {
  const converted = Number(value);
  return Number.isSafeInteger(converted) ? converted : null;
}

function canonicalText(
  value: unknown,
  minimum = 1,
  maximum = 200,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function providerReference(value: unknown): value is string {
  return (
    canonicalText(value, 3, 200) &&
    /^[\x20-\x7e]+$/u.test(value)
  );
}

function providerKind(value: unknown): value is ProviderKind {
  return value === "stripe" || value === "local_test";
}

function exactContext(
  context: ExpectedProviderContextV1,
  provider: ProviderKind,
  livemode: boolean,
  scope: string,
): boolean {
  return (
    context.provider === provider &&
    context.livemode === livemode &&
    context.scope === scope
  );
}

function terminalResult(
  status: TerminalRefundStatus,
): Readonly<{
  status: "terminal";
  refundStatus: TerminalRefundStatus;
}> {
  return Object.freeze({
    status: "terminal" as const,
    refundStatus: status,
  });
}

async function lockActorAuthority(
  client: RefundFulfillmentSqlClient,
  input: Readonly<{
    actorUserId: string;
    actorClerkUserId: string;
  }>,
): Promise<boolean> {
  const users = await client.query<ActorRow>(
    `SELECT id::text AS id, clerk_id AS "clerkId"
     FROM users WHERE id = $1::uuid FOR UPDATE`,
    [input.actorUserId],
  );
  const profiles = await client.query<ProfileRow>(
    `SELECT user_id::text AS "userId", status
     FROM buyer_profiles WHERE user_id = $1::uuid FOR UPDATE`,
    [input.actorUserId],
  );
  const roles = await client.query<RoleRow>(
    `SELECT id::text AS id, capability, revoked_at AS "revokedAt"
     FROM staff_roles WHERE user_id = $1::uuid
     ORDER BY capability, id FOR UPDATE`,
    [input.actorUserId],
  );
  const user = users.rows[0];
  const profile = profiles.rows[0];
  return (
    users.rows.length === 1 &&
    user?.id === input.actorUserId &&
    user.clerkId === input.actorClerkUserId &&
    (profile === undefined ||
      (profiles.rows.length === 1 &&
        profile.userId === input.actorUserId &&
        profile.status !== "blocked")) &&
    roles.rows.some(
      (role) =>
        role.capability === "refund:request" && role.revokedAt === null,
    )
  );
}

async function discoverSourceAttempt(
  client: RefundFulfillmentSqlClient,
  refundId: string,
): Promise<Readonly<{ orderId: string; attemptId: string }> | null> {
  const discovered = await client.query<DiscoveryRow>(
    `SELECT r.order_id::text AS "orderId",
            source.normalized_payload AS "normalizedPayload"
     FROM refunds r
     JOIN payment_events payment ON payment.id = r.verified_payment_event_id
     JOIN provider_events source ON source.id = payment.provider_event_id
     WHERE r.id = $1::uuid`,
    [refundId],
  );
  const row = discovered.rows[0];
  const source = row === undefined
    ? null
    : parseNormalizedProviderEventV1(row.normalizedPayload);
  if (
    discovered.rows.length !== 1 ||
    row === undefined ||
    source === null ||
    source.kind !== "checkout_session" ||
    source.orderId !== row.orderId
  ) {
    return null;
  }
  return Object.freeze({ orderId: row.orderId, attemptId: source.attemptId });
}

async function lockAttempt(
  client: RefundFulfillmentSqlClient,
  attemptId: string,
): Promise<AttemptRow | null> {
  const result = await client.query<AttemptRow>(
    `SELECT id::text AS id, order_id::text AS "orderId",
            buyer_user_id::text AS "buyerUserId", status, provider,
            provider_request_id AS "providerRequestId",
            provider_session_id AS "providerSessionId",
            provider_request_hash AS "providerRequestHash",
            provider_request_schema_version AS "providerRequestSchemaVersion",
            provider_livemode AS "providerLivemode",
            provider_scope AS "providerScope"
     FROM checkout_attempts WHERE id = $1::uuid FOR UPDATE`,
    [attemptId],
  );
  return result.rows.length === 1 ? result.rows[0]! : null;
}

async function lockOrder(
  client: RefundFulfillmentSqlClient,
  orderId: string,
): Promise<OrderRow | null> {
  const result = await client.query<OrderRow>(
    `SELECT id::text AS id, buyer_user_id::text AS "buyerUserId", state,
            currency, total_minor AS "totalMinor"
     FROM orders WHERE id = $1::uuid FOR UPDATE`,
    [orderId],
  );
  return result.rows.length === 1 ? result.rows[0]! : null;
}

async function lockPayments(
  client: RefundFulfillmentSqlClient,
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
  client: RefundFulfillmentSqlClient,
  orderId: string,
): Promise<readonly RefundRow[]> {
  const result = await client.query<RefundRow>(
    `SELECT refund.id::text AS id,
            refund.order_id::text AS "orderId",
            refund.requested_by_user_id::text AS "requestedByUserId",
            refund.verified_payment_event_id::text AS "verifiedPaymentEventId",
            refund.provider,
            refund.provider_event_id::text AS "providerEventId",
            refund.provider_refund_id AS "providerRefundId",
            refund.idempotency_key AS "idempotencyKey",
            refund.requested_amount_minor AS "requestedAmountMinor",
            refund.confirmed_amount_minor AS "confirmedAmountMinor",
            refund.currency, refund.status, refund.origin,
            refund.provider_request_hash AS "providerRequestHash",
            refund.attempt_count AS "attemptCount",
            refund.submitted_at AS "submittedAt",
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

function exactSucceededRefund(
  refund: RefundRow,
  payment: PaymentRow,
  paymentIntentId: string,
  paymentLivemode: boolean,
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
    !providerReference(refund.providerRefundId) ||
    refund.sourceProvider !== payment.provider ||
    refund.sourceStatus !== "processed" ||
    refund.sourceLivemode !== paymentLivemode ||
    event === null ||
    event.kind !== "refund" ||
    !hasExactProviderEventEnvelopeIdentity(
      refund.sourceProviderEventId,
      event,
    ) ||
    event.status !== "succeeded" ||
    event.providerRefundId !== refund.providerRefundId ||
    event.paymentIntentId !== paymentIntentId ||
    event.amountMinor !== confirmed ||
    event.currency !== order.currency.toLowerCase() ||
    event.livemode !== paymentLivemode ||
    (refund.origin === "staff_requested"
      ? event.orderId !== order.id || event.refundRequestId !== refund.id
      : event.orderId !== null || event.refundRequestId !== null)
  ) {
    return null;
  }
  return confirmed;
}

function exactRefundBase(
  refund: RefundRow,
  payment: PaymentRow,
  order: OrderRow,
): boolean {
  const requested = safeInteger(refund.requestedAmountMinor);
  const attempts = safeInteger(refund.attemptCount);
  return (
    isCanonicalUuid(refund.id) &&
    refund.orderId === order.id &&
    refund.verifiedPaymentEventId === payment.id &&
    refund.provider === payment.provider &&
    canonicalText(refund.idempotencyKey, 1, 200) &&
    requested !== null &&
    requested > 0 &&
    refund.currency === order.currency &&
    attempts !== null &&
    attempts >= 0 &&
    (refund.providerRefundId === null ||
      providerReference(refund.providerRefundId)) &&
    (refund.origin === "staff_requested"
      ? isCanonicalUuid(refund.requestedByUserId)
      : refund.requestedByUserId === null) &&
    (refund.providerRequestHash === null ||
      isSha256(refund.providerRequestHash)) &&
    (refund.origin === "provider_observed"
      ? refund.providerRequestHash === null &&
        attempts === 0 &&
        refund.submittedAt === null
      : refund.status === "requested"
        ? refund.providerRequestHash === null &&
          attempts === 0 &&
          refund.submittedAt === null &&
          refund.lastErrorRedacted === null
        : refund.status === "failed"
          ? refund.providerRequestHash !== null &&
            attempts >= 1 &&
            refund.submittedAt !== null &&
            canonicalText(refund.lastErrorRedacted, 1, 200)
          : refund.providerRequestHash !== null &&
            attempts >= 1 &&
            refund.submittedAt !== null &&
            refund.lastErrorRedacted === null)
  );
}

async function loadLockedRefundFacts(
  client: RefundFulfillmentSqlClient,
  input: Readonly<{
    refundId: string;
    actorUserId: string;
    actorClerkUserId: string;
    expectedProviderContext: ExpectedProviderContextV1;
  }>,
): Promise<LockedFactsResult> {
  const discovery = await discoverSourceAttempt(client, input.refundId);
  if (discovery === null) return Object.freeze({ status: "conflict" as const });
  if (!(await lockActorAuthority(client, input))) {
    return Object.freeze({ status: "unavailable" as const });
  }
  const attempt = await lockAttempt(client, discovery.attemptId);
  if (attempt === null) return Object.freeze({ status: "conflict" as const });
  const order = await lockOrder(client, discovery.orderId);
  if (order === null) return Object.freeze({ status: "conflict" as const });
  const paymentRows = await lockPayments(client, order.id);
  const refundRows = await lockRefunds(client, order.id);
  const verified = paymentRows.filter(
    (payment) => payment.eventType === "payment_verified",
  );
  if (verified.length !== 1) {
    return Object.freeze({ status: "conflict" as const });
  }
  const payment = verified[0]!;
  const paidMinor = safeInteger(payment.amountMinor);
  const totalMinor = safeInteger(order.totalMinor);
  const source = parseNormalizedProviderEventV1(payment.normalizedPayload);
  if (
    !providerKind(payment.provider) ||
    payment.providerEventStatus !== "processed" ||
    !providerReference(payment.providerPaymentId) ||
    paidMinor === null ||
    paidMinor <= 0 ||
    paidMinor !== totalMinor ||
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
    source.amountMinor !== paidMinor ||
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
    !canonicalText(attempt.providerScope, 1, 200) ||
    !exactContext(
      input.expectedProviderContext,
      payment.provider,
      source.livemode,
      attempt.providerScope,
    )
  ) {
    return Object.freeze({ status: "conflict" as const });
  }

  const target = refundRows.find((refund) => refund.id === input.refundId);
  if (target === undefined) {
    return Object.freeze({ status: "conflict" as const });
  }
  let confirmedMinor = 0;
  let otherOutstanding = false;
  for (const refund of refundRows) {
    if (!exactRefundBase(refund, payment, order)) {
      return Object.freeze({ status: "conflict" as const });
    }
    if (
      refund.id !== target.id &&
      (refund.status === "requested" || refund.status === "submitted")
    ) {
      otherOutstanding = true;
    }
    if (refund.status !== "succeeded") continue;
    const exact = exactSucceededRefund(
      refund,
      payment,
      payment.providerPaymentId,
      source.livemode,
      order,
    );
    if (exact === null) {
      return Object.freeze({ status: "conflict" as const });
    }
    confirmedMinor += exact;
    if (!Number.isSafeInteger(confirmedMinor) || confirmedMinor > paidMinor) {
      return Object.freeze({ status: "conflict" as const });
    }
  }

  const requestedAmountMinor = safeInteger(target.requestedAmountMinor);
  const targetConfirmed = target.status === "succeeded"
    ? safeInteger(target.confirmedAmountMinor) ?? 0
    : 0;
  const remainingBeforeTarget = paidMinor - confirmedMinor + targetConfirmed;
  const targetIsTerminal = isTerminalRefundStatus(target.status);
  if (
    target.origin !== "staff_requested" ||
    target.requestedByUserId !== input.actorUserId ||
    target.verifiedPaymentEventId !== payment.id ||
    target.provider !== payment.provider ||
    target.currency !== payment.currency ||
    requestedAmountMinor === null ||
    requestedAmountMinor <= 0 ||
    requestedAmountMinor > paidMinor
  ) {
    return Object.freeze({ status: "conflict" as const });
  }
  if (
    !targetIsTerminal &&
    order.state !== "paid_pending_fulfillment" &&
    order.state !== "paid_on_hold"
  ) {
    return Object.freeze({ status: "ineligible" as const });
  }
  if (
    !targetIsTerminal &&
    (requestedAmountMinor > remainingBeforeTarget || otherOutstanding)
  ) {
    return Object.freeze({ status: "conflict" as const });
  }

  return Object.freeze({
    status: "ok" as const,
    facts: Object.freeze({
      attempt,
      order,
      payment,
      target,
      paymentIntentId: payment.providerPaymentId,
      provider: payment.provider,
      livemode: source.livemode,
      providerScope: attempt.providerScope,
      requestedAmountMinor,
    }),
  });
}

function buildRequest(facts: LockedRefundFacts): ProviderRefundRequestV1 | null {
  const built = buildProviderRefundRequestV1({
    schemaVersion: 1,
    provider: facts.provider,
    refundId: facts.target.id,
    orderId: facts.order.id,
    requestedAmountMinor: facts.requestedAmountMinor,
    currency: facts.order.currency,
    paymentIntentId: facts.paymentIntentId,
    chargeId: null,
    providerIdempotencyKey: `refund_request:${facts.target.id}`,
  });
  return built.ok ? built.value : null;
}

function descriptorFor(
  facts: LockedRefundFacts,
  input: Readonly<{
    actorUserId: string;
    actorClerkUserId: string;
    expectedProviderContext: ExpectedProviderContextV1;
  }>,
  request: ProviderRefundRequestV1,
  requestHash: string,
  expectedAttempt: number,
): RefundClaimDescriptorV1 {
  const context = Object.freeze({
    provider: input.expectedProviderContext.provider,
    livemode: input.expectedProviderContext.livemode,
    scope: input.expectedProviderContext.scope,
  });
  const common = {
    actorUserId: input.actorUserId,
    actorClerkUserId: input.actorClerkUserId,
    refundId: facts.target.id,
    orderId: facts.order.id,
    verifiedPaymentEventId: facts.payment.id,
    request,
    requestHash,
    expectedAttempt,
    expectedProviderContext: context,
  } as const;
  return facts.target.providerRefundId === null
    ? Object.freeze({ operation: "create" as const, ...common })
    : Object.freeze({
        operation: "retrieve" as const,
        knownProviderRefundId: facts.target.providerRefundId,
        ...common,
      });
}

function descriptorBasics(descriptor: RefundClaimDescriptorV1): boolean {
  return (
    (descriptor.operation === "create" || descriptor.operation === "retrieve") &&
    isCanonicalUuid(descriptor.actorUserId) &&
    providerReference(descriptor.actorClerkUserId) &&
    isCanonicalUuid(descriptor.refundId) &&
    isCanonicalUuid(descriptor.orderId) &&
    isCanonicalUuid(descriptor.verifiedPaymentEventId) &&
    isSha256(descriptor.requestHash) &&
    Number.isSafeInteger(descriptor.expectedAttempt) &&
    descriptor.expectedAttempt > 0 &&
    providerKind(descriptor.expectedProviderContext.provider) &&
    typeof descriptor.expectedProviderContext.livemode === "boolean" &&
    canonicalText(descriptor.expectedProviderContext.scope, 1, 200) &&
    (descriptor.operation === "create"
      ? descriptor.knownProviderRefundId === undefined
      : providerReference(descriptor.knownProviderRefundId))
  );
}

function exactStrictResult(result: StrictRefundProviderResultV1): boolean {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return false;
  }
  if (result.kind === "definite_rejection") {
    return Reflect.ownKeys(result).length === 1;
  }
  if (result.kind === "provider_unknown") {
    return (
      Reflect.ownKeys(result).length === 2 &&
      (result.providerRefundId === null ||
        providerReference(result.providerRefundId))
    );
  }
  return (
    result.kind === "normalized" &&
    Reflect.ownKeys(result).length === 3 &&
    providerReference(result.providerRefundId) &&
    (result.status === "pending" ||
      result.status === "requires_action" ||
      result.status === "succeeded" ||
      result.status === "failed" ||
      result.status === "canceled")
  );
}

export function createRefundFulfillmentRepository(input: Readonly<{
  runSerializableTransaction: RefundFulfillmentTransactionRunner;
  sha256: Sha256Hasher;
  retrySleep?: (
    retryNumber: 1 | 2,
    sqlState: "40001" | "40P01",
  ) => Promise<void>;
}>): RefundCommandRepository {
  const transaction = <Value>(
    work: (client: RefundFulfillmentSqlClient) => Promise<Value>,
  ) =>
    runSerializableWithRetry(
      () =>
        input.runSerializableTransaction(work, {
          isolationLevel: "serializable",
        }),
      input.retrySleep === undefined ? {} : { sleep: input.retrySleep },
    );

  return Object.freeze({
    claim: (claimInput) =>
      transaction(async (client) => {
        if (
          !isCanonicalUuid(claimInput.refundId) ||
          !isCanonicalUuid(claimInput.actorUserId) ||
          !providerReference(claimInput.actorClerkUserId) ||
          !Number.isFinite(claimInput.now.getTime()) ||
          !providerKind(claimInput.expectedProviderContext.provider) ||
          typeof claimInput.expectedProviderContext.livemode !== "boolean" ||
          !canonicalText(claimInput.expectedProviderContext.scope, 1, 200)
        ) {
          return Object.freeze({ status: "unavailable" as const });
        }
        const loaded = await loadLockedRefundFacts(client, claimInput);
        if (loaded.status !== "ok") return loaded;
        const { facts } = loaded;
        if (isTerminalRefundStatus(facts.target.status)) {
          return terminalResult(facts.target.status);
        }
        if (
          facts.target.status !== "requested" &&
          facts.target.status !== "submitted"
        ) {
          return Object.freeze({ status: "conflict" as const });
        }
        const request = buildRequest(facts);
        if (request === null) {
          return Object.freeze({ status: "conflict" as const });
        }
        const requestHash = await hashProviderRefundRequest(
          request,
          input.sha256,
        );
        if (!isSha256(requestHash)) {
          return Object.freeze({ status: "conflict" as const });
        }
        const priorAttempts = safeInteger(facts.target.attemptCount);
        if (priorAttempts === null) {
          return Object.freeze({ status: "conflict" as const });
        }
        const expectedAttempt = facts.target.status === "requested"
          ? 1
          : priorAttempts + 1;
        if (!Number.isSafeInteger(expectedAttempt)) {
          return Object.freeze({ status: "conflict" as const });
        }
        if (
          facts.target.status === "requested" &&
          (facts.target.providerRequestHash !== null ||
            priorAttempts !== 0 ||
            facts.target.submittedAt !== null ||
            facts.target.lastErrorRedacted !== null ||
            facts.target.providerRefundId !== null)
        ) {
          return Object.freeze({ status: "conflict" as const });
        }
        if (
          facts.target.status === "submitted" &&
          (facts.target.providerRequestHash !== requestHash ||
            priorAttempts < 1 ||
            facts.target.submittedAt === null ||
            facts.target.lastErrorRedacted !== null)
        ) {
          return Object.freeze({ status: "conflict" as const });
        }
        const updated = facts.target.status === "requested"
          ? await client.query<{ id: string }>(
              `UPDATE refunds
               SET status = 'submitted', provider_request_hash = $2,
                   attempt_count = 1, submitted_at = $3::timestamptz,
                   last_error_redacted = NULL
               WHERE id = $1::uuid AND status = 'requested'
                 AND provider_request_hash IS NULL AND attempt_count = 0
                 AND submitted_at IS NULL AND last_error_redacted IS NULL
                 AND provider_refund_id IS NULL
               RETURNING id::text AS id`,
              [
                facts.target.id,
                requestHash,
                claimInput.now.toISOString(),
              ],
            )
          : await client.query<{ id: string }>(
              `UPDATE refunds
               SET attempt_count = attempt_count + 1
               WHERE id = $1::uuid AND status = 'submitted'
                 AND provider_request_hash = $2
                 AND attempt_count = $3
                 AND submitted_at IS NOT NULL
                 AND last_error_redacted IS NULL
               RETURNING id::text AS id`,
              [facts.target.id, requestHash, priorAttempts],
            );
        if (updated.rows.length !== 1) {
          return Object.freeze({ status: "conflict" as const });
        }
        return Object.freeze({
          status: "call_required" as const,
          descriptor: descriptorFor(
            facts,
            claimInput,
            request,
            requestHash,
            expectedAttempt,
          ),
        });
      }),

    applyResult: (applyInput) => {
      if (
        !descriptorBasics(applyInput.descriptor) ||
        !exactStrictResult(applyInput.result) ||
        !Number.isFinite(applyInput.now.getTime())
      ) {
        return Promise.resolve(
          Object.freeze({ status: "conflict" as const }),
        );
      }
      return transaction(async (client) => {
        const descriptor = applyInput.descriptor;
        const loaded = await loadLockedRefundFacts(client, {
          refundId: descriptor.refundId,
          actorUserId: descriptor.actorUserId,
          actorClerkUserId: descriptor.actorClerkUserId,
          expectedProviderContext: descriptor.expectedProviderContext,
        });
        if (loaded.status !== "ok") return loaded;
        const { facts } = loaded;
        if (isTerminalRefundStatus(facts.target.status)) {
          return terminalResult(facts.target.status);
        }
        if (facts.target.status !== "submitted") {
          return Object.freeze({ status: "conflict" as const });
        }
        const request = buildRequest(facts);
        if (request === null) {
          return Object.freeze({ status: "conflict" as const });
        }
        const requestHash = await hashProviderRefundRequest(
          request,
          input.sha256,
        );
        if (
          requestHash !== descriptor.requestHash ||
          requestHash !== facts.target.providerRequestHash ||
          JSON.stringify(request) !== JSON.stringify(descriptor.request) ||
          facts.target.id !== descriptor.refundId ||
          facts.order.id !== descriptor.orderId ||
          facts.payment.id !== descriptor.verifiedPaymentEventId ||
          !exactContext(
            descriptor.expectedProviderContext,
            facts.provider,
            facts.livemode,
            facts.providerScope,
          )
        ) {
          return Object.freeze({ status: "conflict" as const });
        }
        const attemptCount = safeInteger(facts.target.attemptCount);
        if (attemptCount !== descriptor.expectedAttempt) {
          return Object.freeze({ status: "stale" as const });
        }
        if (
          descriptor.operation === "retrieve" &&
          facts.target.providerRefundId !== descriptor.knownProviderRefundId
        ) {
          return Object.freeze({ status: "conflict" as const });
        }
        const learnedProviderRefundId = applyInput.result.kind === "definite_rejection"
          ? null
          : applyInput.result.providerRefundId;
        if (
          learnedProviderRefundId !== null &&
          facts.target.providerRefundId !== null &&
          learnedProviderRefundId !== facts.target.providerRefundId
        ) {
          return Object.freeze({ status: "conflict" as const });
        }
        if (
          applyInput.result.kind === "definite_rejection" &&
          (descriptor.operation !== "create" ||
            facts.target.providerRefundId !== null)
        ) {
          return Object.freeze({ status: "conflict" as const });
        }

        const providerRefundId = learnedProviderRefundId ??
          facts.target.providerRefundId;
        let persistedStatus: "submitted" | "failed" | "cancelled" = "submitted";
        let lastError: string | null = null;
        let resultStatus: RefundCommandResultV1["status"] = "submitted";
        if (applyInput.result.kind === "definite_rejection") {
          persistedStatus = "failed";
          lastError = "provider_refund_rejected";
          resultStatus = "failed";
        } else if (applyInput.result.kind === "normalized") {
          if (applyInput.result.status === "succeeded") {
            resultStatus = "awaiting_signed_event";
          } else if (applyInput.result.status === "failed") {
            persistedStatus = "failed";
            lastError = "provider_refund_failed";
            resultStatus = "failed";
          } else if (applyInput.result.status === "canceled") {
            persistedStatus = "cancelled";
            resultStatus = "cancelled";
          }
        }
        const updated = await client.query<{ id: string }>(
          `UPDATE refunds
           SET status = $5::refund_status,
               provider_refund_id = $6,
               last_error_redacted = $7
           WHERE id = $1::uuid AND status = 'submitted'
             AND provider_request_hash = $2
             AND attempt_count = $3
             AND verified_payment_event_id = $4::uuid
             AND provider = $8
             AND order_id = $9::uuid
             AND requested_by_user_id = $10::uuid
             AND origin = 'staff_requested'
             AND requested_amount_minor = $11
             AND currency = $12
             AND (provider_refund_id IS NULL OR provider_refund_id = $6)
           RETURNING id::text AS id`,
          [
            descriptor.refundId,
            descriptor.requestHash,
            descriptor.expectedAttempt,
            descriptor.verifiedPaymentEventId,
            persistedStatus,
            providerRefundId,
            lastError,
            facts.provider,
            descriptor.orderId,
            descriptor.actorUserId,
            facts.requestedAmountMinor,
            facts.order.currency,
          ],
        );
        if (updated.rows.length !== 1) {
          return Object.freeze({ status: "conflict" as const });
        }
        return Object.freeze({ status: resultStatus });
      });
    },
  });
}
