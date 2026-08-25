CREATE TYPE "public"."actor_status" AS ENUM('active', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('draft', 'submitted', 'manual_review', 'approved', 'rejected', 'suspended', 'expired');--> statement-breakpoint
CREATE TYPE "public"."attestation_context" AS ENUM('application', 'checkout');--> statement-breakpoint
CREATE TYPE "public"."cart_status" AS ENUM('active', 'converted', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."category_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."checkout_attempt_status" AS ENUM('created', 'open', 'completed', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."compliance_case_state" AS ENUM('open', 'approved', 'rejected', 'expired', 'closed');--> statement-breakpoint
CREATE TYPE "public"."decision_outcome" AS ENUM('approved', 'rejected', 'suspended', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."gate_key" AS ENUM('buyer_verification', 'catalog_approval', 'product_jurisdiction', 'payment_provider', 'tax', 'shipping', 'inventory_lot', 'compliance_clearance', 'launch_control');--> statement-breakpoint
CREATE TYPE "public"."gate_status" AS ENUM('pass', 'manual_review', 'blocked', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."idempotency_status" AS ENUM('in_progress', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."inventory_event_type" AS ENUM('receipt', 'reservation', 'release', 'adjustment', 'fulfillment');--> statement-breakpoint
CREATE TYPE "public"."jurisdiction_class" AS ENUM('state', 'district', 'territory');--> statement-breakpoint
CREATE TYPE "public"."jurisdiction_decision" AS ENUM('allowed', 'manual_review', 'blocked', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."launch_gate_state" AS ENUM('closed', 'open', 'manual_review', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."lot_status" AS ENUM('draft', 'quarantined', 'released', 'exhausted', 'recalled');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('invited', 'active', 'suspended', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."order_state" AS ENUM('draft', 'eligibility_review', 'compliance_hold', 'ready_for_checkout', 'checkout_pending', 'payment_failed', 'paid_pending_clearance', 'paid_on_hold', 'ready_for_fulfillment', 'fulfillment_in_progress', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."organization_kind" AS ENUM('buyer', 'internal');--> statement-breakpoint
CREATE TYPE "public"."organization_status" AS ENUM('draft', 'active', 'suspended', 'closed');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'processing', 'sent', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."payment_event_type" AS ENUM('payment_verified', 'payment_failed', 'refund_verified', 'dispute_recorded');--> statement-breakpoint
CREATE TYPE "public"."private_object_kind" AS ENUM('application_evidence', 'coa', 'product_media');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."product_version_status" AS ENUM('draft', 'approved', 'published', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."provider_event_state" AS ENUM('pending', 'processing', 'processed', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('requested', 'submitted', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."release_event_type" AS ENUM('issued', 'revoked', 'expired', 'consumed');--> statement-breakpoint
CREATE TYPE "public"."reservation_state" AS ENUM('active', 'released', 'consumed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('pending', 'passed', 'failed', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."shipment_state" AS ENUM('pending', 'handed_off', 'delivered', 'exception');--> statement-breakpoint
CREATE TABLE "actors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"status" "actor_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actors_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE "application_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"private_object_id" uuid NOT NULL,
	"evidence_kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_evidence_object_unique" UNIQUE("private_object_id")
);
--> statement-breakpoint
CREATE TABLE "approval_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"outcome" "decision_outcome" NOT NULL,
	"reason" text NOT NULL,
	"evidence_reference" text NOT NULL,
	"decided_by_actor_id" uuid NOT NULL,
	"step_up_verified_at" timestamp with time zone NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_decisions_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "approval_decisions_reason_nonblank" CHECK (length(btrim("approval_decisions"."reason")) > 0),
	CONSTRAINT "approval_decisions_evidence_nonblank" CHECK (length(btrim("approval_decisions"."evidence_reference")) > 0)
);
--> statement-breakpoint
CREATE TABLE "attestation_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"context" "attestation_context" NOT NULL,
	"version" text NOT NULL,
	"exact_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"approved_by_actor_id" uuid NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attestation_versions_context_version_unique" UNIQUE("context","version"),
	CONSTRAINT "attestation_versions_content_hash_format" CHECK ("attestation_versions"."content_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "attestation_versions_effective_interval" CHECK ("attestation_versions"."expires_at" is null or "attestation_versions"."expires_at" > "attestation_versions"."effective_at")
);
--> statement-breakpoint
CREATE TABLE "attestations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"organization_id" uuid,
	"attestation_version_id" uuid NOT NULL,
	"context" "attestation_context" NOT NULL,
	"application_id" uuid,
	"order_id" uuid,
	"purpose" text NOT NULL,
	"request_context_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attestations_context_parent" CHECK (("attestations"."context" = 'application' and "attestations"."application_id" is not null and "attestations"."order_id" is null)
        or ("attestations"."context" = 'checkout' and "attestations"."application_id" is null and "attestations"."order_id" is not null)),
	CONSTRAINT "attestations_request_context_hash_format" CHECK ("attestations"."request_context_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"service_identity" text,
	"organization_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"decision" text NOT NULL,
	"correlation_id" text NOT NULL,
	"redacted_metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_correlation_resource_action_unique" UNIQUE("correlation_id","resource_type","resource_id","action"),
	CONSTRAINT "audit_events_exactly_one_actor" CHECK (num_nonnulls("audit_events"."actor_id", "audit_events"."service_identity") = 1)
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_cart_product_unique" UNIQUE("cart_id","product_id"),
	CONSTRAINT "cart_items_quantity_positive" CHECK ("cart_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_actor_id" uuid,
	"owner_organization_id" uuid,
	"status" "cart_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "carts_exactly_one_owner" CHECK (num_nonnulls("carts"."owner_actor_id", "carts"."owner_organization_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_key" text NOT NULL,
	"status" "category_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_catalog_key_unique" UNIQUE("catalog_key")
);
--> statement-breakpoint
CREATE TABLE "checkout_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"provider" text NOT NULL,
	"provider_session_id" text,
	"idempotency_key" text NOT NULL,
	"status" "checkout_attempt_status" DEFAULT 'created' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "checkout_attempts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "checkout_attempts_provider_session_unique" UNIQUE("provider","provider_session_id"),
	CONSTRAINT "checkout_attempts_currency_format" CHECK ("checkout_attempts"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "checkout_attempts_amount_safe" CHECK ("checkout_attempts"."amount_minor" between 0 and $1)
);
--> statement-breakpoint
CREATE TABLE "coa_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"private_object_id" uuid NOT NULL,
	"review_status" "review_status" DEFAULT 'pending' NOT NULL,
	"approved_by_actor_id" uuid,
	"approved_at" timestamp with time zone,
	"result_summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coa_documents_private_object_unique" UNIQUE("private_object_id"),
	CONSTRAINT "coa_documents_approval_complete" CHECK ("coa_documents"."review_status" <> 'approved' or num_nonnulls("coa_documents"."approved_by_actor_id", "coa_documents"."approved_at") = 2)
);
--> statement-breakpoint
CREATE TABLE "compliance_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"order_id" uuid,
	"order_item_id" uuid,
	"case_type" text NOT NULL,
	"state" "compliance_case_state" DEFAULT 'open' NOT NULL,
	"reason_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "compliance_cases_reason_code_format" CHECK ("compliance_cases"."reason_code" ~ '^[a-z0-9_]+$'),
	CONSTRAINT "compliance_cases_item_requires_order" CHECK ("compliance_cases"."order_item_id" is null or "compliance_cases"."order_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "compliance_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"decided_by_actor_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"outcome" "decision_outcome" NOT NULL,
	"reason" text NOT NULL,
	"evidence_reference" text NOT NULL,
	"step_up_verified_at" timestamp with time zone NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_decisions_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "compliance_decisions_reason_nonblank" CHECK (length(btrim("compliance_decisions"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "eligibility_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"buyer_actor_id" uuid,
	"buyer_organization_id" uuid,
	"attestation_version_id" uuid NOT NULL,
	"input_hash" text NOT NULL,
	"policy_version_hash" text NOT NULL,
	"decision" "gate_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eligibility_evaluations_order_input_unique" UNIQUE("order_id","input_hash"),
	CONSTRAINT "eligibility_evaluations_exactly_one_buyer" CHECK (num_nonnulls("eligibility_evaluations"."buyer_actor_id", "eligibility_evaluations"."buyer_organization_id") = 1),
	CONSTRAINT "eligibility_evaluations_input_hash_format" CHECK ("eligibility_evaluations"."input_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "eligibility_evaluations_policy_hash_format" CHECK ("eligibility_evaluations"."policy_version_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "eligibility_gates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"gate_key" "gate_key" NOT NULL,
	"status" "gate_status" NOT NULL,
	"reason_code" text NOT NULL,
	"evidence_references" jsonb NOT NULL,
	CONSTRAINT "eligibility_gates_evaluation_gate_unique" UNIQUE("evaluation_id","gate_key"),
	CONSTRAINT "eligibility_gates_non_line_only" CHECK ("eligibility_gates"."gate_key" <> 'product_jurisdiction'),
	CONSTRAINT "eligibility_gates_reason_code_format" CHECK ("eligibility_gates"."reason_code" ~ '^[a-z0-9_]+$')
);
--> statement-breakpoint
CREATE TABLE "eligibility_line_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"product_jurisdiction_rule_id" uuid,
	"status" "gate_status" NOT NULL,
	"reason_code" text NOT NULL,
	"evidence_references" jsonb NOT NULL,
	CONSTRAINT "eligibility_line_results_evaluation_item_unique" UNIQUE("evaluation_id","order_item_id"),
	CONSTRAINT "eligibility_line_results_reason_code_format" CHECK ("eligibility_line_results"."reason_code" ~ '^[a-z0-9_]+$')
);
--> statement-breakpoint
CREATE TABLE "fulfillment_release_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"event_type" "release_event_type" NOT NULL,
	"payment_journal_id" uuid,
	"clearance_evaluation_id" uuid,
	"actor_id" uuid,
	"reason_code" text,
	"expires_at" timestamp with time zone,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fulfillment_release_events_release_version_unique" UNIQUE("release_id","version"),
	CONSTRAINT "fulfillment_release_events_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "fulfillment_release_events_version_positive" CHECK ("fulfillment_release_events"."version" > 0),
	CONSTRAINT "fulfillment_release_events_issue_evidence" CHECK ("fulfillment_release_events"."event_type" <> 'issued' or num_nonnulls("fulfillment_release_events"."payment_journal_id", "fulfillment_release_events"."clearance_evaluation_id", "fulfillment_release_events"."expires_at") = 3),
	CONSTRAINT "fulfillment_release_events_reason_format" CHECK ("fulfillment_release_events"."reason_code" is null or "fulfillment_release_events"."reason_code" ~ '^[a-z0-9_]+$')
);
--> statement-breakpoint
CREATE TABLE "fulfillment_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fulfillment_releases_order_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_hash" text,
	"status" "idempotency_status" DEFAULT 'in_progress' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_records_scope_key_unique" UNIQUE("scope","idempotency_key"),
	CONSTRAINT "idempotency_records_request_hash_format" CHECK ("idempotency_records"."request_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "idempotency_records_response_hash_format" CHECK ("idempotency_records"."response_hash" is null or "idempotency_records"."response_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "inventory_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"event_type" "inventory_event_type" NOT NULL,
	"quantity_delta" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"actor_id" uuid,
	"reason_code" text NOT NULL,
	"reference_type" text NOT NULL,
	"reference_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_ledger_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "inventory_ledger_quantity_delta_nonzero" CHECK ("inventory_ledger"."quantity_delta" <> 0),
	CONSTRAINT "inventory_ledger_balance_nonnegative" CHECK ("inventory_ledger"."balance_after" >= 0),
	CONSTRAINT "inventory_ledger_reason_code_format" CHECK ("inventory_ledger"."reason_code" ~ '^[a-z0-9_]+$')
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lot_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"state" "reservation_state" DEFAULT 'active' NOT NULL,
	"idempotency_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_reservations_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "inventory_reservations_quantity_positive" CHECK ("inventory_reservations"."quantity" > 0),
	CONSTRAINT "inventory_reservations_expiry_after_creation" CHECK ("inventory_reservations"."expires_at" > "inventory_reservations"."created_at")
);
--> statement-breakpoint
CREATE TABLE "jurisdiction_policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"content_hash" text NOT NULL,
	"drafted_by_actor_id" uuid NOT NULL,
	"approved_by_actor_id" uuid NOT NULL,
	"evidence_object_id" uuid NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"review_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jurisdiction_policy_versions_version_unique" UNIQUE("version"),
	CONSTRAINT "jurisdiction_policy_versions_version_positive" CHECK ("jurisdiction_policy_versions"."version" > 0),
	CONSTRAINT "jurisdiction_policy_versions_content_hash_format" CHECK ("jurisdiction_policy_versions"."content_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "jurisdiction_policy_versions_separation_of_duties" CHECK ("jurisdiction_policy_versions"."approved_by_actor_id" <> "jurisdiction_policy_versions"."drafted_by_actor_id"),
	CONSTRAINT "jurisdiction_policy_versions_review_after_effective" CHECK ("jurisdiction_policy_versions"."review_at" > "jurisdiction_policy_versions"."effective_at"),
	CONSTRAINT "jurisdiction_policy_versions_expiry_after_effective" CHECK ("jurisdiction_policy_versions"."expires_at" is null or "jurisdiction_policy_versions"."expires_at" > "jurisdiction_policy_versions"."effective_at")
);
--> statement-breakpoint
CREATE TABLE "jurisdictions" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"class" "jurisdiction_class" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jurisdictions_code_format" CHECK ("jurisdictions"."code" ~ '^[A-Z]{2}$'),
	CONSTRAINT "jurisdictions_name_nonblank" CHECK (length(btrim("jurisdictions"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "launch_gates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment" text NOT NULL,
	"scope" text NOT NULL,
	"version" integer NOT NULL,
	"state" "launch_gate_state" DEFAULT 'closed' NOT NULL,
	"approved_by_actor_id" uuid,
	"evidence_object_id" uuid,
	"content_hash" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"review_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "launch_gates_scope_version_unique" UNIQUE("environment","scope","version"),
	CONSTRAINT "launch_gates_environment" CHECK ("launch_gates"."environment" in ('local', 'preview', 'production')),
	CONSTRAINT "launch_gates_version_positive" CHECK ("launch_gates"."version" > 0),
	CONSTRAINT "launch_gates_content_hash_format" CHECK ("launch_gates"."content_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "launch_gates_open_requires_evidence" CHECK ("launch_gates"."state" <> 'open' or num_nonnulls("launch_gates"."approved_by_actor_id", "launch_gates"."evidence_object_id") = 2),
	CONSTRAINT "launch_gates_review_after_effective" CHECK ("launch_gates"."review_at" > "launch_gates"."effective_at")
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"lot_code" text NOT NULL,
	"status" "lot_status" DEFAULT 'draft' NOT NULL,
	"received_quantity" integer NOT NULL,
	"received_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"supplier_evidence_object_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lots_product_lot_code_unique" UNIQUE("product_id","lot_code"),
	CONSTRAINT "lots_received_quantity_positive" CHECK ("lots"."received_quantity" > 0),
	CONSTRAINT "lots_release_evidence_complete" CHECK ("lots"."status" <> 'released' or num_nonnulls("lots"."released_at", "lots"."supplier_evidence_object_id") = 2)
);
--> statement-breakpoint
CREATE TABLE "manual_review_case_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"product_jurisdiction_rule_id" uuid NOT NULL,
	"eligibility_evaluation_id" uuid NOT NULL,
	"eligibility_evaluation_hash" text NOT NULL,
	"outcome" "decision_outcome" NOT NULL,
	"decided_by_actor_id" uuid NOT NULL,
	"evidence_reference" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "manual_review_case_decisions_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "manual_review_case_decisions_outcome" CHECK ("manual_review_case_decisions"."outcome" in ('approved', 'rejected')),
	CONSTRAINT "manual_review_case_decisions_hash_format" CHECK ("manual_review_case_decisions"."eligibility_evaluation_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "manual_review_case_decisions_expiry_after_decision" CHECK ("manual_review_case_decisions"."expires_at" > "manual_review_case_decisions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"lot_id" uuid,
	"price_book_id" uuid NOT NULL,
	"product_jurisdiction_rule_id" uuid,
	"quantity" integer NOT NULL,
	"currency" text NOT NULL,
	"unit_amount_minor" bigint NOT NULL,
	"line_total_minor" bigint NOT NULL,
	"price_snapshot_hash" text NOT NULL,
	"product_snapshot" jsonb NOT NULL,
	"product_snapshot_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_id_order_unique" UNIQUE("id","order_id"),
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_currency_format" CHECK ("order_items"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "order_items_money_safe" CHECK ("order_items"."unit_amount_minor" between 0 and $1
        and "order_items"."line_total_minor" between 0 and $2),
	CONSTRAINT "order_items_line_total_matches" CHECK ("order_items"."line_total_minor" = "order_items"."unit_amount_minor" * "order_items"."quantity"),
	CONSTRAINT "order_items_price_snapshot_hash_format" CHECK ("order_items"."price_snapshot_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "order_items_product_snapshot_hash_format" CHECK ("order_items"."product_snapshot_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_actor_id" uuid,
	"buyer_organization_id" uuid,
	"state" "order_state" DEFAULT 'draft' NOT NULL,
	"currency" text NOT NULL,
	"subtotal_minor" bigint NOT NULL,
	"tax_minor" bigint NOT NULL,
	"shipping_minor" bigint NOT NULL,
	"total_minor" bigint NOT NULL,
	"destination_jurisdiction_code" text NOT NULL,
	"destination_snapshot" jsonb NOT NULL,
	"destination_hash" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_id_currency_unique" UNIQUE("id","currency"),
	CONSTRAINT "orders_exactly_one_buyer" CHECK (num_nonnulls("orders"."buyer_actor_id", "orders"."buyer_organization_id") = 1),
	CONSTRAINT "orders_currency_format" CHECK ("orders"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "orders_money_safe" CHECK ("orders"."subtotal_minor" between 0 and $1
        and "orders"."tax_minor" between 0 and $2
        and "orders"."shipping_minor" between 0 and $3
        and "orders"."total_minor" between 0 and $4),
	CONSTRAINT "orders_total_matches_components" CHECK ("orders"."total_minor" = "orders"."subtotal_minor" + "orders"."tax_minor" + "orders"."shipping_minor"),
	CONSTRAINT "orders_destination_hash_format" CHECK ("orders"."destination_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "orders_version_positive" CHECK ("orders"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"business_role" text NOT NULL,
	"status" "membership_status" DEFAULT 'invited' NOT NULL,
	"evidence_reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "organization_memberships_actor_organization_unique" UNIQUE("actor_id","organization_id"),
	CONSTRAINT "organization_memberships_business_role_nonblank" CHECK (length(btrim("organization_memberships"."business_role")) > 0),
	CONSTRAINT "organization_memberships_evidence_reference_nonblank" CHECK (length(btrim("organization_memberships"."evidence_reference")) > 0)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_organization_id" text,
	"kind" "organization_kind" NOT NULL,
	"status" "organization_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_clerk_organization_id_unique" UNIQUE("clerk_organization_id")
);
--> statement-breakpoint
CREATE TABLE "outbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"order_id" uuid,
	"template_key" text NOT NULL,
	"recipient_reference" text NOT NULL,
	"subject_hash" text NOT NULL,
	"body_hash" text NOT NULL,
	"content_policy_hash" text NOT NULL,
	"template_data" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_messages_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "outbox_messages_hashes_format" CHECK ("outbox_messages"."subject_hash" ~ '^[a-f0-9]{64}$'
        and "outbox_messages"."body_hash" ~ '^[a-f0-9]{64}$'
        and "outbox_messages"."content_policy_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "outbox_messages_attempt_count_nonnegative" CHECK ("outbox_messages"."attempt_count" >= 0),
	CONSTRAINT "outbox_messages_lease_pair" CHECK (num_nonnulls("outbox_messages"."lease_owner", "outbox_messages"."lease_expires_at") in (0, 2))
);
--> statement-breakpoint
CREATE TABLE "payment_journal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider_event_id" uuid NOT NULL,
	"event_type" "payment_event_type" NOT NULL,
	"provider_payment_reference" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"evidence_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_journal_provider_event_type_unique" UNIQUE("provider_event_id","event_type"),
	CONSTRAINT "payment_journal_currency_format" CHECK ("payment_journal"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "payment_journal_amount_safe" CHECK ("payment_journal"."amount_minor" between 0 and $1),
	CONSTRAINT "payment_journal_evidence_hash_format" CHECK ("payment_journal"."evidence_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "price_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"unit_amount_minor" bigint NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"approved_by_actor_id" uuid NOT NULL,
	"evidence_object_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_books_currency_format" CHECK ("price_books"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "price_books_amount_safe" CHECK ("price_books"."unit_amount_minor" >= 0 and "price_books"."unit_amount_minor" <= $1),
	CONSTRAINT "price_books_effective_interval" CHECK ("price_books"."expires_at" is null or "price_books"."expires_at" > "price_books"."effective_at"),
	CONSTRAINT "price_books_content_hash_format" CHECK ("price_books"."content_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "private_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "private_object_kind" NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"retention_class" text NOT NULL,
	"scan_status" "scan_status" DEFAULT 'pending' NOT NULL,
	"created_by_actor_id" uuid,
	"approved_by_actor_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_objects_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "private_objects_sha256_format" CHECK ("private_objects"."sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "private_objects_byte_size_nonnegative" CHECK ("private_objects"."byte_size" >= 0),
	CONSTRAINT "private_objects_approval_pair" CHECK (num_nonnulls("private_objects"."approved_by_actor_id", "private_objects"."approved_at") in (0, 2))
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"product_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "product_categories_product_id_category_id_pk" PRIMARY KEY("product_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "product_jurisdiction_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"jurisdiction_code" text NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"decision" "jurisdiction_decision" NOT NULL,
	"reason_code" text NOT NULL,
	"rationale" text NOT NULL,
	"evidence_object_id" uuid NOT NULL,
	"evidence_integrity_verified" boolean DEFAULT false NOT NULL,
	"effective_at" timestamp with time zone NOT NULL,
	"review_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_jurisdiction_rules_policy_scope_unique" UNIQUE("product_id","jurisdiction_code","policy_version_id"),
	CONSTRAINT "product_jurisdiction_rules_reason_code_format" CHECK ("product_jurisdiction_rules"."reason_code" ~ '^[a-z0-9_]+$'),
	CONSTRAINT "product_jurisdiction_rules_review_after_effective" CHECK ("product_jurisdiction_rules"."review_at" > "product_jurisdiction_rules"."effective_at"),
	CONSTRAINT "product_jurisdiction_rules_expiry_after_effective" CHECK ("product_jurisdiction_rules"."expires_at" is null or "product_jurisdiction_rules"."expires_at" > "product_jurisdiction_rules"."effective_at")
);
--> statement-breakpoint
CREATE TABLE "product_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "product_version_status" DEFAULT 'draft' NOT NULL,
	"content_hash" text NOT NULL,
	"content" jsonb NOT NULL,
	"drafted_by_actor_id" uuid NOT NULL,
	"approved_by_actor_id" uuid,
	"evidence_object_id" uuid,
	"approved_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_versions_product_version_unique" UNIQUE("product_id","version"),
	CONSTRAINT "product_versions_version_positive" CHECK ("product_versions"."version" > 0),
	CONSTRAINT "product_versions_content_hash_format" CHECK ("product_versions"."content_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "product_versions_separation_of_duties" CHECK ("product_versions"."approved_by_actor_id" is null or "product_versions"."approved_by_actor_id" <> "product_versions"."drafted_by_actor_id"),
	CONSTRAINT "product_versions_approval_complete" CHECK (("product_versions"."status" = 'draft') or num_nonnulls("product_versions"."approved_by_actor_id", "product_versions"."evidence_object_id", "product_versions"."approved_at") = 3)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_key" text NOT NULL,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_catalog_key_unique" UNIQUE("catalog_key")
);
--> statement-breakpoint
CREATE TABLE "provider_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"payload_hash" text NOT NULL,
	"payload_object_id" uuid,
	"state" "provider_event_state" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"last_error_redacted" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "provider_webhook_events_provider_event_unique" UNIQUE("provider","provider_event_id"),
	CONSTRAINT "provider_webhook_events_payload_hash_format" CHECK ("provider_webhook_events"."payload_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "provider_webhook_events_attempt_count_nonnegative" CHECK ("provider_webhook_events"."attempt_count" >= 0),
	CONSTRAINT "provider_webhook_events_lease_pair" CHECK (num_nonnulls("provider_webhook_events"."lease_owner", "provider_webhook_events"."lease_expires_at") in (0, 2))
);
--> statement-breakpoint
CREATE TABLE "refund_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_journal_id" uuid NOT NULL,
	"requested_by_actor_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"reason" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "refund_status" DEFAULT 'requested' NOT NULL,
	"provider_refund_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "refund_requests_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "refund_requests_currency_format" CHECK ("refund_requests"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "refund_requests_amount_safe" CHECK ("refund_requests"."amount_minor" > 0 and "refund_requests"."amount_minor" <= $1),
	CONSTRAINT "refund_requests_reason_nonblank" CHECK (length(btrim("refund_requests"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "researcher_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_actor_id" uuid NOT NULL,
	"organization_id" uuid,
	"application_version" integer NOT NULL,
	"status" "application_status" DEFAULT 'draft' NOT NULL,
	"research_purpose" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "researcher_applications_actor_version_unique" UNIQUE("applicant_actor_id","application_version"),
	CONSTRAINT "researcher_applications_version_positive" CHECK ("researcher_applications"."application_version" > 0),
	CONSTRAINT "researcher_applications_purpose_nonblank" CHECK (length(btrim("researcher_applications"."research_purpose")) > 0)
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"consumed_release_event_id" uuid NOT NULL,
	"state" "shipment_state" DEFAULT 'pending' NOT NULL,
	"carrier" text,
	"tracking_number" text,
	"handed_off_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipments_consumed_release_event_unique" UNIQUE("consumed_release_event_id"),
	CONSTRAINT "shipments_carrier_tracking_pair" CHECK (num_nonnulls("shipments"."carrier", "shipments"."tracking_number") in (0, 2))
);
--> statement-breakpoint
CREATE TABLE "staff_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"organization_id" uuid,
	"capability" text NOT NULL,
	"resource_type" text,
	"resource_id" uuid,
	"granted_by_actor_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"evidence_reference" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "staff_capabilities_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "staff_capabilities_no_self_grant" CHECK ("staff_capabilities"."actor_id" <> "staff_capabilities"."granted_by_actor_id"),
	CONSTRAINT "staff_capabilities_resource_scope_complete" CHECK (num_nonnulls("staff_capabilities"."resource_type", "staff_capabilities"."resource_id") in (0, 2)),
	CONSTRAINT "staff_capabilities_capability_nonblank" CHECK (length(btrim("staff_capabilities"."capability")) > 0)
);
--> statement-breakpoint
ALTER TABLE "application_evidence" ADD CONSTRAINT "application_evidence_application_id_researcher_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."researcher_applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_evidence" ADD CONSTRAINT "application_evidence_private_object_id_private_objects_id_fk" FOREIGN KEY ("private_object_id") REFERENCES "public"."private_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_application_id_researcher_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."researcher_applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_decided_by_actor_id_actors_id_fk" FOREIGN KEY ("decided_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestation_versions" ADD CONSTRAINT "attestation_versions_approved_by_actor_id_actors_id_fk" FOREIGN KEY ("approved_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_attestation_version_id_attestation_versions_id_fk" FOREIGN KEY ("attestation_version_id") REFERENCES "public"."attestation_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_application_id_researcher_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."researcher_applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_owner_actor_id_actors_id_fk" FOREIGN KEY ("owner_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_owner_organization_id_organizations_id_fk" FOREIGN KEY ("owner_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD CONSTRAINT "checkout_attempts_order_currency_fk" FOREIGN KEY ("order_id","currency") REFERENCES "public"."orders"("id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coa_documents" ADD CONSTRAINT "coa_documents_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coa_documents" ADD CONSTRAINT "coa_documents_private_object_id_private_objects_id_fk" FOREIGN KEY ("private_object_id") REFERENCES "public"."private_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coa_documents" ADD CONSTRAINT "coa_documents_approved_by_actor_id_actors_id_fk" FOREIGN KEY ("approved_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_cases" ADD CONSTRAINT "compliance_cases_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_cases" ADD CONSTRAINT "compliance_cases_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_cases" ADD CONSTRAINT "compliance_cases_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_decisions" ADD CONSTRAINT "compliance_decisions_case_id_compliance_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."compliance_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_decisions" ADD CONSTRAINT "compliance_decisions_decided_by_actor_id_actors_id_fk" FOREIGN KEY ("decided_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_evaluations" ADD CONSTRAINT "eligibility_evaluations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_evaluations" ADD CONSTRAINT "eligibility_evaluations_buyer_actor_id_actors_id_fk" FOREIGN KEY ("buyer_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_evaluations" ADD CONSTRAINT "eligibility_evaluations_buyer_organization_id_organizations_id_fk" FOREIGN KEY ("buyer_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_evaluations" ADD CONSTRAINT "eligibility_evaluations_attestation_version_id_attestation_versions_id_fk" FOREIGN KEY ("attestation_version_id") REFERENCES "public"."attestation_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_gates" ADD CONSTRAINT "eligibility_gates_evaluation_id_eligibility_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."eligibility_evaluations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_line_results" ADD CONSTRAINT "eligibility_line_results_evaluation_id_eligibility_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."eligibility_evaluations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_line_results" ADD CONSTRAINT "eligibility_line_results_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eligibility_line_results" ADD CONSTRAINT "eligibility_line_results_product_jurisdiction_rule_id_product_jurisdiction_rules_id_fk" FOREIGN KEY ("product_jurisdiction_rule_id") REFERENCES "public"."product_jurisdiction_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_release_events" ADD CONSTRAINT "fulfillment_release_events_release_id_fulfillment_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."fulfillment_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_release_events" ADD CONSTRAINT "fulfillment_release_events_payment_journal_id_payment_journal_id_fk" FOREIGN KEY ("payment_journal_id") REFERENCES "public"."payment_journal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_release_events" ADD CONSTRAINT "fulfillment_release_events_clearance_evaluation_id_eligibility_evaluations_id_fk" FOREIGN KEY ("clearance_evaluation_id") REFERENCES "public"."eligibility_evaluations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_release_events" ADD CONSTRAINT "fulfillment_release_events_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfillment_releases" ADD CONSTRAINT "fulfillment_releases_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jurisdiction_policy_versions" ADD CONSTRAINT "jurisdiction_policy_versions_drafted_by_actor_id_actors_id_fk" FOREIGN KEY ("drafted_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jurisdiction_policy_versions" ADD CONSTRAINT "jurisdiction_policy_versions_approved_by_actor_id_actors_id_fk" FOREIGN KEY ("approved_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jurisdiction_policy_versions" ADD CONSTRAINT "jurisdiction_policy_versions_evidence_object_id_private_objects_id_fk" FOREIGN KEY ("evidence_object_id") REFERENCES "public"."private_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "launch_gates" ADD CONSTRAINT "launch_gates_approved_by_actor_id_actors_id_fk" FOREIGN KEY ("approved_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "launch_gates" ADD CONSTRAINT "launch_gates_evidence_object_id_private_objects_id_fk" FOREIGN KEY ("evidence_object_id") REFERENCES "public"."private_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_supplier_evidence_object_id_private_objects_id_fk" FOREIGN KEY ("supplier_evidence_object_id") REFERENCES "public"."private_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_review_case_decisions" ADD CONSTRAINT "manual_review_case_decisions_case_id_compliance_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."compliance_cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_review_case_decisions" ADD CONSTRAINT "manual_review_case_decisions_product_jurisdiction_rule_id_product_jurisdiction_rules_id_fk" FOREIGN KEY ("product_jurisdiction_rule_id") REFERENCES "public"."product_jurisdiction_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_review_case_decisions" ADD CONSTRAINT "manual_review_case_decisions_eligibility_evaluation_id_eligibility_evaluations_id_fk" FOREIGN KEY ("eligibility_evaluation_id") REFERENCES "public"."eligibility_evaluations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_review_case_decisions" ADD CONSTRAINT "manual_review_case_decisions_decided_by_actor_id_actors_id_fk" FOREIGN KEY ("decided_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_review_case_decisions" ADD CONSTRAINT "manual_review_case_decisions_item_order_fk" FOREIGN KEY ("order_item_id","order_id") REFERENCES "public"."order_items"("id","order_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_price_book_id_price_books_id_fk" FOREIGN KEY ("price_book_id") REFERENCES "public"."price_books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_jurisdiction_rule_id_product_jurisdiction_rules_id_fk" FOREIGN KEY ("product_jurisdiction_rule_id") REFERENCES "public"."product_jurisdiction_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_currency_fk" FOREIGN KEY ("order_id","currency") REFERENCES "public"."orders"("id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_actor_id_actors_id_fk" FOREIGN KEY ("buyer_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_organization_id_organizations_id_fk" FOREIGN KEY ("buyer_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_destination_jurisdiction_code_jurisdictions_code_fk" FOREIGN KEY ("destination_jurisdiction_code") REFERENCES "public"."jurisdictions"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_journal" ADD CONSTRAINT "payment_journal_provider_event_id_provider_webhook_events_id_fk" FOREIGN KEY ("provider_event_id") REFERENCES "public"."provider_webhook_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_journal" ADD CONSTRAINT "payment_journal_order_currency_fk" FOREIGN KEY ("order_id","currency") REFERENCES "public"."orders"("id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_books" ADD CONSTRAINT "price_books_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_books" ADD CONSTRAINT "price_books_approved_by_actor_id_actors_id_fk" FOREIGN KEY ("approved_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_books" ADD CONSTRAINT "price_books_evidence_object_id_private_objects_id_fk" FOREIGN KEY ("evidence_object_id") REFERENCES "public"."private_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_objects" ADD CONSTRAINT "private_objects_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_objects" ADD CONSTRAINT "private_objects_approved_by_actor_id_actors_id_fk" FOREIGN KEY ("approved_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_jurisdiction_rules" ADD CONSTRAINT "product_jurisdiction_rules_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_jurisdiction_rules" ADD CONSTRAINT "product_jurisdiction_rules_jurisdiction_code_jurisdictions_code_fk" FOREIGN KEY ("jurisdiction_code") REFERENCES "public"."jurisdictions"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_jurisdiction_rules" ADD CONSTRAINT "product_jurisdiction_rules_policy_version_id_jurisdiction_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."jurisdiction_policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_jurisdiction_rules" ADD CONSTRAINT "product_jurisdiction_rules_evidence_object_id_private_objects_id_fk" FOREIGN KEY ("evidence_object_id") REFERENCES "public"."private_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_drafted_by_actor_id_actors_id_fk" FOREIGN KEY ("drafted_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_approved_by_actor_id_actors_id_fk" FOREIGN KEY ("approved_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_evidence_object_id_private_objects_id_fk" FOREIGN KEY ("evidence_object_id") REFERENCES "public"."private_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_webhook_events" ADD CONSTRAINT "provider_webhook_events_payload_object_id_private_objects_id_fk" FOREIGN KEY ("payload_object_id") REFERENCES "public"."private_objects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_payment_journal_id_payment_journal_id_fk" FOREIGN KEY ("payment_journal_id") REFERENCES "public"."payment_journal"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_requested_by_actor_id_actors_id_fk" FOREIGN KEY ("requested_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_order_currency_fk" FOREIGN KEY ("order_id","currency") REFERENCES "public"."orders"("id","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "researcher_applications" ADD CONSTRAINT "researcher_applications_applicant_actor_id_actors_id_fk" FOREIGN KEY ("applicant_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "researcher_applications" ADD CONSTRAINT "researcher_applications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_release_id_fulfillment_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."fulfillment_releases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_consumed_release_event_id_fulfillment_release_events_id_fk" FOREIGN KEY ("consumed_release_event_id") REFERENCES "public"."fulfillment_release_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_capabilities" ADD CONSTRAINT "staff_capabilities_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_capabilities" ADD CONSTRAINT "staff_capabilities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_capabilities" ADD CONSTRAINT "staff_capabilities_granted_by_actor_id_actors_id_fk" FOREIGN KEY ("granted_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_evidence_application_idx" ON "application_evidence" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "approval_decisions_application_idx" ON "approval_decisions" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "attestations_actor_idx" ON "attestations" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_events_organization_occurred_idx" ON "audit_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "coa_documents_lot_idx" ON "coa_documents" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "compliance_cases_organization_idx" ON "compliance_cases" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "compliance_cases_order_idx" ON "compliance_cases" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "compliance_decisions_case_idx" ON "compliance_decisions" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fulfillment_release_events_consume_once_unique" ON "fulfillment_release_events" USING btree ("release_id") WHERE "fulfillment_release_events"."event_type" = 'consumed';--> statement-breakpoint
CREATE INDEX "inventory_ledger_lot_occurred_idx" ON "inventory_ledger" USING btree ("lot_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservations_active_order_item_unique" ON "inventory_reservations" USING btree ("order_item_id") WHERE "inventory_reservations"."state" = 'active';--> statement-breakpoint
CREATE INDEX "inventory_reservations_lot_state_idx" ON "inventory_reservations" USING btree ("lot_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "jurisdiction_policy_versions_current_unique" ON "jurisdiction_policy_versions" USING btree (((1))) WHERE "jurisdiction_policy_versions"."superseded_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "launch_gates_current_scope_unique" ON "launch_gates" USING btree ("environment","scope") WHERE "launch_gates"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_buyer_organization_idx" ON "orders" USING btree ("buyer_organization_id");--> statement-breakpoint
CREATE INDEX "organization_memberships_organization_idx" ON "organization_memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "outbox_messages_delivery_idx" ON "outbox_messages" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "payment_journal_order_occurred_idx" ON "payment_journal" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "price_books_product_currency_idx" ON "price_books" USING btree ("product_id","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "product_jurisdiction_rules_current_scope_unique" ON "product_jurisdiction_rules" USING btree ("product_id","jurisdiction_code") WHERE "product_jurisdiction_rules"."superseded_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "product_versions_current_published_unique" ON "product_versions" USING btree ("product_id") WHERE "product_versions"."status" = 'published' and "product_versions"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "provider_webhook_events_retry_idx" ON "provider_webhook_events" USING btree ("state","lease_expires_at");--> statement-breakpoint
CREATE INDEX "researcher_applications_organization_idx" ON "researcher_applications" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_capabilities_active_scope_unique" ON "staff_capabilities" USING btree ("actor_id","capability","organization_id","resource_type","resource_id") WHERE "staff_capabilities"."revoked_at" is null;