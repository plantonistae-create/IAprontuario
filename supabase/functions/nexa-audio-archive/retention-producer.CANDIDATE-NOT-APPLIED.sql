-- NEXA Core / Sprint 10 / R3 -- candidate only; NEVER APPLY TO HOSTED.
-- Requires A=retention-storage and B=retention-issuer, in this order.
-- No authorized retention term, patient evidence source, policy approver,
-- server event producer or authenticated HTTP adapter is available yet.
-- Recording consent, consent_recorded_at, AI permissions and dataset rights
-- are never authority for original clinical audio retention.
-- The two APPROVAL/CONSENT functions below always fail CLOSED.
-- The separate REVOCATION candidate is physically uncallable by app roles:
-- it has no EXECUTE grant to anon, authenticated, service_role, or PUBLIC.
begin;

do $nexa_roles$
begin
  if not exists (select 1 from pg_catalog.pg_roles
                 where rolname='nexa_audio_policy_writer') then
    create role nexa_audio_policy_writer nologin noinherit;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles
                 where rolname='nexa_audio_evidence_writer') then
    create role nexa_audio_evidence_writer nologin noinherit;
  end if;
end;
$nexa_roles$;

create schema if not exists nexa_audio_producer;
revoke all on schema nexa_audio_producer
  from public, anon, authenticated, service_role;
-- CREATE temporarily permits ownership transfer; removed before COMMIT.
grant usage,create on schema nexa_audio_producer
  to nexa_audio_policy_writer,nexa_audio_evidence_writer;
grant usage on schema public to nexa_audio_evidence_writer;
grant usage on schema auth to nexa_audio_evidence_writer;

-- Policy writer gets NO INSERT/UPDATE/DELETE on policy table.
-- Approval must eventually require a separate verifiable signed authority.
revoke insert,delete on public.nexa_audio_retention_approved_policies
  from public,anon,authenticated,service_role;
create or replace function nexa_audio_producer.approve_retention_policy(
  p_policy_version text,p_terms_digest text,p_approval_reference text
)
returns void language plpgsql security definer set search_path=''
as $$
begin
  raise exception 'AUDIO_POLICY_APPROVAL_AUTHORITY_MISSING'
    using errcode='42501';
end;
$$;
alter function nexa_audio_producer.approve_retention_policy(text,text,text)
  owner to nexa_audio_policy_writer;
revoke all on function
  nexa_audio_producer.approve_retention_policy(text,text,text)
  from public,anon,authenticated,service_role;

-- A doctor's claim or browser checkbox must NEVER insert verified events.
-- The verified-event producer remains disabled until real patient authority
-- with provenance, term version, explicit purpose, and verifiable origin exists.
create or replace function nexa_audio_producer.record_patient_authorization(
  p_encounter_id uuid,p_policy_version text,p_proof_reference text
)
returns void language plpgsql security definer set search_path=''
as $$
begin
  raise exception 'CONSENT_ISSUER_AUTHORITY_MISSING'
    using errcode='42501';
end;
$$;
alter function nexa_audio_producer.record_patient_authorization(uuid,text,text)
  owner to nexa_audio_evidence_writer;
revoke all on function
  nexa_audio_producer.record_patient_authorization(uuid,text,text)
  from public,anon,authenticated,service_role;

-- Revocation is different: it REMOVES authorization and never asserts that
-- patient consent occurred. Future server adapter MUST verify JWT getUser()
-- and supply a trustworthy auth.uid() context. No adapter exists today.
-- This NOLOGIN evidence role can SELECT its requester's records and INSERT
-- only revocation events. It CANNOT approve a policy or create verified proof.
grant select on public.consultation_history to nexa_audio_evidence_writer;
grant select,insert on public.nexa_audio_retention_evidence_events
  to nexa_audio_evidence_writer;
drop policy if exists nexa_audio_evidence_writer_owner_read
  on public.nexa_audio_retention_evidence_events;
