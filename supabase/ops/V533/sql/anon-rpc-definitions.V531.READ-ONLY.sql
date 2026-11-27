-- NEXA V5.31 — READ-ONLY catalog inspection of the 9 pre-existing, anon-executable, RPC-reachable SECURITY DEFINER functions (hosted). NOT EXECUTED. Needs your specific authorization.
-- One SELECT, catalog only (pg_proc / pg_roles / pg_namespace). It does NOT call any of the functions, reads no table rows, changes no privilege. Run in the SQL editor and paste ALL rows.
-- Output: R01 one summary row per function (signature, owner, search_path, ACL, md5, automatic indicators), R02 the full definition in 1000-character parts (numbered, so nothing is truncated).
WITH names(n) AS (VALUES ('admin_manage_profile'),('ensure_default_conduct_templates'),('get_admin_slot_summary'),('get_audit_queue'),('get_my_capabilities'),('log_consultation_view'),('nexa_is_admin'),('nexa_is_reviewer'),('reorder_conduct_templates')),
f AS MATERIALIZED (
  SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile, pg_get_userbyid(p.proowner) owner,
         (SELECT substring(c from 13) FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%') sp, has_function_privilege('anon', p.oid, 'EXECUTE') anon_x, has_function_privilege('authenticated', p.oid, 'EXECUTE') auth_x,
         pg_get_functiondef(p.oid) def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN names ON names.n = p.proname
  WHERE n.nspname = 'public' AND p.prokind = 'f'),
ind AS (SELECT f.*, length(def) len, md5(def) h,
         def ~* 'auth\.uid\(\)' uses_uid, def ~* 'auth\.jwt\(\)|request\.jwt' uses_jwt, def ~* '\mexecute\M' has_exec_kw,
         def ~* 'nexa_is_admin\(|is_admin' checks_admin, def ~* 'clinical_access|access_status' checks_access, def ~* '\m(insert|update|delete)\M' writes
       FROM f),
parts AS (SELECT i.*, generate_series(0, (length(i.def) - 1) / 1000) AS idx, ceil(length(i.def) / 1000.0)::int AS np FROM ind i)
(SELECT 'R00 expected 9 functions; found ' || (SELECT count(*) FROM f) || '; missing: ' || coalesce((SELECT string_agg(n, ',') FROM names WHERE n NOT IN (SELECT proname FROM f)), 'none'))
UNION ALL
(SELECT 'R01 public.' || proname || '(' || args || ') secdef=' || prosecdef::text || ' owner=' || owner || ' search_path=' || coalesce(sp, 'NOT-FIXED') || ' anon/auth=' || anon_x::text || '/' || auth_x::text ||
        ' volatility=' || provolatile::text || ' uses_auth_uid=' || uses_uid::text || ' uses_jwt=' || uses_jwt::text || ' checks_admin=' || checks_admin::text || ' checks_access=' || checks_access::text ||
        ' writes=' || writes::text || ' dynamic_EXECUTE=' || has_exec_kw::text || ' len=' || len || ' md5=' || h FROM ind)
UNION ALL
(SELECT 'R02 definition public.' || proname || '(' || args || ') part ' || (idx + 1) || '/' || np || E'\n' || substr(def, idx * 1000 + 1, 1000) FROM parts)
ORDER BY 1;
