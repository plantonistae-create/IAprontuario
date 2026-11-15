-- NEXA Gate C / owner-only audit review: CODE CANDIDATE, NOT A MIGRATION.
-- Source: supabase/migrations/20260925174500_audit_auto_queue_v18101.sql
-- Exact Git blob: 1c753af46b5ddbc840ce771ac5b74afca3414564
-- Inspected hosted facts: public.audit_cases(source_consultation_id uuid,
-- source_sync_version bigint, submitted_by uuid) and
-- public.consultation_history(encounter_id uuid UNIQUE, user_id uuid NULL,
-- sync_version bigint, encounter_state text).
-- It is a proposed replacement for the EXISTING SECURITY DEFINER function,
-- not a new grant, new privileged wrapper, or permission to deploy.
-- Do not infer production Auth.getUser(), legitimate consent, final physician ACK
-- or pre-egress authorization from any successful owner-only comparison.
-- This code deliberately preserves the existing authorized reviewer gate
-- but requires the reviewer to be the source physician and original submitter.
-- Delegated institutional review is DENIED until independently authorized.
-- DOWNSTREAM STOP: get_audit_queue_v2/get_audit_dashboard/get_core_dataset_summary
-- remain privileged and potentially cross-owner; this change alone is NOT
-- an owner-only release or full clinical data isolation.
--
-- Deliberate unconditionally failing transactional execution barrier:
-- if someone runs this file as SQL, NOTHING in it can replace the hosted
-- function. Separate review, authorization and a newly packaged migration
-- would be required to lift this barrier. Do NOT delete this STOP in Draft.
BEGIN;
DO $nexa_gate_c_review_stop$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE='42501',
    MESSAGE='STOP_NOT_AUTHORIZED_FOR_SQL_OR_DEPLOY';
END
$nexa_gate_c_review_stop$;

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
  v_source public.consultation_history%rowtype;
  v_affected bigint;
  v_reviewed jsonb;
  v_core jsonb;
  v_layers jsonb;
  v_learning jsonb;
  v_target jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
