-- Candidate only. Depends on the separately gated tenant migration in PR #92.
-- No hosted application of this file is authorized by PR #94.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

DO $gate$ BEGIN
  IF to_regclass('public.organizations') IS NULL
     OR to_regclass('public.organization_memberships') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='consultation_history'
                      AND column_name='organization_id') THEN
    RAISE EXCEPTION 'RADAR_LEDGER_REQUIRES_TENANT_SCHEMA' USING ERRCODE='55000';
  END IF;
END $gate$;

CREATE SCHEMA IF NOT EXISTS nexa_radar_private;
REVOKE ALL ON SCHEMA nexa_radar_private FROM PUBLIC;
GRANT USAGE ON SCHEMA nexa_radar_private TO authenticated;

CREATE TABLE IF NOT EXISTS public.nexa_radar_question_events (
  event_id uuid PRIMARY KEY,
  consultation_id text NOT NULL REFERENCES public.consultation_history(id) ON DELETE RESTRICT,
  encounter_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sequence bigint NOT NULL CHECK (sequence > 0),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  question_id text NOT NULL CHECK (question_id ~ '^(conflict:)?[a-z][A-Za-z0-9_]{0,63}$'),
  concept text NOT NULL CHECK (concept ~ '^[a-z][A-Za-z0-9_]{0,63}$'),
  event_type text NOT NULL CHECK (event_type IN ('appeared','changed','removed','manual_answer','reopened')),
  previous_status text CHECK (previous_status IS NULL OR previous_status IN ('to_ask','asked','confirm','clarified','dismissed','not_applicable')),
  current_status text CHECK (current_status IS NULL OR current_status IN ('to_ask','asked','confirm','clarified','dismissed','not_applicable')),
  previous_priority text CHECK (previous_priority IS NULL OR previous_priority IN ('critical','high','moderate','low')),
  current_priority text CHECK (current_priority IS NULL OR current_priority IN ('critical','high','moderate','low')),
  reason_code text NOT NULL CHECK (reason_code IN ('engine_recalculation','no_longer_suggested','patient_answer','clinician_answer','manual_reopen','not_applicable','superseded','unresolved_conflict')),
  origin text NOT NULL CHECK (origin IN ('engine','ai','human')),
  engine_version text NOT NULL CHECK (engine_version ~ '^[A-Za-z0-9._:-]{1,80}$'),
  processing_id uuid,
  evidence_ref_hash text CHECK (evidence_ref_hash IS NULL OR evidence_ref_hash ~ '^[0-9a-f]{64}$'),
  snapshot_version integer NOT NULL CHECK (snapshot_version BETWEEN 1 AND 10000),
  CONSTRAINT nexa_radar_question_sequence_unique UNIQUE (consultation_id,sequence)
);
-- The clinical engine uses stable camelCase concept IDs such as respFocal.
ALTER TABLE public.nexa_radar_question_events
  DROP CONSTRAINT IF EXISTS nexa_radar_question_events_concept_check;
ALTER TABLE public.nexa_radar_question_events
  ADD CONSTRAINT nexa_radar_question_events_concept_check
  CHECK (concept ~ '^[a-z][A-Za-z0-9_]{0,63}$');
CREATE INDEX IF NOT EXISTS nexa_radar_question_events_owner_page_idx
  ON public.nexa_radar_question_events (owner_user_id,consultation_id,sequence);
CREATE INDEX IF NOT EXISTS nexa_radar_question_events_org_page_idx
  ON public.nexa_radar_question_events (organization_id,consultation_id,sequence);
ALTER TABLE public.nexa_radar_question_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nexa_radar_question_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.nexa_radar_question_events FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION nexa_radar_private.can_read_question_event(
  p_consultation_id text,p_encounter_id uuid,p_organization_id uuid,p_owner_user_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.consultation_history c
    JOIN public.profiles p ON p.id = auth.uid()
    JOIN public.organization_memberships m
      ON m.organization_id = c.organization_id AND m.user_id = p.id
    WHERE c.id = p_consultation_id AND c.encounter_id = p_encounter_id
      AND c.organization_id = p_organization_id AND c.user_id = p_owner_user_id
      AND p.access_status = 'active' AND m.status = 'active'
      AND (
        (p.id = p_owner_user_id AND p.clinical_access = true
          AND m.roles && ARRAY['clinician','owner']::text[])
        OR (p.is_reviewer = true AND 'reviewer' = ANY(m.roles))
      )
  );
