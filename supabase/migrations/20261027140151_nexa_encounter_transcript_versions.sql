-- NEXA 2.0: append-only, assistive-use transcript provenance.
-- Not connected to Core datasets/export. No retrospective or automatic audio retention.
-- Deploy only after staging RLS and consent tests.
CREATE TABLE IF NOT EXISTS public.encounter_transcript_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id text NOT NULL REFERENCES public.consultation_history(id) ON DELETE CASCADE,
  encounter_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  transcript_kind text NOT NULL
    CHECK (transcript_kind IN ('final_original','structuring_input','corrected')),
  revision integer NOT NULL CHECK (revision BETWEEN 1 AND 10000),
  source_event_id uuid NOT NULL,
  corrected_from_id uuid NULL REFERENCES public.encounter_transcript_versions(id),
  source_provider text NOT NULL CHECK (length(source_provider) BETWEEN 2 AND 80),
  source_model text NOT NULL CHECK (length(source_model) BETWEEN 2 AND 160),
  structuring_model text NULL CHECK (length(structuring_model) <= 160),
  source_pipeline_version text NULL CHECK (length(source_pipeline_version) <= 120),
  transcript_text text NOT NULL
    CHECK (char_length(transcript_text) BETWEEN 1 AND 400000),
  transcript_sha256 text GENERATED ALWAYS AS
    (encode(extensions.digest(transcript_text,'sha256'),'hex')) STORED,
  consent_recorded_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT encounter_transcript_correction_requires_reference
    CHECK ((transcript_kind = 'corrected') = (corrected_from_id IS NOT NULL)),
  CONSTRAINT encounter_transcript_original_revision_check
    CHECK (transcript_kind = 'corrected' OR revision = 1),
  CONSTRAINT encounter_transcript_once_per_event
    UNIQUE (consultation_id,transcript_kind,source_event_id),
  CONSTRAINT encounter_transcript_version_once
    UNIQUE (consultation_id,transcript_kind,revision)
);
CREATE INDEX IF NOT EXISTS encounter_transcript_owner_history
 ON public.encounter_transcript_versions(owner_user_id,consultation_id,created_at DESC);
CREATE INDEX IF NOT EXISTS encounter_transcript_organization
 ON public.encounter_transcript_versions(organization_id,created_at DESC);

ALTER TABLE public.encounter_transcript_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encounter_transcript_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.encounter_transcript_versions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.encounter_transcript_versions TO authenticated;

CREATE POLICY "encounter_transcript_owner_read" ON public.encounter_transcript_versions
FOR SELECT TO authenticated
USING (
  owner_user_id=(select auth.uid())
  AND (select public.has_active_clinical_access())
  AND private.is_active_org_member(organization_id,(select auth.uid()))
  AND EXISTS (
    SELECT 1 FROM public.consultation_history c
    WHERE c.id=consultation_id AND c.user_id=owner_user_id
      AND c.organization_id=organization_id AND c.encounter_id=encounter_id
  )
);

CREATE POLICY "encounter_transcript_owner_append" ON public.encounter_transcript_versions
FOR INSERT TO authenticated
WITH CHECK (
  owner_user_id=(select auth.uid())
  AND (select public.has_active_clinical_access())
  AND private.is_active_org_member(organization_id,(select auth.uid()))
  AND EXISTS (
    SELECT 1 FROM public.consultation_history c
    WHERE c.id=consultation_id AND c.user_id=owner_user_id
      AND c.organization_id=organization_id AND c.encounter_id=encounter_id
      AND c.consent_recorded_at IS NOT NULL
      AND c.consent_recorded_at<=consent_recorded_at
  )

);
-- The absence of UPDATE / DELETE policies enforces append-only user behavior.
-- Service-role use remains backend-only; model-training exports must not query
-- this table without a separate approved privacy and rights gate.

-- Cross-encounter correction references are validated without a recursive RLS subquery.
CREATE FUNCTION private.nexa_check_transcript_correction_parent()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
  IF NEW.corrected_from_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.encounter_transcript_versions p
     WHERE p.id=NEW.corrected_from_id
       AND p.consultation_id=NEW.consultation_id
       AND p.owner_user_id=NEW.owner_user_id
       AND p.organization_id=NEW.organization_id
  ) THEN
    RAISE SQLSTATE '42501' USING MESSAGE='INVALID_TRANSCRIPT_CORRECTION_PARENT';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER nexa_transcript_correction_parent_guard
BEFORE INSERT ON public.encounter_transcript_versions
FOR EACH ROW EXECUTE FUNCTION private.nexa_check_transcript_correction_parent();
REVOKE ALL ON FUNCTION private.nexa_check_transcript_correction_parent() FROM PUBLIC,anon,authenticated;
