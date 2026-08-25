import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { nonblank } from "./helpers";
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
