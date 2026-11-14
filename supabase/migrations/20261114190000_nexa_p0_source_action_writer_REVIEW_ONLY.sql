-- NEXA P0 prospective source action writer: REVIEW ONLY, NOT EXECUTED.
-- This is a *new-object migration candidate* on an isolated Draft, not a
-- release authorization. No policy rows are seeded, and no egress is enabled.
-- Reuses the #165 pg-jsonb-v1 digest model and #167 explicit-action contract.
-- Requires approval of policy/version, SQL security review and Gate C before use.
begin;

create table private.nexa_p0_purpose_policy (
 purpose text not null check (purpose in
  ('realtime_audio','radar_context','audio_diarization',
   'final_documentation','audit_deidentification')),
 provider text not null check (provider in ('openai','gemini','nexa-core')),
 policy_version text not null check (length(policy_version) between 3 and 80),
 approved_at timestamptz not null,
 revoked_at timestamptz,
 primary key(purpose,provider,policy_version)
);
-- Intentionally EMPTY: no previous consent is backfilled or inferred.

create table private.nexa_p0_source_action_events (
 event_id uuid primary key default pg_catalog.gen_random_uuid(),
 client_action_id uuid not null,
 event_kind text not null check (event_kind in
   ('PHYSICIAN_PATIENT_CONSENT_ATTESTATION',
    'PHYSICIAN_FINAL_REVIEW_ACK','CONSENT_REVOKED')),
 source_row_id text not null,
 encounter_id uuid not null,
 owner_user_id uuid not null,
 source_sync_version bigint not null check (source_sync_version > 0),
 source_digest text not null check (source_digest ~ '^sha256:[0-9a-f]{64}$'),
 canonicalization text not null check (canonicalization='pg-jsonb-v1'),
 purpose text,
 provider text,
 policy_version text,
 physician_explicit_action boolean not null check (physician_explicit_action),
 patient_scope_attested boolean not null default false,
 server_recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
 unique(owner_user_id,client_action_id),
 check (
  (event_kind='PHYSICIAN_PATIENT_CONSENT_ATTESTATION'
   and purpose is not null and provider is not null and policy_version is not null
   and patient_scope_attested)
  or (event_kind='CONSENT_REVOKED'
   and purpose is not null and provider is not null and policy_version is not null
   and not patient_scope_attested)
  or (event_kind='PHYSICIAN_FINAL_REVIEW_ACK'
   and purpose is null and provider is null and policy_version is null
   and not patient_scope_attested)
 )
);
create index nexa_p0_source_events_lookup_idx on private.nexa_p0_source_action_events
 (encounter_id,owner_user_id,event_kind,purpose,provider,server_recorded_at desc);

-- Only owner-controlled, append-only rows. No REST-facing CRUD permission.
alter table private.nexa_p0_source_action_events enable row level security;
alter table private.nexa_p0_purpose_policy enable row level security;
revoke all on private.nexa_p0_source_action_events,
 private.nexa_p0_purpose_policy from public,anon,authenticated,service_role;

create function private.nexa_p0_reject_event_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 raise exception using errcode='42501',message='IMMUTABLE_SOURCE_EVENT';
end; $$;
create trigger nexa_p0_source_events_immutable
before update or delete on private.nexa_p0_source_action_events
for each row execute function private.nexa_p0_reject_event_mutation();

-- EXACT algorithm from #165 candidate. The client consent timestamp is INCLUDED
-- as persisted snapshot metadata; it is NEVER itself consent evidence.
create function private.nexa_p0_clinical_digest(
 p_fields jsonb,p_processing_meta jsonb,p_protocol_usage jsonb,
 p_legacy_consent_at timestamptz
) returns text language sql stable set search_path='' as $$
 select 'sha256:' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
  pg_catalog.jsonb_build_object(
   'fields',p_fields,'processing_meta',p_processing_meta,
   'protocol_usage',p_protocol_usage,
   'consent_recorded_at',
    pg_catalog.to_char(p_legacy_consent_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  )::text,'UTF8')),'hex');
$$;

