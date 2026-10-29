\set ON_ERROR_STOP on
-- Disposable Supabase native stack only. Real Auth and auth.uid() already exist.
DO $$ BEGIN
 -- The native stack proxies loopback TCP to PostgreSQL over a Unix socket;
 -- inet_server_addr() is NULL inside that backend.
 IF inet_server_addr() IS NOT NULL AND inet_server_addr()<>'127.0.0.1'::inet THEN
  RAISE EXCEPTION 'Loopback PostgreSQL required';
 END IF;
 IF (SELECT count(*) FROM auth.users)<>0 THEN RAISE EXCEPTION 'Nonempty Auth project'; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE public.profiles(
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 display_name text NOT NULL DEFAULT 'Synthetic',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 is_admin boolean NOT NULL DEFAULT false,is_reviewer boolean NOT NULL DEFAULT false,
 clinical_access boolean NOT NULL DEFAULT false,access_status text NOT NULL DEFAULT 'pending'
);
CREATE OR REPLACE FUNCTION public.nexa_local_create_profile() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN INSERT INTO public.profiles(id) VALUES(new.id); RETURN new; END $$;
CREATE TRIGGER nexa_local_create_profile AFTER INSERT ON auth.users
 FOR EACH ROW EXECUTE FUNCTION public.nexa_local_create_profile();
CREATE TABLE public.professionals(id text PRIMARY KEY);
CREATE TABLE public.consultation_history(
 id text PRIMARY KEY,professional_id text REFERENCES public.professionals(id),
 user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,encounter_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 fields jsonb NOT NULL DEFAULT '{}'::jsonb,clinical_text text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'draft',protocol_usage jsonb NOT NULL DEFAULT '[]'::jsonb,
 processing_meta jsonb NOT NULL DEFAULT '{}'::jsonb,consent_recorded_at timestamptz
);
CREATE TABLE public.audit_cases(
 id uuid PRIMARY KEY,source_consultation_id uuid,
 submitted_by uuid REFERENCES auth.users(id),deidentified_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'pending'
);
CREATE TABLE public.nexa_core_cases(
 id uuid PRIMARY KEY,audit_case_id uuid REFERENCES public.audit_cases(id),
 quality_status text,case_data jsonb,audit_reviewed_at timestamptz
);
CREATE TABLE public.audit_log(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid REFERENCES public.profiles(id),
 consultation_id text,action text NOT NULL,metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.consultation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexa_core_cases ENABLE ROW LEVEL SECURITY;
\ir ../../supabase/migrations/20260925170000_access_slots_prereq_v18101.sql
\ir ../../supabase/migrations/20260925172000_encounter_autosave_v18101.sql
\ir ../../supabase/migrations/20261027210000_nexa_legacy_saas_expand.sql
\ir ../../supabase/migrations/20261027220000_nexa_historical_evidence_contract.sql
\ir ../../supabase/migrations/20261027221000_nexa_evidence_source_verification.sql
\ir ../../supabase/migrations/20261028191521_nexa_external_issuer_activation_gate.sql
\ir isolated-clinical-audit-contract.sql
-- The next functions, guard and policies are the observed staging definitions
-- already exercised by tests/security/clinical-positive-schema.sql. Keep
-- Supabase's real auth.uid() unchanged for signed JWT / PostgREST testing.
CREATE OR REPLACE FUNCTION private.is_active_org_member(p_organization_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_user_id IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.organization_memberships m JOIN public.organizations o ON o.id=m.organization_id
  WHERE m.organization_id=p_organization_id AND m.user_id=p_user_id
   AND m.status='active' AND o.status='active')
$$;
CREATE OR REPLACE FUNCTION private.assign_and_guard_consultation_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF tg_op='UPDATE' THEN
  IF new.organization_id IS DISTINCT FROM old.organization_id
   OR new.user_id IS DISTINCT FROM old.user_id
   OR new.encounter_id IS DISTINCT FROM old.encounter_id THEN
   RAISE SQLSTATE '42501' USING message='ENCOUNTER_IDENTITY_IMMUTABLE';
  END IF;
  RETURN new;
 END IF;
 IF new.organization_id IS NULL THEN
  SELECT p.default_organization_id INTO new.organization_id FROM public.profiles p WHERE p.id=new.user_id;
 END IF;
 IF NOT private.is_active_org_member(new.organization_id,new.user_id) THEN
  RAISE SQLSTATE '42501' USING message='ENCOUNTER_ORGANIZATION_MEMBERSHIP_REQUIRED';
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER consultation_history_tenant_guard BEFORE INSERT OR UPDATE
 ON public.consultation_history FOR EACH ROW EXECUTE FUNCTION private.assign_and_guard_consultation_tenant();
CREATE OR REPLACE FUNCTION public.audit_consultation_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid;cid text;
BEGIN
 IF tg_op='DELETE' THEN uid:=old.user_id;cid:=old.id::text;
 ELSE uid:=new.user_id;cid:=new.id::text; END IF;
 IF uid IS NOT NULL THEN
  INSERT INTO public.audit_log(user_id,consultation_id,action,metadata)
  VALUES(uid,cid,CASE WHEN tg_op='INSERT' THEN 'create' ELSE lower(tg_op) END,
   jsonb_build_object('table','consultation_history'));
 END IF;
 IF tg_op='DELETE' THEN RETURN old; ELSE RETURN new; END IF;
END $$;
CREATE TRIGGER audit_consultation_changes AFTER INSERT OR UPDATE OR DELETE
 ON public.consultation_history FOR EACH ROW EXECUTE FUNCTION public.audit_consultation_change();
DROP POLICY IF EXISTS consultations_select_own ON public.consultation_history;
DROP POLICY IF EXISTS consultations_insert_own ON public.consultation_history;
DROP POLICY IF EXISTS consultations_update_own ON public.consultation_history;
DROP POLICY IF EXISTS consultations_delete_own ON public.consultation_history;
CREATE POLICY consultations_select_own ON public.consultation_history FOR SELECT TO authenticated
USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT has_active_clinical_access())
 AND (SELECT auth.uid())=user_id AND private.is_active_org_member(organization_id,(SELECT auth.uid())));
