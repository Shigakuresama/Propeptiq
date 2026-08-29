ALTER TYPE "public"."affiliate_payout_state" ADD VALUE 'cancelled';--> statement-breakpoint
CREATE TABLE "affiliate_commission_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_profile_id" uuid NOT NULL,
	"affiliate_commission_id" uuid NOT NULL,
	"source_payout_id" uuid NOT NULL,
	"source_payment_event_id" uuid NOT NULL,
	"settlement_payout_id" uuid,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_commission_adjustments_event_unique" UNIQUE("affiliate_commission_id","source_payment_event_id"),
	CONSTRAINT "affiliate_commission_adjustments_amount_safe" CHECK ("affiliate_commission_adjustments"."amount_minor" between 1 and 9007199254740991)
);
--> statement-breakpoint
ALTER TABLE "affiliate_payouts" DROP CONSTRAINT "affiliate_payouts_external_evidence_coherent";--> statement-breakpoint
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_id_profile_unique" UNIQUE("id","affiliate_profile_id");--> statement-breakpoint
ALTER TABLE "affiliate_commission_adjustments" ADD CONSTRAINT "affiliate_commission_adjustments_source_payment_event_id_payment_events_id_fk" FOREIGN KEY ("source_payment_event_id") REFERENCES "public"."payment_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commission_adjustments" ADD CONSTRAINT "affiliate_commission_adjustments_commission_profile_fk" FOREIGN KEY ("affiliate_commission_id","affiliate_profile_id") REFERENCES "public"."affiliate_commissions"("id","affiliate_profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commission_adjustments" ADD CONSTRAINT "affiliate_commission_adjustments_source_payout_profile_fk" FOREIGN KEY ("source_payout_id","affiliate_profile_id") REFERENCES "public"."affiliate_payouts"("id","affiliate_profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commission_adjustments" ADD CONSTRAINT "affiliate_commission_adjustments_settlement_payout_profile_fk" FOREIGN KEY ("settlement_payout_id","affiliate_profile_id") REFERENCES "public"."affiliate_payouts"("id","affiliate_profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affiliate_commission_adjustments_outstanding_profile_idx" ON "affiliate_commission_adjustments" USING btree ("affiliate_profile_id") WHERE "affiliate_commission_adjustments"."settlement_payout_id" is null;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_external_evidence_coherent" CHECK (("affiliate_payouts"."state" in ('pending','cancelled') and "affiliate_payouts"."external_provider" is null
            and "affiliate_payouts"."external_reference" is null and "affiliate_payouts"."paid_at" is null)
        or ("affiliate_payouts"."state" = 'paid' and "affiliate_payouts"."external_provider" is not null
            and length(btrim("affiliate_payouts"."external_provider")) > 0
            and char_length("affiliate_payouts"."external_provider") <= 120
            and "affiliate_payouts"."external_reference" is not null
            and length(btrim("affiliate_payouts"."external_reference")) > 0
            and char_length("affiliate_payouts"."external_reference") <= 200
            and "affiliate_payouts"."paid_at" is not null));
