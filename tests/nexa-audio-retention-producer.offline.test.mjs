import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync(new URL(
  '../supabase/functions/nexa-audio-archive/retention-producer.CANDIDATE-NOT-APPLIED.sql',
  import.meta.url),'utf8');
const issuer=fs.readFileSync(new URL(
  '../supabase/functions/nexa-audio-archive/retention-issuer.CANDIDATE-NOT-APPLIED.sql',
  import.meta.url),'utf8');
const archive=fs.readFileSync(new URL(
  '../supabase/functions/nexa-audio-archive/retention-storage.CANDIDATE-NOT-APPLIED.sql',
  import.meta.url),'utf8');

test('R3 proposal cannot reach hosted Supabase and creates no approval or consent',()=>{
  assert.match(sql,/NEVER APPLY TO HOSTED/);
  assert.match(sql,/No authorized retention term, patient evidence source/);
  assert.doesNotMatch(sql,/insert into public\.nexa_audio_retention_approved_policies/);
  assert.doesNotMatch(sql,/values\s*\(\s*'authorization_verified'/);
  assert.equal((sql.match(/^begin;$/gm)||[]).length,1);
  assert.equal((sql.match(/^commit;$/gm)||[]).length,1);
});
test('two disjoint NOLOGIN non-inheriting writers and private schema',()=>{
  assert.match(sql,/create role nexa_audio_policy_writer nologin noinherit/);
  assert.match(sql,/create role nexa_audio_evidence_writer nologin noinherit/);
  assert.match(sql,/create schema if not exists nexa_audio_producer/);
  assert.match(sql,/revoke all on schema nexa_audio_producer\s+from public, anon, authenticated, service_role/);
  assert.doesNotMatch(sql,/grant .*nexa_audio_policy_writer\s+to\s+nexa_audio_evidence_writer/i);
  assert.match(sql,/revoke create on schema nexa_audio_producer\s+from nexa_audio_policy_writer,nexa_audio_evidence_writer/);
});
test('policy approver and patient authorization producer remain hard denied',()=>{
  assert.match(sql,/create or replace function nexa_audio_producer\.approve_retention_policy/);
  assert.match(sql,/AUDIO_POLICY_APPROVAL_AUTHORITY_MISSING/);
  assert.match(sql,/create or replace function nexa_audio_producer\.record_patient_authorization/);
  assert.match(sql,/CONSENT_ISSUER_AUTHORITY_MISSING/);
  assert.doesNotMatch(sql,/grant insert on public\.nexa_audio_retention_approved_policies/);
  assert.doesNotMatch(sql,/grant .*insert.*on public\.nexa_audio_retention_evidence_events\s+to service_role/);
});
test('every SECURITY DEFINER function pins search path and a NOLOGIN owner',()=>{
  assert.equal((sql.match(/language plpgsql(?: volatile)? security definer set search_path=''/g)||[]).length,3);
  assert.equal((sql.match(/^as \$\$$/gm)||[]).length,3);
  assert.equal((sql.match(/^\$\$;$/gm)||[]).length,3);
  assert.match(sql,/approve_retention_policy\(text,text,text\)\s+owner to nexa_audio_policy_writer/);
  assert.match(sql,/record_patient_authorization\(uuid,text,text\)\s+owner to nexa_audio_evidence_writer/);
  assert.match(sql,/request_owner_revocation\(uuid\)\s+owner to nexa_audio_evidence_writer/);
});
test('runtime app roles receive zero EXECUTE on producer functions',()=>{
  assert.equal((sql.match(/revoke all on function\s+nexa_audio_producer\./g)||[]).length,3);
  assert.equal((sql.match(/from public,anon,authenticated,service_role;/g)||[]).length>=3,true);
  assert.doesNotMatch(sql,/grant execute on function/);
});
test('revocation event producer is constrained to revoke-only RLS',()=>{
  assert.match(sql,/grant select,insert on public\.nexa_audio_retention_evidence_events\s+to nexa_audio_evidence_writer/);
  assert.match(sql,/event_kind='authorization_revoked'\s+and target_event_id is not null/);
  assert.match(sql,/and owner_user_id=\(select auth\.uid\(\)\)/);
  assert.match(sql,/and attested_by=\(select auth\.uid\(\)\)/);
  assert.match(sql,/and verified_by_server=false\s+and patient_authorization_verified=false/);
  assert.doesNotMatch(sql,/grant (?:select,)?insert on public\.nexa_audio_retention_evidence_events\s+to authenticated/);
});
test('revocation cannot be a forged doctor or cross-owner encounter',()=>{
  assert.match(sql,/actor_id := auth\.uid\(\)/);
  assert.match(sql,/REVOCATION_ACTOR_UNVERIFIED/);
  assert.match(sql,/e\.owner_user_id=actor_id/);
  assert.match(sql,/c\.encounter_id=original\.encounter_id and c\.user_id=actor_id/);
  assert.match(sql,/REVOCATION_SOURCE_NOT_OWNED/);
  assert.doesNotMatch(sql,/p_actor_user_id|p_owner_user_id/);
});
test('revocation event copies its source, never upgrades consent validity',()=>{
  assert.match(sql,/'authorization_revoked',original\.event_id,actor_id,original\.encounter_id/);
  assert.match(sql,/original\.policy_version,original\.terms_digest/);
  assert.match(sql,/original\.evidence_digest/);
  assert.match(sql,/'immutable_server_retention_ledger_v1',false,false,null,null/);
  assert.match(sql,/on conflict \(target_event_id\)\s+where event_kind='authorization_revoked' do nothing/);
  assert.match(sql,/REVOCATION_COMMIT_NOT_VERIFIED/);
});
test('existing issuer R1/R2 and storage remain authoritative for grant invalidation',()=>{
  assert.match(issuer,/create trigger nexa_audio_evidence_revocation_cascade\s+after insert on public\.nexa_audio_retention_evidence_events/);
  assert.match(issuer,/update public\.nexa_audio_retention_grants g\s+set active=false/);
  assert.match(issuer,/nexa_audio_grants_one_attestation/);
  assert.match(archive,/if not found or not g\.active or not g\.server_verified/);
  assert.match(archive,/and g\.server_verified and g\.active and g\.revoked_at is null/);
});
test('no actor or live grant issuer route is secretly enabled',()=>{
  assert.doesNotMatch(sql,/grant execute on function.*to (?:authenticated|service_role)/);
  assert.doesNotMatch(sql,/nexa_audio_issue_retention_grant\s*\(/);
  assert.doesNotMatch(sql,/service_role.*(?:insert|all) on public\.nexa_audio_retention_approved_policies/);
  assert.match(sql,/No approved retention term, patient evidence source|No authorized retention term, patient evidence source/);
});
