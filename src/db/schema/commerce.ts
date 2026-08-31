import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import {
  destinationPolicies,
  productPrices,
  products,
  productVariants,
  promotions,
} from "./catalog";
import {
  buyerStatusEnum,
  checkoutAttemptStatusEnum,
  checkoutGateResultEnum,
  orderStateEnum,
  promotionKindEnum,
} from "./enums";
import {
  createdAt,
  currency,
  money,
  nonblank,
  safeNonnegativeMoney,
  sha256,
  stateCode,
  updatedAt,
} from "./helpers";
import { attestationAcceptances, users } from "./identity";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    buyerUserId: uuid("buyer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    buyerStatusSnapshot: buyerStatusEnum("buyer_status_snapshot").notNull(),
    attestationAcceptanceId: uuid("attestation_acceptance_id").notNull(),
    destinationStateCode: text("destination_state_code").notNull(),
    currency: text("currency").notNull(),
    subtotalMinor: money("subtotal_minor"),
    discountMinor: money("discount_minor"),
    taxMinor: money("tax_minor"),
    shippingMinor: money("shipping_minor"),
    totalMinor: money("total_minor"),
    state: orderStateEnum("state").default("draft").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("orders_id_buyer_unique").on(table.id, table.buyerUserId),
    unique("orders_id_destination_state_unique").on(table.id, table.destinationStateCode),
    foreignKey({
      columns: [table.attestationAcceptanceId, table.buyerUserId],
      foreignColumns: [attestationAcceptances.id, attestationAcceptances.userId],
      name: "orders_attestation_acceptance_buyer_fk",
    }).onDelete("restrict"),
    check("orders_destination_state_code", stateCode(table.destinationStateCode)),
    check("orders_currency_format", currency(table.currency)),
    check(
      "orders_money_safe",
      sql`${safeNonnegativeMoney(table.subtotalMinor)} and ${safeNonnegativeMoney(table.discountMinor)}
          and ${safeNonnegativeMoney(table.taxMinor)} and ${safeNonnegativeMoney(table.shippingMinor)}
          and ${safeNonnegativeMoney(table.totalMinor)}`,
    ),
    check(
      "orders_totals_coherent",
      sql`${table.discountMinor} <= ${table.subtotalMinor}
          and ${table.totalMinor} = ${table.subtotalMinor} - ${table.discountMinor} + ${table.taxMinor} + ${table.shippingMinor}`,
    ),
    index("orders_buyer_created_idx").on(table.buyerUserId, table.createdAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    variantId: uuid("variant_id"),
    productPriceId: uuid("product_price_id").notNull(),
    destinationPolicyId: uuid("destination_policy_id")
      .notNull()
      .references(() => destinationPolicies.id, { onDelete: "restrict" }),
    productNameSnapshot: text("product_name_snapshot").notNull(),
    packageFormSnapshot: text("package_form_snapshot").notNull(),
    currency: text("currency").notNull(),
    unitAmountMinor: money("unit_amount_minor"),
    quantity: integer("quantity").notNull(),
    subtotalMinor: money("subtotal_minor"),
    discountMinor: money("discount_minor"),
    totalMinor: money("total_minor"),
    createdAt: createdAt(),
  },
  (table) => [
    unique("order_items_id_order_product_unique").on(
      table.id,
      table.orderId,
      table.productId,
    ),
    unique("order_items_id_order_product_variant_unique").on(
      table.id,
      table.orderId,
      table.productId,
      table.variantId,
    ),
    unique("order_items_id_order_unique").on(table.id, table.orderId),
    foreignKey({
      columns: [table.productPriceId, table.productId],
      foreignColumns: [productPrices.id, productPrices.productId],
      name: "order_items_price_product_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.variantId, table.productId],
      foreignColumns: [productVariants.id, productVariants.productId],
      name: "order_items_variant_product_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.productPriceId, table.variantId],
      foreignColumns: [productPrices.id, productPrices.variantId],
      name: "order_items_price_variant_fk",
    }).onDelete("restrict"),
    check("order_items_name_nonblank", nonblank(table.productNameSnapshot)),
    check("order_items_package_nonblank", nonblank(table.packageFormSnapshot)),
    check("order_items_currency_format", currency(table.currency)),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "order_items_money_safe",
      sql`${safeNonnegativeMoney(table.unitAmountMinor)} and ${safeNonnegativeMoney(table.subtotalMinor)}
          and ${safeNonnegativeMoney(table.discountMinor)} and ${safeNonnegativeMoney(table.totalMinor)}`,
    ),
    check(
      "order_items_totals_coherent",
      sql`${table.subtotalMinor} = ${table.unitAmountMinor} * ${table.quantity}
          and ${table.discountMinor} <= ${table.subtotalMinor}
          and ${table.totalMinor} = ${table.subtotalMinor} - ${table.discountMinor}`,
    ),
    index("order_items_order_idx").on(table.orderId),
  ],
);

