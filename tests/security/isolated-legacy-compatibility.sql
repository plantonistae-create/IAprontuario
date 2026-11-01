\set ON_ERROR_STOP on
-- Executable contract on the disposable schema, before synthetic Auth fixtures.
DO $compat$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute
   WHERE attrelid='public.consultation_history'::regclass AND attname='id'
    AND atttypid='text'::regtype) OR
    NOT EXISTS(SELECT 1 FROM pg_attribute
   WHERE attrelid='public.consultation_history'::regclass AND attname='encounter_id'
    AND atttypid='uuid'::regtype) OR
    NOT EXISTS(SELECT 1 FROM pg_attribute
   WHERE attrelid='public.audit_cases'::regclass AND attname='source_consultation_id'
    AND atttypid='uuid'::regtype) THEN
  RAISE EXCEPTION 'legacy identifier contract changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint
   WHERE conrelid='public.consultation_history'::regclass AND contype='f'
    AND confrelid='public.organizations'::regclass) OR
    NOT EXISTS(SELECT 1 FROM pg_constraint
   WHERE conrelid='public.audit_cases'::regclass AND contype='f'
    AND confrelid='public.organizations'::regclass) THEN
  RAISE EXCEPTION 'tenant relationships missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger
   WHERE tgrelid='public.consultation_history'::regclass
    AND tgname='consultation_history_tenant_guard' AND NOT tgisinternal) OR
    NOT EXISTS(SELECT 1 FROM pg_trigger
   WHERE tgrelid='private.nexa_external_issuer_verified_receipts'::regclass
    AND tgname='nexa_external_issuer_verified_receipts_immutable' AND NOT tgisinternal) THEN
  RAISE EXCEPTION 'guard trigger missing'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.consultation_history'::regclass) OR
    NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
     WHERE oid='private.nexa_external_issuer_verified_receipts'::regclass) THEN
  RAISE EXCEPTION 'RLS contract missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies
   WHERE schemaname='public' AND tablename='consultation_history'
    AND policyname='consultations_select_own') OR
    has_table_privilege('authenticated','private.nexa_external_issuer_verified_receipts','SELECT') OR
    has_function_privilege('authenticated','public.nexa_ingest_verified_external_receipt(jsonb)','EXECUTE') THEN
  RAISE EXCEPTION 'client authorization contract changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_index
   WHERE indrelid='private.nexa_external_issuer_verified_receipts'::regclass AND indisunique)
   OR to_regprocedure('public.get_audit_queue_v2(text,timestamptz,timestamptz,text,integer,integer)') IS NULL
   OR to_regprocedure('private.nexa_apply_verified_legacy_mapping()') IS NULL THEN
  RAISE EXCEPTION 'index or RPC missing'; END IF;
END $compat$;

-- Resolve the same columns and joins consumed by the clinical and auditor UI.
SELECT c.id,c.encounter_id,c.organization_id,c.encounter_state,
 a.id AS audit_id,a.source_consultation_id,a.organization_id AS audit_organization_id,
 a.status,a.deidentified_fields,a.deidentified_core_context
FROM public.consultation_history c
LEFT JOIN public.audit_cases a ON a.source_consultation_id=c.encounter_id
LIMIT 0;

-- A synthetic DDL/DML rehearsal must leave no institutional residue.
BEGIN;
INSERT INTO public.organizations(id,slug,display_name,status)
 VALUES('11111111-1111-4111-8111-111111111111','nexa-rollback-probe','Rollback probe','active');
ROLLBACK;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.organizations WHERE slug='nexa-rollback-probe')
 THEN RAISE EXCEPTION 'rollback probe persisted'; END IF;
END $$;
SELECT 'SYNTHETIC_LEGACY_COMPATIBILITY_PASS' AS result;
