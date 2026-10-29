-- Isolated synthetic legacy schema reproducing relevant production keys and FK contracts.
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, is_admin boolean NOT NULL DEFAULT false);
CREATE TABLE public.professionals(id text PRIMARY KEY);
CREATE TABLE public.consultation_history(
 id text PRIMARY KEY, professional_id text REFERENCES public.professionals(id) ON DELETE CASCADE,
 user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, encounter_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), clinical_text text NOT NULL DEFAULT ''
);
CREATE TABLE public.audit_cases(
 id uuid PRIMARY KEY, source_consultation_id uuid, snapshot_version integer NOT NULL DEFAULT 1,
 submitted_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 UNIQUE(source_consultation_id,snapshot_version)
);
CREATE TABLE public.nexa_core_cases(
 id uuid PRIMARY KEY, audit_case_id uuid NOT NULL UNIQUE REFERENCES public.audit_cases(id) ON DELETE CASCADE
);
CREATE INDEX consultation_history_encounter_id_idx ON public.consultation_history(encounter_id);
ALTER TABLE public.consultation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexa_core_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_owner_read ON public.consultation_history FOR SELECT TO authenticated USING (user_id=current_setting('request.jwt.claim.sub',true)::uuid);
