import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { lots } from "./catalog";
import { orderItems, orders } from "./commerce";
import {
  buyerStatusEnum,
  fulfillmentReleaseStateEnum,
  inventoryEventTypeEnum,
  reservationStateEnum,
  reviewOutcomeEnum,
  shipmentStateEnum,
} from "./enums";
import { createdAt, nonblank, sha256, stateCode, updatedAt } from "./helpers";
import { attestationVersions, users } from "./identity";
import { paymentEvents } from "./payment";

export const reviewRequests = pgTable(
  "review_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    snapshotHash: text("snapshot_hash").notNull(),
    buyerStatusSnapshot: buyerStatusEnum("buyer_status_snapshot").notNull(),
    attestationVersionId: uuid("attestation_version_id")
      .notNull()
      .references(() => attestationVersions.id, { onDelete: "restrict" }),
    destinationStateCode: text("destination_state_code").notNull(),
    cartSnapshot: jsonb("cart_snapshot").notNull(),
    buyerReviewRequired: boolean("buyer_review_required").notNull(),
    destinationPolicyIds: uuid("destination_policy_ids").array().notNull(),
    outcome: reviewOutcomeEnum("outcome"),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    coversBuyerReview: boolean("covers_buyer_review"),
    coveredDestinationPolicyIds: uuid("covered_destination_policy_ids").array(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("review_requests_snapshot_hash_unique").on(table.snapshotHash),
    check("review_requests_snapshot_hash", sha256(table.snapshotHash)),
    check("review_requests_destination_state", stateCode(table.destinationStateCode)),
    check(
      "review_requests_explicit_reason",
      sql`${table.buyerReviewRequired} = true or cardinality(${table.destinationPolicyIds}) > 0`,
    ),
    check(
      "review_requests_decision_coherent",
      sql`(${table.outcome} is null and ${table.decidedByUserId} is null and ${table.decidedAt} is null
            and ${table.coversBuyerReview} is null and ${table.coveredDestinationPolicyIds} is null)
          or (${table.outcome} is not null and ${table.decidedByUserId} is not null and ${table.decidedAt} is not null
            and ${table.coversBuyerReview} is not null and ${table.coveredDestinationPolicyIds} is not null)`,
    ),
  ],
);

export const fulfillmentReleases = pgTable(
  "fulfillment_releases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    paymentEventId: uuid("payment_event_id")
      .notNull()
      .references(() => paymentEvents.id, { onDelete: "restrict" }),
    reviewRequestId: uuid("review_request_id").references(
      () => reviewRequests.id,
      { onDelete: "restrict" },
    ),
    clearanceSnapshotHash: text("clearance_snapshot_hash").notNull(),
    state: fulfillmentReleaseStateEnum("state").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => [
    unique("fulfillment_releases_order_version_unique").on(
      table.orderId,
      table.version,
    ),
    unique("fulfillment_releases_idempotency_unique").on(table.idempotencyKey),
    uniqueIndex("fulfillment_releases_current_issued_unique")
      .on(table.orderId)
      .where(sql`${table.state} = 'issued'`),
    check("fulfillment_releases_version_positive", sql`${table.version} > 0`),
    check("fulfillment_releases_idempotency_nonblank", nonblank(table.idempotencyKey)),
    check("fulfillment_releases_clearance_hash", sha256(table.clearanceSnapshotHash)),
    check(
      "fulfillment_releases_expiry_after_issue",
      sql`${table.expiresAt} > ${table.issuedAt}`,
    ),
    check(
      "fulfillment_releases_state_coherent",
      sql`(${table.state} = 'issued' and ${table.revokedAt} is null and ${table.expiredAt} is null and ${table.consumedAt} is null)
          or (${table.state} = 'revoked' and ${table.revokedAt} is not null and ${table.expiredAt} is null and ${table.consumedAt} is null)
          or (${table.state} = 'expired' and ${table.revokedAt} is null and ${table.expiredAt} is not null and ${table.consumedAt} is null)
          or (${table.state} = 'consumed' and ${table.revokedAt} is null and ${table.expiredAt} is null and ${table.consumedAt} is not null)`,
    ),
  ],
);

export const inventoryReservations = pgTable(
  "inventory_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "restrict" }),
    quantityReserved: integer("quantity_reserved").notNull(),
    quantityRemaining: integer("quantity_remaining").notNull(),
    state: reservationStateEnum("state").default("active").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("inventory_reservations_idempotency_unique").on(table.idempotencyKey),
    check("inventory_reservations_idempotency_nonblank", nonblank(table.idempotencyKey)),
    check(
      "inventory_reservations_quantity_bounds",
      sql`${table.quantityReserved} > 0 and ${table.quantityRemaining} >= 0 and ${table.quantityRemaining} <= ${table.quantityReserved}`,
    ),
    index("inventory_reservations_lot_state_idx").on(table.lotId, table.state),
  ],
);

export const inventoryEvents = pgTable(
  "inventory_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    eventType: inventoryEventTypeEnum("event_type").notNull(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id").references(() => orderItems.id, {
      onDelete: "restrict",
    }),
    reservationId: uuid("reservation_id").references(
      () => inventoryReservations.id,
      { onDelete: "restrict" },
    ),
    fulfillmentReleaseId: uuid("fulfillment_release_id").references(
      () => fulfillmentReleases.id,
      { onDelete: "restrict" },
    ),
    quantity: integer("quantity").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("inventory_events_idempotency_unique").on(table.idempotencyKey),
    uniqueIndex("inventory_events_release_consume_unique")
      .on(table.fulfillmentReleaseId)
      .where(
        sql`${table.eventType} = 'consume' and ${table.fulfillmentReleaseId} is not null`,
      ),
    check("inventory_events_idempotency_nonblank", nonblank(table.idempotencyKey)),
    check("inventory_events_quantity_positive", sql`${table.quantity} > 0`),
    check("inventory_events_balance_nonnegative", sql`${table.balanceAfter} >= 0`),
    check(
      "inventory_events_consume_release",
      sql`${table.eventType} <> 'consume' or (${table.fulfillmentReleaseId} is not null and ${table.orderItemId} is not null and ${table.reservationId} is not null)`,
    ),
    index("inventory_events_lot_occurred_idx").on(table.lotId, table.occurredAt),
  ],
);

export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    fulfillmentReleaseId: uuid("fulfillment_release_id")
      .notNull()
      .references(() => fulfillmentReleases.id, { onDelete: "restrict" }),
    carrier: text("carrier").notNull(),
    trackingReference: text("tracking_reference").notNull(),
    state: shipmentStateEnum("state").default("pending").notNull(),
    handedOffAt: timestamp("handed_off_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("shipments_fulfillment_release_unique").on(table.fulfillmentReleaseId),
    unique("shipments_carrier_tracking_unique").on(
      table.carrier,
      table.trackingReference,
    ),
    check("shipments_carrier_nonblank", nonblank(table.carrier)),
    check("shipments_tracking_nonblank", nonblank(table.trackingReference)),
    check(
      "shipments_state_coherent",
      sql`(${table.state} = 'pending' and ${table.handedOffAt} is null and ${table.deliveredAt} is null)
          or (${table.state} in ('handed_off', 'exception') and ${table.handedOffAt} is not null and ${table.deliveredAt} is null)
          or (${table.state} = 'delivered' and ${table.handedOffAt} is not null and ${table.deliveredAt} is not null and ${table.deliveredAt} >= ${table.handedOffAt})`,
    ),
  ],
);
