-- NEXA legacy -> SaaS expansion, intentionally additive.
-- Not the historical staging migration 20261027112118. Never mark it applied retroactively.
-- No automatic tenant assignment. Clinical legacy rows remain NULL until proven ownership.
-- Subsequent migrations must implement tenant RPCs, access policies and validated backfill.
SET lock_timeout = '3s';
SET statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
 display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 2 AND 120),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
 created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.organization_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 roles text[] NOT NULL DEFAULT ARRAY['member']::text[],
 status text NOT NULL DEFAULT 'active',
 created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 activated_at timestamptz,
 revoked_at timestamptz,
 UNIQUE (organization_id,user_id),
 CONSTRAINT organization_memberships_roles_check CHECK (
 cardinality(roles) BETWEEN 1 AND 6
 AND roles <@ ARRAY['owner','admin','clinician','reviewer','billing','member']::text[]),
 CONSTRAINT organization_memberships_status_check CHECK (status IN ('invited','active','suspended','revoked')),
 CONSTRAINT organization_memberships_lifecycle_check CHECK (
 (status='active' AND activated_at IS NOT NULL AND revoked_at IS NULL)
 OR (status='revoked' AND revoked_at IS NOT NULL)
 OR status IN ('invited','suspended'))
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
-- Fail closed: do not grant client access or create permissive RLS policies in expansion.
REVOKE ALL ON public.organizations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.organization_memberships FROM PUBLIC, anon, authenticated;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_organization_id uuid;
ALTER TABLE public.consultation_history ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.audit_cases ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.nexa_core_cases ADD COLUMN IF NOT EXISTS organization_id uuid;
-- Add foreign keys as NOT VALID to avoid a full legacy scan under migration lock.
DO $guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.profiles'::regclass AND conname='nexa_profiles_default_org_fk') THEN
  ALTER TABLE public.profiles ADD CONSTRAINT nexa_profiles_default_org_fk
   FOREIGN KEY (default_organization_id) REFERENCES public.organizations(id) NOT VALID;
 END IF;
END $guard$;
DO $guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.consultation_history'::regclass AND conname='nexa_consultations_org_fk') THEN
  ALTER TABLE public.consultation_history ADD CONSTRAINT nexa_consultations_org_fk
   FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
 END IF;
END $guard$;
DO $guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.audit_cases'::regclass AND conname='nexa_audit_cases_org_fk') THEN
  ALTER TABLE public.audit_cases ADD CONSTRAINT nexa_audit_cases_org_fk
   FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
 END IF;
END $guard$;
DO $guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.nexa_core_cases'::regclass AND conname='nexa_core_cases_org_fk') THEN
  ALTER TABLE public.nexa_core_cases ADD CONSTRAINT nexa_core_cases_org_fk
   FOREIGN KEY (organization_id) REFERENCES public.organizations(id) NOT VALID;
 END IF;
END $guard$;
CREATE INDEX IF NOT EXISTS organization_memberships_user_active_idx ON public.organization_memberships (user_id,organization_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS organization_memberships_org_active_idx ON public.organization_memberships (organization_id,user_id) WHERE status='active';
-- No NOT NULL for historical clinical rows; no reassignment, no elevation, no deletion.
