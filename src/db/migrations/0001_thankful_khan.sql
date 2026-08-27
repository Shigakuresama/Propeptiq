DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "products" LIMIT 1) THEN
		RAISE EXCEPTION 'Task 5 material_identity reconciliation required before migration: populated products need truthful operator-supplied material identities';
	END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE "analytical_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"coa_document_id" uuid NOT NULL,
	"text" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytical_claims_text_nonblank" CHECK (length(btrim("analytical_claims"."text")) > 0)
);
--> statement-breakpoint
CREATE TABLE "rate_limit_windows" (
	"scope_hash" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_windows_scope_start_pk" PRIMARY KEY("scope_hash","window_start"),
	CONSTRAINT "rate_limit_windows_scope_sha256" CHECK ("rate_limit_windows"."scope_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "rate_limit_windows_count_positive" CHECK ("rate_limit_windows"."count" > 0),
	CONSTRAINT "rate_limit_windows_expiry_after_start" CHECK ("rate_limit_windows"."expires_at" > "rate_limit_windows"."window_start")
);
--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "analytical_method" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "material_identity" text NOT NULL;--> statement-breakpoint
ALTER TABLE "coa_documents" ADD CONSTRAINT "coa_documents_id_lot_unique" UNIQUE("id","lot_id");--> statement-breakpoint
ALTER TABLE "analytical_claims" ADD CONSTRAINT "analytical_claims_lot_product_fk" FOREIGN KEY ("lot_id","product_id") REFERENCES "public"."lots"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytical_claims" ADD CONSTRAINT "analytical_claims_coa_lot_fk" FOREIGN KEY ("coa_document_id","lot_id") REFERENCES "public"."coa_documents"("id","lot_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytical_claims_product_active_idx" ON "analytical_claims" USING btree ("product_id","active");--> statement-breakpoint
CREATE INDEX "rate_limit_windows_expiry_idx" ON "rate_limit_windows" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_analytical_method_nonblank" CHECK ("lots"."analytical_method" is null or length(btrim("lots"."analytical_method")) > 0);--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_material_identity_nonblank" CHECK (length(btrim("products"."material_identity")) > 0);
