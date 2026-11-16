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
  assert.equal((sql.match(/^as \$\$$/gm)||[]).length,2);
  assert.equal((sql.match(/^\$\$;$/gm)||[]).length,2);
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
  assert.match(sql,/g\.attestation_event_id is distinct from ev\.event_id/);
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
  for(const t of ['policies','events']){
    assert.match(sql,new RegExp('before update or delete on public\\\\.nexa_audio_retention_'+(t==='policies'?'approved_policies':'evidence_events')));
    assert.match(sql,new RegExp('before truncate on public\\\\.nexa_audio_retention_'+(t==='policies'?'approved_policies':'evidence_events')));
  }
  assert.match(sql,/AUDIO_RETENTION_AUTHORITY_IMMUTABLE/);
});
test('issuer never asserts training rights or consumes client rights fields',()=>{
  assert.doesNotMatch(sql,/training_approved|consent_recorded_at\s*=/);
  assert.doesNotMatch(sql,/p_terms_digest|p_consent|p_policy_version|p_patient_authorization/);
  assert.match(sql,/No real patient-consent authority or approved retention policy exists/);
});
