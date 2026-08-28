CREATE TABLE "affiliate_payout_commissions" (
	"payout_id" uuid NOT NULL,
	"commission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_payout_commissions_pk" PRIMARY KEY("payout_id","commission_id"),
	CONSTRAINT "affiliate_payout_commissions_commission_unique" UNIQUE("commission_id")
);
--> statement-breakpoint
ALTER TABLE "affiliate_payout_commissions" ADD CONSTRAINT "affiliate_payout_commissions_payout_id_affiliate_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."affiliate_payouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_payout_commissions" ADD CONSTRAINT "affiliate_payout_commissions_commission_id_affiliate_commissions_id_fk" FOREIGN KEY ("commission_id") REFERENCES "public"."affiliate_commissions"("id") ON DELETE restrict ON UPDATE no action;