create policy nexa_audio_evidence_writer_owner_read
  on public.nexa_audio_retention_evidence_events for select
  to nexa_audio_evidence_writer
  using (owner_user_id=(select auth.uid()));
drop policy if exists nexa_audio_evidence_writer_revoke_only
  on public.nexa_audio_retention_evidence_events;
create policy nexa_audio_evidence_writer_revoke_only
  on public.nexa_audio_retention_evidence_events for insert
  to nexa_audio_evidence_writer
  with check (
    event_kind='authorization_revoked'
    and target_event_id is not null
    and owner_user_id=(select auth.uid())
    and attested_by=(select auth.uid())
    and verified_by_server=false
    and patient_authorization_verified=false
  );
drop policy if exists nexa_audio_evidence_writer_consult_owner
  on public.consultation_history;
create policy nexa_audio_evidence_writer_consult_owner
  on public.consultation_history for select
  to nexa_audio_evidence_writer
  using (user_id=(select auth.uid()));

create or replace function nexa_audio_producer.request_owner_revocation(
  p_authorization_event_id uuid
)
returns uuid language plpgsql volatile security definer set search_path=''
as $$
declare
  actor_id uuid;
  original public.nexa_audio_retention_evidence_events%rowtype;
  returned_event_id uuid;
begin
  actor_id := auth.uid();
  if actor_id is null then
    raise exception 'REVOCATION_ACTOR_UNVERIFIED' using errcode='42501';
  end if;
  if p_authorization_event_id is null then
    raise exception 'REVOCATION_EVENT_INVALID' using errcode='22023';
  end if;
  select e.* into original
  from public.nexa_audio_retention_evidence_events e
  where e.event_id=p_authorization_event_id
    and e.event_kind='authorization_verified'
    and e.owner_user_id=actor_id;
  if not found or not exists (
    select 1 from public.consultation_history c
    where c.encounter_id=original.encounter_id and c.user_id=actor_id
  ) then
    raise exception 'REVOCATION_SOURCE_NOT_OWNED' using errcode='42501';
  end if;
  insert into public.nexa_audio_retention_evidence_events (
    event_kind,target_event_id,owner_user_id,encounter_id,attested_by,
    purpose,policy_version,terms_digest,evidence_digest,
    source_reference,origin,verified_by_server,
    patient_authorization_verified,verified_at,expires_at
  ) values (
    'authorization_revoked',original.event_id,actor_id,original.encounter_id,
    actor_id,original.purpose,original.policy_version,original.terms_digest,
    original.evidence_digest,
    'owner-revocation:'||original.event_id::text,
    'immutable_server_retention_ledger_v1',false,false,null,null
  ) on conflict (target_event_id)
      where event_kind='authorization_revoked' do nothing
    returning event_id into returned_event_id;
  if returned_event_id is null then
    select e.event_id into returned_event_id
    from public.nexa_audio_retention_evidence_events e
    where e.target_event_id=original.event_id
      and e.event_kind='authorization_revoked'
      and e.owner_user_id=actor_id;
  end if;
  if returned_event_id is null then
    raise exception 'REVOCATION_COMMIT_NOT_VERIFIED' using errcode='42501';
  end if;
  -- R1 from SQL B cascades to active=false and stamps revoked_at
  -- in the SAME transaction as the event insertion. This function does
  -- not issue consent or make an existing consent more valid.
  return returned_event_id;
end;
$$;
alter function nexa_audio_producer.request_owner_revocation(uuid)
  owner to nexa_audio_evidence_writer;
revoke all on function nexa_audio_producer.request_owner_revocation(uuid)
  from public,anon,authenticated,service_role;

revoke create on schema nexa_audio_producer
  from nexa_audio_policy_writer,nexa_audio_evidence_writer;
-- NO EXECUTE granted to any application role, NO verified event inserted,
-- NO policy approved, NO service_role granted INSERT on either source.
-- Strictly offline source candidate. No production activation is authorized.
commit;
