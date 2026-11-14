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
 revokes_event_id uuid references private.nexa_p0_source_action_events(event_id),
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
   and patient_scope_attested and revokes_event_id is null)
  or (event_kind='CONSENT_REVOKED'
   and purpose is not null and provider is not null and policy_version is not null
   and not patient_scope_attested and revokes_event_id is not null)
  or (event_kind='PHYSICIAN_FINAL_REVIEW_ACK'
   and purpose is null and provider is null and policy_version is null
   and not patient_scope_attested and revokes_event_id is null)
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
    or p_kind is null or p_kind not in ('consent','review') then
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
    or v_source.encounter_state in ('audited','discarded')
    or pg_catalog.jsonb_typeof(v_source.fields) is distinct from 'object'
    or pg_catalog.jsonb_typeof(v_source.processing_meta) is distinct from 'object'
    or pg_catalog.jsonb_typeof(v_source.protocol_usage) is distinct from 'array'
 then raise exception using errcode='42501',message='SOURCE_OWNER_AND_SYNC_REQUIRED'; end if;

 v_digest:=private.nexa_p0_clinical_digest(
  v_source.fields,v_source.processing_meta,v_source.protocol_usage,
  v_source.consent_recorded_at);
 v_kind:=case p_kind
  when 'consent' then 'PHYSICIAN_PATIENT_CONSENT_ATTESTATION'
  else 'PHYSICIAN_FINAL_REVIEW_ACK' end;

 -- Serialize consent issuance with an exact-event revocation for this actor
 -- and policy scope. Never use a client-provided actor or access key.
 if p_kind='consent' then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    v_actor::text||'|'||p_encounter::text||'|'||
    coalesce(p_purpose,'')||'|'||coalesce(p_provider,'')||'|'||
    coalesce(p_policy_version,''),0));
 end if;

 -- An idempotency key is a replay handle, NEVER authorization. Changed inputs
 -- or a stale source under the same key are rejected, not silently repurposed.
 select * into v_event from private.nexa_p0_source_action_events e
 where e.owner_user_id=v_actor and e.client_action_id=p_action_id;
 if found then
  if v_event.event_kind<>v_kind or v_event.encounter_id<>p_encounter
     or v_event.source_row_id<>v_source.id
     or v_event.source_sync_version is distinct from p_expected_sync_version
     or v_event.source_digest is distinct from p_displayed_digest
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
  raise exception using errcode='42501',message='EXACT_EVENT_REVOKE_RPC_REQUIRED';
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


-- Owner-scoped listing of actionable, IMMUTABLE physician attestations.
-- Revocation does not depend on current source version, approved policies or
-- client-generated consent. Deleted sources have no payload to expose here.
create function public.nexa_p0_list_revocable_consents()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid := auth.uid();
 v_list jsonb;
begin
 if v_actor is null then raise exception using errcode='42501',
   message='PHYSICIAN_SESSION_REQUIRED'; end if;
 perform 1 from public.profiles p
 join private.clinical_slots cs on cs.profile_id=p.id
 where p.id=v_actor and p.clinical_access is true
   and p.access_status='active' and cs.slot_no between 1 and 5;
 if not found then raise exception using errcode='42501',
   message='ACTIVE_CLINICAL_ACCESS_REQUIRED'; end if;
 with latest as (
   select distinct on (e.encounter_id,e.purpose,e.provider,e.policy_version)
     e.event_id,e.encounter_id,e.source_row_id,e.purpose,e.provider,
     e.policy_version,e.source_sync_version,e.server_recorded_at
   from private.nexa_p0_source_action_events e
   where e.owner_user_id=v_actor
     and e.event_kind='PHYSICIAN_PATIENT_CONSENT_ATTESTATION'
   order by e.encounter_id,e.purpose,e.provider,e.policy_version,
     e.server_recorded_at desc,e.event_id desc
 ), actionable as (
   select l.* from latest l
   where not exists (
     select 1 from public.consultation_history s
     where s.encounter_id=l.encounter_id
       and (s.user_id is distinct from v_actor
         or s.id is distinct from l.source_row_id)
   ) and not exists (
     select 1 from private.nexa_p0_source_action_events rev
     where rev.owner_user_id=v_actor and rev.encounter_id=l.encounter_id
       and rev.event_kind='CONSENT_REVOKED'
       and rev.purpose=l.purpose and rev.provider=l.provider
       and rev.policy_version=l.policy_version
       and (rev.server_recorded_at,rev.event_id)>=
         (l.server_recorded_at,l.event_id)
   )
 )
 select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'event_id',x.event_id,'encounter_id',x.encounter_id,
    'purpose',x.purpose,'provider',x.provider,
    'policy_version',x.policy_version,
    'source_sync_version',x.source_sync_version,
    'server_recorded_at',x.server_recorded_at
 ) order by x.server_recorded_at desc,x.event_id desc),'[]'::jsonb)
 into v_list
 from (select * from actionable order by server_recorded_at desc,event_id desc
       limit 100) x;
 return pg_catalog.jsonb_build_object(
   'events',v_list,'event_origin','OWNED_PERSISTED_PHYSICIAN_ACTION',
   'external_ai_authorized',false,'gate_c_verified',false);
