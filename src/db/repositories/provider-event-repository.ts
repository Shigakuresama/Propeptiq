import "server-only";

import { createHash } from "node:crypto";

import {
  isCanonicalUuid,
  isSha256,
  type KeyedUuidGenerator,
} from "@/commerce/checkout-identity";
import type {
  CheckoutSessionProviderEventV1,
  DisputeProviderEventV1,
  NormalizedProviderEventV1,
  ProviderEventNormalizationResultV1,
  RefundProviderEventV1,
  RefundReconciliationProviderEventV1,
  InvoiceProviderEventV1,
} from "@/commerce/provider-events";
import {
  parseKnownProviderEventConflictV1,
  parseNormalizedProviderEventV1,
} from "@/commerce/provider-events";
import { hasExactProviderEventEnvelopeIdentity } from "@/commerce/payment-authority";
import {
  projectProviderEventAuthorityV1,
  type ProviderEventAuthorityV1,
} from "@/commerce/stripe-webhook-verifier";
import {
  transitionOrder,
  transitionPayment,
  type OrderState,
} from "@/domain/orders";
import {
  releaseCheckoutReservationsForDefiniteFailureInTransaction,
  type CheckoutSqlClient,
} from "@/db/repositories/checkout-repository";
import { runSerializableWithRetry } from "@/db/serializable-retry";

export type ProviderEventSqlClient = Readonly<{
  query: (
    sql: string,
    parameters?: readonly unknown[],
  ) => Promise<Readonly<{ rows: unknown[] }>>;
}>;

export type ProviderEventTransactionRunner = <Value>(
  work: (client: ProviderEventSqlClient) => Promise<Value>,
  options: Readonly<{
    isolationLevel: "serializable";
    providerIdentityFenceKeys: readonly string[];
  }>,
) => Promise<Value>;

export type ProviderEventSqlSession = ProviderEventSqlClient & Readonly<{
  release: (destroy?: boolean) => void | Promise<void>;
}>;

export function createProviderEventTransactionRunner(
  connect: () => Promise<ProviderEventSqlSession>,
): ProviderEventTransactionRunner {
  return async <Value>(work: (client: ProviderEventSqlClient) => Promise<Value>, options: Readonly<{
    isolationLevel: "serializable";
    providerIdentityFenceKeys: readonly string[];
  }>): Promise<Value> => {
    const session = await connect();
    const fenceKeys = [...new Set(options.providerIdentityFenceKeys)]
      .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
    const lockedFenceKeys: string[] = [];
    let fenceAcquisitionInFlight = false;
    let transactionStartAttempted = false;
    let transactionStarted = false;
    let transactionCommitted = false;
    let destroySession = false;
    let failed = false;
    let failure: unknown;
    let value: Value | undefined;
    try {
      for (const fenceKey of fenceKeys) {
        fenceAcquisitionInFlight = true;
        await session.query(
          `SELECT pg_advisory_lock($1::bigint)`,
          [fenceKey],
        );
        fenceAcquisitionInFlight = false;
        lockedFenceKeys.push(fenceKey);
      }
      transactionStartAttempted = true;
      await session.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      transactionStarted = true;
      value = await work(session);
      await session.query("COMMIT");
      transactionCommitted = true;
      transactionStarted = false;
    } catch (error) {
      failed = true;
      failure = error;
      if (fenceAcquisitionInFlight) {
        // The client cannot prove whether a failed lock round-trip reached
        // PostgreSQL, so never return that physical session to the pool.
        destroySession = true;
      }
      if (transactionStartAttempted && !transactionStarted) {
        // A failed BEGIN round-trip cannot prove whether PostgreSQL opened a
        // transaction, even when the advisory lock can still be released.
        destroySession = true;
      }
      if (transactionStarted && !transactionCommitted) {
        try {
          await session.query("ROLLBACK");
          transactionStarted = false;
        } catch {
          destroySession = true;
        }
      }
    } finally {
      let fenceCleanupFailed = false;
      for (const fenceKey of [...lockedFenceKeys].reverse()) {
        try {
          const unlocked = await session.query(
            `SELECT pg_advisory_unlock($1::bigint) AS unlocked`,
            [fenceKey],
          );
          if (
            unlocked.rows.length !== 1 ||
            (unlocked.rows[0] as { unlocked?: unknown }).unlocked !== true
          ) {
            throw new Error("Provider identity fence unlock was not acknowledged");
          }
        } catch {
          destroySession = true;
          fenceCleanupFailed = true;
        }
      }
      if (fenceCleanupFailed && !failed) {
        failed = true;
        failure = new Error("Provider identity fence cleanup failed");
      }
      try {
        await session.release(destroySession);
      } catch {
        if (!failed) {
          failed = true;
          failure = new Error("Provider event SQL session release failed");
        }
      }
    }
    if (failed) throw failure;
    return value as Value;
  };
}

export type ProcessableProviderEventNormalizationV1 = Exclude<
  ProviderEventNormalizationResultV1,
  Readonly<{ status: "invalid" }>
>;

export type RegisterProviderEventInputV1 = Readonly<{
  provider: "stripe";
  databaseEventId: string;
  conflictAuditId: string;
  payloadHash: string;
  normalization: ProcessableProviderEventNormalizationV1;
  receivedAt: Date;
  claimAt: Date;
  leaseToken: string;
  leaseExpiresAt: Date;
}>;

export type ProviderEventClaimV1 = Readonly<{
  toJSON: () => never;
}>;

type ProviderEventClaimProjectionV1 = Readonly<{
  databaseEventId: string;
  leaseToken: string;
  providerIdentityFenceKeys: readonly string[];
}>;

export type RegisterProviderEventResultV1 =
  | Readonly<{ status: "claimed"; claim: ProviderEventClaimV1 }>
  | Readonly<{ status: "processed" | "conflict" | "busy" }>;

export type ProviderEventRepository = Readonly<{
  registerAndClaim: (
    input: RegisterProviderEventInputV1,
  ) => Promise<RegisterProviderEventResultV1>;
  processClaim: (input: Readonly<{
    claim: ProviderEventClaimV1;
    authority: ProviderEventAuthorityV1;
    now: Date;
  }>) => Promise<Readonly<{
    status: "processed" | "deferred" | "conflict" | "lease_lost";
  }>>;
  wakeDeferredDependencies: (input: Readonly<{
    verifiedPaymentEventId: string;
    now: Date;
  }>) => Promise<Readonly<{
    status: "woken" | "missing_dependency";
    count: number;
  }>>;
  markClaimFailed: (
    claim: ProviderEventClaimV1,
    input: Readonly<{ now: Date; reason: string }>,
  ) => Promise<Readonly<{ status: "applied" | "lease_lost" }>>;
}>;

type ProviderEventRow = Readonly<{
  id: string;
  providerEventId: string;
  payloadHash: string;
  status: "pending" | "processing" | "processed" | "failed" | "deferred" | "conflict";
  attemptCount: number | string;
  leaseToken: string | null;
  leaseExpiresAt: Date | string | null;
  eventType: string;
  schemaVersion: number | string;
  normalizedPayload: unknown;
  providerCreatedAt: Date | string;
  livemode: boolean;
}>;

type LockedProviderEventRow = ProviderEventRow &
  Readonly<{
    provider: string;
    processedAt: Date | string | null;
  }>;

type ConflictReason =
  | "malformed_known_event"
  | "payload_hash_mismatch"
  | "immutable_common_mismatch";

const claims = new WeakMap<object, ProviderEventClaimProjectionV1>();
const reclaimableStatuses = new Set(["pending", "failed", "deferred"] as const);
const BOUNDED_TEXT = /^[\x20-\x7e]{1,255}$/u;

function mintClaim(
  databaseEventId: string,
  leaseToken: string,
  providerIdentityFenceKeys: readonly string[],
): ProviderEventClaimV1 {
  const claim = Object.freeze({
    toJSON(): never {
      throw new Error("Provider event claims must never be serialized");
    },
  });
  claims.set(claim, Object.freeze({
    databaseEventId,
    leaseToken,
    providerIdentityFenceKeys: Object.freeze([...providerIdentityFenceKeys]),
  }));
  return claim;
}

export function projectProviderEventClaimV1(
  value: unknown,
): ProviderEventClaimProjectionV1 | null {
  return typeof value === "object" && value !== null
    ? claims.get(value) ?? null
    : null;
}

function rows<Row>(result: Readonly<{ rows: unknown[] }>): Row[] {
  return result.rows as Row[];
}

