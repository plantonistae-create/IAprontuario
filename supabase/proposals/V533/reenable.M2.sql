-- V5.34 re-enables exactly what rollback.M2.NON-DESTRUCTIVE.sql revoked (same grants as the M2 candidate): capture (nexa_capture). Touches no data. Skips absent objects.
BEGIN;
DO $re$
DECLARE f regprocedure;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    to_regprocedure('public.nexa_capture_append(uuid,text,jsonb,bigint)'),
    to_regprocedure('public.nexa_capture_read_chain(uuid)'),
    to_regprocedure('public.nexa_capture_verify_chain(uuid)'),
    to_regprocedure('public.nexa_capture_core_eligibility(uuid)')
  ] LOOP
    IF f IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
    END IF;
  END LOOP;
END
$re$;
COMMIT;
