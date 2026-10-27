-- PR #92: institution-scoped, audited membership revocation.
-- No global profile permissions are changed. Staging first; no production auto-run.
-- Rollback: REVOKE EXECUTE ... FROM authenticated; DROP FUNCTION ...;
CREATE OR REPLACE FUNCTION public.revoke_organization_membership(
  p_membership_id uuid
) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_org uuid;
  v_target public.organization_memberships%ROWTYPE;
  v_owns boolean;
  v_correlation uuid := gen_random_uuid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE SQLSTATE '42501' USING MESSAGE='AUTH_REQUIRED';
  END IF;

  -- Resolve identifier only; use uniform denial for missing/inaccessible targets.
  SELECT m.organization_id INTO v_org
    FROM public.organization_memberships AS m WHERE m.id=p_membership_id;
  IF v_org IS NULL THEN
    RAISE SQLSTATE '42501' USING MESSAGE='MEMBERSHIP_NOT_ACCESSIBLE';
  END IF;

  -- Serialize all revocations in the same organization BEFORE locking target.
  -- Concurrent attempts to revoke two different owners cannot both pass.
  PERFORM 1 FROM public.organizations AS o
   WHERE o.id=v_org AND o.status='active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE '42501' USING MESSAGE='MEMBERSHIP_NOT_ACCESSIBLE';
  END IF;

  SELECT m.* INTO v_target FROM public.organization_memberships AS m
    WHERE m.id=p_membership_id AND m.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE SQLSTATE '42501' USING MESSAGE='MEMBERSHIP_NOT_ACCESSIBLE';
  END IF;

  IF NOT EXISTS (
      SELECT 1 FROM public.profiles AS p
       WHERE p.id=v_actor AND p.access_status='active'
  ) OR NOT private.org_has_any_role(
      v_org,v_actor,ARRAY['owner','admin']::text[]
  ) THEN
    RAISE SQLSTATE '42501' USING MESSAGE='ORG_ADMIN_REQUIRED';
  END IF;

  IF v_target.user_id=v_actor THEN
    RAISE SQLSTATE '42501' USING MESSAGE='SELF_REVOCATION_FORBIDDEN';
  END IF;
  -- A normal institution admin must not be able to remove an owner.
  v_owns := private.org_has_any_role(v_org,v_actor,ARRAY['owner']::text[]);
  IF 'owner'=ANY(v_target.roles) AND NOT v_owns THEN
    RAISE SQLSTATE '42501' USING MESSAGE='OWNER_REQUIRED';
  END IF;

  -- Already-revoked records are idempotent, without rewriting their audit trail.
  IF v_target.status <> 'active' THEN
    RETURN;
  END IF;

  IF 'owner'=ANY(v_target.roles) AND NOT EXISTS (
    SELECT 1 FROM public.organization_memberships AS m
      WHERE m.organization_id=v_org AND m.id<>v_target.id
        AND m.status='active' AND 'owner'=ANY(m.roles)
  ) THEN
    RAISE SQLSTATE '42501' USING MESSAGE='LAST_OWNER_REVOCATION_FORBIDDEN';
  END IF;

  UPDATE public.organization_memberships
     SET status='revoked',revoked_at=now()
   WHERE id=v_target.id AND status='active';

  -- Existing append-only audit_log, not a duplicate clinical-audit table.
  -- Failed operations roll back atomically; denied attempts need gateway logs.
  INSERT INTO public.audit_log(user_id,consultation_id,action,metadata)
  VALUES(v_actor,NULL,'update',
    jsonb_build_object('operation','organization_membership_revoked','organization_id',v_org,'membership_id',v_target.id,
      'target_user_id',v_target.user_id,'correlation_id',v_correlation,
      'outcome','revoked'));
END;
$function$;
REVOKE ALL ON FUNCTION public.revoke_organization_membership(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_organization_membership(uuid) TO authenticated;
