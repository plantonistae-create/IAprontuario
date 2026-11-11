-- NEXA P0 GATE C: trusted evidence materializer (LAB ONLY / NOT APPLIED).
-- Load ONLY after gate-c-checkpoint-atomic.P0-CANDIDATE-NOT-APPLIED.sql,
-- in isolated PostgreSQL with synthetic data. Not a production migration.
-- The current NEXA client DOES NOT generate events eligible for this table.
--
-- Critical trust rule: this table is an inbound TRUSTED SERVER EVENT LOG.
-- NO INSERT/UPDATE/DELETE privilege is granted to client roles OR service_role.
-- A separately reviewed real event producer is still missing. Neither a
-- recording checkbox nor a client timestamp nor autosave counts as an event.
-- The writer below can materialize, but CANNOT originate, verified events.
begin;

create table if not exists private.nexa_gate_c_verified_source_events_lab (
 event_id uuid primary key default gen_random_uuid(),
 event_kind text not null check (event_kind in
   ('PHYSICIAN_PATIENT_CONSENT_ATTESTATION','PHYSICIAN_FINAL_REVIEW_ACK')),
 source_row_id text not null,
 encounter_id uuid not null,
 owner_user_id uuid not null,
 source_sync_version bigint not null check (source_sync_version >= 0),
 source_digest text,
 canonicalization text check (canonicalization is null or canonicalization='pg-jsonb-v1'),
 consent_recorded_at timestamptz not null,
 policy_version text,
 allows_external_ai boolean not null default false,
 allows_audit boolean not null default false,
 -- This records WHAT the physician affirmatively attested, NOT independent
 -- proof that the patient personally clicked or consented.
 physician_explicit_action boolean not null check(physician_explicit_action),
 patient_scope_attested boolean not null default false,
 consent_precedes_external_processing boolean not null default false,
 server_sync_ack boolean not null default false,
 server_audio_complete boolean not null default false,
 server_reconciliation_clear boolean not null default false,
 server_no_post_review_edits boolean not null default false,
 event_origin text not null check(event_origin='trusted_backend_verified_event'),
 server_recorded_at timestamptz not null,
 unique(event_kind,encounter_id,owner_user_id,source_sync_version,event_id)
);

-- No general event-ingestion function is supplied. It would require a
-- dedicated, authenticated UI action and backend provenance validation.
revoke all on private.nexa_gate_c_verified_source_events_lab
 from public, anon, authenticated, service_role;
grant select on private.nexa_gate_c_verified_source_events_lab to service_role;

-- Only LAB/private evidence rows; no hosted ACL operation. SECURITY INVOKER
-- needs these table rights. This is NOT the final promotion ACL model:
-- service_role can otherwise write directly; production requires privilege
-- narrowing and an audited server-only mediation boundary.
grant insert, select on private.nexa_gate_c_consent_evidence_lab,
 private.nexa_gate_c_review_evidence_lab to service_role;


-- Optional provenance binding, only on new LAB tables.
alter table private.nexa_gate_c_consent_evidence_lab
 add column if not exists source_event_id uuid
 references private.nexa_gate_c_verified_source_events_lab(event_id);
alter table private.nexa_gate_c_review_evidence_lab
 add column if not exists source_event_id uuid
 references private.nexa_gate_c_verified_source_events_lab(event_id);
create unique index if not exists nexa_gate_c_consent_source_event_lab_uidx
 on private.nexa_gate_c_consent_evidence_lab(source_event_id);
create unique index if not exists nexa_gate_c_review_source_event_lab_uidx
 on private.nexa_gate_c_review_evidence_lab(source_event_id);

create or replace function public.nexa_gate_c_materialize_verified_evidence_lab(
 p_actor uuid,
 p_event_id uuid
) returns text
language plpgsql security invoker
set search_path=pg_catalog
as $$
declare
 v_event private.nexa_gate_c_verified_source_events_lab%rowtype;
 v_source public.consultation_history%rowtype;
 v_digest text;
 v_saved uuid;
