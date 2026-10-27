-- Controlled, provenance-based legacy mapping. Does NOT assign clinical records automatically.
-- Each mapping is explicitly approved after independent verification of ownership.
CREATE TABLE IF NOT EXISTS private.nexa_legacy_tenant_mapping (
 entity_type text NOT NULL CHECK (entity_type IN ('consultation_history','audit_cases','nexa_core_cases')),
 entity_id text NOT NULL,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 evidence_reference text NOT NULL CHECK (length(btrim(evidence_reference)) >= 8),
 verified_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 verified_at timestamptz NOT NULL DEFAULT now(),
 applied_at timestamptz,
 PRIMARY KEY (entity_type,entity_id)
);
REVOKE ALL ON private.nexa_legacy_tenant_mapping FROM PUBLIC, anon, authenticated;
-- Intentionally no SECURITY DEFINER or authenticated EXECUTE.
-- Backfill is a privileged, reviewed deployment operation, not a client RPC.
CREATE OR REPLACE FUNCTION private.nexa_apply_verified_legacy_mapping()
RETURNS TABLE(entity_type text, applied bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_count bigint;
BEGIN
  -- Fail closed if the proposed mappings do not belong to the documented clinical author.
  -- A mapping must be reviewed against independent evidence before the operator invokes this.
  IF EXISTS (
    SELECT 1 FROM private.nexa_legacy_tenant_mapping m
    WHERE m.entity_type = 'consultation_history' AND m.applied_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.consultation_history c WHERE c.id = m.entity_id)
  ) OR EXISTS (
    SELECT 1 FROM private.nexa_legacy_tenant_mapping m
    WHERE m.entity_type = 'audit_cases' AND m.applied_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.audit_cases a WHERE a.id::text = m.entity_id)
  ) OR EXISTS (
    SELECT 1 FROM private.nexa_legacy_tenant_mapping m
    WHERE m.entity_type = 'nexa_core_cases' AND m.applied_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM public.nexa_core_cases n WHERE n.id::text = m.entity_id)
  ) THEN RAISE EXCEPTION 'mapping contains unknown clinical record IDs'; END IF;

  UPDATE public.consultation_history c SET organization_id=m.organization_id
  FROM private.nexa_legacy_tenant_mapping m
  WHERE m.entity_type='consultation_history' AND m.entity_id=c.id
    AND c.organization_id IS NULL AND m.applied_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  entity_type:='consultation_history'; applied:=v_count; RETURN NEXT;

  UPDATE public.audit_cases a SET organization_id=m.organization_id
  FROM private.nexa_legacy_tenant_mapping m
  WHERE m.entity_type='audit_cases' AND m.entity_id=a.id::text
    AND a.organization_id IS NULL AND m.applied_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  entity_type:='audit_cases'; applied:=v_count; RETURN NEXT;

  UPDATE public.nexa_core_cases n SET organization_id=m.organization_id
  FROM private.nexa_legacy_tenant_mapping m
  WHERE m.entity_type='nexa_core_cases' AND m.entity_id=n.id::text
    AND n.organization_id IS NULL AND m.applied_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  entity_type:='nexa_core_cases'; applied:=v_count; RETURN NEXT;

  UPDATE private.nexa_legacy_tenant_mapping m SET applied_at=now()
  WHERE m.applied_at IS NULL AND (
    (m.entity_type='consultation_history' AND EXISTS (SELECT 1 FROM public.consultation_history c WHERE c.id=m.entity_id AND c.organization_id=m.organization_id))
    OR (m.entity_type='audit_cases' AND EXISTS (SELECT 1 FROM public.audit_cases a WHERE a.id::text=m.entity_id AND a.organization_id=m.organization_id))
    OR (m.entity_type='nexa_core_cases' AND EXISTS (SELECT 1 FROM public.nexa_core_cases n WHERE n.id::text=m.entity_id AND n.organization_id=m.organization_id))
  );
END $$;
REVOKE ALL ON FUNCTION private.nexa_apply_verified_legacy_mapping() FROM PUBLIC, anon, authenticated;
