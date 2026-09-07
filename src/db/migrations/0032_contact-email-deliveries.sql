CREATE TABLE "contact_email_deliveries" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"request_hash" text NOT NULL,
	"status" text NOT NULL,
	"provider_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "contact_email_deliveries_request_hash_sha256" CHECK ("contact_email_deliveries"."request_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "contact_email_deliveries_status_valid" CHECK ("contact_email_deliveries"."status" in ('pending', 'accepted')),
	CONSTRAINT "contact_email_deliveries_provider_state" CHECK (("contact_email_deliveries"."status" = 'pending' and "contact_email_deliveries"."provider_id" is null)
      or ("contact_email_deliveries"."status" = 'accepted' and "contact_email_deliveries"."provider_id" is not null))
);
--> statement-breakpoint
CREATE INDEX "contact_email_deliveries_updated_idx" ON "contact_email_deliveries" USING btree ("updated_at");