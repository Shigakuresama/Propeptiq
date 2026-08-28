CREATE FUNCTION reject_reward_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'reward_ledger_entries is append-only' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reward_ledger_entries_append_only
BEFORE UPDATE OR DELETE ON reward_ledger_entries
FOR EACH ROW
EXECUTE FUNCTION reject_reward_ledger_mutation();
--> statement-breakpoint
CREATE FUNCTION enforce_growth_policy_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% rows are immutable history and cannot be deleted', TG_TABLE_NAME
      USING ERRCODE = '55000';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['status', 'superseded_at'])
      IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status', 'superseded_at']) THEN
    RAISE EXCEPTION '% immutable facts cannot be changed', TG_TABLE_NAME
      USING ERRCODE = '55000';
  END IF;

  IF OLD.status = 'superseded' THEN
    IF NEW.status <> 'superseded'
       OR NEW.superseded_at IS DISTINCT FROM OLD.superseded_at THEN
      RAISE EXCEPTION '% superseded lifecycle cannot be reversed or retimed', TG_TABLE_NAME
        USING ERRCODE = '55000';
    END IF;
  ELSIF OLD.status = 'active' THEN
    IF NEW.status NOT IN ('active', 'superseded') THEN
      RAISE EXCEPTION '% active lifecycle may only advance to superseded', TG_TABLE_NAME
        USING ERRCODE = '55000';
    END IF;
  ELSIF OLD.status = 'draft' THEN
    IF NEW.status NOT IN ('draft', 'active', 'superseded') THEN
      RAISE EXCEPTION '% draft lifecycle transition is invalid', TG_TABLE_NAME
        USING ERRCODE = '55000';
    END IF;
  ELSE
    RAISE EXCEPTION '% has an unknown lifecycle status', TG_TABLE_NAME
      USING ERRCODE = '55000';
  END IF;

  IF OLD.superseded_at IS NOT NULL
     AND NEW.superseded_at IS DISTINCT FROM OLD.superseded_at THEN
    RAISE EXCEPTION '% superseded timestamp is immutable', TG_TABLE_NAME
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER loyalty_policies_immutable_history
BEFORE UPDATE OR DELETE ON loyalty_policies
FOR EACH ROW
EXECUTE FUNCTION enforce_growth_policy_history();
--> statement-breakpoint
CREATE TRIGGER referral_policies_immutable_history
BEFORE UPDATE OR DELETE ON referral_policies
FOR EACH ROW
EXECUTE FUNCTION enforce_growth_policy_history();
--> statement-breakpoint
CREATE TRIGGER affiliate_policies_immutable_history
BEFORE UPDATE OR DELETE ON affiliate_policies
FOR EACH ROW
EXECUTE FUNCTION enforce_growth_policy_history();
--> statement-breakpoint
CREATE FUNCTION enforce_growth_terms_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'growth_terms_versions rows are immutable history and cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF (to_jsonb(NEW) - 'superseded_at')
      IS DISTINCT FROM
     (to_jsonb(OLD) - 'superseded_at') THEN
    RAISE EXCEPTION 'growth_terms_versions immutable facts cannot be changed'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.superseded_at IS NOT NULL
     AND NEW.superseded_at IS DISTINCT FROM OLD.superseded_at THEN
    RAISE EXCEPTION 'growth_terms_versions superseded timestamp is immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER growth_terms_versions_immutable_history
BEFORE UPDATE OR DELETE ON growth_terms_versions
FOR EACH ROW
EXECUTE FUNCTION enforce_growth_terms_history();
--> statement-breakpoint
CREATE FUNCTION enforce_referral_conversion_selected_growth()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM order_growth_attributions AS growth
    WHERE growth.order_id = NEW.first_order_id
      AND growth.buyer_user_id = NEW.referred_user_id
      AND growth.program = 'customer_referral'
      AND growth.referral_attribution_id = NEW.referral_attribution_id
      AND growth.referral_policy_id = NEW.referral_policy_id
      AND growth.referral_policy_version = NEW.referral_policy_version
  ) THEN
    RAISE EXCEPTION 'referral conversion does not match selected order growth facts'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER referral_conversions_selected_growth
BEFORE INSERT OR UPDATE OF referral_attribution_id, referred_user_id,
  first_order_id, referral_policy_id, referral_policy_version
ON referral_conversions
FOR EACH ROW
EXECUTE FUNCTION enforce_referral_conversion_selected_growth();
--> statement-breakpoint
CREATE FUNCTION enforce_affiliate_commission_selected_growth()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM order_growth_attributions AS growth
    WHERE growth.order_id = NEW.order_id
      AND growth.buyer_user_id = NEW.buyer_user_id
      AND growth.program = 'affiliate'
      AND growth.affiliate_attribution_id = NEW.affiliate_attribution_id
      AND growth.affiliate_policy_id = NEW.affiliate_policy_id
      AND growth.affiliate_policy_version = NEW.affiliate_policy_version
  ) THEN
    RAISE EXCEPTION 'affiliate commission does not match selected order growth facts'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER affiliate_commissions_selected_growth
BEFORE INSERT OR UPDATE OF affiliate_attribution_id, buyer_user_id, order_id,
  affiliate_policy_id, affiliate_policy_version
ON affiliate_commissions
FOR EACH ROW
EXECUTE FUNCTION enforce_affiliate_commission_selected_growth();
--> statement-breakpoint
CREATE FUNCTION enforce_order_growth_settlement_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1 FROM referral_conversions
      WHERE first_order_id = OLD.order_id
    ) OR EXISTS (
      SELECT 1 FROM affiliate_commissions
      WHERE order_id = OLD.order_id
    ) THEN
      RAISE EXCEPTION 'settled order growth attribution cannot be deleted'
        USING ERRCODE = '23503';
    END IF;

    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM referral_conversions AS conversion
    WHERE conversion.first_order_id = OLD.order_id
      AND NOT (
        NEW.order_id = conversion.first_order_id
        AND NEW.buyer_user_id = conversion.referred_user_id
        AND NEW.program = 'customer_referral'
        AND NEW.referral_attribution_id = conversion.referral_attribution_id
        AND NEW.referral_policy_id = conversion.referral_policy_id
        AND NEW.referral_policy_version = conversion.referral_policy_version
      )
  ) THEN
    RAISE EXCEPTION 'order growth update would detach referral settlement facts'
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM affiliate_commissions AS commission
    WHERE commission.order_id = OLD.order_id
      AND NOT (
        NEW.order_id = commission.order_id
        AND NEW.buyer_user_id = commission.buyer_user_id
        AND NEW.program = 'affiliate'
        AND NEW.affiliate_attribution_id = commission.affiliate_attribution_id
        AND NEW.affiliate_policy_id = commission.affiliate_policy_id
        AND NEW.affiliate_policy_version = commission.affiliate_policy_version
      )
  ) THEN
    RAISE EXCEPTION 'order growth update would detach affiliate settlement facts'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER order_growth_attributions_settlement_integrity
BEFORE UPDATE OR DELETE ON order_growth_attributions
FOR EACH ROW
EXECUTE FUNCTION enforce_order_growth_settlement_integrity();
