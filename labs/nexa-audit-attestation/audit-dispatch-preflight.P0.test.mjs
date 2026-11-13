/* NEXA P0: synthetic audit dispatch preflight, NOT a PostgreSQL gate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAuditDispatchCandidate} from './audit-dispatch-preflight.P0-NOT-DEPLOYED.mjs';

const ACTOR='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TENANT='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SOURCE='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const HASH='sha256:'+'c'.repeat(64);
const CONSENT='PHYSICIAN_PATIENT_CONSENT_ATTESTATION';
const REVIEW='PHYSICIAN_FINAL_REVIEW_ACK';
const clone=x=>structuredClone(x);
function fixture(){
 const state={checks:[],commits:0},actor={id:ACTOR,tenantId:TENANT};
 const row={
  ownerUserId:ACTOR,encounterId:SOURCE,sourceRowId:'synthetic-row',
  tenantId:TENANT,tenantMembershipVerified:true,clinicalAccessVerified:true,
  activeSlotVerified:true,encounterState:'ready_for_audit',
  snapshotVersion:3,syncVersion:9,serverDigest:HASH,
  digestCanonicalization:'pg-jsonb-v1',serverSyncAck:true,
  audioCompleteVerified:true,reconciliationClearVerified:true,
  noPendingEditsVerified:true,sourceLockedVerified:false,
  effectivePolicyVersion:'patient-policy-v1'
 };
 const events={
  consent:{kind:CONSENT,serverCommittedVerified:true,actorId:ACTOR,
   tenantId:TENANT,sourceRowId:'synthetic-row',
   explicitPhysicianActionVerified:true,patientScopeAttested:true,
   externalAiAllowed:true,auditAllowed:true,beforeAnyExternalAiVerified:true,
   serverRecordedAt:'2026-11-13T19:00:00Z',policyVersion:'patient-policy-v1'},
  finalReview:{kind:REVIEW,serverCommittedVerified:true,actorId:ACTOR,
   tenantId:TENANT,sourceRowId:'synthetic-row',
   explicitPhysicianActionVerified:true,afterServerSyncAckVerified:true,
   noEditsAfterReviewVerified:true,sourceVersion:9,snapshotVersion:3,
   canonicalDigest:HASH,serverRecordedAt:'2026-11-13T19:05:00Z'}
 };
 const request={encounterId:SOURCE,snapshotVersion:3};
 const identity={getUser:async()=>{state.checks.push('auth');return clone(actor)}};
 const source={loadVerifiedForActor:async p=>{
  state.checks.push('source');assert.equal(p.actorId,ACTOR);
  return row===null?null:clone(row);
 }};
 const evidence={readImmutableEventsForSource:async p=>{
  state.checks.push('evidence');assert.equal(p.actorId,ACTOR);
  return clone(events);
 }};
 return{request,actor,row,events,identity,source,evidence,state};
}
async function run(f){return inspectAuditDispatchCandidate(f)}
async function reject(f,code){
 const r=await run(f);assert.equal(r.status,'STOP');
 assert.equal(r.code,code);
 assert.equal(r.auditSubmitAuthorized,false);
 assert.equal(r.externalAiAuthorized,false);
 assert.equal(r.adminWriteAuthorized,false);
 assert.equal(r.gateCVerified,false);
 assert.equal(r.resetAuthorized,false);
 assert.equal(f.state.commits,0);
}
test('requires all server-side adapters',async()=>{
 const r=await run({request:{encounterId:SOURCE,snapshotVersion:3}});
 assert.equal(r.code,'TRUSTED_BACKEND_PROVIDERS_MISSING');
});
test('rejects source null without falling back to client fields',async()=>{
 const f=fixture();f.source.loadVerifiedForActor=async()=>null;
 f.request.fields={hda:'synthetic, client asserted'};
 await reject(f,'CLIENT_AUDIT_PAYLOAD_FORBIDDEN');
 delete f.request.fields;
 await reject(f,'SOURCE_OWNERSHIP_NOT_VERIFIED');
 assert.equal(f.state.checks.includes('evidence'),false);
});
test('rejects extra client claims even if they appear to prove consent',async()=>{
 const f=fixture();f.request.reviewed_documentation=true;
 await reject(f,'CLIENT_AUDIT_PAYLOAD_FORBIDDEN');
});
test('rejects unauthenticated actor',async()=>{
 const f=fixture();f.identity.getUser=async()=>null;
 await reject(f,'ACTOR_NOT_AUTHENTICATED');
});
test('rejects spoofed source owner before fetching events',async()=>{
 const f=fixture();f.row.ownerUserId=OTHER;
 await reject(f,'SOURCE_OWNERSHIP_NOT_VERIFIED');
 assert.equal(f.state.checks.includes('evidence'),false);
});
test('rejects unverified active clinical slot',async()=>{
 const f=fixture();f.row.activeSlotVerified=false;
 await reject(f,'SOURCE_OWNERSHIP_NOT_VERIFIED');
});
test('requires institutional tenant; current hosted mapping remains unavailable',async()=>{
 const f=fixture();delete f.row.tenantId;
 await reject(f,'TENANT_AUTHORITY_NOT_VERIFIED');
});
test('rejects mismatched tenant membership',async()=>{
 const f=fixture();f.actor.tenantId=OTHER;
 await reject(f,'TENANT_AUTHORITY_NOT_VERIFIED');
});
test('rejects not-ready source and unverified server sync',async()=>{
 const f=fixture();f.row.encounterState='draft';
 await reject(f,'SOURCE_READY_VERSION_DIGEST_NOT_VERIFIED');
 const g=fixture();g.row.serverSyncAck=false;
 await reject(g,'SOURCE_READY_VERSION_DIGEST_NOT_VERIFIED');
});
test('rejects changed expected snapshot version',async()=>{
 const f=fixture();f.request.snapshotVersion=4;
 await reject(f,'SOURCE_READY_VERSION_DIGEST_NOT_VERIFIED');
});
test('rejects stale or unverifiable source digest',async()=>{
 const f=fixture();f.row.serverDigest='bad-client-hash';
 await reject(f,'SOURCE_READY_VERSION_DIGEST_NOT_VERIFIED');
});
test('rejects missing durable consent',async()=>{
 const f=fixture();f.events.consent=null;
 await reject(f,'EXPLICIT_CONSENT_EVIDENCE_NOT_VERIFIED');
});
test('rejects consent recorded after model processing began',async()=>{
 const f=fixture();f.events.consent.beforeAnyExternalAiVerified=false;
 await reject(f,'EXPLICIT_CONSENT_EVIDENCE_NOT_VERIFIED');
});
test('rejects consent originating from another tenant',async()=>{
 const f=fixture();f.events.consent.tenantId=OTHER;
 await reject(f,'EXPLICIT_CONSENT_EVIDENCE_NOT_VERIFIED');
});
test('rejects review without version-bound server ACK',async()=>{
 const f=fixture();f.events.finalReview.afterServerSyncAckVerified=false;
 await reject(f,'FINAL_PHYSICIAN_ACK_NOT_VERIFIED');
});
test('rejects post-review edit and digest mismatch',async()=>{
 const f=fixture();f.events.finalReview.noEditsAfterReviewVerified=false;
 await reject(f,'FINAL_PHYSICIAN_ACK_NOT_VERIFIED');
 const g=fixture();g.events.finalReview.canonicalDigest='sha256:'+'a'.repeat(64);
 await reject(g,'FINAL_PHYSICIAN_ACK_NOT_VERIFIED');
});
test('rejects same encounter with stale review source version',async()=>{
 const f=fixture();f.events.finalReview.sourceVersion=8;
 await reject(f,'FINAL_PHYSICIAN_ACK_NOT_VERIFIED');
});
test('rejects actor change between source evidence and return',async()=>{
 const f=fixture();let count=0;
 f.identity.getUser=async()=>++count===1?clone(f.actor):{id:OTHER,tenantId:TENANT};
 await reject(f,'ACTOR_OR_TENANT_CHANGED');
});
test('fail closed on server adapter exception',async()=>{
 const f=fixture();f.evidence.readImmutableEventsForSource=async()=>{throw Error('LAB_ONLY')};
 await reject(f,'AUDIT_PREFLIGHT_FAIL_CLOSED');
});
test('even all synthetic server assertions never authorize posting, AI or admin write',async()=>{
 const f=fixture();const r=await run(f);
 assert.equal(r.status,'PREFLIGHT_CANDIDATE_ONLY');
 assert.equal(r.code,'TRANSACTIONAL_GATE_C_REQUIRED');
 assert.equal(r.auditSubmitAuthorized,false);
 assert.equal(r.externalAiAuthorized,false);
 assert.equal(r.adminWriteAuthorized,false);
 assert.equal(r.gateCVerified,false);
 assert.equal(r.resetAuthorized,false);
 assert.equal(f.state.commits,0);
 assert.deepEqual(f.state.checks,['auth','source','evidence','auth']);
});
