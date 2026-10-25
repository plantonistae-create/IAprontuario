-- Fine-grained Radar question audit. Incremental migration AFTER v3 on staging.
-- Original Radar questions remain in clinical audit context; only clinician-rated labels + optional
-- generic missing-question text are stored here. Neither table is exposed to the Data API.
begin;
alter table public.nexa_core_radar_reviews
 add column if not exists question_reviews jsonb not null default '[]'::jsonb,
 add column if not exists missing_questions jsonb not null default '[]'::jsonb;
alter table public.nexa_core_radar_review_events
 add column if not exists question_reviews jsonb not null default '[]'::jsonb,
 add column if not exists missing_questions jsonb not null default '[]'::jsonb;

create or replace function public.save_nexa_radar_review_v4(
 p_case_id uuid,p_review_state text,p_labels jsonb,p_capture_meta jsonb,
 p_expected_revision integer,p_question_reviews jsonb,p_missing_questions jsonb
) returns integer
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
 v_snapshot jsonb;v_items jsonb;v_rating jsonb;v_missing jsonb;
 v_seen text[]:='{}';v_qid text;v_count integer;v_rev integer;
 v_questions jsonb:=coalesce(p_question_reviews,'[]'::jsonb);
 v_missing_list jsonb:=coalesce(p_missing_questions,'[]'::jsonb);
 v_text text;v_reason text;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles p
   where p.id=auth.uid() and p.access_status='active' and (p.is_admin or p.is_reviewer))
 then raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN'; end if;
 if jsonb_typeof(v_questions)<>'array' or jsonb_array_length(v_questions)>150
   or jsonb_typeof(v_missing_list)<>'array' or jsonb_array_length(v_missing_list)>30
 then raise sqlstate '22023' using message='RADAR_QUESTION_PAYLOAD_INVALID'; end if;

 select a.deidentified_core_context into v_snapshot from public.audit_cases a
   where a.id=p_case_id for update;
 if not found then raise sqlstate '22023' using message='AUDIT_CASE_NOT_FOUND'; end if;
 v_items:=v_snapshot->'radar_capture'->'items';
 if jsonb_typeof(v_items) is distinct from 'array' then v_items:='[]'::jsonb; end if;

 for v_rating in select value from jsonb_array_elements(v_questions) loop
   if jsonb_typeof(v_rating)<>'object'
     or (select count(*) from jsonb_object_keys(v_rating))<>3
     or exists(select 1 from jsonb_object_keys(v_rating) k where k not in ('question_id','verdict','reason_code'))
     or jsonb_typeof(v_rating->'question_id')<>'string'
     or jsonb_typeof(v_rating->'verdict')<>'string'
     or jsonb_typeof(v_rating->'reason_code')<>'string'
     or (v_rating->>'verdict') not in ('relevant','irrelevant','uncertain')
     or (v_rating->>'reason_code') not in ('appropriate','unrelated','duplicate','unsafe','context_dependent','wrong_priority','other')
   then raise sqlstate '22023' using message='RADAR_QUESTION_REVIEW_INVALID'; end if;
   v_qid:=v_rating->>'question_id';
   if v_qid=any(v_seen) or not exists(
      select 1 from jsonb_array_elements(v_items) x where x->>'id'=v_qid)
   then raise sqlstate '22023' using message='RADAR_QUESTION_NOT_IN_SNAPSHOT'; end if;
   v_seen:=array_append(v_seen,v_qid);
 end loop;

 for v_missing in select value from jsonb_array_elements(v_missing_list) loop
  if jsonb_typeof(v_missing)<>'object'
    or (select count(*) from jsonb_object_keys(v_missing))<>4
    or exists(select 1 from jsonb_object_keys(v_missing) k
       where k not in ('question','concept','priority','rationale'))
    or jsonb_typeof(v_missing->'question')<>'string'
    or jsonb_typeof(v_missing->'concept')<>'string'
    or jsonb_typeof(v_missing->'priority')<>'string'
    or jsonb_typeof(v_missing->'rationale')<>'string'
    or (v_missing->>'concept')!~'^[a-z][a-z0-9_]{0,63}$'
    or (v_missing->>'priority') not in ('critical','high','moderate','low')
  then raise sqlstate '22023' using message='RADAR_MISSING_QUESTION_INVALID'; end if;
  v_text:=btrim(v_missing->>'question');
  v_reason:=btrim(v_missing->>'rationale');
  if length(v_text)<8 or length(v_text)>240 or length(v_reason)>240
    or v_text ~* '([0-9]{3}[.]?[0-9]{3}[.]?[0-9]{3}[-]?[0-9]{2}|[[:alnum:]_.+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,})'
    or v_reason ~* '([0-9]{3}[.]?[0-9]{3}[.]?[0-9]{3}[-]?[0-9]{2}|[[:alnum:]_.+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,})'
    or v_text ~ '[0-9]{7,}' or v_reason ~ '[0-9]{7,}'
  then raise sqlstate '22023' using message='RADAR_FREE_TEXT_PII_OR_LENGTH'; end if;
 end loop;
 if p_review_state='reviewed' then
   if jsonb_array_length(v_items)=0 or v_snapshot->'radar_capture'->>'trace_truncated'='true'
     or coalesce(array_length(v_seen,1),0)<>jsonb_array_length(v_items)
   then raise sqlstate '22023' using message='RADAR_QUESTIONS_REQUIRE_FULL_REVIEW'; end if;
 end if;

 -- Calls v3's permission and concurrency checks, then atomically extends its new version.
 v_rev:=public.save_nexa_radar_review_v3(p_case_id,p_review_state,p_labels,p_capture_meta,p_expected_revision);
 update public.nexa_core_radar_reviews
   set question_reviews=v_questions,missing_questions=v_missing_list
   where audit_case_id=p_case_id and revision=v_rev;
 update public.nexa_core_radar_review_events
   set question_reviews=v_questions,missing_questions=v_missing_list
   where audit_case_id=p_case_id and revision=v_rev;
 return v_rev;
