-- NEXA P0 Gate C — REVIEW ONLY / NO SQL EXECUTION OR DEPLOY.
-- Versioned source blobs:
-- supabase/migrations/20261017173000_nexa_core_audit_learning_v2.sql : 92e08dae931fbb845da0e61887d51db2ce26df08
-- supabase/migrations/20261025150000_nexa_core_radar_reviews_v3.sql : 3e20477227fc099bfbdb6372a8af6d792244fa06
-- supabase/migrations/20261025173000_nexa_core_radar_question_reviews_v4.sql : c243b4d16b6f7d81e40811bd64538029217b823d
-- Four verified global reads behind SECURITY DEFINER and staff checks.
-- Scope audit submissions AND consultation source to authenticated physician.
-- Keep return contracts; metrics now represent the individual owner only.
-- SECURITY INVOKER intentionally fails closed with current restrictive RLS/ACL.
-- No rights/grants/policies, tenant, consent, ACK, AI egress or training authorization.
-- Prior candidates, migrations, production and database remain untouched.
-- The transaction ALWAYS fails before any CREATE OR REPLACE.
BEGIN;
DO $nexa_global_reads_stop$
BEGIN
 RAISE EXCEPTION USING ERRCODE='42501',
   MESSAGE='STOP_NOT_AUTHORIZED_FOR_SQL_OR_DEPLOY';
END
$nexa_global_reads_stop$;

-- get_nexa_audit_learning_metrics: owner-only REVIEW-ONLY candidate
create or replace function public.get_nexa_audit_learning_metrics()
returns jsonb
language plpgsql stable security invoker
set search_path=pg_catalog,pg_temp
as $$
declare v_actor uuid:=auth.uid(); v_result jsonb;
begin
  if v_actor is null or not coalesce(public.has_active_clinical_access(),false) or not exists(
    select 1 from public.profiles p
    where p.id=v_actor and p.access_status='active' and p.clinical_access is true
      and (p.is_admin is true or p.is_reviewer is true)
  ) then
    raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN';
  end if;
  with owned_consultations as (
    select source.encounter_id,source.encounter_state
    from public.consultation_history source
    where source.user_id=v_actor
  ), owned_cases as (
    select a.*
    from public.audit_cases a
    join owned_consultations source on source.encounter_id=a.source_consultation_id
    where a.submitted_by=v_actor
  )
  select jsonb_build_object(
    'schema_version','nexa-audit-learning-metrics-v1',
    'consultations',(select count(*) from owned_consultations),
    'ready_for_audit',(select count(*) from owned_consultations where encounter_state='ready_for_audit'),
    'queued',(select count(*) from owned_cases where status='pending'),
    'approved',(select count(*) from owned_cases where status='approved'),
    'corrected',(select count(*) from owned_cases where status='corrected'),
    'discarded',(select count(*) from owned_cases where status='discarded'),
    'audited_total',(select count(*) from owned_cases where status in ('approved','corrected')),
    'core_cases',(select count(*) from public.nexa_core_cases core join owned_cases a on a.id=core.audit_case_id),
    'radar_items_available',(select count(*) from owned_cases a
      where jsonb_typeof(a.deidentified_core_context->'radar_learning'->'items')='array'
      and jsonb_array_length(a.deidentified_core_context->'radar_learning'->'items')>0),
    'original_final_available',(select count(*) from owned_cases a
      where jsonb_typeof(a.deidentified_core_context->'learning_layers'->'original_ai')='object'
      and a.deidentified_core_context->'learning_layers'->'original_ai'<>'{}'::jsonb
      and jsonb_typeof(a.deidentified_core_context->'learning_layers'->'physician_final')='object'
      and a.deidentified_core_context->'learning_layers'->'physician_final'<>'{}'::jsonb),
    'reviewed_radar_items',(select count(*) from owned_cases a where a.status in ('approved','corrected')
      and jsonb_typeof(a.deidentified_core_context->'radar_learning'->'items')='array'
      and jsonb_array_length(a.deidentified_core_context->'radar_learning'->'items')>0),
    'evaluation_candidates',(select count(*) from public.nexa_core_audit_annotations n
      join owned_cases a on a.id=n.audit_case_id
      where n.evaluation_candidate=true and a.status in ('approved','corrected')),
    'training_rights_approved',(select count(*) from public.nexa_core_dataset_approvals d
      join owned_cases a on a.id=d.audit_case_id
      where d.approved=true and d.deidentification_reviewed=true
        and d.revoked_at is null and a.status in ('approved','corrected'))
  ) into v_result;
  return v_result;
