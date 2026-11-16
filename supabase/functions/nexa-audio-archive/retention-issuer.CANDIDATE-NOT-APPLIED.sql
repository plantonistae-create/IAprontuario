-- NEXA P0 - REVIEW CANDIDATE ONLY. NOT APPLIED.
-- Apply AFTER retention-storage.CANDIDATE-NOT-APPLIED.sql in an offline lab.
-- No real patient-consent authority or approved retention policy exists.
-- No event producer, issuer endpoint, or training consent is implemented.
begin;

create table if not exists public.nexa_audio_retention_approved_policies (
  policy_version text primary key check (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  terms_digest text not null check (terms_digest ~ '^[a-f0-9]{64}$'),
  purpose text not null default 'clinical_audio_retention'
    check (purpose='clinical_audio_retention'),
  independently_approved boolean not null default false,
  approval_reference text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  check (not independently_approved or (
    length(btrim(approval_reference)) between 12 and 256
    and approved_by is not null and approved_at is not null))
);
alter table public.nexa_audio_retention_approved_policies enable row level security;
revoke all on public.nexa_audio_retention_approved_policies
  from public,anon,authenticated,service_role;
grant select,update on public.nexa_audio_retention_approved_policies to service_role;

create table if not exists public.nexa_audio_retention_evidence_events (
  event_id uuid primary key default gen_random_uuid(),
  event_kind text not null
    check (event_kind in ('authorization_verified','authorization_revoked')),
  target_event_id uuid references public.nexa_audio_retention_evidence_events(event_id),
  owner_user_id uuid not null references auth.users(id),
  encounter_id uuid not null,
  attested_by uuid not null references auth.users(id),
  purpose text not null default 'clinical_audio_retention'
    check (purpose='clinical_audio_retention'),
  policy_version text not null references public.nexa_audio_retention_approved_policies(policy_version),
  terms_digest text not null check (terms_digest ~ '^[a-f0-9]{64}$'),
  evidence_digest text not null check (evidence_digest ~ '^[a-f0-9]{64}$'),
  source_reference text not null check (length(btrim(source_reference)) between 12 and 256),
  origin text not null default 'immutable_server_retention_ledger_v1'
    check (origin='immutable_server_retention_ledger_v1'),
  verified_by_server boolean not null default false,
  patient_authorization_verified boolean not null default false,
  verified_at timestamptz,
  expires_at timestamptz,
  recorded_at timestamptz not null default clock_timestamp(),
  check ((event_kind='authorization_verified' and target_event_id is null
     and expires_at is not null and verified_at is not null)
     or (event_kind='authorization_revoked' and target_event_id is not null))
);
create unique index if not exists nexa_audio_one_revocation
  on public.nexa_audio_retention_evidence_events(target_event_id)
  where event_kind='authorization_revoked';
alter table public.nexa_audio_retention_evidence_events enable row level security;
revoke all on public.nexa_audio_retention_evidence_events
  from public,anon,authenticated,service_role;
-- UPDATE privilege only authorizes FOR UPDATE row locks; trigger rejects updates.
grant select,update on public.nexa_audio_retention_evidence_events to service_role;

create or replace function public.nexa_audio_issuer_immutable_guard()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  raise exception 'AUDIO_RETENTION_AUTHORITY_IMMUTABLE' using errcode='23514';
end;
$$;
revoke all on function public.nexa_audio_issuer_immutable_guard()
  from public,anon,authenticated;
drop trigger if exists nexa_audio_retention_policy_immutable
  on public.nexa_audio_retention_approved_policies;
create trigger nexa_audio_retention_policy_immutable
before update or delete on public.nexa_audio_retention_approved_policies
for each row execute function public.nexa_audio_issuer_immutable_guard();
drop trigger if exists nexa_audio_retention_policy_no_truncate
  on public.nexa_audio_retention_approved_policies;
create trigger nexa_audio_retention_policy_no_truncate
before truncate on public.nexa_audio_retention_approved_policies
for each statement execute function public.nexa_audio_issuer_immutable_guard();
drop trigger if exists nexa_audio_retention_events_immutable
  on public.nexa_audio_retention_evidence_events;
create trigger nexa_audio_retention_events_immutable
before update or delete on public.nexa_audio_retention_evidence_events
for each row execute function public.nexa_audio_issuer_immutable_guard();
drop trigger if exists nexa_audio_retention_events_no_truncate
  on public.nexa_audio_retention_evidence_events;
create trigger nexa_audio_retention_events_no_truncate
before truncate on public.nexa_audio_retention_evidence_events
for each statement execute function public.nexa_audio_issuer_immutable_guard();

alter table public.nexa_audio_retention_grants
  add column if not exists issuer_action_id uuid,
  add column if not exists attestation_event_id uuid
    references public.nexa_audio_retention_evidence_events(event_id);
create unique index if not exists nexa_audio_grants_one_owner_action
  on public.nexa_audio_retention_grants(owner_user_id,encounter_id,issuer_action_id);
-- R2: a verified attestation can fund ONE grant, regardless of how many
-- client action identifiers ask to use it. Separate per-action bindings retain
-- idempotency and prevent an old action being rebound to a new attestation.
create unique index if not exists nexa_audio_grants_one_attestation
  on public.nexa_audio_retention_grants(
    owner_user_id,encounter_id,attestation_event_id
  ) where attestation_event_id is not null;
create table if not exists public.nexa_audio_retention_issuer_actions (
  owner_user_id uuid not null references auth.users(id),
  encounter_id uuid not null,
  client_action_id uuid not null,
  grant_id uuid not null references public.nexa_audio_retention_grants(grant_id),
  attestation_event_id uuid not null
    references public.nexa_audio_retention_evidence_events(event_id),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key(owner_user_id,encounter_id,client_action_id)
);
alter table public.nexa_audio_retention_issuer_actions enable row level security;
revoke all on public.nexa_audio_retention_issuer_actions
  from public,anon,authenticated,service_role;
grant select,insert,update on public.nexa_audio_retention_issuer_actions to service_role;
drop trigger if exists nexa_audio_issuer_actions_immutable
  on public.nexa_audio_retention_issuer_actions;
create trigger nexa_audio_issuer_actions_immutable
before update or delete on public.nexa_audio_retention_issuer_actions
for each row execute function public.nexa_audio_issuer_immutable_guard();
drop trigger if exists nexa_audio_issuer_actions_no_truncate
  on public.nexa_audio_retention_issuer_actions;
create trigger nexa_audio_issuer_actions_no_truncate
before truncate on public.nexa_audio_retention_issuer_actions
for each statement execute function public.nexa_audio_issuer_immutable_guard();

-- R1: revocation cascades to existing grants ATOMICALLY, in the same
-- transaction as the new revocation event. Every existing RLS upload,
-- authenticated grant read, and receipt commit already checks grant.active
-- and grant.revoked_at. The grant row lock also serializes a concurrent
-- receipt commit (which holds FOR SHARE on the grant).
create or replace function public.nexa_audio_revoke_event_grants()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  original public.nexa_audio_retention_evidence_events%rowtype;
begin
  if new.event_kind <> 'authorization_revoked' then return new; end if;
  select e.* into original
  from public.nexa_audio_retention_evidence_events e
  where e.event_id=new.target_event_id
    and e.event_kind='authorization_verified'
  for update;
  if not found or new.owner_user_id is distinct from original.owner_user_id
    or new.encounter_id is distinct from original.encounter_id
    or new.attested_by is distinct from original.attested_by
    or new.purpose is distinct from original.purpose
    or new.policy_version is distinct from original.policy_version
    or new.terms_digest is distinct from original.terms_digest then
    raise exception 'RETENTION_REVOCATION_SOURCE_MISMATCH'
      using errcode='23514';
  end if;
  update public.nexa_audio_retention_grants g
  set active=false
  where g.attestation_event_id=original.event_id
    and g.owner_user_id=original.owner_user_id
    and g.encounter_id=original.encounter_id
    and g.active and g.revoked_at is null;
  -- The existing nexa_audio_revoke_stamp trigger stamps revoked_at on
  -- transition active true -> false and prevents later reactivation.
  return new;
end;
$$;
revoke all on function public.nexa_audio_revoke_event_grants()
  from public,anon,authenticated,service_role;
drop trigger if exists nexa_audio_evidence_revocation_cascade
  on public.nexa_audio_retention_evidence_events;
create trigger nexa_audio_evidence_revocation_cascade
after insert on public.nexa_audio_retention_evidence_events
for each row execute function public.nexa_audio_revoke_event_grants();

grant select,insert,update on public.nexa_audio_retention_grants to service_role;
grant select on public.profiles,public.consultation_history to service_role;

-- SECURITY INVOKER, exclusively service_role. The future Edge caller MUST
-- authenticate the doctor independently and derive owner_id from auth.getUser().
-- Do not pass browser consent, terms, policy, proof or grant_id as RPC arguments.
create or replace function public.nexa_audio_issue_retention_grant(
  p_owner_user_id uuid,p_encounter_id uuid,p_client_action_id uuid
)
returns table (
  grant_id uuid,owner_user_id uuid,encounter_id uuid,
  issuer_action_id uuid,attestation_event_id uuid,
  purpose text,policy_version text,server_verified boolean,
  active boolean,expires_at timestamptz
)
language plpgsql volatile security invoker set search_path=''
as $$
declare
  ev public.nexa_audio_retention_evidence_events%rowtype;
  pol public.nexa_audio_retention_approved_policies%rowtype;
  g public.nexa_audio_retention_grants%rowtype;
  started_at timestamptz;
begin
  if p_owner_user_id is null or p_encounter_id is null or
     p_client_action_id is null then
    raise exception 'INVALID_ISSUER_INPUT' using errcode='22023';
  end if;
  if not exists (select 1 from public.profiles p
    where p.id=p_owner_user_id and p.access_status='active'
      and p.clinical_access is true) then
    raise exception 'CLINICAL_ACCESS_REQUIRED' using errcode='42501';
  end if;
  if not exists (select 1 from public.consultation_history c
    where c.encounter_id=p_encounter_id and c.user_id=p_owner_user_id) then
    raise exception 'SOURCE_NOT_OWNED' using errcode='42501';
  end if;
  -- Lock event: the FK on a concurrent revocation event obtains a KEY SHARE
  -- on its parent, which conflicts with this FOR UPDATE lock.
  select e.* into ev from public.nexa_audio_retention_evidence_events e
    where e.owner_user_id=p_owner_user_id
      and e.encounter_id=p_encounter_id and e.attested_by=p_owner_user_id
      and e.event_kind='authorization_verified'
      and e.purpose='clinical_audio_retention'
      and e.verified_by_server and e.patient_authorization_verified
      and e.expires_at>clock_timestamp()
    order by e.verified_at desc limit 1 for update;
  if not found then
    raise exception 'CONSENT_ISSUER_AUTHORITY_MISSING' using errcode='42501';
  end if;
  select p.* into pol from public.nexa_audio_retention_approved_policies p
    where p.policy_version=ev.policy_version
      and p.purpose='clinical_audio_retention'
      and p.independently_approved and p.terms_digest=ev.terms_digest
    for share;
  if not found then
    raise exception 'RETENTION_POLICY_NOT_APPROVED' using errcode='42501';
  end if;
  if exists (select 1 from public.nexa_audio_retention_evidence_events r
    where r.event_kind='authorization_revoked'
      and r.target_event_id=ev.event_id) then
    raise exception 'RETENTION_ATTESTATION_REVOKED' using errcode='42501';
  end if;
  started_at:=clock_timestamp();
  if ev.expires_at<=started_at then
    raise exception 'RETENTION_ATTESTATION_EXPIRED' using errcode='42501';
  end if;
  insert into public.nexa_audio_retention_grants(
    owner_user_id,encounter_id,issuer_action_id,attestation_event_id,
    purpose,policy_version,consent_evidence_digest,server_verified,
    active,issued_at,expires_at
  ) values(
    p_owner_user_id,p_encounter_id,p_client_action_id,ev.event_id,
    'clinical_audio_retention',pol.policy_version,ev.evidence_digest,
    true,true,started_at,least(ev.expires_at,started_at+interval '15 minutes')
  ) on conflict do nothing;
  select x.* into g from public.nexa_audio_retention_grants x
    where x.owner_user_id=p_owner_user_id
      and x.encounter_id=p_encounter_id
      and x.issuer_action_id=p_client_action_id for update;
  if not found or g.attestation_event_id is distinct from ev.event_id or
     g.policy_version is distinct from pol.policy_version or
     g.consent_evidence_digest is distinct from ev.evidence_digest then
    raise exception 'RETENTION_ISSUER_ACTION_CONFLICT' using errcode='23505';
  end if;
  if not g.active or not g.server_verified or g.revoked_at is not null or
     g.expires_at<=clock_timestamp() then
    raise exception 'RETENTION_GRANT_REVOKED_OR_EXPIRED' using errcode='42501';
  end if;
  return query select g.grant_id,g.owner_user_id,g.encounter_id,
    g.issuer_action_id,g.attestation_event_id,g.purpose,g.policy_version,
    g.server_verified,g.active,g.expires_at;
end;
$$;
revoke all on function public.nexa_audio_issue_retention_grant(uuid,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.nexa_audio_issue_retention_grant(uuid,uuid,uuid)
  to service_role;
-- No approved policies, verified events, or writers are seeded here.
-- This is a candidate for synthetic lab review only; never production.
commit;