export const checkoutAttempts = pgTable(
  "checkout_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    buyerUserId: uuid("buyer_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    canonicalPricingRevision: text("canonical_pricing_revision"),
    canonicalQuoteSnapshot: jsonb("canonical_quote_snapshot"),
    reviewAuthorizationMode: text("review_authorization_mode"),
    status: checkoutAttemptStatusEnum("status").default("created").notNull(),
    accountGate: checkoutGateResultEnum("account_gate").notNull(),
    attestationGate: checkoutGateResultEnum("attestation_gate").notNull(),
    productGate: checkoutGateResultEnum("product_gate").notNull(),
    destinationGate: checkoutGateResultEnum("destination_gate").notNull(),
    inventoryGate: checkoutGateResultEnum("inventory_gate").notNull(),
    paymentProviderGate:
      checkoutGateResultEnum("payment_provider_gate").notNull(),
    permitted: boolean("permitted").notNull(),
    reviewRequired: boolean("review_required").notNull(),
    reasons: text("reasons").array().default(sql`'{}'::text[]`).notNull(),
    taxReady: boolean("tax_ready").notNull(),
    shippingReady: boolean("shipping_ready").notNull(),
    provider: text("provider"),
    providerRequestId: text("provider_request_id"),
    providerSessionId: text("provider_session_id"),
    providerRequestHash: text("provider_request_hash"),
    providerCustomerEmail: text("provider_customer_email"),
    providerOrigin: text("provider_origin"),
    providerRequestSchemaVersion: integer("provider_request_schema_version"),
    providerBindingSnapshot: jsonb("provider_binding_snapshot"),
    providerLivemode: boolean("provider_livemode"),
    providerScope: text("provider_scope"),
    taxQuoteReference: text("tax_quote_reference"),
    shippingQuoteReference: text("shipping_quote_reference"),
    shippingService: text("shipping_service"),
    createdAt: createdAt(),
    providerExpiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    unique("checkout_attempts_buyer_idempotency_unique").on(table.buyerUserId, table.idempotencyKey),
    unique("checkout_attempts_id_order_unique").on(table.id, table.orderId),
    foreignKey({ columns: [table.orderId, table.buyerUserId], foreignColumns: [orders.id, orders.buyerUserId], name: "checkout_attempts_order_buyer_fk" }).onDelete("restrict"),
    unique("checkout_attempts_provider_request_unique").on(
      table.provider,
      table.providerRequestId,
    ),
    unique("checkout_attempts_provider_session_unique").on(
      table.provider,
      table.providerSessionId,
    ),
    check("checkout_attempts_idempotency_nonblank", nonblank(table.idempotencyKey)),
    check("checkout_attempts_request_hash", sha256(table.requestHash)),
    check(
      "checkout_attempts_canonical_replay_coherent",
      sql`(${table.canonicalPricingRevision} is null and ${table.canonicalQuoteSnapshot} is null)
          or (${table.canonicalPricingRevision} is not null
            and ${sha256(table.canonicalPricingRevision)}
            and ${table.canonicalQuoteSnapshot} is not null)`,
    ),
    check(
      "checkout_attempts_review_authorization_mode",
      sql`${table.reviewAuthorizationMode} is null
          or ${table.reviewAuthorizationMode} in ('bound', 'none')`,
    ),
    check("checkout_attempts_provider_request_hash", sql`${table.providerRequestHash} is null or ${sha256(table.providerRequestHash)}`),
    check(
      "checkout_attempts_quote_references_coherent",
      sql`((${table.taxReady} = true and ${table.taxQuoteReference} is not null and ${nonblank(table.taxQuoteReference)})
            or (${table.taxReady} = false and ${table.taxQuoteReference} is null))
          and ((${table.shippingReady} = true and ${table.shippingQuoteReference} is not null
                 and ${nonblank(table.shippingQuoteReference)} and ${table.shippingService} is not null
                 and ${nonblank(table.shippingService)})
            or (${table.shippingReady} = false and ${table.shippingQuoteReference} is null
                 and ${table.shippingService} is null))`,
    ),
    check(
      "checkout_attempts_provider_coherent",
      sql`(${table.provider} is null and ${table.providerRequestId} is null
            and ${table.providerSessionId} is null and ${table.providerRequestHash} is null
            and ${table.providerExpiresAt} is null
            and ${table.providerCustomerEmail} is null and ${table.providerOrigin} is null
            and ${table.providerRequestSchemaVersion} is null
            and ${table.providerBindingSnapshot} is null
            and ${table.providerLivemode} is null and ${table.providerScope} is null)
          or (${table.provider} is not null and ${nonblank(table.provider)}
            and ${table.providerRequestId} is not null and ${nonblank(table.providerRequestId)}
            and ${table.providerRequestHash} is not null
            and ${table.providerExpiresAt} is not null
            and ${table.providerCustomerEmail} is not null and ${nonblank(table.providerCustomerEmail)}
            and ${table.providerOrigin} is not null and ${nonblank(table.providerOrigin)}
            and ((${table.providerRequestSchemaVersion} = 1
                    and ${table.providerBindingSnapshot} is null)
              or (${table.providerRequestSchemaVersion} = 2
                    and ${table.providerBindingSnapshot} is not null
                    and ${table.providerBindingSnapshot}->>'schemaVersion' = '2'))
            and ${table.providerLivemode} is not null
            and ${table.providerScope} is not null and ${nonblank(table.providerScope)}
            and (${table.providerSessionId} is null or ${nonblank(table.providerSessionId)}))`,
    ),
    check(
      "checkout_attempts_status_coherent",
      sql`(${table.status} = 'created' and (
              (${table.permitted} = false and ${table.provider} is null
                and ${table.providerRequestHash} is null and ${table.providerExpiresAt} is null)
              or (${table.permitted} = true and ${table.provider} is not null
                and ${table.providerRequestId} is not null and ${table.providerSessionId} is null
                and ${table.providerRequestHash} is not null and ${table.providerExpiresAt} is not null)))
          or (${table.status} = 'open' and ${table.permitted} = true
              and ${table.provider} is not null and ${table.providerRequestId} is not null
              and ${table.providerSessionId} is not null and ${table.providerRequestHash} is not null
              and ${table.providerExpiresAt} is not null)
          or (${table.status} = 'provider_unknown' and ${table.permitted} = true
              and ${table.provider} is not null and ${table.providerRequestId} is not null
              and ${table.providerRequestHash} is not null and ${table.providerExpiresAt} is not null)
          or (${table.status} in ('completed', 'expired') and ${table.permitted} = true
              and ${table.provider} is not null and ${table.providerRequestId} is not null
              and ${table.providerSessionId} is not null and ${table.providerRequestHash} is not null
              and ${table.providerExpiresAt} is not null)
          or (${table.status} = 'failed' and (
              (${table.permitted} = false and ${table.provider} is null
                and ${table.providerRequestHash} is null and ${table.providerExpiresAt} is null)
              or (${table.permitted} = true and ${table.provider} is not null
                and ${table.providerRequestId} is not null and ${table.providerRequestHash} is not null
                and ${table.providerExpiresAt} is not null)))`,
    ),
    check(
      "checkout_attempts_provider_expiry_after_create",
      sql`${table.providerExpiresAt} is null or ${table.providerExpiresAt} > ${table.createdAt}`,
    ),
    check(
      "checkout_attempts_permitted_coherent",
      sql`${table.permitted} = false or (
        ${table.accountGate} = 'pass' and ${table.attestationGate} = 'pass'
        and ${table.productGate} = 'pass' and ${table.destinationGate} = 'pass'
        and ${table.inventoryGate} = 'pass' and ${table.paymentProviderGate} = 'pass'
        and ${table.reviewRequired} = false and ${table.taxReady} = true and ${table.shippingReady} = true
      )`,
    ),
  ],
);

