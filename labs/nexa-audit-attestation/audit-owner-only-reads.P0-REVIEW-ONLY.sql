-- REVIEW-ONLY / NOT APPLIED: NEXA audit owner-only read candidates.
-- Source: supabase/migrations/20260925174500_audit_auto_queue_v18101.sql; exact Git blob 1c753af46b5ddbc840ce771ac5b74afca3414564.
-- Existing functions were SECURITY DEFINER, running under postgres; they
-- currently select/aggregate all cases after an admin/reviewer role check.
-- This candidate switches to SECURITY INVOKER and enforces BOTH real
-- authenticated identity and ownership of audit submission + source.
-- Keeps existing reviewer flag gate; additionally checks active clinical slot.
-- No grants/policies: since audit_cases has zero RLS policies and direct
-- authenticated SELECT is denied, these candidate functions will fail closed,
-- not produce useful authorized data until an independently reviewed RLS/ACL
-- design is approved. A review-only SQL file is not a release migration.
-- Source user_id NULL and orphan audit cases are excluded; no fake tenant.
-- The authorization of external AI, consent and final ACK stays STOP.
-- Other audit APIs not covered: do not claim full app isolation or Gate C GO.
--
-- BEGIN + unconditional RAISE aborts the transaction before any CREATE.
BEGIN;
DO $nexa_read_guard$
BEGIN
  RAISE EXCEPTION USING ERRCODE='42501',
    MESSAGE='STOP_NOT_AUTHORIZED_FOR_SQL_OR_DEPLOY';
END
$nexa_read_guard$;

-- Candidate: owner-only audit queue
create or replace function public.get_audit_queue_v2(
  queue_status text default null,
  from_at timestamptz default null,
  to_at timestamptz default null,
  search_text text default null,
  limit_count integer default 100,
  offset_count integer default 0
)
returns table(
  id uuid,
  source_consultation_id uuid,
  status text,
  priority smallint,
  submitted_at timestamptz,
  source_updated_at timestamptz,
  source_sync_version bigint,
  deidentified_fields jsonb,
  deidentified_core_context jsonb,
  reviewed_fields jsonb,
  audit_changes jsonb,
  review_note text,
  reviewer_id uuid,
  reviewed_at timestamptz,
  total_count bigint
)
language plpgsql
security invoker
set search_path=pg_catalog,pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_limit integer := greatest(1,least(coalesce(limit_count,100),200));
  v_offset integer := greatest(0,coalesce(offset_count,0));
  v_search text := nullif(btrim(coalesce(search_text,'')),'');
begin
  if v_actor is null then raise sqlstate '42501' using message='AUDIT_REVIEW_UNAUTHORIZED'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=v_actor and p.access_status='active' and p.clinical_access is true and (p.is_admin or p.is_reviewer) and coalesce(public.has_active_clinical_access(),false)
  ) then raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN'; end if;

  if queue_status is not null and queue_status not in ('pending','approved','corrected','discarded') then
    raise sqlstate '22023' using message='INVALID_AUDIT_STATUS';
  end if;

  return query
  with filtered as (
    select a.*
    from public.audit_cases a
    where (queue_status is null or a.status=queue_status)
      and a.submitted_by=v_actor
      and exists (
        select 1 from public.consultation_history source
        where source.encounter_id=a.source_consultation_id
          and source.user_id=v_actor
      )
      and (from_at is null or a.submitted_at>=from_at)
      and (to_at is null or a.submitted_at<to_at)
      and (
        v_search is null
        or a.deidentified_fields::text ilike '%'||v_search||'%'
        or coalesce(a.deidentified_core_context::text,'') ilike '%'||v_search||'%'
        or a.source_consultation_id::text ilike '%'||v_search||'%'
      )
  )
  select f.id,f.source_consultation_id,f.status,f.priority,f.submitted_at,
         f.source_updated_at,f.source_sync_version,f.deidentified_fields,
         f.deidentified_core_context,f.reviewed_fields,f.audit_changes,f.review_note,
         f.reviewer_id,f.reviewed_at,count(*) over()::bigint
  from filtered f
  order by f.priority desc,f.submitted_at asc
  limit v_limit offset v_offset;
end;
$$;

