begin;

alter table public.audit_cases add column if not exists snapshot_version text not null default 'final-v1';

comment on column public.audit_cases.snapshot_version is 'Immutable audit snapshot version; logical identity is source_consultation_id + snapshot_version.';

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid='public.audit_cases'::regclass
      and contype='u'
      and pg_get_constraintdef(oid)='UNIQUE (source_consultation_id)'
  loop
    execute format('alter table public.audit_cases drop constraint %I',r.conname);
  end loop;
end $$;

do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.audit_cases'::regclass and conname='audit_cases_source_snapshot_key') then
    alter table public.audit_cases add constraint audit_cases_source_snapshot_key unique(source_consultation_id,snapshot_version);
  end if;
end $$;

create index if not exists audit_cases_status_submitted_idx on public.audit_cases(status,submitted_at desc);

create or replace function public.submit_audit_review(case_id uuid, decision text, corrected_fields jsonb default null, note text default null)
returns jsonb
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
  if not exists(select 1 from public.profiles p where p.id=v_actor and p.access_status='active' and (p.is_admin or p.is_reviewer)) then raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN'; end if;
  if decision not in ('approved','corrected','discarded') then raise sqlstate '22023' using message='INVALID_AUDIT_DECISION'; end if;

  select ac.* into v_case from public.audit_cases ac where ac.id=case_id for update;
  if not found then raise sqlstate 'PT404' using message='AUDIT_CASE_NOT_FOUND'; end if;
  if v_case.status<>'pending' then raise sqlstate 'PT409' using message='AUDIT_REVIEW_CONFLICT'; end if;

  if decision='corrected' then
    if corrected_fields is null or jsonb_typeof(corrected_fields)<>'object' then raise sqlstate '22023' using message='CORRECTED_FIELDS_REQUIRED'; end if;
    v_reviewed:=corrected_fields;
  elsif decision='approved' then
    v_reviewed:=v_case.deidentified_fields;
  else
    v_reviewed:=null;
  end if;

  update public.audit_cases ac set status=decision,reviewer_id=v_actor,reviewed_fields=v_reviewed,review_note=nullif(btrim(note),''),reviewed_at=now() where ac.id=v_case.id;

  if decision='discarded' then
    delete from public.nexa_core_cases nc where nc.audit_case_id=v_case.id;
    return jsonb_build_object('ok',true,'case_id',v_case.id,'status','discarded','eligible_for_learning',false);
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

  v_learning:=jsonb_build_object('original_ai',coalesce(v_layers->'original_ai','{}'::jsonb),'physician_final',coalesce(v_layers->'physician_final','{}'::jsonb),'audit_corrected',v_layers->'audit_corrected','target',v_target,'source_consultation_id',v_case.source_consultation_id,'snapshot_version',v_case.snapshot_version,'destination',coalesce(v_case.deidentified_core_context->'destination','{}'::jsonb),'hypothesis_validation',coalesce(v_case.deidentified_core_context->'hypothesis_validation','{}'::jsonb),'audit_submission_snapshot',coalesce(v_case.deidentified_core_context->'audit_submission_snapshot','{}'::jsonb));

  insert into public.nexa_core_cases(audit_case_id,case_mode,quality_status,case_data,learning_profile,core_schema_version,audit_reviewed_at,updated_at)
  values(v_case.id,nullif(v_case.deidentified_core_context->>'case_mode',''),decision,v_reviewed,v_learning,'3',now(),now())
  on conflict(audit_case_id) do update set case_mode=excluded.case_mode,quality_status=excluded.quality_status,case_data=excluded.case_data,learning_profile=excluded.learning_profile,core_schema_version=excluded.core_schema_version,audit_reviewed_at=excluded.audit_reviewed_at,updated_at=excluded.updated_at;

  return jsonb_build_object('ok',true,'case_id',v_case.id,'status',decision,'eligible_for_learning',true);
end;
$$;

revoke all on function public.submit_audit_review(uuid,text,jsonb,text) from public;
revoke all on function public.submit_audit_review(uuid,text,jsonb,text) from anon;
grant execute on function public.submit_audit_review(uuid,text,jsonb,text) to authenticated;

alter table public.audit_cases enable row level security;
alter table public.nexa_core_cases enable row level security;

commit;
