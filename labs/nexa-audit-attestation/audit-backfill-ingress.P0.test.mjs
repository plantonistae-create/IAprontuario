/* P0 audit-backfill LAB tests: synthetic only; no network, DB or clinical handlers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
 HISTORICAL_BACKFILL_ACTIONS as ACTION,
 inspectHistoricalAuditBackfillCandidate as inspect
} from './audit-backfill-ingress.P0-NOT-DEPLOYED.mjs';
const STAFF='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ENCOUNTER='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SOURCE='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CONSENT='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const REVIEW='ffffffff-ffff-4fff-8fff-ffffffffffff';
const DIGEST='sha256:'+'a'.repeat(64);
function fixture(action='run'){
 const state={
  actor:{id:STAFF},
  role:{actorId:STAFF,active:true,isAdmin:true,isReviewer:false},
  row:{sourceRowId:SOURCE,encounterId:ENCOUNTER,ownerUserId:OWNER,
   syncVersion:2,serverDigest:DIGEST,digestCanonicalization:'pg-jsonb-v1',
   effectivePolicyVersion:'policy-v1',ownerRecordVerified:true,
   clinicianAuthorshipVerified:true,noPendingEditsVerified:true,
   sourceLockedVerified:false,fields:{text:'SECRET_NOT_RELEASED'}},
  consent:{kind:'PHYSICIAN_PATIENT_CONSENT_ATTESTATION',
   purpose:'audit_deidentification',eventId:CONSENT,actorId:OWNER,
   sourceRowId:SOURCE,serverCommittedVerified:true,
   explicitPhysicianActionVerified:true,patientScopeAttested:true,
   auditAllowed:true,revoked:false,beforeExternalDispatchVerified:true,
   policyVersion:'policy-v1',payload:'SECRET_EVENT'},
  finalReview:{kind:'PHYSICIAN_FINAL_REVIEW_ACK',
   eventId:REVIEW,actorId:OWNER,sourceRowId:SOURCE,
   serverCommittedVerified:true,explicitPhysicianActionVerified:true,
   afterServerSyncAckVerified:true,noEditsAfterReviewVerified:true,
   sourceSyncVersion:2,canonicalDigest:DIGEST}
 };
 const args={
  backendAction:action==='run'?ACTION.RUN:ACTION.REPORT,
  request:action==='run'?{action:'run',expectedCount:1}:{action:'report'},
  identity:{getUser:async()=>state.actor},
  staff:{requireActiveAuditStaff:async()=>state.role},
  source:{readCandidateBatchForStaff:async()=>[state.row]},
  evidence:{readImmutableEventsForSource:async()=>({
   consent:state.consent,finalReview:state.finalReview
  })}
 };
 return {args,state};
}
function neverAuthorized(result){
 for(const field of ['externalAiAuthorized','auditSubmitAuthorized','adminWriteAuthorized',
  'reportReadAuthorized','clinicalPayloadReleased','gateCVerified',
  'eventDurabilityVerified','resetAuthorized'])
  assert.equal(result[field],false,field);
 assert.ok(!JSON.stringify(result).includes('SECRET_NOT_RELEASED'));
 assert.ok(!JSON.stringify(result).includes('SECRET_EVENT'));
}
test('report is a separate read-only candidate, never an inventory grant or AI route',async()=>{
 const {args}=fixture('report');
 args.source={readCandidateBatchForStaff:async()=>{throw Error('SHOULD_NOT_RUN')}};
 args.evidence={readImmutableEventsForSource:async()=>{throw Error('SHOULD_NOT_RUN')}};
 const r=await inspect(args);
 assert.equal(r.status,'REPORT_READ_ONLY_CANDIDATE_ONLY');
 neverAuthorized(r);
});
test('unknown route, staff unavailable or inactive fail closed for report and run',async()=>{
 for(const action of ['report','run']){
  for(const change of ['no_actor','inactive','no_role']){
   const {args,state}=fixture(action);
   if(change==='no_actor')state.actor={id:''};
   if(change==='inactive')state.role.active=false;
   if(change==='no_role'){state.role.isAdmin=false;state.role.isReviewer=false}
   const r=await inspect(args);
   assert.equal(r.status,'STOP');neverAuthorized(r);
  }
 }
 const {args}=fixture('run');args.backendAction='audit-backfill.other';
 assert.equal((await inspect(args)).code,'BACKFILL_ROUTE_UNKNOWN');
});
test('legacy confirmed=true, client clinical fields, artificial consent and custom actor are never authority',async()=>{
 for(const extraneous of [
  {confirmed:true},{limit:25},{fields:{hda:'spoof'}},{core_context:{}},
  {actorId:OWNER},{consent_recorded_at:'2026-11-13'},
  {consent:true},{tenantId:'institutional'}, {reviewed_documentation:true}
 ]){
  const {args}=fixture();args.request={...args.request,...extraneous};
  const r=await inspect(args);
  assert.equal(r.code,'BACKFILL_CLIENT_CLAIMS_OR_CONFIRMATION_FORBIDDEN');neverAuthorized(r);
 }
});
test('run is denied without server-owned source or immutable-event adapters',async()=>{
 for(const key of ['source','evidence']){
  const {args}=fixture();delete args[key];
  const r=await inspect(args);
  assert.equal(r.code,'BACKFILL_TRUSTED_SOURCE_AND_EVENT_ADAPTERS_MISSING');neverAuthorized(r);
 }
});
test('zero, excessive and inconsistent bulk sizes fail closed',async()=>{
 for(const count of [0,26,1.25]){
  const {args}=fixture();args.request.expectedCount=count;
  const r=await inspect(args);assert.equal(r.status,'STOP');neverAuthorized(r);
 }
 const {args}=fixture();args.request.expectedCount=2;
 const r=await inspect(args);assert.equal(r.code,'BACKFILL_BATCH_SCOPE_NOT_VERIFIED');
});
test('no source, mismatch or untrusted source content cannot be considered attested',async()=>{
 for(const change of [
  null,{ownerUserId:''},{ownerRecordVerified:false},
  {clinicianAuthorshipVerified:false},{sourceLockedVerified:true},
  {syncVersion:0},{serverDigest:'sha256:0'},
  {noPendingEditsVerified:false},{digestCanonicalization:'browser-json'}
 ]){
  const {args,state}=fixture();state.row=change===null?null:{...state.row,...change};
  const r=await inspect(args);
  assert.equal(r.code,'BACKFILL_SOURCE_VERSION_AND_DIGEST_NOT_VERIFIED');
  neverAuthorized(r);
 }
});
test('missing, wrong-purpose, revoked, impersonated or retrospective consent STOP',async()=>{
 for(const change of [
  null,{purpose:'realtime_audio'},{actorId:STAFF},{sourceRowId:ENCOUNTER},
  {auditAllowed:false},{revoked:true},{beforeExternalDispatchVerified:false},
  {policyVersion:'stale'},{serverCommittedVerified:false},
  {explicitPhysicianActionVerified:false},{patientScopeAttested:false}
 ]){
  const {args,state}=fixture();state.consent=change===null?null:{...state.consent,...change};
  const r=await inspect(args);
  assert.ok(['BACKFILL_IMMUTABLE_EVENTS_NOT_VERIFIED',
   'BACKFILL_EXPLICIT_PURPOSE_CONSENT_NOT_VERIFIED'].includes(r.code),r.code);
  neverAuthorized(r);
 }
});
test('absence of author physician ACK, stale version, digest or reviewer impersonation STOP',async()=>{
 for(const change of [
  null,{actorId:STAFF},{sourceRowId:ENCOUNTER},{sourceSyncVersion:3},
  {canonicalDigest:'sha256:'+'b'.repeat(64)},{afterServerSyncAckVerified:false},
  {noEditsAfterReviewVerified:false},{serverCommittedVerified:false}
 ]){
  const {args,state}=fixture();
  state.finalReview=change===null?null:{...state.finalReview,...change};
  const r=await inspect(args);
  assert.ok(['BACKFILL_IMMUTABLE_EVENTS_NOT_VERIFIED',
   'BACKFILL_FINAL_PHYSICIAN_ACK_NOT_VERIFIED'].includes(r.code),r.code);
  neverAuthorized(r);
 }
});
test('all positive MOCKS return candidate only, not AI, report or privileged write authorization',async()=>{
 const {args}=fixture();const r=await inspect(args);
 assert.equal(r.status,'BACKFILL_RUN_PREFLIGHT_CANDIDATE_ONLY');
 assert.equal(r.code,'GATE_C_TRANSACTIONAL_BACKFILL_ADMISSION_NOT_PROVEN');
 neverAuthorized(r);
});
test('actor change and provider adapter errors always fail closed',async()=>{
 const {args}=fixture();let i=0;args.identity.getUser=async()=>({id:++i===1?STAFF:OWNER});
 let r=await inspect(args);assert.equal(r.code,'BACKFILL_ACTOR_CHANGED');neverAuthorized(r);
 const f=fixture();f.args.evidence.readImmutableEventsForSource=async()=>{throw Error('UNAVAILABLE')};
 r=await inspect(f.args);assert.equal(r.code,'BACKFILL_PREFLIGHT_FAIL_CLOSED');neverAuthorized(r);
});
