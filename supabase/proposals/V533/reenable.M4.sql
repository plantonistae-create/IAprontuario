-- V5.34 re-enables exactly what rollback.M4.NON-DESTRUCTIVE.sql revoked (same grants as the M4 candidate): admin_preservation (public.nexa_admin_preservation_summary). Touches no data. Skips absent objects.
BEGIN;
DO $re$
DECLARE f regprocedure;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    to_regprocedure('public.nexa_admin_preservation_summary()')
  ] LOOP
    IF f IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
    END IF;
  END LOOP;
END
$re$;
COMMIT;
