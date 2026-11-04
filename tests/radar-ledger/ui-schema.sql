-- Disposable UI-only contract. This is not a hosted migration.
ALTER TABLE public.consultation_history
  ADD COLUMN fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN status text NOT NULL DEFAULT 'draft',
  ADD COLUMN protocol_usage jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN audit_priority integer NOT NULL DEFAULT 0,
  ADD COLUMN audit_ready_at timestamptz,
  ADD COLUMN consent_recorded_at timestamptz,
  ADD COLUMN last_client_saved_at timestamptz,
  ADD COLUMN processing_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN sync_version integer NOT NULL DEFAULT 0;

ALTER TABLE public.consultation_history
  ALTER COLUMN organization_id SET DEFAULT '22222222-2222-4222-8222-222222222222';

CREATE FUNCTION public.synthetic_encounter_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  NEW.sync_version := CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE OLD.sync_version + 1 END;
  RETURN NEW;
END;
$$;
CREATE TRIGGER synthetic_encounter_version
BEFORE INSERT OR UPDATE ON public.consultation_history
FOR EACH ROW EXECUTE FUNCTION public.synthetic_encounter_version();

GRANT INSERT,UPDATE ON public.consultation_history TO authenticated;
CREATE POLICY synthetic_consultation_owner_insert ON public.consultation_history
  FOR INSERT TO authenticated WITH CHECK (
    user_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id = consultation_history.organization_id
        AND m.user_id = (SELECT auth.uid()) AND m.status = 'active'
        AND 'clinician' = ANY(m.roles)
    )
  );
CREATE POLICY synthetic_consultation_owner_update ON public.consultation_history
  FOR UPDATE TO authenticated USING (
    user_id = (SELECT auth.uid()) AND EXISTS (
      SELECT 1 FROM public.organization_memberships m
      WHERE m.organization_id = consultation_history.organization_id
        AND m.user_id = (SELECT auth.uid()) AND m.status = 'active'
        AND 'clinician' = ANY(m.roles)
    )
  ) WITH CHECK (user_id = (SELECT auth.uid()));

CREATE FUNCTION public.get_my_capabilities()
RETURNS TABLE(display_name text,access_status text,is_admin boolean,is_reviewer boolean,clinical_access boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT 'Médico sintético'::text,p.access_status,false,p.is_reviewer,p.clinical_access
  FROM public.profiles p WHERE p.id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.get_my_capabilities() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_capabilities() TO authenticated;
NOTIFY pgrst, 'reload schema';
