-- V5.34 re-enables exactly what rollback.M1.NON-DESTRUCTIVE.sql revoked (same grants as the M1 candidate): assist_authority (nexa_assist). Touches no data. Skips absent objects.
BEGIN;
DO $re$
DECLARE f regprocedure;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    to_regprocedure('public.nexa_assist_attest(uuid,text)'),
    to_regprocedure('public.nexa_assist_issue(uuid,text)'),
    to_regprocedure('public.nexa_assist_verify(uuid,text)'),
    to_regprocedure('public.nexa_assist_revoke(uuid,text)')
  ] LOOP
    IF f IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
    END IF;
  END LOOP;
END
$re$;
COMMIT;