-- Intended only for authenticated physician; returns the actual PERSISTED
-- snapshot for a future UI to display, not a client-assembled "final" claim.
create function public.nexa_p0_prepare_source_review(p_encounter uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid := auth.uid();
 v_source public.consultation_history%rowtype;
begin
 if v_actor is null or p_encounter is null then
  raise exception using errcode='42501',message='PHYSICIAN_SESSION_REQUIRED';
 end if;
 if not exists (
  select 1 from public.profiles p
  join private.clinical_slots cs on cs.profile_id=p.id
  where p.id=v_actor and p.access_status='active'
    and p.clinical_access is true and cs.slot_no between 1 and 5
 ) then raise exception using errcode='42501',message='ACTIVE_SLOT_REQUIRED'; end if;
 select * into v_source from public.consultation_history s
 where s.encounter_id=p_encounter and s.user_id=v_actor;
 if not found or v_source.sync_version<1
    or v_source.encounter_state in ('audited','discarded')
    or pg_catalog.jsonb_typeof(v_source.fields) is distinct from 'object'
    or pg_catalog.jsonb_typeof(v_source.processing_meta) is distinct from 'object'
    or pg_catalog.jsonb_typeof(v_source.protocol_usage) is distinct from 'array'
 then raise exception using errcode='42501',message='PERSISTED_OWNER_SNAPSHOT_REQUIRED'; end if;
 return pg_catalog.jsonb_build_object(
  'encounter_id',v_source.encounter_id,'source_sync_version',v_source.sync_version,
  'canonicalization','pg-jsonb-v1',
  'server_digest',private.nexa_p0_clinical_digest(
   v_source.fields,v_source.processing_meta,v_source.protocol_usage,
   v_source.consent_recorded_at),
  'source_snapshot',pg_catalog.jsonb_build_object(
   'fields',v_source.fields,'processing_meta',v_source.processing_meta,
   'protocol_usage',v_source.protocol_usage,
   'consent_recorded_at',v_source.consent_recorded_at),
  -- Trusted policy choices only. Empty table => no selectable purpose/version.
  -- This is a policy catalog, never per-patient consent or egress admission.
  'approved_policies',coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
     'purpose',pol.purpose,'provider',pol.provider,
     'policyVersion',pol.policy_version)
     order by pol.purpose,pol.provider,pol.policy_version)
    from private.nexa_p0_purpose_policy pol
    where pol.revoked_at is null
      and pol.approved_at<=pg_catalog.clock_timestamp()
  ),'[]'::jsonb)
 );
end; $$;

