-- G16.3 PHASE A2 — NOT AUTHORIZED / NOT EXECUTED.
-- NEVER execute this script by itself before:
--   1) separate explicit authorization to read hosted catalog metadata;
--   2) confirmation of accountable DB operator and private output storage;
--   3) A1 executed in its own prior session and reviewed privately;
--   4) A1 count gate PASS (integer 1..250, no errors or truncation).
-- Even if all above hold, this file is only a template until authorization.
-- NO patient data, function bodies, provider calls, DDL or app RPC invocation.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';
SET LOCAL lock_timeout = '1s';

-- DEFENSE IN DEPTH: repeat the full eligibility count in THIS transaction.
-- If eligible candidate count is 0 or >250, return ZERO rows, not a partial
-- first-250 inventory. The caller MUST classify zero rows as STOP, never PASS.
-- This SQL guard DOES NOT replace the mandatory stop BETWEEN A1 AND A2.
WITH eligible AS MATERIALIZED (
  SELECT p.oid
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.prosecdef
    AND (
      pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      OR pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
),
counted AS MATERIALIZED (
  SELECT COUNT(*)::bigint AS total FROM eligible
)
SELECT
  n.nspname AS routine_schema,
  p.proname AS routine_name_private_only,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments_private_only,
  CASE
    WHEN p.prokind='p' THEN 'procedure'
    WHEN p.prorettype='pg_catalog.trigger'::pg_catalog.regtype THEN 'trigger_function'
    ELSE 'function_or_other'
  END AS routine_class,
  pg_catalog.pg_get_userbyid(p.proowner) AS owner_private_only,
  r.rolsuper AS owner_superuser,
  r.rolbypassrls AS owner_bypasses_rls,
  p.prosecdef AS security_definer,
  p.proconfig::text AS routine_config_private_only,
  p.proacl::text AS raw_acl_private_only,
  p.proacl IS NULL AS default_function_acl,
  pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_effective_execute,
  pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_effective_execute,
  pg_catalog.has_schema_privilege('anon',n.oid,'USAGE') AS anon_schema_usage,
  pg_catalog.has_schema_privilege('authenticated',n.oid,'USAGE') AS authenticated_schema_usage
FROM eligible AS e
JOIN pg_catalog.pg_proc AS p ON p.oid=e.oid
JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace
JOIN pg_catalog.pg_roles AS r ON r.oid=p.proowner
CROSS JOIN counted AS gate
WHERE gate.total BETWEEN 1 AND 250
ORDER BY n.nspname,p.proname,p.oid
LIMIT 250;
ROLLBACK;
-- If result count differs from A1, is zero, or is truncated, STOP. No
-- SQL function body, RLS policy, auth session or tenant proof in this phase.
