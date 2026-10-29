-- Disposable local contract fixture. Definitions were read from staging on
-- 2026-10-28; no staging write was performed. The repository's older queue
-- migration lacks the institutional predicate. Keep this fixture explicit.
ALTER TABLE public.audit_cases
 ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
 ADD COLUMN IF NOT EXISTS source_sync_version bigint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS deidentified_core_context jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS reviewed_fields jsonb,
 ADD COLUMN IF NOT EXISTS audit_changes jsonb NOT NULL DEFAULT '{}'::jsonb,
 ADD COLUMN IF NOT EXISTS review_note text,
 ADD COLUMN IF NOT EXISTS reviewer_id uuid,
 ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE OR REPLACE FUNCTION private.org_has_any_role(p_organization_id uuid,p_user_id uuid,p_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_user_id IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.organization_memberships m
  JOIN public.organizations o ON o.id=m.organization_id
  WHERE m.organization_id=p_organization_id AND m.user_id=p_user_id
   AND m.status='active' AND o.status='active' AND m.roles && p_roles)
$$;
CREATE OR REPLACE FUNCTION private.can_audit_org(p_organization_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p_user_id IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.profiles p WHERE p.id=p_user_id AND p.access_status='active'
   AND (p.is_admin IS TRUE OR p.is_reviewer IS TRUE))
  AND private.org_has_any_role(p_organization_id,p_user_id,ARRAY['owner','admin','reviewer']::text[])
$$;
CREATE OR REPLACE FUNCTION public.get_audit_queue_v2(
 queue_status text DEFAULT NULL,from_at timestamptz DEFAULT NULL,to_at timestamptz DEFAULT NULL,
 search_text text DEFAULT NULL,limit_count integer DEFAULT 100,offset_count integer DEFAULT 0)
RETURNS TABLE(id uuid,source_consultation_id uuid,status text,priority smallint,
 submitted_at timestamptz,source_updated_at timestamptz,source_sync_version bigint,
 deidentified_fields jsonb,deidentified_core_context jsonb,reviewed_fields jsonb,
 audit_changes jsonb,review_note text,reviewer_id uuid,reviewed_at timestamptz,total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_actor uuid:=auth.uid();
 v_limit integer:=greatest(1,least(coalesce(limit_count,100),200));
 v_offset integer:=greatest(0,coalesce(offset_count,0));
 v_search text:=nullif(btrim(coalesce(search_text,'')),'');
BEGIN
 IF v_actor IS NULL THEN RAISE SQLSTATE '42501' USING message='AUDIT_REVIEW_UNAUTHORIZED'; END IF;
 IF queue_status IS NOT NULL AND queue_status NOT IN ('pending','approved','corrected','discarded') THEN
  RAISE SQLSTATE '22023' USING message='INVALID_AUDIT_STATUS'; END IF;
 RETURN QUERY WITH filtered AS (
  SELECT a.* FROM public.audit_cases a
  WHERE private.can_audit_org(a.organization_id,v_actor)
   AND (queue_status IS NULL OR a.status=queue_status)
   AND (from_at IS NULL OR a.submitted_at>=from_at)
   AND (to_at IS NULL OR a.submitted_at<to_at)
   AND (v_search IS NULL OR a.deidentified_fields::text ILIKE '%'||v_search||'%'
    OR coalesce(a.deidentified_core_context::text,'') ILIKE '%'||v_search||'%'
    OR a.source_consultation_id::text ILIKE '%'||v_search||'%'))
 SELECT f.id,f.source_consultation_id,f.status,f.priority,f.submitted_at,
  f.source_updated_at,f.source_sync_version,f.deidentified_fields,
  f.deidentified_core_context,f.reviewed_fields,f.audit_changes,f.review_note,
  f.reviewer_id,f.reviewed_at,count(*) OVER()::bigint
 FROM filtered f ORDER BY f.priority DESC,f.submitted_at ASC
 LIMIT v_limit OFFSET v_offset;
END $$;
REVOKE ALL ON FUNCTION public.get_audit_queue_v2(text,timestamptz,timestamptz,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_audit_queue_v2(text,timestamptz,timestamptz,text,integer,integer) TO authenticated;
