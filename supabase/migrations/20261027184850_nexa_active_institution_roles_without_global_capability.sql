-- NEXA 2.0 / PR #92
-- Permit active institution-only identities with no global platform capabilities
-- and no clinical slot. This is required for realistic tenant JWT fixtures and
-- the institution-scoped membership RPC. Privileged endpoints MUST continue to
-- check role and organization membership separately.
--
-- Other invariants remain: pending profiles have no capabilities; partially
-- initialized profiles retain all-null capability fields.
ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_capability_state_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_capability_state_check
  CHECK (
    (
      access_status IS NULL
      AND is_admin IS NULL
      AND is_reviewer IS NULL
      AND clinical_access IS NULL
    )
    OR
    (
      access_status IS NOT NULL
      AND is_admin IS NOT NULL
      AND is_reviewer IS NOT NULL
      AND clinical_access IS NOT NULL
      AND (
        access_status <> 'pending'
        OR (
          is_admin IS FALSE
          AND is_reviewer IS FALSE
          AND clinical_access IS FALSE
        )
      )
    )
  );

COMMENT ON CONSTRAINT profiles_capability_state_check ON public.profiles IS
  'Institution-scoped active accounts may have no global capability and no clinical slot. Global and clinical access remain separately authorized; pending accounts cannot have capabilities.';
