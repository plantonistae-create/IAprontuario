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

-- Immutable, server-confirmed archival receipts are NOT training approvals.
-- No client insert/update/delete/read grants and NO authenticated RLS policies.
-- The only writer is the audited server-side RPC invoked with service_role
-- AFTER independent Storage byte readback and SHA-256 verification.
create table if not exists public.nexa_audio_archive_receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  encounter_id uuid not null,
  client_action_id uuid not null,
  retention_grant_id uuid not null references public.nexa_audio_retention_grants(grant_id),
  object_path text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}-- separately designed chunk/resumable flow before real clinical deployment.
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

-- Deliberately absent: trusted server issuance of verified grants, cleanup of
-- unconfirmed objects, revoke/delete pipeline, direct-upload RLS/atomicity
-- integration test, commercial training rights and clinical go-live.
-- A receipt is only inserted by the server after authenticated readback.

commit;
),
  size_bytes bigint not null check (size_bytes between 1 and 41943040),
  mime_type text not null check (mime_type in ('audio/webm','audio/ogg','audio/mp4','audio/wav','audio/x-wav')),
  policy_version text not null check (policy_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}-- separately designed chunk/resumable flow before real clinical deployment.
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
),
  purpose text not null default 'clinical_audio_retention'
    check (purpose = 'clinical_audio_retention'),
  committed_at timestamptz not null default clock_timestamp(),
  unique(owner_user_id,encounter_id,client_action_id),
  unique(object_path)
);
alter table public.nexa_audio_archive_receipts enable row level security;
revoke all on public.nexa_audio_archive_receipts from public, anon, authenticated;
grant select, insert on public.nexa_audio_archive_receipts to service_role;
grant select on public.nexa_audio_retention_grants to service_role;

-- Explicit immutable guard: even privileged service writes cannot silently
-- mutate the evidence; corrections require a separately authorized event model.
create or replace function public.nexa_audio_receipt_immutable_guard()
returns trigger language plpgsql security invoker set search_path = ''
as $
begin
  raise exception 'AUDIO_RECEIPT_IMMUTABLE' using errcode = '23514';
end;
$;
revoke all on function public.nexa_audio_receipt_immutable_guard() from public, anon, authenticated;
drop trigger if exists nexa_audio_receipt_immutable on public.nexa_audio_archive_receipts;
create trigger nexa_audio_receipt_immutable
before update or delete on public.nexa_audio_archive_receipts
for each row execute function public.nexa_audio_receipt_immutable_guard();

-- This function is deliberately callable ONLY by service_role.
-- A browser with a user JWT cannot call it or directly create receipts.
-- p_* values MUST come from trusted server-side readback, not request JSON.
create or replace function public.nexa_audio_commit_verified_receipt(
  p_owner_user_id uuid, p_encounter_id uuid, p_client_action_id uuid,
  p_retention_grant_id uuid, p_object_path text, p_sha256 text,
  p_size_bytes bigint, p_mime_type text, p_policy_version text
)
returns table (
  receipt_id uuid, owner_user_id uuid, encounter_id uuid,
  client_action_id uuid, retention_grant_id uuid, object_path text,
  sha256 text, size_bytes bigint, mime_type text, policy_version text,
  purpose text, committed_at timestamptz
)
language plpgsql volatile security invoker set search_path = ''
as $
declare
  g public.nexa_audio_retention_grants%rowtype;
  r public.nexa_audio_archive_receipts%rowtype;
  ext text;
  expected_path text;
begin
  if p_size_bytes is null or p_size_bytes not between 1 and 41943040 or
     p_sha256 !~ '^[a-f0-9]{64}-- separately designed chunk/resumable flow before real clinical deployment.
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
 or p_policy_version is null then
    raise exception 'INVALID_ARCHIVE_RECEIPT_INPUT' using errcode = '23514';
  end if;
  ext := case p_mime_type
    when 'audio/webm' then 'webm' when 'audio/ogg' then 'ogg'
    when 'audio/mp4' then 'm4a' when 'audio/wav' then 'wav'
    when 'audio/x-wav' then 'wav' else null end;
  expected_path := p_owner_user_id::text||'/'||p_encounter_id::text||'/'||
     p_retention_grant_id::text||'/'||p_client_action_id::text||'/'||
     p_sha256||'.'||ext;
  if ext is null or p_object_path is distinct from expected_path then
    raise exception 'AUDIO_RECEIPT_OBJECT_PATH_MISMATCH' using errcode = '23514';
  end if;
  -- FOR SHARE holds the current grant through the insert/commit transaction.
  -- A concurrent revocation UPDATE must wait; later commits cannot reuse it.
  select * into g from public.nexa_audio_retention_grants x
    where x.grant_id=p_retention_grant_id and
      x.encounter_id=p_encounter_id and x.owner_user_id=p_owner_user_id
    for share;
  if not found or not g.active or not g.server_verified or
     g.revoked_at is not null or g.expires_at <= clock_timestamp() or
     g.purpose <> 'clinical_audio_retention' or
     g.policy_version is distinct from p_policy_version then
    raise exception 'RETENTION_GRANT_NOT_VERIFIED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.consultation_history c
    where c.encounter_id=p_encounter_id and c.user_id=p_owner_user_id
  ) then raise exception 'ENCOUNTER_NOT_OWNED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id='nexa-private-clinical-audio' and o.name=p_object_path
  ) then raise exception 'AUDIO_STORAGE_OBJECT_NOT_FOUND' using errcode = '23514';
  end if;
  -- Strictly idempotent: action ID cannot be rebound to a new hash or grant.
  insert into public.nexa_audio_archive_receipts
    (owner_user_id,encounter_id,client_action_id,retention_grant_id,
     object_path,sha256,size_bytes,mime_type,policy_version)
  values
    (p_owner_user_id,p_encounter_id,p_client_action_id,p_retention_grant_id,
     p_object_path,p_sha256,p_size_bytes,p_mime_type,p_policy_version)
  on conflict do nothing;
  select * into r from public.nexa_audio_archive_receipts z
    where z.owner_user_id=p_owner_user_id and z.encounter_id=p_encounter_id
      and z.client_action_id=p_client_action_id;
  if not found or r.object_path is distinct from p_object_path or
     r.sha256 is distinct from p_sha256 or r.size_bytes is distinct from p_size_bytes or
     r.mime_type is distinct from p_mime_type or
     r.retention_grant_id is distinct from p_retention_grant_id or
     r.policy_version is distinct from p_policy_version then
    raise exception 'ARCHIVE_ACTION_RECEIPT_CONFLICT' using errcode = '23505';
  end if;
  return query select r.receipt_id,r.owner_user_id,r.encounter_id,
    r.client_action_id,r.retention_grant_id,r.object_path,r.sha256,
    r.size_bytes,r.mime_type,r.policy_version,r.purpose,r.committed_at;
end;
$;
revoke all on function public.nexa_audio_commit_verified_receipt(
  uuid,uuid,uuid,uuid,text,text,bigint,text,text
) from public, anon, authenticated;
grant execute on function public.nexa_audio_commit_verified_receipt(
  uuid,uuid,uuid,uuid,text,text,bigint,text,text
) to service_role;

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
