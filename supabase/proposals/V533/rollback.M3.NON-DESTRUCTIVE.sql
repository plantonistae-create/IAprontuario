-- V5.34 NON-DESTRUCTIVE rollback of step M3 ONLY: audio_backup (nexa_audio_backup). Independent of the other steps: it references only this step's own objects and tolerates a partial/absent installation
-- (each object is looked up with to_regprocedure/to_regnamespace; a missing one is skipped, never an error). It REVOKES execute (and, for M3, schema usage) from every API role by name and from PUBLIC.
-- It deletes NOTHING: no DROP, DELETE, TRUNCATE or ALTER of any table/row. Stored clinical data, wrapped keys, manifests and grants stay exactly where they are. Re-enable with reenable.M3.sql.
-- Apply as the migration role. Operational companions: unset NEXA_AUDIO_BACKUP / NEXA_ASSIST_GATE_*, flags off.
BEGIN;
DO $rb$
DECLARE f regprocedure;
BEGIN
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
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
    END IF;
  END LOOP;
  IF to_regnamespace('nexa_audio_backup') IS NOT NULL THEN
    REVOKE USAGE ON SCHEMA nexa_audio_backup FROM service_role;
  END IF;
END
$rb$;
COMMIT;
