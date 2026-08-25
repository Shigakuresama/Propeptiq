import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  actorStatusEnum,
  applicationStatusEnum,
  attestationContextEnum,
  cartStatusEnum,
  categoryStatusEnum,
  checkoutAttemptStatusEnum,
  complianceCaseStateEnum,
  decisionOutcomeEnum,
  gateKeyEnum,
  gateStatusEnum,
  idempotencyStatusEnum,
  inventoryEventTypeEnum,
  jurisdictionClassEnum,
  jurisdictionDecisionEnum,
  launchGateStateEnum,
  lotStatusEnum,
  membershipStatusEnum,
  orderStateEnum,
  organizationKindEnum,
  organizationStatusEnum,
  outboxStatusEnum,
  paymentEventTypeEnum,
  privateObjectKindEnum,
  productStatusEnum,
  productVersionStatusEnum,
  providerEventStateEnum,
  refundStatusEnum,
  releaseEventTypeEnum,
  reservationStateEnum,
  reviewStatusEnum,
  scanStatusEnum,
  shipmentStateEnum,
} from "./enums";

const MAX_SAFE_MINOR_UNITS = 9_007_199_254_740_991;

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
const money = (name: string) => bigint(name, { mode: "number" }).notNull();

export const actors = pgTable(
  "actors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    status: actorStatusEnum("status").default("active").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique("actors_clerk_user_id_unique").on(table.clerkUserId)],
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkOrganizationId: text("clerk_organization_id"),
    kind: organizationKindEnum("kind").notNull(),
    status: organizationStatusEnum("status").default("draft").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("organizations_clerk_organization_id_unique").on(
      table.clerkOrganizationId,
    ),
  ],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "restrict" }),
    businessRole: text("business_role").notNull(),
    status: membershipStatusEnum("status").default("invited").notNull(),
    evidenceReference: text("evidence_reference").notNull(),
    createdAt: createdAt(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    unique("organization_memberships_actor_organization_unique").on(
      table.actorId,
      table.organizationId,
    ),
    index("organization_memberships_organization_idx").on(
      table.organizationId,
    ),
    check(
      "organization_memberships_business_role_nonblank",
      sql`length(btrim(${table.businessRole})) > 0`,
    ),
    check(
      "organization_memberships_evidence_reference_nonblank",
      sql`length(btrim(${table.evidenceReference})) > 0`,
    ),
  ],
);

export const staffCapabilities = pgTable(
  "staff_capabilities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    capability: text("capability").notNull(),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    grantedByActorId: uuid("granted_by_actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    evidenceReference: text("evidence_reference").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    grantedAt: createdAt(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    unique("staff_capabilities_idempotency_key_unique").on(
      table.idempotencyKey,
    ),
    uniqueIndex("staff_capabilities_active_scope_unique")
      .on(
        table.actorId,
        table.capability,
        table.organizationId,
        table.resourceType,
        table.resourceId,
      )
      .where(sql`${table.revokedAt} is null`),
    check(
      "staff_capabilities_no_self_grant",
      sql`${table.actorId} <> ${table.grantedByActorId}`,
    ),
    check(
      "staff_capabilities_resource_scope_complete",
      sql`num_nonnulls(${table.resourceType}, ${table.resourceId}) in (0, 2)`,
    ),
    check(
      "staff_capabilities_capability_nonblank",
      sql`length(btrim(${table.capability})) > 0`,
    ),
  ],
);

export const privateObjects = pgTable(
  "private_objects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: privateObjectKindEnum("kind").notNull(),
    objectKey: text("object_key").notNull(),
    sha256: text("sha256").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    retentionClass: text("retention_class").notNull(),
    scanStatus: scanStatusEnum("scan_status").default("pending").notNull(),
    createdByActorId: uuid("created_by_actor_id").references(() => actors.id, {
      onDelete: "restrict",
    }),
    approvedByActorId: uuid("approved_by_actor_id").references(() => actors.id, {
      onDelete: "restrict",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("private_objects_object_key_unique").on(table.objectKey),
    check("private_objects_sha256_format", sql`${table.sha256} ~ '^[a-f0-9]{64}$'`),
    check("private_objects_byte_size_nonnegative", sql`${table.byteSize} >= 0`),
    check(
      "private_objects_approval_pair",
      sql`num_nonnulls(${table.approvedByActorId}, ${table.approvedAt}) in (0, 2)`,
    ),
  ],
);

export const researcherApplications = pgTable(
  "researcher_applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    applicantActorId: uuid("applicant_actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    applicationVersion: integer("application_version").notNull(),
    status: applicationStatusEnum("status").default("draft").notNull(),
    researchPurpose: text("research_purpose").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("researcher_applications_actor_version_unique").on(
      table.applicantActorId,
      table.applicationVersion,
    ),
    index("researcher_applications_organization_idx").on(table.organizationId),
    check(
      "researcher_applications_version_positive",
      sql`${table.applicationVersion} > 0`,
    ),
    check(
      "researcher_applications_purpose_nonblank",
      sql`length(btrim(${table.researchPurpose})) > 0`,
    ),
  ],
);

