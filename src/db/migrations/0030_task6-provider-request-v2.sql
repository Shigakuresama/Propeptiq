ALTER TABLE "checkout_attempts" DROP CONSTRAINT "checkout_attempts_provider_coherent";--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "provider_binding_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD CONSTRAINT "checkout_attempts_provider_coherent" CHECK (("checkout_attempts"."provider" is null and "checkout_attempts"."provider_request_id" is null
            and "checkout_attempts"."provider_session_id" is null and "checkout_attempts"."provider_request_hash" is null
            and "checkout_attempts"."expires_at" is null
            and "checkout_attempts"."provider_customer_email" is null and "checkout_attempts"."provider_origin" is null
            and "checkout_attempts"."provider_request_schema_version" is null
            and "checkout_attempts"."provider_binding_snapshot" is null
            and "checkout_attempts"."provider_livemode" is null and "checkout_attempts"."provider_scope" is null)
          or ("checkout_attempts"."provider" is not null and length(btrim("checkout_attempts"."provider")) > 0
            and "checkout_attempts"."provider_request_id" is not null and length(btrim("checkout_attempts"."provider_request_id")) > 0
            and "checkout_attempts"."provider_request_hash" is not null
            and "checkout_attempts"."expires_at" is not null
            and "checkout_attempts"."provider_customer_email" is not null and length(btrim("checkout_attempts"."provider_customer_email")) > 0
            and "checkout_attempts"."provider_origin" is not null and length(btrim("checkout_attempts"."provider_origin")) > 0
            and (("checkout_attempts"."provider_request_schema_version" = 1
                    and "checkout_attempts"."provider_binding_snapshot" is null)
              or ("checkout_attempts"."provider_request_schema_version" = 2
                    and "checkout_attempts"."provider_binding_snapshot" is not null
                    and "checkout_attempts"."provider_binding_snapshot"->>'schemaVersion' = '2'))
            and "checkout_attempts"."provider_livemode" is not null
            and "checkout_attempts"."provider_scope" is not null and length(btrim("checkout_attempts"."provider_scope")) > 0
            and ("checkout_attempts"."provider_session_id" is null or length(btrim("checkout_attempts"."provider_session_id")) > 0)));