end; $$;

-- Explicit revocation binds ONE original owner-authored consent event, not a
-- mutable purpose picked by the browser. Does NOT require source to exist:
-- a deletion, closed encounter, autosave update or expired policy must never
-- make historical consent impossible to retract.
create function public.nexa_p0_revoke_target_event(
 p_encounter uuid,p_consent_event_id uuid,p_action_id uuid,
 p_explicit_confirmation boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid := auth.uid();
 v_source public.consultation_history%rowtype;
 v_source_found boolean;
 v_target private.nexa_p0_source_action_events%rowtype;
 v_event private.nexa_p0_source_action_events%rowtype;
begin
 if v_actor is null or p_encounter is null or p_consent_event_id is null
   or p_action_id is null or p_explicit_confirmation is distinct from true
 then raise exception using errcode='42501',
   message='EXPLICIT_REVOCATION_REQUIRED'; end if;
 perform 1 from public.profiles p
 join private.clinical_slots cs on cs.profile_id=p.id
 where p.id=v_actor and p.clinical_access is true
   and p.access_status='active' and cs.slot_no between 1 and 5
 for share of p,cs;
 if not found then raise exception using errcode='42501',
   message='ACTIVE_CLINICAL_ACCESS_REQUIRED'; end if;

 -- Lock source first, exactly as the attestation writer does, to avoid
 -- inverting lock order under concurrent autosave/consent operations.
 select * into v_source from public.consultation_history s
 where s.encounter_id=p_encounter for share;
 v_source_found:=found;
 select * into v_target from private.nexa_p0_source_action_events e
 where e.event_id=p_consent_event_id and e.encounter_id=p_encounter
   and e.owner_user_id=v_actor
   and e.event_kind='PHYSICIAN_PATIENT_CONSENT_ATTESTATION'
 for share;
 if not found or (v_source_found and (
   v_source.user_id is distinct from v_actor
   or v_source.id is distinct from v_target.source_row_id))
 then raise exception using errcode='42501',
   message='OWNED_ORIGINAL_CONSENT_REQUIRED'; end if;

 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
   v_actor::text||'|'||p_encounter::text||'|'||
   v_target.purpose||'|'||v_target.provider||'|'||
   v_target.policy_version,0));

 select * into v_event from private.nexa_p0_source_action_events r
 where r.owner_user_id=v_actor and r.client_action_id=p_action_id;
 if found then
   if v_event.event_kind<>'CONSENT_REVOKED'
      or v_event.encounter_id<>p_encounter
      or v_event.revokes_event_id is distinct from p_consent_event_id
   then raise exception using errcode='23505',
     message='REVOCATION_ACTION_REPLAY_CONFLICT'; end if;
 else
   -- The consent target may be retracted only once, and only while it is the
   -- latest attestation for this exact policy scope. This is not egress auth.
   if exists (
     select 1 from private.nexa_p0_source_action_events ce
     where ce.owner_user_id=v_actor and ce.encounter_id=p_encounter
       and ce.event_kind='PHYSICIAN_PATIENT_CONSENT_ATTESTATION'
       and ce.purpose=v_target.purpose and ce.provider=v_target.provider
       and ce.policy_version=v_target.policy_version
       and (ce.server_recorded_at,ce.event_id)>
           (v_target.server_recorded_at,v_target.event_id)
   ) or exists (
     select 1 from private.nexa_p0_source_action_events r
     where r.owner_user_id=v_actor and r.encounter_id=p_encounter
       and r.event_kind='CONSENT_REVOKED'
       and r.purpose=v_target.purpose and r.provider=v_target.provider
       and r.policy_version=v_target.policy_version
       and (r.server_recorded_at,r.event_id)>=
           (v_target.server_recorded_at,v_target.event_id)
   ) then raise exception using errcode='42501',
       message='REVOCATION_TARGET_NOT_ACTIVE'; end if;

   insert into private.nexa_p0_source_action_events(
     client_action_id,event_kind,source_row_id,revokes_event_id,
     encounter_id,owner_user_id,source_sync_version,source_digest,
     canonicalization,purpose,provider,policy_version,
     physician_explicit_action,patient_scope_attested
   ) values (
     p_action_id,'CONSENT_REVOKED',v_target.source_row_id,v_target.event_id,
     p_encounter,v_actor,v_target.source_sync_version,v_target.source_digest,
     v_target.canonicalization,v_target.purpose,v_target.provider,
     v_target.policy_version,true,false
   ) returning * into v_event;
 end if;

 if exists (
   select 1 from private.nexa_p0_source_action_events ce
   where ce.owner_user_id=v_actor and ce.encounter_id=p_encounter
     and ce.event_kind='PHYSICIAN_PATIENT_CONSENT_ATTESTATION'
     and ce.purpose=v_target.purpose and ce.provider=v_target.provider
     and ce.policy_version=v_target.policy_version
     and (ce.server_recorded_at,ce.event_id)>
       (v_event.server_recorded_at,v_event.event_id)
 ) then raise exception using errcode='42501',
     message='REVOCATION_RECEIPT_SUPERSEDED'; end if;

 return pg_catalog.jsonb_build_object(
   'event_id',v_event.event_id,'kind',v_event.event_kind,
   'revokes_event_id',v_event.revokes_event_id,
   'server_recorded_at',v_event.server_recorded_at,
   'source_sync_version',v_event.source_sync_version,
   'canonicalization',v_event.canonicalization,
   'authorizes_external_ai',false,'gate_c_verified',false);
