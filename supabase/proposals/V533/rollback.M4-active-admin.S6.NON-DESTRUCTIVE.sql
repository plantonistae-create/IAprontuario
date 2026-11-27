-- S6 review only. Contain the M4 admin RPC by revoking API EXECUTE.
-- The hardened definition, owner, tables and rows are preserved.
-- Apply only with separate authorization. Does not set or clear any flag.
BEGIN;
DO $rollback$
BEGIN
  IF pg_catalog.to_regprocedure('public.nexa_admin_preservation_summary()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.nexa_admin_preservation_summary()
      FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END
$rollback$;
COMMIT;
