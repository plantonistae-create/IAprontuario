-- NEXA V5.27 — POST-APPLICATION VERIFICATION (read-only, ONE statement). Run after EACH migration step (assist_authority, capture, audio_backup, admin_preservation); reusable at any stage:
-- objects not yet applied report NOT-APPLIED; objects applied must match the expected ACL/RLS exactly; the pre-existing SECURITY DEFINER baseline (hosted 2026-11-27, MD5 of pg_get_functiondef) must be UNCHANGED
-- and no NEW anon-executable SECURITY DEFINER function may exist. Any FAIL => stop and run rollback.NON-DESTRUCTIVE.sql (REVOKE only). Catalog only: no table rows, nothing writable.
WITH base(fn, h) AS (VALUES
-- BASELINE-BEGIN
 ('private.audit_profile_access_change','85a7e7f3244554759df73fe89d46c67b'),
 ('private.set_updated_at','302b83d1b9334838e98ce90290cfa106'),
 ('private.sync_clinical_slot','0a9c469a43f4c721303ca0feedfa79c5'),
 ('public.admin_manage_profile','163ee4de5987bed683f4bd40c09e5f28'),
 ('public.audit_consultation_change','94db3d216c50d2ac33494be20d3fe1f8'),
 ('public.ensure_default_conduct_templates','8ff5a855bad82ac2dd41ecd202a0964d'),
 ('public.get_admin_slot_summary','67a4f7932052138ea822c4b371f80716'),
 ('public.get_audit_queue','07a57e06228adba2258cd7fb5bd52d4b'),
 ('public.get_my_capabilities','3e618471f2fd45089768c0bbe43ab4f4'),
 ('public.handle_new_user','7239b74debb268deecb44931a61c5d3f'),
 ('public.log_consultation_view','13e5e02ffe55584b0cbaff8b44485fd9'),
 ('public.nexa_is_admin','7bd23fccd67caa8ffe453c103e80d078'),
 ('public.nexa_is_reviewer','3ae2ff9eef803692efda47d17e44c140'),
 ('public.reorder_conduct_templates','a36fd40e3690ca7d6b2d691179d60010')
-- BASELINE-END
), expf(step, ident, anon_x, auth_x, svc_x) AS (VALUES
 ('assist','public.nexa_assist_attest(uuid,text)',false,true,false),('assist','public.nexa_assist_issue(uuid,text)',false,true,false),('assist','public.nexa_assist_verify(uuid,text)',false,true,false),('assist','public.nexa_assist_revoke(uuid,text)',false,true,false),
 ('capture','public.nexa_capture_append(uuid,text,jsonb,bigint)',false,true,false),('capture','public.nexa_capture_read_chain(uuid)',false,true,false),('capture','public.nexa_capture_verify_chain(uuid)',false,true,false),('capture','public.nexa_capture_core_eligibility(uuid)',false,true,false),
 ('audio','public.nexa_audio_put_chunk(uuid,uuid,uuid,bigint,integer,jsonb)',false,false,true),('audio','public.nexa_audio_get_chunk(uuid,uuid,uuid,bigint,integer)',false,false,true),('audio','public.nexa_audio_get_manifest(uuid,uuid,uuid,bigint)',false,false,true),
 ('audio','public.nexa_audio_finalize(uuid,uuid,uuid,bigint,integer,text)',false,false,true),('audio','public.nexa_audio_put_session_key(uuid,uuid,uuid,bigint,jsonb)',false,false,true),('audio','public.nexa_audio_get_session_key(uuid,uuid,uuid,bigint)',false,false,true),('audio','public.nexa_audio_list_manifests(uuid)',false,false,true),
 ('admin','public.nexa_admin_preservation_summary()',false,true,false)
), expt(step, tbl, force_rls, svc_may) AS (VALUES
 ('assist','nexa_assist.attestations',false,false),('assist','nexa_assist.grants',false,false),('assist','nexa_assist.events',false,false),
 ('capture','nexa_capture.records',true,false),
 ('audio','nexa_audio_backup.chunks',true,true),('audio','nexa_audio_backup.manifests',true,true),('audio','nexa_audio_backup.session_keys',true,true)
), exps(step, sch, svc_usage) AS (VALUES ('assist','nexa_assist',false),('capture','nexa_capture',false),('audio','nexa_audio_backup',true)),
cur AS MATERIALIZED (SELECT n.nspname||'.'||p.proname AS fn, p.oid, p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND n.nspname IN ('private','public')),
r AS (
 SELECT 'P01 baseline '||b.fn AS k,
        CASE WHEN NOT EXISTS (SELECT 1 FROM cur c WHERE c.fn=b.fn) THEN 'FAIL missing'
             WHEN EXISTS (SELECT 1 FROM cur c WHERE c.fn=b.fn AND md5(pg_get_functiondef(c.oid))<>b.h) THEN 'FAIL definition changed'
             WHEN EXISTS (SELECT 1 FROM cur c WHERE c.fn=b.fn AND NOT c.prosecdef) THEN 'FAIL no longer SECURITY DEFINER' ELSE 'PASS unchanged' END AS v FROM base b
 UNION ALL
 SELECT 'P02 NEW anon-executable SECURITY DEFINER outside baseline',
        coalesce((SELECT 'FAIL '||string_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', ', ') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE p.prosecdef AND p.prokind='f' AND has_function_privilege(to_regrole('anon'),p.oid,'EXECUTE')
                    AND n.nspname NOT IN ('pg_catalog','information_schema','extensions','graphql','graphql_public','vault','pgsodium','pgsodium_masks','realtime','storage','supabase_functions','supabase_migrations','net','cron','pgbouncer','auth')
                    AND (n.nspname||'.'||p.proname) NOT IN (SELECT fn FROM base) HAVING count(*)>0),'PASS none')
 UNION ALL
 SELECT 'P03 '||e.step||' '||e.ident,
        CASE WHEN to_regprocedure(e.ident) IS NULL THEN 'NOT-APPLIED'
             WHEN NOT (SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure(e.ident)) THEN 'FAIL not SECURITY DEFINER'
             WHEN (SELECT proconfig IS NULL OR NOT (proconfig::text ~ 'search_path') FROM pg_proc WHERE oid=to_regprocedure(e.ident)) THEN 'FAIL search_path not fixed'
             WHEN has_function_privilege(to_regrole('anon'),to_regprocedure(e.ident),'EXECUTE') IS DISTINCT FROM e.anon_x
               OR has_function_privilege(to_regrole('authenticated'),to_regprocedure(e.ident),'EXECUTE') IS DISTINCT FROM e.auth_x
               OR has_function_privilege(to_regrole('service_role'),to_regprocedure(e.ident),'EXECUTE') IS DISTINCT FROM e.svc_x
               OR coalesce((SELECT bool_or(a.grantee=0) FROM pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=to_regprocedure(e.ident) AND a.privilege_type='EXECUTE'),false)
               THEN 'FAIL ACL (expected anon/auth/svc='||e.anon_x::text||'/'||e.auth_x::text||'/'||e.svc_x::text||')' ELSE 'PASS ACL ok' END FROM expf e
 UNION ALL
 SELECT 'P04 '||t.step||' table '||t.tbl,
        CASE WHEN to_regclass(t.tbl) IS NULL THEN 'NOT-APPLIED'
             WHEN NOT (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass(t.tbl)) THEN 'FAIL RLS off'
             WHEN (SELECT relforcerowsecurity FROM pg_class WHERE oid=to_regclass(t.tbl)) IS DISTINCT FROM t.force_rls THEN 'FAIL force-RLS flag'
             WHEN EXISTS (SELECT 1 FROM pg_policies WHERE schemaname||'.'||tablename=t.tbl) THEN 'FAIL a policy exists (none expected)'
             WHEN EXISTS (SELECT 1 FROM unnest(ARRAY['anon','authenticated']) ro, unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) pr WHERE has_table_privilege(ro,to_regclass(t.tbl),pr)) THEN 'FAIL anon/authenticated hold a table privilege'
             WHEN NOT t.svc_may AND EXISTS (SELECT 1 FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) pr WHERE has_table_privilege('service_role',to_regclass(t.tbl),pr)) THEN 'FAIL service_role holds a table privilege'
             ELSE 'PASS RLS+ACL ok' END FROM expt t
 UNION ALL
 SELECT 'P05 '||s.step||' schema '||s.sch,
        CASE WHEN to_regnamespace(s.sch) IS NULL THEN 'NOT-APPLIED'
             WHEN has_schema_privilege('anon',s.sch,'USAGE') OR has_schema_privilege('authenticated',s.sch,'USAGE') OR has_schema_privilege('anon',s.sch,'CREATE') OR has_schema_privilege('authenticated',s.sch,'CREATE') THEN 'FAIL anon/authenticated reach the schema'
             WHEN has_schema_privilege('service_role',s.sch,'USAGE') IS DISTINCT FROM s.svc_usage THEN 'FAIL service_role schema usage (expected '||s.svc_usage::text||')' ELSE 'PASS schema ACL ok' END FROM exps s
 UNION ALL
 SELECT 'P06 pre-existing public nexa_* functions still present (4)', CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('nexa_is_admin','nexa_is_reviewer','nexa_password_setup_required','nexa_touch_style_example_updated_at'))=4 THEN 'PASS' ELSE 'FAIL' END
)
SELECT k AS check_id, v AS result FROM r
UNION ALL
SELECT 'P99 VERDICT', CASE WHEN count(*) FILTER (WHERE v LIKE 'FAIL%')>0 THEN 'FAIL ('||count(*) FILTER (WHERE v LIKE 'FAIL%')||' rows) -> STOP and run rollback.NON-DESTRUCTIVE.sql' ELSE 'PASS ('||count(*) FILTER (WHERE v LIKE 'PASS%')||' pass, '||count(*) FILTER (WHERE v='NOT-APPLIED')||' not applied yet)' END FROM r
ORDER BY 1;
