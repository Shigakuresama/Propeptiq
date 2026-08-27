CREATE TYPE "public"."buyer_status" AS ENUM('active', 'review', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."checkout_attempt_status" AS ENUM('created', 'open', 'completed', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."checkout_gate_result" AS ENUM('pass', 'review', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."destination_result" AS ENUM('allowed', 'review', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."destination_scope_kind" AS ENUM('product', 'policy_group');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_release_state" AS ENUM('issued', 'revoked', 'expired', 'consumed');--> statement-breakpoint
CREATE TYPE "public"."inventory_event_type" AS ENUM('receipt', 'reservation', 'release', 'consume', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."lot_status" AS ENUM('draft', 'quarantined', 'released', 'exhausted', 'recalled');--> statement-breakpoint
CREATE TYPE "public"."order_state" AS ENUM('draft', 'eligibility_review', 'compliance_hold', 'ready_for_checkout', 'checkout_pending', 'payment_failed', 'paid_pending_clearance', 'paid_on_hold', 'ready_for_fulfillment', 'fulfillment_in_progress', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_event_type" AS ENUM('payment_verified', 'payment_failed', 'refund_verified', 'dispute_recorded');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."promotion_kind" AS ENUM('discount', 'bundle', 'subscription', 'loyalty', 'cross_sell');--> statement-breakpoint
CREATE TYPE "public"."promotion_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."promotion_target_kind" AS ENUM('product', 'policy_group');--> statement-breakpoint
CREATE TYPE "public"."provider_event_status" AS ENUM('pending', 'processing', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('requested', 'submitted', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."research_purpose" AS ENUM('in_vitro', 'analytical', 'educational', 'other_laboratory');--> statement-breakpoint
CREATE TYPE "public"."reservation_state" AS ENUM('active', 'released', 'consumed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."review_outcome" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."shipment_state" AS ENUM('pending', 'handed_off', 'delivered', 'exception');--> statement-breakpoint
CREATE TABLE "attestation_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"attestation_version_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attestation_acceptances_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "attestation_acceptances_user_version_unique" UNIQUE("user_id","attestation_version_id")
);
--> statement-breakpoint
CREATE TABLE "attestation_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"policy_text" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attestation_versions_version_unique" UNIQUE("version"),
	CONSTRAINT "attestation_versions_hash_unique" UNIQUE("content_hash"),
	CONSTRAINT "attestation_versions_version_positive" CHECK ("attestation_versions"."version" > 0),
	CONSTRAINT "attestation_versions_hash_sha256" CHECK ("attestation_versions"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "attestation_versions_policy_nonblank" CHECK (length(btrim("attestation_versions"."policy_text")) > 0),
	CONSTRAINT "attestation_versions_time_coherent" CHECK ("attestation_versions"."superseded_at" is null or "attestation_versions"."superseded_at" > "attestation_versions"."effective_at")
);
--> statement-breakpoint
CREATE TABLE "buyer_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"status" "buyer_status" NOT NULL,
	"age_confirmed_at" timestamp with time zone,
	"research_purpose" "research_purpose",
	"organization_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buyer_profiles_active_complete" CHECK ("buyer_profiles"."status" <> 'active' or ("buyer_profiles"."age_confirmed_at" is not null and "buyer_profiles"."research_purpose" is not null)),
	CONSTRAINT "buyer_profiles_organization_nonblank" CHECK ("buyer_profiles"."organization_name" is null or length(btrim("buyer_profiles"."organization_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "staff_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"granted_by_user_id" uuid,
	"grant_correlation_id" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_by_user_id" uuid,
	"revoke_correlation_id" text,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "staff_roles_capability_nonblank" CHECK (length(btrim("staff_roles"."capability")) > 0),
	CONSTRAINT "staff_roles_grant_correlation_nonblank" CHECK (length(btrim("staff_roles"."grant_correlation_id")) > 0),
	CONSTRAINT "staff_roles_revoke_coherent" CHECK (("staff_roles"."revoked_at" is null and "staff_roles"."revoked_by_user_id" is null and "staff_roles"."revoke_correlation_id" is null)
          or ("staff_roles"."revoked_at" is not null and "staff_roles"."revoked_by_user_id" is not null and "staff_roles"."revoke_correlation_id" is not null and length(btrim("staff_roles"."revoke_correlation_id")) > 0))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "users_clerk_id_nonblank" CHECK (length(btrim("users"."clerk_id")) > 0)
);
--> statement-breakpoint
CREATE TABLE "coa_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"evidence_hash" text NOT NULL,
	"storage_key" text NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"issued_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coa_documents_lot_hash_unique" UNIQUE("lot_id","evidence_hash"),
	CONSTRAINT "coa_documents_hash_sha256" CHECK ("coa_documents"."evidence_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "coa_documents_storage_key_nonblank" CHECK (length(btrim("coa_documents"."storage_key")) > 0)
);
--> statement-breakpoint
CREATE TABLE "destination_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope_kind" "destination_scope_kind" NOT NULL,
	"product_id" uuid,
	"policy_group_id" uuid,
	"state_code" text NOT NULL,
	"result" "destination_result" NOT NULL,
	"version" integer NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "destination_policies_target_scope_coherent" CHECK (("destination_policies"."scope_kind" = 'product' and "destination_policies"."product_id" is not null and "destination_policies"."policy_group_id" is null)
          or ("destination_policies"."scope_kind" = 'policy_group' and "destination_policies"."product_id" is null and "destination_policies"."policy_group_id" is not null)),
	CONSTRAINT "destination_policies_state_code" CHECK ("destination_policies"."state_code" in (
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
)),
	CONSTRAINT "destination_policies_version_positive" CHECK ("destination_policies"."version" > 0),
	CONSTRAINT "destination_policies_active_not_superseded" CHECK ("destination_policies"."active" = false or "destination_policies"."superseded_at" is null),
	CONSTRAINT "destination_policies_time_coherent" CHECK ("destination_policies"."superseded_at" is null or "destination_policies"."superseded_at" > "destination_policies"."effective_at")
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_name" text NOT NULL,
	"supplier_lot_code" text NOT NULL,
	"received_quantity" integer NOT NULL,
	"available_quantity" integer NOT NULL,
	"status" "lot_status" DEFAULT 'draft' NOT NULL,
	"manufactured_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lots_id_product_unique" UNIQUE("id","product_id"),
	CONSTRAINT "lots_product_supplier_code_unique" UNIQUE("product_id","supplier_name","supplier_lot_code"),
	CONSTRAINT "lots_supplier_nonblank" CHECK (length(btrim("lots"."supplier_name")) > 0),
	CONSTRAINT "lots_supplier_code_nonblank" CHECK (length(btrim("lots"."supplier_lot_code")) > 0),
	CONSTRAINT "lots_quantity_bounds" CHECK ("lots"."received_quantity" > 0 and "lots"."available_quantity" >= 0 and "lots"."available_quantity" <= "lots"."received_quantity"),
	CONSTRAINT "lots_expiry_after_manufacture" CHECK ("lots"."manufactured_at" is null or "lots"."expires_at" is null or "lots"."expires_at" > "lots"."manufactured_at")
);
--> statement-breakpoint
CREATE TABLE "product_policy_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_policy_groups_slug_unique" UNIQUE("slug"),
	CONSTRAINT "product_policy_groups_slug_nonblank" CHECK (length(btrim("product_policy_groups"."slug")) > 0),
	CONSTRAINT "product_policy_groups_name_nonblank" CHECK (length(btrim("product_policy_groups"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "product_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_prices_id_product_unique" UNIQUE("id","product_id"),
	CONSTRAINT "product_prices_product_version_unique" UNIQUE("product_id","version"),
	CONSTRAINT "product_prices_version_positive" CHECK ("product_prices"."version" > 0),
	CONSTRAINT "product_prices_amount_positive_safe" CHECK ("product_prices"."amount_minor" between 1 and 9007199254740991),
	CONSTRAINT "product_prices_currency_format" CHECK ("product_prices"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "product_prices_time_coherent" CHECK ("product_prices"."superseded_at" is null or "product_prices"."superseded_at" > "product_prices"."effective_at")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"package_form" text NOT NULL,
	"policy_group_id" uuid NOT NULL,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_slug_nonblank" CHECK (length(btrim("products"."slug")) > 0),
	CONSTRAINT "products_name_nonblank" CHECK (length(btrim("products"."name")) > 0),
	CONSTRAINT "products_package_form_nonblank" CHECK (length(btrim("products"."package_form")) > 0)
);
--> statement-breakpoint
CREATE TABLE "promotion_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promotion_id" uuid NOT NULL,
	"target_kind" "promotion_target_kind" NOT NULL,
	"product_id" uuid,
	"policy_group_id" uuid,
	CONSTRAINT "promotion_targets_target_scope_coherent" CHECK (("promotion_targets"."target_kind" = 'product' and "promotion_targets"."product_id" is not null and "promotion_targets"."policy_group_id" is null)
          or ("promotion_targets"."target_kind" = 'policy_group' and "promotion_targets"."product_id" is null and "promotion_targets"."policy_group_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "promotion_kind" NOT NULL,
	"status" "promotion_status" DEFAULT 'draft' NOT NULL,
	"amount_minor" bigint,
	"basis_points" integer,
	"currency" text,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_code_unique" UNIQUE("code"),
	CONSTRAINT "promotions_code_nonblank" CHECK (length(btrim("promotions"."code")) > 0),
	CONSTRAINT "promotions_name_nonblank" CHECK (length(btrim("promotions"."name")) > 0),
	CONSTRAINT "promotions_discount_shape" CHECK (("promotions"."amount_minor" is null or "promotions"."amount_minor" between 1 and 9007199254740991)
          and ("promotions"."basis_points" is null or "promotions"."basis_points" between 1 and 10000)
          and not ("promotions"."amount_minor" is not null and "promotions"."basis_points" is not null)
          and (("promotions"."amount_minor" is null and "promotions"."currency" is null) or ("promotions"."amount_minor" is not null and "promotions"."currency" is not null and "promotions"."currency" ~ '^[A-Z]{3}$'))),
	CONSTRAINT "promotions_time_coherent" CHECK ("promotions"."starts_at" is null or "promotions"."ends_at" is null or "promotions"."ends_at" > "promotions"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "checkout_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" "checkout_attempt_status" DEFAULT 'created' NOT NULL,
	"account_gate" "checkout_gate_result" NOT NULL,
	"attestation_gate" "checkout_gate_result" NOT NULL,
	"product_gate" "checkout_gate_result" NOT NULL,
	"destination_gate" "checkout_gate_result" NOT NULL,
	"inventory_gate" "checkout_gate_result" NOT NULL,
	"payment_provider_gate" "checkout_gate_result" NOT NULL,
	"permitted" boolean NOT NULL,
	"review_required" boolean NOT NULL,
	"reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"tax_ready" boolean NOT NULL,
	"shipping_ready" boolean NOT NULL,
	"provider" text,
	"provider_request_id" text,
	"provider_session_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "checkout_attempts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "checkout_attempts_request_hash_unique" UNIQUE("request_hash"),
	CONSTRAINT "checkout_attempts_provider_request_unique" UNIQUE("provider","provider_request_id"),
	CONSTRAINT "checkout_attempts_provider_session_unique" UNIQUE("provider","provider_session_id"),
	CONSTRAINT "checkout_attempts_idempotency_nonblank" CHECK (length(btrim("checkout_attempts"."idempotency_key")) > 0),
	CONSTRAINT "checkout_attempts_request_hash" CHECK ("checkout_attempts"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "checkout_attempts_provider_coherent" CHECK (("checkout_attempts"."provider" is null and "checkout_attempts"."provider_request_id" is null and "checkout_attempts"."provider_session_id" is null)
          or ("checkout_attempts"."provider" is not null and length(btrim("checkout_attempts"."provider")) > 0 and ("checkout_attempts"."provider_request_id" is not null or "checkout_attempts"."provider_session_id" is not null))),
	CONSTRAINT "checkout_attempts_permitted_coherent" CHECK ("checkout_attempts"."permitted" = false or (
        "checkout_attempts"."account_gate" = 'pass' and "checkout_attempts"."attestation_gate" = 'pass'
        and "checkout_attempts"."product_gate" = 'pass' and "checkout_attempts"."destination_gate" = 'pass'
        and "checkout_attempts"."inventory_gate" = 'pass' and "checkout_attempts"."payment_provider_gate" = 'pass'
        and "checkout_attempts"."review_required" = false and "checkout_attempts"."tax_ready" = true and "checkout_attempts"."shipping_ready" = true
      ))
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_price_id" uuid NOT NULL,
	"destination_policy_id" uuid NOT NULL,
	"product_name_snapshot" text NOT NULL,
	"package_form_snapshot" text NOT NULL,
	"currency" text NOT NULL,
	"unit_amount_minor" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"discount_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_id_order_product_unique" UNIQUE("id","order_id","product_id"),
	CONSTRAINT "order_items_name_nonblank" CHECK (length(btrim("order_items"."product_name_snapshot")) > 0),
	CONSTRAINT "order_items_package_nonblank" CHECK (length(btrim("order_items"."package_form_snapshot")) > 0),
	CONSTRAINT "order_items_currency_format" CHECK ("order_items"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_money_safe" CHECK ("order_items"."unit_amount_minor" between 0 and 9007199254740991 and "order_items"."subtotal_minor" between 0 and 9007199254740991
          and "order_items"."discount_minor" between 0 and 9007199254740991 and "order_items"."total_minor" between 0 and 9007199254740991),
	CONSTRAINT "order_items_totals_coherent" CHECK ("order_items"."subtotal_minor" = "order_items"."unit_amount_minor" * "order_items"."quantity"
          and "order_items"."discount_minor" <= "order_items"."subtotal_minor"
          and "order_items"."total_minor" = "order_items"."subtotal_minor" - "order_items"."discount_minor")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_user_id" uuid NOT NULL,
	"buyer_status_snapshot" "buyer_status" NOT NULL,
	"attestation_acceptance_id" uuid NOT NULL,
	"destination_state_code" text NOT NULL,
	"currency" text NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"discount_minor" bigint NOT NULL,
	"tax_minor" bigint NOT NULL,
	"shipping_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"state" "order_state" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_id_buyer_unique" UNIQUE("id","buyer_user_id"),
	CONSTRAINT "orders_destination_state_code" CHECK ("orders"."destination_state_code" in (
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
)),
	CONSTRAINT "orders_currency_format" CHECK ("orders"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "orders_money_safe" CHECK ("orders"."subtotal_minor" between 0 and 9007199254740991 and "orders"."discount_minor" between 0 and 9007199254740991
          and "orders"."tax_minor" between 0 and 9007199254740991 and "orders"."shipping_minor" between 0 and 9007199254740991
          and "orders"."total_minor" between 0 and 9007199254740991),
	CONSTRAINT "orders_totals_coherent" CHECK ("orders"."discount_minor" <= "orders"."subtotal_minor"
          and "orders"."total_minor" = "orders"."subtotal_minor" - "orders"."discount_minor" + "orders"."tax_minor" + "orders"."shipping_minor")
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_event_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"event_type" "payment_event_type" NOT NULL,
	"provider_payment_id" text,
	"idempotency_key" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_id_order_unique" UNIQUE("id","order_id"),
	CONSTRAINT "payment_events_provider_event_unique" UNIQUE("provider_event_id"),
	CONSTRAINT "payment_events_idempotency_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payment_events_idempotency_nonblank" CHECK (length(btrim("payment_events"."idempotency_key")) > 0),
	CONSTRAINT "payment_events_provider_payment_nonblank" CHECK ("payment_events"."provider_payment_id" is null or length(btrim("payment_events"."provider_payment_id")) > 0),
	CONSTRAINT "payment_events_amount_safe" CHECK ("payment_events"."amount_minor" between 0 and 9007199254740991),
	CONSTRAINT "payment_events_currency_format" CHECK ("payment_events"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE TABLE "provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"status" "provider_event_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"last_error_redacted" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "provider_events_id_provider_unique" UNIQUE("id","provider"),
	CONSTRAINT "provider_events_delivery_unique" UNIQUE("provider","provider_event_id"),
	CONSTRAINT "provider_events_provider_nonblank" CHECK (length(btrim("provider_events"."provider")) > 0),
	CONSTRAINT "provider_events_id_nonblank" CHECK (length(btrim("provider_events"."provider_event_id")) > 0),
	CONSTRAINT "provider_events_payload_hash" CHECK ("provider_events"."payload_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "provider_events_attempt_nonnegative" CHECK ("provider_events"."attempt_count" >= 0),
	CONSTRAINT "provider_events_error_nonblank" CHECK ("provider_events"."last_error_redacted" is null or length(btrim("provider_events"."last_error_redacted")) > 0),
	CONSTRAINT "provider_events_lease_pair" CHECK (("provider_events"."lease_token" is null) = ("provider_events"."lease_expires_at" is null)),
	CONSTRAINT "provider_events_lease_token_nonblank" CHECK ("provider_events"."lease_token" is null or length(btrim("provider_events"."lease_token")) > 0),
	CONSTRAINT "provider_events_status_coherent" CHECK (("provider_events"."status" = 'pending'
            and "provider_events"."lease_token" is null and "provider_events"."processed_at" is null)
          or ("provider_events"."status" = 'processing'
            and "provider_events"."lease_token" is not null and "provider_events"."lease_expires_at" > "provider_events"."received_at"
            and "provider_events"."processed_at" is null and "provider_events"."attempt_count" >= 1)
          or ("provider_events"."status" = 'processed'
            and "provider_events"."lease_token" is null and "provider_events"."processed_at" is not null
            and "provider_events"."last_error_redacted" is null and "provider_events"."attempt_count" >= 1)
          or ("provider_events"."status" = 'failed'
            and "provider_events"."lease_token" is null and "provider_events"."processed_at" is null
            and "provider_events"."last_error_redacted" is not null and length(btrim("provider_events"."last_error_redacted")) > 0
            and "provider_events"."attempt_count" >= 1))
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" uuid,
	"provider_refund_id" text,
	"idempotency_key" text NOT NULL,
	"requested_amount_minor" bigint NOT NULL,
	"confirmed_amount_minor" bigint,
	"currency" text NOT NULL,
	"status" "refund_status" DEFAULT 'requested' NOT NULL,
	"reason_redacted" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "refunds_idempotency_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "refunds_provider_event_unique" UNIQUE("provider_event_id"),
	CONSTRAINT "refunds_provider_nonblank" CHECK (length(btrim("refunds"."provider")) > 0),
	CONSTRAINT "refunds_idempotency_nonblank" CHECK (length(btrim("refunds"."idempotency_key")) > 0),
	CONSTRAINT "refunds_provider_refund_nonblank" CHECK ("refunds"."provider_refund_id" is null or length(btrim("refunds"."provider_refund_id")) > 0),
	CONSTRAINT "refunds_requested_amount_positive" CHECK ("refunds"."requested_amount_minor" between 1 and 9007199254740991),
	CONSTRAINT "refunds_confirmed_amount_bounds" CHECK ("refunds"."confirmed_amount_minor" is null or ("refunds"."confirmed_amount_minor" between 1 and 9007199254740991 and "refunds"."confirmed_amount_minor" <= "refunds"."requested_amount_minor")),
	CONSTRAINT "refunds_currency_format" CHECK ("refunds"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "refunds_confirmation_coherent" CHECK (("refunds"."status" = 'succeeded' and "refunds"."confirmed_amount_minor" is not null
            and "refunds"."provider_event_id" is not null and "refunds"."provider_refund_id" is not null
            and "refunds"."confirmed_at" is not null)
          or ("refunds"."status" <> 'succeeded' and "refunds"."confirmed_amount_minor" is null and "refunds"."confirmed_at" is null))
);
--> statement-breakpoint
CREATE TABLE "fulfillment_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"payment_event_id" uuid NOT NULL,
	"review_request_id" uuid,
	"state" "fulfillment_release_state" NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "fulfillment_releases_id_order_unique" UNIQUE("id","order_id"),
	CONSTRAINT "fulfillment_releases_order_version_unique" UNIQUE("order_id","version"),
	CONSTRAINT "fulfillment_releases_idempotency_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "fulfillment_releases_version_positive" CHECK ("fulfillment_releases"."version" > 0),
	CONSTRAINT "fulfillment_releases_idempotency_nonblank" CHECK (length(btrim("fulfillment_releases"."idempotency_key")) > 0),
	CONSTRAINT "fulfillment_releases_expiry_after_issue" CHECK ("fulfillment_releases"."expires_at" > "fulfillment_releases"."issued_at"),
	CONSTRAINT "fulfillment_releases_state_coherent" CHECK (("fulfillment_releases"."state" = 'issued' and "fulfillment_releases"."revoked_at" is null and "fulfillment_releases"."expired_at" is null and "fulfillment_releases"."consumed_at" is null)
          or ("fulfillment_releases"."state" = 'revoked' and "fulfillment_releases"."revoked_at" is not null and "fulfillment_releases"."expired_at" is null and "fulfillment_releases"."consumed_at" is null)
          or ("fulfillment_releases"."state" = 'expired' and "fulfillment_releases"."revoked_at" is null and "fulfillment_releases"."expired_at" is not null and "fulfillment_releases"."consumed_at" is null)
          or ("fulfillment_releases"."state" = 'consumed' and "fulfillment_releases"."revoked_at" is null and "fulfillment_releases"."expired_at" is null and "fulfillment_releases"."consumed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "inventory_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"event_type" "inventory_event_type" NOT NULL,
	"lot_id" uuid NOT NULL,
	"order_id" uuid,
	"order_item_id" uuid,
	"reservation_id" uuid,
	"fulfillment_release_id" uuid,
	"quantity" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_events_idempotency_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "inventory_events_idempotency_nonblank" CHECK (length(btrim("inventory_events"."idempotency_key")) > 0),
	CONSTRAINT "inventory_events_quantity_positive" CHECK ("inventory_events"."quantity" > 0),
	CONSTRAINT "inventory_events_balance_nonnegative" CHECK ("inventory_events"."balance_after" >= 0),
	CONSTRAINT "inventory_events_reservation_context" CHECK ("inventory_events"."reservation_id" is null or ("inventory_events"."order_id" is not null and "inventory_events"."order_item_id" is not null)),
	CONSTRAINT "inventory_events_consume_release" CHECK ("inventory_events"."event_type" <> 'consume' or ("inventory_events"."fulfillment_release_id" is not null and "inventory_events"."order_id" is not null and "inventory_events"."order_item_id" is not null and "inventory_events"."reservation_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"quantity_reserved" integer NOT NULL,
	"quantity_remaining" integer NOT NULL,
	"state" "reservation_state" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_reservations_event_identity_unique" UNIQUE("id","order_id","order_item_id","lot_id"),
	CONSTRAINT "inventory_reservations_idempotency_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "inventory_reservations_idempotency_nonblank" CHECK (length(btrim("inventory_reservations"."idempotency_key")) > 0),
	CONSTRAINT "inventory_reservations_quantity_bounds" CHECK ("inventory_reservations"."quantity_reserved" > 0 and "inventory_reservations"."quantity_remaining" >= 0 and "inventory_reservations"."quantity_remaining" <= "inventory_reservations"."quantity_reserved")
);
--> statement-breakpoint
CREATE TABLE "review_request_destination_policies" (
	"review_request_id" uuid NOT NULL,
	"destination_policy_id" uuid NOT NULL,
	"covered" boolean DEFAULT false NOT NULL,
	CONSTRAINT "review_request_destination_policies_pk" PRIMARY KEY("review_request_id","destination_policy_id")
);
--> statement-breakpoint
CREATE TABLE "review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"snapshot_hash" text NOT NULL,
	"buyer_status_snapshot" "buyer_status" NOT NULL,
	"attestation_version_id" uuid NOT NULL,
	"destination_state_code" text NOT NULL,
	"cart_snapshot" jsonb NOT NULL,
	"buyer_review_required" boolean NOT NULL,
	"destination_review_required" boolean NOT NULL,
	"outcome" "review_outcome",
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"covers_buyer_review" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_requests_id_order_unique" UNIQUE("id","order_id"),
	CONSTRAINT "review_requests_snapshot_hash_unique" UNIQUE("snapshot_hash"),
	CONSTRAINT "review_requests_snapshot_hash" CHECK ("review_requests"."snapshot_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "review_requests_destination_state" CHECK ("review_requests"."destination_state_code" in (
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
)),
	CONSTRAINT "review_requests_explicit_reason" CHECK ("review_requests"."buyer_review_required" = true or "review_requests"."destination_review_required" = true),
	CONSTRAINT "review_requests_decision_coherent" CHECK (("review_requests"."outcome" is null and "review_requests"."decided_by_user_id" is null and "review_requests"."decided_at" is null
            and "review_requests"."covers_buyer_review" is null)
          or ("review_requests"."outcome" is not null and "review_requests"."decided_by_user_id" is not null and "review_requests"."decided_at" is not null
            and "review_requests"."covers_buyer_review" is not null))
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"fulfillment_release_id" uuid NOT NULL,
	"carrier" text NOT NULL,
	"tracking_reference" text NOT NULL,
	"state" "shipment_state" DEFAULT 'pending' NOT NULL,
	"handed_off_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_fulfillment_release_unique" UNIQUE("fulfillment_release_id"),
	CONSTRAINT "shipments_carrier_tracking_unique" UNIQUE("carrier","tracking_reference"),
	CONSTRAINT "shipments_carrier_nonblank" CHECK (length(btrim("shipments"."carrier")) > 0),
	CONSTRAINT "shipments_tracking_nonblank" CHECK (length(btrim("shipments"."tracking_reference")) > 0),
	CONSTRAINT "shipments_state_coherent" CHECK (("shipments"."state" = 'pending' and "shipments"."handed_off_at" is null and "shipments"."delivered_at" is null)
          or ("shipments"."state" in ('handed_off', 'exception') and "shipments"."handed_off_at" is not null and "shipments"."delivered_at" is null)
          or ("shipments"."state" = 'delivered' and "shipments"."handed_off_at" is not null and "shipments"."delivered_at" is not null and "shipments"."delivered_at" >= "shipments"."handed_off_at"))
);
--> statement-breakpoint
CREATE TABLE "admin_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"service_identity" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"correlation_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_audit_actor_xor_service" CHECK (("admin_audit"."actor_user_id" is not null) <> ("admin_audit"."service_identity" is not null)),
	CONSTRAINT "admin_audit_service_nonblank" CHECK ("admin_audit"."service_identity" is null or length(btrim("admin_audit"."service_identity")) > 0),
	CONSTRAINT "admin_audit_action_nonblank" CHECK (length(btrim("admin_audit"."action")) > 0),
	CONSTRAINT "admin_audit_resource_type_nonblank" CHECK (length(btrim("admin_audit"."resource_type")) > 0),
	CONSTRAINT "admin_audit_resource_id_nonblank" CHECK (length(btrim("admin_audit"."resource_id")) > 0),
	CONSTRAINT "admin_audit_correlation_nonblank" CHECK (length(btrim("admin_audit"."correlation_id")) > 0)
);
--> statement-breakpoint
ALTER TABLE "attestation_acceptances" ADD CONSTRAINT "attestation_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestation_acceptances" ADD CONSTRAINT "attestation_acceptances_attestation_version_id_attestation_versions_id_fk" FOREIGN KEY ("attestation_version_id") REFERENCES "public"."attestation_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_profiles" ADD CONSTRAINT "buyer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coa_documents" ADD CONSTRAINT "coa_documents_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination_policies" ADD CONSTRAINT "destination_policies_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "destination_policies" ADD CONSTRAINT "destination_policies_policy_group_id_product_policy_groups_id_fk" FOREIGN KEY ("policy_group_id") REFERENCES "public"."product_policy_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_policy_group_id_product_policy_groups_id_fk" FOREIGN KEY ("policy_group_id") REFERENCES "public"."product_policy_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_targets" ADD CONSTRAINT "promotion_targets_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_targets" ADD CONSTRAINT "promotion_targets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_targets" ADD CONSTRAINT "promotion_targets_policy_group_id_product_policy_groups_id_fk" FOREIGN KEY ("policy_group_id") REFERENCES "public"."product_policy_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD CONSTRAINT "checkout_attempts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_destination_policy_id_destination_policies_id_fk" FOREIGN KEY ("destination_policy_id") REFERENCES "public"."destination_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_price_product_fk" FOREIGN KEY ("product_price_id","product_id") REFERENCES "public"."product_prices"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_attestation_acceptance_buyer_fk" FOREIGN KEY ("attestation_acceptance_id","buyer_user_id") REFERENCES "public"."attestation_acceptances"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_provider_event_id_provider_events_id_fk" FOREIGN KEY ("provider_event_id") REFERENCES "public"."provider_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_provider_event_provider_fk" FOREIGN KEY ("provider_event_id","provider") REFERENCES "public"."provider_events"("id","provider") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_releases" ADD CONSTRAINT "fulfillment_releases_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_releases" ADD CONSTRAINT "fulfillment_releases_payment_order_fk" FOREIGN KEY ("payment_event_id","order_id") REFERENCES "public"."payment_events"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_releases" ADD CONSTRAINT "fulfillment_releases_review_order_fk" FOREIGN KEY ("review_request_id","order_id") REFERENCES "public"."review_requests"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_reservation_line_lot_fk" FOREIGN KEY ("reservation_id","order_id","order_item_id","lot_id") REFERENCES "public"."inventory_reservations"("id","order_id","order_item_id","lot_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_events" ADD CONSTRAINT "inventory_events_release_order_fk" FOREIGN KEY ("fulfillment_release_id","order_id") REFERENCES "public"."fulfillment_releases"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_item_order_product_fk" FOREIGN KEY ("order_item_id","order_id","product_id") REFERENCES "public"."order_items"("id","order_id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_lot_product_fk" FOREIGN KEY ("lot_id","product_id") REFERENCES "public"."lots"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_request_destination_policies" ADD CONSTRAINT "review_request_destination_policies_review_request_id_review_requests_id_fk" FOREIGN KEY ("review_request_id") REFERENCES "public"."review_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_request_destination_policies" ADD CONSTRAINT "review_request_destination_policies_destination_policy_id_destination_policies_id_fk" FOREIGN KEY ("destination_policy_id") REFERENCES "public"."destination_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_attestation_version_id_attestation_versions_id_fk" FOREIGN KEY ("attestation_version_id") REFERENCES "public"."attestation_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_order_buyer_fk" FOREIGN KEY ("order_id","user_id") REFERENCES "public"."orders"("id","buyer_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_release_order_fk" FOREIGN KEY ("fulfillment_release_id","order_id") REFERENCES "public"."fulfillment_releases"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit" ADD CONSTRAINT "admin_audit_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_roles_active_user_capability_unique" ON "staff_roles" USING btree ("user_id","capability") WHERE "staff_roles"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "coa_documents_lot_active_idx" ON "coa_documents" USING btree ("lot_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "destination_policies_product_version_unique" ON "destination_policies" USING btree ("product_id","state_code","version") WHERE "destination_policies"."product_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "destination_policies_group_version_unique" ON "destination_policies" USING btree ("policy_group_id","state_code","version") WHERE "destination_policies"."policy_group_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "destination_policies_active_product_state_unique" ON "destination_policies" USING btree ("product_id","state_code") WHERE "destination_policies"."active" = true and "destination_policies"."product_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "destination_policies_active_group_state_unique" ON "destination_policies" USING btree ("policy_group_id","state_code") WHERE "destination_policies"."active" = true and "destination_policies"."policy_group_id" is not null;--> statement-breakpoint
CREATE INDEX "lots_product_status_idx" ON "lots" USING btree ("product_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "product_prices_active_product_currency_unique" ON "product_prices" USING btree ("product_id","currency") WHERE "product_prices"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "products_policy_group_status_idx" ON "products" USING btree ("policy_group_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_targets_product_unique" ON "promotion_targets" USING btree ("promotion_id","product_id") WHERE "promotion_targets"."product_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_targets_group_unique" ON "promotion_targets" USING btree ("promotion_id","policy_group_id") WHERE "promotion_targets"."policy_group_id" is not null;--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_buyer_created_idx" ON "orders" USING btree ("buyer_user_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_events_order_occurred_idx" ON "payment_events" USING btree ("order_id","occurred_at");--> statement-breakpoint
CREATE INDEX "provider_events_status_lease_idx" ON "provider_events" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_provider_refund_unique" ON "refunds" USING btree ("provider","provider_refund_id") WHERE "refunds"."provider_refund_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_releases_current_issued_unique" ON "fulfillment_releases" USING btree ("order_id") WHERE "fulfillment_releases"."state" = 'issued';--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_releases_consumed_order_unique" ON "fulfillment_releases" USING btree ("order_id") WHERE "fulfillment_releases"."state" = 'consumed';--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_events_reservation_consume_unique" ON "inventory_events" USING btree ("reservation_id") WHERE "inventory_events"."event_type" = 'consume' and "inventory_events"."reservation_id" is not null;--> statement-breakpoint
CREATE INDEX "inventory_events_lot_occurred_idx" ON "inventory_events" USING btree ("lot_id","occurred_at");--> statement-breakpoint
CREATE INDEX "inventory_reservations_lot_state_idx" ON "inventory_reservations" USING btree ("lot_id","state");--> statement-breakpoint
CREATE INDEX "admin_audit_resource_occurred_idx" ON "admin_audit" USING btree ("resource_type","resource_id","occurred_at");