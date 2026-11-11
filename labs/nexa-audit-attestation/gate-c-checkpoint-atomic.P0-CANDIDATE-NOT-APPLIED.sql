-- NEXA Gate C P0 - CANDIDATE LAB ONLY / UNEXECUTED / NOT A MIGRATION.
-- Never run against hosted Supabase. Synthetic local PostgreSQL only.
-- Requires previously reviewed private schema, actual slot/profile tables and
-- audit_cases(source_consultation_id,snapshot_version) UNIQUE.
-- THIS FILE DOES NOT PROVIDE a production consent/review evidence writer.
-- Both evidence tables start empty => fail closed until independently attested.
--
-- Trusted caller: server-side Edge with auth.getUser() result (not request.actor).
-- Only service_role is intended to EXECUTE PUBLIC wrappers. These functions
-- use SECURITY INVOKER, NEVER SECURITY DEFINER. They recheck owner and active
-- slot inside the transaction. Service role bypasses RLS: all checks explicit.
-- The HTTP caller must reauthenticate before COMMIT and validate AI output.
-- No client data may be used as clinical input or evidence.
begin;

create table if not exists private.nexa_gate_c_consent_evidence_lab (
 id uuid primary key default gen_random_uuid(),
 source_row_id text not null,
 encounter_id uuid not null,
 owner_user_id uuid not null,
 consent_recorded_at timestamptz not null,
 policy_version text not null,
 allows_external_ai boolean not null check (allows_external_ai),
 allows_audit boolean not null check (allows_audit),
 verified_at timestamptz not null,
 revoked_at timestamptz,
 evidence_origin text not null check (evidence_origin='verified_server_consent_event'),
 unique (source_row_id,encounter_id,owner_user_id,consent_recorded_at,policy_version)
);

create table if not exists private.nexa_gate_c_review_evidence_lab (
 id uuid primary key default gen_random_uuid(),
 source_row_id text not null,
 encounter_id uuid not null,
 owner_user_id uuid not null,
 source_sync_version bigint not null check (source_sync_version>0),
 clinical_digest text not null,
 canonicalization text not null check(canonicalization='pg-jsonb-v1'),
 reviewed_at timestamptz not null,
 acked_by_server boolean not null check(acked_by_server),
 reconciliation_pending boolean not null check(not reconciliation_pending),
 unprocessed_audio boolean not null check(not unprocessed_audio),
 post_review_edits boolean not null check(not post_review_edits),
 evidence_origin text not null check(evidence_origin='verified_server_physician_review'),
 unique (encounter_id,source_sync_version,owner_user_id)
);

create table if not exists private.nexa_gate_c_checkpoint_lab (
 id uuid primary key default gen_random_uuid(),
 source_row_id text not null,
 encounter_id uuid not null,
 owner_user_id uuid not null,
 source_sync_version bigint not null check(source_sync_version>0),
 snapshot_version text not null check(snapshot_version='final-v1'),
 canonicalization text not null check(canonicalization='pg-jsonb-v1'),
 clinical_digest text not null,
 consent_evidence_id uuid not null references private.nexa_gate_c_consent_evidence_lab(id),
 review_evidence_id uuid not null references private.nexa_gate_c_review_evidence_lab(id),
 consent_recorded_at timestamptz not null,
 confirmed_at timestamptz not null default now(),
 unique (encounter_id,snapshot_version,source_sync_version)
);

create table if not exists private.nexa_gate_c_audit_binding_lab (
 audit_case_id uuid primary key references public.audit_cases(id),
 checkpoint_id uuid not null references private.nexa_gate_c_checkpoint_lab(id),
 source_row_id text not null,
 encounter_id uuid not null,
 owner_user_id uuid not null,
 source_sync_version bigint not null,
 snapshot_version text not null,
 clinical_digest text not null,
 created_at timestamptz not null default now(),
 unique(encounter_id,snapshot_version)
);

-- The private schema is not an exposed Data API schema. No write/execute
-- privilege for public, anon, authenticated. All existing ACLs are unchanged.
revoke all on private.nexa_gate_c_consent_evidence_lab,
 private.nexa_gate_c_review_evidence_lab,
 private.nexa_gate_c_checkpoint_lab,
 private.nexa_gate_c_audit_binding_lab from public, anon, authenticated;
