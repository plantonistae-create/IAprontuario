-- NEXA V5.19 — INTEGRAL HOSTED COMPATIBILITY CHECK (ACLs, RLS, roles, RPCs) — ONE READ-ONLY QUERY.
-- Single SELECT on catalog views only (the Supabase SQL editor shows just the LAST statement's result, so everything is one result set ordered by check id).
-- NO table rows are read; NOTHING can be written (a SELECT cannot); function bodies appear only as md5. The output contains no user or clinical data.
-- Paste the whole result back. Expectations are at the bottom of this file.
SELECT k AS check_id, v AS result FROM (
(SELECT 'A01 profiles columns' k, coalesce(string_agg(column_name||':'||data_type||':'||is_nullable, ', ' ORDER BY column_name),'MISSING') v FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name IN ('id','access_status','clinical_access'))
 UNION ALL
(SELECT 'A02 private.clinical_slots columns', coalesce(string_agg(column_name||':'||data_type, ', ' ORDER BY column_name),'MISSING') FROM information_schema.columns WHERE table_schema='private' AND table_name='clinical_slots')
 UNION ALL
(SELECT 'A03 auth.uid()', CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth' AND p.proname='uid') THEN 'present' ELSE 'MISSING' END)
 UNION ALL
(SELECT 'A04 nexa_assist already present', (SELECT count(*) FROM pg_namespace WHERE nspname='nexa_assist')::text||' schema / '||(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'nexa\_assist\_%')::text||' public functions')
 UNION ALL
(SELECT 'A05 consultation_history columns', coalesce(string_agg(column_name, ',' ORDER BY column_name),'MISSING') FROM information_schema.columns WHERE table_schema='public' AND table_name='consultation_history' AND column_name IN ('id','user_id','encounter_id','sync_version','encounter_state','consent_recorded_at','processing_meta','protocol_usage'))
 UNION ALL
(SELECT 'A06 unique indexes on consultation_history', coalesce(string_agg(pg_get_indexdef(i.indexrelid),' ; '),'NONE') FROM pg_index i WHERE i.indrelid=to_regclass('public.consultation_history') AND i.indisunique)
 UNION ALL
(SELECT 'A07 audit_log unique index mentioning consultation_id', CASE WHEN to_regclass('public.audit_log') IS NULL THEN 'audit_log MISSING' ELSE coalesce((SELECT string_agg(pg_get_indexdef(x.indexrelid),' ; ') FROM pg_index x WHERE x.indrelid=to_regclass('public.audit_log') AND x.indisunique AND pg_get_indexdef(x.indexrelid) ~ 'consultation_id'),'none') END)
 UNION ALL
(SELECT 'B01 API roles and attributes', coalesce(string_agg(rolname||'(bypassrls='||rolbypassrls::text||',super='||rolsuper::text||',login='||rolcanlogin::text||')', ', ' ORDER BY rolname),'NONE') FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','authenticator'))
 UNION ALL
(SELECT 'C01 RLS flags (rls/force)', coalesce(string_agg(n.nspname||'.'||c.relname||'='||c.relrowsecurity::text||'/'||c.relforcerowsecurity::text, ', ' ORDER BY n.nspname,c.relname),'NONE')
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND ((n.nspname='public' AND c.relname IN ('profiles','consultation_history','audit_cases','audit_log','style_examples')) OR (n.nspname='private' AND c.relname='clinical_slots')))
 UNION ALL
(SELECT 'C02 policies (table:name:cmd:roles:md5(qual+check))', coalesce(string_agg(tablename||':'||policyname||':'||cmd||':'||array_to_string(roles,'|')||':'||md5(coalesce(qual,'')||'/'||coalesce(with_check,'')), E'\n' ORDER BY tablename,policyname),'NONE')
  FROM pg_policies WHERE (schemaname='public' AND tablename IN ('profiles','consultation_history','audit_cases')) OR (schemaname='private' AND tablename='clinical_slots'))
 UNION ALL
(SELECT 'D01 table grants to API roles', coalesce(string_agg(table_schema||'.'||table_name||' '||grantee||':'||privs, E'\n' ORDER BY table_schema,table_name,grantee),'NONE')
  FROM (SELECT table_schema,table_name,grantee,string_agg(privilege_type,',' ORDER BY privilege_type) privs FROM information_schema.role_table_grants
        WHERE grantee IN ('anon','authenticated','service_role','PUBLIC') AND ((table_schema='public' AND table_name IN ('profiles','consultation_history','audit_cases','audit_log')) OR (table_schema='private' AND table_name='clinical_slots')) GROUP BY 1,2,3) g)
 UNION ALL
(SELECT 'D02 schema usage for API roles', coalesce(string_agg(n.nspname||':'||r.rolname||'='||has_schema_privilege(r.rolname,n.nspname,'USAGE')::text, ', ' ORDER BY n.nspname,r.rolname),'NONE')
  FROM pg_namespace n CROSS JOIN pg_roles r WHERE n.nspname IN ('public','private','auth') AND r.rolname IN ('anon','authenticated','service_role'))
 UNION ALL
(SELECT 'D03 default privileges (grantor schema objtype acl)', coalesce(string_agg(coalesce(n.nspname,'*')||':'||d.defaclobjtype::text||':'||d.defaclacl::text, E'\n'),'NONE') FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace)
 UNION ALL
(SELECT 'E01 RPC '||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
       'secdef='||p.prosecdef::text||' config='||coalesce(p.proconfig::text,'-')||' md5='||md5(p.prosrc)||' exec(anon/auth/service/public)='||
       coalesce(has_function_privilege(to_regrole('anon'),p.oid,'EXECUTE')::text,'no-role')||'/'||coalesce(has_function_privilege(to_regrole('authenticated'),p.oid,'EXECUTE')::text,'no-role')||'/'||coalesce(has_function_privilege(to_regrole('service_role'),p.oid,'EXECUTE')::text,'no-role')||'/'||
       coalesce((SELECT bool_or(a.grantee=0 AND a.privilege_type='EXECUTE') FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),false)::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND (p.proname IN ('get_my_capabilities','has_active_clinical_access','submit_audit_review') OR p.proname LIKE 'nexa\_%') ORDER BY p.proname)
 UNION ALL
(SELECT 'E02 functions executable by anon in public (count)', count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND has_function_privilege(to_regrole('anon'),p.oid,'EXECUTE') AND p.prosecdef)
 UNION ALL
(SELECT 'F01 PostgREST exposed schemas (if set in the DB role config)', coalesce((SELECT string_agg(setting,' ; ') FROM (SELECT unnest(rolconfig) setting FROM pg_roles WHERE rolname='authenticator') s WHERE setting LIKE 'pgrst.%'),'not set in role config (check Dashboard > API settings)'))
) t ORDER BY k;
-- EXPECTATIONS the V5.15 candidate relies on (compare with the output above):
--  A01 id:uuid, access_status:text, clinical_access:boolean | A02 profile_id:uuid | A03 present | A04 0 schema / 0 public functions
--  B01 anon, authenticated, service_role present; authenticated and anon must NOT have bypassrls | C01 consultation_history rls=true | C02 owner-only policies on consultation_history
--  D01 authenticated has NO privilege on private.clinical_slots; anon has none on any table above | D02 private schema USAGE must not be granted to anon/authenticated (PostgREST must not expose it) | F01 'private' must not be listed
--  E01 get_my_capabilities / has_active_clinical_access: record secdef and search_path; anon EXECUTE should be false unless intended | E02 should be 0, or each case justified
-- The migration itself only needs the postgres/migration role (it creates nexa_assist and public.nexa_assist_* with fixed search_path, EXECUTE for authenticated only).
