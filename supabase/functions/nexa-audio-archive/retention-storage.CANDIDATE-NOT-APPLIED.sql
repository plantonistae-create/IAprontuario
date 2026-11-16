-- NEXA Core P0 — REVIEW CANDIDATE, NOT APPLIED, NOT A PRODUCTION MIGRATION.
-- Do not deploy without proof of legal basis, physician attestation workflow,
-- RLS/owner-only tests, pending-upload cleanup, revocation semantics and Gate C.
-- A server-only consent verifier/issuer is intentionally NOT implemented here.
-- Existing consent_recorded_at and training approvals NEVER issue a grant.
-- Client-side consent checkbox is NOT authoritative.

begin;

create table if not exists public.nexa_audio_retention_grants (
  grant_id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null,
  owner_user_id uuid not null references auth.users(id),
  purpose text not null check (purpose = 'clinical_audio_retention'),
  policy_version text not null check (policy_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$'),
  consent_evidence_digest text not null check (consent_evidence_digest ~ '^[a-f0-9]{64}$'),
  server_verified boolean not null default false,
  active boolean not null default false,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint nexa_retention_valid_window check (expires_at > issued_at),
  constraint nexa_retention_verified_activation check (not active or server_verified),
  constraint nexa_retention_revoked_inactive check (revoked_at is null or not active)
);
create index if not exists nexa_audio_grants_owner_encounter
  on public.nexa_audio_retention_grants(owner_user_id, encounter_id, issued_at desc);
alter table public.nexa_audio_retention_grants enable row level security;
revoke all on public.nexa_audio_retention_grants from public, anon, authenticated;
grant select on public.nexa_audio_retention_grants to authenticated;
-- Authenticated physicians can only REVOKE their own grants.
-- Issuance/verification can only be performed later by a trusted server path.
grant update (active, revoked_at) on public.nexa_audio_retention_grants to authenticated;

drop policy if exists nexa_audio_grants_owner_read on public.nexa_audio_retention_grants;
create policy nexa_audio_grants_owner_read on public.nexa_audio_retention_grants
for select to authenticated
using (owner_user_id = (select auth.uid()) and
       exists (select 1 from public.consultation_history c
               where c.encounter_id = nexa_audio_retention_grants.encounter_id
               and c.user_id = (select auth.uid())));
drop policy if exists nexa_audio_grants_owner_revoke on public.nexa_audio_retention_grants;
create policy nexa_audio_grants_owner_revoke on public.nexa_audio_retention_grants
for update to authenticated
using (owner_user_id = (select auth.uid()) and active and revoked_at is null)
with check (owner_user_id = (select auth.uid()) and not active and revoked_at is not null);

-- Server stamps revocation; the caller may not author its own effective date.
create or replace function public.nexa_audio_revoke_stamp()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  -- Revocation is one-way: even an internal writer must create a new, separately
  -- evidenced grant instead of reopening an old grant.
  if old.revoked_at is not null and
     (new.active is distinct from old.active or
      new.revoked_at is distinct from old.revoked_at) then
    raise exception 'AUDIO_RETENTION_REVOKED_IMMUTABLE'
      using errcode = '23514';
  end if;
  if old.active is true and new.active is false then
    new.revoked_at := clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function public.nexa_audio_revoke_stamp() from public, anon, authenticated;
drop trigger if exists nexa_audio_revoke_stamp_trigger on public.nexa_audio_retention_grants;
create trigger nexa_audio_revoke_stamp_trigger
before update on public.nexa_audio_retention_grants
for each row execute function public.nexa_audio_revoke_stamp();

-- SECURITY INVOKER: no RLS bypass. Returns ONLY current physician's grant.
create or replace function public.nexa_audio_retention_authority(
  p_encounter_id uuid, p_grant_id uuid
)
returns table (
  grant_id uuid, owner_user_id uuid, encounter_id uuid, purpose text,
  policy_version text, active boolean, server_verified boolean,
  expires_at timestamptz, revoked_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  select g.grant_id,g.owner_user_id,g.encounter_id,g.purpose,g.policy_version,
         g.active,g.server_verified,g.expires_at,g.revoked_at
  from public.nexa_audio_retention_grants g
  where g.grant_id = p_grant_id
    and g.encounter_id = p_encounter_id
    and g.owner_user_id = (select auth.uid())
    and exists (
      select 1 from public.consultation_history c
      where c.encounter_id=g.encounter_id
        and c.user_id=(select auth.uid())
    )
    and (select public.has_active_clinical_access())
  limit 1;
$$;
revoke all on function public.nexa_audio_retention_authority(uuid,uuid) from public, anon;
grant execute on function public.nexa_audio_retention_authority(uuid,uuid) to authenticated;

-- Free plan: bucket cap below global 50MB cap; long consultations need a
-- separately designed chunk/resumable flow before real clinical deployment.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('nexa-private-clinical-audio','nexa-private-clinical-audio',false,
        41943040,array['audio/webm','audio/ogg','audio/mp4','audio/wav','audio/x-wav'])
on conflict (id) do nothing;

-- Explicit authenticated INSERT ONLY. No direct client SELECT/UPDATE/DELETE.
-- A restrictive guard also applies if another broad permissive policy exists.
drop policy if exists nexa_audio_owner_insert on storage.objects;
create policy nexa_audio_owner_insert on storage.objects
as permissive for insert to authenticated
with check (
  bucket_id = 'nexa-private-clinical-audio'
  and cardinality(storage.foldername(name)) = 4
  and ((storage.foldername(name))[1]) = (select auth.uid())::text
  and ((storage.foldername(name))[4]) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and storage.filename(name) ~ '^[0-9a-f]{64}\.(webm|ogg|m4a|wav)$'
  and (select public.has_active_clinical_access())
  and exists (
    select 1 from public.nexa_audio_retention_grants g
    join public.consultation_history c on
      c.encounter_id=g.encounter_id and c.user_id=g.owner_user_id
    where g.owner_user_id = (select auth.uid())
      and g.encounter_id::text = ((storage.foldername(name))[2])
      and g.grant_id::text = ((storage.foldername(name))[3])
      and g.purpose='clinical_audio_retention'
      and g.server_verified and g.active and g.revoked_at is null
      and g.expires_at > now()
  )
);
drop policy if exists nexa_audio_owner_restrict_insert on storage.objects;
create policy nexa_audio_owner_restrict_insert on storage.objects
as restrictive for insert to public
with check (
  bucket_id <> 'nexa-private-clinical-audio' or (
    cardinality(storage.foldername(name))=4
    and ((storage.foldername(name))[1])=(select auth.uid())::text
    and exists (
      select 1 from public.nexa_audio_retention_grants g
      where g.owner_user_id=(select auth.uid()) and g.active
        and g.server_verified and g.revoked_at is null and g.expires_at>now()
        and g.encounter_id::text=((storage.foldername(name))[2])
        and g.grant_id::text=((storage.foldername(name))[3])
    )
  )
);
-- No client downloads, listing, upsert or deletion on this bucket, even when
-- other permissive policies exist. Back-end authenticated readback mediates access.
drop policy if exists nexa_audio_no_client_select on storage.objects;
create policy nexa_audio_no_client_select on storage.objects
as restrictive for select to public
using (bucket_id <> 'nexa-private-clinical-audio');
drop policy if exists nexa_audio_no_client_update on storage.objects;
create policy nexa_audio_no_client_update on storage.objects
as restrictive for update to public
using (bucket_id <> 'nexa-private-clinical-audio')
with check (bucket_id <> 'nexa-private-clinical-audio');
drop policy if exists nexa_audio_no_client_delete on storage.objects;
create policy nexa_audio_no_client_delete on storage.objects
as restrictive for delete to public
using (bucket_id <> 'nexa-private-clinical-audio');

-- Deliberately absent: server issuance of verified grants, immutable event
-- receipts, cleanup of unconfirmed objects, revoke/delete pipeline,
-- direct-upload RLS integration test, training rights, and clinical go-live.

commit;