grant select, insert on private.nexa_gate_c_checkpoint_lab,
 private.nexa_gate_c_audit_binding_lab to service_role;
grant select on private.nexa_gate_c_consent_evidence_lab,
 private.nexa_gate_c_review_evidence_lab to service_role;

create or replace function private.nexa_gate_c_clinical_digest_lab(
 p_fields jsonb,p_processing_meta jsonb,p_protocol_usage jsonb,
 p_consent_recorded_at timestamptz
) returns text language sql stable set search_path=pg_catalog as $$
 select 'sha256:' || encode(sha256(convert_to(
   jsonb_build_object(
      'fields',p_fields,
      'processing_meta',p_processing_meta,
      'protocol_usage',p_protocol_usage,
      'consent_recorded_at',
         to_char(p_consent_recorded_at at time zone 'UTC',
                 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
   )::text,'UTF8')), 'hex');
$$;

-- Caller-controlled p_actor is ONLY permissible after server auth.getUser().
-- CHECKPOINT reads the exact data returned for later deidentification.
-- If signed medical review/consent proofs are missing, no receipt is created.
create or replace function public.nexa_gate_c_checkpoint_candidate(
 p_actor uuid,p_encounter uuid,p_expected_version bigint
) returns table (
 receipt_id uuid, source_payload jsonb, payload_digest text, source_version bigint
) language plpgsql security invoker set search_path=pg_catalog as $$
declare
 v_source public.consultation_history%rowtype;
 v_consent private.nexa_gate_c_consent_evidence_lab%rowtype;
 v_review private.nexa_gate_c_review_evidence_lab%rowtype;
 v_receipt private.nexa_gate_c_checkpoint_lab%rowtype;
 v_digest text;
begin
 if p_actor is null or p_encounter is null or
    p_expected_version is null or p_expected_version<1 then
   raise exception 'SOURCE_REQUEST_INVALID';
 end if;
 if not exists(
   select 1 from public.profiles p
   join private.clinical_slots cs on cs.profile_id=p.id
   where p.id=p_actor and p.access_status='active'
     and p.clinical_access=true
 ) then raise exception 'ACTIVE_CLINICAL_ACCESS_DENIED'; end if;

 select * into v_source from public.consultation_history s
 where s.encounter_id=p_encounter for share;
 if not found or v_source.user_id is null or v_source.user_id<>p_actor
    or v_source.encounter_state<>'ready_for_audit'
    or v_source.sync_version<>p_expected_version
    or v_source.consent_recorded_at is null
    or jsonb_typeof(v_source.fields) is distinct from 'object'
    or jsonb_typeof(v_source.processing_meta) is distinct from 'object'
    or jsonb_typeof(v_source.protocol_usage) is distinct from 'array'
 then raise exception 'SOURCE_NOT_ATTESTABLE'; end if;

 v_digest:=private.nexa_gate_c_clinical_digest_lab(
  v_source.fields,v_source.processing_meta,v_source.protocol_usage,
  v_source.consent_recorded_at);

 select * into v_consent from private.nexa_gate_c_consent_evidence_lab e
 where e.source_row_id=v_source.id and e.encounter_id=p_encounter
   and e.owner_user_id=p_actor
   and e.consent_recorded_at=v_source.consent_recorded_at
   and e.allows_external_ai and e.allows_audit
   and e.revoked_at is null and e.verified_at is not null
 order by e.verified_at desc limit 1 for share;
 if not found then raise exception 'CONSENT_SERVER_EVIDENCE_MISSING'; end if;

 select * into v_review from private.nexa_gate_c_review_evidence_lab e
 where e.source_row_id=v_source.id and e.encounter_id=p_encounter
   and e.owner_user_id=p_actor
   and e.source_sync_version=v_source.sync_version
   and e.canonicalization='pg-jsonb-v1'
   and e.clinical_digest=v_digest and e.acked_by_server
   and not e.reconciliation_pending and not e.unprocessed_audio
   and not e.post_review_edits
 for share;
 if not found then raise exception 'PHYSICIAN_REVIEW_SERVER_ACK_MISSING'; end if;

 insert into private.nexa_gate_c_checkpoint_lab (
   source_row_id,encounter_id,owner_user_id,source_sync_version,
   snapshot_version,canonicalization,clinical_digest,
   consent_evidence_id,review_evidence_id,consent_recorded_at
 ) values (
   v_source.id,p_encounter,p_actor,v_source.sync_version,
   'final-v1','pg-jsonb-v1',v_digest,v_consent.id,v_review.id,
   v_source.consent_recorded_at
 ) on conflict(encounter_id,snapshot_version,source_sync_version) do nothing
 returning * into v_receipt;
 if v_receipt.id is null then
   select * into v_receipt from private.nexa_gate_c_checkpoint_lab cp
   where cp.encounter_id=p_encounter
     and cp.snapshot_version='final-v1'
     and cp.source_sync_version=v_source.sync_version;
   if v_receipt.id is null or v_receipt.owner_user_id<>p_actor
      or v_receipt.clinical_digest<>v_digest
      or v_receipt.source_row_id<>v_source.id
      or v_receipt.consent_evidence_id<>v_consent.id
      or v_receipt.review_evidence_id<>v_review.id
   then raise exception 'CHECKPOINT_CONFLICT'; end if;
 end if;
 return query select v_receipt.id,
   jsonb_build_object('fields',v_source.fields,
     'processing_meta',v_source.processing_meta,
     'protocol_usage',v_source.protocol_usage),v_digest,v_source.sync_version;
end;
$$;

-- ATOMIC POST-AI COMMIT: ONE DB transaction per RPC. No external AI inside.
-- Lock order matches submit_audit_review: existing audit row BEFORE source.
-- Advisory per encounter/snapshot serializes submissions when no row exists.
-- Terminal audit is NEVER modified; matched pending is idempotent/no overwrite.
create or replace function public.nexa_gate_c_commit_candidate(
 p_actor uuid,p_receipt uuid,p_input_digest text,
 p_deidentified_fields jsonb,p_deidentified_core jsonb
) returns table (audit_case_id uuid, outcome text)
language plpgsql security invoker set search_path=pg_catalog as $$
declare
 v_cp private.nexa_gate_c_checkpoint_lab%rowtype;
 v_source public.consultation_history%rowtype;
 v_case public.audit_cases%rowtype;
 v_bind private.nexa_gate_c_audit_binding_lab%rowtype;
 v_consent private.nexa_gate_c_consent_evidence_lab%rowtype;
 v_review private.nexa_gate_c_review_evidence_lab%rowtype;
 v_digest text;
begin
 if p_actor is null or p_receipt is null or
    jsonb_typeof(p_deidentified_fields) is distinct from 'object' or
    jsonb_typeof(p_deidentified_core) is distinct from 'object'
 then raise exception 'ATOMIC_REQUEST_INVALID'; end if;

 select * into v_cp from private.nexa_gate_c_checkpoint_lab cp
 where cp.id=p_receipt;
 if not found or v_cp.owner_user_id<>p_actor or
    v_cp.canonicalization<>'pg-jsonb-v1' or
    v_cp.snapshot_version<>'final-v1' or
    v_cp.clinical_digest is distinct from p_input_digest
 then raise exception 'CHECKPOINT_NOT_MATCHED'; end if;

 perform pg_advisory_xact_lock(
   hashtextextended(v_cp.encounter_id::text||'|'||v_cp.snapshot_version,0));

 select * into v_case from public.audit_cases ac
 where ac.source_consultation_id=v_cp.encounter_id
   and ac.snapshot_version=v_cp.snapshot_version for update;

 select * into v_source from public.consultation_history s
 where s.encounter_id=v_cp.encounter_id for update;
 if not found or v_source.id<>v_cp.source_row_id
    or v_source.user_id is null or v_source.user_id<>p_actor
    or v_source.encounter_state<>'ready_for_audit'
    or v_source.sync_version<>v_cp.source_sync_version
    or v_source.consent_recorded_at is distinct from v_cp.consent_recorded_at
    or jsonb_typeof(v_source.fields) is distinct from 'object'
    or jsonb_typeof(v_source.processing_meta) is distinct from 'object'
    or jsonb_typeof(v_source.protocol_usage) is distinct from 'array'
 then raise exception 'SOURCE_CHANGED_POST_AI'; end if;

 -- Locks protect access/consent attestations from revocation until commit.
 if not exists (
   select 1 from public.profiles p
   join private.clinical_slots cs on cs.profile_id=p.id
   where p.id=p_actor and p.access_status='active'
     and p.clinical_access=true
   for share of p,cs
 ) then raise exception 'ACCESS_REVOKED_POST_AI'; end if;

 select * into v_consent from private.nexa_gate_c_consent_evidence_lab ce
 where ce.id=v_cp.consent_evidence_id for share;
 if not found or v_consent.owner_user_id<>p_actor
    or v_consent.source_row_id<>v_source.id
    or v_consent.encounter_id<>v_source.encounter_id
    or v_consent.consent_recorded_at<>v_source.consent_recorded_at
    or v_consent.revoked_at is not null
    or not v_consent.allows_external_ai or not v_consent.allows_audit
 then raise exception 'CONSENT_CHANGED_POST_AI'; end if;

 select * into v_review from private.nexa_gate_c_review_evidence_lab r
 where r.id=v_cp.review_evidence_id for share;
 if not found or v_review.owner_user_id<>p_actor
    or v_review.encounter_id<>v_source.encounter_id
    or v_review.source_row_id<>v_source.id
    or v_review.source_sync_version<>v_source.sync_version
    or not v_review.acked_by_server
    or v_review.reconciliation_pending or v_review.unprocessed_audio
    or v_review.post_review_edits
 then raise exception 'REVIEW_CHANGED_POST_AI'; end if;

 v_digest:=private.nexa_gate_c_clinical_digest_lab(
   v_source.fields,v_source.processing_meta,v_source.protocol_usage,
   v_source.consent_recorded_at);
 if v_cp.clinical_digest<>v_digest
    or v_review.clinical_digest<>v_digest
 then raise exception 'DIGEST_CHANGED_POST_AI'; end if;

 if v_case.id is not null then
   if v_case.status<>'pending' then
     raise exception 'AUDIT_TERMINAL_IMMUTABLE';
   end if;
   select * into v_bind from private.nexa_gate_c_audit_binding_lab ab
   where ab.audit_case_id=v_case.id for share;
   if not found or v_bind.checkpoint_id<>p_receipt
      or v_bind.owner_user_id<>p_actor
      or v_bind.clinical_digest<>v_digest
      or v_case.source_sync_version<>v_cp.source_sync_version
   then raise exception 'AUDIT_EXISTING_DIFFERENT_SNAPSHOT'; end if;
   return query select v_case.id,'ALREADY_MATCHED_PENDING'::text;
   return;
 end if;

 insert into public.audit_cases(
   source_consultation_id,snapshot_version,submitted_by,
   deidentified_fields,deidentified_core_context,status,
   audit_schema_version,source_sync_version,source_updated_at,
   last_synced_at
 ) values(
   v_cp.encounter_id,'final-v1',p_actor,p_deidentified_fields,
   p_deidentified_core,'pending','3',v_cp.source_sync_version,
   v_source.updated_at,now()
 ) returning * into v_case;
 insert into private.nexa_gate_c_audit_binding_lab(
   audit_case_id,checkpoint_id,source_row_id,encounter_id,
   owner_user_id,source_sync_version,snapshot_version,clinical_digest
 ) values(
   v_case.id,p_receipt,v_cp.source_row_id,v_cp.encounter_id,
   p_actor,v_cp.source_sync_version,v_cp.snapshot_version,v_digest
 );
 return query select v_case.id,'INSERTED_PENDING'::text;
end;
$$;

-- PUBLIC wrappers have no default public access; all existing ACL untouched.
revoke all on function public.nexa_gate_c_checkpoint_candidate(uuid,uuid,bigint)
 from public,anon,authenticated;
revoke all on function public.nexa_gate_c_commit_candidate(uuid,uuid,text,jsonb,jsonb)
 from public,anon,authenticated;
grant execute on function public.nexa_gate_c_checkpoint_candidate(uuid,uuid,bigint)
 to service_role;
grant execute on function public.nexa_gate_c_commit_candidate(uuid,uuid,text,jsonb,jsonb)
 to service_role;
commit;

-- STOP: this file is untested SQL candidate, not a release migration.
-- Postgres C01-C10 with 2 concurrent connections + reviewer still NOT RUN.
-- Missing real consent/review evidence writers means production remains blocked.
