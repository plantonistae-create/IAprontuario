-- S6 REVIEW ONLY. Follow-up to installed M4. Do not apply without authorization.
-- Replaces the function in place, keeping its result shape and existing grants.
-- Administrative access requires an active account; clinical slots are unrelated.
BEGIN;
CREATE OR REPLACE FUNCTION public.nexa_admin_preservation_summary() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path TO pg_catalog AS $$
DECLARE cap record; a jsonb; c jsonb; k jsonb;
BEGIN
  SELECT * INTO cap FROM public.get_my_capabilities() LIMIT 1;
  IF cap IS NULL OR cap.is_admin IS NOT TRUE OR cap.access_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('error','ADMIN_REQUIRED');
  END IF;
  SELECT jsonb_build_object(
    'sessions_protected',   (SELECT count(*) FROM nexa_audio_backup.manifests),
    'physicians_with_backup',(SELECT count(DISTINCT owner_id) FROM nexa_audio_backup.manifests),
    'sessions_last_24h',    (SELECT count(*) FROM nexa_audio_backup.manifests WHERE committed_at > statement_timestamp() - interval '24 hours'),
    'sessions_last_7d',     (SELECT count(*) FROM nexa_audio_backup.manifests WHERE committed_at > statement_timestamp() - interval '7 days'),
    'chunks_total',         (SELECT count(*) FROM nexa_audio_backup.chunks),
    'audio_bytes',          (SELECT coalesce(sum(size),0) FROM nexa_audio_backup.chunks),
    'stored_bytes',         (SELECT coalesce(sum(pg_column_size(envelope)),0) FROM nexa_audio_backup.chunks),      -- envelope footprint in the database (ciphertext + metadata)
    'session_keys_v2',      (SELECT count(*) FROM nexa_audio_backup.session_keys),
    'envelope_v1_chunks',   (SELECT count(*) FROM nexa_audio_backup.chunks WHERE envelope->>'schema' = 'nexa-backup-v1'),
    'envelope_v2_chunks',   (SELECT count(*) FROM nexa_audio_backup.chunks WHERE envelope->>'schema' = 'nexa-backup-v2'),
    -- backups started but not finalized: sessions that have chunks and no manifest (idle > 30 min = needs attention)
    'pending_backups',      (SELECT count(*) FROM (SELECT 1 FROM nexa_audio_backup.chunks ch WHERE NOT EXISTS (SELECT 1 FROM nexa_audio_backup.manifests m WHERE (m.owner_id,m.encounter_id,m.session_id,m.source_version)=(ch.owner_id,ch.encounter_id,ch.session_id,ch.source_version)) GROUP BY ch.owner_id,ch.encounter_id,ch.session_id,ch.source_version) p),
    'pending_backups_stale',(SELECT count(*) FROM (SELECT 1 FROM nexa_audio_backup.chunks ch WHERE NOT EXISTS (SELECT 1 FROM nexa_audio_backup.manifests m WHERE (m.owner_id,m.encounter_id,m.session_id,m.source_version)=(ch.owner_id,ch.encounter_id,ch.session_id,ch.source_version)) GROUP BY ch.owner_id,ch.encounter_id,ch.session_id,ch.source_version HAVING max(ch.created_at) < statement_timestamp() - interval '30 minutes') p)
  ) INTO a;
  SELECT jsonb_build_object(
    'encounters_with_capture',(SELECT count(DISTINCT (owner_id,encounter_id)) FROM nexa_capture.records),
    'records_total',          (SELECT count(*) FROM nexa_capture.records),
    'last_record_at',         (SELECT max(recorded_at) FROM nexa_capture.records),
    'records_by_kind',        (SELECT coalesce(jsonb_object_agg(kind,n),'{}'::jsonb) FROM (SELECT kind, count(*) n FROM nexa_capture.records GROUP BY kind) q),
    -- CANDIDATES per Core task (encounters holding at least one record of that task). NOT eligibility: eligibility also needs signed rights, verified by the exporter outside the database.
    'candidates_asr',          (SELECT count(DISTINCT (owner_id,encounter_id)) FROM nexa_capture.records WHERE kind IN ('transcript_provisional','transcript_final','transcript_corrected')),
    'candidates_radar',        (SELECT count(DISTINCT (owner_id,encounter_id)) FROM nexa_capture.records WHERE kind = 'radar'),
    'candidates_documentation',(SELECT count(DISTINCT (owner_id,encounter_id)) FROM nexa_capture.records WHERE kind IN ('clinical_fields','physician_edit'))
  ) INTO c;
  RETURN jsonb_build_object('audio',a,'capture',c,'generated_at',statement_timestamp(),'eligibility_note','Eligibility for Core export requires signed rights and server-attested chains; the exporter (offline) decides. Counts here are candidates only.','training_authorized',false);
END $$;
REVOKE ALL ON FUNCTION public.nexa_admin_preservation_summary() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.nexa_admin_preservation_summary() TO authenticated;
COMMIT;
