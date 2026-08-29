CREATE OR REPLACE FUNCTION public.reject_shared_research_set_mutation_receipt_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'shared_research_set_mutations receipts are immutable'
    USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER shared_research_set_mutations_immutable_receipts
BEFORE UPDATE OR DELETE ON public.shared_research_set_mutations
FOR EACH ROW EXECUTE FUNCTION public.reject_shared_research_set_mutation_receipt_change();