end;
$$;

-- get_nexa_radar_reviews_v3: owner-only REVIEW-ONLY candidate
create or replace function public.get_nexa_radar_reviews_v3()
returns table (
 audit_case_id uuid,review_state text,labels jsonb,capture_meta jsonb,
 revision integer,updated_at timestamptz
)
language plpgsql stable security invoker
set search_path=pg_catalog,pg_temp
as $$
declare v_actor uuid:=auth.uid();
begin
 if v_actor is null or not coalesce(public.has_active_clinical_access(),false) or not exists(
  select 1 from public.profiles p where p.id=v_actor and p.access_status='active' and p.clinical_access is true
   and (p.is_admin is true or p.is_reviewer is true)
 ) then raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN'; end if;
 return query select r.audit_case_id,r.review_state,r.labels,r.capture_meta,
  r.revision,r.updated_at from public.nexa_core_radar_reviews r
   join public.audit_cases a on a.id=r.audit_case_id
   join public.consultation_history source on source.encounter_id=a.source_consultation_id
   where a.submitted_by=v_actor and source.user_id=v_actor;
end;
$$;

-- get_nexa_radar_reviews_v4: owner-only REVIEW-ONLY candidate
create or replace function public.get_nexa_radar_reviews_v4()
returns table (
 audit_case_id uuid,review_state text,labels jsonb,capture_meta jsonb,
 revision integer,updated_at timestamptz,question_reviews jsonb,missing_questions jsonb
)
language plpgsql stable security invoker set search_path=pg_catalog,pg_temp
as $$
declare v_actor uuid:=auth.uid();
begin
 if v_actor is null or not coalesce(public.has_active_clinical_access(),false) or not exists(select 1 from public.profiles p
   where p.id=v_actor and p.access_status='active' and p.clinical_access is true
     and (p.is_admin or p.is_reviewer))
 then raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN'; end if;
 return query select r.audit_case_id,r.review_state,r.labels,r.capture_meta,
   r.revision,r.updated_at,r.question_reviews,r.missing_questions
   from public.nexa_core_radar_reviews r
   join public.audit_cases a on a.id=r.audit_case_id
   join public.consultation_history source on source.encounter_id=a.source_consultation_id
   where a.submitted_by=v_actor and source.user_id=v_actor;
end;
$$;

-- get_nexa_radar_readiness_v3: owner-only REVIEW-ONLY candidate
create or replace function public.get_nexa_radar_readiness_v3()
returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,pg_temp
as $$
declare v_audited integer; v_actor uuid:=auth.uid(); v_result jsonb;
begin
 if v_actor is null or not coalesce(public.has_active_clinical_access(),false) or not exists(
  select 1 from public.profiles p where p.id=v_actor and p.access_status='active' and p.clinical_access is true
   and (p.is_admin is true or p.is_reviewer is true)
 ) then raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN'; end if;
 select count(*) into v_audited from public.audit_cases a
    join public.consultation_history source on source.encounter_id=a.source_consultation_id
    where a.submitted_by=v_actor and source.user_id=v_actor
      and a.status in ('approved','corrected');
 with owned_cases as (
   select a.id,a.status from public.audit_cases a
   join public.consultation_history source on source.encounter_id=a.source_consultation_id
   where a.submitted_by=v_actor and source.user_id=v_actor
 )
 select jsonb_build_object(
  'schema_version','nexa-core-audit-readiness-v3','pilot_target',30,
  'audited_total',v_audited,'remaining_to_pilot',greatest(0,30-v_audited),
  'radar_reviewed',(select count(*) from public.nexa_core_radar_reviews r
    join owned_cases a on a.id=r.audit_case_id
    where r.review_state='reviewed' and a.status in ('approved','corrected')),
  'radar_not_reviewed',(select count(*) from owned_cases a
    left join public.nexa_core_radar_reviews r on r.audit_case_id=a.id
    where a.status in ('approved','corrected') and coalesce(r.review_state,'not_reviewed')='not_reviewed'),
  'training_rights_approved',(select count(*) from public.nexa_core_dataset_approvals d
    join owned_cases a on a.id=d.audit_case_id
    where d.approved and d.deidentification_reviewed and d.revoked_at is null
      and a.status in ('approved','corrected')),
  'model_ready',false,'clinical_validation_required',true,
  'patient_grouped_split_validated',false
 ) into v_result;
 return v_result;
end;
$$;
-- No grants, revokes, policies, roles, DDL or CI authorized.
-- C01-C10 and N01-N09 NOT_RUN; Gate C NO-GO 0/19.
COMMIT;