export const orderPromotionApplications = pgTable("order_promotion_applications", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  promotionId: uuid("promotion_id").notNull(),
  promotionVersion: integer("promotion_version").notNull(),
  codeSnapshot: text("code_snapshot").notNull(),
  nameSnapshot: text("name_snapshot").notNull(),
  kindSnapshot: promotionKindEnum("kind_snapshot").notNull(),
  appliedDiscountMinor: money("applied_discount_minor").notNull(),
  createdAt: createdAt(),
}, (table) => [
  unique("order_promotion_applications_id_order_unique").on(table.id, table.orderId),
  unique("order_promotion_applications_order_promotion_unique").on(table.orderId, table.promotionId),
  foreignKey({ columns: [table.promotionId, table.promotionVersion], foreignColumns: [promotions.id, promotions.version], name: "order_promotion_applications_promotion_version_fk" }).onDelete("restrict"),
  check("order_promotion_applications_discount_nonnegative", safeNonnegativeMoney(table.appliedDiscountMinor)),
  check("order_promotion_applications_code_nonblank", nonblank(table.codeSnapshot)),
  check("order_promotion_applications_name_nonblank", nonblank(table.nameSnapshot)),
  check("order_promotion_applications_version_positive", sql`${table.promotionVersion} > 0`),
]);

