-- NEXA V5.34 (supersedes V5.27) — POST-APPLICATION VERIFICATION; adds P07 definition (md5 of body, result, volatility, SECURITY DEFINER, fixed search_path), P08 effective EXECUTE ACL incl. PUBLIC/grant option, P09 owners, P10 triggers, P11 exact inventory, P12/P13 table+schema ACL.
-- (V5.27 text follows) (read-only, ONE statement). Run after EACH migration step (assist_authority, capture, audio_backup, admin_preservation); reusable at any stage:
-- objects not yet applied report NOT-APPLIED; objects applied must match the expected ACL/RLS exactly; the pre-existing SECURITY DEFINER baseline (hosted 2026-11-27, MD5 of pg_get_functiondef) must be UNCHANGED
-- and no NEW anon-executable SECURITY DEFINER function may exist. Any FAIL => stop and run rollback.M<n>.NON-DESTRUCTIVE.sql of the failing step (REVOKE only). Catalog only: no table rows, nothing writable.
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
exd(step, ident, kind, secdef, vol, res, h) AS (VALUES
 ('assist','nexa_assist.active(uuid)','int',false,'s','boolean','6c78797c8ce681c7b3aa417e145824b7'),
 ('assist','nexa_assist.deny(uuid,uuid,text,text,text)','int',false,'v','jsonb','36aaa8b6701e76a316b3190a4ce430be'),
 ('assist','nexa_assist.deny_change()','int',false,'v','trigger','b7b392377865410431ca07f5d89fddeb'),
 ('assist','nexa_assist.grants_guard()','int',false,'v','trigger','3d1bbfb18f192ef14ee0efbde75063f6'),
 ('assist','nexa_assist.live_grant(uuid,uuid,text)','int',false,'s','nexa_assist.grants','500d1f4073015c592ce3d8efbba6d278'),
 ('assist','nexa_assist.me()','int',false,'s','uuid','dedfb446be480fcdd1e55e40dbf4c393'),
 ('audio','nexa_audio_backup.derive_manifest()','int',false,'v','trigger','da1794b4fb04b7b34e314d6b5ca688ab'),
 ('audio','nexa_audio_backup.guard_chunk()','int',false,'v','trigger','84dec46548b657f2244aef377e728196'),
 ('audio','nexa_audio_backup.immutable()','int',false,'v','trigger','311b3076a13582e083f362fdce71871e'),
 ('audio','nexa_audio_backup.lock_session(uuid,uuid,uuid,bigint)','int',false,'v','void','148384e2df9ddba80a8cd6fdb76926e8'),
 ('capture','nexa_capture.append(uuid,text,jsonb,bigint)','int',true,'v','jsonb','5e16f5c64f4c302eed2ec846cc2987ee'),
 ('capture','nexa_capture.core_export_eligibility(uuid)','int',true,'s','jsonb','e26610282f10401e959eacaefa052643'),
 ('capture','nexa_capture.immutable()','int',false,'v','trigger','2b82c5a603cbad684f78434fcec1cbe1'),
 ('capture','nexa_capture.read_chain(uuid)','int',true,'s','jsonb','46cbd85563b871ace3a88bb84b2c077f'),
 ('capture','nexa_capture.rec_digest(uuid,uuid,bigint,text,text,text)','int',false,'i','text','32638f7b1ac901153bab3ecc085bda68'),
 ('capture','nexa_capture.sha(text)','int',false,'i','text','ba880252ba20b4bbd001f67b189aa827'),
 ('capture','nexa_capture.verify_chain(uuid)','int',true,'s','jsonb','1af846a04978cd8290033e037b1eaecc'),
 ('admin','public.nexa_admin_preservation_summary()','api',true,'s','jsonb','f2927bf43a2d5137053c76d726adb4c3'),
 ('assist','public.nexa_assist_attest(uuid,text)','api',true,'v','jsonb','c13d1d111b50284388fcdaa180ba08e5'),
 ('assist','public.nexa_assist_issue(uuid,text)','api',true,'v','jsonb','06140972770cfe3093d8c376c093fdfa'),
 ('assist','public.nexa_assist_revoke(uuid,text)','api',true,'v','jsonb','e3bbc1e238f1b87857b2cb40264492c7'),
 ('assist','public.nexa_assist_verify(uuid,text)','api',true,'s','jsonb','68d5d6ad3b0e833129d7ad2ceb12f221'),
 ('audio','public.nexa_audio_finalize(uuid,uuid,uuid,bigint,integer,text)','api',true,'v','jsonb','be970695cf37d69d960efbb08f384989'),
 ('audio','public.nexa_audio_get_chunk(uuid,uuid,uuid,bigint,integer)','api',true,'s','jsonb','bd518f6910800be9a9e86abfc38dc01e'),
 ('audio','public.nexa_audio_get_manifest(uuid,uuid,uuid,bigint)','api',true,'s','jsonb','8e9ccd59e05da11443b00808b53d4a88'),
 ('audio','public.nexa_audio_get_session_key(uuid,uuid,uuid,bigint)','api',true,'s','jsonb','154d979080f39fb5ca72f991a37cc380'),
 ('audio','public.nexa_audio_list_manifests(uuid)','api',true,'s','jsonb','e80554f480185a3c6a764487fb43e101'),
 ('audio','public.nexa_audio_put_chunk(uuid,uuid,uuid,bigint,integer,jsonb)','api',true,'v','boolean','3c6b243cce2c14c39296b2696770ad45'),
 ('audio','public.nexa_audio_put_session_key(uuid,uuid,uuid,bigint,jsonb)','api',true,'v','boolean','2b323746fe805c241c9d7016865cfa49'),
 ('capture','public.nexa_capture_append(uuid,text,jsonb,bigint)','api',true,'v','jsonb','3959b6e65c566526da8535c247708e49'),
 ('capture','public.nexa_capture_core_eligibility(uuid)','api',true,'s','jsonb','780e4fc4cfb8e3e181238ab308b68a6d'),
 ('capture','public.nexa_capture_read_chain(uuid)','api',true,'s','jsonb','229b929769600c25f1b0cc21ebaf722f'),
 ('capture','public.nexa_capture_verify_chain(uuid)','api',true,'s','jsonb','1580943e0b9e233b60881c4dfaf53acb')
),
expg(tbl, tg) AS (VALUES ('nexa_assist.attestations','attestations_immutable'),('nexa_assist.events','events_immutable'),('nexa_assist.grants','grants_guard'),('nexa_capture.records','records_immutable'),('nexa_audio_backup.chunks','chunks_immutable'),('nexa_audio_backup.chunks','protect_finalized_session'),('nexa_audio_backup.manifests','build_manifest_from_persisted_chunks'),('nexa_audio_backup.manifests','manifests_immutable'),('nexa_audio_backup.session_keys','session_keys_immutable')),
exrel(sch, rel) AS (VALUES ('nexa_assist','attestations'),('nexa_assist','grants'),('nexa_assist','events'),('nexa_assist','events_event_id_seq'),('nexa_capture','records'),('nexa_audio_backup','chunks'),('nexa_audio_backup','manifests'),('nexa_audio_backup','session_keys')),
cobj AS MATERIALIZED (
 SELECT 'f' AS t, n.nspname||'.'||p.proname AS nm, p.proowner AS own FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.oid IN (SELECT to_regprocedure(ident)::oid FROM exd WHERE to_regprocedure(ident) IS NOT NULL)
 UNION ALL SELECT 'r', n.nspname||'.'||c.relname, c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('nexa_assist','nexa_capture','nexa_audio_backup') AND c.relkind IN ('r','S')
 UNION ALL SELECT 's', nspname, nspowner FROM pg_namespace WHERE nspname IN ('nexa_assist','nexa_capture','nexa_audio_backup')),
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
 UNION ALL
 SELECT 'P07 definition '||d.step||' '||d.ident,
        CASE WHEN to_regprocedure(d.ident) IS NULL THEN 'NOT-APPLIED'
             WHEN EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(d.ident)
                          AND (p.prosecdef IS DISTINCT FROM d.secdef OR p.provolatile::text<>d.vol OR pg_get_function_result(p.oid)<>d.res OR md5(p.prosrc)<>d.h OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']))
             THEN 'FAIL definition differs from the approved candidate' ELSE 'PASS definition = candidate' END FROM exd d
 UNION ALL
 SELECT 'P08 effective EXECUTE ACL '||d.ident,
        CASE WHEN to_regprocedure(d.ident) IS NULL THEN 'NOT-APPLIED'
             WHEN EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
                          WHERE p.oid=to_regprocedure(d.ident) AND a.privilege_type='EXECUTE'
                            AND (a.is_grantable OR (a.grantee<>p.proowner AND (a.grantee=0 OR NOT (pg_get_userbyid(a.grantee) = ANY (ARRAY['postgres','supabase_admin']
                                 || ARRAY(SELECT v.r FROM (VALUES ('anon',coalesce((SELECT e.anon_x FROM expf e WHERE e.ident=d.ident),false)),('authenticated',coalesce((SELECT e.auth_x FROM expf e WHERE e.ident=d.ident),false)),
                                          ('service_role',coalesce((SELECT e.svc_x FROM expf e WHERE e.ident=d.ident),d.step='audio'))) v(r,x) WHERE v.x)))))))
             THEN 'FAIL an unexpected role (or PUBLIC, or a grant option) can EXECUTE' ELSE 'PASS only the expected roles' END FROM exd d
 UNION ALL
 SELECT 'P09 owners of candidate objects',
        CASE WHEN NOT EXISTS (SELECT 1 FROM cobj) THEN 'NOT-APPLIED'
             WHEN EXISTS (SELECT 1 FROM cobj WHERE pg_get_userbyid(own) IN ('anon','authenticated','service_role','authenticator','pgbouncer')) THEN 'FAIL an API role owns a candidate object'
             WHEN (SELECT count(DISTINCT own) FROM cobj)<>1 THEN 'FAIL candidate objects have different owners' ELSE 'PASS single non-API owner' END
 UNION ALL
 SELECT 'P10 trigger '||g.tbl||' '||g.tg,
        CASE WHEN to_regclass(g.tbl) IS NULL THEN 'NOT-APPLIED'
             WHEN EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass(g.tbl) AND t.tgname=g.tg AND t.tgenabled='O' AND NOT t.tgisinternal) THEN 'PASS present and enabled' ELSE 'FAIL missing or disabled' END FROM expg g
 UNION ALL
 SELECT 'P11 inventory of schema '||s.sch,
        CASE WHEN to_regnamespace(s.sch) IS NULL THEN 'NOT-APPLIED'
             WHEN EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace=to_regnamespace(s.sch) AND NOT EXISTS (SELECT 1 FROM exd d WHERE to_regprocedure(d.ident)=p.oid::regprocedure)) THEN 'FAIL unexpected function in schema'
             WHEN EXISTS (SELECT 1 FROM pg_class c WHERE c.relnamespace=to_regnamespace(s.sch) AND c.relkind IN ('r','v','m','S','f','p') AND NOT EXISTS (SELECT 1 FROM exrel x WHERE x.sch=s.sch AND x.rel=c.relname)) THEN 'FAIL unexpected relation in schema'
             ELSE 'PASS exactly the approved objects' END FROM (VALUES ('nexa_assist'),('nexa_capture'),('nexa_audio_backup')) s(sch)
 UNION ALL
 SELECT 'P12 effective table ACL '||t.tbl,
        CASE WHEN to_regclass(t.tbl) IS NULL THEN 'NOT-APPLIED'
             WHEN EXISTS (SELECT 1 FROM pg_class c, aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
                          WHERE c.oid=to_regclass(t.tbl) AND (a.is_grantable OR (a.grantee<>c.relowner AND (a.grantee=0 OR NOT (pg_get_userbyid(a.grantee) = ANY (ARRAY['postgres','supabase_admin']||CASE WHEN t.svc_may THEN ARRAY['service_role'] ELSE ARRAY[]::text[] END))))))
             THEN 'FAIL an unexpected role (or PUBLIC, or a grant option) holds a table privilege' ELSE 'PASS only the expected roles' END FROM expt t
 UNION ALL
 SELECT 'P13 effective schema ACL '||s.sch,
        CASE WHEN to_regnamespace(s.sch) IS NULL THEN 'NOT-APPLIED'
             WHEN EXISTS (SELECT 1 FROM pg_namespace n, aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
                          WHERE n.oid=to_regnamespace(s.sch) AND (a.is_grantable OR (a.grantee<>n.nspowner AND (a.grantee=0 OR NOT (pg_get_userbyid(a.grantee) = ANY (ARRAY['postgres','supabase_admin']||CASE WHEN s.svc_usage THEN ARRAY['service_role'] ELSE ARRAY[]::text[] END))))))
             THEN 'FAIL an unexpected role (or PUBLIC, or a grant option) holds a schema privilege' ELSE 'PASS only the expected roles' END FROM exps s
)
SELECT k AS check_id, v AS result FROM r
UNION ALL
SELECT 'P99 VERDICT', CASE WHEN count(*) FILTER (WHERE v LIKE 'FAIL%')>0 THEN 'FAIL ('||count(*) FILTER (WHERE v LIKE 'FAIL%')||' rows) -> STOP and run rollback.M<n>.NON-DESTRUCTIVE.sql of the failing step' ELSE 'PASS ('||count(*) FILTER (WHERE v LIKE 'PASS%')||' pass, '||count(*) FILTER (WHERE v='NOT-APPLIED')||' not applied yet)' END FROM r
ORDER BY 1;
