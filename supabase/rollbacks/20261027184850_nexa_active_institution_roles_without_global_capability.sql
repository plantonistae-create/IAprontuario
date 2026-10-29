-- Rollback of 20261027184850_nexa_active_institution_roles_without_global_capability.
-- Only safe after all active institution-only users have been migrated or disabled.
-- Do NOT silently revoke legitimate organization-scoped access.
DO $block$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE access_status='active'
      AND is_admin IS FALSE
      AND is_reviewer IS FALSE
      AND clinical_access IS FALSE
  ) THEN
    RAISE EXCEPTION 'INSTITUTION_ONLY_PROFILES_ACTIVE: downgrade requires an explicit access migration';
  END IF;
END
$block$;
ALTER TABLE public.profiles DROP CONSTRAINT profiles_capability_state_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_capability_state_check CHECK (
  (
    access_status IS NULL
    AND is_admin IS NULL
    AND is_reviewer IS NULL
    AND clinical_access IS NULL
  ) OR (
    access_status IS NOT NULL
    AND is_admin IS NOT NULL
    AND is_reviewer IS NOT NULL
    AND clinical_access IS NOT NULL
    AND (
      access_status <> 'pending'
      OR (is_admin IS FALSE AND is_reviewer IS FALSE AND clinical_access IS FALSE)
    )
    AND (
      access_status <> 'active'
      OR is_admin IS TRUE
      OR is_reviewer IS TRUE
      OR clinical_access IS TRUE
    )
  )
);
