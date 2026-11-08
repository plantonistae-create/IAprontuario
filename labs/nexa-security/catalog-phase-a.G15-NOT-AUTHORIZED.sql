-- G15 — TEMPLATE NOT EXECUTED / NOT APPROVED.
-- Do not run this on a hosted database without a NEW, EXPLICIT authorization.
-- Generic public PostgreSQL catalog names ONLY: NO project-specific RPC IDs,
-- no real ACL results, no function bodies, no data-table reads, no PHI.
-- Phase A: review the first two read-only SELECT statements in a PRIVATE
-- authorized session. Operator MUST inspect output only in private storage.
-- Postgres transaction mode is read-only, but it is NOT an authorization.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '1s';

-- A1: count candidates in the public schema; stop if more than 250.
-- Security Advisor findings can include other schemas, which are OUT OF SCOPE.
SELECT
  COUNT(*)::integer AS candidate_public_definer_routines,
  COUNT(*) <= 250 AS within_explicit_review_cap
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND (
    pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    OR pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
  );

-- A2: ONLY public SECURITY DEFINER routines grantable to either Data API role.
-- Do not send results to public issues, PRs, CI logs or user-facing output.
-- This shows metadata, NOT actual PostgREST reachability or safe authorisation.
SELECT
  n.nspname AS routine_schema,
  p.proname AS routine_name_private_only,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments_private_only,
  CASE
    WHEN p.prokind = 'p' THEN 'procedure'
    WHEN p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype THEN 'trigger_function'
    ELSE 'function_or_other'
  END AS routine_class,
  pg_catalog.pg_get_userbyid(p.proowner) AS owner_private_only,
  r.rolsuper AS owner_superuser,
  r.rolbypassrls AS owner_bypasses_rls,
  p.prosecdef AS security_definer,
  p.proconfig::text AS routine_config_private_only,
  p.proacl::text AS raw_acl_private_only,
  p.proacl IS NULL AS default_function_acl,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_effective_execute,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_effective_execute,
  pg_catalog.has_schema_privilege('anon', n.oid, 'USAGE') AS anon_schema_usage,
  pg_catalog.has_schema_privilege('authenticated', n.oid, 'USAGE') AS authenticated_schema_usage
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_roles AS r ON r.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND (
    pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    OR pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
  )
ORDER BY n.nspname, p.proname, p.oid
LIMIT 250;

ROLLBACK;
-- No pg_get_functiondef, pg_depend, auth.users, app table, logs,
-- DDL, DML, application RPC invocation, transactions with write access,
-- GRANT/REVOKE, RLS changes or provider calls.
