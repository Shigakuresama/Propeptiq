DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "refunds" LIMIT 1) THEN
		RAISE EXCEPTION 'Task 5 verified_payment_event_id reconciliation required before migration: populated refunds need an operator-reviewed source-payment mapping';
	END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "verified_payment_event_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_verified_payment_order_fk" FOREIGN KEY ("verified_payment_event_id","order_id") REFERENCES "public"."payment_events"("id","order_id") ON DELETE restrict ON UPDATE no action;
