ALTER TABLE "affiliate_payouts" DROP CONSTRAINT "affiliate_payouts_external_evidence_coherent";--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD COLUMN "paid_idempotency_key" text;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_paid_idempotency_unique" UNIQUE("paid_idempotency_key");--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_version_positive" CHECK ("affiliate_payouts"."version" > 0);--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_paid_idempotency_nonblank" CHECK ("affiliate_payouts"."paid_idempotency_key" is null or length(btrim("affiliate_payouts"."paid_idempotency_key")) > 0);--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_external_evidence_coherent" CHECK (("affiliate_payouts"."state" = 'pending' and "affiliate_payouts"."external_provider" is null
            and "affiliate_payouts"."external_reference" is null and "affiliate_payouts"."paid_at" is null)
        or ("affiliate_payouts"."state" = 'paid' and "affiliate_payouts"."external_provider" is not null
            and length(btrim("affiliate_payouts"."external_provider")) > 0
            and char_length("affiliate_payouts"."external_provider") <= 120
            and "affiliate_payouts"."external_reference" is not null
            and length(btrim("affiliate_payouts"."external_reference")) > 0
            and char_length("affiliate_payouts"."external_reference") <= 200
            and "affiliate_payouts"."paid_at" is not null));