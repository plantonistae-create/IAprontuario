-- NEXA Core Audit & Learning 2.0.
-- Reviewer-only, metadata-only annotation. Never authorizes model training.
create table if not exists public.nexa_core_audit_annotations (
  audit_case_id uuid primary key references public.audit_cases(id) on delete cascade,
  error_codes text[] not null default '{}'::text[],
  evaluation_candidate boolean not null default false,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint audit_annotation_error_count check (cardinality(error_codes)<=8),
  constraint audit_annotation_allowed_errors check (
    error_codes <@ array[
      'omission','fabrication','temporality','speaker',
      'redundancy','clinical_error','radar_missed_answer',
      'radar_missing_red_flag','other'
    ]::text[]
  )
);
create index if not exists idx_nexa_core_audit_annotation_eval
  on public.nexa_core_audit_annotations (evaluation_candidate,updated_at desc);
alter table public.nexa_core_audit_annotations enable row level security;
revoke all on public.nexa_core_audit_annotations from public,anon,authenticated;

-- Read-only aggregate metrics. Never returns identifiers or clinical text.
create or replace function public.get_nexa_audit_learning_metrics()
returns jsonb
language plpgsql stable security definer
set search_path=public,pg_temp
as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not exists(
    select 1 from public.profiles p
    where p.id=v_actor and p.access_status='active'
      and (p.is_admin is true or p.is_reviewer is true)
  ) then
    raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN';
  end if;
  return jsonb_build_object(
    'schema_version','nexa-audit-learning-metrics-v1',
    'consultations',(select count(*) from public.consultation_history),
    'ready_for_audit',(select count(*) from public.consultation_history where encounter_state='ready_for_audit'),
    'queued',(select count(*) from public.audit_cases where status='pending'),
    'approved',(select count(*) from public.audit_cases where status='approved'),
    'corrected',(select count(*) from public.audit_cases where status='corrected'),
    'discarded',(select count(*) from public.audit_cases where status='discarded'),
    'audited_total',(select count(*) from public.audit_cases where status in ('approved','corrected')),
    'core_cases',(select count(*) from public.nexa_core_cases),
    'radar_items_available',(select count(*) from public.audit_cases a
      where jsonb_typeof(a.deidentified_core_context->'radar_learning'->'items')='array'
      and jsonb_array_length(a.deidentified_core_context->'radar_learning'->'items')>0),
    'original_final_available',(select count(*) from public.audit_cases a
      where jsonb_typeof(a.deidentified_core_context->'learning_layers'->'original_ai')='object'
      and a.deidentified_core_context->'learning_layers'->'original_ai'<>'{}'::jsonb
      and jsonb_typeof(a.deidentified_core_context->'learning_layers'->'physician_final')='object'
      and a.deidentified_core_context->'learning_layers'->'physician_final'<>'{}'::jsonb),
    'reviewed_radar_items',(select count(*) from public.audit_cases a where a.status in ('approved','corrected')
      and jsonb_typeof(a.deidentified_core_context->'radar_learning'->'items')='array'
      and jsonb_array_length(a.deidentified_core_context->'radar_learning'->'items')>0),
    'evaluation_candidates',(select count(*) from public.nexa_core_audit_annotations n
      join public.audit_cases a on a.id=n.audit_case_id
      where n.evaluation_candidate=true and a.status in ('approved','corrected')),
    'training_rights_approved',(select count(*) from public.nexa_core_dataset_approvals d
      join public.audit_cases a on a.id=d.audit_case_id
      where d.approved=true and d.deidentification_reviewed=true
        and d.revoked_at is null and a.status in ('approved','corrected'))
  );
end;
$$;

-- Metadata-only annotation read for reviewers. Cases stay on existing RLS-protected audit RPC.
create or replace function public.get_nexa_audit_annotations()
returns table(audit_case_id uuid,error_codes text[],evaluation_candidate boolean,updated_at timestamptz)
language plpgsql stable security definer
set search_path=public,pg_temp
as $$
declare v_actor uuid:=auth.uid();
begin
  if v_actor is null or not exists(select 1 from public.profiles p
    where p.id=v_actor and p.access_status='active'
    and (p.is_admin is true or p.is_reviewer is true)) then
    raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN';
  end if;
  return query select n.audit_case_id,n.error_codes,n.evaluation_candidate,n.updated_at
    from public.nexa_core_audit_annotations n;
end;
$$;

create or replace function public.save_nexa_audit_annotation(
  p_case_id uuid,
  p_error_codes text[],
  p_evaluation_candidate boolean
)
returns void
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare v_actor uuid:=auth.uid();v_status text;v_codes text[];
begin
  if v_actor is null or not exists(select 1 from public.profiles p
    where p.id=v_actor and p.access_status='active'
    and (p.is_admin is true or p.is_reviewer is true)) then
    raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN';
  end if;
  v_codes:=coalesce(p_error_codes,'{}'::text[]);
  if cardinality(v_codes)>8 or array_position(v_codes,null) is not null
     or not(v_codes<@array[
       'omission','fabrication','temporality','speaker','redundancy',
       'clinical_error','radar_missed_answer','radar_missing_red_flag','other'
     ]::text[]) then
    raise sqlstate '22023' using message='INVALID_ERROR_TAXONOMY';
  end if;
  select status into v_status from public.audit_cases where id=p_case_id;
  if v_status is null then raise sqlstate '22023' using message='AUDIT_CASE_NOT_FOUND'; end if;
  if coalesce(p_evaluation_candidate,false) and v_status not in ('approved','corrected') then
    raise sqlstate '22023' using message='CLINICAL_REVIEW_REQUIRED_FOR_EVALUATION';
  end if;
  insert into public.nexa_core_audit_annotations(
    audit_case_id,error_codes,evaluation_candidate,updated_by,updated_at
  ) values(
    p_case_id,v_codes,coalesce(p_evaluation_candidate,false),v_actor,now()
  )
  on conflict(audit_case_id) do update set
    error_codes=excluded.error_codes,
    evaluation_candidate=excluded.evaluation_candidate,
    updated_by=excluded.updated_by,
    updated_at=excluded.updated_at;
end;
$$;

revoke all on function public.get_nexa_audit_learning_metrics() from public,anon;
revoke all on function public.get_nexa_audit_annotations() from public,anon;
revoke all on function public.save_nexa_audit_annotation(uuid,text[],boolean) from public,anon;
grant execute on function public.get_nexa_audit_learning_metrics() to authenticated;
grant execute on function public.get_nexa_audit_annotations() to authenticated;
grant execute on function public.save_nexa_audit_annotation(uuid,text[],boolean) to authenticated;

comment on table public.nexa_core_audit_annotations is
  'Reviewer-only taxonomy and evaluation candidate; not a legal rights grant and never a training export authorization.';
