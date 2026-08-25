import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { nonblank, sha256 } from "./helpers";
import { users } from "./identity";

export const adminAudit = pgTable(
  "admin_audit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    serviceIdentity: text("service_identity"),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    correlationId: text("correlation_id").notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "admin_audit_actor_xor_service",
      sql`(${table.actorUserId} is not null) <> (${table.serviceIdentity} is not null)`,
    ),
    check(
      "admin_audit_service_nonblank",
      sql`${table.serviceIdentity} is null or ${nonblank(table.serviceIdentity)}`,
    ),
    check("admin_audit_action_nonblank", nonblank(table.action)),
    check("admin_audit_resource_type_nonblank", nonblank(table.resourceType)),
    check("admin_audit_resource_id_nonblank", nonblank(table.resourceId)),
    check("admin_audit_correlation_nonblank", nonblank(table.correlationId)),
    index("admin_audit_resource_occurred_idx").on(
      table.resourceType,
      table.resourceId,
      table.occurredAt,
    ),
  ],
);

export const rateLimitWindows = pgTable(
  "rate_limit_windows",
  {
    scopeHash: text("scope_hash").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({
      name: "rate_limit_windows_scope_start_pk",
      columns: [table.scopeHash, table.windowStart],
    }),
    check("rate_limit_windows_scope_sha256", sha256(table.scopeHash)),
    check("rate_limit_windows_count_positive", sql`${table.count} > 0`),
    check(
      "rate_limit_windows_expiry_after_start",
      sql`${table.expiresAt} > ${table.windowStart}`,
    ),
    index("rate_limit_windows_expiry_idx").on(table.expiresAt),
  ],
);
