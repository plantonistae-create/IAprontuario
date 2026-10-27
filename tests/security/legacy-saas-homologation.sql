\set ON_ERROR_STOP on
-- Synthetic test IDs are fixed to make failures reproducible.
INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
INSERT INTO public.profiles(id) SELECT id FROM auth.users;
INSERT INTO public.professionals(id) VALUES('professional-a');
INSERT INTO public.consultation_history(id,professional_id,user_id,encounter_id,created_at,clinical_text) VALUES
 ('legacy-text-id-1','professional-a','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','2026-01-01','synthetic-preserve-me'),
 ('legacy-text-id-2','professional-a','00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','2026-01-01','synthetic-ambiguous');
INSERT INTO public.audit_cases(id,source_consultation_id,submitted_by) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
INSERT INTO public.nexa_core_cases(id,audit_case_id) VALUES
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
CREATE TEMP TABLE baseline AS SELECT
 (SELECT count(*) FROM public.consultation_history) consultations,
 (SELECT count(*) FROM public.audit_cases) audits,
 (SELECT count(*) FROM public.nexa_core_cases) core,
 (SELECT md5(string_agg(id||':'||clinical_text,'|' ORDER BY id)) FROM public.consultation_history) digest;
\ir ../../supabase/migrations/20261027210000_nexa_legacy_saas_expand.sql
\ir ../../supabase/migrations/20261027211000_nexa_legacy_verified_backfill.sql
-- Repeat both migrations: idempotency must hold.
\ir ../../supabase/migrations/20261027210000_nexa_legacy_saas_expand.sql
\ir ../../supabase/migrations/20261027211000_nexa_legacy_verified_backfill.sql
DO $$
BEGIN
 IF (SELECT count(*) FROM public.consultation_history)<>(SELECT consultations FROM baseline)
 OR (SELECT count(*) FROM public.audit_cases)<>(SELECT audits FROM baseline)
 OR (SELECT count(*) FROM public.nexa_core_cases)<>(SELECT core FROM baseline)
 OR (SELECT md5(string_agg(id||':'||clinical_text,'|' ORDER BY id)) FROM public.consultation_history)<>(SELECT digest FROM baseline)
 THEN RAISE EXCEPTION 'clinical integrity changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.consultation_history WHERE organization_id IS NOT NULL)
 THEN RAISE EXCEPTION 'legacy records auto-assigned'; END IF;
END $$;
-- Verified historical synthetic membership. Audit submitter belongs to the other user.
INSERT INTO public.organizations(id,slug,display_name) VALUES
 ('40000000-0000-4000-8000-000000000001','synthetic-org-a','Synthetic A'),
 ('40000000-0000-4000-8000-000000000002','synthetic-org-b','Synthetic B');
INSERT INTO public.organization_memberships(organization_id,user_id,roles,status,activated_at) VALUES
 ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',ARRAY['clinician'],'active','2025-01-01'),
 ('40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002',ARRAY['clinician'],'active','2025-01-01');
-- Positive consultation -> audit -> core chain.
INSERT INTO private.nexa_legacy_tenant_mapping(entity_type,entity_id,organization_id,evidence_reference,verified_by) VALUES
 ('consultation_history','legacy-text-id-1','40000000-0000-4000-8000-000000000001','synthetic-attestation-1','00000000-0000-4000-8000-000000000001'),
 ('audit_cases','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','synthetic-attestation-2','00000000-0000-4000-8000-000000000001'),
 ('nexa_core_cases','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','synthetic-attestation-3','00000000-0000-4000-8000-000000000001');
SELECT * FROM private.nexa_apply_verified_legacy_mapping();
DO $$
BEGIN
 IF (SELECT count(*) FROM public.consultation_history WHERE organization_id='40000000-0000-4000-8000-000000000001')<>1
 OR (SELECT count(*) FROM public.audit_cases WHERE organization_id='40000000-0000-4000-8000-000000000001')<>1
 OR (SELECT count(*) FROM public.nexa_core_cases WHERE organization_id='40000000-0000-4000-8000-000000000001')<>1
 OR (SELECT count(*) FROM public.consultation_history WHERE organization_id IS NULL)<>1
 THEN RAISE EXCEPTION 'valid mapping or ambiguous record preservation failed'; END IF;
