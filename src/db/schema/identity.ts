import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { buyerStatusEnum, researchPurposeEnum } from "./enums";
import { createdAt, nonblank, sha256, updatedAt } from "./helpers";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkId: text("clerk_id").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("users_clerk_id_unique").on(table.clerkId),
    check("users_clerk_id_nonblank", nonblank(table.clerkId)),
  ],
);

export const buyerProfiles = pgTable(
  "buyer_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    status: buyerStatusEnum("status").notNull(),
    ageConfirmedAt: timestamp("age_confirmed_at", { withTimezone: true }),
    researchPurpose: researchPurposeEnum("research_purpose"),
    organizationName: text("organization_name"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "buyer_profiles_active_complete",
      sql`${table.status} <> 'active' or (${table.ageConfirmedAt} is not null and ${table.researchPurpose} is not null)`,
    ),
    check(
      "buyer_profiles_organization_nonblank",
      sql`${table.organizationName} is null or ${nonblank(table.organizationName)}`,
    ),
  ],
);

export const attestationVersions = pgTable(
  "attestation_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    version: integer("version").notNull(),
    contentHash: text("content_hash").notNull(),
    policyText: text("policy_text").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("attestation_versions_version_unique").on(table.version),
    unique("attestation_versions_hash_unique").on(table.contentHash),
    check("attestation_versions_version_positive", sql`${table.version} > 0`),
    check("attestation_versions_hash_sha256", sha256(table.contentHash)),
    check("attestation_versions_policy_nonblank", nonblank(table.policyText)),
    check(
      "attestation_versions_time_coherent",
      sql`${table.supersededAt} is null or ${table.supersededAt} > ${table.effectiveAt}`,
    ),
  ],
);

export const attestationAcceptances = pgTable(
  "attestation_acceptances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    attestationVersionId: uuid("attestation_version_id")
      .notNull()
      .references(() => attestationVersions.id, { onDelete: "restrict" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("attestation_acceptances_id_user_unique").on(
      table.id,
      table.userId,
    ),
    unique("attestation_acceptances_user_version_unique").on(
      table.userId,
      table.attestationVersionId,
    ),
  ],
);

export const staffRoles = pgTable(
  "staff_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    capability: text("capability").notNull(),
    grantedByUserId: uuid("granted_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    grantCorrelationId: text("grant_correlation_id").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    revokeCorrelationId: text("revoke_correlation_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("staff_roles_active_user_capability_unique")
      .on(table.userId, table.capability)
      .where(sql`${table.revokedAt} is null`),
    check("staff_roles_capability_nonblank", nonblank(table.capability)),
    check(
      "staff_roles_grant_correlation_nonblank",
      nonblank(table.grantCorrelationId),
    ),
    check(
      "staff_roles_revoke_coherent",
      sql`(${table.revokedAt} is null and ${table.revokedByUserId} is null and ${table.revokeCorrelationId} is null)
          or (${table.revokedAt} is not null and ${table.revokedByUserId} is not null and ${table.revokeCorrelationId} is not null and ${nonblank(table.revokeCorrelationId)})`,
    ),
  ],
);