end;
$$;

create or replace function public.submit_nexa_audit_review_v4(
 p_case_id uuid,p_decision text,p_corrected_fields jsonb default null,p_note text default null,
 p_radar_review_state text default 'not_reviewed',p_radar_labels jsonb default '[]'::jsonb,
 p_capture_meta jsonb default '{}'::jsonb,p_question_reviews jsonb default '[]'::jsonb,
 p_missing_questions jsonb default '[]'::jsonb
) returns integer language plpgsql security invoker
set search_path=public,pg_temp as $$
declare v_rev integer;
begin
 perform public.submit_audit_review(p_case_id,p_decision,p_corrected_fields,p_note);
 if p_decision='discarded' then
  if p_radar_review_state<>'not_reviewed'
    or coalesce(jsonb_array_length(p_radar_labels),0)>0
    or coalesce(jsonb_array_length(p_question_reviews),0)>0
    or coalesce(jsonb_array_length(p_missing_questions),0)>0
  then raise sqlstate '22023' using message='DISCARDED_RADAR_ANNOTATIONS_FORBIDDEN'; end if;
  return 0;
 end if;
 v_rev:=public.save_nexa_radar_review_v4(p_case_id,p_radar_review_state,p_radar_labels,
   p_capture_meta,0,p_question_reviews,p_missing_questions);
 return v_rev;
end;
$$;

create or replace function public.get_nexa_radar_reviews_v4()
returns table (
 audit_case_id uuid,review_state text,labels jsonb,capture_meta jsonb,
 revision integer,updated_at timestamptz,question_reviews jsonb,missing_questions jsonb
)
language plpgsql stable security definer set search_path=public,pg_temp
as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles p
   where p.id=auth.uid() and p.access_status='active'
     and (p.is_admin or p.is_reviewer))
 then raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN'; end if;
 return query select r.audit_case_id,r.review_state,r.labels,r.capture_meta,
   r.revision,r.updated_at,r.question_reviews,r.missing_questions
   from public.nexa_core_radar_reviews r;
end;
$$;
-- Retire the legacy direct v3 writer so a client cannot assert "reviewed" without per-question checks.
revoke all on function public.save_nexa_radar_review_v3(uuid,text,jsonb,jsonb,integer) from authenticated;
revoke all on function public.submit_nexa_audit_review_v3(uuid,text,jsonb,text,text,jsonb,jsonb) from authenticated;
revoke all on function public.save_nexa_radar_review_v4(uuid,text,jsonb,jsonb,integer,jsonb,jsonb) from public,anon;
revoke all on function public.submit_nexa_audit_review_v4(uuid,text,jsonb,text,text,jsonb,jsonb,jsonb,jsonb) from public,anon;
revoke all on function public.get_nexa_radar_reviews_v4() from public,anon;
grant execute on function public.save_nexa_radar_review_v4(uuid,text,jsonb,jsonb,integer,jsonb,jsonb) to authenticated;
grant execute on function public.submit_nexa_audit_review_v4(uuid,text,jsonb,text,text,jsonb,jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.get_nexa_radar_reviews_v4() to authenticated;
commit;