export const applicationEvidence = pgTable(
  "application_evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => researcherApplications.id, { onDelete: "restrict" }),
    privateObjectId: uuid("private_object_id")
      .notNull()
      .references(() => privateObjects.id, { onDelete: "restrict" }),
    evidenceKind: text("evidence_kind").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("application_evidence_object_unique").on(table.privateObjectId),
    index("application_evidence_application_idx").on(table.applicationId),
  ],
);

export const attestationVersions = pgTable(
  "attestation_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    context: attestationContextEnum("context").notNull(),
    version: text("version").notNull(),
    exactText: text("exact_text").notNull(),
    contentHash: text("content_hash").notNull(),
    approvedByActorId: uuid("approved_by_actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "restrict" }),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("attestation_versions_context_version_unique").on(
      table.context,
      table.version,
    ),
    check(
      "attestation_versions_content_hash_format",
      sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "attestation_versions_effective_interval",
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.effectiveAt}`,
    ),
  ],
);

export const approvalDecisions = pgTable(
  "approval_decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => researcherApplications.id, { onDelete: "restrict" }),
    outcome: decisionOutcomeEnum("outcome").notNull(),
    reason: text("reason").notNull(),
    evidenceReference: text("evidence_reference").notNull(),
    decidedByActorId: uuid("decided_by_actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "restrict" }),
    stepUpVerifiedAt: timestamp("step_up_verified_at", {
      withTimezone: true,
    }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    decidedAt: createdAt(),
  },
  (table) => [
    unique("approval_decisions_idempotency_key_unique").on(
      table.idempotencyKey,
    ),
    index("approval_decisions_application_idx").on(table.applicationId),
    check(
      "approval_decisions_reason_nonblank",
      sql`length(btrim(${table.reason})) > 0`,
    ),
    check(
      "approval_decisions_evidence_nonblank",
      sql`length(btrim(${table.evidenceReference})) > 0`,
    ),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    catalogKey: text("catalog_key").notNull(),
    status: categoryStatusEnum("status").default("draft").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique("categories_catalog_key_unique").on(table.catalogKey)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    catalogKey: text("catalog_key").notNull(),
    status: productStatusEnum("status").default("draft").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [unique("products_catalog_key_unique").on(table.catalogKey)],
);

export const productVersions = pgTable(
  "product_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    status: productVersionStatusEnum("status").default("draft").notNull(),
    contentHash: text("content_hash").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    draftedByActorId: uuid("drafted_by_actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "restrict" }),
    approvedByActorId: uuid("approved_by_actor_id").references(() => actors.id, {
      onDelete: "restrict",
    }),
    evidenceObjectId: uuid("evidence_object_id").references(
      () => privateObjects.id,
      { onDelete: "restrict" },
    ),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("product_versions_product_version_unique").on(
      table.productId,
      table.version,
    ),
    uniqueIndex("product_versions_current_published_unique")
      .on(table.productId)
      .where(
        sql`${table.status} = 'published' and ${table.supersededAt} is null`,
      ),
    check("product_versions_version_positive", sql`${table.version} > 0`),
    check(
      "product_versions_content_hash_format",
      sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "product_versions_separation_of_duties",
      sql`${table.approvedByActorId} is null or ${table.approvedByActorId} <> ${table.draftedByActorId}`,
    ),
    check(
      "product_versions_approval_complete",
      sql`(${table.status} = 'draft') or num_nonnulls(${table.approvedByActorId}, ${table.evidenceObjectId}, ${table.approvedAt}) = 3`,
    ),
  ],
);

export const productCategories = pgTable(
  "product_categories",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.categoryId] }),
  ],
);

export const priceBooks = pgTable(
  "price_books",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    currency: text("currency").notNull(),
    unitAmountMinor: money("unit_amount_minor"),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    approvedByActorId: uuid("approved_by_actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "restrict" }),
    evidenceObjectId: uuid("evidence_object_id")
      .notNull()
      .references(() => privateObjects.id, { onDelete: "restrict" }),
    contentHash: text("content_hash").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("price_books_product_currency_idx").on(
      table.productId,
      table.currency,
    ),
    check("price_books_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "price_books_amount_safe",
      sql`${table.unitAmountMinor} >= 0 and ${table.unitAmountMinor} <= ${MAX_SAFE_MINOR_UNITS}`,
    ),
    check(
      "price_books_effective_interval",
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.effectiveAt}`,
    ),
    check(
      "price_books_content_hash_format",
      sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const lots = pgTable(
  "lots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    lotCode: text("lot_code").notNull(),
    status: lotStatusEnum("status").default("draft").notNull(),
    receivedQuantity: integer("received_quantity").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    supplierEvidenceObjectId: uuid("supplier_evidence_object_id").references(
      () => privateObjects.id,
      { onDelete: "restrict" },
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("lots_product_lot_code_unique").on(table.productId, table.lotCode),
    check("lots_received_quantity_positive", sql`${table.receivedQuantity} > 0`),
    check(
      "lots_release_evidence_complete",
      sql`${table.status} <> 'released' or num_nonnulls(${table.releasedAt}, ${table.supplierEvidenceObjectId}) = 2`,
    ),
  ],
);

export const coaDocuments = pgTable(
  "coa_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "restrict" }),
    privateObjectId: uuid("private_object_id")
      .notNull()
      .references(() => privateObjects.id, { onDelete: "restrict" }),
    reviewStatus: reviewStatusEnum("review_status").default("pending").notNull(),
    approvedByActorId: uuid("approved_by_actor_id").references(() => actors.id, {
      onDelete: "restrict",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    resultSummary: jsonb("result_summary").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("coa_documents_private_object_unique").on(table.privateObjectId),
    index("coa_documents_lot_idx").on(table.lotId),
    check(
      "coa_documents_approval_complete",
      sql`${table.reviewStatus} <> 'approved' or num_nonnulls(${table.approvedByActorId}, ${table.approvedAt}) = 2`,
    ),
  ],
);

export const jurisdictions = pgTable(
  "jurisdictions",
  {
    code: text("code").primaryKey(),
    name: text("name").notNull(),
    class: jurisdictionClassEnum("class").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check("jurisdictions_code_format", sql`${table.code} ~ '^[A-Z]{2}$'`),
    check(
      "jurisdictions_name_nonblank",
      sql`length(btrim(${table.name})) > 0`,
    ),
  ],
);

export const jurisdictionPolicyVersions = pgTable(
  "jurisdiction_policy_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    version: integer("version").notNull(),
    contentHash: text("content_hash").notNull(),
    draftedByActorId: uuid("drafted_by_actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "restrict" }),
    approvedByActorId: uuid("approved_by_actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "restrict" }),
    evidenceObjectId: uuid("evidence_object_id")
      .notNull()
      .references(() => privateObjects.id, { onDelete: "restrict" }),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    reviewAt: timestamp("review_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("jurisdiction_policy_versions_version_unique").on(table.version),
    uniqueIndex("jurisdiction_policy_versions_current_unique")
      .on(sql`((1))`)
      .where(sql`${table.supersededAt} is null`),
    check("jurisdiction_policy_versions_version_positive", sql`${table.version} > 0`),
    check(
      "jurisdiction_policy_versions_content_hash_format",
      sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "jurisdiction_policy_versions_separation_of_duties",
      sql`${table.approvedByActorId} <> ${table.draftedByActorId}`,
    ),
    check(
      "jurisdiction_policy_versions_review_after_effective",
      sql`${table.reviewAt} > ${table.effectiveAt}`,
    ),
    check(
      "jurisdiction_policy_versions_expiry_after_effective",
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.effectiveAt}`,
    ),
  ],
);

export const productJurisdictionRules = pgTable(
  "product_jurisdiction_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    jurisdictionCode: text("jurisdiction_code")
      .notNull()
      .references(() => jurisdictions.code, { onDelete: "restrict" }),
    policyVersionId: uuid("policy_version_id")
      .notNull()
      .references(() => jurisdictionPolicyVersions.id, {
        onDelete: "restrict",
      }),
    decision: jurisdictionDecisionEnum("decision").notNull(),
    reasonCode: text("reason_code").notNull(),
    rationale: text("rationale").notNull(),
    evidenceObjectId: uuid("evidence_object_id")
      .notNull()
      .references(() => privateObjects.id, { onDelete: "restrict" }),
    evidenceIntegrityVerified: boolean("evidence_integrity_verified")
      .default(false)
      .notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    reviewAt: timestamp("review_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("product_jurisdiction_rules_policy_scope_unique").on(
      table.productId,
      table.jurisdictionCode,
      table.policyVersionId,
    ),
    uniqueIndex("product_jurisdiction_rules_current_scope_unique")
      .on(table.productId, table.jurisdictionCode)
      .where(sql`${table.supersededAt} is null`),
    check(
      "product_jurisdiction_rules_reason_code_format",
      sql`${table.reasonCode} ~ '^[a-z0-9_]+$'`,
    ),
    check(
      "product_jurisdiction_rules_review_after_effective",
      sql`${table.reviewAt} > ${table.effectiveAt}`,
    ),
    check(
      "product_jurisdiction_rules_expiry_after_effective",
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.effectiveAt}`,
    ),
  ],
);

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerActorId: uuid("owner_actor_id").references(() => actors.id, {
      onDelete: "restrict",
    }),
    ownerOrganizationId: uuid("owner_organization_id").references(
      () => organizations.id,
      { onDelete: "restrict" },
    ),
    status: cartStatusEnum("status").default("active").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "carts_exactly_one_owner",
      sql`num_nonnulls(${table.ownerActorId}, ${table.ownerOrganizationId}) = 1`,
    ),
  ],
);

