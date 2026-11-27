-- V5.23 CANDIDATE — NOT APPLIED. Versioned, append-only, hash-chained capture of the assistance record (audio refs, original/corrected transcript, clinical fields, Radar, physician edits,
-- provenance). Ported from the lab-validated labs/nexa-v515/capture.lab.sql to the Supabase identity model: owner = auth.uid() via nexa_assist.me(); a LIVE server grant for purpose
-- 'assistance' (assist_authority.CANDIDATE.sql, must be applied FIRST) is required for every append. Reachable ONLY through the four public wrappers below, granted to `authenticated` only.
-- PRESERVATION, not export: training_authorized is constant false; nothing here can make a record exportable or an audit/training label.
-- Rollback: DROP FUNCTION public.nexa_capture_append, public.nexa_capture_read_chain, public.nexa_capture_verify_chain, public.nexa_capture_core_eligibility; DROP SCHEMA nexa_capture CASCADE.
BEGIN;
CREATE SCHEMA nexa_capture;
REVOKE ALL ON SCHEMA nexa_capture FROM PUBLIC;
CREATE TABLE nexa_capture.records (
  owner_id uuid NOT NULL, encounter_id uuid NOT NULL, seq bigint NOT NULL CHECK (seq >= 1),
  kind text NOT NULL CHECK (kind IN ('audio_ref','transcript_provisional','transcript_final','transcript_corrected','clinical_fields','radar','physician_edit','provenance')),
  payload jsonb NOT NULL CHECK (pg_column_size(payload) <= 262144),
  payload_digest text NOT NULL, parent_digest text NOT NULL, record_digest text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (owner_id, encounter_id, seq)
);
ALTER TABLE nexa_capture.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexa_capture.records FORCE ROW LEVEL SECURITY;
REVOKE ALL ON nexa_capture.records FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION nexa_capture.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path TO pg_catalog AS $$ BEGIN RAISE EXCEPTION 'CAPTURE_RECORD_IMMUTABLE'; END $$;
CREATE TRIGGER records_immutable BEFORE UPDATE OR DELETE ON nexa_capture.records FOR EACH ROW EXECUTE FUNCTION nexa_capture.immutable();
CREATE FUNCTION nexa_capture.sha(t text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO pg_catalog AS $$ SELECT encode(sha256(convert_to(t,'UTF8')),'hex') $$;
CREATE FUNCTION nexa_capture.rec_digest(o uuid, e uuid, s bigint, k text, pd text, par text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO pg_catalog AS $$
  SELECT nexa_capture.sha(concat_ws('|',o,e,s,k,pd,par)) $$;

-- append with compare-and-swap on the sequence; denial is RETURNED so nothing half-written commits
CREATE FUNCTION nexa_capture.append(p_encounter uuid, p_kind text, p_payload jsonb, p_expected_seq bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog AS $$
DECLARE me uuid := nexa_assist.me(); last nexa_capture.records; pd text; par text; rd text; ex nexa_capture.records;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('audio_ref','transcript_provisional','transcript_final','transcript_corrected','clinical_fields','radar','physician_edit','provenance')
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR p_expected_seq IS NULL OR p_expected_seq < 1 THEN RETURN jsonb_build_object('appended',false,'reason','INVALID_REQUEST'); END IF;
  IF (nexa_assist.live_grant(me,p_encounter,'assistance')).grant_id IS NULL THEN RETURN jsonb_build_object('appended',false,'reason','ASSISTANCE_GRANT_REQUIRED'); END IF;
  IF p_kind = 'provenance' AND NOT (p_payload ? 'provider' AND p_payload ? 'model' AND p_payload ? 'model_version' AND p_payload ? 'pipeline_version') THEN
    RETURN jsonb_build_object('appended',false,'reason','PROVENANCE_INCOMPLETE'); END IF;
  IF p_kind = 'audio_ref' AND NOT (p_payload ? 'session_id' AND p_payload ? 'manifest_digest') THEN RETURN jsonb_build_object('appended',false,'reason','AUDIO_REF_INCOMPLETE'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(me::text||'|'||p_encounter::text||'|capture',0));
  SELECT * INTO last FROM nexa_capture.records WHERE owner_id=me AND encounter_id=p_encounter ORDER BY seq DESC LIMIT 1;
  pd := nexa_capture.sha(p_payload::text); par := coalesce(last.record_digest, repeat('0',64));
  SELECT * INTO ex FROM nexa_capture.records WHERE owner_id=me AND encounter_id=p_encounter AND seq=p_expected_seq;
  IF ex.seq IS NOT NULL THEN   -- idempotent retry of the same append, never an overwrite
    IF ex.kind = p_kind AND ex.payload_digest = pd THEN RETURN jsonb_build_object('appended',true,'duplicate',true,'seq',ex.seq,'record_digest',ex.record_digest);
    ELSE RETURN jsonb_build_object('appended',false,'reason','SEQUENCE_CONFLICT','next_seq',coalesce(last.seq,0)+1); END IF;
  END IF;
  IF p_expected_seq <> coalesce(last.seq,0)+1 THEN RETURN jsonb_build_object('appended',false,'reason','SEQUENCE_CONFLICT','next_seq',coalesce(last.seq,0)+1); END IF;
  rd := nexa_capture.rec_digest(me,p_encounter,p_expected_seq,p_kind,pd,par);
  INSERT INTO nexa_capture.records(owner_id,encounter_id,seq,kind,payload,payload_digest,parent_digest,record_digest) VALUES (me,p_encounter,p_expected_seq,p_kind,p_payload,pd,par,rd);
  RETURN jsonb_build_object('appended',true,'duplicate',false,'seq',p_expected_seq,'record_digest',rd,'training_authorized',false);
END $$;

CREATE FUNCTION nexa_capture.read_chain(p_encounter uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path TO pg_catalog AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('seq',seq,'kind',kind,'payload',payload,'payload_digest',payload_digest,'parent_digest',parent_digest,'record_digest',record_digest,'recorded_at',recorded_at) ORDER BY seq),'[]'::jsonb)
  FROM nexa_capture.records WHERE owner_id = nexa_assist.me() AND encounter_id = p_encounter $$;

CREATE FUNCTION nexa_capture.verify_chain(p_encounter uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path TO pg_catalog AS $$
DECLARE me uuid := nexa_assist.me(); r nexa_capture.records; par text := repeat('0',64); n bigint := 0;
BEGIN
  FOR r IN SELECT * FROM nexa_capture.records WHERE owner_id=me AND encounter_id=p_encounter ORDER BY seq LOOP
    n := n + 1;
    IF r.seq <> n OR r.parent_digest <> par OR r.payload_digest <> nexa_capture.sha(r.payload::text) OR r.record_digest <> nexa_capture.rec_digest(me,p_encounter,r.seq,r.kind,r.payload_digest,r.parent_digest) THEN
      RETURN jsonb_build_object('valid',false,'broken_at',r.seq); END IF;
    par := r.record_digest;
  END LOOP;
  RETURN jsonb_build_object('valid',true,'records',n,'head',par);
END $$;

-- Core export is NOT a capture concern: nothing here can make a record exportable.
CREATE FUNCTION nexa_capture.core_export_eligibility(p_encounter uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path TO pg_catalog AS $$
  SELECT jsonb_build_object('eligible',false,'reason','CORE_EXPORT_NOT_ISSUABLE_IN_CAPTURE','training_authorized',false) $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA nexa_capture FROM PUBLIC, anon, authenticated, service_role;
-- public wrappers: the only door. SECURITY DEFINER, fixed search_path, authenticated only (hosted default privileges would otherwise open anon/service_role).
CREATE FUNCTION public.nexa_capture_append(p_encounter uuid, p_kind text, p_payload jsonb, p_expected_seq bigint) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO pg_catalog AS $$ SELECT nexa_capture.append(p_encounter,p_kind,p_payload,p_expected_seq) $$;
CREATE FUNCTION public.nexa_capture_read_chain(p_encounter uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path TO pg_catalog AS $$ SELECT nexa_capture.read_chain(p_encounter) $$;
CREATE FUNCTION public.nexa_capture_verify_chain(p_encounter uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path TO pg_catalog AS $$ SELECT nexa_capture.verify_chain(p_encounter) $$;
CREATE FUNCTION public.nexa_capture_core_eligibility(p_encounter uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER STABLE SET search_path TO pg_catalog AS $$ SELECT nexa_capture.core_export_eligibility(p_encounter) $$;
REVOKE ALL ON FUNCTION public.nexa_capture_append(uuid,text,jsonb,bigint), public.nexa_capture_read_chain(uuid), public.nexa_capture_verify_chain(uuid), public.nexa_capture_core_eligibility(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.nexa_capture_append(uuid,text,jsonb,bigint), public.nexa_capture_read_chain(uuid), public.nexa_capture_verify_chain(uuid), public.nexa_capture_core_eligibility(uuid) TO authenticated;
COMMIT;
