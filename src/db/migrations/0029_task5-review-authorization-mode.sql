ALTER TABLE "checkout_attempts" ADD COLUMN "review_authorization_mode" text;--> statement-breakpoint
ALTER TABLE "checkout_attempts" ADD CONSTRAINT "checkout_attempts_review_authorization_mode" CHECK ("checkout_attempts"."review_authorization_mode" is null
          or "checkout_attempts"."review_authorization_mode" in ('bound', 'none'));--> statement-breakpoint
UPDATE "checkout_attempts" AS attempt
SET "review_authorization_mode" = 'bound'
WHERE EXISTS (
	SELECT 1
	FROM "checkout_attempt_review_bindings" AS binding
	WHERE binding."checkout_attempt_id" = attempt."id"
	  AND binding."order_id" = attempt."order_id"
);--> statement-breakpoint
CREATE FUNCTION checkout_attempt_review_authorization_mode_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.review_authorization_mode IS NOT NULL
     AND NEW.review_authorization_mode IS DISTINCT FROM OLD.review_authorization_mode THEN
    RAISE EXCEPTION 'checkout attempt review authorization mode is immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER checkout_attempt_review_authorization_mode_immutable
BEFORE UPDATE OF review_authorization_mode ON checkout_attempts
FOR EACH ROW
EXECUTE FUNCTION checkout_attempt_review_authorization_mode_immutable();