export const orderPromotionAllocations = pgTable("order_promotion_allocations", {
  id: uuid("id").defaultRandom().primaryKey(),
  applicationId: uuid("application_id").notNull(),
  orderId: uuid("order_id").notNull(),
  orderItemId: uuid("order_item_id").notNull(),
  allocatedDiscountMinor: money("allocated_discount_minor").notNull(),
}, (table) => [
  unique("order_promotion_allocations_application_item_unique").on(table.applicationId, table.orderItemId),
  foreignKey({ columns: [table.applicationId, table.orderId], foreignColumns: [orderPromotionApplications.id, orderPromotionApplications.orderId], name: "order_promotion_allocations_application_order_fk" }).onDelete("cascade"),
  foreignKey({ columns: [table.orderItemId, table.orderId], foreignColumns: [orderItems.id, orderItems.orderId], name: "order_promotion_allocations_item_order_fk" }).onDelete("restrict"),
  check("order_promotion_allocations_discount_nonnegative", safeNonnegativeMoney(table.allocatedDiscountMinor)),
]);

/**
 * Durable binding between an order and the Stripe invoice issued for it.
 *
 * One order carries at most one invoice: `orderId` is the primary key, so a
 * repeat issue attempt cannot bill an institutional buyer twice. The provider
 * invoice id is separately unique, so the same invoice cannot be bound to two
 * orders. Together these are what let an inbound invoice provider event be
 * resolved to an order from OUR record rather than from provider-supplied
 * metadata. See docs/adr/0006.
 */