-- Candidate: owner-only dashboard
create or replace function public.get_audit_dashboard(period_days integer default 7)
returns table(
  total_received bigint,
  pending bigint,
  approved bigint,
  corrected bigint,
  discarded bigint,
  completed bigint,
  agreement_rate numeric,
  documentation_quality numeric
)
language plpgsql
security invoker
set search_path=pg_catalog,pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_from timestamptz;
begin
  if v_actor is null then raise sqlstate '42501' using message='AUDIT_REVIEW_UNAUTHORIZED'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=v_actor and p.access_status='active' and p.clinical_access is true and (p.is_admin or p.is_reviewer) and coalesce(public.has_active_clinical_access(),false)
  ) then raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN'; end if;
  v_from := case when coalesce(period_days,7)<=0 then null else now()-(period_days||' days')::interval end;

  return query
  with q as (
    select a.*
    from public.audit_cases a
    where (v_from is null or a.submitted_at>=v_from)
      and a.submitted_by=v_actor
      and exists (
        select 1 from public.consultation_history source
        where source.encounter_id=a.source_consultation_id
          and source.user_id=v_actor
      )
  ), s as (
    select
      count(*)::bigint total,
      count(*) filter(where status='pending')::bigint p,
      count(*) filter(where status='approved')::bigint a,
      count(*) filter(where status='corrected')::bigint c,
      count(*) filter(where status='discarded')::bigint d,
      avg(
        case
          when nullif(btrim(coalesce(deidentified_fields->>'hda','')),'') is null then 0
          else (
            (case when nullif(btrim(coalesce(deidentified_fields->>'queixa_principal','')),'') is not null then 1 else 0 end) +
            (case when nullif(btrim(coalesce(deidentified_fields->>'hda','')),'') is not null then 1 else 0 end) +
            (case when nullif(btrim(coalesce(deidentified_fields->>'exame_fisico','')),'') is not null then 1 else 0 end) +
            (case when nullif(btrim(coalesce(deidentified_fields->>'hipotese_diagnostica','')),'') is not null then 1 else 0 end) +
            (case when nullif(btrim(coalesce(deidentified_fields->>'conduta','')),'') is not null then 1 else 0 end)
          ) / 5.0
        end
      ) quality
    from q
  )
  select s.total,s.p,s.a,s.c,s.d,(s.a+s.c+s.d)::bigint,
    case when (s.a+s.c)>0 then round(100.0*s.a/(s.a+s.c),1) else 0 end,
    coalesce(round(100.0*s.quality,1),0)
  from s;
end;
$$;

-- Candidate: owner-only Core summary
create or replace function public.get_core_dataset_summary()
returns table(
  total_cases bigint,
  approved_cases bigint,
  corrected_cases bigint,
  documentation_ready_cases bigint,
  clinical_plan_ready_cases bigint,
  radar_ready_cases bigint,
  last_published_at timestamptz
)
language plpgsql
security invoker
set search_path=pg_catalog,pg_temp
as $$
declare
  v_actor uuid:=auth.uid();
begin
  if v_actor is null then raise sqlstate '42501' using message='AUDIT_REVIEW_UNAUTHORIZED'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_actor and p.access_status='active' and p.clinical_access is true and (p.is_admin or p.is_reviewer) and coalesce(public.has_active_clinical_access(),false)) then
    raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN';
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter(where quality_status='approved')::bigint,
    count(*) filter(where quality_status='corrected')::bigint,
    count(*) filter(where jsonb_typeof(case_data)='object' and case_data<>'{}'::jsonb)::bigint,
    count(*) filter(
      where jsonb_typeof(learning_profile->'clinical_plan')='object'
        and coalesce(learning_profile->'clinical_plan','{}'::jsonb)<>'{}'::jsonb
    )::bigint,
    count(*) filter(
      where jsonb_typeof(learning_profile->'radar_learning')='object'
        and coalesce(learning_profile->'radar_learning','{}'::jsonb)<>'{}'::jsonb
    )::bigint,
    max(audit_reviewed_at)
  from public.nexa_core_cases core
  join public.audit_cases a on a.id=core.audit_case_id
  join public.consultation_history source
    on source.encounter_id=a.source_consultation_id
  where a.submitted_by=v_actor and source.user_id=v_actor;
end;
$$;

-- No GRANT, REVOKE, grants via function owners, or policy changes.
-- All tests C01-C10/N01-N09 remain NOT_RUN. Gate C NO-GO 0/19.
COMMIT;
