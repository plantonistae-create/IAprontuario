-- Read-only deployment gate for the NEXA SaaS foundation. Run with psql -v ON_ERROR_STOP=1.
-- Never alter clinical data or provision tenants as part of this check.
SELECT 'profiles' AS entity, count(*) AS rows_before FROM public.profiles
UNION ALL SELECT 'consultation_history',count(*) FROM public.consultation_history
UNION ALL SELECT 'audit_cases',count(*) FROM public.audit_cases
UNION ALL SELECT 'nexa_core_cases',count(*) FROM public.nexa_core_cases;
SELECT expected_object, to_regclass(expected_object) IS NOT NULL AS present
FROM (VALUES ('public.organizations'),('public.organization_memberships'),
 ('private.organization_membership_events')) AS expected(expected_object);
SELECT table_name,column_name,is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('profiles','consultation_history','audit_cases','nexa_core_cases')
 AND column_name IN ('organization_id','default_organization_id','user_id','submitted_by','source_consultation_id')
ORDER BY table_name,column_name;
SELECT version,name FROM supabase_migrations.schema_migrations
WHERE version >= '20261027000000' ORDER BY version;
DO $$
BEGIN
 IF to_regclass('public.organizations') IS NULL OR to_regclass('public.organization_memberships') IS NULL THEN
   RAISE EXCEPTION 'NEXA_SAAS_FOUNDATION_MISSING: do not deploy scoped revocation alone';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_cases' AND column_name='organization_id') THEN
   RAISE EXCEPTION 'NEXA_AUDIT_TENANT_COLUMN_MISSING: tenant reconciliation required';
 END IF;
END $$;
