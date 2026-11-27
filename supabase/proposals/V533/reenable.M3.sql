-- V5.34 re-enables exactly what rollback.M3.NON-DESTRUCTIVE.sql revoked (same grants as the M3 candidate): audio_backup (nexa_audio_backup). Touches no data. Skips absent objects.
BEGIN;
DO $re$
DECLARE f regprocedure;
BEGIN
  IF to_regnamespace('nexa_audio_backup') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA nexa_audio_backup TO service_role;
  END IF;
  FOREACH f IN ARRAY ARRAY[
    to_regprocedure('public.nexa_audio_put_chunk(uuid,uuid,uuid,bigint,integer,jsonb)'),
    to_regprocedure('public.nexa_audio_get_chunk(uuid,uuid,uuid,bigint,integer)'),
    to_regprocedure('public.nexa_audio_get_manifest(uuid,uuid,uuid,bigint)'),
    to_regprocedure('public.nexa_audio_finalize(uuid,uuid,uuid,bigint,integer,text)'),
    to_regprocedure('public.nexa_audio_put_session_key(uuid,uuid,uuid,bigint,jsonb)'),
    to_regprocedure('public.nexa_audio_get_session_key(uuid,uuid,uuid,bigint)'),
    to_regprocedure('public.nexa_audio_list_manifests(uuid)')
  ] LOOP
    IF f IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END IF;
  END LOOP;
END
$re$;
COMMIT;
