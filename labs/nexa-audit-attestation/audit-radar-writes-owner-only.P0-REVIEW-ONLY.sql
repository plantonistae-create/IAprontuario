-- NEXA Gate C P0 — REVIEW-ONLY SQL CANDIDATE. NEVER EXECUTE/DEPLOY.
-- Exact sources in PR #177 at db52127e0374ceaee53906853aa152ea45d5307f:
-- supabase/migrations/20261017173000_nexa_core_audit_learning_v2.sql @ Git blob 92e08dae931fbb845da0e61887d51db2ce26df08
-- supabase/migrations/20261025150000_nexa_core_radar_reviews_v3.sql @ Git blob 3e20477227fc099bfbdb6372a8af6d792244fa06
-- supabase/migrations/20261025173000_nexa_core_radar_question_reviews_v4.sql @ Git blob c243b4d16b6f7d81e40811bd64538029217b823d
--
-- Existing privileged writes:
--   save_nexa_audit_annotation: unrestricted case status lookup/upsert.
--   save_nexa_radar_review_v3: unrestricted case state/revision append.
--   save_nexa_radar_review_v4: unrestricted clinical snapshot before v3.
-- Current admin/reviewer gate alone does not prove ownership.
--
-- These three candidate replacements preserve RPC signatures, clinical
-- validators, evaluation restrictions, revision optimistic-lock checks,
-- and v3->v4 transaction/event ordering. Every case is required to have
-- BOTH source.user_id and audit_cases.submitted_by matching auth.uid().
-- Source case and consultation rows are locked before their content/state
-- is read or written. Orphans, NULL owner and cross-owner cases fail closed.
-- Do not assert effective isolation, consent, physician ACK or training right.
--
-- All candidates are SECURITY INVOKER. Existing restrictive RLS/ACL may
-- reject even legitimate writes. This is intentional until independently
-- authorized grants/policies and runtime tests exist; no bypass is added.
-- No original migrations, RLS, ACL, roles, service_role secrets or deployments.
--
-- HARD STOP: transaction aborts before any CREATE OR REPLACE.
BEGIN;
DO $nexa_owner_only_write_stop$
BEGIN
  RAISE EXCEPTION USING ERRCODE='42501',
    MESSAGE='STOP_NOT_AUTHORIZED_FOR_SQL_OR_DEPLOY';
END
$nexa_owner_only_write_stop$;

-- Candidate: save_nexa_audit_annotation
create or replace function public.save_nexa_audit_annotation(
  p_case_id uuid,
  p_error_codes text[],
  p_evaluation_candidate boolean
)
returns void
language plpgsql security invoker
set search_path=pg_catalog,pg_temp
as $$
declare v_actor uuid:=auth.uid();v_status text;v_codes text[];
begin
  if v_actor is null or not coalesce(public.has_active_clinical_access(),false) or not exists(select 1 from public.profiles p
    where p.id=v_actor and p.access_status='active' and p.clinical_access is true
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
  -- Case selection, authorship and consultation ownership must ALL be
  -- database-authoritative. Lock the linked rows before any annotation write.
  select a.status into v_status
    from public.audit_cases a
    join public.consultation_history source
      on source.encounter_id=a.source_consultation_id
    where a.id=p_case_id
      and a.submitted_by=v_actor
      and source.user_id=v_actor
    for update of a,source;
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

-- Candidate: save_nexa_radar_review_v3
create or replace function public.save_nexa_radar_review_v3(
 p_case_id uuid,
 p_review_state text,
 p_labels jsonb,
 p_capture_meta jsonb,
 p_expected_revision integer default 0
) returns integer
language plpgsql security invoker
set search_path=pg_catalog,pg_temp
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
 if v_actor is null or not coalesce(public.has_active_clinical_access(),false) or not exists(
   select 1 from public.profiles p where p.id=v_actor and p.access_status='active' and p.clinical_access is true
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
 -- Deny a foreign or orphan case BEFORE inspecting its state. The source
 -- is locked alongside the audit row to keep ownership stable for the
 -- revision insert and append-only event in this same transaction.
 select a.status into v_case_status
   from public.audit_cases a
   join public.consultation_history source
     on source.encounter_id=a.source_consultation_id
   where a.id=p_case_id
     and a.submitted_by=v_actor
     and source.user_id=v_actor
   for update of a,source;
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

-- Candidate: save_nexa_radar_review_v4
create or replace function public.save_nexa_radar_review_v4(
 p_case_id uuid,p_review_state text,p_labels jsonb,p_capture_meta jsonb,
 p_expected_revision integer,p_question_reviews jsonb,p_missing_questions jsonb
) returns integer
language plpgsql security invoker set search_path=pg_catalog,pg_temp
as $$
declare
 v_actor uuid:=auth.uid();
 v_snapshot jsonb;v_items jsonb;v_rating jsonb;v_missing jsonb;
 v_seen text[]:='{}';v_qid text;v_count integer;v_rev integer;
 v_questions jsonb:=coalesce(p_question_reviews,'[]'::jsonb);
 v_missing_list jsonb:=coalesce(p_missing_questions,'[]'::jsonb);
 v_text text;v_reason text;
begin
 if v_actor is null or not coalesce(public.has_active_clinical_access(),false) or not exists(select 1 from public.profiles p
   where p.id=v_actor and p.access_status='active' and p.clinical_access is true and (p.is_admin or p.is_reviewer))
 then raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN'; end if;
 if jsonb_typeof(v_questions)<>'array' or jsonb_array_length(v_questions)>150
   or jsonb_typeof(v_missing_list)<>'array' or jsonb_array_length(v_missing_list)>30
 then raise sqlstate '22023' using message='RADAR_QUESTION_PAYLOAD_INVALID'; end if;

 -- Read the question snapshot ONLY after DB-owned physician checks pass.
 -- Retain the audit/source locks through v3 revision and event updates.
 select a.deidentified_core_context into v_snapshot
   from public.audit_cases a
   join public.consultation_history source
     on source.encounter_id=a.source_consultation_id
   where a.id=p_case_id
     and a.submitted_by=v_actor
     and source.user_id=v_actor
   for update of a,source;
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

-- No GRANT/REVOKE/policy or owner changes. No tests executed.
-- C01-C10 / N01-N09 NOT_RUN; Gate C NO-GO 0/19.
COMMIT;