$$;
REVOKE ALL ON FUNCTION nexa_radar_private.can_read_question_event(text,uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION nexa_radar_private.can_read_question_event(text,uuid,uuid,uuid) TO authenticated;
GRANT SELECT ON public.nexa_radar_question_events TO authenticated;
DROP POLICY IF EXISTS nexa_radar_question_event_read ON public.nexa_radar_question_events;
CREATE POLICY nexa_radar_question_event_read ON public.nexa_radar_question_events
  FOR SELECT TO authenticated
  USING (nexa_radar_private.can_read_question_event(
    consultation_id,encounter_id,organization_id,owner_user_id));

CREATE OR REPLACE FUNCTION nexa_radar_private.reject_question_event_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'RADAR_EVENT_APPEND_ONLY' USING ERRCODE='42501';
END;
$$;
REVOKE ALL ON FUNCTION nexa_radar_private.reject_question_event_mutation() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS nexa_radar_question_event_immutable ON public.nexa_radar_question_events;
CREATE TRIGGER nexa_radar_question_event_immutable
  BEFORE UPDATE OR DELETE ON public.nexa_radar_question_events
  FOR EACH ROW EXECUTE FUNCTION nexa_radar_private.reject_question_event_mutation();

-- The exposed writer is SECURITY DEFINER only to make sequence allocation and
-- idempotent replay atomic. All actor, source, tenant and payload checks are here.
CREATE OR REPLACE FUNCTION public.append_nexa_radar_question_event(
  p_event_id uuid,p_consultation_id text,p_encounter_id uuid,p_organization_id uuid,
  p_question_id text,p_concept text,p_event_type text,
  p_previous_status text,p_current_status text,p_previous_priority text,p_current_priority text,
  p_reason_code text,p_origin text,p_engine_version text,p_processing_id uuid,
  p_evidence_ref_hash text,p_snapshot_version integer
) RETURNS bigint LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_existing public.nexa_radar_question_events%ROWTYPE;
  v_sequence bigint;
BEGIN
  IF v_actor IS NULL OR p_event_id IS NULL OR p_consultation_id IS NULL
     OR p_encounter_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'RADAR_EVENT_UNAUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.consultation_history c
    JOIN public.profiles p ON p.id = v_actor
    JOIN public.organization_memberships m
      ON m.organization_id = c.organization_id AND m.user_id = v_actor
    WHERE c.id = p_consultation_id AND c.encounter_id = p_encounter_id
      AND c.organization_id = p_organization_id AND c.user_id = v_actor
      AND c.encounter_state IN ('draft','ready_for_audit')
      AND p.access_status = 'active' AND p.clinical_access = true
      AND m.status = 'active' AND m.roles && ARRAY['clinician','owner']::text[]
  ) THEN
    RAISE EXCEPTION 'RADAR_EVENT_CLINICAL_ACCESS_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF p_question_id !~ '^(conflict:)?[a-z][A-Za-z0-9_]{0,63}$'
     OR p_concept !~ '^[a-z][A-Za-z0-9_]{0,63}$'
     OR p_event_type NOT IN ('appeared','changed','removed','manual_answer','reopened')
     OR p_reason_code NOT IN ('engine_recalculation','no_longer_suggested','patient_answer','clinician_answer','manual_reopen','not_applicable','superseded','unresolved_conflict')
     OR p_origin NOT IN ('engine','ai','human')
     OR p_engine_version !~ '^[A-Za-z0-9._:-]{1,80}$'
     OR p_snapshot_version NOT BETWEEN 1 AND 10000
     OR (p_evidence_ref_hash IS NOT NULL AND p_evidence_ref_hash !~ '^[0-9a-f]{64}$')
     OR (p_previous_status IS NOT NULL AND p_previous_status NOT IN ('to_ask','asked','confirm','clarified','dismissed','not_applicable'))
     OR (p_current_status IS NOT NULL AND p_current_status NOT IN ('to_ask','asked','confirm','clarified','dismissed','not_applicable'))
     OR (p_previous_priority IS NOT NULL AND p_previous_priority NOT IN ('critical','high','moderate','low'))
     OR (p_current_priority IS NOT NULL AND p_current_priority NOT IN ('critical','high','moderate','low'))
  THEN
    RAISE EXCEPTION 'RADAR_EVENT_PAYLOAD_INVALID' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nexa-radar-question:' || p_consultation_id, 741));
  SELECT * INTO v_existing FROM public.nexa_radar_question_events WHERE event_id = p_event_id;
  IF FOUND THEN
    IF ROW(v_existing.consultation_id,v_existing.encounter_id,v_existing.organization_id,
           v_existing.owner_user_id,v_existing.question_id,v_existing.concept,v_existing.event_type,
           v_existing.previous_status,v_existing.current_status,v_existing.previous_priority,
           v_existing.current_priority,v_existing.reason_code,v_existing.origin,v_existing.engine_version,
           v_existing.processing_id,v_existing.evidence_ref_hash,v_existing.snapshot_version)
       IS NOT DISTINCT FROM
       ROW(p_consultation_id,p_encounter_id,p_organization_id,v_actor,p_question_id,p_concept,p_event_type,
           p_previous_status,p_current_status,p_previous_priority,p_current_priority,p_reason_code,
           p_origin,p_engine_version,p_processing_id,p_evidence_ref_hash,p_snapshot_version) THEN
      RETURN v_existing.sequence;
    END IF;
    RAISE EXCEPTION 'RADAR_EVENT_ID_CONFLICT' USING ERRCODE='23505';
  END IF;
  SELECT coalesce(max(sequence),0)+1 INTO v_sequence
    FROM public.nexa_radar_question_events WHERE consultation_id = p_consultation_id;
  INSERT INTO public.nexa_radar_question_events (
    event_id,consultation_id,encounter_id,organization_id,owner_user_id,sequence,
    question_id,concept,event_type,previous_status,current_status,
    previous_priority,current_priority,reason_code,origin,engine_version,
    processing_id,evidence_ref_hash,snapshot_version
  ) VALUES (
    p_event_id,p_consultation_id,p_encounter_id,p_organization_id,v_actor,v_sequence,
    p_question_id,p_concept,p_event_type,p_previous_status,p_current_status,
    p_previous_priority,p_current_priority,p_reason_code,p_origin,p_engine_version,
    p_processing_id,p_evidence_ref_hash,p_snapshot_version
  );
  RETURN v_sequence;
END;
$$;
REVOKE ALL ON FUNCTION public.append_nexa_radar_question_event(
  uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,text,text,uuid,text,integer
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.append_nexa_radar_question_event(
  uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,text,text,uuid,text,integer
) TO authenticated;
COMMIT;
