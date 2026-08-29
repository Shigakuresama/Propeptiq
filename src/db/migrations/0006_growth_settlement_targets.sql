ALTER TABLE "referral_conversions" DROP CONSTRAINT "referral_conversions_attribution_buyer_fk";
--> statement-breakpoint
ALTER TABLE "referral_conversions" ADD COLUMN "referral_policy_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_conversions" ADD COLUMN "referral_policy_version" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "referral_conversions" ADD CONSTRAINT "referral_conversions_attribution_policy_fk" FOREIGN KEY ("referral_attribution_id","referred_user_id","referral_policy_id","referral_policy_version") REFERENCES "public"."referral_attributions"("id","referred_user_id","referral_policy_id","referral_policy_version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_id_profile_policy_unique" UNIQUE("id","affiliate_profile_id","affiliate_policy_id","affiliate_policy_version");