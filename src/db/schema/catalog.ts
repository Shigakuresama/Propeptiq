import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  destinationResultEnum,
  destinationScopeKindEnum,
  lotStatusEnum,
  priceStatusEnum,
  productStatusEnum,
  productVariantStatusEnum,
  promotionApplicationModeEnum,
  promotionKindEnum,
  promotionScopeEnum,
  promotionStatusEnum,
  promotionTargetKindEnum,
  variantAmountUnitEnum,
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
  stateCode,
  updatedAt,
} from "./helpers";

export const productPolicyGroups = pgTable(
  "product_policy_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("product_policy_groups_slug_unique").on(table.slug),
    check("product_policy_groups_slug_nonblank", nonblank(table.slug)),
    check("product_policy_groups_name_nonblank", nonblank(table.name)),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    packageForm: text("package_form").notNull(),
    materialIdentity: text("material_identity").notNull(),
    policyGroupId: uuid("policy_group_id")
      .notNull()
      .references(() => productPolicyGroups.id, { onDelete: "restrict" }),
    status: productStatusEnum("status").default("draft").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("products_slug_unique").on(table.slug),
    check("products_slug_nonblank", nonblank(table.slug)),
    check("products_name_nonblank", nonblank(table.name)),
    check("products_package_form_nonblank", nonblank(table.packageForm)),
    check("products_material_identity_nonblank", nonblank(table.materialIdentity)),
    index("products_policy_group_status_idx").on(
      table.policyGroupId,
      table.status,
    ),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    sku: text("sku").notNull(),
    label: text("label").notNull(),
    canonicalAmount: numeric("canonical_amount", {
      precision: 20,
      scale: 6,
    }),
    amountUnit: variantAmountUnitEnum("amount_unit"),
    packageQuantity: integer("package_quantity").notNull(),
    status: productVariantStatusEnum("status").default("inactive").notNull(),
    stripeProductId: text("stripe_product_id"),
    stripePriceId: text("stripe_price_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("product_variants_id_product_unique").on(table.id, table.productId),
    unique("product_variants_sku_unique").on(table.sku),
    check("product_variants_sku_nonblank", nonblank(table.sku)),
    check("product_variants_label_nonblank", nonblank(table.label)),
    check(
      "product_variants_amount_coherent",
      sql`(${table.canonicalAmount} is null and ${table.amountUnit} is null)
          or (${table.canonicalAmount} > 0 and ${table.amountUnit} is not null)`,
    ),
    check(
      "product_variants_package_quantity_positive",
      sql`${table.packageQuantity} > 0`,
    ),
    check(
      "product_variants_stripe_product_nonblank",
      sql`${table.stripeProductId} is null or ${nonblank(table.stripeProductId)}`,
    ),
    check(
      "product_variants_stripe_price_nonblank",
      sql`${table.stripePriceId} is null or ${nonblank(table.stripePriceId)}`,
    ),
    index("product_variants_product_status_idx").on(
      table.productId,
      table.status,
    ),
  ],
);

export const productPrices = pgTable(
  "product_prices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id"),
    version: integer("version").notNull(),
    priceStatus: priceStatusEnum("price_status").default("active").notNull(),
    amountMinor: money("amount_minor"),
    currency: text("currency").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("product_prices_id_product_unique").on(table.id, table.productId),
    unique("product_prices_id_variant_unique").on(table.id, table.variantId),
    foreignKey({
      columns: [table.variantId, table.productId],
      foreignColumns: [productVariants.id, productVariants.productId],
      name: "product_prices_variant_product_fk",
    }).onDelete("restrict"),
    uniqueIndex("product_prices_legacy_product_version_unique")
      .on(table.productId, table.version)
      .where(sql`${table.variantId} is null`),
    uniqueIndex("product_prices_variant_version_unique")
      .on(table.variantId, table.version)
      .where(sql`${table.variantId} is not null`),
    uniqueIndex("product_prices_active_legacy_product_currency_unique")
      .on(table.productId, table.currency)
      .where(sql`${table.supersededAt} is null and ${table.variantId} is null`),
    uniqueIndex("product_prices_active_variant_currency_unique")
      .on(table.variantId, table.currency)
      .where(sql`${table.supersededAt} is null and ${table.variantId} is not null`),
    check("product_prices_version_positive", sql`${table.version} > 0`),
    check(
      "product_prices_amount_status_coherent",
      sql`(${table.priceStatus} = 'pending' and ${safeNonnegativeMoney(table.amountMinor)})
          or (${table.priceStatus} in ('active', 'unavailable') and ${safePositiveMoney(table.amountMinor)})`,
    ),
    check("product_prices_currency_format", currency(table.currency)),
    check(
      "product_prices_time_coherent",
      sql`${table.supersededAt} is null or ${table.supersededAt} > ${table.effectiveAt}`,
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
    variantId: uuid("variant_id"),
    supplierName: text("supplier_name").notNull(),
    supplierLotCode: text("supplier_lot_code").notNull(),
    analyticalMethod: text("analytical_method"),
    receivedQuantity: integer("received_quantity").notNull(),
    availableQuantity: integer("available_quantity").notNull(),
    status: lotStatusEnum("status").default("draft").notNull(),
    manufacturedAt: timestamp("manufactured_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("lots_id_product_unique").on(table.id, table.productId),
    foreignKey({
      columns: [table.variantId, table.productId],
      foreignColumns: [productVariants.id, productVariants.productId],
      name: "lots_variant_product_fk",
    }).onDelete("restrict"),
    unique("lots_product_supplier_code_unique").on(
      table.productId,
      table.supplierName,
      table.supplierLotCode,
    ),
    check("lots_supplier_nonblank", nonblank(table.supplierName)),
    check("lots_supplier_code_nonblank", nonblank(table.supplierLotCode)),
    check(
      "lots_analytical_method_nonblank",
      sql`${table.analyticalMethod} is null or ${nonblank(table.analyticalMethod)}`,
    ),
    check(
      "lots_quantity_bounds",
      sql`${table.receivedQuantity} > 0 and ${table.availableQuantity} >= 0 and ${table.availableQuantity} <= ${table.receivedQuantity}`,
    ),
    check(
      "lots_expiry_after_manufacture",
      sql`${table.manufacturedAt} is null or ${table.expiresAt} is null or ${table.expiresAt} > ${table.manufacturedAt}`,
    ),
    index("lots_product_status_idx").on(table.productId, table.status),
  ],
);