export const cartItems = pgTable(
  "cart_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("cart_items_cart_product_unique").on(table.cartId, table.productId),
    check("cart_items_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    buyerActorId: uuid("buyer_actor_id").references(() => actors.id, {
      onDelete: "restrict",
    }),
    buyerOrganizationId: uuid("buyer_organization_id").references(
      () => organizations.id,
      { onDelete: "restrict" },
    ),
    state: orderStateEnum("state").default("draft").notNull(),
    currency: text("currency").notNull(),
    subtotalMinor: money("subtotal_minor"),
    taxMinor: money("tax_minor"),
    shippingMinor: money("shipping_minor"),
    totalMinor: money("total_minor"),
    destinationJurisdictionCode: text("destination_jurisdiction_code")
      .notNull()
      .references(() => jurisdictions.code, { onDelete: "restrict" }),
    destinationSnapshot: jsonb("destination_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    destinationHash: text("destination_hash").notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("orders_id_currency_unique").on(table.id, table.currency),
    index("orders_buyer_organization_idx").on(table.buyerOrganizationId),
    check(
      "orders_exactly_one_buyer",
      sql`num_nonnulls(${table.buyerActorId}, ${table.buyerOrganizationId}) = 1`,
    ),
    check("orders_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "orders_money_safe",
      sql`${table.subtotalMinor} between 0 and ${MAX_SAFE_MINOR_UNITS}
        and ${table.taxMinor} between 0 and ${MAX_SAFE_MINOR_UNITS}
        and ${table.shippingMinor} between 0 and ${MAX_SAFE_MINOR_UNITS}
        and ${table.totalMinor} between 0 and ${MAX_SAFE_MINOR_UNITS}`,
    ),
    check(
      "orders_total_matches_components",
      sql`${table.totalMinor} = ${table.subtotalMinor} + ${table.taxMinor} + ${table.shippingMinor}`,
    ),
    check("orders_destination_hash_format", sql`${table.destinationHash} ~ '^[a-f0-9]{64}$'`),
    check("orders_version_positive", sql`${table.version} > 0`),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    lotId: uuid("lot_id").references(() => lots.id, { onDelete: "restrict" }),
    priceBookId: uuid("price_book_id")
      .notNull()
      .references(() => priceBooks.id, { onDelete: "restrict" }),
    productJurisdictionRuleId: uuid("product_jurisdiction_rule_id").references(
      () => productJurisdictionRules.id,
      { onDelete: "restrict" },
    ),
    quantity: integer("quantity").notNull(),
    currency: text("currency").notNull(),
    unitAmountMinor: money("unit_amount_minor"),
    lineTotalMinor: money("line_total_minor"),
    priceSnapshotHash: text("price_snapshot_hash").notNull(),
    productSnapshot: jsonb("product_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    productSnapshotHash: text("product_snapshot_hash").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("order_items_id_order_unique").on(table.id, table.orderId),
    foreignKey({
      name: "order_items_order_currency_fk",
      columns: [table.orderId, table.currency],
      foreignColumns: [orders.id, orders.currency],
    }).onDelete("restrict"),
    index("order_items_order_idx").on(table.orderId),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
    check("order_items_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "order_items_money_safe",
      sql`${table.unitAmountMinor} between 0 and ${MAX_SAFE_MINOR_UNITS}
        and ${table.lineTotalMinor} between 0 and ${MAX_SAFE_MINOR_UNITS}`,
    ),
    check(
      "order_items_line_total_matches",
      sql`${table.lineTotalMinor} = ${table.unitAmountMinor} * ${table.quantity}`,
    ),
    check(
      "order_items_price_snapshot_hash_format",
      sql`${table.priceSnapshotHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "order_items_product_snapshot_hash_format",
      sql`${table.productSnapshotHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const attestations = pgTable(
  "attestations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    attestationVersionId: uuid("attestation_version_id")
      .notNull()
      .references(() => attestationVersions.id, { onDelete: "restrict" }),
    context: attestationContextEnum("context").notNull(),
    applicationId: uuid("application_id").references(
      () => researcherApplications.id,
      { onDelete: "restrict" },
    ),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    purpose: text("purpose").notNull(),
    requestContextHash: text("request_context_hash").notNull(),
    acceptedAt: createdAt(),
  },
  (table) => [
    index("attestations_actor_idx").on(table.actorId),
    check(
      "attestations_context_parent",
      sql`(${table.context} = 'application' and ${table.applicationId} is not null and ${table.orderId} is null)
        or (${table.context} = 'checkout' and ${table.applicationId} is null and ${table.orderId} is not null)`,
    ),
    check(
      "attestations_request_context_hash_format",
      sql`${table.requestContextHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const eligibilityEvaluations = pgTable(
  "eligibility_evaluations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    buyerActorId: uuid("buyer_actor_id").references(() => actors.id, {
      onDelete: "restrict",
    }),
    buyerOrganizationId: uuid("buyer_organization_id").references(
      () => organizations.id,
      { onDelete: "restrict" },
    ),
    attestationVersionId: uuid("attestation_version_id")
      .notNull()
      .references(() => attestationVersions.id, { onDelete: "restrict" }),
    inputHash: text("input_hash").notNull(),
    policyVersionHash: text("policy_version_hash").notNull(),
    decision: gateStatusEnum("decision").notNull(),
    evaluatedAt: createdAt(),
  },
  (table) => [
    unique("eligibility_evaluations_order_input_unique").on(
      table.orderId,
      table.inputHash,
    ),
    check(
      "eligibility_evaluations_exactly_one_buyer",
      sql`num_nonnulls(${table.buyerActorId}, ${table.buyerOrganizationId}) = 1`,
    ),
    check(
      "eligibility_evaluations_input_hash_format",
      sql`${table.inputHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "eligibility_evaluations_policy_hash_format",
      sql`${table.policyVersionHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const eligibilityGates = pgTable(
  "eligibility_gates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => eligibilityEvaluations.id, { onDelete: "restrict" }),
    gateKey: gateKeyEnum("gate_key").notNull(),
    status: gateStatusEnum("status").notNull(),
    reasonCode: text("reason_code").notNull(),
    evidenceReferences: jsonb("evidence_references")
      .$type<readonly Record<string, unknown>[]>()
      .notNull(),
  },
  (table) => [
    unique("eligibility_gates_evaluation_gate_unique").on(
      table.evaluationId,
      table.gateKey,
    ),
    check(
      "eligibility_gates_non_line_only",
      sql`${table.gateKey} <> 'product_jurisdiction'`,
    ),
    check(
      "eligibility_gates_reason_code_format",
      sql`${table.reasonCode} ~ '^[a-z0-9_]+$'`,
    ),
  ],
);

export const eligibilityLineResults = pgTable(
  "eligibility_line_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => eligibilityEvaluations.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    productJurisdictionRuleId: uuid("product_jurisdiction_rule_id").references(
      () => productJurisdictionRules.id,
      { onDelete: "restrict" },
    ),
    status: gateStatusEnum("status").notNull(),
    reasonCode: text("reason_code").notNull(),
    evidenceReferences: jsonb("evidence_references")
      .$type<readonly Record<string, unknown>[]>()
      .notNull(),
  },
  (table) => [
    unique("eligibility_line_results_evaluation_item_unique").on(
      table.evaluationId,
      table.orderItemId,
    ),
    check(
      "eligibility_line_results_reason_code_format",
      sql`${table.reasonCode} ~ '^[a-z0-9_]+$'`,
    ),
  ],
);

export const complianceCases = pgTable(
  "compliance_cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    orderItemId: uuid("order_item_id").references(() => orderItems.id, {
      onDelete: "restrict",
    }),
    caseType: text("case_type").notNull(),
    state: complianceCaseStateEnum("state").default("open").notNull(),
    reasonCode: text("reason_code").notNull(),
    openedAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("compliance_cases_organization_idx").on(table.organizationId),
    index("compliance_cases_order_idx").on(table.orderId),
    check(
      "compliance_cases_reason_code_format",
      sql`${table.reasonCode} ~ '^[a-z0-9_]+$'`,
    ),
    check(
      "compliance_cases_item_requires_order",
      sql`${table.orderItemId} is null or ${table.orderId} is not null`,
    ),
  ],
);

export const complianceDecisions = pgTable(
  "compliance_decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => complianceCases.id, { onDelete: "restrict" }),
    decidedByActorId: uuid("decided_by_actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "restrict" }),
    capability: text("capability").notNull(),
    outcome: decisionOutcomeEnum("outcome").notNull(),
    reason: text("reason").notNull(),
    evidenceReference: text("evidence_reference").notNull(),
    stepUpVerifiedAt: timestamp("step_up_verified_at", {
      withTimezone: true,
    }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    decidedAt: createdAt(),
  },
  (table) => [
    unique("compliance_decisions_idempotency_key_unique").on(
      table.idempotencyKey,
    ),
    index("compliance_decisions_case_idx").on(table.caseId),
    check(
      "compliance_decisions_reason_nonblank",
      sql`length(btrim(${table.reason})) > 0`,
    ),
  ],
);

export const manualReviewCaseDecisions = pgTable(
  "manual_review_case_decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => complianceCases.id, { onDelete: "restrict" }),
    orderId: uuid("order_id").notNull(),
    orderItemId: uuid("order_item_id").notNull(),
    productJurisdictionRuleId: uuid("product_jurisdiction_rule_id")
      .notNull()
      .references(() => productJurisdictionRules.id, { onDelete: "restrict" }),
    eligibilityEvaluationId: uuid("eligibility_evaluation_id")
      .notNull()
      .references(() => eligibilityEvaluations.id, { onDelete: "restrict" }),
    eligibilityEvaluationHash: text("eligibility_evaluation_hash").notNull(),
    outcome: decisionOutcomeEnum("outcome").notNull(),
    decidedByActorId: uuid("decided_by_actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "restrict" }),
    evidenceReference: text("evidence_reference").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    decidedAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: "manual_review_case_decisions_item_order_fk",
      columns: [table.orderItemId, table.orderId],
      foreignColumns: [orderItems.id, orderItems.orderId],
    }).onDelete("restrict"),
    unique("manual_review_case_decisions_idempotency_key_unique").on(
      table.idempotencyKey,
    ),
    check(
      "manual_review_case_decisions_outcome",
      sql`${table.outcome} in ('approved', 'rejected')`,
    ),
    check(
      "manual_review_case_decisions_hash_format",
      sql`${table.eligibilityEvaluationHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "manual_review_case_decisions_expiry_after_decision",
      sql`${table.expiresAt} > ${table.decidedAt}`,
    ),
  ],
);

export const inventoryLedger = pgTable(
  "inventory_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "restrict" }),
    eventType: inventoryEventTypeEnum("event_type").notNull(),
    quantityDelta: integer("quantity_delta").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    actorId: uuid("actor_id").references(() => actors.id, {
      onDelete: "restrict",
    }),
    reasonCode: text("reason_code").notNull(),
    referenceType: text("reference_type").notNull(),
    referenceId: uuid("reference_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    occurredAt: createdAt(),
  },
  (table) => [
    unique("inventory_ledger_idempotency_key_unique").on(
      table.idempotencyKey,
    ),
    index("inventory_ledger_lot_occurred_idx").on(
      table.lotId,
      table.occurredAt,
    ),
    check(
      "inventory_ledger_quantity_delta_nonzero",
      sql`${table.quantityDelta} <> 0`,
    ),
    check("inventory_ledger_balance_nonnegative", sql`${table.balanceAfter} >= 0`),
    check(
      "inventory_ledger_reason_code_format",
      sql`${table.reasonCode} ~ '^[a-z0-9_]+$'`,
    ),
  ],
);

export const inventoryReservations = pgTable(
  "inventory_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "restrict" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    state: reservationStateEnum("state").default("active").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("inventory_reservations_idempotency_key_unique").on(
      table.idempotencyKey,
    ),
    uniqueIndex("inventory_reservations_active_order_item_unique")
      .on(table.orderItemId)
      .where(sql`${table.state} = 'active'`),
    index("inventory_reservations_lot_state_idx").on(
      table.lotId,
      table.state,
    ),
    check("inventory_reservations_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "inventory_reservations_expiry_after_creation",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

export const checkoutAttempts = pgTable(
  "checkout_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id").notNull(),
    currency: text("currency").notNull(),
    amountMinor: money("amount_minor"),
    provider: text("provider").notNull(),
    providerSessionId: text("provider_session_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    status: checkoutAttemptStatusEnum("status").default("created").notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "checkout_attempts_order_currency_fk",
      columns: [table.orderId, table.currency],
      foreignColumns: [orders.id, orders.currency],
    }).onDelete("restrict"),
    unique("checkout_attempts_idempotency_key_unique").on(
      table.idempotencyKey,
    ),
    unique("checkout_attempts_provider_session_unique").on(
      table.provider,
      table.providerSessionId,
    ),
    check(
      "checkout_attempts_currency_format",
      sql`${table.currency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "checkout_attempts_amount_safe",
      sql`${table.amountMinor} between 0 and ${MAX_SAFE_MINOR_UNITS}`,
    ),
  ],
);

export const providerWebhookEvents = pgTable(
  "provider_webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    payloadObjectId: uuid("payload_object_id").references(() => privateObjects.id, {
      onDelete: "restrict",
    }),
    state: providerEventStateEnum("state").default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    lastErrorRedacted: text("last_error_redacted"),
    receivedAt: createdAt(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    unique("provider_webhook_events_provider_event_unique").on(
      table.provider,
      table.providerEventId,
    ),
    index("provider_webhook_events_retry_idx").on(
      table.state,
      table.leaseExpiresAt,
    ),
    check(
      "provider_webhook_events_payload_hash_format",
      sql`${table.payloadHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "provider_webhook_events_attempt_count_nonnegative",
      sql`${table.attemptCount} >= 0`,
    ),
    check(
      "provider_webhook_events_lease_pair",
      sql`num_nonnulls(${table.leaseOwner}, ${table.leaseExpiresAt}) in (0, 2)`,
    ),
  ],
);

export const paymentJournal = pgTable(
  "payment_journal",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id").notNull(),
    providerEventId: uuid("provider_event_id")
      .notNull()
      .references(() => providerWebhookEvents.id, { onDelete: "restrict" }),
    eventType: paymentEventTypeEnum("event_type").notNull(),
    providerPaymentReference: text("provider_payment_reference").notNull(),
    amountMinor: money("amount_minor"),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    evidenceHash: text("evidence_hash").notNull(),
    occurredAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: "payment_journal_order_currency_fk",
      columns: [table.orderId, table.currency],
      foreignColumns: [orders.id, orders.currency],
    }).onDelete("restrict"),
    unique("payment_journal_provider_event_type_unique").on(
      table.providerEventId,
      table.eventType,
    ),
    index("payment_journal_order_occurred_idx").on(
      table.orderId,
      table.occurredAt,
    ),
    check("payment_journal_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "payment_journal_amount_safe",
      sql`${table.amountMinor} between 0 and ${MAX_SAFE_MINOR_UNITS}`,
    ),
    check(
      "payment_journal_evidence_hash_format",
      sql`${table.evidenceHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const refundRequests = pgTable(
  "refund_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id").notNull(),
    paymentJournalId: uuid("payment_journal_id")
      .notNull()
      .references(() => paymentJournal.id, { onDelete: "restrict" }),
    requestedByActorId: uuid("requested_by_actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "restrict" }),
    capability: text("capability").notNull(),
    reason: text("reason").notNull(),
    amountMinor: money("amount_minor"),
    currency: text("currency").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: refundStatusEnum("status").default("requested").notNull(),
    providerRefundReference: text("provider_refund_reference"),
    requestedAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "refund_requests_order_currency_fk",
      columns: [table.orderId, table.currency],
      foreignColumns: [orders.id, orders.currency],
    }).onDelete("restrict"),
    unique("refund_requests_idempotency_key_unique").on(
      table.idempotencyKey,
    ),
    check("refund_requests_currency_format", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "refund_requests_amount_safe",
      sql`${table.amountMinor} > 0 and ${table.amountMinor} <= ${MAX_SAFE_MINOR_UNITS}`,
    ),
    check(
      "refund_requests_reason_nonblank",
      sql`length(btrim(${table.reason})) > 0`,
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
    createdAt: createdAt(),
  },
  (table) => [unique("fulfillment_releases_order_unique").on(table.orderId)],
);

export const fulfillmentReleaseEvents = pgTable(
  "fulfillment_release_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    releaseId: uuid("release_id")
      .notNull()
      .references(() => fulfillmentReleases.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    eventType: releaseEventTypeEnum("event_type").notNull(),
    paymentJournalId: uuid("payment_journal_id").references(
      () => paymentJournal.id,
      { onDelete: "restrict" },
    ),
    clearanceEvaluationId: uuid("clearance_evaluation_id").references(
      () => eligibilityEvaluations.id,
      { onDelete: "restrict" },
    ),
    actorId: uuid("actor_id").references(() => actors.id, {
      onDelete: "restrict",
    }),
    reasonCode: text("reason_code"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("fulfillment_release_events_release_version_unique").on(
      table.releaseId,
      table.version,
    ),
    unique("fulfillment_release_events_idempotency_key_unique").on(
      table.idempotencyKey,
    ),
    uniqueIndex("fulfillment_release_events_consume_once_unique")
      .on(table.releaseId)
      .where(sql`${table.eventType} = 'consumed'`),
    check("fulfillment_release_events_version_positive", sql`${table.version} > 0`),
    check(
      "fulfillment_release_events_issue_evidence",
      sql`${table.eventType} <> 'issued' or num_nonnulls(${table.paymentJournalId}, ${table.clearanceEvaluationId}, ${table.expiresAt}) = 3`,
    ),
    check(
      "fulfillment_release_events_reason_format",
      sql`${table.reasonCode} is null or ${table.reasonCode} ~ '^[a-z0-9_]+$'`,
    ),
  ],
);

export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    releaseId: uuid("release_id")
      .notNull()
      .references(() => fulfillmentReleases.id, { onDelete: "restrict" }),
    consumedReleaseEventId: uuid("consumed_release_event_id")
      .notNull()
      .references(() => fulfillmentReleaseEvents.id, { onDelete: "restrict" }),
    state: shipmentStateEnum("state").default("pending").notNull(),
    carrier: text("carrier"),
    trackingNumber: text("tracking_number"),
    handedOffAt: timestamp("handed_off_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("shipments_consumed_release_event_unique").on(
      table.consumedReleaseEventId,
    ),
    check(
      "shipments_carrier_tracking_pair",
      sql`num_nonnulls(${table.carrier}, ${table.trackingNumber}) in (0, 2)`,
    ),
  ],
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scope: text("scope").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseHash: text("response_hash"),
    status: idempotencyStatusEnum("status").default("in_progress").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("idempotency_records_scope_key_unique").on(
      table.scope,
      table.idempotencyKey,
    ),
    check(
      "idempotency_records_request_hash_format",
      sql`${table.requestHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "idempotency_records_response_hash_format",
      sql`${table.responseHash} is null or ${table.responseHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const outboxMessages = pgTable(
  "outbox_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    orderId: uuid("order_id").references(() => orders.id, {
      onDelete: "restrict",
    }),
    templateKey: text("template_key").notNull(),
    recipientReference: text("recipient_reference").notNull(),
    subjectHash: text("subject_hash").notNull(),
    bodyHash: text("body_hash").notNull(),
    contentPolicyHash: text("content_policy_hash").notNull(),
    templateData: jsonb("template_data")
      .$type<Record<string, unknown>>()
      .notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: outboxStatusEnum("status").default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("outbox_messages_idempotency_key_unique").on(
      table.idempotencyKey,
    ),
    index("outbox_messages_delivery_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
    check(
      "outbox_messages_hashes_format",
      sql`${table.subjectHash} ~ '^[a-f0-9]{64}$'
        and ${table.bodyHash} ~ '^[a-f0-9]{64}$'
        and ${table.contentPolicyHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "outbox_messages_attempt_count_nonnegative",
      sql`${table.attemptCount} >= 0`,
    ),
    check(
      "outbox_messages_lease_pair",
      sql`num_nonnulls(${table.leaseOwner}, ${table.leaseExpiresAt}) in (0, 2)`,
    ),
  ],
);

export const launchGates = pgTable(
  "launch_gates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    environment: text("environment").notNull(),
    scope: text("scope").notNull(),
    version: integer("version").notNull(),
    state: launchGateStateEnum("state").default("closed").notNull(),
    approvedByActorId: uuid("approved_by_actor_id").references(() => actors.id, {
      onDelete: "restrict",
    }),
    evidenceObjectId: uuid("evidence_object_id").references(
      () => privateObjects.id,
      { onDelete: "restrict" },
    ),
    contentHash: text("content_hash").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    reviewAt: timestamp("review_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("launch_gates_scope_version_unique").on(
      table.environment,
      table.scope,
      table.version,
    ),
    uniqueIndex("launch_gates_current_scope_unique")
      .on(table.environment, table.scope)
      .where(sql`${table.supersededAt} is null`),
    check(
      "launch_gates_environment",
      sql`${table.environment} in ('local', 'preview', 'production')`,
    ),
    check("launch_gates_version_positive", sql`${table.version} > 0`),
    check(
      "launch_gates_content_hash_format",
      sql`${table.contentHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "launch_gates_open_requires_evidence",
      sql`${table.state} <> 'open' or num_nonnulls(${table.approvedByActorId}, ${table.evidenceObjectId}) = 2`,
    ),
    check("launch_gates_review_after_effective", sql`${table.reviewAt} > ${table.effectiveAt}`),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => actors.id, {
      onDelete: "restrict",
    }),
    serviceIdentity: text("service_identity"),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    decision: text("decision").notNull(),
    correlationId: text("correlation_id").notNull(),
    redactedMetadata: jsonb("redacted_metadata")
      .$type<Record<string, unknown>>()
      .notNull(),
    occurredAt: createdAt(),
  },
  (table) => [
    unique("audit_events_correlation_resource_action_unique").on(
      table.correlationId,
      table.resourceType,
      table.resourceId,
      table.action,
    ),
    index("audit_events_organization_occurred_idx").on(
      table.organizationId,
      table.occurredAt,
    ),
    check(
      "audit_events_exactly_one_actor",
      sql`num_nonnulls(${table.actorId}, ${table.serviceIdentity}) = 1`,
    ),
  ],
);
