CREATE TYPE "public"."affiliate_commission_status" AS ENUM('pending', 'approved', 'paid', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."affiliate_payout_state" AS ENUM('pending', 'paid');--> statement-breakpoint
CREATE TYPE "public"."affiliate_profile_status" AS ENUM('pending', 'active', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."affiliate_promotion_method" AS ENUM('website', 'social', 'email', 'other');--> statement-breakpoint
CREATE TYPE "public"."growth_attribution_program" AS ENUM('customer_referral', 'affiliate');--> statement-breakpoint
CREATE TYPE "public"."growth_policy_status" AS ENUM('draft', 'active', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."growth_terms_program" AS ENUM('customer_rewards_referrals', 'affiliate');--> statement-breakpoint
CREATE TYPE "public"."referral_code_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."referral_conversion_status" AS ENUM('pending', 'qualified', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."reward_ledger_kind" AS ENUM('order_earned_pending', 'order_earned_available', 'referral_earned_pending', 'referral_earned_available', 'redemption_reserved', 'redemption_consumed', 'redemption_released', 'refund_reversal', 'chargeback_reversal', 'admin_adjustment');--> statement-breakpoint
CREATE TYPE "public"."reward_redemption_state" AS ENUM('reserved', 'consumed', 'released');--> statement-breakpoint
CREATE TABLE "affiliate_attributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_profile_id" uuid NOT NULL,
	"affiliate_user_id" uuid NOT NULL,
	"referred_user_id" uuid NOT NULL,
	"affiliate_policy_id" uuid NOT NULL,
	"affiliate_policy_version" integer NOT NULL,
	"clicked_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"bound_at" timestamp with time zone NOT NULL,
	CONSTRAINT "affiliate_attributions_buyer_policy_unique" UNIQUE("referred_user_id","affiliate_policy_id"),
	CONSTRAINT "affiliate_attributions_id_profile_policy_unique" UNIQUE("id","affiliate_profile_id","affiliate_policy_id","affiliate_policy_version"),
	CONSTRAINT "affiliate_attributions_id_buyer_policy_unique" UNIQUE("id","referred_user_id","affiliate_policy_id","affiliate_policy_version"),
	CONSTRAINT "affiliate_attributions_commission_owner_unique" UNIQUE("id","affiliate_profile_id","referred_user_id","affiliate_policy_id","affiliate_policy_version"),
	CONSTRAINT "affiliate_attributions_not_self" CHECK ("affiliate_attributions"."affiliate_user_id" <> "affiliate_attributions"."referred_user_id"),
	CONSTRAINT "affiliate_attributions_time_coherent" CHECK ("affiliate_attributions"."expires_at" > "affiliate_attributions"."clicked_at"
        and "affiliate_attributions"."bound_at" >= "affiliate_attributions"."clicked_at"
        and "affiliate_attributions"."bound_at" <= "affiliate_attributions"."expires_at")
);
--> statement-breakpoint
CREATE TABLE "affiliate_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_profile_id" uuid NOT NULL,
	"affiliate_attribution_id" uuid NOT NULL,
	"buyer_user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"affiliate_policy_id" uuid NOT NULL,
	"affiliate_policy_version" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"gross_commission_minor" bigint NOT NULL,
	"reversed_commission_minor" bigint DEFAULT 0 NOT NULL,
	"status" "affiliate_commission_status" DEFAULT 'pending' NOT NULL,
	"payout_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_commissions_order_unique" UNIQUE("order_id"),
	CONSTRAINT "affiliate_commissions_idempotency_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "affiliate_commissions_idempotency_nonblank" CHECK (length(btrim("affiliate_commissions"."idempotency_key")) > 0),
	CONSTRAINT "affiliate_commissions_amounts_safe" CHECK ("affiliate_commissions"."gross_commission_minor" between 1 and 9007199254740991
        and "affiliate_commissions"."reversed_commission_minor" between 0 and 9007199254740991
        and "affiliate_commissions"."reversed_commission_minor" <= "affiliate_commissions"."gross_commission_minor"),
	CONSTRAINT "affiliate_commissions_payout_coherent" CHECK (("affiliate_commissions"."status" in ('pending','reversed') and "affiliate_commissions"."payout_id" is null)
        or ("affiliate_commissions"."status" = 'approved')
        or ("affiliate_commissions"."status" = 'paid' and "affiliate_commissions"."payout_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "affiliate_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"affiliate_profile_id" uuid NOT NULL,
	"affiliate_policy_id" uuid NOT NULL,
	"affiliate_policy_version" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"state" "affiliate_payout_state" DEFAULT 'pending' NOT NULL,
	"external_provider" text,
	"external_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "affiliate_payouts_idempotency_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "affiliate_payouts_id_profile_unique" UNIQUE("id","affiliate_profile_id"),
	CONSTRAINT "affiliate_payouts_idempotency_nonblank" CHECK (length(btrim("affiliate_payouts"."idempotency_key")) > 0),
	CONSTRAINT "affiliate_payouts_amount_safe" CHECK ("affiliate_payouts"."amount_minor" between 1 and 9007199254740991),
	CONSTRAINT "affiliate_payouts_currency_usd" CHECK ("affiliate_payouts"."currency" ~ '^[A-Z]{3}$' and "affiliate_payouts"."currency" = 'USD'),
	CONSTRAINT "affiliate_payouts_external_evidence_coherent" CHECK (("affiliate_payouts"."state" = 'pending' and "affiliate_payouts"."external_provider" is null
            and "affiliate_payouts"."external_reference" is null and "affiliate_payouts"."paid_at" is null)
        or ("affiliate_payouts"."state" = 'paid' and "affiliate_payouts"."external_provider" is not null
            and length(btrim("affiliate_payouts"."external_provider")) > 0
            and "affiliate_payouts"."external_reference" is not null
            and length(btrim("affiliate_payouts"."external_reference")) > 0 and "affiliate_payouts"."paid_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "affiliate_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"status" "growth_policy_status" DEFAULT 'draft' NOT NULL,
	"attribution_days" integer NOT NULL,
	"first_order_commission_basis_points" integer NOT NULL,
	"reorder_commission_basis_points" integer NOT NULL,
	"reorder_window_days" integer NOT NULL,
	"approval_delay_days" integer NOT NULL,
	"payout_threshold_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_policies_version_unique" UNIQUE("version"),
	CONSTRAINT "affiliate_policies_id_version_unique" UNIQUE("id","version"),
	CONSTRAINT "affiliate_policies_version_positive" CHECK ("affiliate_policies"."version" > 0),
	CONSTRAINT "affiliate_policies_attribution_days_positive" CHECK ("affiliate_policies"."attribution_days" > 0),
	CONSTRAINT "affiliate_policies_first_order_basis_points" CHECK ("affiliate_policies"."first_order_commission_basis_points" between 1 and 10000),
	CONSTRAINT "affiliate_policies_reorder_basis_points" CHECK ("affiliate_policies"."reorder_commission_basis_points" between 1 and 10000),
	CONSTRAINT "affiliate_policies_windows_positive" CHECK ("affiliate_policies"."reorder_window_days" > 0 and "affiliate_policies"."approval_delay_days" > 0),
	CONSTRAINT "affiliate_policies_payout_threshold_safe" CHECK ("affiliate_policies"."payout_threshold_minor" between 1 and 9007199254740991),
	CONSTRAINT "affiliate_policies_currency_usd" CHECK ("affiliate_policies"."currency" ~ '^[A-Z]{3}$' and "affiliate_policies"."currency" = 'USD'),
	CONSTRAINT "affiliate_policies_state_coherent" CHECK (("affiliate_policies"."status" = 'superseded') = ("affiliate_policies"."superseded_at" is not null)),
	CONSTRAINT "affiliate_policies_time_coherent" CHECK ("affiliate_policies"."superseded_at" is null or "affiliate_policies"."superseded_at" > "affiliate_policies"."effective_at")
);
--> statement-breakpoint
CREATE TABLE "affiliate_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"public_code" text NOT NULL,
	"status" "affiliate_profile_status" DEFAULT 'pending' NOT NULL,
	"public_channel" text NOT NULL,
	"promotion_method" "affiliate_promotion_method" NOT NULL,
	"terms_acceptance_id" uuid NOT NULL,
	"terms_program" "growth_terms_program" DEFAULT 'affiliate' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliate_profiles_user_unique" UNIQUE("user_id"),
	CONSTRAINT "affiliate_profiles_public_code_unique" UNIQUE("public_code"),
	CONSTRAINT "affiliate_profiles_id_user_unique" UNIQUE("id","user_id"),
	CONSTRAINT "affiliate_profiles_public_code_opaque" CHECK ("affiliate_profiles"."public_code" ~ '^aff_[A-Za-z0-9_-]{16,64}$'),
	CONSTRAINT "affiliate_profiles_channel_nonblank" CHECK (length(btrim("affiliate_profiles"."public_channel")) > 0),
	CONSTRAINT "affiliate_profiles_terms_program" CHECK ("affiliate_profiles"."terms_program" = 'affiliate')
);
--> statement-breakpoint
CREATE TABLE "growth_terms_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"program" "growth_terms_program" NOT NULL,
	"terms_version_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "growth_terms_acceptances_id_user_program_unique" UNIQUE("id","user_id","program"),
	CONSTRAINT "growth_terms_acceptances_user_version_unique" UNIQUE("user_id","terms_version_id"),
	CONSTRAINT "growth_terms_acceptances_hash_sha256" CHECK ("growth_terms_acceptances"."content_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "growth_terms_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program" "growth_terms_program" NOT NULL,
	"version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"terms_text" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "growth_terms_versions_program_version_unique" UNIQUE("program","version"),
	CONSTRAINT "growth_terms_versions_id_program_hash_unique" UNIQUE("id","program","content_hash"),
	CONSTRAINT "growth_terms_versions_program_hash_unique" UNIQUE("program","content_hash"),
	CONSTRAINT "growth_terms_versions_version_positive" CHECK ("growth_terms_versions"."version" > 0),
	CONSTRAINT "growth_terms_versions_hash_sha256" CHECK ("growth_terms_versions"."content_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "growth_terms_versions_text_nonblank" CHECK (length(btrim("growth_terms_versions"."terms_text")) > 0),
	CONSTRAINT "growth_terms_versions_time_coherent" CHECK ("growth_terms_versions"."superseded_at" is null or "growth_terms_versions"."superseded_at" > "growth_terms_versions"."effective_at")
);
--> statement-breakpoint
CREATE TABLE "loyalty_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"status" "growth_policy_status" DEFAULT 'draft' NOT NULL,
	"points_per_dollar" bigint NOT NULL,
	"redemption_minor_per_point" bigint NOT NULL,
	"minimum_redemption_points" bigint NOT NULL,
	"maximum_redemption_basis_points" integer NOT NULL,
	"expires_after_days" integer,
	"effective_at" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_policies_version_unique" UNIQUE("version"),
	CONSTRAINT "loyalty_policies_id_version_unique" UNIQUE("id","version"),
	CONSTRAINT "loyalty_policies_version_positive" CHECK ("loyalty_policies"."version" > 0),
	CONSTRAINT "loyalty_policies_points_per_dollar_safe" CHECK ("loyalty_policies"."points_per_dollar" between 1 and 9007199254740991),
	CONSTRAINT "loyalty_policies_redemption_minor_safe" CHECK ("loyalty_policies"."redemption_minor_per_point" between 1 and 9007199254740991),
	CONSTRAINT "loyalty_policies_minimum_points_safe" CHECK ("loyalty_policies"."minimum_redemption_points" between 1 and 9007199254740991),
	CONSTRAINT "loyalty_policies_maximum_basis_points" CHECK ("loyalty_policies"."maximum_redemption_basis_points" between 1 and 10000),
	CONSTRAINT "loyalty_policies_v1_no_expiry" CHECK ("loyalty_policies"."expires_after_days" is null),
	CONSTRAINT "loyalty_policies_state_coherent" CHECK (("loyalty_policies"."status" = 'superseded') = ("loyalty_policies"."superseded_at" is not null)),
	CONSTRAINT "loyalty_policies_time_coherent" CHECK ("loyalty_policies"."superseded_at" is null or "loyalty_policies"."superseded_at" > "loyalty_policies"."effective_at")
);
--> statement-breakpoint
CREATE TABLE "order_growth_attributions" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"buyer_user_id" uuid NOT NULL,
	"program" "growth_attribution_program" NOT NULL,
	"referral_attribution_id" uuid,
	"referral_policy_id" uuid,
	"referral_policy_version" integer,
	"affiliate_attribution_id" uuid,
	"affiliate_policy_id" uuid,
	"affiliate_policy_version" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_growth_attributions_exact_program" CHECK (("order_growth_attributions"."program" = 'customer_referral'
            and "order_growth_attributions"."referral_attribution_id" is not null
            and "order_growth_attributions"."referral_policy_id" is not null
            and "order_growth_attributions"."referral_policy_version" is not null
            and "order_growth_attributions"."affiliate_attribution_id" is null
            and "order_growth_attributions"."affiliate_policy_id" is null
            and "order_growth_attributions"."affiliate_policy_version" is null)
        or ("order_growth_attributions"."program" = 'affiliate'
            and "order_growth_attributions"."affiliate_attribution_id" is not null
            and "order_growth_attributions"."affiliate_policy_id" is not null
            and "order_growth_attributions"."affiliate_policy_version" is not null
            and "order_growth_attributions"."referral_attribution_id" is null
            and "order_growth_attributions"."referral_policy_id" is null
            and "order_growth_attributions"."referral_policy_version" is null))
);
--> statement-breakpoint
CREATE TABLE "referral_attributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_code_id" uuid NOT NULL,
	"referrer_user_id" uuid NOT NULL,
	"referred_user_id" uuid NOT NULL,
	"referral_policy_id" uuid NOT NULL,
	"referral_policy_version" integer NOT NULL,
	"clicked_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"bound_at" timestamp with time zone NOT NULL,
	CONSTRAINT "referral_attributions_buyer_policy_unique" UNIQUE("referred_user_id","referral_policy_id"),
	CONSTRAINT "referral_attributions_id_buyer_unique" UNIQUE("id","referred_user_id"),
	CONSTRAINT "referral_attributions_id_buyer_policy_unique" UNIQUE("id","referred_user_id","referral_policy_id","referral_policy_version"),
	CONSTRAINT "referral_attributions_not_self" CHECK ("referral_attributions"."referrer_user_id" <> "referral_attributions"."referred_user_id"),
	CONSTRAINT "referral_attributions_time_coherent" CHECK ("referral_attributions"."expires_at" > "referral_attributions"."clicked_at"
        and "referral_attributions"."bound_at" >= "referral_attributions"."clicked_at"
        and "referral_attributions"."bound_at" <= "referral_attributions"."expires_at")
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"status" "referral_code_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "referral_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "referral_codes_id_owner_unique" UNIQUE("id","owner_user_id"),
	CONSTRAINT "referral_codes_opaque" CHECK ("referral_codes"."code" ~ '^ref_[A-Za-z0-9_-]{16,64}$'),
	CONSTRAINT "referral_codes_state_coherent" CHECK (("referral_codes"."status" = 'active' and "referral_codes"."revoked_at" is null)
        or ("referral_codes"."status" = 'revoked' and "referral_codes"."revoked_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "referral_conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_attribution_id" uuid NOT NULL,
	"referred_user_id" uuid NOT NULL,
	"first_order_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"referred_discount_minor" bigint NOT NULL,
	"referrer_reward_points" bigint NOT NULL,
	"status" "referral_conversion_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"qualified_at" timestamp with time zone,
	"reversed_at" timestamp with time zone,
	CONSTRAINT "referral_conversions_attribution_unique" UNIQUE("referral_attribution_id"),
	CONSTRAINT "referral_conversions_first_order_unique" UNIQUE("first_order_id"),
	CONSTRAINT "referral_conversions_idempotency_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "referral_conversions_idempotency_nonblank" CHECK (length(btrim("referral_conversions"."idempotency_key")) > 0),
	CONSTRAINT "referral_conversions_discount_safe" CHECK ("referral_conversions"."referred_discount_minor" between 0 and 9007199254740991),
	CONSTRAINT "referral_conversions_reward_safe" CHECK ("referral_conversions"."referrer_reward_points" between 0 and 9007199254740991),
	CONSTRAINT "referral_conversions_state_coherent" CHECK (("referral_conversions"."status" = 'pending' and "referral_conversions"."qualified_at" is null and "referral_conversions"."reversed_at" is null)
        or ("referral_conversions"."status" = 'qualified' and "referral_conversions"."qualified_at" is not null and "referral_conversions"."reversed_at" is null)
        or ("referral_conversions"."status" = 'reversed' and "referral_conversions"."reversed_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "referral_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"status" "growth_policy_status" DEFAULT 'draft' NOT NULL,
	"attribution_days" integer NOT NULL,
	"referred_discount_basis_points" integer NOT NULL,
	"referred_discount_cap_minor" bigint NOT NULL,
	"referrer_points_per_dollar" bigint NOT NULL,
	"referrer_reward_cap_points" bigint NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_policies_version_unique" UNIQUE("version"),
	CONSTRAINT "referral_policies_id_version_unique" UNIQUE("id","version"),
	CONSTRAINT "referral_policies_version_positive" CHECK ("referral_policies"."version" > 0),
	CONSTRAINT "referral_policies_attribution_days_positive" CHECK ("referral_policies"."attribution_days" > 0),
	CONSTRAINT "referral_policies_discount_basis_points" CHECK ("referral_policies"."referred_discount_basis_points" between 1 and 10000),
	CONSTRAINT "referral_policies_discount_cap_safe" CHECK ("referral_policies"."referred_discount_cap_minor" between 1 and 9007199254740991),
	CONSTRAINT "referral_policies_reward_rate_safe" CHECK ("referral_policies"."referrer_points_per_dollar" between 1 and 9007199254740991),
	CONSTRAINT "referral_policies_reward_cap_safe" CHECK ("referral_policies"."referrer_reward_cap_points" between 1 and 9007199254740991),
	CONSTRAINT "referral_policies_state_coherent" CHECK (("referral_policies"."status" = 'superseded') = ("referral_policies"."superseded_at" is not null)),
	CONSTRAINT "referral_policies_time_coherent" CHECK ("referral_policies"."superseded_at" is null or "referral_policies"."superseded_at" > "referral_policies"."effective_at")
);
--> statement-breakpoint
CREATE TABLE "reward_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_user_id" uuid NOT NULL,
	"pending_points" bigint DEFAULT 0 NOT NULL,
	"available_points" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_accounts_buyer_unique" UNIQUE("buyer_user_id"),
	CONSTRAINT "reward_accounts_id_buyer_unique" UNIQUE("id","buyer_user_id"),
	CONSTRAINT "reward_accounts_pending_safe_nonnegative" CHECK ("reward_accounts"."pending_points" between 0 and 9007199254740991),
	CONSTRAINT "reward_accounts_available_safe_signed" CHECK ("reward_accounts"."available_points" between -9007199254740991 and 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "reward_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reward_account_id" uuid NOT NULL,
	"buyer_user_id" uuid NOT NULL,
	"kind" "reward_ledger_kind" NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"pending_points_delta" bigint NOT NULL,
	"available_points_delta" bigint NOT NULL,
	"pending_points_balance_after" bigint NOT NULL,
	"available_points_balance_after" bigint NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_ledger_entries_idempotency_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "reward_ledger_entries_source_unique" UNIQUE("kind","source_type","source_id"),
	CONSTRAINT "reward_ledger_entries_idempotency_nonblank" CHECK (length(btrim("reward_ledger_entries"."idempotency_key")) > 0),
	CONSTRAINT "reward_ledger_entries_source_type_nonblank" CHECK (length(btrim("reward_ledger_entries"."source_type")) > 0),
	CONSTRAINT "reward_ledger_entries_source_id_nonblank" CHECK (length(btrim("reward_ledger_entries"."source_id")) > 0),
	CONSTRAINT "reward_ledger_entries_pending_delta_safe" CHECK ("reward_ledger_entries"."pending_points_delta" between -9007199254740991 and 9007199254740991),
	CONSTRAINT "reward_ledger_entries_available_delta_safe" CHECK ("reward_ledger_entries"."available_points_delta" between -9007199254740991 and 9007199254740991),
	CONSTRAINT "reward_ledger_entries_nonzero_delta" CHECK ("reward_ledger_entries"."pending_points_delta" <> 0 or "reward_ledger_entries"."available_points_delta" <> 0),
	CONSTRAINT "reward_ledger_entries_pending_balance_safe" CHECK ("reward_ledger_entries"."pending_points_balance_after" between 0 and 9007199254740991),
	CONSTRAINT "reward_ledger_entries_available_balance_safe" CHECK ("reward_ledger_entries"."available_points_balance_after" between -9007199254740991 and 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE "reward_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"checkout_attempt_id" uuid NOT NULL,
	"loyalty_policy_id" uuid NOT NULL,
	"loyalty_policy_version" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"points" bigint NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"state" "reward_redemption_state" DEFAULT 'reserved' NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	CONSTRAINT "reward_redemptions_idempotency_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "reward_redemptions_idempotency_nonblank" CHECK (length(btrim("reward_redemptions"."idempotency_key")) > 0),
	CONSTRAINT "reward_redemptions_points_safe" CHECK ("reward_redemptions"."points" between 1 and 9007199254740991),
	CONSTRAINT "reward_redemptions_amount_safe" CHECK ("reward_redemptions"."amount_minor" between 1 and 9007199254740991),
	CONSTRAINT "reward_redemptions_currency_usd" CHECK ("reward_redemptions"."currency" ~ '^[A-Z]{3}$' and "reward_redemptions"."currency" = 'USD'),
	CONSTRAINT "reward_redemptions_state_coherent" CHECK (("reward_redemptions"."state" = 'reserved' and "reward_redemptions"."consumed_at" is null and "reward_redemptions"."released_at" is null)
        or ("reward_redemptions"."state" = 'consumed' and "reward_redemptions"."consumed_at" is not null and "reward_redemptions"."released_at" is null)
        or ("reward_redemptions"."state" = 'released' and "reward_redemptions"."consumed_at" is null and "reward_redemptions"."released_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "shared_research_set_items" (
	"shared_set_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_research_set_items_pk" PRIMARY KEY("shared_set_id","product_id"),
	CONSTRAINT "shared_research_set_items_quantity_bounds" CHECK ("shared_research_set_items"."quantity" between 1 and 25)
);
--> statement-breakpoint
CREATE TABLE "shared_research_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"public_code" text NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deactivated_at" timestamp with time zone,
	CONSTRAINT "shared_research_sets_public_code_unique" UNIQUE("public_code"),
	CONSTRAINT "shared_research_sets_public_code_opaque" CHECK ("shared_research_sets"."public_code" ~ '^set_[A-Za-z0-9_-]{16,64}$'),
	CONSTRAINT "shared_research_sets_label_bounds" CHECK (char_length("shared_research_sets"."label") between 1 and 120 and length(btrim("shared_research_sets"."label")) > 0
        and "shared_research_sets"."label" !~ '[[:cntrl:]]'),
	CONSTRAINT "shared_research_sets_state_coherent" CHECK (("shared_research_sets"."active" = true and "shared_research_sets"."deactivated_at" is null)
        or ("shared_research_sets"."active" = false and "shared_research_sets"."deactivated_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "affiliate_attributions" ADD CONSTRAINT "affiliate_attributions_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_attributions" ADD CONSTRAINT "affiliate_attributions_profile_user_fk" FOREIGN KEY ("affiliate_profile_id","affiliate_user_id") REFERENCES "public"."affiliate_profiles"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_attributions" ADD CONSTRAINT "affiliate_attributions_policy_version_fk" FOREIGN KEY ("affiliate_policy_id","affiliate_policy_version") REFERENCES "public"."affiliate_policies"("id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_attribution_policy_fk" FOREIGN KEY ("affiliate_attribution_id","affiliate_profile_id","buyer_user_id","affiliate_policy_id","affiliate_policy_version") REFERENCES "public"."affiliate_attributions"("id","affiliate_profile_id","referred_user_id","affiliate_policy_id","affiliate_policy_version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_order_buyer_fk" FOREIGN KEY ("order_id","buyer_user_id") REFERENCES "public"."orders"("id","buyer_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_commissions" ADD CONSTRAINT "affiliate_commissions_payout_profile_fk" FOREIGN KEY ("payout_id","affiliate_profile_id") REFERENCES "public"."affiliate_payouts"("id","affiliate_profile_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_affiliate_profile_id_affiliate_profiles_id_fk" FOREIGN KEY ("affiliate_profile_id") REFERENCES "public"."affiliate_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_payouts" ADD CONSTRAINT "affiliate_payouts_policy_version_fk" FOREIGN KEY ("affiliate_policy_id","affiliate_policy_version") REFERENCES "public"."affiliate_policies"("id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_profiles" ADD CONSTRAINT "affiliate_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliate_profiles" ADD CONSTRAINT "affiliate_profiles_terms_acceptance_fk" FOREIGN KEY ("terms_acceptance_id","user_id","terms_program") REFERENCES "public"."growth_terms_acceptances"("id","user_id","program") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_terms_acceptances" ADD CONSTRAINT "growth_terms_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_terms_acceptances" ADD CONSTRAINT "growth_terms_acceptances_exact_terms_fk" FOREIGN KEY ("terms_version_id","program","content_hash") REFERENCES "public"."growth_terms_versions"("id","program","content_hash") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_growth_attributions" ADD CONSTRAINT "order_growth_attributions_order_buyer_fk" FOREIGN KEY ("order_id","buyer_user_id") REFERENCES "public"."orders"("id","buyer_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_growth_attributions" ADD CONSTRAINT "order_growth_attributions_referral_fk" FOREIGN KEY ("referral_attribution_id","buyer_user_id","referral_policy_id","referral_policy_version") REFERENCES "public"."referral_attributions"("id","referred_user_id","referral_policy_id","referral_policy_version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_growth_attributions" ADD CONSTRAINT "order_growth_attributions_affiliate_fk" FOREIGN KEY ("affiliate_attribution_id","buyer_user_id","affiliate_policy_id","affiliate_policy_version") REFERENCES "public"."affiliate_attributions"("id","referred_user_id","affiliate_policy_id","affiliate_policy_version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_code_owner_fk" FOREIGN KEY ("referral_code_id","referrer_user_id") REFERENCES "public"."referral_codes"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_attributions" ADD CONSTRAINT "referral_attributions_policy_version_fk" FOREIGN KEY ("referral_policy_id","referral_policy_version") REFERENCES "public"."referral_policies"("id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_conversions" ADD CONSTRAINT "referral_conversions_attribution_buyer_fk" FOREIGN KEY ("referral_attribution_id","referred_user_id") REFERENCES "public"."referral_attributions"("id","referred_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_conversions" ADD CONSTRAINT "referral_conversions_order_buyer_fk" FOREIGN KEY ("first_order_id","referred_user_id") REFERENCES "public"."orders"("id","buyer_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_accounts" ADD CONSTRAINT "reward_accounts_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_ledger_entries" ADD CONSTRAINT "reward_ledger_entries_account_buyer_fk" FOREIGN KEY ("reward_account_id","buyer_user_id") REFERENCES "public"."reward_accounts"("id","buyer_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_order_buyer_fk" FOREIGN KEY ("order_id","buyer_user_id") REFERENCES "public"."orders"("id","buyer_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_attempt_order_fk" FOREIGN KEY ("checkout_attempt_id","order_id") REFERENCES "public"."checkout_attempts"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_policy_version_fk" FOREIGN KEY ("loyalty_policy_id","loyalty_policy_version") REFERENCES "public"."loyalty_policies"("id","version") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_research_set_items" ADD CONSTRAINT "shared_research_set_items_shared_set_id_shared_research_sets_id_fk" FOREIGN KEY ("shared_set_id") REFERENCES "public"."shared_research_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_research_set_items" ADD CONSTRAINT "shared_research_set_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_research_sets" ADD CONSTRAINT "shared_research_sets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_policies_current_active_unique" ON "affiliate_policies" USING btree ("status") WHERE "affiliate_policies"."status" = 'active' and "affiliate_policies"."superseded_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "growth_terms_versions_current_program_unique" ON "growth_terms_versions" USING btree ("program") WHERE "growth_terms_versions"."superseded_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_policies_current_active_unique" ON "loyalty_policies" USING btree ("status") WHERE "loyalty_policies"."status" = 'active' and "loyalty_policies"."superseded_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "referral_codes_active_owner_unique" ON "referral_codes" USING btree ("owner_user_id") WHERE "referral_codes"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "referral_policies_current_active_unique" ON "referral_policies" USING btree ("status") WHERE "referral_policies"."status" = 'active' and "referral_policies"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "reward_ledger_entries_account_occurred_idx" ON "reward_ledger_entries" USING btree ("reward_account_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reward_redemptions_active_attempt_unique" ON "reward_redemptions" USING btree ("checkout_attempt_id") WHERE "reward_redemptions"."state" = 'reserved';--> statement-breakpoint
CREATE INDEX "shared_research_sets_owner_active_idx" ON "shared_research_sets" USING btree ("owner_user_id","active");