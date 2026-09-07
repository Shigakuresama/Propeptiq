import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { sha256 } from "./helpers";

export const contactEmailDeliveries = pgTable("contact_email_deliveries", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  requestHash: text("request_hash").notNull(),
  status: text("status").notNull(),
  providerId: text("provider_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
}, (table) => [
  check("contact_email_deliveries_request_hash_sha256", sha256(table.requestHash)),
  check("contact_email_deliveries_status_valid", sql`${table.status} in ('pending', 'accepted')`),
  check(
    "contact_email_deliveries_provider_state",
    sql`(${table.status} = 'pending' and ${table.providerId} is null)
      or (${table.status} = 'accepted' and ${table.providerId} is not null)`,
  ),
  index("contact_email_deliveries_updated_idx").on(table.updatedAt),
]);