begin
  if v_actor is null then raise sqlstate '42501' using message='AUDIT_REVIEW_UNAUTHORIZED'; end if;
  if not exists(select 1 from public.profiles p
    where p.id=v_actor
      and p.access_status='active'
      and p.clinical_access is true
      and (p.is_admin or p.is_reviewer))
     or not coalesce(public.has_active_clinical_access(),false) then
    raise sqlstate '42501' using message='AUDIT_REVIEW_FORBIDDEN';
  end if;
  if decision not in ('approved','corrected','discarded') then raise sqlstate '22023' using message='INVALID_AUDIT_DECISION'; end if;
  if decision='discarded' and nullif(btrim(coalesce(note,'')),'') is null then
    raise sqlstate '22023' using message='DISCARD_REASON_REQUIRED';
  end if;

  select ac.* into v_case from public.audit_cases ac where ac.id=case_id for update;
  if not found then raise sqlstate 'PT404' using message='AUDIT_CASE_NOT_FOUND'; end if;
  if v_case.status<>'pending' then raise sqlstate 'PT409' using message='AUDIT_REVIEW_CONFLICT'; end if;

  -- The case is server-loaded under row lock. Never derive its owner or
  -- source version from client fields, reviewer flags or admin authority.
  if v_case.submitted_by is distinct from v_actor
     or v_case.source_consultation_id is null
     or v_case.source_sync_version is null
     or v_case.source_sync_version < 1 then
    raise sqlstate '42501' using message='AUDIT_REVIEW_SOURCE_OWNER_FORBIDDEN';
  end if;

  -- encounter_id has a verified UNIQUE index on the current hosted schema.
  -- This source lock also prevents a concurrent change before the two writes.
  select s.* into v_source
    from public.consultation_history s
    where s.encounter_id=v_case.source_consultation_id
    for update;
  if not found or v_source.user_id is distinct from v_actor then
    raise sqlstate '42501' using message='AUDIT_REVIEW_SOURCE_OWNER_FORBIDDEN';
  end if;
  if v_source.encounter_state is distinct from 'ready_for_audit'
     or v_source.sync_version is distinct from v_case.source_sync_version then
    raise sqlstate 'PT409' using message='AUDIT_REVIEW_SOURCE_VERSION_CONFLICT';
  end if;

  v_core:=coalesce(v_case.deidentified_core_context,'{}'::jsonb);
  v_core:=jsonb_set(
    v_core,
    '{audit_submission_snapshot}',
    coalesce(v_core->'audit_submission_snapshot','{}'::jsonb)
      || jsonb_build_object(
        'immutable_submission',true,
        'reviewed_at',now()::text,
        'audited_source_sync_version',v_case.source_sync_version
      ),
    true
  );

  if decision='corrected' then
    if corrected_fields is null or jsonb_typeof(corrected_fields)<>'object' then
      raise sqlstate '22023' using message='CORRECTED_FIELDS_REQUIRED';
    end if;
    v_reviewed:=corrected_fields;
    for v_key in
      select key from (
        select jsonb_object_keys(coalesce(v_case.deidentified_fields,'{}'::jsonb)) key
        union
        select jsonb_object_keys(coalesce(v_reviewed,'{}'::jsonb)) key
      ) q
    loop
      if coalesce(v_case.deidentified_fields->v_key,'null'::jsonb) is distinct from coalesce(v_reviewed->v_key,'null'::jsonb) then
        v_changes:=v_changes||jsonb_build_object(v_key,jsonb_build_object(
          'before',v_case.deidentified_fields->v_key,
          'after',v_reviewed->v_key
        ));
      end if;
    end loop;
  elsif decision='approved' then
    v_reviewed:=v_case.deidentified_fields;
  else
    v_reviewed:=null;
  end if;

  update public.audit_cases
  set status=decision,reviewer_id=v_actor,reviewed_fields=v_reviewed,
      audit_changes=v_changes,review_note=nullif(btrim(note),''),reviewed_at=now(),
      deidentified_core_context=v_core
  where id=v_case.id and status='pending';
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise sqlstate 'PT409' using message='AUDIT_REVIEW_CASE_STATE_CHANGED';
  end if;

  update public.consultation_history
  set encounter_state=case when decision='discarded' then 'discarded' else 'audited' end
  where encounter_id=v_case.source_consultation_id
    and user_id=v_actor
    and sync_version=v_case.source_sync_version
    and encounter_state='ready_for_audit';
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise sqlstate 'PT409' using message='AUDIT_REVIEW_SOURCE_STATE_CHANGED';
  end if;

  if decision='discarded' then
    delete from public.nexa_core_cases where audit_case_id=v_case.id;
    return;
  end if;

  v_layers:=coalesce(v_core->'learning_layers','{}'::jsonb);
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
    'audit_changes',v_changes,
    'target',v_target,
    'source_consultation_id',v_case.source_consultation_id,
    'snapshot_version',v_case.snapshot_version,
    'source_sync_version',v_case.source_sync_version,
    'destination',coalesce(v_core->'destination','{}'::jsonb),
    'hypothesis_validation',coalesce(v_core->'hypothesis_validation','{}'::jsonb),
    'clinical_plan',coalesce(v_core->'clinical_plan','{}'::jsonb),
    'radar_learning',coalesce(v_core->'radar_learning','{}'::jsonb),
    'protocol_usage',coalesce(v_core->'protocol_usage','[]'::jsonb),
    'audit_submission_snapshot',coalesce(v_core->'audit_submission_snapshot','{}'::jsonb)
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

-- No REVOKE, GRANT, policy, owner change, schema change or data migration.
-- No positive Gate C evidence; C01-C10/N01-N09 remain NOT_RUN.
COMMIT;
