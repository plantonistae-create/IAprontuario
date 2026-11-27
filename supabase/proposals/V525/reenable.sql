-- V5.25 — re-enables exactly what rollback.NON-DESTRUCTIVE.sql revoked (same grants as the candidates). Touches no data.
BEGIN;
GRANT EXECUTE ON FUNCTION public.nexa_audio_put_chunk(uuid,uuid,uuid,bigint,integer,jsonb), public.nexa_audio_get_chunk(uuid,uuid,uuid,bigint,integer), public.nexa_audio_get_manifest(uuid,uuid,uuid,bigint), public.nexa_audio_finalize(uuid,uuid,uuid,bigint,integer,text),
  public.nexa_audio_put_session_key(uuid,uuid,uuid,bigint,jsonb), public.nexa_audio_get_session_key(uuid,uuid,uuid,bigint), public.nexa_audio_list_manifests(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.nexa_capture_append(uuid,text,jsonb,bigint), public.nexa_capture_read_chain(uuid), public.nexa_capture_verify_chain(uuid), public.nexa_capture_core_eligibility(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nexa_admin_preservation_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.nexa_assist_attest(uuid,text), public.nexa_assist_issue(uuid,text), public.nexa_assist_verify(uuid,text), public.nexa_assist_revoke(uuid,text) TO authenticated;
COMMIT;