export const coaDocuments = pgTable(
  "coa_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => lots.id, { onDelete: "restrict" }),
    evidenceHash: text("evidence_hash").notNull(),
    storageKey: text("storage_key").notNull(),
    public: boolean("public").default(false).notNull(),
    active: boolean("active").default(true).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("coa_documents_id_lot_unique").on(table.id, table.lotId),
    unique("coa_documents_lot_hash_unique").on(table.lotId, table.evidenceHash),
    check("coa_documents_hash_sha256", sha256(table.evidenceHash)),
    check("coa_documents_storage_key_nonblank", nonblank(table.storageKey)),
    index("coa_documents_lot_active_idx").on(table.lotId, table.active),
  ],
);

export const analyticalClaims = pgTable(
  "analytical_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").notNull(),
    lotId: uuid("lot_id").notNull(),
    coaDocumentId: uuid("coa_document_id").notNull(),
    text: text("text").notNull(),
    active: boolean("active").default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.lotId, table.productId],
      foreignColumns: [lots.id, lots.productId],
      name: "analytical_claims_lot_product_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.coaDocumentId, table.lotId],
      foreignColumns: [coaDocuments.id, coaDocuments.lotId],
      name: "analytical_claims_coa_lot_fk",
    }).onDelete("restrict"),
    check("analytical_claims_text_nonblank", nonblank(table.text)),
    index("analytical_claims_product_active_idx").on(
      table.productId,
      table.active,
    ),
  ],
);

export const destinationPolicies = pgTable(
  "destination_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scopeKind: destinationScopeKindEnum("scope_kind").notNull(),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "restrict",
    }),
    policyGroupId: uuid("policy_group_id").references(
      () => productPolicyGroups.id,
      { onDelete: "restrict" },
    ),
    stateCode: text("state_code").notNull(),
    result: destinationResultEnum("result").notNull(),
    version: integer("version").notNull(),
    active: boolean("active").default(false).notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    check(
      "destination_policies_target_scope_coherent",
      sql`(${table.scopeKind} = 'product' and ${table.productId} is not null and ${table.policyGroupId} is null)
          or (${table.scopeKind} = 'policy_group' and ${table.productId} is null and ${table.policyGroupId} is not null)`,
    ),
    check("destination_policies_state_code", stateCode(table.stateCode)),
    check("destination_policies_version_positive", sql`${table.version} > 0`),
    check(
      "destination_policies_active_not_superseded",
      sql`${table.active} = false or ${table.supersededAt} is null`,
    ),
    check(
      "destination_policies_time_coherent",
      sql`${table.supersededAt} is null or ${table.supersededAt} > ${table.effectiveAt}`,
    ),
    uniqueIndex("destination_policies_product_version_unique")
      .on(table.productId, table.stateCode, table.version)
      .where(sql`${table.productId} is not null`),
    uniqueIndex("destination_policies_group_version_unique")
      .on(table.policyGroupId, table.stateCode, table.version)
      .where(sql`${table.policyGroupId} is not null`),
    uniqueIndex("destination_policies_active_product_state_unique")
      .on(table.productId, table.stateCode)
      .where(sql`${table.active} = true and ${table.productId} is not null`),
    uniqueIndex("destination_policies_active_group_state_unique")
      .on(table.policyGroupId, table.stateCode)
      .where(sql`${table.active} = true and ${table.policyGroupId} is not null`),
  ],
);

