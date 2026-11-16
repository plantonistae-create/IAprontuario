import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync(new URL(
  '../supabase/functions/nexa-audio-archive/retention-issuer.CANDIDATE-NOT-APPLIED.sql',
  import.meta.url),'utf8');

test('issuer SQL is an unapplied candidate with no evidence or approval seeded',()=>{
  assert.match(sql,/REVIEW CANDIDATE ONLY\. NOT APPLIED/);
  assert.equal((sql.match(/^begin;$/gm)||[]).length,1);
  assert.equal((sql.match(/^commit;$/gm)||[]).length,1);
  assert.equal((sql.match(/^as \$\$$/gm)||[]).length,3);
  assert.equal((sql.match(/^\$\$;$/gm)||[]).length,3);
  assert.doesNotMatch(sql,/insert into public\.nexa_audio_retention_(?:approved_policies|evidence_events)/);
});
test('policy and patient authorization are false by default',()=>{
  assert.match(sql,/independently_approved boolean not null default false/);
  assert.match(sql,/verified_by_server boolean not null default false/);
  assert.match(sql,/patient_authorization_verified boolean not null default false/);
  assert.match(sql,/p\.independently_approved and p\.terms_digest=ev\.terms_digest/);
  assert.match(sql,/e\.verified_by_server and e\.patient_authorization_verified/);
});
test('browser cannot write evidence, policy or execute issuance RPC',()=>{
  assert.match(sql,/revoke all on public\.nexa_audio_retention_approved_policies\s+from public,anon,authenticated,service_role;/);
  assert.match(sql,/revoke all on public\.nexa_audio_retention_evidence_events\s+from public,anon,authenticated,service_role;/);
  assert.doesNotMatch(sql,/grant insert on public\.nexa_audio_retention_evidence_events/);
  assert.match(sql,/revoke all on function public\.nexa_audio_issue_retention_grant\(uuid,uuid,uuid\)\s+from public,anon,authenticated;/);
  assert.match(sql,/grant execute on function public\.nexa_audio_issue_retention_grant\(uuid,uuid,uuid\)\s+to service_role;/);
});
test('grant issuance is bound to active physician and owned encounter',()=>{
  assert.match(sql,/p\.access_status='active'/);
  assert.match(sql,/p\.clinical_access is true/);
  assert.match(sql,/c\.encounter_id=p_encounter_id and c\.user_id=p_owner_user_id/);
  assert.match(sql,/e\.attested_by=p_owner_user_id/);
  assert.match(sql,/e\.purpose='clinical_audio_retention'/);
});
test('short-lived grant is never regenerated from an expired or revoked grant',()=>{
  assert.match(sql,/least\(ev\.expires_at,started_at\+interval '15 minutes'\)/);
  assert.match(sql,/g\.revoked_at is not null or/);
  assert.match(sql,/g\.expires_at<=clock_timestamp\(\)/);
  assert.match(sql,/RETENTION_GRANT_REVOKED_OR_EXPIRED/);
});
test('idempotency uses durable unique owner encounter action and event binding',()=>{
  assert.match(sql,/nexa_audio_grants_one_owner_action\s+on public\.nexa_audio_retention_grants\(owner_user_id,encounter_id,issuer_action_id\)/);
  assert.match(sql,/on conflict do nothing;/);
  assert.match(sql,/binding\.attestation_event_id is distinct from ev\.event_id/);
  assert.match(sql,/RETENTION_ISSUER_ACTION_CONFLICT/);
});
test('revocation cannot be silently ignored and event rows are locked',()=>{
  assert.match(sql,/event_kind='authorization_revoked'/);
  assert.match(sql,/r\.target_event_id=ev\.event_id/);
  assert.match(sql,/limit 1 for update;/);
  assert.match(sql,/references public\.nexa_audio_retention_evidence_events\(event_id\)/);
  assert.match(sql,/nexa_audio_one_revocation/);
  assert.match(sql,/RETENTION_ATTESTATION_REVOKED/);
});
test('attestations and policies reject UPDATE DELETE and TRUNCATE',()=>{
  for(const table of ['approved_policies','evidence_events']){
    assert.ok(sql.includes('before update or delete on public.nexa_audio_retention_'+table));
    assert.ok(sql.includes('before truncate on public.nexa_audio_retention_'+table));
  }
  assert.match(sql,/AUDIO_RETENTION_AUTHORITY_IMMUTABLE/);
});
test('issuer never asserts training rights or consumes client rights fields',()=>{
  assert.doesNotMatch(sql,/training_approved|consent_recorded_at\s*=/);
  assert.doesNotMatch(sql,/p_terms_digest|p_consent|p_policy_version|p_patient_authorization/);
  assert.match(sql,/No real patient-consent authority or approved retention policy exists/);
});

