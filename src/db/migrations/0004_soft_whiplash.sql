DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.checkout_attempts
    WHERE provider IS NOT NULL
       OR provider_request_id IS NOT NULL
       OR provider_session_id IS NOT NULL
       OR provider_request_hash IS NOT NULL
       OR expires_at IS NOT NULL
    LIMIT 1
  ) THEN
    RAISE EXCEPTION '0004 preflight refused: provider authority requires authorized replay-fact reconciliation';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "checkout_attempts" DROP CONSTRAINT "checkout_attempts_provider_coherent";--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "provider_customer_email" text;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "provider_origin" text;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "provider_request_schema_version" integer;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "provider_livemode" boolean;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "provider_scope" text;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD CONSTRAINT "checkout_attempts_provider_coherent" CHECK (("checkout_attempts"."provider" is null and "checkout_attempts"."provider_request_id" is null
            and "checkout_attempts"."provider_session_id" is null and "checkout_attempts"."provider_request_hash" is null
            and "checkout_attempts"."expires_at" is null
            and "checkout_attempts"."provider_customer_email" is null and "checkout_attempts"."provider_origin" is null
            and "checkout_attempts"."provider_request_schema_version" is null
            and "checkout_attempts"."provider_livemode" is null and "checkout_attempts"."provider_scope" is null)
          or ("checkout_attempts"."provider" is not null and length(btrim("checkout_attempts"."provider")) > 0
            and "checkout_attempts"."provider_request_id" is not null and length(btrim("checkout_attempts"."provider_request_id")) > 0
            and "checkout_attempts"."provider_request_hash" is not null
            and "checkout_attempts"."expires_at" is not null
            and "checkout_attempts"."provider_customer_email" is not null and length(btrim("checkout_attempts"."provider_customer_email")) > 0
            and "checkout_attempts"."provider_origin" is not null and length(btrim("checkout_attempts"."provider_origin")) > 0
            and "checkout_attempts"."provider_request_schema_version" = 1
            and "checkout_attempts"."provider_livemode" is not null
            and "checkout_attempts"."provider_scope" is not null and length(btrim("checkout_attempts"."provider_scope")) > 0
            and ("checkout_attempts"."provider_session_id" is null or length(btrim("checkout_attempts"."provider_session_id")) > 0)));
