-- NEXA Core Radar Review v3. Metadata-only, reviewer-authenticated and append-only revisions.
-- Adds no direct public/anon/authenticated table access. Does NOT grant training rights.
begin;

create table if not exists public.nexa_core_radar_reviews (
  audit_case_id uuid primary key references public.audit_cases(id) on delete cascade,
  review_state text not null default 'not_reviewed'
    check (review_state in ('not_reviewed','reviewed')),
  labels jsonb not null default '[]'::jsonb
    check (jsonb_typeof(labels)='array' and jsonb_array_length(labels)<=24),
  capture_meta jsonb not null default '{}'::jsonb
    check (jsonb_typeof(capture_meta)='object'),
  revision integer not null default 1 check (revision between 1 and 100000),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create index if not exists idx_nexa_radar_review_state
  on public.nexa_core_radar_reviews(review_state,updated_at desc);

create table if not exists public.nexa_core_radar_review_events (
  id uuid primary key default gen_random_uuid(),
  audit_case_id uuid not null references public.audit_cases(id) on delete cascade,
  revision integer not null check (revision>0),
  review_state text not null check (review_state in ('not_reviewed','reviewed')),
  labels jsonb not null check (jsonb_typeof(labels)='array'),
  capture_meta jsonb not null check (jsonb_typeof(capture_meta)='object'),
  actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(audit_case_id,revision)
);
create index if not exists idx_nexa_radar_review_history
  on public.nexa_core_radar_review_events(audit_case_id,revision);
alter table public.nexa_core_radar_reviews enable row level security;
alter table public.nexa_core_radar_review_events enable row level security;
revoke all on public.nexa_core_radar_reviews from public,anon,authenticated;
revoke all on public.nexa_core_radar_review_events from public,anon,authenticated;

-- Historical revision rows are append-only to authenticated clients (RLS + revoked DML).
-- On legitimate patient-data erasure, FK cascade must remain possible.

-- Validate metadata before persistence: only recognized categorical labels and technical versions.
create or replace function public.save_nexa_radar_review_v3(
 p_case_id uuid,
 p_review_state text,
 p_labels jsonb,
 p_capture_meta jsonb,
 p_expected_revision integer default 0
) returns integer
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
 v_actor uuid:=auth.uid();
 v_case_status text;
 v_current integer;
 v_revision integer;
 v_label jsonb;
 v_key text;
 v_meta jsonb:=coalesce(p_capture_meta,'{}'::jsonb);
 v_labels jsonb:=coalesce(p_labels,'[]'::jsonb);
begin
 if v_actor is null or not exists(
   select 1 from public.profiles p where p.id=v_actor and p.access_status='active'
     and (p.is_admin is true or p.is_reviewer is true)
 ) then raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN'; end if;
 if p_review_state not in ('not_reviewed','reviewed')
   or jsonb_typeof(v_labels) is distinct from 'array'
   or jsonb_array_length(v_labels)>24
   or jsonb_typeof(v_meta) is distinct from 'object'
   or (select count(*) from jsonb_object_keys(v_meta))>6
   or p_expected_revision is null or p_expected_revision<0
 then raise sqlstate '22023' using message='RADAR_REVIEW_INVALID'; end if;
 for v_key in select jsonb_object_keys(v_meta) loop
   if v_key not in ('engine_version','provider','model_version','prompt_version','evidence_version','frontend_version')
     or jsonb_typeof(v_meta->v_key)<>'string'
     or (v_meta->>v_key)!~'^[A-Za-z0-9._:-]{1,80}$'
   then raise sqlstate '22023' using message='RADAR_CAPTURE_METADATA_INVALID'; end if;
 end loop;
 if p_review_state='not_reviewed' and jsonb_array_length(v_labels)>0
 then raise sqlstate '22023' using message='UNREVIEWED_LABELS_FORBIDDEN'; end if;
 for v_label in select value from jsonb_array_elements(v_labels) loop
   if jsonb_typeof(v_label)<>'object'
     or (select count(*) from jsonb_object_keys(v_label))<>3
     or exists(select 1 from jsonb_object_keys(v_label) k
               where k not in ('concept','issue','outcome'))
     or jsonb_typeof(v_label->'concept')<>'string'
     or (v_label->>'concept')!~'^[a-z][a-z0-9_]{0,63}$'
     or (v_label->>'issue') not in
       ('missed_question','missed_answer','false_positive','redundant_question',
        'wrong_priority','missing_red_flag','unsafe_inference','other')
     or (v_label->>'outcome') not in ('confirmed','corrected','not_applicable')
   then raise sqlstate '22023' using message='RADAR_LABEL_INVALID'; end if;
 end loop;
 select a.status into v_case_status from public.audit_cases a
   where a.id=p_case_id for update;
 if not found then raise sqlstate '22023' using message='AUDIT_CASE_NOT_FOUND'; end if;
 if v_case_status not in ('approved','corrected') then
   raise sqlstate '22023' using message='RADAR_CLINICAL_REVIEW_REQUIRED'; end if;
 select revision into v_current from public.nexa_core_radar_reviews
   where audit_case_id=p_case_id for update;
 if coalesce(v_current,0)<>p_expected_revision then
   raise sqlstate 'PT409' using message='RADAR_REVIEW_REVISION_CONFLICT'; end if;
 v_revision:=coalesce(v_current,0)+1;
 insert into public.nexa_core_radar_reviews
   (audit_case_id,review_state,labels,capture_meta,revision,updated_by,updated_at)
 values(p_case_id,p_review_state,v_labels,v_meta,v_revision,v_actor,now())
 on conflict(audit_case_id) do update set
   review_state=excluded.review_state,labels=excluded.labels,
   capture_meta=excluded.capture_meta,revision=excluded.revision,
   updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into public.nexa_core_radar_review_events
   (audit_case_id,revision,review_state,labels,capture_meta,actor_id)
 values(p_case_id,v_revision,p_review_state,v_labels,v_meta,v_actor);
 return v_revision;
end;
$$;

-- Submit the clinical review and Radar annotation in ONE transaction.
-- A failure rolls back BOTH rather than leaving a partially audited case.
create or replace function public.submit_nexa_audit_review_v3(
 p_case_id uuid,
 p_decision text,
 p_corrected_fields jsonb default null,
 p_note text default null,
 p_radar_review_state text default 'not_reviewed',
 p_radar_labels jsonb default '[]'::jsonb,
 p_capture_meta jsonb default '{}'::jsonb
) returns integer
language plpgsql security invoker
set search_path=public,pg_temp
as $$
declare v_revision integer;
begin
 perform public.submit_audit_review(p_case_id,p_decision,p_corrected_fields,p_note);
 if p_decision='discarded' then
   if p_radar_review_state<>'not_reviewed' or
      coalesce(jsonb_array_length(p_radar_labels),0)>0 then
     raise sqlstate '22023' using message='DISCARDED_RADAR_LABELS_FORBIDDEN'; end if;
   return 0;
 end if;
 v_revision:=public.save_nexa_radar_review_v3(
   p_case_id,p_radar_review_state,p_radar_labels,p_capture_meta,0
 );
 return v_revision;
end;
$$;

create or replace function public.get_nexa_radar_reviews_v3()
returns table (
 audit_case_id uuid,review_state text,labels jsonb,capture_meta jsonb,
 revision integer,updated_at timestamptz
)
language plpgsql stable security definer
set search_path=public,pg_temp
as $$
begin
 if auth.uid() is null or not exists(
  select 1 from public.profiles p where p.id=auth.uid() and p.access_status='active'
   and (p.is_admin is true or p.is_reviewer is true)
 ) then raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN'; end if;
 return query select r.audit_case_id,r.review_state,r.labels,r.capture_meta,
  r.revision,r.updated_at from public.nexa_core_radar_reviews r;
end;
$$;

create or replace function public.get_nexa_radar_readiness_v3()
returns jsonb language plpgsql stable security definer
set search_path=public,pg_temp
as $$
declare v_audited integer;
begin
 if auth.uid() is null or not exists(
  select 1 from public.profiles p where p.id=auth.uid() and p.access_status='active'
   and (p.is_admin is true or p.is_reviewer is true)
 ) then raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN'; end if;
 select count(*) into v_audited from public.audit_cases where status in ('approved','corrected');
 return jsonb_build_object(
  'schema_version','nexa-core-audit-readiness-v3','pilot_target',30,
  'audited_total',v_audited,'remaining_to_pilot',greatest(0,30-v_audited),
  'radar_reviewed',(select count(*) from public.nexa_core_radar_reviews r
    join public.audit_cases a on a.id=r.audit_case_id
    where r.review_state='reviewed' and a.status in ('approved','corrected')),
  'radar_not_reviewed',(select count(*) from public.audit_cases a
    left join public.nexa_core_radar_reviews r on r.audit_case_id=a.id
    where a.status in ('approved','corrected') and coalesce(r.review_state,'not_reviewed')='not_reviewed'),
  'training_rights_approved',(select count(*) from public.nexa_core_dataset_approvals d
    join public.audit_cases a on a.id=d.audit_case_id
    where d.approved and d.deidentification_reviewed and d.revoked_at is null
      and a.status in ('approved','corrected')),
  'model_ready',false,'clinical_validation_required',true,
  'patient_grouped_split_validated',false
 );
end;
$$;

revoke all on function public.save_nexa_radar_review_v3(uuid,text,jsonb,jsonb,integer) from public,anon;
revoke all on function public.submit_nexa_audit_review_v3(uuid,text,jsonb,text,text,jsonb,jsonb) from public,anon;
revoke all on function public.get_nexa_radar_reviews_v3() from public,anon;
revoke all on function public.get_nexa_radar_readiness_v3() from public,anon;
grant execute on function public.save_nexa_radar_review_v3(uuid,text,jsonb,jsonb,integer) to authenticated;
grant execute on function public.submit_nexa_audit_review_v3(uuid,text,jsonb,text,text,jsonb,jsonb) to authenticated;
grant execute on function public.get_nexa_radar_reviews_v3() to authenticated;
grant execute on function public.get_nexa_radar_readiness_v3() to authenticated;

comment on table public.nexa_core_radar_reviews is
 'Human-reviewed Radar annotations only. Clinical review and training rights are separate.';
comment on table public.nexa_core_radar_review_events is
 'Immutable version history of Radar label revisions, metadata only, never raw clinical text.';
commit;