CREATE POLICY consultations_insert_own ON public.consultation_history FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND (SELECT has_active_clinical_access())
 AND (SELECT auth.uid())=user_id AND private.is_active_org_member(organization_id,(SELECT auth.uid()))
 AND encounter_state IN ('draft','ready_for_audit'));
CREATE POLICY consultations_update_own ON public.consultation_history FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT has_active_clinical_access())
 AND (SELECT auth.uid())=user_id AND private.is_active_org_member(organization_id,(SELECT auth.uid()))
 AND encounter_state IN ('draft','ready_for_audit'))
WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND (SELECT has_active_clinical_access())
 AND (SELECT auth.uid())=user_id AND private.is_active_org_member(organization_id,(SELECT auth.uid()))
 AND encounter_state IN ('draft','ready_for_audit'));
CREATE POLICY consultations_delete_own ON public.consultation_history FOR DELETE TO authenticated
USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT has_active_clinical_access())
 AND (SELECT auth.uid())=user_id AND private.is_active_org_member(organization_id,(SELECT auth.uid())));
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.consultation_history TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
REVOKE ALL ON public.consultation_history FROM anon;
-- Match the staging read surface: profiles and audit events are owner scoped;
-- the legacy professionals table has no client grants.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated
 USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid())=id);
REVOKE ALL ON public.profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.profiles TO authenticated;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_select_own ON public.audit_log;
CREATE POLICY audit_select_own ON public.audit_log FOR SELECT TO authenticated
 USING ((SELECT has_active_clinical_access()) AND (SELECT auth.uid())=user_id);
REVOKE ALL ON public.audit_log FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.professionals FROM PUBLIC,anon,authenticated;