END $$;
-- Negative: submitter is not owner, cannot move audit to B.
INSERT INTO private.nexa_legacy_tenant_mapping(entity_type,entity_id,organization_id,evidence_reference,verified_by) VALUES
 ('consultation_history','legacy-text-id-2','40000000-0000-4000-8000-000000000001','synthetic-invalid-claim','00000000-0000-4000-8000-000000000001');
DO $$
BEGIN
 BEGIN
 PERFORM private.nexa_apply_verified_legacy_mapping();
 RAISE EXCEPTION 'invalid ownership mapping was accepted';
 EXCEPTION WHEN OTHERS THEN
 IF SQLERRM='invalid ownership mapping was accepted' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.consultation_history WHERE id='legacy-text-id-2' AND organization_id IS NOT NULL)
 THEN RAISE EXCEPTION 'failed operation changed clinical tenant'; END IF;
END $$;
DELETE FROM private.nexa_legacy_tenant_mapping WHERE entity_id='legacy-text-id-2';
-- Idempotent replay.
SELECT * FROM private.nexa_apply_verified_legacy_mapping();
DO $$
BEGIN
 IF (SELECT count(*) FROM public.consultation_history)<>2
 OR (SELECT count(*) FROM public.audit_cases)<>1
 OR (SELECT count(*) FROM public.nexa_core_cases)<>1
 THEN RAISE EXCEPTION 'replay changed row counts'; END IF;
END $$;
-- Negative: a newly activated membership cannot prove ownership of a January record.
INSERT INTO public.organization_memberships(organization_id,user_id,roles,status,activated_at) VALUES
 ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',ARRAY['clinician'],'active','2026-10-27');
INSERT INTO private.nexa_legacy_tenant_mapping(entity_type,entity_id,organization_id,evidence_reference,verified_by) VALUES
 ('consultation_history','legacy-text-id-2','40000000-0000-4000-8000-000000000001','synthetic-postdated-membership','00000000-0000-4000-8000-000000000001');
DO $
BEGIN
 BEGIN
 PERFORM private.nexa_apply_verified_legacy_mapping();
 RAISE EXCEPTION 'postdated membership incorrectly accepted';
 EXCEPTION WHEN OTHERS THEN
 IF SQLERRM='postdated membership incorrectly accepted' THEN RAISE; END IF;
 END;
 IF (SELECT organization_id FROM public.consultation_history WHERE id='legacy-text-id-2') IS NOT NULL
 THEN RAISE EXCEPTION 'postdated membership mutated record'; END IF;
END $;
DELETE FROM private.nexa_legacy_tenant_mapping WHERE entity_id='legacy-text-id-2';
-- Negative: cannot remap an already assigned consultation.
INSERT INTO private.nexa_legacy_tenant_mapping(entity_type,entity_id,organization_id,evidence_reference,verified_by) VALUES
 ('consultation_history','legacy-text-id-2','40000000-0000-4000-8000-000000000002','synthetic-valid-owner-evidence','00000000-0000-4000-8000-000000000002');
SELECT * FROM private.nexa_apply_verified_legacy_mapping();
DO $
BEGIN
 IF (SELECT organization_id FROM public.consultation_history WHERE id='legacy-text-id-2')<>'40000000-0000-4000-8000-000000000002'
 THEN RAISE EXCEPTION 'second valid owner mapping failed'; END IF;
END $;
-- Negative: conflicting audit/core mapping must not alter the established tenant.
INSERT INTO private.nexa_legacy_tenant_mapping(entity_type,entity_id,organization_id,evidence_reference,verified_by)
VALUES ('audit_cases','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','synthetic-conflicting-audit','00000000-0000-4000-8000-000000000002')
ON CONFLICT (entity_type,entity_id) DO UPDATE SET organization_id=EXCLUDED.organization_id,applied_at=NULL;
DO $
BEGIN
 BEGIN
 PERFORM private.nexa_apply_verified_legacy_mapping();
 RAISE EXCEPTION 'conflicting audit mapping accepted';
 EXCEPTION WHEN OTHERS THEN
 IF SQLERRM='conflicting audit mapping accepted' THEN RAISE; END IF;
 END;
 IF (SELECT organization_id FROM public.audit_cases WHERE id='20000000-0000-4000-8000-000000000001')<>'40000000-0000-4000-8000-000000000001'
 THEN RAISE EXCEPTION 'conflicting audit mutated tenant'; END IF;
END $;
SELECT 'LEGACY_SAAS_SYNTHETIC_PASS' AS result;
