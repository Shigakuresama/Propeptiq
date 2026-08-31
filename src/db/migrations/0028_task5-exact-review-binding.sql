CREATE TABLE "checkout_attempt_review_bindings" (
	"checkout_attempt_id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"review_request_id" uuid NOT NULL,
	"review_snapshot_hash" text NOT NULL,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkout_attempt_review_bindings_snapshot_hash" CHECK ("checkout_attempt_review_bindings"."review_snapshot_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_id_order_snapshot_unique" UNIQUE("id","order_id","snapshot_hash");--> statement-breakpoint
ALTER TABLE "checkout_attempt_review_bindings" ADD CONSTRAINT "checkout_attempt_review_bindings_attempt_order_fk" FOREIGN KEY ("checkout_attempt_id","order_id") REFERENCES "public"."checkout_attempts"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_attempt_review_bindings" ADD CONSTRAINT "checkout_attempt_review_bindings_review_identity_fk" FOREIGN KEY ("review_request_id","order_id","review_snapshot_hash") REFERENCES "public"."review_requests"("id","order_id","snapshot_hash") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "checkout_attempt_review_bindings_review_idx" ON "checkout_attempt_review_bindings" USING btree ("review_request_id");
