-- PR #92 rollback: only retire the newly introduced RPC after verifying no callers.
-- Existing organization memberships and audit_log records are retained.
BEGIN;
REVOKE ALL ON FUNCTION public.revoke_organization_membership(uuid)
  FROM authenticated, anon, PUBLIC;
DROP FUNCTION IF EXISTS public.revoke_organization_membership(uuid);
COMMIT;
