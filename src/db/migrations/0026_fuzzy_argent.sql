DO $$
BEGIN
	IF (to_regclass('public.product_prices') IS NOT NULL
	      AND EXISTS (SELECT 1 FROM public.product_prices WHERE superseded_at IS NULL LIMIT 1))
	   OR (to_regclass('public.lots') IS NOT NULL
	      AND EXISTS (SELECT 1 FROM public.lots LIMIT 1))
	   OR (to_regclass('public.order_items') IS NOT NULL
	      AND EXISTS (SELECT 1 FROM public.order_items LIMIT 1)) THEN
		RAISE EXCEPTION '0026 preflight refused: populated current prices, lots, or order items require owner-approved variant reconciliation';
	END IF;
END $$;--> statement-breakpoint
CREATE TYPE "public"."price_status" AS ENUM('pending', 'active', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."product_variant_status" AS ENUM('inactive', 'active');--> statement-breakpoint
CREATE TYPE "public"."promotion_application_mode" AS ENUM('automatic', 'code_required');--> statement-breakpoint
CREATE TYPE "public"."promotion_scope" AS ENUM('sitewide', 'products', 'variants');--> statement-breakpoint
CREATE TYPE "public"."variant_amount_unit" AS ENUM('mg', 'mcg', 'iu');--> statement-breakpoint
ALTER TYPE "public"."promotion_target_kind" ADD VALUE 'variant';--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"label" text NOT NULL,
	"canonical_amount" numeric(20, 6),
	"amount_unit" "variant_amount_unit",
	"package_quantity" integer NOT NULL,
	"status" "product_variant_status" DEFAULT 'inactive' NOT NULL,
	"stripe_product_id" text,
	"stripe_price_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_id_product_unique" UNIQUE("id","product_id"),
	CONSTRAINT "product_variants_sku_unique" UNIQUE("sku"),
	CONSTRAINT "product_variants_sku_nonblank" CHECK (length(btrim("product_variants"."sku")) > 0),
	CONSTRAINT "product_variants_label_nonblank" CHECK (length(btrim("product_variants"."label")) > 0),
	CONSTRAINT "product_variants_amount_coherent" CHECK (("product_variants"."canonical_amount" is null and "product_variants"."amount_unit" is null)
          or ("product_variants"."canonical_amount" > 0 and "product_variants"."amount_unit" is not null)),
	CONSTRAINT "product_variants_package_quantity_positive" CHECK ("product_variants"."package_quantity" > 0),
	CONSTRAINT "product_variants_stripe_product_nonblank" CHECK ("product_variants"."stripe_product_id" is null or length(btrim("product_variants"."stripe_product_id")) > 0),
	CONSTRAINT "product_variants_stripe_price_nonblank" CHECK ("product_variants"."stripe_price_id" is null or length(btrim("product_variants"."stripe_price_id")) > 0)
);
--> statement-breakpoint
ALTER TABLE "product_prices" DROP CONSTRAINT "product_prices_product_version_unique";--> statement-breakpoint
ALTER TABLE "product_prices" DROP CONSTRAINT "product_prices_amount_positive_safe";--> statement-breakpoint
ALTER TABLE "promotion_targets" DROP CONSTRAINT "promotion_targets_target_scope_coherent";--> statement-breakpoint
DROP INDEX "product_prices_active_product_currency_unique";--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "product_prices" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "product_prices" ADD COLUMN "price_status" "price_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "promotion_targets" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "campaign_key" text;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "application_mode" "promotion_application_mode";--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "scope" "promotion_scope";--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_variants_product_status_idx" ON "product_variants" USING btree ("product_id","status");--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_variant_product_fk" FOREIGN KEY ("variant_id","product_id") REFERENCES "public"."product_variants"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_variant_product_fk" FOREIGN KEY ("variant_id","product_id") REFERENCES "public"."product_variants"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_targets" ADD CONSTRAINT "promotion_targets_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_product_fk" FOREIGN KEY ("variant_id","product_id") REFERENCES "public"."product_variants"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_id_variant_unique" UNIQUE("id","variant_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_price_variant_fk" FOREIGN KEY ("product_price_id","variant_id") REFERENCES "public"."product_prices"("id","variant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_prices_legacy_product_version_unique" ON "product_prices" USING btree ("product_id","version") WHERE "product_prices"."variant_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "product_prices_variant_version_unique" ON "product_prices" USING btree ("variant_id","version") WHERE "product_prices"."variant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "product_prices_active_legacy_product_currency_unique" ON "product_prices" USING btree ("product_id","currency") WHERE "product_prices"."superseded_at" is null and "product_prices"."variant_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "product_prices_active_variant_currency_unique" ON "product_prices" USING btree ("variant_id","currency") WHERE "product_prices"."superseded_at" is null and "product_prices"."variant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_targets_variant_unique" ON "promotion_targets" USING btree ("promotion_id","variant_id") WHERE "promotion_targets"."variant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "promotions_campaign_key_unique" ON "promotions" USING btree ("campaign_key") WHERE "promotions"."campaign_key" is not null;--> statement-breakpoint
ALTER TABLE "product_prices" ADD CONSTRAINT "product_prices_amount_status_coherent" CHECK (("product_prices"."price_status" = 'pending' and "product_prices"."amount_minor" between 0 and 9007199254740991)
          or ("product_prices"."price_status" in ('active', 'unavailable') and "product_prices"."amount_minor" between 1 and 9007199254740991));--> statement-breakpoint
ALTER TABLE "promotion_targets" ADD CONSTRAINT "promotion_targets_target_scope_coherent" CHECK (("promotion_targets"."target_kind" = 'product' and "promotion_targets"."product_id" is not null
            and "promotion_targets"."policy_group_id" is null and "promotion_targets"."variant_id" is null)
          or ("promotion_targets"."target_kind" = 'policy_group' and "promotion_targets"."product_id" is null
            and "promotion_targets"."policy_group_id" is not null and "promotion_targets"."variant_id" is null)
          or ("promotion_targets"."target_kind" = 'variant' and "promotion_targets"."product_id" is null
            and "promotion_targets"."policy_group_id" is null and "promotion_targets"."variant_id" is not null));--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_campaign_key_format" CHECK ("promotions"."campaign_key" is null or "promotions"."campaign_key" ~ '^[a-z0-9]+(?:[_-][a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_storefront_configuration_coherent" CHECK (("promotions"."campaign_key" is null and "promotions"."enabled" = false
            and "promotions"."timezone" is null and "promotions"."application_mode" is null
            and "promotions"."scope" is null)
          or ("promotions"."campaign_key" is not null and length(btrim("promotions"."timezone")) > 0
            and "promotions"."application_mode" is not null and "promotions"."scope" is not null
            and ("promotions"."enabled" = false or "promotions"."status" = 'active')));--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_automatic_discount_coherent" CHECK ("promotions"."application_mode" is distinct from 'automatic'
          or ("promotions"."kind" = 'discount' and "promotions"."basis_points" is not null
            and "promotions"."amount_minor" is null and "promotions"."currency" is null));--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_winter30_exact" CHECK ("promotions"."campaign_key" is distinct from 'winter30'
          or ("promotions"."code" = 'WINTER30' and "promotions"."name" = 'Winter Sale'
            and "promotions"."kind" = 'discount' and "promotions"."status" = 'active'
            and "promotions"."amount_minor" is null and "promotions"."basis_points" = 3000
            and "promotions"."currency" is null and "promotions"."enabled" = true
            and "promotions"."starts_at" is null and "promotions"."ends_at" is null
            and "promotions"."timezone" = 'America/Los_Angeles'
            and "promotions"."application_mode" = 'automatic'
            and "promotions"."scope" = 'sitewide'));
