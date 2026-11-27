-- Probe the currently loaded M4 in a disposable PostgreSQL lab only.
-- The fixture uses representative synthetic JWT subjects and an authenticated DB role.
DO $$
DECLARE
  probe record;
  result jsonb;
BEGIN
  IF current_database() <> 'nexa_s6_m4_lab' THEN
    RAISE EXCEPTION 'DISPOSABLE_DATABASE_REQUIRED';
  END IF;

  FOR probe IN SELECT * FROM (VALUES
    ('00000000-0000-4000-8000-000000000001', 'ACTIVE_ADMIN', true),
    ('00000000-0000-4000-8000-000000000002', 'DISABLED_ADMIN', false),
    ('00000000-0000-4000-8000-000000000003', 'PENDING_ADMIN', false),
    ('00000000-0000-4000-8000-000000000004', 'ACTIVE_NON_ADMIN', false),
    ('00000000-0000-4000-8000-000000000005', 'NULL_STATUS_ADMIN', false),
    ('00000000-0000-4000-8000-000000000006', 'PROFILE_NOT_FOUND', false)
  ) p(subject, label, expected) LOOP
    PERFORM set_config('request.jwt.claim.sub', probe.subject, true);
    SET LOCAL ROLE authenticated;
    SELECT public.nexa_admin_preservation_summary() INTO result;
    RESET ROLE;
    IF probe.expected THEN
      IF NOT coalesce(result ? 'audio' AND result ? 'capture' AND result->'training_authorized' = 'false'::jsonb, false) THEN
        RAISE EXCEPTION 'M4_ACTIVE_ADMIN_SHAPE_MISMATCH';
      END IF;
    ELSIF result IS DISTINCT FROM '{"error":"ADMIN_REQUIRED"}'::jsonb THEN
      RAISE EXCEPTION 'M4_UNEXPECTED_ACCESS_%', probe.label USING ERRCODE='42501';
    END IF;
    RAISE NOTICE 'M4_%_PASS', probe.label;
  END LOOP;

  IF has_function_privilege('anon', 'public.nexa_admin_preservation_summary()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.nexa_admin_preservation_summary()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.nexa_admin_preservation_summary()', 'EXECUTE') THEN
    RAISE EXCEPTION 'M4_GRANT_MISMATCH';
  END IF;
  RAISE NOTICE 'M4_ROLE_GRANTS_PASS';
END $$;
