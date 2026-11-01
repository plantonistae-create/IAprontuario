-- Candidate: audit-case insertion and its technical event share one transaction.
-- The event contains identifiers and routing metadata only, never clinical fields.
CREATE OR REPLACE FUNCTION private.nexa_audit_case_submission_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.audit_log(user_id,consultation_id,action,metadata)
  VALUES (NEW.submitted_by,NEW.source_consultation_id::text,'create',
    jsonb_build_object('table','audit_cases','operation','submit_audit_case',
      'audit_case_id',NEW.id,'organization_id',NEW.organization_id,
      'snapshot_version',NEW.snapshot_version));
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.nexa_audit_case_submission_event() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS nexa_audit_case_submission_event ON public.audit_cases;
CREATE TRIGGER nexa_audit_case_submission_event
AFTER INSERT ON public.audit_cases
FOR EACH ROW EXECUTE FUNCTION private.nexa_audit_case_submission_event();
