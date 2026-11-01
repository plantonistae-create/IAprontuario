\set ON_ERROR_STOP on
-- Disposable Supabase stack only. Synthetic identities are created by local Auth.
CREATE SCHEMA IF NOT EXISTS private;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE TABLE public.organizations(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id),clinical_access boolean NOT NULL DEFAULT false,status text NOT NULL DEFAULT 'inactive');
CREATE TABLE public.organization_memberships(organization_id uuid REFERENCES public.organizations(id),user_id uuid REFERENCES auth.users(id),status text NOT NULL,PRIMARY KEY(organization_id,user_id));
CREATE TABLE public.consultation_history(id text PRIMARY KEY,encounter_id uuid NOT NULL UNIQUE,user_id uuid NOT NULL REFERENCES auth.users(id),organization_id uuid NOT NULL REFERENCES public.organizations(id),consent_recorded_at timestamptz);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.has_active_clinical_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND clinical_access AND status='active')
$$;
CREATE FUNCTION private.is_active_org_member(p_org uuid,p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.organization_memberships WHERE organization_id=p_org AND user_id=p_user AND status='active')
$$;
REVOKE ALL ON FUNCTION public.has_active_clinical_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_active_org_member(uuid,uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_clinical_access() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_active_org_member(uuid,uuid) TO authenticated;
GRANT SELECT,INSERT ON public.consultation_history TO authenticated;
ALTER TABLE public.consultation_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY synthetic_consult_owner ON public.consultation_history FOR ALL TO authenticated
 USING (user_id=auth.uid() AND public.has_active_clinical_access() AND private.is_active_org_member(organization_id,auth.uid()))
 WITH CHECK (user_id=auth.uid() AND public.has_active_clinical_access() AND private.is_active_org_member(organization_id,auth.uid()));
\ir ../../supabase/migrations/20261027140151_nexa_encounter_transcript_versions.sql