end; $$;

-- Distinct read-back transaction. No optimistic success on HTTP write alone.
create function public.nexa_p0_verify_revocation(
 p_revoke_event_id uuid,p_consent_event_id uuid,p_encounter uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid := auth.uid();
 v_rev private.nexa_p0_source_action_events%rowtype;
 v_target private.nexa_p0_source_action_events%rowtype;
begin
 if v_actor is null or p_revoke_event_id is null or
    p_consent_event_id is null or p_encounter is null
 then raise exception using errcode='42501',
   message='REVOCATION_READBACK_ID_REQUIRED'; end if;
 perform 1 from public.profiles p
 join private.clinical_slots cs on cs.profile_id=p.id
 where p.id=v_actor and p.clinical_access is true
   and p.access_status='active' and cs.slot_no between 1 and 5;
 if not found then raise exception using errcode='42501',
   message='ACTIVE_CLINICAL_ACCESS_REQUIRED'; end if;
 select * into v_target from private.nexa_p0_source_action_events e
 where e.event_id=p_consent_event_id and e.owner_user_id=v_actor
   and e.encounter_id=p_encounter
   and e.event_kind='PHYSICIAN_PATIENT_CONSENT_ATTESTATION';
 if not found then raise exception using errcode='42501',
    message='ORIGINAL_CONSENT_NOT_FOUND'; end if;
 select * into v_rev from private.nexa_p0_source_action_events r
 where r.event_id=p_revoke_event_id and r.owner_user_id=v_actor
   and r.encounter_id=p_encounter
   and r.event_kind='CONSENT_REVOKED'
   and r.revokes_event_id=p_consent_event_id;
 if not found or v_rev.source_row_id is distinct from v_target.source_row_id
   or v_rev.purpose is distinct from v_target.purpose
   or v_rev.provider is distinct from v_target.provider
   or v_rev.policy_version is distinct from v_target.policy_version
   or exists (
     select 1 from public.consultation_history s
     where s.encounter_id=p_encounter
       and (s.user_id is distinct from v_actor
         or s.id is distinct from v_target.source_row_id)
   ) or exists (
     select 1 from private.nexa_p0_source_action_events ce
     where ce.owner_user_id=v_actor and ce.encounter_id=p_encounter
       and ce.event_kind='PHYSICIAN_PATIENT_CONSENT_ATTESTATION'
       and ce.purpose=v_target.purpose and ce.provider=v_target.provider
       and ce.policy_version=v_target.policy_version
       and (ce.server_recorded_at,ce.event_id)>
         (v_rev.server_recorded_at,v_rev.event_id)
   )
 then raise exception using errcode='42501',
    message='REVOCATION_RECEIPT_NOT_CURRENT'; end if;
 return pg_catalog.jsonb_build_object(
   'event_id',v_rev.event_id,'kind',v_rev.event_kind,
   'revokes_event_id',v_rev.revokes_event_id,
   'server_recorded_at',v_rev.server_recorded_at,
   'source_sync_version',v_rev.source_sync_version,
   'canonicalization',v_rev.canonicalization,
   'event_present_and_current',true,
   'external_ai_authorized',false,'gate_c_verified',false);
end; $$;

-- Query an ambiguous network outcome by the ORIGINAL client_action_id.
-- Missing rows mean UNCONFIRMED, never proof that a concurrent write failed.
-- No new revocation is generated and no egress authority is granted.
create function public.nexa_p0_reconcile_revocation_action(
 p_encounter uuid,p_consent_event_id uuid,p_action_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid := auth.uid();
 v_rev private.nexa_p0_source_action_events%rowtype;
 v_verified jsonb;
begin
 if v_actor is null or p_encounter is null or p_consent_event_id is null
    or p_action_id is null
 then raise exception using errcode='42501',
   message='REVOCATION_RECONCILIATION_IDENTIFIERS_REQUIRED'; end if;
 perform 1 from public.profiles p
 join private.clinical_slots cs on cs.profile_id=p.id
 where p.id=v_actor and p.clinical_access is true
   and p.access_status='active' and cs.slot_no between 1 and 5;
 if not found then raise exception using errcode='42501',
   message='ACTIVE_CLINICAL_ACCESS_REQUIRED'; end if;
 select * into v_rev from private.nexa_p0_source_action_events r
 where r.owner_user_id=v_actor and r.client_action_id=p_action_id
 for share;
 if not found then
  return pg_catalog.jsonb_build_object(
   'state','UNCONFIRMED','event_present_and_current',false,
   'external_ai_authorized',false,'gate_c_verified',false);
 end if;
 if v_rev.event_kind<>'CONSENT_REVOKED' or
    v_rev.encounter_id is distinct from p_encounter or
    v_rev.revokes_event_id is distinct from p_consent_event_id
 then raise exception using errcode='42501',
   message='REVOCATION_RECONCILIATION_KEY_CONFLICT'; end if;

 -- Must pass the same owner-bound independent read-back checks as the write.
 -- If the event was superseded or the original source changed owners,
 -- return an error; never treat an old event as current authorization.
 v_verified:=public.nexa_p0_verify_revocation(
   v_rev.event_id,p_consent_event_id,p_encounter);
 if v_verified->>'event_present_and_current' is distinct from 'true'
    or v_verified->>'event_id' is distinct from v_rev.event_id::text
    or v_verified->>'revokes_event_id' is distinct from p_consent_event_id::text
    or v_verified->>'external_ai_authorized' is distinct from 'false'
    or v_verified->>'gate_c_verified' is distinct from 'false'
 then raise exception using errcode='42501',
   message='REVOCATION_RECONCILIATION_READBACK_FAILED'; end if;
 return pg_catalog.jsonb_build_object(
  'state','CONFIRMED','event_present_and_current',true,
  'event_id',v_rev.event_id,'revokes_event_id',v_rev.revokes_event_id,
  'kind',v_rev.event_kind,'source_sync_version',v_rev.source_sync_version,
  'canonicalization',v_rev.canonicalization,
  'server_recorded_at',v_rev.server_recorded_at,
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

-- New functions remain candidate-only, absent from hosted PostgreSQL.
revoke all on function public.nexa_p0_list_revocable_consents()
 from public,anon,authenticated,service_role;
revoke all on function public.nexa_p0_revoke_target_event(uuid,uuid,uuid,boolean)
 from public,anon,authenticated,service_role;
revoke all on function public.nexa_p0_verify_revocation(uuid,uuid,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.nexa_p0_list_revocable_consents()
 to authenticated;
grant execute on function public.nexa_p0_revoke_target_event(uuid,uuid,uuid,boolean)
 to authenticated;
grant execute on function public.nexa_p0_verify_revocation(uuid,uuid,uuid)
 to authenticated;
revoke all on function public.nexa_p0_reconcile_revocation_action(uuid,uuid,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.nexa_p0_reconcile_revocation_action(uuid,uuid,uuid)
 to authenticated;

commit;
-- MANDATORY STOP: no policy rows; no UI, dispatch gate, validated audio state
-- or Gate C. Migration unexecuted. Even a real event NEVER unlocks #171.