export const orderInvoices = pgTable("order_invoices", {
  orderId: uuid("order_id").primaryKey().references(() => orders.id, { onDelete: "restrict" }),
  provider: text("provider").notNull(),
  providerInvoiceId: text("provider_invoice_id"),
  hostedInvoiceUrl: text("hosted_invoice_url"),
  amountDueMinor: integer("amount_due_minor"),
  status: text("status").default("pending").notNull(),
  evidenceCode: text("evidence_code"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  unique("order_invoices_provider_invoice_unique").on(table.provider, table.providerInvoiceId),
  check("order_invoices_provider", sql`${table.provider} = 'stripe'`),
  check(
    "order_invoices_status",
    sql`${table.status} in ('pending','open','unavailable','unknown')`,
  ),
  // An open invoice must carry a complete provider binding; anything else must
  // not claim one. This is what stops a half-written row reading as billable.
  check(
    "order_invoices_open_coherent",
    sql`(${table.status} = 'open'
          and ${table.providerInvoiceId} is not null and ${nonblank(table.providerInvoiceId)}
          and ${table.hostedInvoiceUrl} is not null and ${nonblank(table.hostedInvoiceUrl)}
          and ${table.amountDueMinor} is not null and ${table.amountDueMinor} >= 0)
        or (${table.status} <> 'open'
          and ${table.hostedInvoiceUrl} is null
          and ${table.amountDueMinor} is null)`,
  ),
  check(
    "order_invoices_evidence_coherent",
    sql`(${table.status} in ('unavailable','unknown') and ${table.evidenceCode} is not null
          and ${nonblank(table.evidenceCode)})
        or (${table.status} not in ('unavailable','unknown') and ${table.evidenceCode} is null)`,
  ),
  check("order_invoices_timestamps", sql`${table.updatedAt} >= ${table.createdAt}`),
]);

export const orderShippingAddresses = pgTable("order_shipping_addresses", {
  orderId: uuid("order_id").primaryKey().references(() => orders.id, { onDelete: "cascade" }),
  recipientName: text("recipient_name").notNull(),
  addressLine1: text("address_line1").notNull(),
  addressLine2: text("address_line2"),
  city: text("city").notNull(),
  stateCode: text("state_code").notNull(),
  postalCode: text("postal_code").notNull(),
  country: text("country").default("US").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  foreignKey({ columns: [table.orderId, table.stateCode], foreignColumns: [orders.id, orders.destinationStateCode], name: "order_shipping_addresses_order_state_fk" }).onDelete("cascade"),
  check("order_shipping_addresses_country_us", sql`${table.country} = 'US'`),
  check("order_shipping_addresses_state_format", stateCode(table.stateCode)),
  check("order_shipping_addresses_postal_format", sql`${table.postalCode} ~ '^[0-9]{5}(-[0-9]{4})?$'`),
  check(
    "order_shipping_addresses_field_lengths",
    sql`char_length(${table.recipientName}) between 1 and 120
        and char_length(${table.addressLine1}) between 1 and 120
        and (${table.addressLine2} is null or char_length(${table.addressLine2}) between 1 and 120)
        and char_length(${table.city}) between 1 and 100`,
  ),
  check(
    "order_shipping_addresses_fields_nonblank",
    sql`${nonblank(table.recipientName)} and ${nonblank(table.addressLine1)}
        and (${table.addressLine2} is null or ${nonblank(table.addressLine2)})
        and ${nonblank(table.city)}`,
  ),
  check(
    "order_shipping_addresses_no_control_characters",
    sql`${table.recipientName} !~ '[[:cntrl:]]'
        and ${table.addressLine1} !~ '[[:cntrl:]]'
        and (${table.addressLine2} is null or ${table.addressLine2} !~ '[[:cntrl:]]')
        and ${table.city} !~ '[[:cntrl:]]'
        and ${table.stateCode} !~ '[[:cntrl:]]'
        and ${table.postalCode} !~ '[[:cntrl:]]'
        and ${table.country} !~ '[[:cntrl:]]'`,
  ),
]);