export const promotions = pgTable(
  "promotions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignKey: text("campaign_key"),
    code: text("code").notNull(),
    version: integer("version").default(1).notNull(),
    name: text("name").notNull(),
    kind: promotionKindEnum("kind").notNull(),
    status: promotionStatusEnum("status").default("draft").notNull(),
    amountMinor: nullableMoney("amount_minor"),
    basisPoints: integer("basis_points"),
    currency: text("currency"),
    configuration: jsonb("configuration").default({}).notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    timezone: text("timezone"),
    applicationMode: promotionApplicationModeEnum("application_mode"),
    scope: promotionScopeEnum("scope"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("promotions_code_unique").on(table.code),
    unique("promotions_id_version_unique").on(table.id, table.version),
    uniqueIndex("promotions_campaign_key_unique")
      .on(table.campaignKey)
      .where(sql`${table.campaignKey} is not null`),
    check("promotions_version_positive", sql`${table.version} > 0`),
    check("promotions_code_nonblank", nonblank(table.code)),
    check("promotions_name_nonblank", nonblank(table.name)),
    check(
      "promotions_campaign_key_format",
      sql`${table.campaignKey} is null or ${table.campaignKey} ~ '^[a-z0-9]+(?:[_-][a-z0-9]+)*$'`,
    ),
    check(
      "promotions_storefront_configuration_coherent",
      sql`(${table.campaignKey} is null and ${table.enabled} = false
            and ${table.timezone} is null and ${table.applicationMode} is null
            and ${table.scope} is null)
          or (${table.campaignKey} is not null and ${nonblank(table.timezone)}
            and ${table.applicationMode} is not null and ${table.scope} is not null
            and (${table.enabled} = false or ${table.status} = 'active'))`,
    ),
    check(
      "promotions_automatic_discount_coherent",
      sql`${table.applicationMode} is distinct from 'automatic'
          or (${table.kind} = 'discount' and ${table.basisPoints} is not null
            and ${table.amountMinor} is null and ${table.currency} is null)`,
    ),
    check(
      "promotions_winter30_exact",
      sql`${table.campaignKey} is distinct from 'winter30'
          or (${table.code} = 'WINTER30' and ${table.name} = 'Winter Sale'
            and ${table.kind} = 'discount' and ${table.status} = 'active'
            and ${table.amountMinor} is null and ${table.basisPoints} = 3000
            and ${table.currency} is null and ${table.enabled} = true
            and ${table.startsAt} is null and ${table.endsAt} is null
            and ${table.timezone} = 'America/Los_Angeles'
            and ${table.applicationMode} = 'automatic'
            and ${table.scope} = 'sitewide')`,
    ),
    check(
      "promotions_discount_shape",
      sql`(${table.amountMinor} is null or ${safePositiveMoney(table.amountMinor)})
          and (${table.basisPoints} is null or ${table.basisPoints} between 1 and 10000)
          and not (${table.amountMinor} is not null and ${table.basisPoints} is not null)
          and ((${table.amountMinor} is null and ${table.currency} is null) or (${table.amountMinor} is not null and ${table.currency} is not null and ${currency(table.currency)}))`,
    ),
    check(
      "promotions_time_coherent",
      sql`${table.startsAt} is null or ${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`,
    ),
  ],
);

export const promotionTargets = pgTable(
  "promotion_targets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    targetKind: promotionTargetKindEnum("target_kind").notNull(),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "restrict",
    }),
    policyGroupId: uuid("policy_group_id").references(
      () => productPolicyGroups.id,
      { onDelete: "restrict" },
    ),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    check(
      "promotion_targets_target_scope_coherent",
      sql`(${table.targetKind} = 'product' and ${table.productId} is not null
            and ${table.policyGroupId} is null and ${table.variantId} is null)
          or (${table.targetKind} = 'policy_group' and ${table.productId} is null
            and ${table.policyGroupId} is not null and ${table.variantId} is null)
          or (${table.targetKind} = 'variant' and ${table.productId} is null
            and ${table.policyGroupId} is null and ${table.variantId} is not null)`,
    ),
    uniqueIndex("promotion_targets_product_unique")
      .on(table.promotionId, table.productId)
      .where(sql`${table.productId} is not null`),
    uniqueIndex("promotion_targets_group_unique")
      .on(table.promotionId, table.policyGroupId)
      .where(sql`${table.policyGroupId} is not null`),
    uniqueIndex("promotion_targets_variant_unique")
      .on(table.promotionId, table.variantId)
      .where(sql`${table.variantId} is not null`),
  ],
);
