-- Fail-closed clinical ownership backfill. Mapping approval is NOT proof of ownership.
-- consultation_history.id is text; audit_cases.source_consultation_id refers to encounter_id (uuid).
-- submitted_by denotes audit submission, not clinical ownership.
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
CREATE OR REPLACE FUNCTION private.nexa_apply_verified_legacy_mapping()
RETURNS TABLE(entity_type text, applied bigint)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
 v_count bigint;
BEGIN
 -- The privileged operator must hold a stable lock for the entire validation and update.
 LOCK TABLE private.nexa_legacy_tenant_mapping IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.organization_memberships IN SHARE MODE;
 -- Reject any attempt to overwrite an existing assignment, even a previously applied one.
 IF EXISTS (
 SELECT 1 FROM private.nexa_legacy_tenant_mapping m
 LEFT JOIN public.consultation_history c ON m.entity_type='consultation_history' AND c.id=m.entity_id
 LEFT JOIN public.audit_cases a ON m.entity_type='audit_cases' AND a.id::text=m.entity_id
 LEFT JOIN public.nexa_core_cases n ON m.entity_type='nexa_core_cases' AND n.id::text=m.entity_id
 WHERE m.applied_at IS NULL AND (
   (m.entity_type='consultation_history' AND (c.id IS NULL OR (c.organization_id IS NOT NULL AND c.organization_id<>m.organization_id)))
   OR (m.entity_type='audit_cases' AND (a.id IS NULL OR (a.organization_id IS NOT NULL AND a.organization_id<>m.organization_id)))
   OR (m.entity_type='nexa_core_cases' AND (n.id IS NULL OR (n.organization_id IS NOT NULL AND n.organization_id<>m.organization_id)))
 )) THEN RAISE EXCEPTION 'unknown record or conflicting institutional assignment'; END IF;

 -- A verified consultation must have an actual clinical user_id and active membership.
 -- Arbitrary evidence text, professional_id text, or audit submitter cannot establish ownership.
 IF EXISTS (
 SELECT 1 FROM private.nexa_legacy_tenant_mapping m
 JOIN public.consultation_history c ON c.id=m.entity_id
 WHERE m.entity_type='consultation_history' AND m.applied_at IS NULL
 AND (c.user_id IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.organization_memberships om
   JOIN public.organizations o ON o.id=om.organization_id
   WHERE om.user_id=c.user_id AND om.organization_id=m.organization_id
     AND om.status='active' AND om.roles && ARRAY['owner','admin','clinician']::text[]
     AND o.status='active' AND c.created_at>=om.activated_at
 ))
 ) THEN RAISE EXCEPTION 'consultation ownership not established by active historical membership'; END IF;

 -- Audit source UUID must resolve to a consultation encounter_id, not text consultation id.
 -- Require exactly one matching consultation and the SAME validated tenant.
 IF EXISTS (
 SELECT 1 FROM private.nexa_legacy_tenant_mapping m
 JOIN public.audit_cases a ON a.id::text=m.entity_id
 WHERE m.entity_type='audit_cases' AND m.applied_at IS NULL
 AND (a.source_consultation_id IS NULL OR
 (SELECT count(*) FROM public.consultation_history c WHERE c.encounter_id=a.source_consultation_id)<>1
 OR NOT EXISTS (
 SELECT 1 FROM public.consultation_history c
 WHERE c.encounter_id=a.source_consultation_id
 AND (c.organization_id=m.organization_id OR EXISTS (
   SELECT 1 FROM private.nexa_legacy_tenant_mapping cm
   WHERE cm.entity_type='consultation_history' AND cm.entity_id=c.id
     AND cm.organization_id=m.organization_id
 ))
 ))
 ) THEN RAISE EXCEPTION 'audit lacks uniquely verified source encounter or tenant'; END IF;

 -- A core case inherits only its associated, independently validated audit tenant.
 IF EXISTS (
 SELECT 1 FROM private.nexa_legacy_tenant_mapping m
 JOIN public.nexa_core_cases n ON n.id::text=m.entity_id
 WHERE m.entity_type='nexa_core_cases' AND m.applied_at IS NULL
 AND NOT EXISTS (
 SELECT 1 FROM public.audit_cases a
 WHERE a.id=n.audit_case_id
 AND (a.organization_id=m.organization_id OR EXISTS (
   SELECT 1 FROM private.nexa_legacy_tenant_mapping am
   WHERE am.entity_type='audit_cases' AND am.entity_id=a.id::text
   AND am.organization_id=m.organization_id
 ))
 )
 ) THEN RAISE EXCEPTION 'core case and audit institutional scope mismatch'; END IF;

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
