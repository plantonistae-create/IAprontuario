-- Disposable synthetic database only. This adds the minimum legacy columns needed
-- to apply the repository's real access-slot and encounter-autosave migrations.
ALTER TABLE public.profiles ADD COLUMN display_name text NOT NULL DEFAULT 'Synthetic',
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN is_reviewer boolean NOT NULL DEFAULT false,
  ADD COLUMN clinical_access boolean NOT NULL DEFAULT false,
  ADD COLUMN access_status text NOT NULL DEFAULT 'active';
ALTER TABLE public.consultation_history ADD COLUMN fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
\ir ../../supabase/migrations/20260925170000_access_slots_prereq_v18101.sql
\ir ../../supabase/migrations/20260925172000_encounter_autosave_v18101.sql
-- The expansion was applied in the template; use the observed staging contract.
CREATE OR REPLACE FUNCTION private.is_active_org_member(p_organization_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.organization_memberships m JOIN public.organizations o ON o.id=m.organization_id
    WHERE m.organization_id=p_organization_id AND m.user_id=p_user_id
      AND m.status='active' AND o.status='active')
$$;
CREATE OR REPLACE FUNCTION private.assign_and_guard_consultation_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF tg_op='UPDATE' THEN
   IF new.organization_id IS DISTINCT FROM old.organization_id
      OR new.user_id IS DISTINCT FROM old.user_id
      OR new.encounter_id IS DISTINCT FROM old.encounter_id THEN
     RAISE SQLSTATE '42501' USING message='ENCOUNTER_IDENTITY_IMMUTABLE';
   END IF;
   RETURN new;
 END IF;
 IF new.organization_id IS NULL THEN
   SELECT p.default_organization_id INTO new.organization_id FROM public.profiles p WHERE p.id=new.user_id;
 END IF;
 IF NOT private.is_active_org_member(new.organization_id,new.user_id) THEN
   RAISE SQLSTATE '42501' USING message='ENCOUNTER_ORGANIZATION_MEMBERSHIP_REQUIRED';
 END IF;
 RETURN new;
END $$;
CREATE TRIGGER consultation_history_tenant_guard BEFORE INSERT OR UPDATE
  ON public.consultation_history FOR EACH ROW EXECUTE FUNCTION private.assign_and_guard_consultation_tenant();
-- The minimal legacy template includes a deliberately old owner-only policy;
-- staging has exactly the four capability/tenant policies below.
DROP POLICY legacy_owner_read ON public.consultation_history;
DROP POLICY consultations_select_own ON public.consultation_history;
CREATE POLICY consultations_select_own ON public.consultation_history FOR SELECT TO authenticated
USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT has_active_clinical_access())
 AND (SELECT auth.uid())=user_id AND private.is_active_org_member(organization_id,(SELECT auth.uid())));
DROP POLICY consultations_insert_own ON public.consultation_history;
CREATE POLICY consultations_insert_own ON public.consultation_history FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND (SELECT has_active_clinical_access())
 AND (SELECT auth.uid())=user_id AND private.is_active_org_member(organization_id,(SELECT auth.uid()))
 AND encounter_state IN ('draft','ready_for_audit'));
DROP POLICY consultations_update_own ON public.consultation_history;
CREATE POLICY consultations_update_own ON public.consultation_history FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT has_active_clinical_access())
 AND (SELECT auth.uid())=user_id AND private.is_active_org_member(organization_id,(SELECT auth.uid()))
 AND encounter_state IN ('draft','ready_for_audit'))
WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND (SELECT has_active_clinical_access())
 AND (SELECT auth.uid())=user_id AND private.is_active_org_member(organization_id,(SELECT auth.uid()))
 AND encounter_state IN ('draft','ready_for_audit'));
DROP POLICY consultations_delete_own ON public.consultation_history;
CREATE POLICY consultations_delete_own ON public.consultation_history FOR DELETE TO authenticated
USING ((SELECT auth.uid()) IS NOT NULL AND (SELECT has_active_clinical_access())
 AND (SELECT auth.uid())=user_id AND private.is_active_org_member(organization_id,(SELECT auth.uid())));
UPDATE public.profiles SET default_organization_id='40000000-0000-4000-8000-000000000001',clinical_access=true
 WHERE id='00000000-0000-4000-8000-000000000001';
UPDATE public.profiles SET default_organization_id='40000000-0000-4000-8000-000000000002',clinical_access=true
 WHERE id='00000000-0000-4000-8000-000000000002';
-- Admin has A/B institutional rights but no clinical slot or clinical access.
UPDATE public.profiles SET default_organization_id='40000000-0000-4000-8000-000000000001'
 WHERE id='00000000-0000-4000-8000-000000000003';
DO $$ BEGIN
 IF (SELECT count(*) FROM private.clinical_slots WHERE profile_id IS NOT NULL)<>2 THEN
   RAISE EXCEPTION 'Synthetic clinical slot setup failed'; END IF;
END $$;
