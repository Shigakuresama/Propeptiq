CREATE TABLE "order_invoices" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_invoice_id" text,
	"hosted_invoice_url" text,
	"amount_due_minor" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"evidence_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_invoices_provider_invoice_unique" UNIQUE("provider","provider_invoice_id"),
	CONSTRAINT "order_invoices_provider" CHECK ("order_invoices"."provider" = 'stripe'),
	CONSTRAINT "order_invoices_status" CHECK ("order_invoices"."status" in ('pending','open','unavailable','unknown')),
	CONSTRAINT "order_invoices_open_coherent" CHECK (("order_invoices"."status" = 'open'
          and "order_invoices"."provider_invoice_id" is not null and length(btrim("order_invoices"."provider_invoice_id")) > 0
          and "order_invoices"."hosted_invoice_url" is not null and length(btrim("order_invoices"."hosted_invoice_url")) > 0
          and "order_invoices"."amount_due_minor" is not null and "order_invoices"."amount_due_minor" >= 0)
        or ("order_invoices"."status" <> 'open'
          and "order_invoices"."hosted_invoice_url" is null
          and "order_invoices"."amount_due_minor" is null)),
	CONSTRAINT "order_invoices_evidence_coherent" CHECK (("order_invoices"."status" in ('unavailable','unknown') and "order_invoices"."evidence_code" is not null
          and length(btrim("order_invoices"."evidence_code")) > 0)
        or ("order_invoices"."status" not in ('unavailable','unknown') and "order_invoices"."evidence_code" is null)),
	CONSTRAINT "order_invoices_timestamps" CHECK ("order_invoices"."updated_at" >= "order_invoices"."created_at")
);
--> statement-breakpoint
ALTER TABLE "order_invoices" ADD CONSTRAINT "order_invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;