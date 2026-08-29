CREATE TABLE "shared_research_set_mutations" (
	"idempotency_key" text PRIMARY KEY NOT NULL,
	"shared_set_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"expected_updated_at" timestamp with time zone NOT NULL,
	"payload_hash" text NOT NULL,
	"result_public_code" text NOT NULL,
	"result_label" text NOT NULL,
	"result_active" boolean NOT NULL,
	"result_item_count" integer NOT NULL,
	"result_updated_at" timestamp with time zone NOT NULL,
	"applied_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_research_set_mutations_idempotency_opaque" CHECK (char_length("shared_research_set_mutations"."idempotency_key") between 16 and 200
        and length(btrim("shared_research_set_mutations"."idempotency_key")) > 0
        and "shared_research_set_mutations"."idempotency_key" !~ '[[:cntrl:]]'),
	CONSTRAINT "shared_research_set_mutations_kind_valid" CHECK ("shared_research_set_mutations"."kind" in ('replace', 'deactivate')),
	CONSTRAINT "shared_research_set_mutations_payload_hash_sha256" CHECK ("shared_research_set_mutations"."payload_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "shared_research_set_mutations_result_code_opaque" CHECK ("shared_research_set_mutations"."result_public_code" ~ '^set_[A-Za-z0-9_-]{16,64}$'),
	CONSTRAINT "shared_research_set_mutations_result_label_bounds" CHECK (char_length("shared_research_set_mutations"."result_label") between 1 and 120
        and length(btrim("shared_research_set_mutations"."result_label")) > 0 and "shared_research_set_mutations"."result_label" !~ '[[:cntrl:]]'),
	CONSTRAINT "shared_research_set_mutations_result_item_count_bounds" CHECK ("shared_research_set_mutations"."result_item_count" between 2 and 8),
	CONSTRAINT "shared_research_set_mutations_result_coherent" CHECK (("shared_research_set_mutations"."kind" = 'replace' and "shared_research_set_mutations"."result_active" = true)
        or ("shared_research_set_mutations"."kind" = 'deactivate' and "shared_research_set_mutations"."result_active" = false)),
	CONSTRAINT "shared_research_set_mutations_time_coherent" CHECK ("shared_research_set_mutations"."result_updated_at" > "shared_research_set_mutations"."expected_updated_at"
        and "shared_research_set_mutations"."applied_at" = "shared_research_set_mutations"."result_updated_at")
);
--> statement-breakpoint
ALTER TABLE "shared_research_sets" ADD CONSTRAINT "shared_research_sets_id_owner_unique" UNIQUE("id","owner_user_id");--> statement-breakpoint
ALTER TABLE "shared_research_set_mutations" ADD CONSTRAINT "shared_research_set_mutations_set_owner_fk" FOREIGN KEY ("shared_set_id","owner_user_id") REFERENCES "public"."shared_research_sets"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shared_research_set_mutations_set_owner_idx" ON "shared_research_set_mutations" USING btree ("shared_set_id","owner_user_id");
