import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {materializeGateCEvidenceOffline} from './gate-c-evidence-writer-offline.P0-CANDIDATE.mjs';
const fresh=(kind='PHYSICIAN_PATIENT_CONSENT_ATTESTATION')=>{
 const calls=[];
 const f={calls,auth:{getUser:async()=>{calls.push('auth');return{id:'physician-fake-1'}}},
 sourceEvents:{nextVerifiedEvent:async()=>{calls.push('verified-event');return{
   id:'server-event-fake-1',ownerUserId:'physician-fake-1',kind,serverVerified:true}}},
 db:{materializeEvent:async a=>{calls.push('atomic-writer');f.args=a;
   return kind==='PHYSICIAN_PATIENT_CONSENT_ATTESTATION'
    ?'CONSENT_EVIDENCE_RECORDED':'FINAL_REVIEW_EVIDENCE_RECORDED'}}};
 return f;
};
test('no verified event => STOP before SQL writer, never auto-convert consent checkbox',async()=>{
 const f=fresh();f.sourceEvents.nextVerifiedEvent=async()=>null;
 const r=await materializeGateCEvidenceOffline(f);
 assert.equal(r.status,'STOP');assert.equal(r.wroteEvidence,false);
 assert.deepEqual(f.calls,['auth']);
});
test('missing trusted server provider => STOP',async()=>{
 assert.equal((await materializeGateCEvidenceOffline({})).code,
   'TRUSTED_BACKEND_PROVIDERS_MISSING');
});
test('accepted only after 2 server authentication checks and trusted event',async()=>{
 for(const kind of ['PHYSICIAN_PATIENT_CONSENT_ATTESTATION','PHYSICIAN_FINAL_REVIEW_ACK']){
  const f=fresh(kind),r=await materializeGateCEvidenceOffline(f);
  assert.equal(r.status,'RECORDED_LAB');assert.equal(r.wroteEvidence,true);
  assert.equal(r.resetAuthorized,false);
  assert.equal(f.args.p_actor,'physician-fake-1');
  assert.equal(f.args.p_event_id,'server-event-fake-1');
  assert.deepEqual(f.calls,['auth','verified-event','auth','atomic-writer']);
 }
});
test('wrong physician, unsanctioned client event and false verification => STOP',async()=>{
 for(const event of [{id:'event-x',kind:'PHYSICIAN_FINAL_REVIEW_ACK',
     serverVerified:true,ownerUserId:'other-doctor'},
    {id:'event-x',kind:'PHYSICIAN_FINAL_REVIEW_ACK',serverVerified:false,
     ownerUserId:'physician-fake-1'},
    {id:'event-x',kind:'client-checkbox',serverVerified:true,
     ownerUserId:'physician-fake-1'}]){
  const f=fresh();f.sourceEvents.nextVerifiedEvent=async()=>{f.calls.push('verified-event');return event};
  const r=await materializeGateCEvidenceOffline(f);
  assert.equal(r.status,'STOP');assert.equal(f.calls.includes('atomic-writer'),false);
 }
});
test('expired or changed identity before write fails closed',async()=>{
 const f=fresh();let count=0;
 f.auth.getUser=async()=>{f.calls.push('auth');return {id:++count===1?'physician-fake-1':'other-doctor'}};
 const r=await materializeGateCEvidenceOffline(f);
 assert.equal(r.code,'AUTH_CHANGED_BEFORE_WRITE');
 assert.equal(f.calls.includes('atomic-writer'),false);
});
test('SQL error is not proof of successful attestation or reason to retry',async()=>{
 const f=fresh();
 f.db.materializeEvent=async()=>{f.calls.push('atomic-writer');throw Error('SOURCE_VERSION_CHANGED')};
 const r=await materializeGateCEvidenceOffline(f);
 assert.equal(r.code,'WRITER_FAIL_CLOSED');
 assert.equal(f.calls.filter(x=>x==='atomic-writer').length,1);
 assert.equal(r.resetAuthorized,false);
});
test('lab writer SQL blocks client inserts, requires explicit server provenance and owner/version',()=>{
 const sql=readFileSync(join(dirname(fileURLToPath(import.meta.url)),
  'gate-c-evidence-materializer.P0-NOT-APPLIED.sql'),'utf8');
 for(const term of ['revoke all on private.nexa_gate_c_verified_source_events_lab',
   'grant select on private.nexa_gate_c_verified_source_events_lab to service_role',
   'PHYSICIAN_PATIENT_CONSENT_ATTESTATION','PHYSICIAN_FINAL_REVIEW_ACK',
   'physician_explicit_action','consent_precedes_external_processing',
   'server_sync_ack','server_audio_complete','server_reconciliation_clear',
   'source_sync_version<>v_event.source_sync_version',
   'FINAL_REVIEW_VERSION_CONTENT_MISMATCH','CONSENT_EVIDENCE_MISSING',
   'nexa_gate_c_materialize_verified_evidence_lab'])assert.ok(sql.includes(term),term);
 assert.doesNotMatch(sql.split('\n').filter(x=>!x.trimStart().startsWith('--')).join('\n'),
  /security definer/i);
});
