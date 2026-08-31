ALTER TABLE "checkout_attempts" ADD COLUMN "canonical_pricing_revision" text;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD COLUMN "canonical_quote_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD CONSTRAINT "checkout_attempts_canonical_replay_coherent" CHECK (("checkout_attempts"."canonical_pricing_revision" is null and "checkout_attempts"."canonical_quote_snapshot" is null)
          or ("checkout_attempts"."canonical_pricing_revision" is not null
            and "checkout_attempts"."canonical_pricing_revision" ~ '^[0-9a-f]{64}$'
            and "checkout_attempts"."canonical_quote_snapshot" is not null));