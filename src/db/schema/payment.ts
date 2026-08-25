import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { orders } from "./commerce";
import {
  paymentEventTypeEnum,
  providerEventStatusEnum,
  refundStatusEnum,
} from "./enums";
import {
  createdAt,
  currency,
  money,
  nonblank,
  nullableMoney,
  safeNonnegativeMoney,
  safePositiveMoney,
  sha256,
} from "./helpers";
import { users } from "./identity";

export const providerEvents = pgTable(
  "provider_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: providerEventStatusEnum("status").default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastErrorRedacted: text("last_error_redacted"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    unique("provider_events_id_provider_unique").on(table.id, table.provider),
    unique("provider_events_delivery_unique").on(
      table.provider,
      table.providerEventId,
    ),
    check("provider_events_provider_nonblank", nonblank(table.provider)),
    check("provider_events_id_nonblank", nonblank(table.providerEventId)),
    check("provider_events_payload_hash", sha256(table.payloadHash)),
    check("provider_events_attempt_nonnegative", sql`${table.attemptCount} >= 0`),
    check(
      "provider_events_error_nonblank",
      sql`${table.lastErrorRedacted} is null or ${nonblank(table.lastErrorRedacted)}`,
    ),
    check(
      "provider_events_lease_pair",
      sql`(${table.leaseToken} is null) = (${table.leaseExpiresAt} is null)`,
    ),
    check(
      "provider_events_lease_token_nonblank",
      sql`${table.leaseToken} is null or ${nonblank(table.leaseToken)}`,
    ),
    check(
      "provider_events_status_coherent",
      sql`(${table.status} = 'pending'
            and ${table.leaseToken} is null and ${table.processedAt} is null)
          or (${table.status} = 'processing'
            and ${table.leaseToken} is not null and ${table.leaseExpiresAt} > ${table.receivedAt}
            and ${table.processedAt} is null and ${table.attemptCount} >= 1)
          or (${table.status} = 'processed'
            and ${table.leaseToken} is null and ${table.processedAt} is not null
            and ${table.lastErrorRedacted} is null and ${table.attemptCount} >= 1)
          or (${table.status} = 'failed'
            and ${table.leaseToken} is null and ${table.processedAt} is null
            and ${table.lastErrorRedacted} is not null and ${nonblank(table.lastErrorRedacted)}
            and ${table.attemptCount} >= 1)`,
    ),
    index("provider_events_status_lease_idx").on(
      table.status,
      table.leaseExpiresAt,
    ),
  ],
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    providerEventId: uuid("provider_event_id")
      .notNull()
      .references(() => providerEvents.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    eventType: paymentEventTypeEnum("event_type").notNull(),
    providerPaymentId: text("provider_payment_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    amountMinor: money("amount_minor"),
    currency: text("currency").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("payment_events_id_order_unique").on(table.id, table.orderId),
    unique("payment_events_provider_event_unique").on(table.providerEventId),
    unique("payment_events_idempotency_unique").on(table.idempotencyKey),
    check("payment_events_idempotency_nonblank", nonblank(table.idempotencyKey)),
    check(
      "payment_events_provider_payment_nonblank",
      sql`${table.providerPaymentId} is null or ${nonblank(table.providerPaymentId)}`,
    ),
    check("payment_events_amount_safe", safeNonnegativeMoney(table.amountMinor)),
    check("payment_events_currency_format", currency(table.currency)),
    index("payment_events_order_occurred_idx").on(
      table.orderId,
      table.occurredAt,
    ),
  ],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    verifiedPaymentEventId: uuid("verified_payment_event_id").notNull(),
    provider: text("provider").notNull(),
    providerEventId: uuid("provider_event_id"),
    providerRefundId: text("provider_refund_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestedAmountMinor: money("requested_amount_minor"),
    confirmedAmountMinor: nullableMoney("confirmed_amount_minor"),
    currency: text("currency").notNull(),
    status: refundStatusEnum("status").default("requested").notNull(),
    reasonRedacted: text("reason_redacted"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (table) => [
    unique("refunds_idempotency_unique").on(table.idempotencyKey),
    unique("refunds_provider_event_unique").on(table.providerEventId),
    uniqueIndex("refunds_provider_refund_unique")
      .on(table.provider, table.providerRefundId)
      .where(sql`${table.providerRefundId} is not null`),
    foreignKey({
      columns: [table.verifiedPaymentEventId, table.orderId],
      foreignColumns: [paymentEvents.id, paymentEvents.orderId],
      name: "refunds_verified_payment_order_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.providerEventId, table.provider],
      foreignColumns: [providerEvents.id, providerEvents.provider],
      name: "refunds_provider_event_provider_fk",
    }).onDelete("restrict"),
    check("refunds_provider_nonblank", nonblank(table.provider)),
    check("refunds_idempotency_nonblank", nonblank(table.idempotencyKey)),
    check(
      "refunds_provider_refund_nonblank",
      sql`${table.providerRefundId} is null or ${nonblank(table.providerRefundId)}`,
    ),
    check("refunds_requested_amount_positive", safePositiveMoney(table.requestedAmountMinor)),
    check(
      "refunds_confirmed_amount_bounds",
      sql`${table.confirmedAmountMinor} is null or (${safePositiveMoney(table.confirmedAmountMinor)} and ${table.confirmedAmountMinor} <= ${table.requestedAmountMinor})`,
    ),
    check("refunds_currency_format", currency(table.currency)),
    check(
      "refunds_confirmation_coherent",
      sql`(${table.status} = 'succeeded' and ${table.confirmedAmountMinor} is not null
            and ${table.providerEventId} is not null and ${table.providerRefundId} is not null
            and ${table.confirmedAt} is not null)
          or (${table.status} <> 'succeeded' and ${table.confirmedAmountMinor} is null and ${table.confirmedAt} is null)`,
    ),
  ],
);