-- Atomic writer: actor identity comes ONLY from auth.uid() under an
-- authenticated Supabase JWT; no p_actor, client status or service_role.
-- Positive actions are physician attestations, not independent legal proof of
-- patient consent. No pre-egress/clinical release receipt is issued.
create function public.nexa_p0_record_source_action(
 p_kind text,p_encounter uuid,p_action_id uuid,
 p_expected_sync_version bigint default null,
 p_displayed_digest text default null,
 p_purpose text default null,p_provider text default null,
 p_policy_version text default null,
 p_explicit_confirmation boolean default false,
 p_patient_scope_attested boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid := auth.uid();
 v_source public.consultation_history%rowtype;
 v_digest text;
 v_kind text;
 v_event private.nexa_p0_source_action_events%rowtype;
begin
 if v_actor is null or p_encounter is null or p_action_id is null
    or p_explicit_confirmation is distinct from true
    or p_kind is null or p_kind not in ('consent','review','revoke') then
  raise exception using errcode='42501',message='EXPLICIT_AUTHENTICATED_ACTION_REQUIRED';
 end if;
 perform 1 from public.profiles p
 join private.clinical_slots cs on cs.profile_id=p.id
 where p.id=v_actor and p.clinical_access is true
   and p.access_status='active' and cs.slot_no between 1 and 5
 for share of p,cs;
 if not found then
  raise exception using errcode='42501',message='ACTIVE_CLINICAL_ACCESS_REQUIRED';
 end if;

 -- Lock source before recording action, blocking concurrent autosave updates.
 select * into v_source from public.consultation_history s
 where s.encounter_id=p_encounter for share;
 if not found or v_source.user_id is distinct from v_actor
    or v_source.sync_version<1
    or (p_kind<>'revoke' and v_source.encounter_state in ('audited','discarded'))
    or pg_catalog.jsonb_typeof(v_source.fields) is distinct from 'object'
    or pg_catalog.jsonb_typeof(v_source.processing_meta) is distinct from 'object'
    or pg_catalog.jsonb_typeof(v_source.protocol_usage) is distinct from 'array'
 then raise exception using errcode='42501',message='SOURCE_OWNER_AND_SYNC_REQUIRED'; end if;

 v_digest:=private.nexa_p0_clinical_digest(
  v_source.fields,v_source.processing_meta,v_source.protocol_usage,
  v_source.consent_recorded_at);
 v_kind:=case p_kind
  when 'consent' then 'PHYSICIAN_PATIENT_CONSENT_ATTESTATION'
  when 'review' then 'PHYSICIAN_FINAL_REVIEW_ACK'
  else 'CONSENT_REVOKED' end;

 -- An idempotency key is a replay handle, NEVER authorization. Changed inputs
 -- or a stale source under the same key are rejected, not silently repurposed.
 select * into v_event from private.nexa_p0_source_action_events e
 where e.owner_user_id=v_actor and e.client_action_id=p_action_id;
 if found then
  if v_event.event_kind<>v_kind or v_event.encounter_id<>p_encounter
     or v_event.source_row_id<>v_source.id
     or (p_kind<>'revoke' and
         (v_event.source_sync_version is distinct from p_expected_sync_version
          or v_event.source_digest is distinct from p_displayed_digest))
     or v_event.purpose is distinct from p_purpose
     or v_event.provider is distinct from p_provider
     or v_event.policy_version is distinct from p_policy_version
     or v_event.patient_scope_attested is distinct from p_patient_scope_attested
  then raise exception using errcode='23505',message='ACTION_REPLAY_CONFLICT'; end if;
  -- A replay is NOT renewed consent or a fresh review. It must not turn a
  -- stale/revoked event into a positive receipt. Always fail closed.
  if p_kind='review' then
    raise exception using errcode='42501',
      message='FINAL_REVIEW_SERVER_COMPLETENESS_NOT_PROVEN';
  end if;
  if p_kind='revoke' and exists (
    -- An old revocation receipt must not imply a later, independent
    -- physician consent was revoked. A new explicit action is required.
    select 1 from private.nexa_p0_source_action_events ce
    where ce.owner_user_id=v_actor and ce.encounter_id=p_encounter
      and ce.event_kind='PHYSICIAN_PATIENT_CONSENT_ATTESTATION'
      and ce.purpose=p_purpose and ce.provider=p_provider
      and ce.policy_version=p_policy_version
      and (ce.server_recorded_at,ce.event_id)>
          (v_event.server_recorded_at,v_event.event_id)
  ) then raise exception using errcode='42501',
    message='REVOCATION_REPLAY_SUPERSEDED'; end if;
  if p_kind='consent' then
    if v_event.source_sync_version is distinct from v_source.sync_version
       or v_event.source_digest is distinct from v_digest
       or not exists (
         select 1 from private.nexa_p0_purpose_policy pol
         where pol.purpose=p_purpose and pol.provider=p_provider
           and pol.policy_version=p_policy_version
           and pol.approved_at<=pg_catalog.clock_timestamp()
           and pol.revoked_at is null
       ) or exists (
         select 1 from private.nexa_p0_source_action_events rev
         where rev.owner_user_id=v_actor and rev.encounter_id=p_encounter
           and rev.event_kind='CONSENT_REVOKED'
           and rev.purpose=p_purpose and rev.provider=p_provider
           and rev.policy_version=p_policy_version
           and rev.server_recorded_at>=v_event.server_recorded_at
       )
    then raise exception using errcode='42501',
      message='CONSENT_EVENT_NO_LONGER_CURRENT'; end if;
  end if;
  return pg_catalog.jsonb_build_object(
   'event_id',v_event.event_id,'kind',v_event.event_kind,
   'server_recorded_at',v_event.server_recorded_at,
   'source_sync_version',v_event.source_sync_version,
   'canonicalization',v_event.canonicalization,
   'authorizes_external_ai',false,'gate_c_verified',false);
 end if;

 if p_kind='consent' then
  if p_expected_sync_version is distinct from v_source.sync_version
     or p_displayed_digest is distinct from v_digest
     or p_patient_scope_attested is distinct from true
     or p_purpose is null or p_provider is null or p_policy_version is null
     or not exists (
      select 1 from private.nexa_p0_purpose_policy pol
      where pol.purpose=p_purpose and pol.provider=p_provider
        and pol.policy_version=p_policy_version
        and pol.approved_at<=pg_catalog.clock_timestamp()
        and pol.revoked_at is null
     )
  then raise exception using errcode='42501',message='APPROVED_PURPOSE_POLICY_REQUIRED'; end if;
 elsif p_kind='review' then
  -- Browser-derived ready_for_audit cannot prove completed audio ingestion,
  -- sync/reconciliation integrity or absence of post-review edits. Do not mint
  -- a final physician ACK until separately reviewed server authority exists.
  -- This DB-side STOP persists even if the Edge HTTP STOP is removed in error.
  raise exception using errcode='42501',
    message='FINAL_REVIEW_SERVER_COMPLETENESS_NOT_PROVEN';
  if p_purpose is not null or p_provider is not null or p_policy_version is not null
     or p_patient_scope_attested is not false
     or v_source.encounter_state<>'ready_for_audit'
     or p_expected_sync_version is distinct from v_source.sync_version
     or p_displayed_digest is distinct from v_digest
     or not exists (
      select 1 from private.nexa_p0_source_action_events ce
      where ce.encounter_id=p_encounter and ce.owner_user_id=v_actor
        and ce.event_kind='PHYSICIAN_PATIENT_CONSENT_ATTESTATION'
        and ce.purpose='audit_deidentification'
        and not exists (
         select 1 from private.nexa_p0_source_action_events rev
         where rev.encounter_id=ce.encounter_id and rev.owner_user_id=v_actor
           and rev.event_kind='CONSENT_REVOKED'
           and rev.purpose=ce.purpose and rev.provider=ce.provider
           and rev.server_recorded_at>=ce.server_recorded_at
        )
     )
  then raise exception using errcode='42501',message='EXACT_FINAL_REVIEW_OR_CONSENT_REQUIRED'; end if;
 else
  -- Revocation must remain available even after the snapshot changes.
  if p_expected_sync_version is not null or p_displayed_digest is not null
     or p_patient_scope_attested is not false
     or p_purpose is null or p_provider is null or p_policy_version is null
     or not exists (
      select 1 from private.nexa_p0_source_action_events ce
      where ce.encounter_id=p_encounter and ce.owner_user_id=v_actor
        and ce.event_kind='PHYSICIAN_PATIENT_CONSENT_ATTESTATION'
        and ce.purpose=p_purpose and ce.provider=p_provider
        and ce.policy_version=p_policy_version
     )
  then raise exception using errcode='42501',message='CONSENT_TO_REVOKE_NOT_FOUND'; end if;
 end if;

 insert into private.nexa_p0_source_action_events (
  client_action_id,event_kind,source_row_id,encounter_id,owner_user_id,
  source_sync_version,source_digest,canonicalization,purpose,provider,
  policy_version,physician_explicit_action,patient_scope_attested
 ) values (
  p_action_id,v_kind,v_source.id,v_source.encounter_id,v_actor,
  v_source.sync_version,v_digest,'pg-jsonb-v1',p_purpose,p_provider,
  p_policy_version,true,p_patient_scope_attested
 ) returning * into v_event;
 return pg_catalog.jsonb_build_object(
  'event_id',v_event.event_id,'kind',v_event.event_kind,
  'server_recorded_at',v_event.server_recorded_at,
  'source_sync_version',v_event.source_sync_version,
  'canonicalization',v_event.canonicalization,
  'authorizes_external_ai',false,'gate_c_verified',false);
end; $$;

-- A second, independent DB transaction can re-read an issued consent event.
-- It proves ONLY that an owner-bound physician attestation row is still current.
-- It does NOT prove patient consent independently, first external egress order,
-- safe RLS/ownership, or any permission to contact an AI provider.
create function public.nexa_p0_verify_consent_action(
 p_event_id uuid,p_encounter uuid,p_expected_sync_version bigint,
 p_displayed_digest text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid := auth.uid();
 v_source public.consultation_history%rowtype;
 v_event private.nexa_p0_source_action_events%rowtype;
 v_digest text;
begin
 if v_actor is null or p_event_id is null or p_encounter is null
    or p_expected_sync_version is null or p_expected_sync_version<1
    or p_displayed_digest is null
 then raise exception using errcode='42501',
   message='AUTHENTICATED_CONSENT_RECEIPT_REQUIRED'; end if;

 perform 1 from public.profiles p
 join private.clinical_slots cs on cs.profile_id=p.id
 where p.id=v_actor and p.clinical_access is true
   and p.access_status='active' and cs.slot_no between 1 and 5
 for share of p,cs;
 if not found then raise exception using errcode='42501',
   message='ACTIVE_CLINICAL_ACCESS_REQUIRED'; end if;

 select * into v_source from public.consultation_history s
 where s.encounter_id=p_encounter and s.user_id=v_actor for share;
 if not found or v_source.sync_version is distinct from p_expected_sync_version
    or v_source.encounter_state in ('audited','discarded')
    or pg_catalog.jsonb_typeof(v_source.fields) is distinct from 'object'
    or pg_catalog.jsonb_typeof(v_source.processing_meta) is distinct from 'object'
    or pg_catalog.jsonb_typeof(v_source.protocol_usage) is distinct from 'array'
 then raise exception using errcode='42501',
   message='CURRENT_OWNER_SNAPSHOT_REQUIRED'; end if;

 v_digest:=private.nexa_p0_clinical_digest(
   v_source.fields,v_source.processing_meta,v_source.protocol_usage,
   v_source.consent_recorded_at);
 if v_digest is distinct from p_displayed_digest then
   raise exception using errcode='42501',
     message='SOURCE_DIGEST_CHANGED'; end if;

 select * into v_event from private.nexa_p0_source_action_events e
 where e.event_id=p_event_id and e.owner_user_id=v_actor
   and e.encounter_id=p_encounter for share;
 if not found or v_event.source_row_id<>v_source.id
    or v_event.event_kind<>'PHYSICIAN_PATIENT_CONSENT_ATTESTATION'
    or v_event.physician_explicit_action is not true
    or v_event.patient_scope_attested is not true
    or v_event.source_sync_version is distinct from v_source.sync_version
    or v_event.canonicalization<>'pg-jsonb-v1'
    or v_event.source_digest is distinct from v_digest
    or not exists (
      select 1 from private.nexa_p0_purpose_policy pol
      where pol.purpose=v_event.purpose and pol.provider=v_event.provider
        and pol.policy_version=v_event.policy_version
        and pol.revoked_at is null
        and pol.approved_at<=pg_catalog.clock_timestamp()
    ) or exists (
      select 1 from private.nexa_p0_source_action_events rev
      where rev.owner_user_id=v_actor and rev.encounter_id=p_encounter
        and rev.event_kind='CONSENT_REVOKED'
        and rev.purpose=v_event.purpose and rev.provider=v_event.provider
        and rev.policy_version=v_event.policy_version
        and rev.server_recorded_at>=v_event.server_recorded_at
    )
 then raise exception using errcode='42501',
   message='CONSENT_RECEIPT_NOT_CURRENT'; end if;

 return pg_catalog.jsonb_build_object(
  'event_id',v_event.event_id,'kind',v_event.event_kind,
  'source_sync_version',v_event.source_sync_version,
  'source_digest',v_digest,'canonicalization',v_event.canonicalization,
  'purpose',v_event.purpose,'provider',v_event.provider,
  'policy_version',v_event.policy_version,
  'server_recorded_at',v_event.server_recorded_at,
  'event_present_and_current',true,
  'external_ai_authorized',false,'gate_c_verified',false);
end; $$;

-- New narrowly scoped candidate RPCs only. No hosted ACL changes.
revoke all on function public.nexa_p0_prepare_source_review(uuid)
 from public,anon,authenticated,service_role;
revoke all on function public.nexa_p0_record_source_action(
 text,uuid,uuid,bigint,text,text,text,text,boolean,boolean)
 from public,anon,authenticated,service_role;
grant execute on function public.nexa_p0_prepare_source_review(uuid)
 to authenticated;
grant execute on function public.nexa_p0_record_source_action(
 text,uuid,uuid,bigint,text,text,text,text,boolean,boolean)
 to authenticated;
revoke all on function public.nexa_p0_verify_consent_action(uuid,uuid,bigint,text)
 from public,anon,authenticated,service_role;
grant execute on function public.nexa_p0_verify_consent_action(uuid,uuid,bigint,text)
 to authenticated;

commit;
-- MANDATORY STOP: no policy rows; no UI, dispatch gate, validated audio state
-- or Gate C. Migration unexecuted. Even a real event NEVER unlocks #171.