begin
 if p_actor is null or p_event_id is null
 then raise exception 'EVENT_REQUEST_INVALID'; end if;

 -- Owner and slot check is performed in THIS transaction as well.
 if not exists (
   select 1 from public.profiles p
   join private.clinical_slots cs on cs.profile_id=p.id
   where p.id=p_actor and p.access_status='active'
     and p.clinical_access is true and cs.slot_no between 1 and 5
   for share of p,cs
 ) then raise exception 'ACTIVE_CLINICAL_ACCESS_DENIED'; end if;

 select * into v_event
 from private.nexa_gate_c_verified_source_events_lab e
 where e.event_id=p_event_id for share;
 if not found or v_event.owner_user_id<>p_actor
    or v_event.event_origin<>'trusted_backend_verified_event'
    or v_event.physician_explicit_action is not true
 then raise exception 'TRUSTED_EVENT_REQUIRED'; end if;

 select * into v_source
 from public.consultation_history s
 where s.encounter_id=v_event.encounter_id for share;
 if not found or v_source.user_id is null
    or v_source.user_id<>p_actor
    or v_source.id<>v_event.source_row_id
    or v_source.consent_recorded_at is null
    or v_source.consent_recorded_at<>v_event.consent_recorded_at
 then raise exception 'SOURCE_OWNER_OR_CONSENT_MISMATCH'; end if;

 if v_event.event_kind='PHYSICIAN_PATIENT_CONSENT_ATTESTATION' then
   -- Physician's affirmative declaration, server-captured before external AI.
   -- Old checkbox + client-generated consentRecordedAt are NOT accepted.
   if v_event.patient_scope_attested is not true
      or v_event.allows_external_ai is not true
      or v_event.allows_audit is not true
      or v_event.consent_precedes_external_processing is not true
      or nullif(btrim(v_event.policy_version),'') is null
      or v_event.source_sync_version>v_source.sync_version
   then raise exception 'CONSENT_EVENT_NOT_SUFFICIENT'; end if;

   insert into private.nexa_gate_c_consent_evidence_lab(
     source_row_id,encounter_id,owner_user_id,consent_recorded_at,
     policy_version,allows_external_ai,allows_audit,verified_at,
     evidence_origin,source_event_id
   ) values(
     v_source.id,v_source.encounter_id,p_actor,v_source.consent_recorded_at,
     v_event.policy_version,true,true,v_event.server_recorded_at,
     'verified_server_consent_event',v_event.event_id
   ) on conflict(source_row_id,encounter_id,owner_user_id,
                 consent_recorded_at,policy_version) do nothing
   returning id into v_saved;

   if v_saved is null and not exists(
       select 1 from private.nexa_gate_c_consent_evidence_lab ce
       where ce.source_event_id=v_event.event_id
         and ce.source_row_id=v_source.id
         and ce.owner_user_id=p_actor
         and ce.consent_recorded_at=v_source.consent_recorded_at
         and ce.allows_external_ai and ce.allows_audit
   ) then raise exception 'CONSENT_EVENT_CONFLICT'; end if;
   return 'CONSENT_EVIDENCE_RECORDED';
 end if;

 if v_event.event_kind='PHYSICIAN_FINAL_REVIEW_ACK' then
   -- This is a fresh, explicit physician review of a SERVER-SYNCED version.
   -- ready_for_audit/auto-save/client's "reviewed" marker alone are not ACK.
   if v_source.encounter_state<>'ready_for_audit'
      or v_source.sync_version<1
      or v_source.sync_version<>v_event.source_sync_version
      or v_event.canonicalization<>'pg-jsonb-v1'
      or v_event.server_sync_ack is not true
      or v_event.server_audio_complete is not true
      or v_event.server_reconciliation_clear is not true
      or v_event.server_no_post_review_edits is not true
      or jsonb_typeof(v_source.fields) is distinct from 'object'
      or jsonb_typeof(v_source.processing_meta) is distinct from 'object'
      or jsonb_typeof(v_source.protocol_usage) is distinct from 'array'
   then raise exception 'FINAL_REVIEW_EVENT_NOT_SUFFICIENT'; end if;

   v_digest:=private.nexa_gate_c_clinical_digest_lab(
     v_source.fields,v_source.processing_meta,v_source.protocol_usage,
     v_source.consent_recorded_at
   );
   if v_digest is distinct from v_event.source_digest
   then raise exception 'FINAL_REVIEW_VERSION_CONTENT_MISMATCH'; end if;

   if not exists (
     select 1 from private.nexa_gate_c_consent_evidence_lab ce
     where ce.source_row_id=v_source.id
       and ce.encounter_id=v_source.encounter_id
       and ce.owner_user_id=p_actor
       and ce.consent_recorded_at=v_source.consent_recorded_at
       and ce.revoked_at is null
       and ce.allows_external_ai and ce.allows_audit
     for share
   ) then raise exception 'CONSENT_EVIDENCE_MISSING'; end if;

   insert into private.nexa_gate_c_review_evidence_lab(
      source_row_id,encounter_id,owner_user_id,source_sync_version,
      clinical_digest,canonicalization,reviewed_at,acked_by_server,
      reconciliation_pending,unprocessed_audio,post_review_edits,
      evidence_origin,source_event_id
   ) values(
     v_source.id,v_source.encounter_id,p_actor,v_source.sync_version,
     v_digest,'pg-jsonb-v1',v_event.server_recorded_at,true,
     false,false,false,'verified_server_physician_review',v_event.event_id
   ) on conflict(encounter_id,source_sync_version,owner_user_id)
   do nothing returning id into v_saved;

   if v_saved is null and not exists(
     select 1 from private.nexa_gate_c_review_evidence_lab re
     where re.source_event_id=v_event.event_id
       and re.source_row_id=v_source.id
       and re.owner_user_id=p_actor
       and re.source_sync_version=v_source.sync_version
       and re.clinical_digest=v_digest
   ) then raise exception 'FINAL_REVIEW_EVENT_CONFLICT'; end if;
   return 'FINAL_REVIEW_EVIDENCE_RECORDED';
 end if;
 raise exception 'EVENT_KIND_NOT_SUPPORTED';
end;
$$;

-- These are new candidate function ACLs, NOT hosted ACL changes.
revoke all on function public.nexa_gate_c_materialize_verified_evidence_lab(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.nexa_gate_c_materialize_verified_evidence_lab(uuid,uuid)
 to service_role;

commit;
-- No source event producer is installed by this file. The writer fails CLOSED.
-- C01-C10 and real two-connection/reviewer executions remain NOT RUN.
