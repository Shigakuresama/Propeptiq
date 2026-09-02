import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { orders } from "./commerce";
import { providerEvents } from "./payment";
import { createdAt, nonblank } from "./helpers";

export const downstreamEffects = pgTable("downstream_effects", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "restrict" }),
  providerEventId: uuid("provider_event_id").references(() => providerEvents.id, { onDelete: "restrict" }),
  effectType: text("effect_type").notNull(),
  payload: jsonb("payload").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").default("pending").notNull(),
  /**
   * Earliest instant this effect may be claimed. Defaults to now so every
   * existing effect stays immediately claimable; a settlement hold sets it
   * forward so the window survives a restart. See docs/adr/0006.
   */
  availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  lastErrorRedacted: text("last_error_redacted"),
}, (table) => [
  unique("downstream_effects_idempotency_unique").on(table.idempotencyKey),
  check("downstream_effects_type_nonblank", nonblank(table.effectType)),
  check("downstream_effects_idempotency_nonblank", nonblank(table.idempotencyKey)),
  check("downstream_effects_payload_object", sql`jsonb_typeof(${table.payload}) = 'object'`),
  check("downstream_effects_status", sql`${table.status} in ('pending','processing','processed','failed')`),
  check("downstream_effects_attempt_nonnegative", sql`${table.attemptCount} >= 0`),
  check(
    "downstream_effects_error_nonblank",
    sql`${table.lastErrorRedacted} is null or ${nonblank(table.lastErrorRedacted)}`,
  ),
  check(
    "downstream_effects_lease_pair",
    sql`(${table.leaseToken} is null) = (${table.leaseExpiresAt} is null)`,
  ),
  check(
    "downstream_effects_lease_token_nonblank",
    sql`${table.leaseToken} is null or ${nonblank(table.leaseToken)}`,
  ),
  check(
    "downstream_effects_timestamps_coherent",
    sql`${table.updatedAt} >= ${table.createdAt}
      and (${table.processedAt} is null or ${table.processedAt} >= ${table.createdAt})`,
  ),
  check(
    "downstream_effects_status_coherent",
    sql`(${table.status} = 'pending'
          and ${table.leaseToken} is null and ${table.processedAt} is null
          and ${table.lastErrorRedacted} is null)
      or (${table.status} = 'processing'
          and ${table.leaseToken} is not null and ${table.leaseExpiresAt} > ${table.updatedAt}
          and ${table.processedAt} is null and ${table.lastErrorRedacted} is null
          and ${table.attemptCount} >= 1)
      or (${table.status} = 'processed'
          and ${table.leaseToken} is null and ${table.processedAt} is not null
          and ${table.lastErrorRedacted} is null and ${table.attemptCount} >= 1)
      or (${table.status} = 'failed'
          and ${table.leaseToken} is null and ${table.processedAt} is null
          and ${table.lastErrorRedacted} is not null
          and ${nonblank(table.lastErrorRedacted)} and ${table.attemptCount} >= 1)`,
  ),
  index("downstream_effects_status_lease_idx").on(table.status, table.leaseExpiresAt),
]);
