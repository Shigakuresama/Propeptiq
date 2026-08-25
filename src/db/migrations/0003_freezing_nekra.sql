DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL AND EXISTS (SELECT 1 FROM public.orders LIMIT 1) THEN
    RAISE EXCEPTION '0003 preflight refused: populated orders require authorized reconciliation';
  END IF;
  IF to_regclass('public.provider_events') IS NOT NULL AND EXISTS (SELECT 1 FROM public.provider_events LIMIT 1) THEN
    RAISE EXCEPTION '0003 preflight refused: populated provider_events require authorized reconciliation';
  END IF;
END $$;--> statement-breakpoint
CREATE TYPE "public"."refund_origin" AS ENUM('staff_requested', 'provider_observed');--> statement-breakpoint
ALTER TYPE "public"."checkout_attempt_status" ADD VALUE 'provider_unknown' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."payment_event_type" ADD VALUE 'dispute_resolved';--> statement-breakpoint
ALTER TYPE "public"."payment_event_type" ADD VALUE 'unreconciled_refund_observed';--> statement-breakpoint
ALTER TYPE "public"."provider_event_status" ADD VALUE 'deferred';--> statement-breakpoint
ALTER TYPE "public"."provider_event_status" ADD VALUE 'conflict';--> statement-breakpoint
CREATE TABLE "order_promotion_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"allocated_discount_minor" bigint NOT NULL,
	CONSTRAINT "order_promotion_allocations_application_item_unique" UNIQUE("application_id","order_item_id"),
	CONSTRAINT "order_promotion_allocations_discount_nonnegative" CHECK ("order_promotion_allocations"."allocated_discount_minor" between 0 and 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "order_promotion_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"promotion_id" uuid NOT NULL,
	"promotion_version" integer NOT NULL,
	"code_snapshot" text NOT NULL,
	"name_snapshot" text NOT NULL,
	"kind_snapshot" text NOT NULL,
	"applied_discount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_promotion_applications_id_order_unique" UNIQUE("id","order_id"),
	CONSTRAINT "order_promotion_applications_order_promotion_unique" UNIQUE("order_id","promotion_id"),
	CONSTRAINT "order_promotion_applications_discount_nonnegative" CHECK ("order_promotion_applications"."applied_discount_minor" between 0 and 9007199254740991),
	CONSTRAINT "order_promotion_applications_code_nonblank" CHECK (length(btrim("order_promotion_applications"."code_snapshot")) > 0),
	CONSTRAINT "order_promotion_applications_name_nonblank" CHECK (length(btrim("order_promotion_applications"."name_snapshot")) > 0),
	CONSTRAINT "order_promotion_applications_version_positive" CHECK ("order_promotion_applications"."promotion_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_shipping_addresses" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"recipient_name" text NOT NULL,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text NOT NULL,
	"state_code" text NOT NULL,
	"postal_code" text NOT NULL,
	"country" text DEFAULT 'US' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_shipping_addresses_country_us" CHECK ("order_shipping_addresses"."country" = 'US'),
	CONSTRAINT "order_shipping_addresses_state_format" CHECK ("order_shipping_addresses"."state_code" in (
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'
)),
	CONSTRAINT "order_shipping_addresses_postal_format" CHECK ("order_shipping_addresses"."postal_code" ~ '^[0-9]{5}(-[0-9]{4})?$'),
	CONSTRAINT "order_shipping_addresses_fields_nonblank" CHECK (length(btrim("order_shipping_addresses"."recipient_name")) > 0 and length(btrim("order_shipping_addresses"."address_line1")) > 0 and length(btrim("order_shipping_addresses"."city")) > 0)
);
--> statement-breakpoint
CREATE TABLE "downstream_effects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"provider_event_id" uuid,
	"effect_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"lease_token" text,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"last_error_redacted" text,
	CONSTRAINT "downstream_effects_idempotency_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "downstream_effects_type_nonblank" CHECK (length(btrim("downstream_effects"."effect_type")) > 0),
	CONSTRAINT "downstream_effects_idempotency_nonblank" CHECK (length(btrim("downstream_effects"."idempotency_key")) > 0),
	CONSTRAINT "downstream_effects_payload_object" CHECK (jsonb_typeof("downstream_effects"."payload") = 'object'),
	CONSTRAINT "downstream_effects_status" CHECK ("downstream_effects"."status" in ('pending','processing','processed','failed')),
	CONSTRAINT "downstream_effects_attempt_nonnegative" CHECK ("downstream_effects"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "checkout_attempts" DROP CONSTRAINT "checkout_attempts_idempotency_key_unique";--> statement-breakpoint
ALTER TABLE "checkout_attempts" DROP CONSTRAINT "checkout_attempts_request_hash_unique";--> statement-breakpoint
ALTER TABLE "provider_events" DROP CONSTRAINT "provider_events_status_coherent";--> statement-breakpoint
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_state_coherent";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "state" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "state" SET DEFAULT 'draft'::text;--> statement-breakpoint
DROP TYPE "public"."order_state";--> statement-breakpoint
CREATE TYPE "public"."order_state" AS ENUM('draft', 'eligibility_review', 'compliance_hold', 'ready_for_checkout', 'checkout_pending', 'payment_failed', 'paid_pending_fulfillment', 'paid_on_hold', 'ready_for_fulfillment', 'fulfillment_in_progress', 'fulfilled', 'cancelled');--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "state" SET DEFAULT 'draft'::"public"."order_state";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "state" SET DATA TYPE "public"."order_state" USING "state"::"public"."order_state";--> statement-breakpoint
DROP INDEX "inventory_events_reservation_consume_unique";--> statement-breakpoint
ALTER TABLE "refunds" ALTER COLUMN "requested_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ALTER COLUMN "fulfillment_release_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "buyer_user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "provider_request_hash" text;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "tax_quote_reference" text;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "shipping_quote_reference" text;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "shipping_service" text;--> statement-breakpoint
ALTER TABLE "provider_events" ADD COLUMN "event_type" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_events" ADD COLUMN "schema_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_events" ADD COLUMN "normalized_payload" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_events" ADD COLUMN "provider_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider_events" ADD COLUMN "livemode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "origin" "refund_origin" DEFAULT 'staff_requested' NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "provider_request_hash" text;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "last_error_redacted" text;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD COLUMN "checkout_attempt_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "order_promotion_allocations" ADD CONSTRAINT "order_promotion_allocations_application_order_fk" FOREIGN KEY ("application_id","order_id") REFERENCES "public"."order_promotion_applications"("id","order_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_id_order_unique" UNIQUE("id","order_id");--> statement-breakpoint
ALTER TABLE "order_promotion_allocations" ADD CONSTRAINT "order_promotion_allocations_item_order_fk" FOREIGN KEY ("order_item_id","order_id") REFERENCES "public"."order_items"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_promotion_applications" ADD CONSTRAINT "order_promotion_applications_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_id_version_unique" UNIQUE("id","version");--> statement-breakpoint
ALTER TABLE "order_promotion_applications" ADD CONSTRAINT "order_promotion_applications_promotion_version_fk" FOREIGN KEY ("promotion_id","promotion_version") REFERENCES "public"."promotions"("id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_shipping_addresses" ADD CONSTRAINT "order_shipping_addresses_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_id_destination_state_unique" UNIQUE("id","destination_state_code");--> statement-breakpoint
ALTER TABLE "order_shipping_addresses" ADD CONSTRAINT "order_shipping_addresses_order_state_fk" FOREIGN KEY ("order_id","state_code") REFERENCES "public"."orders"("id","destination_state_code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downstream_effects" ADD CONSTRAINT "downstream_effects_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downstream_effects" ADD CONSTRAINT "downstream_effects_provider_event_id_provider_events_id_fk" FOREIGN KEY ("provider_event_id") REFERENCES "public"."provider_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "downstream_effects_status_lease_idx" ON "downstream_effects" USING btree ("status","lease_expires_at");--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD CONSTRAINT "checkout_attempts_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD CONSTRAINT "checkout_attempts_order_buyer_fk" FOREIGN KEY ("order_id","buyer_user_id") REFERENCES "public"."orders"("id","buyer_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD CONSTRAINT "checkout_attempts_id_order_unique" UNIQUE("id","order_id");--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_attempt_order_fk" FOREIGN KEY ("checkout_attempt_id","order_id") REFERENCES "public"."checkout_attempts"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_events_reservation_terminal_unique" ON "inventory_events" USING btree ("reservation_id") WHERE "inventory_events"."event_type" in ('consume','release') and "inventory_events"."reservation_id" is not null;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD CONSTRAINT "checkout_attempts_buyer_idempotency_unique" UNIQUE("buyer_user_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_item_lot_unique" UNIQUE("order_item_id","lot_id");--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_unique" UNIQUE("order_id");--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_version_positive" CHECK ("promotions"."version" > 0);--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD CONSTRAINT "checkout_attempts_provider_request_hash" CHECK ("checkout_attempts"."provider_request_hash" is null or "checkout_attempts"."provider_request_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_unreconciled_refund_shape" CHECK ("payment_events"."event_type" <> 'unreconciled_refund_observed' or ("payment_events"."provider_payment_id" is not null and "payment_events"."amount_minor" > 0 and "payment_events"."idempotency_key" = 'provider-event:' || "payment_events"."provider_event_id"::text));--> statement-breakpoint
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_schema_version" CHECK ("provider_events"."schema_version" = 1);--> statement-breakpoint
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_normalized_object" CHECK (jsonb_typeof("provider_events"."normalized_payload") = 'object');--> statement-breakpoint
ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_status_coherent" CHECK (("provider_events"."status" = 'pending'
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
            and "provider_events"."attempt_count" >= 1)
          or ("provider_events"."status" = 'deferred'
            and "provider_events"."lease_token" is null and "provider_events"."processed_at" is null
            and "provider_events"."last_error_redacted" is not null and length(btrim("provider_events"."last_error_redacted")) > 0
            and "provider_events"."attempt_count" >= 1)
          or ("provider_events"."status" = 'conflict'
            and "provider_events"."lease_token" is null and "provider_events"."processed_at" is not null
            and "provider_events"."last_error_redacted" is not null and length(btrim("provider_events"."last_error_redacted")) > 0
            and "provider_events"."attempt_count" >= 1));--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_origin_requester" CHECK (("refunds"."origin" = 'staff_requested' and "refunds"."requested_by_user_id" is not null) or ("refunds"."origin" = 'provider_observed' and "refunds"."requested_by_user_id" is null and "refunds"."provider_event_id" is not null and "refunds"."provider_refund_id" is not null and "refunds"."status" <> 'requested'));--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_provider_request_hash" CHECK ("refunds"."provider_request_hash" is null or "refunds"."provider_request_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_state_remaining" CHECK (("inventory_reservations"."state" = 'active' and "inventory_reservations"."quantity_remaining" = "inventory_reservations"."quantity_reserved") or ("inventory_reservations"."state" <> 'active' and "inventory_reservations"."quantity_remaining" = 0));--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_state_coherent" CHECK (("shipments"."state" = 'pending' and "shipments"."fulfillment_release_id" is null and "shipments"."handed_off_at" is null and "shipments"."delivered_at" is null)
          or ("shipments"."state" in ('handed_off', 'exception') and "shipments"."fulfillment_release_id" is not null and "shipments"."handed_off_at" is not null and "shipments"."delivered_at" is null)
          or ("shipments"."state" = 'delivered' and "shipments"."fulfillment_release_id" is not null and "shipments"."handed_off_at" is not null and "shipments"."delivered_at" is not null and "shipments"."delivered_at" >= "shipments"."handed_off_at"));