const archiveSql=fs.readFileSync(new URL(
  '../supabase/functions/nexa-audio-archive/retention-storage.CANDIDATE-NOT-APPLIED.sql',
  import.meta.url),'utf8');

test('R1 revocation event atomically disables existing grants',()=>{
  assert.match(sql,/create trigger nexa_audio_evidence_revocation_cascade\s+after insert on public\.nexa_audio_retention_evidence_events\s+for each row execute function public\.nexa_audio_revoke_event_grants\(\);/);
  assert.match(sql,/if new\.event_kind <> 'authorization_revoked' then return new; end if;/);
  assert.match(sql,/where e\.event_id=new\.target_event_id\s+and e\.event_kind='authorization_verified'\s+for update;/);
  assert.match(sql,/RETENTION_REVOCATION_SOURCE_MISMATCH/);
  assert.match(sql,/update public\.nexa_audio_retention_grants g\s+set active=false\s+where g\.attestation_event_id=original\.event_id/);
  assert.match(sql,/and g\.owner_user_id=original\.owner_user_id/);
  assert.match(sql,/and g\.encounter_id=original\.encounter_id/);
  assert.match(archiveSql,/if not found or not g\.active or not g\.server_verified or\s+g\.revoked_at is not null/);
  assert.match(archiveSql,/and g\.server_verified and g\.active and g\.revoked_at is null/);
  assert.match(archiveSql,/if old\.active is true and new\.active is false then\s+new\.revoked_at := clock_timestamp\(\);/);
});
test('R1 read and retrieval cannot treat revoked grant as live',()=>{
  assert.match(archiveSql,/select g\.grant_id,g\.owner_user_id,g\.encounter_id,g\.purpose,g\.policy_version,\s+g\.active,g\.server_verified,g\.expires_at,g\.revoked_at/);
  assert.match(archiveSql,/and g\.server_verified and g\.revoked_at is null and g\.expires_at>now\(\)/);
});
test('R2 one grant per attestation, reusable by distinct action IDs',()=>{
  assert.match(sql,/create unique index if not exists nexa_audio_grants_one_attestation\s+on public\.nexa_audio_retention_grants\(\s+owner_user_id,encounter_id,attestation_event_id\s+\) where attestation_event_id is not null;/);
  assert.match(sql,/where x\.owner_user_id=p_owner_user_id\s+and x\.encounter_id=p_encounter_id\s+and x\.attestation_event_id=ev\.event_id for update;/);
  assert.match(sql,/insert into public\.nexa_audio_retention_grants[\s\S]*?on conflict do nothing;/);
  assert.match(sql,/RETENTION_GRANT_REVOKED_OR_EXPIRED/);
  assert.match(sql,/least\(ev\.expires_at,started_at\+interval '15 minutes'\)/);
});
test('R2 per-action binding is durable and cannot be rebound across evidences',()=>{
  assert.match(sql,/create table if not exists public\.nexa_audio_retention_issuer_actions/);
  assert.match(sql,/primary key\(owner_user_id,encounter_id,client_action_id\)/);
  assert.match(sql,/grant select,insert,update on public\.nexa_audio_retention_issuer_actions to service_role/);
  assert.match(sql,/insert into public\.nexa_audio_retention_issuer_actions\(/);
  assert.match(sql,/binding\.attestation_event_id is distinct from ev\.event_id/);
  assert.match(sql,/binding\.grant_id is distinct from g\.grant_id/);
  assert.match(sql,/before update or delete on public\.nexa_audio_retention_issuer_actions/);
  assert.match(sql,/before truncate on public\.nexa_audio_retention_issuer_actions/);
  assert.match(sql,/RETENTION_ISSUER_ACTION_CONFLICT/);
});
test('R1/R2 are review-only, with no patient evidence producer, issuance edge or hosted access',()=>{
  assert.match(sql,/REVIEW CANDIDATE ONLY\. NOT APPLIED/);
  assert.doesNotMatch(sql,/insert into public\.nexa_audio_retention_(?:approved_policies|evidence_events)/);
  assert.doesNotMatch(sql,/grant insert on public\.nexa_audio_retention_evidence_events to authenticated/);
  assert.match(sql,/No real patient-consent authority or approved retention policy exists/);
});
