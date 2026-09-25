begin;

alter table public.audit_cases
  add column if not exists priority smallint not null default 0,
  add column if not exists source_sync_version bigint not null default 0,
  add column if not exists source_updated_at timestamptz,
  add column if not exists last_synced_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.audit_cases'::regclass
      and conname='audit_cases_priority_check'
  ) then
    alter table public.audit_cases
      add constraint audit_cases_priority_check check (priority between 0 and 2);
  end if;
end $$;

create index if not exists audit_cases_queue_priority_idx
  on public.audit_cases(status, priority desc, submitted_at asc);

drop function if exists public.get_audit_queue_v2(text,timestamptz,timestamptz,text,integer,integer);
create function public.get_audit_queue_v2(
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
  review_note text,
  reviewer_id uuid,
  reviewed_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path=public,pg_temp
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
    where p.id=v_actor and p.access_status='active' and (p.is_admin or p.is_reviewer)
  ) then raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN'; end if;

  if queue_status is not null and queue_status not in ('pending','approved','corrected','discarded') then
    raise sqlstate '22023' using message='INVALID_AUDIT_STATUS';
  end if;

  return query
  with filtered as (
    select a.*
    from public.audit_cases a
    where (queue_status is null or a.status=queue_status)
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
         f.deidentified_core_context,f.reviewed_fields,f.review_note,
         f.reviewer_id,f.reviewed_at,count(*) over()::bigint
  from filtered f
  order by f.priority desc,f.submitted_at asc
  limit v_limit offset v_offset;
end;
$$;

revoke all on function public.get_audit_queue_v2(text,timestamptz,timestamptz,text,integer,integer) from public,anon;
grant execute on function public.get_audit_queue_v2(text,timestamptz,timestamptz,text,integer,integer) to authenticated;

drop function if exists public.get_audit_dashboard(integer);
create function public.get_audit_dashboard(period_days integer default 7)
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
security definer
set search_path=public,pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_from timestamptz;
begin
  if v_actor is null then raise sqlstate '42501' using message='AUDIT_REVIEW_UNAUTHORIZED'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=v_actor and p.access_status='active' and (p.is_admin or p.is_reviewer)
  ) then raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN'; end if;
  v_from := case when coalesce(period_days,7)<=0 then null else now()-(period_days||' days')::interval end;

  return query
  with q as (
    select a.*
    from public.audit_cases a
    where v_from is null or a.submitted_at>=v_from
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

revoke all on function public.get_audit_dashboard(integer) from public,anon;
grant execute on function public.get_audit_dashboard(integer) to authenticated;

create or replace function public.submit_audit_review(
  case_id uuid,
  decision text,
  corrected_fields jsonb default null,
  note text default null
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_actor uuid:=auth.uid();
  v_case public.audit_cases%rowtype;
  v_reviewed jsonb;
  v_layers jsonb;
  v_learning jsonb;
  v_target jsonb;
begin
  if v_actor is null then raise sqlstate '42501' using message='AUDIT_REVIEW_UNAUTHORIZED'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_actor and p.access_status='active' and (p.is_admin or p.is_reviewer)) then
    raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN';
  end if;
  if decision not in ('approved','corrected','discarded') then raise sqlstate '22023' using message='INVALID_AUDIT_DECISION'; end if;
  if decision='discarded' and nullif(btrim(coalesce(note,'')),'') is null then
    raise sqlstate '22023' using message='DISCARD_REASON_REQUIRED';
  end if;

  select ac.* into v_case from public.audit_cases ac where ac.id=case_id for update;
  if not found then raise sqlstate 'PT404' using message='AUDIT_CASE_NOT_FOUND'; end if;
  if v_case.status<>'pending' then raise sqlstate 'PT409' using message='AUDIT_REVIEW_CONFLICT'; end if;

  if decision='corrected' then
    if corrected_fields is null or jsonb_typeof(corrected_fields)<>'object' then
      raise sqlstate '22023' using message='CORRECTED_FIELDS_REQUIRED';
    end if;
    v_reviewed:=corrected_fields;
  elsif decision='approved' then
    v_reviewed:=v_case.deidentified_fields;
  else
    v_reviewed:=null;
  end if;

  update public.audit_cases
  set status=decision,reviewer_id=v_actor,reviewed_fields=v_reviewed,
      review_note=nullif(btrim(note),''),reviewed_at=now()
  where id=v_case.id;

  update public.consultation_history
  set encounter_state=case when decision='discarded' then 'discarded' else 'audited' end
  where encounter_id=v_case.source_consultation_id;

  if decision='discarded' then
    delete from public.nexa_core_cases where audit_case_id=v_case.id;
    return;
  end if;

  v_layers:=coalesce(v_case.deidentified_core_context->'learning_layers','{}'::jsonb);
  if jsonb_typeof(v_layers)<>'object' then v_layers:='{}'::jsonb; end if;
  if decision='corrected' then
    v_layers:=jsonb_set(v_layers,'{audit_corrected}',jsonb_build_object('fields',v_reviewed),true);
    v_target:=v_layers->'audit_corrected';
  else
    v_layers:=jsonb_set(v_layers,'{audit_corrected}','null'::jsonb,true);
    v_target:=coalesce(v_layers->'physician_final',jsonb_build_object('fields',v_reviewed));
  end if;

  v_learning:=jsonb_build_object(
    'original_ai',coalesce(v_layers->'original_ai','{}'::jsonb),
    'physician_final',coalesce(v_layers->'physician_final','{}'::jsonb),
    'audit_corrected',v_layers->'audit_corrected',
    'target',v_target,
    'source_consultation_id',v_case.source_consultation_id,
    'snapshot_version',v_case.snapshot_version,
    'destination',coalesce(v_case.deidentified_core_context->'destination','{}'::jsonb),
    'hypothesis_validation',coalesce(v_case.deidentified_core_context->'hypothesis_validation','{}'::jsonb),
    'audit_submission_snapshot',coalesce(v_case.deidentified_core_context->'audit_submission_snapshot','{}'::jsonb)
  );

  insert into public.nexa_core_cases(
    audit_case_id,case_mode,quality_status,case_data,learning_profile,
    core_schema_version,audit_reviewed_at,updated_at
  )
  values(
    v_case.id,nullif(v_case.deidentified_core_context->>'case_mode',''),decision,
    v_reviewed,v_learning,'3',now(),now()
  )
  on conflict(audit_case_id) do update
  set case_mode=excluded.case_mode,quality_status=excluded.quality_status,
      case_data=excluded.case_data,learning_profile=excluded.learning_profile,
      core_schema_version=excluded.core_schema_version,
      audit_reviewed_at=excluded.audit_reviewed_at,updated_at=excluded.updated_at;
end;
$$;

revoke all on function public.submit_audit_review(uuid,text,jsonb,text) from public,anon;
grant execute on function public.submit_audit_review(uuid,text,jsonb,text) to authenticated;

commit;