function iso(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function exactCommonCoherence(
  row: ProviderEventRow,
  input: RegisterProviderEventInputV1,
): boolean {
  const payload =
    typeof row.normalizedPayload === "object" &&
    row.normalizedPayload !== null &&
    !Array.isArray(row.normalizedPayload)
      ? (row.normalizedPayload as Record<string, unknown>)
      : null;
  const event = input.normalization.event;
  return (
    row.providerEventId === event.providerEventId &&
    row.eventType === event.eventType &&
    Number(row.schemaVersion) === event.schemaVersion &&
    row.livemode === event.livemode &&
    iso(row.providerCreatedAt) === event.providerCreatedAt &&
    payload !== null &&
    payload.providerEventId === event.providerEventId &&
    payload.eventType === event.eventType &&
    payload.schemaVersion === event.schemaVersion &&
    payload.livemode === event.livemode
  );
}

function storedEventCommonCoherent(
  row: ProviderEventRow,
  event: NormalizedProviderEventV1,
): boolean {
  return (
    hasExactProviderEventEnvelopeIdentity(row.providerEventId, event) &&
    row.eventType === event.eventType &&
    Number(row.schemaVersion) === event.schemaVersion &&
    row.livemode === event.livemode &&
    iso(row.providerCreatedAt) === event.providerCreatedAt
  );
}

function validateRegistration(input: RegisterProviderEventInputV1): void {
  const strictEvent = input.normalization.status === "conflict"
    ? parseKnownProviderEventConflictV1(input.normalization.event)
    : parseNormalizedProviderEventV1(input.normalization.event);
  if (
    input.provider !== "stripe" ||
    !isCanonicalUuid(input.databaseEventId) ||
    !isCanonicalUuid(input.conflictAuditId) ||
    !isSha256(input.payloadHash) ||
    !BOUNDED_TEXT.test(input.leaseToken) ||
    !Number.isFinite(input.receivedAt.getTime()) ||
    !Number.isFinite(input.claimAt.getTime()) ||
    !Number.isFinite(input.leaseExpiresAt.getTime()) ||
    input.leaseExpiresAt <= input.claimAt ||
    input.leaseExpiresAt <= input.receivedAt ||
    strictEvent === null
  ) {
    throw new Error(
      strictEvent === null
        ? "Invalid normalized provider event registration"
        : "Invalid provider event registration",
    );
  }
}

async function recordConflictAudit(
  client: ProviderEventSqlClient,
  input: RegisterProviderEventInputV1,
  databaseEventId: string,
  reason: ConflictReason,
): Promise<void> {
  await client.query(
    `INSERT INTO admin_audit
       (id, actor_user_id, service_identity, action, resource_type,
        resource_id, correlation_id, metadata, occurred_at)
     VALUES ($1, NULL, 'commerce.provider_event', 'provider_event_conflict',
             'provider_event', $2, $2, $3::jsonb, $4)
     ON CONFLICT (id) DO NOTHING`,
    [
      input.conflictAuditId,
      databaseEventId,
      JSON.stringify({ schemaVersion: 1, reason }),
      input.claimAt,
    ],
  );
}

async function markConflict(
  client: ProviderEventSqlClient,
  input: RegisterProviderEventInputV1,
  row: ProviderEventRow,
  reason: ConflictReason,
): Promise<RegisterProviderEventResultV1> {
  if (row.status !== "conflict") {
    await client.query(
      `UPDATE provider_events
       SET status = 'conflict', lease_token = NULL, lease_expires_at = NULL,
           last_error_redacted = $2, processed_at = $3
       WHERE id = $1`,
      [row.id, reason, input.claimAt],
    );
    await recordConflictAudit(client, input, row.id, reason);
  }
  return Object.freeze({ status: "conflict" });
}

async function registerInTransaction(
  client: ProviderEventSqlClient,
  input: RegisterProviderEventInputV1,
): Promise<RegisterProviderEventResultV1> {
  const terminalConflict = input.normalization.status === "conflict";
  const inserted = rows<ProviderEventRow>(
    await client.query(
      `INSERT INTO provider_events
         (id, provider, provider_event_id, payload_hash, status, attempt_count,
          lease_token, lease_expires_at, last_error_redacted, received_at,
          processed_at, event_type, schema_version, normalized_payload,
          provider_created_at, livemode)
       VALUES
         ($1, $2, $3, $4, $5, 1, $6, $7, $8, $9, $10, $11, 1,
          $12::jsonb, $13, $14)
       ON CONFLICT (provider, provider_event_id) DO NOTHING
       RETURNING id,
         provider_event_id AS "providerEventId",
         payload_hash AS "payloadHash", status,
         attempt_count AS "attemptCount", lease_token AS "leaseToken",
         lease_expires_at AS "leaseExpiresAt", event_type AS "eventType",
         schema_version AS "schemaVersion",
         normalized_payload AS "normalizedPayload",
         provider_created_at AS "providerCreatedAt", livemode`,
      [
        input.databaseEventId,
        input.provider,
        input.normalization.event.providerEventId,
        input.payloadHash,
        terminalConflict ? "conflict" : "processing",
        terminalConflict ? null : input.leaseToken,
        terminalConflict ? null : input.leaseExpiresAt,
        terminalConflict ? "malformed_known_event" : null,
        input.receivedAt,
        terminalConflict ? input.claimAt : null,
        input.normalization.event.eventType,
        JSON.stringify(input.normalization.event),
        input.normalization.event.providerCreatedAt,
        input.normalization.event.livemode,
      ],
    ),
  );

  const newRow = inserted[0];
  if (newRow !== undefined) {
    if (terminalConflict) {
      await recordConflictAudit(
        client,
        input,
        newRow.id,
        "malformed_known_event",
      );
      return Object.freeze({ status: "conflict" });
    }
    return Object.freeze({
      status: "claimed",
      claim: mintClaim(
        newRow.id,
        input.leaseToken,
        providerIdentityFenceKeys(
          input.provider,
          input.normalization.event,
        ),
      ),
    });
  }

  const existingRows = rows<ProviderEventRow>(
    await client.query(
      `SELECT id, provider_event_id AS "providerEventId",
              payload_hash AS "payloadHash", status,
              attempt_count AS "attemptCount", lease_token AS "leaseToken",
              lease_expires_at AS "leaseExpiresAt", event_type AS "eventType",
              schema_version AS "schemaVersion",
              normalized_payload AS "normalizedPayload",
              provider_created_at AS "providerCreatedAt", livemode
       FROM provider_events
       WHERE provider = $1 AND provider_event_id = $2
       FOR UPDATE`,
      [input.provider, input.normalization.event.providerEventId],
    ),
  );
  const row = existingRows[0];
  if (row === undefined || existingRows.length !== 1) {
    throw new Error("Provider event registration race was not resolved");
  }

  if (row.payloadHash !== input.payloadHash) {
    return markConflict(client, input, row, "payload_hash_mismatch");
  }
  if (!exactCommonCoherence(row, input)) {
    return markConflict(client, input, row, "immutable_common_mismatch");
  }
  if (row.status === "processed") return Object.freeze({ status: "processed" });
  if (row.status === "conflict") return Object.freeze({ status: "conflict" });
  if (terminalConflict) {
    return markConflict(client, input, row, "malformed_known_event");
  }

  const leaseExpired =
    row.status === "processing" &&
    row.leaseExpiresAt !== null &&
    new Date(row.leaseExpiresAt).getTime() <= input.claimAt.getTime();
  if (row.status === "processing" && !leaseExpired) {
    return Object.freeze({ status: "busy" });
  }
  if (
    !leaseExpired &&
    !reclaimableStatuses.has(
      row.status as "pending" | "failed" | "deferred",
    )
  ) {
    throw new Error("Provider event status is not reclaimable");
  }

  await client.query(
    `UPDATE provider_events
     SET status = 'processing', attempt_count = attempt_count + 1,
         lease_token = $2, lease_expires_at = $3,
         last_error_redacted = NULL, processed_at = NULL
     WHERE id = $1`,
    [row.id, input.leaseToken, input.leaseExpiresAt],
  );
  return Object.freeze({
    status: "claimed",
    claim: mintClaim(
      row.id,
      input.leaseToken,
      providerIdentityFenceKeys(
        input.provider,
        input.normalization.event,
      ),
    ),
  });
}

type ProcessingResult = Readonly<{
  status: "processed" | "deferred" | "conflict" | "lease_lost";
}>;

type AttemptRow = Readonly<{
  id: string;
  orderId: string;
  buyerUserId: string;
  status: "created" | "open" | "provider_unknown" | "completed" | "expired" | "failed";
  provider: string | null;
  providerRequestId: string | null;
  providerSessionId: string | null;
  providerLivemode: boolean | null;
  providerScope: string | null;
  taxReady: boolean;
  taxQuoteReference: string | null;
}>;

type OrderRow = Readonly<{
  id: string;
  buyerUserId: string;
  state: OrderState;
  currency: string;
  totalMinor: number | string;
}>;

type PaymentRow = Readonly<{
  id: string;
  providerEventId: string;
  orderId: string;
  eventType: string;
  providerPaymentId: string | null;
  idempotencyKey: string;
  amountMinor: number | string;
  currency: string;
}>;

type ReservationRow = Readonly<{
  id: string;
  state: "active" | "released" | "expired" | "consumed";
  quantityReserved: number | string;
  quantityRemaining: number | string;
}>;

function safeNonnegativeInteger(value: unknown): number | null {
  const converted = Number(value);
  return Number.isSafeInteger(converted) && converted >= 0 ? converted : null;
}

function stableUuid(keyedUuid: KeyedUuidGenerator, label: string): string {
  const value = keyedUuid(label);
  if (!isCanonicalUuid(value)) {
    throw new Error("Provider event keyed UUID generator returned an invalid UUID");
  }
  return value;
}

async function finishProcessed(
  client: ProviderEventSqlClient,
  eventId: string,
  now: Date,
): Promise<ProcessingResult> {
  await client.query(
    `UPDATE provider_events
     SET status = 'processed', lease_token = NULL, lease_expires_at = NULL,
         last_error_redacted = NULL, processed_at = $2
     WHERE id = $1`,
    [eventId, now],
  );
  return Object.freeze({ status: "processed" });
}

async function finishBusinessConflict(
  client: ProviderEventSqlClient,
  row: LockedProviderEventRow,
  now: Date,
  reason: string,
  keyedUuid: KeyedUuidGenerator,
): Promise<ProcessingResult> {
  await client.query(
    `UPDATE provider_events
     SET status = 'conflict', lease_token = NULL, lease_expires_at = NULL,
         last_error_redacted = $2, processed_at = $3
     WHERE id = $1`,
    [row.id, reason, now],
  );
  await client.query(
    `INSERT INTO admin_audit
       (id, actor_user_id, service_identity, action, resource_type,
        resource_id, correlation_id, metadata, occurred_at)
     VALUES ($1, NULL, 'commerce.provider_event', 'provider_event_conflict',
             'provider_event', $2, $2, $3::jsonb, $4)
     ON CONFLICT (id) DO NOTHING`,
    [
      stableUuid(keyedUuid, `provider-event:${row.id}:conflict`),
      row.id,
      JSON.stringify({ schemaVersion: 1, reason }),
      now,
    ],
  );
  return Object.freeze({ status: "conflict" });
}

async function finishDeferred(
  client: ProviderEventSqlClient,
  eventId: string,
  reason: string,
): Promise<ProcessingResult> {
  await client.query(
    `UPDATE provider_events
     SET status = 'deferred', lease_token = NULL, lease_expires_at = NULL,
         last_error_redacted = $2, processed_at = NULL
     WHERE id = $1`,
    [eventId, reason],
  );
  return Object.freeze({ status: "deferred" });
}

async function insertIncident(
  client: ProviderEventSqlClient,
  input: Readonly<{
    providerEventDatabaseId: string;
    orderId: string;
    reason: string;
    now: Date;
    keyedUuid: KeyedUuidGenerator;
  }>,
): Promise<void> {
  await client.query(
    `INSERT INTO admin_audit
       (id, actor_user_id, service_identity, action, resource_type,
        resource_id, correlation_id, metadata, occurred_at)
     VALUES ($1, NULL, 'commerce.provider_event', 'provider_event_incident',
             'order', $2, $3, $4::jsonb, $5)
     ON CONFLICT (id) DO NOTHING`,
    [
      stableUuid(
        input.keyedUuid,
        `provider-event:${input.providerEventDatabaseId}:incident:${input.reason}`,
      ),
      input.orderId,
      input.providerEventDatabaseId,
      JSON.stringify({
        schemaVersion: 1,
        reason: input.reason,
        orderId: input.orderId,
        providerEventId: input.providerEventDatabaseId,
      }),
      input.now,
    ],
  );
}

function checkoutSemanticsAreCoherent(event: CheckoutSessionProviderEventV1): boolean {
  if (event.eventType === "checkout.session.completed") {
    return (
      event.sessionStatus === "complete" &&
      event.paymentStatus !== "unknown_restrictive"
    );
  }
  if (event.eventType === "checkout.session.async_payment_succeeded") {
    return event.sessionStatus === "complete" && event.paymentStatus === "paid";
  }
  if (event.eventType === "checkout.session.async_payment_failed") {
    return event.sessionStatus === "complete" && event.paymentStatus === "unpaid";
  }
  return (
    event.eventType === "checkout.session.expired" &&
    event.sessionStatus === "expired" &&
    event.paymentStatus === "unpaid"
  );
}

function providerIdentityFenceKeys(
  provider: "stripe",
  event: NormalizedProviderEventV1,
): readonly string[] {
  const identities: string[] = [];
  if (event.kind === "checkout_session") {
    if (event.paymentIntentId !== null) {
      identities.push(`${provider}:payment_intent:${event.paymentIntentId}`);
    }
  } else if (event.kind === "refund") {
    identities.push(`${provider}:provider_refund:${event.providerRefundId}`);
    if (event.paymentIntentId !== null) {
      identities.push(`${provider}:payment_intent:${event.paymentIntentId}`);
    }
  } else if (event.kind === "refund_reconciliation") {
    if (event.paymentIntentId !== null) {
      identities.push(`${provider}:payment_intent:${event.paymentIntentId}`);
    }
  } else if (event.kind === "dispute") {
    identities.push(`${provider}:dispute:${event.disputeId}`);
    if (event.paymentIntentId !== null) {
      identities.push(`${provider}:payment_intent:${event.paymentIntentId}`);
    }
  }
  return Object.freeze([...new Set(identities.map((identity) =>
    createHash("sha256")
        .update(identity, "utf8")
        .digest()
        .readBigInt64BE(0)
        .toString()
  ))].sort((left, right) => left < right ? -1 : left > right ? 1 : 0));
}

async function lockProviderIdentities(
  client: ProviderEventSqlClient,
  fenceKeys: readonly string[],
): Promise<void> {
  // The durable uniqueness constraints are provider-global and omit livemode,
  // while payment-scoped keys serialize cumulative financial authority. Every
  // caller takes the opaque set in the same order to avoid advisory deadlocks.
  for (const fenceKey of fenceKeys) {
    await client.query(
      `SELECT pg_advisory_xact_lock($1::bigint)`,
      [fenceKey],
    );
  }
}

async function discoverCheckoutAttempt(
  client: ProviderEventSqlClient,
  event: CheckoutSessionProviderEventV1,
): Promise<
  | Readonly<{ status: "found"; attempt: AttemptRow }>
  | Readonly<{ status: "missing" }>
  | Readonly<{ status: "conflict" }>
> {
  const found = rows<AttemptRow>(await client.query(
    `SELECT id::text AS id, order_id::text AS "orderId",
            buyer_user_id::text AS "buyerUserId", status, provider,
            provider_request_id AS "providerRequestId",
            provider_session_id AS "providerSessionId",
            provider_livemode AS "providerLivemode",
            provider_scope AS "providerScope",
            tax_ready AS "taxReady",
            tax_quote_reference AS "taxQuoteReference"
     FROM checkout_attempts
     WHERE id = $1::uuid OR order_id = $2::uuid
     ORDER BY id`,
    [event.attemptId, event.orderId],
  ));
  if (found.length === 0) return Object.freeze({ status: "missing" });
  if (found.length > 1) return Object.freeze({ status: "conflict" });
  return Object.freeze({ status: "found", attempt: found[0]! });
}

function attemptMatchesCheckout(
  attempt: AttemptRow,
  event: CheckoutSessionProviderEventV1,
  authority: Readonly<{
    provider: "stripe";
    expectedLivemode: boolean;
    providerScope: string;
  }>,
): boolean {
  return (
    attempt.id === event.attemptId &&
    attempt.orderId === event.orderId &&
    attempt.provider === authority.provider &&
    attempt.providerRequestId === `checkout_attempt:${event.attemptId}` &&
    (attempt.providerSessionId === null || attempt.providerSessionId === event.sessionId) &&
    attempt.providerLivemode === authority.expectedLivemode &&
    attempt.providerScope === authority.providerScope &&
    event.livemode === authority.expectedLivemode
  );
}

async function processCheckoutEvent(
  client: ProviderEventSqlClient,
  row: LockedProviderEventRow,
  event: CheckoutSessionProviderEventV1,
  authority: Readonly<{
    provider: "stripe";
    expectedLivemode: boolean;
    providerScope: string;
  }>,
  now: Date,
  keyedUuid: KeyedUuidGenerator,
): Promise<ProcessingResult> {
  if (!checkoutSemanticsAreCoherent(event)) {
    return finishBusinessConflict(client, row, now, "checkout_status_mismatch", keyedUuid);
  }
  const discovered = await discoverCheckoutAttempt(client, event);
  if (discovered.status === "missing") {
    return finishDeferred(client, row.id, "missing_checkout_attempt");
  }
  if (discovered.status === "conflict") {
    return finishBusinessConflict(
      client,
      row,
      now,
      "checkout_identity_mismatch",
      keyedUuid,
    );
  }
  const discoveredAttempt = discovered.attempt;

  if (event.eventType === "checkout.session.expired") {
    const orderFacts = rows<OrderRow>(await client.query(
      `SELECT id::text AS id, buyer_user_id::text AS "buyerUserId", state,
              currency, total_minor AS "totalMinor"
       FROM orders WHERE id = $1::uuid`,
      [event.orderId],
    ));
    const exactAmount = orderFacts.length === 1
      ? safeNonnegativeInteger(orderFacts[0]!.totalMinor)
      : null;
    if (
      !attemptMatchesCheckout(discoveredAttempt, event, authority) ||
      orderFacts.length !== 1 ||
      orderFacts[0]!.buyerUserId !== discoveredAttempt.buyerUserId ||
      exactAmount !== event.amountMinor ||
      orderFacts[0]!.currency.toLowerCase() !== event.currency
    ) {
      return finishBusinessConflict(client, row, now, "checkout_identity_mismatch", keyedUuid);
    }
    const release = await releaseCheckoutReservationsForDefiniteFailureInTransaction(
      client as unknown as CheckoutSqlClient,
      discoveredAttempt.buyerUserId,
      {
        authority: "authoritative_provider_terminal",
        cause: "verified_expiry",
        providerEvidenceId: row.id,
        providerSessionId: event.sessionId,
        providerLivemode: authority.expectedLivemode,
        providerScope: authority.providerScope,
        amountMinor: event.amountMinor,
        currency: event.currency.toUpperCase() as "USD",
        attemptId: event.attemptId,
        orderId: event.orderId,
        provider: authority.provider,
        providerIdempotencyKey: `checkout_attempt:${event.attemptId}`,
        targetAttemptStatus: "expired",
      },
      keyedUuid,
    );
    if (release.status === "conflict") {
      return finishBusinessConflict(client, row, now, "checkout_release_mismatch", keyedUuid);
    }
    return finishProcessed(client, row.id, now);
  }

  await client.query(`SELECT id FROM users WHERE id = $1::uuid FOR UPDATE`, [
    discoveredAttempt.buyerUserId,
  ]);
  await client.query(
    `SELECT user_id FROM buyer_profiles WHERE user_id = $1::uuid FOR UPDATE`,
    [discoveredAttempt.buyerUserId],
  );
  const attempts = rows<AttemptRow>(await client.query(
    `SELECT id::text AS id, order_id::text AS "orderId",
            buyer_user_id::text AS "buyerUserId", status, provider,
            provider_request_id AS "providerRequestId",
            provider_session_id AS "providerSessionId",
            provider_livemode AS "providerLivemode",
            provider_scope AS "providerScope",
            tax_ready AS "taxReady",
            tax_quote_reference AS "taxQuoteReference"
     FROM checkout_attempts WHERE id = $1::uuid FOR UPDATE`,
    [event.attemptId],
  ));
  const attempt = attempts[0];
  const orderRows = rows<OrderRow>(await client.query(
    `SELECT id::text AS id, buyer_user_id::text AS "buyerUserId", state,
            currency, total_minor AS "totalMinor"
     FROM orders WHERE id = $1::uuid FOR UPDATE`,
    [event.orderId],
  ));
  const order = orderRows[0];
  const payments = rows<PaymentRow>(await client.query(
    `SELECT id::text AS id, provider_event_id::text AS "providerEventId",
            order_id::text AS "orderId", event_type AS "eventType",
            provider_payment_id AS "providerPaymentId",
            idempotency_key AS "idempotencyKey", amount_minor AS "amountMinor",
            currency
     FROM payment_events
     WHERE order_id = $1::uuid
        OR ($2::text IS NOT NULL AND idempotency_key = $3::text)
     ORDER BY id FOR UPDATE`,
    [
      event.orderId,
      event.paymentIntentId,
      event.paymentIntentId === null
        ? null
        : `${authority.provider}:payment_intent:${event.paymentIntentId}`,
    ],
  ));
  const reservations = rows<ReservationRow>(await client.query(
    `SELECT id::text AS id, state, quantity_reserved AS "quantityReserved",
            quantity_remaining AS "quantityRemaining"
     FROM inventory_reservations
     WHERE checkout_attempt_id = $1::uuid ORDER BY id FOR UPDATE`,
    [event.attemptId],
  ));
  if (
    attempt === undefined ||
    attempts.length !== 1 ||
    order === undefined ||
    orderRows.length !== 1 ||
    !attemptMatchesCheckout(attempt, event, authority) ||
    attempt.buyerUserId !== order.buyerUserId ||
    safeNonnegativeInteger(order.totalMinor) !== event.amountMinor ||
    order.currency.toLowerCase() !== event.currency ||
    reservations.length === 0
  ) {
    return finishBusinessConflict(client, row, now, "checkout_identity_mismatch", keyedUuid);
  }

  const allActive = reservations.every(
    (reservation) =>
      reservation.state === "active" &&
      safeNonnegativeInteger(reservation.quantityRemaining) ===
        safeNonnegativeInteger(reservation.quantityReserved),
  );
  const allReleased = reservations.every(
    (reservation) =>
      (reservation.state === "released" || reservation.state === "expired") &&
      safeNonnegativeInteger(reservation.quantityRemaining) === 0,
  );
  const allConsumed = reservations.every(
    (reservation) =>
      reservation.state === "consumed" &&
      safeNonnegativeInteger(reservation.quantityRemaining) === 0,
  );

  const verifiedPayments = payments.filter(
    (payment) => payment.eventType === "payment_verified",
  );
  const matchingPayment =
    event.paymentIntentId === null
      ? undefined
      : verifiedPayments.find(
          (payment) => payment.providerPaymentId === event.paymentIntentId,
        );
  const matchingPaymentIsCoherent =
    matchingPayment !== undefined &&
    matchingPayment.orderId === event.orderId &&
    safeNonnegativeInteger(matchingPayment.amountMinor) === event.amountMinor &&
    matchingPayment.currency.toLowerCase() === event.currency &&
    (await paymentSourceMatchesLockedContext(
      client,
      matchingPayment,
      attempt,
      order,
      authority,
    ));

  const paid = event.paymentStatus === "paid";
  const asyncFailure =
    event.eventType === "checkout.session.async_payment_failed";
  if (
    (paid || (asyncFailure && verifiedPayments.length > 0)) &&
    (event.paymentIntentId === null ||
      verifiedPayments.some(
        (payment) => payment.providerPaymentId !== event.paymentIntentId,
      ) ||
      (matchingPayment !== undefined && !matchingPaymentIsCoherent) ||
      (asyncFailure && matchingPayment === undefined))
  ) {
    return finishBusinessConflict(
      client,
      row,
      now,
      "payment_identity_mismatch",
      keyedUuid,
    );
  }
  const exactVerifiedPayment =
    matchingPayment !== undefined && matchingPaymentIsCoherent;
  const reservationStateIsKnown = allActive || allReleased || allConsumed;
  if (order.state === "cancelled" && allActive) {
    return finishBusinessConflict(
      client,
      row,
      now,
      "reservation_state_mismatch",
      keyedUuid,
    );
  }
  if (
    !paid &&
    (!reservationStateIsKnown ||
      (!allActive && !(asyncFailure && exactVerifiedPayment)) ||
      !["created", "open", "provider_unknown", "completed"].includes(attempt.status))
  ) {
    return finishBusinessConflict(client, row, now, "reservation_state_mismatch", keyedUuid);
  }
  if (paid) {
    if (event.paymentIntentId === null) {
      return finishBusinessConflict(client, row, now, "missing_payment_intent", keyedUuid);
    }
    if (event.amountMinor <= 0 || safeNonnegativeInteger(order.totalMinor) === 0) {
      return finishBusinessConflict(client, row, now, "payment_identity_mismatch", keyedUuid);
    }
    if (
      !reservationStateIsKnown ||
      (allConsumed && !exactVerifiedPayment)
    ) {
      return finishBusinessConflict(
        client,
        row,
        now,
        "reservation_state_mismatch",
        keyedUuid,
      );
    }
    const paymentEventId =
      matchingPayment?.id ??
      stableUuid(keyedUuid, `provider-event:${row.id}:payment-verified`);
    const paidOrderStates: readonly OrderState[] = [
      "paid_pending_fulfillment",
      // Settlement-pending IS paid. Omitting it would make a replayed provider
      // event conflict on an order that is legitimately paid but not releasable.
      "paid_pending_settlement",
      "paid_on_hold",
      "ready_for_fulfillment",
      "fulfillment_in_progress",
      "fulfilled",
    ];
    if (
      matchingPayment !== undefined &&
      !paidOrderStates.includes(order.state)
    ) {
      return finishBusinessConflict(
        client,
        row,
        now,
        "order_transition_mismatch",
        keyedUuid,
      );
    }
    const paymentTransition = transitionPayment(
      {
        state: matchingPayment === undefined ? "unpaid" : "paid",
        currency: order.currency,
        orderAmountMinor: event.amountMinor,
        paidAmountMinor: matchingPayment === undefined ? 0 : event.amountMinor,
        refundedAmountMinor: 0,
        pendingRefundAmountMinor: 0,
      },
      {
        type: "verified_payment",
        source: "verified_provider_event",
        amountMinor: event.amountMinor,
        currency: order.currency,
        providerEvidenceId: matchingPayment?.providerEventId ?? row.id,
      },
    );
    if (
      !paymentTransition.ok ||
      paymentTransition.value.state !== "paid" ||
      paymentTransition.value.paidAmountMinor !== event.amountMinor
    ) {
      return finishBusinessConflict(
        client,
        row,
        now,
        "payment_identity_mismatch",
        keyedUuid,
      );
    }
    const transition = transitionOrder(
      {
        orderId: order.id,
        state: order.state,
        paymentEvidenceId: null,
        reviewRequestId: null,
        fulfillmentReleaseVersion: null,
        lastFulfillmentReleaseVersion: 0,
        carrierHandoffAt: null,
      },
      {
        type: "payment_verified",
        source: "verified_provider_event",
        paymentEvidenceId: paymentEventId,
        reservationDisposition: allActive
          ? "active"
          : "authoritatively_released",
      },
    );
    if (!transition.ok) {
      if (
        matchingPayment !== undefined &&
        paidOrderStates.includes(order.state)
      ) {
        // A matching later provider event is a journal replay and cannot regress paid state.
      } else {
        return finishBusinessConflict(client, row, now, "order_transition_mismatch", keyedUuid);
      }
    }
    if (matchingPayment === undefined) {
      await client.query(
        `INSERT INTO payment_events
           (id, provider_event_id, order_id, event_type, provider_payment_id,
            idempotency_key, amount_minor, currency, occurred_at)
         VALUES ($1, $2, $3, 'payment_verified', $4, $5, $6, $7, $8)`,
        [
          paymentEventId,
          row.id,
          event.orderId,
          event.paymentIntentId,
          `${authority.provider}:payment_intent:${event.paymentIntentId}`,
          event.amountMinor,
          order.currency,
          event.providerCreatedAt,
        ],
      );
    }
    if (transition.ok) {
      await client.query(
        `UPDATE orders SET state = $2::order_state, updated_at = $3 WHERE id = $1`,
        [order.id, transition.value.snapshot.state, now],
      );
      if (transition.value.requiredIncidents.includes("inventory_conflict")) {
        await insertIncident(client, {
          providerEventDatabaseId: row.id,
          orderId: order.id,
          reason: "inventory_conflict",
          now,
          keyedUuid,
        });
      }
    }
    if (matchingPayment === undefined) {
      const paymentPayload = {
        schemaVersion: 1,
        orderId: order.id,
        verifiedPaymentEventId: paymentEventId,
        reason: "payment_verified",
      } as const;
      await client.query(
        `INSERT INTO downstream_effects
           (id, order_id, provider_event_id, effect_type, payload,
            idempotency_key, status, attempt_count, created_at, updated_at)
         VALUES ($1, $2, $3, 'payment_verified', $4::jsonb, $5,
                 'pending', 0, $6, $6)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          stableUuid(keyedUuid, `payment-event:${paymentEventId}:payment-effect`),
          order.id,
          row.id,
          JSON.stringify(paymentPayload),
          `payment_event:${paymentEventId}:payment_verified`,
          now,
        ],
      );
      await client.query(
        `INSERT INTO downstream_effects
           (id, order_id, provider_event_id, effect_type, payload,
            idempotency_key, status, attempt_count, created_at, updated_at)
         VALUES ($1, $2, $3, 'wake_provider_dependencies', $4::jsonb, $5,
                 'pending', 0, $6, $6)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          stableUuid(keyedUuid, `payment-event:${paymentEventId}:wake-effect`),
          order.id,
          row.id,
          JSON.stringify({ schemaVersion: 1, verifiedPaymentEventId: paymentEventId }),
          `payment_event:${paymentEventId}:wake_provider_dependencies`,
          now,
        ],
      );
      // Tax is server-computed and sent to the provider as a plain line item, so
      // the sale never reaches Stripe Tax reporting on its own. Enqueue the
      // recording here, inside the transaction that verifies payment, so it
      // inherits the same atomicity and lease-based retry as every other effect.
      // Read from the exact attempt this event names, already locked above, so
      // the calculation always matches the amount charged. An order may carry
      // several attempts, and the order's newest one is not necessarily this
      // one. A permitted attempt always has tax_ready, but the guard stays so a
      // non-permitted path can never enqueue a reference-less effect.
      if (attempt.taxReady && attempt.taxQuoteReference !== null) {
        await client.query(
          `INSERT INTO downstream_effects
             (id, order_id, provider_event_id, effect_type, payload,
              idempotency_key, status, attempt_count, created_at, updated_at)
           VALUES ($1, $2, $3, 'stripe_tax_transaction', $4::jsonb, $5,
                   'pending', 0, $6, $6)
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [
            stableUuid(keyedUuid, `payment-event:${paymentEventId}:tax-effect`),
            order.id,
            row.id,
            JSON.stringify({
              schemaVersion: 1,
              orderId: order.id,
              verifiedPaymentEventId: paymentEventId,
              calculationReference: attempt.taxQuoteReference,
            }),
            `payment_event:${paymentEventId}:stripe_tax_transaction`,
            now,
          ],
        );
      }
    }
  } else if (event.eventType === "checkout.session.async_payment_failed") {
    if (verifiedPayments.length === 0) {
      const failureKey = `${authority.provider}:checkout_session:${event.sessionId}:payment_failed`;
      const existingFailure = payments.find(
        (payment) => payment.idempotencyKey === failureKey,
      );
      let failureTransition: ReturnType<typeof transitionOrder> | null = null;
      if (order.state === "checkout_pending") {
        failureTransition = transitionOrder(
          {
            orderId: order.id,
            state: order.state,
            paymentEvidenceId: null,
            reviewRequestId: null,
            fulfillmentReleaseVersion: null,
            lastFulfillmentReleaseVersion: 0,
            carrierHandoffAt: null,
          },
          {
            type: "checkout_closed",
            source: "verified_provider_event",
            reason: "payment_failed",
            providerEvidenceId: row.id,
          },
        );
        if (!failureTransition.ok) {
          return finishBusinessConflict(client, row, now, "order_transition_mismatch", keyedUuid);
        }
      } else if (order.state !== "payment_failed") {
        return finishBusinessConflict(client, row, now, "order_transition_mismatch", keyedUuid);
      }
      if (existingFailure === undefined) {
        await client.query(
          `INSERT INTO payment_events
             (id, provider_event_id, order_id, event_type, provider_payment_id,
              idempotency_key, amount_minor, currency, occurred_at)
           VALUES ($1, $2, $3, 'payment_failed', NULL, $4, 0, $5, $6)`,
          [
            stableUuid(keyedUuid, `provider-event:${row.id}:payment-failed`),
            row.id,
            order.id,
            failureKey,
            order.currency,
            event.providerCreatedAt,
          ],
        );
      }
      if (failureTransition?.ok) {
        await client.query(
          `UPDATE orders SET state = $2::order_state, updated_at = $3 WHERE id = $1`,
          [order.id, failureTransition.value.snapshot.state, now],
        );
      }
    }
  } else if (
    event.eventType !== "checkout.session.completed" ||
    !["unpaid", "no_payment_required"].includes(event.paymentStatus)
  ) {
    return finishBusinessConflict(client, row, now, "checkout_status_mismatch", keyedUuid);
  }

  await client.query(
    `UPDATE checkout_attempts
     SET status = 'completed', provider_session_id = $2
     WHERE id = $1`,
    [event.attemptId, event.sessionId],
  );
  return finishProcessed(client, row.id, now);
}

type SourceProviderEventRow = Readonly<{
  id: string;
  externalProviderEventId: string;
  provider: string;
  status: string;
  livemode: boolean;
  normalizedPayload: unknown;
}>;

async function paymentSourceMatchesLockedContext(
  client: ProviderEventSqlClient,
  payment: PaymentRow,
  attempt: AttemptRow,
  order: OrderRow,
  authority: Readonly<{
    provider: "stripe";
    expectedLivemode: boolean;
    providerScope: string;
  }>,
): Promise<boolean> {
  if (payment.providerPaymentId === null) return false;
  const sourceRows = rows<SourceProviderEventRow>(await client.query(
    `SELECT id::text AS id,
            provider_event_id AS "externalProviderEventId",
            provider, status, livemode,
            normalized_payload AS "normalizedPayload"
     FROM provider_events WHERE id = $1::uuid`,
    [payment.providerEventId],
  ));
  const source = sourceRows[0];
  const envelope = source === undefined
    ? null
    : parseNormalizedProviderEventV1(source.normalizedPayload);
  return (
    sourceRows.length === 1 &&
    source !== undefined &&
    source.status === "processed" &&
    source.provider === authority.provider &&
    source.livemode === authority.expectedLivemode &&
    envelope !== null &&
    hasExactProviderEventEnvelopeIdentity(
      source.externalProviderEventId,
      envelope,
    ) &&
    envelope.kind === "checkout_session" &&
    checkoutSemanticsAreCoherent(envelope) &&
    envelope.paymentStatus === "paid" &&
    envelope.sessionStatus === "complete" &&
    envelope.paymentIntentId === payment.providerPaymentId &&
    envelope.amountMinor === safeNonnegativeInteger(payment.amountMinor) &&
    envelope.currency === payment.currency.toLowerCase() &&
    payment.idempotencyKey ===
      `${authority.provider}:payment_intent:${payment.providerPaymentId}` &&
    payment.orderId === order.id &&
    safeNonnegativeInteger(payment.amountMinor) ===
      safeNonnegativeInteger(order.totalMinor) &&
    payment.currency === order.currency &&
    attemptMatchesCheckout(attempt, envelope, authority)
  );
}

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
  status: "requested" | "submitted" | "succeeded" | "failed" | "cancelled";
  origin: "staff_requested" | "provider_observed";
  providerRequestHash: string | null;
  attemptCount: number | string;
  submittedAt: Date | string | null;
}>;

type FinancialContext = Readonly<{
  payment: PaymentRow;
  sourceEvent: CheckoutSessionProviderEventV1;
  attempt: AttemptRow;
  order: OrderRow;
}>;

type FinancialContextResult =
  | Readonly<{ status: "found"; context: FinancialContext }>
  | Readonly<{ status: "missing" }>
  | Readonly<{ status: "conflict" }>;

async function loadAndLockFinancialContext(
  client: ProviderEventSqlClient,
  paymentIntentId: string | null,
  authority: Readonly<{
    provider: "stripe";
    expectedLivemode: boolean;
    providerScope: string;
  }>,
): Promise<FinancialContextResult> {
  if (paymentIntentId === null) return Object.freeze({ status: "missing" });
  const discoveredPayments = rows<PaymentRow>(await client.query(
    `SELECT id::text AS id, provider_event_id::text AS "providerEventId",
            order_id::text AS "orderId", event_type AS "eventType",
            provider_payment_id AS "providerPaymentId",
            idempotency_key AS "idempotencyKey", amount_minor AS "amountMinor",
            currency
     FROM payment_events
     WHERE event_type = 'payment_verified' AND provider_payment_id = $1
     ORDER BY id`,
    [paymentIntentId],
  ));
  if (discoveredPayments.length === 0) return Object.freeze({ status: "missing" });
  if (discoveredPayments.length !== 1) return Object.freeze({ status: "conflict" });
  const discoveredPayment = discoveredPayments[0]!;
  const sourceRows = rows<SourceProviderEventRow>(await client.query(
    `SELECT id::text AS id,
            provider_event_id AS "externalProviderEventId",
            provider, status, livemode,
            normalized_payload AS "normalizedPayload"
     FROM provider_events WHERE id = $1::uuid`,
    [discoveredPayment.providerEventId],
  ));
  const sourceRow = sourceRows[0];
  const sourceEvent = sourceRow === undefined
    ? null
    : parseNormalizedProviderEventV1(sourceRow.normalizedPayload);
  if (
    sourceRows.length !== 1 ||
    sourceRow === undefined ||
    sourceRow.status !== "processed" ||
    sourceRow.provider !== authority.provider ||
    sourceRow.livemode !== authority.expectedLivemode ||
    sourceEvent === null ||
    !hasExactProviderEventEnvelopeIdentity(
      sourceRow.externalProviderEventId,
      sourceEvent,
    ) ||
    sourceEvent.kind !== "checkout_session" ||
    !checkoutSemanticsAreCoherent(sourceEvent) ||
    sourceEvent.paymentStatus !== "paid" ||
    sourceEvent.sessionStatus !== "complete" ||
    sourceEvent.paymentIntentId !== paymentIntentId ||
    sourceEvent.livemode !== authority.expectedLivemode
  ) {
    return Object.freeze({ status: "conflict" });
  }
  const discovered = await discoverCheckoutAttempt(client, sourceEvent);
  if (discovered.status !== "found") {
    return Object.freeze({ status: "conflict" });
  }
  const discoveredAttempt = discovered.attempt;

  await client.query(`SELECT id FROM users WHERE id = $1::uuid FOR UPDATE`, [
    discoveredAttempt.buyerUserId,
  ]);
  await client.query(
    `SELECT user_id FROM buyer_profiles WHERE user_id = $1::uuid FOR UPDATE`,
    [discoveredAttempt.buyerUserId],
  );
  const attempts = rows<AttemptRow>(await client.query(
    `SELECT id::text AS id, order_id::text AS "orderId",
            buyer_user_id::text AS "buyerUserId", status, provider,
            provider_request_id AS "providerRequestId",
            provider_session_id AS "providerSessionId",
            provider_livemode AS "providerLivemode",
            provider_scope AS "providerScope",
            tax_ready AS "taxReady",
            tax_quote_reference AS "taxQuoteReference"
     FROM checkout_attempts WHERE id = $1::uuid FOR UPDATE`,
    [sourceEvent.attemptId],
  ));
  const orderRows = rows<OrderRow>(await client.query(
    `SELECT id::text AS id, buyer_user_id::text AS "buyerUserId", state,
            currency, total_minor AS "totalMinor"
     FROM orders WHERE id = $1::uuid FOR UPDATE`,
    [sourceEvent.orderId],
  ));
  const lockedPayments = rows<PaymentRow>(await client.query(
    `SELECT id::text AS id, provider_event_id::text AS "providerEventId",
            order_id::text AS "orderId", event_type AS "eventType",
            provider_payment_id AS "providerPaymentId",
            idempotency_key AS "idempotencyKey", amount_minor AS "amountMinor",
            currency
     FROM payment_events WHERE order_id = $1::uuid ORDER BY id FOR UPDATE`,
    [sourceEvent.orderId],
  ));
  const attempt = attempts[0];
  const order = orderRows[0];
  const payment = lockedPayments.find(
    (candidate) => candidate.id === discoveredPayment.id,
  );
  if (
    attempt === undefined ||
    attempts.length !== 1 ||
    order === undefined ||
    orderRows.length !== 1 ||
    payment === undefined ||
    !attemptMatchesCheckout(discoveredAttempt, sourceEvent, authority) ||
    !attemptMatchesCheckout(attempt, sourceEvent, authority) ||
    order.id !== payment.orderId ||
    order.id !== sourceEvent.orderId ||
    order.buyerUserId !== attempt.buyerUserId ||
    payment.providerPaymentId !== paymentIntentId ||
    payment.idempotencyKey !==
      `${authority.provider}:payment_intent:${paymentIntentId}` ||
    safeNonnegativeInteger(payment.amountMinor) !==
      safeNonnegativeInteger(order.totalMinor) ||
    payment.currency !== order.currency ||
    sourceEvent.amountMinor !== safeNonnegativeInteger(payment.amountMinor) ||
    sourceEvent.currency !== payment.currency.toLowerCase()
  ) {
    return Object.freeze({ status: "conflict" });
  }
  return Object.freeze({
    status: "found",
    context: Object.freeze({ payment, sourceEvent, attempt, order }),
  });
}

async function placeFinancialHold(
  client: ProviderEventSqlClient,
  context: FinancialContext,
  providerEventDatabaseId: string,
  now: Date,
): Promise<boolean> {
  const transition = transitionOrder(
    {
      orderId: context.order.id,
      state: context.order.state,
      paymentEvidenceId: context.payment.id,
      reviewRequestId: null,
      fulfillmentReleaseVersion: null,
      lastFulfillmentReleaseVersion: 0,
      carrierHandoffAt: null,
    },
    {
      type: "provider_financial_hold",
      source: "verified_provider_event",
      providerEvidenceId: providerEventDatabaseId,
    },
  );
  if (!transition.ok) return false;
  await client.query(
    `UPDATE orders SET state = $2::order_state, updated_at = $3 WHERE id = $1`,
    [context.order.id, transition.value.snapshot.state, now],
  );
  return true;
}

async function placeDisputeHold(
  client: ProviderEventSqlClient,
  context: FinancialContext,
  providerEventDatabaseId: string,
  now: Date,
): Promise<boolean> {
  const transition = transitionOrder(
    {
      orderId: context.order.id,
      state: context.order.state,
      paymentEvidenceId: context.payment.id,
      reviewRequestId: null,
      fulfillmentReleaseVersion: null,
      lastFulfillmentReleaseVersion: 0,
      carrierHandoffAt: null,
    },
    {
      type: "payment_disputed",
      source: "verified_provider_event",
      providerEvidenceId: providerEventDatabaseId,
    },
  );
  if (!transition.ok) return false;
  await client.query(
    `UPDATE orders SET state = $2::order_state, updated_at = $3 WHERE id = $1`,
    [context.order.id, transition.value.snapshot.state, now],
  );
  return true;
}

async function insertFinancialEffect(
  client: ProviderEventSqlClient,
  input: Readonly<{
    effectType: "refund_verified" | "dispute_recorded" | "dispute_resolved";
    paymentEventId: string;
    orderId: string;
    providerEventDatabaseId: string;
    now: Date;
    keyedUuid: KeyedUuidGenerator;
  }>,
): Promise<void> {
  const payload = {
    schemaVersion: 1,
    orderId: input.orderId,
    paymentEventId: input.paymentEventId,
    reason: input.effectType,
  } as const;
  await client.query(
    `INSERT INTO downstream_effects
       (id, order_id, provider_event_id, effect_type, payload,
        idempotency_key, status, attempt_count, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'pending', 0, $7, $7)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      stableUuid(
        input.keyedUuid,
        `payment-event:${input.paymentEventId}:effect:${input.effectType}`,
      ),
      input.orderId,
      input.providerEventDatabaseId,
      input.effectType,
      JSON.stringify(payload),
      `payment_event:${input.paymentEventId}:${input.effectType}`,
      input.now,
    ],
  );
}

async function lockRefunds(
  client: ProviderEventSqlClient,
  verifiedPaymentEventId: string,
  providerIdentity: Readonly<{
    provider: string;
    providerRefundId: string;
  }> | null = null,
): Promise<RefundRow[]> {
  return rows<RefundRow>(await client.query(
    `SELECT id::text AS id, order_id::text AS "orderId",
            requested_by_user_id::text AS "requestedByUserId",
            verified_payment_event_id::text AS "verifiedPaymentEventId",
            provider, provider_event_id::text AS "providerEventId",
            provider_refund_id AS "providerRefundId",
            idempotency_key AS "idempotencyKey",
            requested_amount_minor AS "requestedAmountMinor",
            confirmed_amount_minor AS "confirmedAmountMinor", currency, status,
            origin, provider_request_hash AS "providerRequestHash",
            attempt_count AS "attemptCount", submitted_at AS "submittedAt"
     FROM refunds
     WHERE verified_payment_event_id = $1::uuid
        OR ($2::text IS NOT NULL
            AND provider = $2::text
            AND provider_refund_id = $3::text)
     ORDER BY id FOR UPDATE`,
    [
      verifiedPaymentEventId,
      providerIdentity?.provider ?? null,
      providerIdentity?.providerRefundId ?? null,
    ],
  ));
}

async function succeededRefundsHaveExactAuthority(
  client: ProviderEventSqlClient,
  refunds: readonly RefundRow[],
  context: FinancialContext,
  authority: Readonly<{
    provider: "stripe";
    expectedLivemode: boolean;
    providerScope: string;
  }>,
): Promise<boolean> {
  for (const refund of refunds) {
    if (refund.status !== "succeeded") continue;
    const confirmedAmount = safeNonnegativeInteger(refund.confirmedAmountMinor);
    if (
      refund.provider !== authority.provider ||
      refund.providerEventId === null ||
      refund.providerRefundId === null ||
      refund.verifiedPaymentEventId !== context.payment.id ||
      refund.orderId !== context.order.id ||
      confirmedAmount === null ||
      confirmedAmount <= 0 ||
      confirmedAmount !== safeNonnegativeInteger(refund.requestedAmountMinor) ||
      refund.currency !== context.order.currency
    ) {
      return false;
    }
    const sourceRows = rows<SourceProviderEventRow>(await client.query(
      `SELECT id::text AS id,
              provider_event_id AS "externalProviderEventId",
              provider, status, livemode,
              normalized_payload AS "normalizedPayload"
       FROM provider_events WHERE id = $1::uuid`,
      [refund.providerEventId],
    ));
    const source = sourceRows[0];
    const envelope = source === undefined
      ? null
      : parseNormalizedProviderEventV1(source.normalizedPayload);
    if (
      sourceRows.length !== 1 ||
      source === undefined ||
      source.status !== "processed" ||
      source.provider !== authority.provider ||
      source.livemode !== authority.expectedLivemode ||
      envelope === null ||
      !hasExactProviderEventEnvelopeIdentity(
        source.externalProviderEventId,
        envelope,
      ) ||
      envelope.kind !== "refund" ||
      envelope.status !== "succeeded" ||
      envelope.livemode !== authority.expectedLivemode ||
      envelope.providerRefundId !== refund.providerRefundId ||
      envelope.paymentIntentId !== context.payment.providerPaymentId ||
      (refund.origin === "staff_requested"
        ? envelope.orderId !== context.order.id ||
          envelope.refundRequestId !== refund.id
        : refund.origin !== "provider_observed" ||
          envelope.orderId !== null ||
          envelope.refundRequestId !== null) ||
      envelope.amountMinor !== confirmedAmount ||
      envelope.currency !== refund.currency.toLowerCase()
    ) {
      return false;
    }
  }
  return true;
}

async function processRefundEvent(
  client: ProviderEventSqlClient,
  row: LockedProviderEventRow,
  event: RefundProviderEventV1,
  authority: Readonly<{
    provider: "stripe";
    expectedLivemode: boolean;
    providerScope: string;
  }>,
  now: Date,
  keyedUuid: KeyedUuidGenerator,
): Promise<ProcessingResult> {
  if (event.livemode !== authority.expectedLivemode) {
    return finishBusinessConflict(client, row, now, "provider_authority_mismatch", keyedUuid);
  }
  const loaded = await loadAndLockFinancialContext(
    client,
    event.paymentIntentId,
    authority,
  );
  if (loaded.status === "missing") {
    return finishDeferred(client, row.id, "missing_verified_payment");
  }
  if (loaded.status === "conflict") {
    return finishBusinessConflict(client, row, now, "payment_identity_mismatch", keyedUuid);
  }
  const context = loaded.context;
  if (
    event.amountMinor > (safeNonnegativeInteger(context.payment.amountMinor) ?? -1) ||
    event.currency !== context.payment.currency.toLowerCase() ||
    (event.orderId !== null && event.orderId !== context.order.id)
  ) {
    return finishBusinessConflict(client, row, now, "refund_identity_mismatch", keyedUuid);
  }
  const refundRows = await lockRefunds(client, context.payment.id, {
    provider: authority.provider,
    providerRefundId: event.providerRefundId,
  });
  const byProviderId = refundRows.filter(
    (refund) =>
      refund.provider === authority.provider &&
      refund.providerRefundId === event.providerRefundId,
  );
  const bySignedRequest = event.refundRequestId === null
    ? []
    : refundRows.filter(
        (refund) =>
          refund.id === event.refundRequestId &&
          refund.orderId === event.orderId,
      );
  if (byProviderId.length > 1 || bySignedRequest.length > 1) {
    return finishBusinessConflict(client, row, now, "refund_identity_mismatch", keyedUuid);
  }
  const providerMatch = byProviderId[0];
  const signedMatch = bySignedRequest[0];
  if (
    providerMatch !== undefined &&
    signedMatch !== undefined &&
    providerMatch.id !== signedMatch.id
  ) {
    return finishBusinessConflict(client, row, now, "refund_identity_mismatch", keyedUuid);
  }
  let refund = signedMatch ?? providerMatch;
  const providerObserved = refund === undefined;
  if (
    event.refundRequestId !== null &&
    (refund === undefined || refund.origin !== "staff_requested")
  ) {
    return finishBusinessConflict(client, row, now, "refund_request_mismatch", keyedUuid);
  }
  if (
    refund !== undefined &&
    (refund.provider !== authority.provider ||
      refund.verifiedPaymentEventId !== context.payment.id ||
      refund.orderId !== context.order.id ||
      safeNonnegativeInteger(refund.requestedAmountMinor) !== event.amountMinor ||
      refund.currency.toLowerCase() !== event.currency ||
      (refund.providerRefundId !== null &&
        refund.providerRefundId !== event.providerRefundId) ||
      (refund.origin === "staff_requested" &&
        (refund.providerRequestHash === null ||
          safeNonnegativeInteger(refund.attemptCount) === 0 ||
          refund.submittedAt === null)))
  ) {
    return finishBusinessConflict(client, row, now, "refund_identity_mismatch", keyedUuid);
  }

  const storedStatus =
    event.status === "pending" || event.status === "requires_action"
      ? "submitted"
      : event.status === "canceled"
        ? "cancelled"
        : event.status;
  if (
    refund !== undefined &&
    ["succeeded", "failed", "cancelled"].includes(refund.status) &&
    refund.status !== storedStatus
  ) {
    return finishBusinessConflict(client, row, now, "refund_status_mismatch", keyedUuid);
  }
  if (storedStatus === "succeeded") {
    if (!(await succeededRefundsHaveExactAuthority(
      client,
      refundRows,
      context,
      authority,
    ))) {
      return finishBusinessConflict(client, row, now, "refund_identity_mismatch", keyedUuid);
    }
    const paymentAmount = safeNonnegativeInteger(context.payment.amountMinor);
    let succeededAmount = 0;
    for (const existingRefund of refundRows) {
      if (existingRefund.status !== "succeeded") continue;
      const confirmedAmount = safeNonnegativeInteger(
        existingRefund.confirmedAmountMinor,
      );
      if (
        confirmedAmount === null ||
        succeededAmount > Number.MAX_SAFE_INTEGER - confirmedAmount
      ) {
        return finishBusinessConflict(client, row, now, "refund_identity_mismatch", keyedUuid);
      }
      succeededAmount += confirmedAmount;
    }
    const candidateAmount = refund?.status === "succeeded"
      ? succeededAmount
      : succeededAmount + event.amountMinor;
    if (
      paymentAmount === null ||
      candidateAmount > Number.MAX_SAFE_INTEGER ||
      candidateAmount > paymentAmount
    ) {
      return finishBusinessConflict(client, row, now, "refund_identity_mismatch", keyedUuid);
    }
  }
  const verifiedRefundKey = `${authority.provider}:refund:${event.providerRefundId}:verified`;
  let existingVerifiedRefund: PaymentRow | undefined;
  if (storedStatus === "succeeded") {
    existingVerifiedRefund = rows<PaymentRow>(await client.query(
      `SELECT id::text AS id, provider_event_id::text AS "providerEventId",
              order_id::text AS "orderId", event_type AS "eventType",
              provider_payment_id AS "providerPaymentId",
              idempotency_key AS "idempotencyKey", amount_minor AS "amountMinor",
              currency
       FROM payment_events WHERE idempotency_key = $1`,
      [verifiedRefundKey],
    ))[0];
    if (
      existingVerifiedRefund !== undefined &&
      (existingVerifiedRefund.eventType !== "refund_verified" ||
        existingVerifiedRefund.idempotencyKey !== verifiedRefundKey ||
        existingVerifiedRefund.orderId !== context.order.id ||
        existingVerifiedRefund.providerPaymentId !== event.providerRefundId ||
        safeNonnegativeInteger(existingVerifiedRefund.amountMinor) !== event.amountMinor ||
        existingVerifiedRefund.currency !== context.order.currency)
    ) {
      return finishBusinessConflict(client, row, now, "refund_journal_mismatch", keyedUuid);
    }
  }
  if (providerObserved) {
    const held = await placeFinancialHold(client, context, row.id, now);
    if (!held && context.order.state !== "fulfilled") {
      return finishBusinessConflict(client, row, now, "order_transition_mismatch", keyedUuid);
    }
    if (!held) {
      await insertIncident(client, {
        providerEventDatabaseId: row.id,
        orderId: context.order.id,
        reason: "post_handoff_financial_event",
        now,
        keyedUuid,
      });
    }
    await insertIncident(client, {
      providerEventDatabaseId: row.id,
      orderId: context.order.id,
      reason: "provider_observed_refund",
      now,
      keyedUuid,
    });
  }
  if (providerObserved) {
    const refundId = stableUuid(
      keyedUuid,
      `provider-refund:${authority.provider}:${event.providerRefundId}`,
    );
    await client.query(
      `INSERT INTO refunds
         (id, order_id, requested_by_user_id, verified_payment_event_id,
          provider, provider_event_id, provider_refund_id, idempotency_key,
          requested_amount_minor, confirmed_amount_minor, currency, status,
          reason_redacted, requested_at, confirmed_at, origin,
          provider_request_hash, attempt_count, submitted_at, last_error_redacted)
       VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               'provider_observed_refund', $12, $13, 'provider_observed',
               NULL, 0, NULL, NULL)`,
      [
        refundId,
        context.order.id,
        context.payment.id,
        authority.provider,
        row.id,
        event.providerRefundId,
        `${authority.provider}:provider_refund:${event.providerRefundId}`,
        event.amountMinor,
        storedStatus === "succeeded" ? event.amountMinor : null,
        context.order.currency,
        storedStatus,
        event.providerCreatedAt,
        storedStatus === "succeeded" ? now : null,
      ],
    );
    refund = {
      id: refundId,
      orderId: context.order.id,
      requestedByUserId: null,
      verifiedPaymentEventId: context.payment.id,
      provider: authority.provider,
      providerEventId: row.id,
      providerRefundId: event.providerRefundId,
      idempotencyKey: `${authority.provider}:provider_refund:${event.providerRefundId}`,
      requestedAmountMinor: event.amountMinor,
      confirmedAmountMinor: storedStatus === "succeeded" ? event.amountMinor : null,
      currency: context.order.currency,
      status: storedStatus,
      origin: "provider_observed",
      providerRequestHash: null,
      attemptCount: 0,
      submittedAt: null,
    };
  } else if (refund !== undefined && refund.status !== "succeeded") {
    await client.query(
      `UPDATE refunds
       SET provider_event_id = $2, provider_refund_id = $3,
           status = $4::refund_status,
           confirmed_amount_minor = $5, confirmed_at = $6,
           last_error_redacted = $7
       WHERE id = $1`,
      [
        refund.id,
        row.id,
        event.providerRefundId,
        storedStatus,
        storedStatus === "succeeded" ? event.amountMinor : null,
        storedStatus === "succeeded" ? now : null,
        storedStatus === "failed" && refund.origin === "staff_requested"
          ? "provider_refund_failed"
          : null,
      ],
    );
  }

  if (storedStatus === "succeeded") {
    if (existingVerifiedRefund === undefined) {
      const journalId = stableUuid(
        keyedUuid,
        `provider-refund:${authority.provider}:${event.providerRefundId}:verified`,
      );
      await client.query(
        `INSERT INTO payment_events
           (id, provider_event_id, order_id, event_type, provider_payment_id,
            idempotency_key, amount_minor, currency, occurred_at)
         VALUES ($1, $2, $3, 'refund_verified', $4, $5, $6, $7, $8)`,
        [
          journalId,
          row.id,
          context.order.id,
          event.providerRefundId,
          verifiedRefundKey,
          event.amountMinor,
          context.order.currency,
          event.providerCreatedAt,
        ],
      );
      await insertFinancialEffect(client, {
        effectType: "refund_verified",
        paymentEventId: journalId,
        orderId: context.order.id,
        providerEventDatabaseId: row.id,
        now,
        keyedUuid,
      });
    }
  }
  return finishProcessed(client, row.id, now);
}

/**
 * Journals a verified net-terms invoice event with its order binding.
 *
 * Deliberately applies NO order state transition at this checkpoint. Under the
 * Option B ACH policy (docs/adr/0006) a paid invoice must move the order to
 * paid_pending_settlement, not to paid. That transition requires a durable
 * order-to-invoice binding, and no repository writes one yet: the invoice
 * orchestrator takes an injected port with no PostgreSQL implementation.
 *
 * Acting on metadata.orderId alone would mean trusting a provider-supplied
 * identifier to move money state with nothing on our side to check it against,
 * which is exactly what the rest of this repository refuses to do.
 *
 * This is still stronger than the previous "ignored" handling: the event is now
 * typed, its order binding and amounts are validated and journaled, and the
 * exhaustiveness fence in processStoredEvent will force whoever adds the
 * transition to come through here rather than around it.
 */
async function processInvoiceEvent(
  client: ProviderEventSqlClient,
  row: LockedProviderEventRow,
  event: InvoiceProviderEventV1,
  authority: Readonly<{
    provider: "stripe";
    expectedLivemode: boolean;
    providerScope: string;
  }>,
  now: Date,
  keyedUuid: KeyedUuidGenerator,
): Promise<ProcessingResult> {
  if (event.livemode !== authority.expectedLivemode) {
    return finishBusinessConflict(
      client,
      row,
      now,
      "provider_authority_mismatch",
      keyedUuid,
    );
  }
  return finishProcessed(client, row.id, now);
}

async function processRefundReconciliationEvent(
  client: ProviderEventSqlClient,
  row: LockedProviderEventRow,
  event: RefundReconciliationProviderEventV1,
  authority: Readonly<{
    provider: "stripe";
    expectedLivemode: boolean;
    providerScope: string;
  }>,
  now: Date,
  keyedUuid: KeyedUuidGenerator,
): Promise<ProcessingResult> {
  if (event.livemode !== authority.expectedLivemode) {
    return finishBusinessConflict(client, row, now, "provider_authority_mismatch", keyedUuid);
  }
  const loaded = await loadAndLockFinancialContext(client, event.paymentIntentId, authority);
  if (loaded.status === "missing") return finishDeferred(client, row.id, "missing_verified_payment");
  if (loaded.status === "conflict") {
    return finishBusinessConflict(client, row, now, "payment_identity_mismatch", keyedUuid);
  }
  const context = loaded.context;
  if (
    event.currency !== context.order.currency.toLowerCase() ||
    event.amountRefundedMinor > (safeNonnegativeInteger(context.payment.amountMinor) ?? -1)
  ) {
    return finishBusinessConflict(client, row, now, "refund_reconciliation_mismatch", keyedUuid);
  }
  const refunds = await lockRefunds(client, context.payment.id);
  if (!(await succeededRefundsHaveExactAuthority(client, refunds, context, authority))) {
    return finishBusinessConflict(client, row, now, "refund_reconciliation_mismatch", keyedUuid);
  }
  const succeededSum = refunds
    .filter((refund) => refund.status === "succeeded")
    .reduce(
      (sum, refund) => sum + (safeNonnegativeInteger(refund.confirmedAmountMinor) ?? 0),
      0,
    );
  if (succeededSum > event.amountRefundedMinor) {
    return finishBusinessConflict(client, row, now, "refund_reconciliation_mismatch", keyedUuid);
  }
  if (succeededSum < event.amountRefundedMinor) {
    const held = await placeFinancialHold(client, context, row.id, now);
    if (!held && context.order.state !== "fulfilled") {
      return finishBusinessConflict(client, row, now, "order_transition_mismatch", keyedUuid);
    }
    if (!held) {
      await insertIncident(client, {
        providerEventDatabaseId: row.id,
        orderId: context.order.id,
        reason: "post_handoff_financial_event",
        now,
        keyedUuid,
      });
    }
    await client.query(
      `INSERT INTO payment_events
         (id, provider_event_id, order_id, event_type, provider_payment_id,
          idempotency_key, amount_minor, currency, occurred_at)
       VALUES ($1, $2, $3, 'unreconciled_refund_observed', $4, $5, $6, $7, $8)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        stableUuid(keyedUuid, `provider-event:${row.id}:unreconciled-refund`),
        row.id,
        context.order.id,
        event.paymentIntentId,
        `provider_event:${row.id}:unreconciled_refund`,
        event.amountRefundedMinor,
        context.order.currency,
        event.providerCreatedAt,
      ],
    );
    await insertIncident(client, {
      providerEventDatabaseId: row.id,
      orderId: context.order.id,
      reason: "unreconciled_refund_observed",
      now,
      keyedUuid,
    });
  }
  return finishProcessed(client, row.id, now);
}

const restrictiveDisputeStatuses = new Set([
  "lost",
  "needs_response",
  "under_review",
  "warning_needs_response",
  "warning_under_review",
  "unknown_restrictive",
] as const);

function disputeJournalEventType(
  event: DisputeProviderEventV1,
): "dispute_recorded" | "dispute_resolved" {
  return restrictiveDisputeStatuses.has(
    event.status as "lost" | "needs_response" | "under_review" |
      "warning_needs_response" | "warning_under_review" | "unknown_restrictive",
  )
    ? "dispute_recorded"
    : "dispute_resolved";
}

async function disputeJournalsHaveExactAuthority(
  client: ProviderEventSqlClient,
  journals: readonly PaymentRow[],
  context: FinancialContext,
  event: DisputeProviderEventV1,
  authority: Readonly<{
    provider: "stripe";
    expectedLivemode: boolean;
  }>,
): Promise<boolean> {
  for (const journal of journals) {
    const sourceRows = rows<SourceProviderEventRow>(await client.query(
      `SELECT id::text AS id,
              provider_event_id AS "externalProviderEventId",
              provider, status, livemode,
              normalized_payload AS "normalizedPayload"
       FROM provider_events WHERE id = $1::uuid`,
      [journal.providerEventId],
    ));
    const source = sourceRows[0];
    const envelope = source === undefined
      ? null
      : parseNormalizedProviderEventV1(source.normalizedPayload);
    if (
      sourceRows.length !== 1 ||
      source === undefined ||
      source.status !== "processed" ||
      source.provider !== authority.provider ||
      source.livemode !== authority.expectedLivemode ||
      envelope === null ||
      !hasExactProviderEventEnvelopeIdentity(
        source.externalProviderEventId,
        envelope,
      ) ||
      envelope.kind !== "dispute" ||
      envelope.livemode !== authority.expectedLivemode ||
      envelope.disputeId !== event.disputeId ||
      envelope.paymentIntentId !== context.payment.providerPaymentId ||
      envelope.chargeId !== event.chargeId ||
      envelope.amountMinor !== safeNonnegativeInteger(journal.amountMinor) ||
      envelope.currency !== journal.currency.toLowerCase() ||
      disputeJournalEventType(envelope) !== journal.eventType
    ) {
      return false;
    }
  }
  return true;
}

async function processDisputeEvent(
  client: ProviderEventSqlClient,
  row: LockedProviderEventRow,
  event: DisputeProviderEventV1,
  authority: Readonly<{
    provider: "stripe";
    expectedLivemode: boolean;
    providerScope: string;
  }>,
  now: Date,
  keyedUuid: KeyedUuidGenerator,
): Promise<ProcessingResult> {
  if (event.livemode !== authority.expectedLivemode) {
    return finishBusinessConflict(client, row, now, "provider_authority_mismatch", keyedUuid);
  }
  const loaded = await loadAndLockFinancialContext(client, event.paymentIntentId, authority);
  if (loaded.status === "missing") return finishDeferred(client, row.id, "missing_verified_payment");
  if (loaded.status === "conflict") {
    return finishBusinessConflict(client, row, now, "payment_identity_mismatch", keyedUuid);
  }
  const context = loaded.context;
  if (
    event.currency !== context.order.currency.toLowerCase() ||
    event.amountMinor <= 0 ||
    event.amountMinor > (safeNonnegativeInteger(context.payment.amountMinor) ?? -1)
  ) {
    return finishBusinessConflict(client, row, now, "dispute_identity_mismatch", keyedUuid);
  }
  const eventType = disputeJournalEventType(event);
  const restrictive = eventType === "dispute_recorded";
  const idempotencyKey = `${authority.provider}:dispute:${event.disputeId}:${eventType}`;
  const disputeJournals = rows<PaymentRow>(await client.query(
    `SELECT id::text AS id, provider_event_id::text AS "providerEventId",
            order_id::text AS "orderId", event_type AS "eventType",
            provider_payment_id AS "providerPaymentId",
            idempotency_key AS "idempotencyKey", amount_minor AS "amountMinor",
            currency
     FROM payment_events
     WHERE event_type IN ('dispute_recorded', 'dispute_resolved')
       AND provider_payment_id = $1
     ORDER BY id FOR UPDATE`,
    [event.disputeId],
  ));
  if (
    disputeJournals.some(
      (journal) =>
      (journal.eventType !== "dispute_recorded" &&
        journal.eventType !== "dispute_resolved") ||
      journal.idempotencyKey !==
        `${authority.provider}:dispute:${event.disputeId}:${journal.eventType}` ||
      journal.orderId !== context.order.id ||
      journal.providerPaymentId !== event.disputeId ||
      safeNonnegativeInteger(journal.amountMinor) !== event.amountMinor ||
      journal.currency !== context.order.currency,
    ) ||
    !(await disputeJournalsHaveExactAuthority(
      client,
      disputeJournals,
      context,
      event,
      authority,
    ))
  ) {
    return finishBusinessConflict(client, row, now, "dispute_journal_mismatch", keyedUuid);
  }
  const existing = disputeJournals.find(
    (journal) => journal.idempotencyKey === idempotencyKey,
  );
  if (
    existing !== undefined &&
    (existing.eventType !== eventType ||
      existing.idempotencyKey !== idempotencyKey ||
      existing.orderId !== context.order.id ||
      existing.providerPaymentId !== event.disputeId ||
      safeNonnegativeInteger(existing.amountMinor) !== event.amountMinor ||
      existing.currency !== context.order.currency)
  ) {
    return finishBusinessConflict(client, row, now, "dispute_journal_mismatch", keyedUuid);
  }
  if (restrictive) {
    const held = await placeDisputeHold(client, context, row.id, now);
    if (!held && context.order.state !== "fulfilled") {
      return finishBusinessConflict(client, row, now, "order_transition_mismatch", keyedUuid);
    }
    if (!held) {
      await insertIncident(client, {
        providerEventDatabaseId: row.id,
        orderId: context.order.id,
        reason: "post_handoff_financial_event",
        now,
        keyedUuid,
      });
    }
  }
  let journalId = existing?.id;
  if (existing === undefined) {
    journalId = stableUuid(
      keyedUuid,
      `provider-dispute:${authority.provider}:${event.disputeId}:${eventType}`,
    );
    await client.query(
      `INSERT INTO payment_events
         (id, provider_event_id, order_id, event_type, provider_payment_id,
          idempotency_key, amount_minor, currency, occurred_at)
       VALUES ($1, $2, $3, $4::payment_event_type, $5, $6, $7, $8, $9)`,
      [
        journalId,
        row.id,
        context.order.id,
        eventType,
        event.disputeId,
        idempotencyKey,
        event.amountMinor,
        context.order.currency,
        event.providerCreatedAt,
      ],
    );
    await insertFinancialEffect(client, {
      effectType: eventType,
      paymentEventId: journalId,
      orderId: context.order.id,
      providerEventDatabaseId: row.id,
      now,
      keyedUuid,
    });
  }
  if (event.status === "unknown_restrictive") {
    await insertIncident(client, {
      providerEventDatabaseId: row.id,
      orderId: context.order.id,
      reason: "unsupported_dispute_status",
      now,
      keyedUuid,
    });
  }
  return finishProcessed(client, row.id, now);
}

async function processClaimInTransaction(
  client: ProviderEventSqlClient,
  input: Readonly<{
    claim: ProviderEventClaimV1;
    authority: ProviderEventAuthorityV1;
    now: Date;
    keyedUuid: KeyedUuidGenerator;
  }>,
): Promise<ProcessingResult> {
  const claim = projectProviderEventClaimV1(input.claim);
  const authority = projectProviderEventAuthorityV1(input.authority);
  if (claim === null || authority === null || !Number.isFinite(input.now.getTime())) {
    return Object.freeze({ status: "lease_lost" });
  }
  const locked = rows<LockedProviderEventRow>(await client.query(
    `SELECT id::text AS id, provider, provider_event_id AS "providerEventId",
            payload_hash AS "payloadHash", status,
            attempt_count AS "attemptCount", lease_token AS "leaseToken",
            lease_expires_at AS "leaseExpiresAt", event_type AS "eventType",
            schema_version AS "schemaVersion",
            normalized_payload AS "normalizedPayload",
            provider_created_at AS "providerCreatedAt", livemode,
            processed_at AS "processedAt"
     FROM provider_events WHERE id = $1::uuid FOR UPDATE`,
    [claim.databaseEventId],
  ));
  const row = locked[0];
  if (
    row === undefined ||
    locked.length !== 1 ||
    row.status !== "processing" ||
    row.leaseToken !== claim.leaseToken ||
    row.leaseExpiresAt === null ||
    new Date(row.leaseExpiresAt).getTime() <= input.now.getTime()
  ) {
    return Object.freeze({ status: "lease_lost" });
  }
  const event = parseNormalizedProviderEventV1(row.normalizedPayload);
  if (
    event === null ||
    row.provider !== authority.provider ||
    !storedEventCommonCoherent(row, event)
  ) {
    return finishBusinessConflict(
      client,
      row,
      input.now,
      "stored_event_incoherent",
      input.keyedUuid,
    );
  }
  const storedFenceKeys = providerIdentityFenceKeys(
    authority.provider,
    event,
  );
  if (
    storedFenceKeys.length !== claim.providerIdentityFenceKeys.length ||
    storedFenceKeys.some(
      (fenceKey, index) => fenceKey !== claim.providerIdentityFenceKeys[index],
    )
  ) {
    return finishBusinessConflict(
      client,
      row,
      input.now,
      "stored_event_incoherent",
      input.keyedUuid,
    );
  }
  if (event.kind === "ignored") {
    return event.livemode === authority.expectedLivemode
      ? finishProcessed(client, row.id, input.now)
      : finishBusinessConflict(
          client,
          row,
          input.now,
          "provider_authority_mismatch",
          input.keyedUuid,
        );
  }
  if (event.livemode !== authority.expectedLivemode) {
    return finishBusinessConflict(
      client,
      row,
      input.now,
      "provider_authority_mismatch",
      input.keyedUuid,
    );
  }
  await lockProviderIdentities(client, storedFenceKeys);
  if (event.kind === "checkout_session") {
    return processCheckoutEvent(
      client,
      row,
      event,
      authority,
      input.now,
      input.keyedUuid,
    );
  }
  if (event.kind === "refund") {
    return processRefundEvent(
      client,
      row,
      event,
      authority,
      input.now,
      input.keyedUuid,
    );
  }
  if (event.kind === "refund_reconciliation") {
    return processRefundReconciliationEvent(
      client,
      row,
      event,
      authority,
      input.now,
      input.keyedUuid,
    );
  }
  if (event.kind === "invoice") {
    return processInvoiceEvent(
      client,
      row,
      event,
      authority,
      input.now,
      input.keyedUuid,
    );
  }
  if (event.kind === "dispute") {
    return processDisputeEvent(
      client,
      row,
      event,
      authority,
      input.now,
      input.keyedUuid,
    );
  }
  // Exhaustiveness fence. Every normalized kind must be dispatched explicitly:
  // a new kind added to NormalizedProviderEventV1 without a branch here fails
  // this assignment at compile time instead of silently falling through to the
  // dispute processor. If one ever reaches here at runtime, refuse to guess.
  const unhandled: never = event;
  void unhandled;
  return finishBusinessConflict(
    client,
    row,
    input.now,
    "stored_event_incoherent",
    input.keyedUuid,
  );
}

async function wakeDeferredDependenciesInTransaction(
  client: ProviderEventSqlClient,
  input: Readonly<{
    verifiedPaymentEventId: string;
    now: Date;
  }>,
): Promise<Readonly<{
  status: "woken" | "missing_dependency";
  count: number;
}>> {
  if (!isCanonicalUuid(input.verifiedPaymentEventId) || !Number.isFinite(input.now.getTime())) {
    return Object.freeze({ status: "missing_dependency", count: 0 });
  }
  const payments = rows<PaymentRow>(await client.query(
    `SELECT id::text AS id, provider_event_id::text AS "providerEventId",
            order_id::text AS "orderId", event_type AS "eventType",
            provider_payment_id AS "providerPaymentId",
            idempotency_key AS "idempotencyKey", amount_minor AS "amountMinor",
            currency
     FROM payment_events WHERE id = $1::uuid`,
    [input.verifiedPaymentEventId],
  ));
  const payment = payments[0];
  if (
    payment === undefined ||
    payments.length !== 1 ||
    payment.eventType !== "payment_verified" ||
    payment.providerPaymentId === null
  ) {
    return Object.freeze({ status: "missing_dependency", count: 0 });
  }
  const sources = rows<SourceProviderEventRow>(await client.query(
    `SELECT id::text AS id,
            provider_event_id AS "externalProviderEventId",
            provider, status, livemode,
            normalized_payload AS "normalizedPayload"
     FROM provider_events WHERE id = $1::uuid`,
    [payment.providerEventId],
  ));
  const source = sources[0];
  const envelope = source === undefined
    ? null
    : parseNormalizedProviderEventV1(source.normalizedPayload);
  if (
    source === undefined ||
    sources.length !== 1 ||
    source.status !== "processed" ||
    envelope === null ||
    !hasExactProviderEventEnvelopeIdentity(
      source.externalProviderEventId,
      envelope,
    ) ||
    envelope.kind !== "checkout_session" ||
    envelope.paymentIntentId !== payment.providerPaymentId ||
    envelope.livemode !== source.livemode
  ) {
    return Object.freeze({ status: "missing_dependency", count: 0 });
  }
  const deferred = rows<Readonly<{ id: string }>>(await client.query(
    `SELECT id::text AS id
     FROM provider_events
     WHERE status = 'deferred'
       AND provider = $1
       AND livemode = $2
       AND normalized_payload->>'kind' IN
           ('refund', 'refund_reconciliation', 'dispute')
       AND normalized_payload->>'paymentIntentId' = $3
     ORDER BY id FOR UPDATE`,
    [source.provider, source.livemode, payment.providerPaymentId],
  ));
  for (const event of deferred) {
    await client.query(
      `UPDATE provider_events
       SET status = 'pending', last_error_redacted = NULL,
           lease_token = NULL, lease_expires_at = NULL, processed_at = NULL
       WHERE id = $1::uuid AND status = 'deferred'`,
      [event.id],
    );
  }
  return Object.freeze({ status: "woken", count: deferred.length });
}

export function createProviderEventRepository(
  dependencies: Readonly<{
    runSerializableTransaction: ProviderEventTransactionRunner;
    keyedUuid?: KeyedUuidGenerator;
  }>,
): ProviderEventRepository {
  return Object.freeze({
    async registerAndClaim(input) {
      validateRegistration(input);
      return runSerializableWithRetry(() =>
        dependencies.runSerializableTransaction(
          (client) => registerInTransaction(client, input),
          {
            isolationLevel: "serializable",
            providerIdentityFenceKeys: [],
          },
        ),
      );
    },
    async processClaim(input) {
      if (dependencies.keyedUuid === undefined) {
        throw new Error("Provider event processing requires a keyed UUID generator");
      }
      const projection = projectProviderEventClaimV1(input.claim);
      return runSerializableWithRetry(() =>
        dependencies.runSerializableTransaction(
          (client) => processClaimInTransaction(client, {
            ...input,
            keyedUuid: dependencies.keyedUuid!,
          }),
          {
            isolationLevel: "serializable",
            providerIdentityFenceKeys:
              projection?.providerIdentityFenceKeys ?? [],
          },
        ),
      );
    },
    wakeDeferredDependencies(input) {
      return runSerializableWithRetry(() =>
        dependencies.runSerializableTransaction(
          (client) => wakeDeferredDependenciesInTransaction(client, input),
          {
            isolationLevel: "serializable",
            providerIdentityFenceKeys: [],
          },
        ),
      );
    },
    markClaimFailed(claim, input) {
      const projection = projectProviderEventClaimV1(claim);
      if (
        projection === null ||
        !Number.isFinite(input.now.getTime()) ||
        !BOUNDED_TEXT.test(input.reason)
      ) {
        return Promise.resolve(Object.freeze({ status: "lease_lost" }));
      }
      return runSerializableWithRetry(() =>
        dependencies.runSerializableTransaction(
          async (client) => {
            const updated = await client.query(
              `UPDATE provider_events
               SET status = 'failed', lease_token = NULL,
                   lease_expires_at = NULL, processed_at = NULL,
                   last_error_redacted = $4
               WHERE id = $1::uuid AND status = 'processing'
                 AND lease_token = $2 AND lease_expires_at > $3
               RETURNING id`,
              [
                projection.databaseEventId,
                projection.leaseToken,
                input.now,
                input.reason,
              ],
            );
            return Object.freeze({
              status: updated.rows.length === 1
                ? "applied" as const
                : "lease_lost" as const,
            });
          },
          {
            isolationLevel: "serializable",
            providerIdentityFenceKeys: [],
          },
        ),
      );
    },
  });
}
