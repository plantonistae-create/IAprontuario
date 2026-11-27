-- V5.34 NON-DESTRUCTIVE rollback of step M2 ONLY: capture (nexa_capture). Independent of the other steps: it references only this step's own objects and tolerates a partial/absent installation
-- (each object is looked up with to_regprocedure/to_regnamespace; a missing one is skipped, never an error). It REVOKES execute (and, for M3, schema usage) from every API role by name and from PUBLIC.
-- It deletes NOTHING: no DROP, DELETE, TRUNCATE or ALTER of any table/row. Stored clinical data, wrapped keys, manifests and grants stay exactly where they are. Re-enable with reenable.M2.sql.
-- Apply as the migration role. Operational companions: unset NEXA_AUDIO_BACKUP / NEXA_ASSIST_GATE_*, flags off.
BEGIN;
DO $rb$
DECLARE f regprocedure;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    to_regprocedure('public.nexa_capture_append(uuid,text,jsonb,bigint)'),
    to_regprocedure('public.nexa_capture_read_chain(uuid)'),
    to_regprocedure('public.nexa_capture_verify_chain(uuid)'),
    to_regprocedure('public.nexa_capture_core_eligibility(uuid)')
  ] LOOP
    IF f IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f);
    END IF;
  END LOOP;
END
$rb$;
COMMIT;
