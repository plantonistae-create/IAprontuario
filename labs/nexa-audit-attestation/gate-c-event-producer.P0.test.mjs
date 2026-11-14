/* New Gate C producer delta ONLY. Synthetic offline harness; NOT PostgreSQL C01-C10. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {produceExplicitGateCEvent} from './gate-c-event-producer.P0-CANDIDATE.mjs';

const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ENCOUNTER='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EVENT='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const HASH='sha256:'+'a'.repeat(64);
const CONSENT='PHYSICIAN_PATIENT_CONSENT_ATTESTATION';
const REVIEW='PHYSICIAN_FINAL_REVIEW_ACK';
function fixture(kind=CONSENT){
 let actor={id:USER},writes=[];
 const request=kind===CONSENT?{
  kind,encounterId:ENCOUNTER,
  confirmation:{patientScopeAttested:true,externalAiAllowed:true,
   auditAllowed:true,policyVersion:'privacy-v1'}
 }:{
  kind,encounterId:ENCOUNTER,expectedVersion:7,displayedDigest:HASH,
  confirmation:{physicianReviewedExactVersion:true}
 };
 const trusted={
  ownerUserId:USER,encounterId:ENCOUNTER,sourceRowId:'synthetic-source',
  clinicalAccessVerified:true,activeSlotVerified:true,
  consentPhaseOpen:true,externalAiAlreadyStarted:false,policyVersion:'privacy-v1',
  syncVersion:7,serverDigest:HASH,digestCanonicalization:'pg-jsonb-v1',
  serverSyncAck:true,readyForAudit:true,audioCompleteVerified:true,
  reconciliationClearVerified:true,noPostReviewEditsVerified:true,
  validConsentEvidenceVerified:true
 };
 const auth={getUser:async()=>actor};
 const source={readVerifiedForActor:async()=>trusted};
 const events={commitVerifiedActionAtomic:async intent=>{
  writes.push(intent);
  return {eventId:EVENT,kind:intent.kind,actorId:intent.actorId,
   encounterId:intent.encounterId,committedByTrustedBackend:true};
 }};
 return {request,trusted,auth,source,events,writes,setActor:x=>actor=x};
}
async function expectStop(f,code){
 const result=await produceExplicitGateCEvent(f);
 assert.equal(result.status,'STOP');assert.equal(result.code,code);
 assert.equal(result.eventRecorded,false);assert.equal(result.resetAuthorized,false);
 assert.equal(f.writes.length,0);
}
test('fail closed without backend adapters',async()=>{
 const r=await produceExplicitGateCEvent({});
 assert.equal(r.code,'TRUSTED_BACKEND_ADAPTER_MISSING');
});
test('consent from explicit physician action, not a checkbox',async()=>{
 const f=fixture();
 const r=await produceExplicitGateCEvent(f);
 assert.equal(r.status,'ADAPTER_RECEIPT_LAB_ONLY');
 assert.equal(r.eventRecorded,false);
 assert.equal(r.durableEventVerified,false);
 assert.equal(r.kind,CONSENT);assert.equal(r.eventId,EVENT);
 assert.equal(r.resetAuthorized,false);assert.equal(f.writes.length,1);
 assert.equal(f.writes[0].enforceBeforeExternalProcessing,true);
 assert.equal(Object.hasOwn(f.writes[0],'serverRecordedAt'),false);
});
test('refuses implicit patient scope',async()=>{
 const f=fixture();f.request.confirmation.patientScopeAttested=false;
 await expectStop(f,'EXPLICIT_CONSENT_REQUIRED');
});
test('refuses missing audit scope',async()=>{
 const f=fixture();f.request.confirmation.auditAllowed=false;
 await expectStop(f,'EXPLICIT_CONSENT_REQUIRED');
});
test('refuses clinical content and client timestamps',async()=>{
 const f=fixture();f.request.fields={name:'synthetic'};
 await expectStop(f,'CLIENT_PAYLOAD_NOT_ALLOWED');
});
test('refuses client reviewed_documentation',async()=>{
 const f=fixture(REVIEW);f.request.reviewed_documentation=true;
 await expectStop(f,'CLIENT_PAYLOAD_NOT_ALLOWED');
});
test('refuses foreign source owner',async()=>{
 const f=fixture();f.trusted.ownerUserId=OTHER;
 await expectStop(f,'OWNER_OR_ACTIVE_SLOT_NOT_VERIFIED');
});
test('refuses inactive slot',async()=>{
 const f=fixture();f.trusted.activeSlotVerified=false;
 await expectStop(f,'OWNER_OR_ACTIVE_SLOT_NOT_VERIFIED');
});
test('refuses consent after external processing began',async()=>{
 const f=fixture();f.trusted.externalAiAlreadyStarted=true;
 await expectStop(f,'CONSENT_TIME_OR_POLICY_NOT_VERIFIED');
});
test('refuses policy mismatch',async()=>{
 const f=fixture();f.trusted.policyVersion='privacy-v2';
 await expectStop(f,'CONSENT_TIME_OR_POLICY_NOT_VERIFIED');
});
test('refuses missing physician review gesture',async()=>{
 const f=fixture(REVIEW);f.request.confirmation.physicianReviewedExactVersion=false;
 await expectStop(f,'EXPLICIT_FINAL_REVIEW_REQUIRED');
});
test('refuses stale sync version',async()=>{
 const f=fixture(REVIEW);f.trusted.syncVersion=8;
 await expectStop(f,'FINAL_REVIEW_VERSION_OR_READINESS_MISMATCH');
});
test('refuses mismatched canonical digest',async()=>{
 const f=fixture(REVIEW);f.trusted.serverDigest='sha256:'+'b'.repeat(64);
 await expectStop(f,'FINAL_REVIEW_VERSION_OR_READINESS_MISMATCH');
});
test('refuses review before server ACK',async()=>{
 const f=fixture(REVIEW);f.trusted.serverSyncAck=false;
 await expectStop(f,'FINAL_REVIEW_VERSION_OR_READINESS_MISMATCH');
});
test('refuses review with pending audio',async()=>{
 const f=fixture(REVIEW);f.trusted.audioCompleteVerified=false;
 await expectStop(f,'FINAL_REVIEW_VERSION_OR_READINESS_MISMATCH');
});
test('refuses review without prior trusted consent evidence',async()=>{
 const f=fixture(REVIEW);f.trusted.validConsentEvidenceVerified=false;
 await expectStop(f,'FINAL_REVIEW_VERSION_OR_READINESS_MISMATCH');
});
test('review candidate forwards only verified expected version/digest',async()=>{
 const f=fixture(REVIEW),r=await produceExplicitGateCEvent(f);
 assert.equal(r.status,'ADAPTER_RECEIPT_LAB_ONLY');
 assert.equal(r.eventRecorded,false);
 assert.equal(r.durableEventVerified,false);
 assert.equal(f.writes.length,1);
 assert.equal(f.writes[0].expectedSyncVersion,7);
 assert.equal(f.writes[0].expectedDigest,HASH);
 assert.equal(f.writes[0].enforceServerAckAndNoPendingEdits,true);
});
test('refuses changed actor between first read and commit',async()=>{
 const f=fixture();let calls=0;
 f.auth.getUser=async()=>({id:++calls===1?USER:OTHER});
 await expectStop(f,'AUTH_CHANGED_BEFORE_COMMIT');
});
test('refuses non-committed receipt',async()=>{
 const f=fixture();f.events.commitVerifiedActionAtomic=async p=>{
  f.writes.push(p);return {eventId:EVENT,kind:CONSENT,actorId:USER,
   encounterId:ENCOUNTER,committedByTrustedBackend:false};
 };
 const r=await produceExplicitGateCEvent(f);
 assert.equal(r.code,'DURABLE_SERVER_COMMIT_NOT_VERIFIED');
});
test('handles event store failure without retry',async()=>{
 const f=fixture();let calls=0;
 f.events.commitVerifiedActionAtomic=async()=>{calls++;throw Error('synthetic');};
 const r=await produceExplicitGateCEvent(f);
 assert.equal(r.code,'EVENT_PRODUCER_FAIL_CLOSED');
 assert.equal(calls,1);
});
