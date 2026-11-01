\set ON_ERROR_STOP on
-- Same disposable PostgreSQL database as the legacy and issuer-ledger suites.
-- This fixture mirrors the observed production text/UUID key split and audit-log shape.
\ir ../../supabase/migrations/20261101020541_external_issuer_receipt_ingestion.sql
\ir ../../supabase/migrations/20261101023937_audit_case_submission_event.sql
-- Reapplying additive candidate migrations must preserve rows and one trigger.
\ir ../../supabase/migrations/20261101020541_external_issuer_receipt_ingestion.sql
\ir ../../supabase/migrations/20261101023937_audit_case_submission_event.sql

DO $preflight$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.audit_cases'::regclass
   AND attname='snapshot_version' AND atttypid='text'::regtype)
 OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.consultation_history'::regclass
   AND attname='id' AND atttypid='text'::regtype)
 OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.consultation_history'::regclass
   AND attname='encounter_id' AND atttypid='uuid'::regtype)
 OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.audit_cases'::regclass
   AND attname='source_consultation_id' AND atttypid='uuid'::regtype) THEN
  RAISE EXCEPTION 'production-shaped identifier contract missing'; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.audit_cases'::regclass
   AND tgname='nexa_audit_case_submission_event' AND NOT tgisinternal)<>1 THEN
  RAISE EXCEPTION 'audit submission trigger duplicated or absent'; END IF;
 IF has_function_privilege('anon','public.nexa_ingest_verified_external_receipt(jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.nexa_ingest_verified_external_receipt(jsonb)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.nexa_ingest_verified_external_receipt(jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','private.nexa_audit_case_submission_event()','EXECUTE') THEN
  RAISE EXCEPTION 'receipt or audit event privilege changed'; END IF;
END $preflight$;

INSERT INTO public.audit_cases(id,source_consultation_id,snapshot_version,submitted_by,organization_id)
VALUES ('20000000-0000-4000-8000-000000000002',
 '10000000-0000-4000-8000-000000000001','replay-v2',
 '00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001');

DO $event$
BEGIN
 IF (SELECT count(*) FROM public.audit_log
  WHERE metadata->>'audit_case_id'='20000000-0000-4000-8000-000000000002'
   AND metadata->>'operation'='submit_audit_case'
   AND metadata->>'organization_id'='40000000-0000-4000-8000-000000000001'
   AND consultation_id='10000000-0000-4000-8000-000000000001'
   AND user_id='00000000-0000-4000-8000-000000000001' AND action='create')<>1 THEN
  RAISE EXCEPTION 'transactional audit event missing or duplicated'; END IF;
 IF EXISTS (SELECT 1 FROM public.audit_log WHERE metadata::text LIKE '%synthetic-preserve-me%') THEN
  RAISE EXCEPTION 'clinical text leaked into technical event'; END IF;
END $event$;

CREATE FUNCTION private.nexa_test_fail_submission_event() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.metadata->>'audit_case_id'='20000000-0000-4000-8000-000000000003' THEN
  RAISE EXCEPTION 'synthetic event insert failure' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER nexa_test_fail_submission_event BEFORE INSERT ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION private.nexa_test_fail_submission_event();

DO $rollback$
BEGIN
 BEGIN
  INSERT INTO public.audit_cases(id,source_consultation_id,snapshot_version,submitted_by,organization_id)
  VALUES ('20000000-0000-4000-8000-000000000003',
   '10000000-0000-4000-8000-000000000001','rollback-v3',
   '00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'audit case survived failed event';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM='audit case survived failed event' THEN RAISE; END IF;
 END;
 IF EXISTS (SELECT 1 FROM public.audit_cases WHERE id='20000000-0000-4000-8000-000000000003')
 OR EXISTS (SELECT 1 FROM public.audit_log
   WHERE metadata->>'audit_case_id'='20000000-0000-4000-8000-000000000003') THEN
  RAISE EXCEPTION 'failed audit event left a partial write'; END IF;
END $rollback$;
DROP TRIGGER nexa_test_fail_submission_event ON public.audit_log;
DROP FUNCTION private.nexa_test_fail_submission_event();

\ir ../../supabase/migrations/20261101023937_audit_case_submission_event.sql
DO $final$
BEGIN
 IF (SELECT count(*) FROM public.audit_cases)<>2
 OR (SELECT count(*) FROM public.audit_log WHERE metadata->>'operation'='submit_audit_case')<>1
 OR (SELECT count(*) FROM public.consultation_history)<>3
 OR (SELECT clinical_text FROM public.consultation_history WHERE id='legacy-text-id-1')<>'synthetic-preserve-me'
 OR EXISTS (SELECT 1 FROM public.consultation_history
   WHERE id='legacy-text-id-3' AND organization_id IS NOT NULL) THEN
  RAISE EXCEPTION 'replay changed clinical, audit or ambiguous historical rows'; END IF;
 BEGIN
  PERFORM private.nexa_apply_verified_legacy_mapping();
  RAISE EXCEPTION 'historical mapper opened after final replay';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $final$;
SELECT 'PRODUCTION_SHAPED_SYNTHETIC_REPLAY_PASS' AS result;
