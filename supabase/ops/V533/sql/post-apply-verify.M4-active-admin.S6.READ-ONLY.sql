-- S6 post-apply check for the hardened M4 only. Read-only, catalog only.
-- Preserve the historical V5.34 verifier for the original definition.
WITH target AS (
  SELECT to_regprocedure('public.nexa_admin_preservation_summary()') AS m4_oid,
         to_regprocedure('public.get_my_capabilities()') AS capabilities_oid,
         to_regrole('anon') AS anon_oid,
         to_regrole('authenticated') AS auth_oid,
         to_regrole('service_role') AS service_oid
), checks AS (
  SELECT 'P01_M4_DEFINITION' AS check_id,
         CASE WHEN p.oid IS NOT NULL
                AND md5(p.prosrc) = '65be9e2537cd9e0f3ea5255dbc752b8d'
                AND p.prosecdef AND p.provolatile = 's' AND p.prokind = 'f'
                AND pg_get_function_result(p.oid) = 'jsonb' AND l.lanname = 'plpgsql'
                AND p.proconfig = ARRAY['search_path=pg_catalog']
              THEN 'PASS' ELSE 'FAIL' END AS result
  FROM target t
  LEFT JOIN pg_proc p ON p.oid = t.m4_oid
  LEFT JOIN pg_language l ON l.oid = p.prolang

  UNION ALL
  SELECT 'P02_CAPABILITY_DEFINITION',
         CASE WHEN pg_get_functiondef(t.capabilities_oid) IS NOT NULL
                AND md5(pg_get_functiondef(t.capabilities_oid)) = '3e618471f2fd45089768c0bbe43ab4f4'
              THEN 'PASS' ELSE 'FAIL' END
  FROM target t

  UNION ALL
  SELECT 'P03_M4_OWNER',
         CASE WHEN pg_get_userbyid(p.proowner) IN ('postgres','supabase_admin')
              THEN 'PASS' ELSE 'FAIL' END
  FROM target t LEFT JOIN pg_proc p ON p.oid = t.m4_oid

  UNION ALL
  SELECT 'P04_M4_EFFECTIVE_EXECUTE',
         CASE WHEN has_function_privilege(t.auth_oid, t.m4_oid, 'EXECUTE') IS TRUE
                AND has_function_privilege(t.anon_oid, t.m4_oid, 'EXECUTE') IS FALSE
                AND has_function_privilege(t.service_oid, t.m4_oid, 'EXECUTE') IS FALSE
                AND has_function_privilege(t.auth_oid, t.m4_oid, 'EXECUTE WITH GRANT OPTION') IS FALSE
              THEN 'PASS' ELSE 'FAIL' END
  FROM target t

  UNION ALL
  SELECT 'P05_M4_EXPLICIT_EXECUTE',
         CASE WHEN p.oid IS NOT NULL AND t.auth_oid IS NOT NULL
                AND NOT EXISTS (
                  SELECT FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                  WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner
                    AND (a.grantee <> t.auth_oid OR a.is_grantable)
                )
              THEN 'PASS' ELSE 'FAIL' END
  FROM target t LEFT JOIN pg_proc p ON p.oid = t.m4_oid
)
SELECT check_id, result FROM checks
UNION ALL
SELECT 'P99_M4_VERDICT', CASE WHEN bool_and(result = 'PASS') THEN 'PASS' ELSE 'FAIL' END
FROM checks
ORDER BY 1;
