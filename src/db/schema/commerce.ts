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
  uuid,
} from "drizzle-orm/pg-core";

import { destinationPolicies, productPrices, products } from "./catalog";
import {
  buyerStatusEnum,
  checkoutAttemptStatusEnum,
  checkoutGateResultEnum,
  orderStateEnum,
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
    attestationAcceptanceId: uuid("attestation_acceptance_id")
      .notNull()
      .references(() => attestationAcceptances.id, { onDelete: "restrict" }),
    destinationStateCode: text("destination_state_code").notNull(),
    buyerSnapshotHash: text("buyer_snapshot_hash").notNull(),
    destinationSnapshotHash: text("destination_snapshot_hash").notNull(),
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
    check("orders_destination_state_code", stateCode(table.destinationStateCode)),
    check("orders_buyer_snapshot_hash", sha256(table.buyerSnapshotHash)),
    check("orders_destination_snapshot_hash", sha256(table.destinationSnapshotHash)),
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
    productPriceId: uuid("product_price_id")
      .notNull()
      .references(() => productPrices.id, { onDelete: "restrict" }),
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
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
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
    reasons: jsonb("reasons").default([]).notNull(),
    taxReady: boolean("tax_ready").notNull(),
    shippingReady: boolean("shipping_ready").notNull(),
    provider: text("provider"),
    providerRequestId: text("provider_request_id"),
    providerSessionId: text("provider_session_id"),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    unique("checkout_attempts_idempotency_key_unique").on(table.idempotencyKey),
    unique("checkout_attempts_request_hash_unique").on(table.requestHash),
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
      "checkout_attempts_provider_coherent",
      sql`(${table.provider} is null and ${table.providerRequestId} is null and ${table.providerSessionId} is null)
          or (${table.provider} is not null and ${nonblank(table.provider)} and (${table.providerRequestId} is not null or ${table.providerSessionId} is not null))`,
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
