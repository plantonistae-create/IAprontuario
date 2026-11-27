-- V5.25 — NON-DESTRUCTIVE rollback of the preservation + assistance migrations. It deletes NOTHING: every stored chunk, wrapped key, manifest, capture record, grant and event stays exactly where it is.
-- It only REVOKES the right to execute the new functions, so the Edge function, the client and the admin panel stop working against the new objects at once (they fail closed).
-- Re-enable with reenable.sql (same transaction style). Apply as the migration role. A destructive DROP of these schemas is deliberately NOT part of any rollback: stored clinical backups must never disappear with a switch.
-- Operational companions (no SQL): set NEXA_AUDIO_BACKUP unset/off, NEXA_ASSIST_GATE_* off, APP_CONFIG.remotePreservation=false, assistAuthority=false.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.nexa_audio_put_chunk(uuid,uuid,uuid,bigint,integer,jsonb), public.nexa_audio_get_chunk(uuid,uuid,uuid,bigint,integer), public.nexa_audio_get_manifest(uuid,uuid,uuid,bigint), public.nexa_audio_finalize(uuid,uuid,uuid,bigint,integer,text),
  public.nexa_audio_put_session_key(uuid,uuid,uuid,bigint,jsonb), public.nexa_audio_get_session_key(uuid,uuid,uuid,bigint), public.nexa_audio_list_manifests(uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.nexa_capture_append(uuid,text,jsonb,bigint), public.nexa_capture_read_chain(uuid), public.nexa_capture_verify_chain(uuid), public.nexa_capture_core_eligibility(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.nexa_admin_preservation_summary() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.nexa_assist_attest(uuid,text), public.nexa_assist_issue(uuid,text), public.nexa_assist_verify(uuid,text), public.nexa_assist_revoke(uuid,text) FROM authenticated;
COMMIT;
