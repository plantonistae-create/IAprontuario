/* NEXA P0, isolated pure negative contract tests; NO live backend or network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
 PROVIDER_GATE_ROUTES,inspectExternalAiAdmissionCandidate
} from './external-ai-admission.P0-NOT-DEPLOYED.mjs';

const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENC='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SOURCE='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const EVENT='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const deny=x=>{
 assert.equal(x.externalAiAuthorized,false);
 assert.equal(x.auditSubmitAuthorized,false);
 assert.equal(x.adminWriteAuthorized,false);
 assert.equal(x.clinicalPayloadReleased,false);
 assert.equal(x.gateCVerified,false);
 assert.equal(x.eventDurabilityVerified,false);
 assert.equal(x.resetAuthorized,false);
};
function fixture(route='realtime-call.webrtc',configuredProvider='openai'){
 const purpose=PROVIDER_GATE_ROUTES[route]?.purpose||'realtime_audio';
 const state={
  user:{id:USER},
  row:{
   ownerUserId:USER,encounterId:ENC,sourceRowId:SOURCE,syncVersion:1,
   clinicalAccessVerified:true,activeSlotVerified:true,effectivePolicyVersion:'policy-v1',
   finalPhysicianAckVerified:true,exactDigestAndVersionVerified:true,
   transactionalAuditAdmissionVerified:true,
   fields:{chiefComplaint:'SYNTHETIC_SECRET_NOT_RELEASED'}
  },
  event:{
   eventId:EVENT,purpose,actorId:USER,encounterId:ENC,sourceRowId:SOURCE,
   sourceSyncVersion:1,provider:configuredProvider,policyVersion:'policy-v1',
   serverCommittedVerified:true,explicitActionVerified:true,
   scopeValidatedVerified:true,revoked:false,
   serverSequenceBeforeExternalDispatchVerified:true,
   payload:'SYNTHETIC_CONSENT_NOT_RELEASED'
  }
 };
 const args={
  route,configuredProvider,request:{encounterId:ENC},
  identity:{getUser:async()=>state.user},
  source:{readOwnerScopedForActor:async()=>state.row},
  consent:{readLatestPurposeEvent:async()=>state.event}
 };
 return {args,state};
}
test('seven distinct ingress routes and provider options never authorize even with perfect mocks',async()=>{
 assert.equal(Object.keys(PROVIDER_GATE_ROUTES).length,7);
 for(const [route,policy] of Object.entries(PROVIDER_GATE_ROUTES)){
  for(const configuredProvider of policy.providers){
   const {args}=fixture(route,configuredProvider);
   const out=await inspectExternalAiAdmissionCandidate(args);
   assert.equal(out.status,'ADMISSION_PREFLIGHT_CANDIDATE_ONLY',route);
   assert.equal(out.purpose,policy.purpose,route);
   deny(out);
   assert.equal(JSON.stringify(out).includes('SYNTHETIC_SECRET'),false);
   assert.equal(JSON.stringify(out).includes('SYNTHETIC_CONSENT'),false);
  }
 }
});
test('browser consent, timestamp, boolean and clinical context are forbidden as request claims',async()=>{
 for(const extra of [
  {consent_recorded_at:'2026-11-13'},
  {externalAiAllowed:true},
  {reviewed_documentation:true},
  {fields:{hda:'FORGED'}},
  {core_context:{learning_layers:{physician_final:'FORGED'}}},
  {purpose:'audit_deidentification'},
  {provider:'openai'},
  {actorId:USER},
  {sourceSyncVersion:1}
 ]){
  const {args}=fixture();args.request={...args.request,...extra};
  const out=await inspectExternalAiAdmissionCandidate(args);
  assert.equal(out.code,'CLIENT_REQUEST_MUST_BE_ROUTING_ONLY');deny(out);
 }
});
test('missing source/owner/slot or source version cannot pass pre-provider inspection',async()=>{
 for(const changes of [null,{ownerUserId:OTHER},{activeSlotVerified:false},
  {clinicalAccessVerified:false},{syncVersion:0}]){
  const {args,state}=fixture();
  state.row=changes===null?null:{...state.row,...changes};
  const out=await inspectExternalAiAdmissionCandidate(args);
  assert.equal(out.code,'SOURCE_OWNER_ACTIVE_SLOT_NOT_VERIFIED');deny(out);
 }
});
test('purpose/provider mismatches and unknown backend route STOP',async()=>{
 for(const [route,provider] of [
  ['process-consultation.json','gemini'],
  ['consultation-speakers','nexa-core'],
  ['bad-client-route','openai']
 ]){
  const {args}=fixture(route,provider);
  const out=await inspectExternalAiAdmissionCandidate(args);
  assert.ok(out.status==='STOP');deny(out);
 }
});
test('consent for realtime audio cannot authorize Radar, diarization or audit',async()=>{
 for(const route of ['realtime-radar','consultation-speakers','submit-audit-case']){
  const {args,state}=fixture(route);state.event.purpose='realtime_audio';
  const out=await inspectExternalAiAdmissionCandidate(args);
  assert.equal(out.code,'PURPOSE_SPECIFIC_DURABLE_CONSENT_NOT_VERIFIED');deny(out);
 }
});
test('revocation, stale version, wrong physician or event from another consultation STOP',async()=>{
 for(const changes of [
  {revoked:true},{sourceSyncVersion:99},{actorId:OTHER},
  {encounterId:OTHER},{sourceRowId:OTHER},{policyVersion:'expired-policy'},
  {serverCommittedVerified:false},{serverSequenceBeforeExternalDispatchVerified:false},
  {scopeValidatedVerified:false}
 ]){
  const {args,state}=fixture();Object.assign(state.event,changes);
  const out=await inspectExternalAiAdmissionCandidate(args);
  assert.equal(out.code,'PURPOSE_SPECIFIC_DURABLE_CONSENT_NOT_VERIFIED');deny(out);
 }
});
test('audit still requires separate final physician ACK and transaction after consent',async()=>{
 for(const field of [
  'finalPhysicianAckVerified','exactDigestAndVersionVerified',
  'transactionalAuditAdmissionVerified'
 ]){
  const {args,state}=fixture('submit-audit-case');state.row[field]=false;
  const out=await inspectExternalAiAdmissionCandidate(args);
  assert.equal(out.code,'AUDIT_FINAL_ACK_AND_TRANSACTION_REQUIRED');deny(out);
 }
});
test('actor changed between preflight reads STOP',async()=>{
 const {args}=fixture();let n=0;
 args.identity={getUser:async()=>({id:++n===1?USER:OTHER})};
 const out=await inspectExternalAiAdmissionCandidate(args);
 assert.equal(out.code,'ACTOR_CHANGED_BEFORE_EXTERNAL_DISPATCH');deny(out);
});
test('adapter throws and fabricated tenant claim fail closed',async()=>{
 const {args}=fixture();args.consent.readLatestPurposeEvent=async()=>{
  throw Error('DB_UNAVAILABLE');
 };
 let out=await inspectExternalAiAdmissionCandidate(args);
 assert.equal(out.code,'PRE_PROVIDER_ADMISSION_FAIL_CLOSED');deny(out);
 const {args:a,state}=fixture();state.user.tenantId='CLIENT_TENANT';
 out=await inspectExternalAiAdmissionCandidate(a);
 assert.equal(out.code,'UNSUPPORTED_INSTITUTIONAL_TENANT_CLAIM');deny(out);
});
test('pre-recording event requires existing bound encounter; no global yes checkbox can bypass',async()=>{
 const {args}=fixture();args.request={};
 const out=await inspectExternalAiAdmissionCandidate(args);
 assert.equal(out.code,'CLIENT_REQUEST_MUST_BE_ROUTING_ONLY');deny(out);
 const {args:missing}=fixture();missing.source.readOwnerScopedForActor=async()=>null;
 const out2=await inspectExternalAiAdmissionCandidate(missing);
 assert.equal(out2.code,'SOURCE_OWNER_ACTIVE_SLOT_NOT_VERIFIED');deny(out2);
});


/*
 * Owner-bound encounter bootstrap: separate prerequisite of pre-provider
 * admission. All adapters below are synthetic. A passing mock cannot prove
 * server persistence, auth revocation, consent, locks or deployed safety.
 */
import {inspectPersistedEncounterBootstrapCandidate} from './external-ai-admission.P0-NOT-DEPLOYED.mjs';

function bootstrapFixture(route='realtime-call.webrtc'){
 const state={
  user:{id:USER},
  row:{
   sourceRowId:SOURCE,encounterId:ENC,ownerUserId:USER,
   syncVersion:1,clinicalAccessVerified:true,activeSlotVerified:true,
   serverPersistedVerified:true,serverSyncAckVerified:true,
   ownerBindingVerified:true,serverRowUniquenessVerified:true,
   noPendingLocalEditsVerified:true,sourceLockedVerified:false,
   externalSessionAlreadyStartedVerified:false,
   fields:{hda:'SYNTHETIC_CLINICAL_TEXT_NOT_RELEASED'}
  }
 };
 const args={
  route,request:{encounterId:ENC},
  identity:{getUser:async()=>state.user},
  source:{readOwnerScopedForActor:async()=>state.row}
 };
 return{state,args};
}
test('bootstrap: favorable synthetic source for all realtime routes is NEVER admission',async()=>{
 for(const route of ['realtime-call.webrtc','realtime-call.chunk','realtime-radar']){
  const {args}=bootstrapFixture(route);
  const out=await inspectPersistedEncounterBootstrapCandidate(args);
  assert.equal(out.status,'PERSISTED_ENCOUNTER_BOOTSTRAP_CANDIDATE_ONLY');
  assert.equal(out.code,'TRUSTED_SOURCE_CONSENT_AND_LIVE_REVOCATION_NOT_PROVEN');
  assert.equal(out.route,route);deny(out);
  assert.equal(JSON.stringify(out).includes('SYNTHETIC_CLINICAL_TEXT'),false);
  assert.equal(JSON.stringify(out).includes(ENC),false);
 }
});
test('bootstrap: unknown backend routes and client-supplied authority are STOP',async()=>{
 const {args}=bootstrapFixture('submit-audit-case');
 let out=await inspectPersistedEncounterBootstrapCandidate(args);
 assert.equal(out.code,'BOOTSTRAP_BACKEND_ROUTE_NOT_SUPPORTED');deny(out);
 const claims=[
  {fields:{hda:'FORGED'}},{sourceRowId:SOURCE},{actorId:USER},
  {tenantId:'claim'},{consent_recorded_at:'fake'},{policyVersion:'p'},
  {provider:'openai'},{consent:true},{ack:true},{syncVersion:1},
  {retryId:'from-client'}
 ];
 for(const extra of claims){
  const {args}=bootstrapFixture();args.request={encounterId:ENC,...extra};
  out=await inspectPersistedEncounterBootstrapCandidate(args);
  assert.equal(out.code,'BOOTSTRAP_REQUEST_ROUTING_ONLY_REQUIRED');deny(out);
 }
 for(const invalid of [{},{encounterId:'not-a-uuid'},{encounterId:null},null]){
  const {args}=bootstrapFixture();args.request=invalid;
  out=await inspectPersistedEncounterBootstrapCandidate(args);
  assert.equal(out.code,'BOOTSTRAP_REQUEST_ROUTING_ONLY_REQUIRED');deny(out);
 }
});
test('bootstrap: unauthenticated actor or changed account denies',async()=>{
 const {args,state}=bootstrapFixture();state.user=null;
 let out=await inspectPersistedEncounterBootstrapCandidate(args);
 assert.equal(out.code,'BOOTSTRAP_ACTOR_NOT_AUTHENTICATED');deny(out);
 const {args:switched}=bootstrapFixture();let n=0;
 switched.identity.getUser=async()=>({id:++n===1?USER:OTHER});
 out=await inspectPersistedEncounterBootstrapCandidate(switched);
 assert.equal(out.code,'BOOTSTRAP_ACTOR_CHANGED_BEFORE_EGRESS');deny(out);
});
test('bootstrap: absent, wrong-owner, collided, or versionless server source STOP',async()=>{
 for(const change of [null,{ownerUserId:OTHER},{encounterId:OTHER},
   {sourceRowId:'unverified'},{syncVersion:0},
   {activeSlotVerified:false},{clinicalAccessVerified:false}]){
  const {args,state}=bootstrapFixture();
  state.row=change===null?null:{...state.row,...change};
  const out=await inspectPersistedEncounterBootstrapCandidate(args);
  assert.equal(out.code,'BOOTSTRAP_OWNER_OR_SOURCE_VERSION_NOT_VERIFIED');deny(out);
 }
});
test('bootstrap: IndexedDB draft, missing sync ACK, stale edits, collision, lock or existing session STOP',async()=>{
 for(const changes of [
  {serverPersistedVerified:false},{serverPersistedVerified:undefined},
  {serverSyncAckVerified:false},{ownerBindingVerified:false},
  {serverRowUniquenessVerified:false},{noPendingLocalEditsVerified:false},
  {sourceLockedVerified:true},{externalSessionAlreadyStartedVerified:true},
  {externalSessionAlreadyStartedVerified:undefined}
 ]){
  const {args,state}=bootstrapFixture();Object.assign(state.row,changes);
  const out=await inspectPersistedEncounterBootstrapCandidate(args);
  assert.equal(out.code,'BOOTSTRAP_DURABLE_SOURCE_ACK_NOT_VERIFIED');deny(out);
 }
});
test('bootstrap: tenant assertions in actor or source never establish scope',async()=>{
 const {args,state}=bootstrapFixture();state.user.tenantId='unproven';
 let out=await inspectPersistedEncounterBootstrapCandidate(args);
 assert.equal(out.code,'UNSUPPORTED_INSTITUTIONAL_TENANT_CLAIM');deny(out);
 const {args:sourceArgs,state:sourceState}=bootstrapFixture();
 sourceState.row.tenantMembershipVerified=true;
 out=await inspectPersistedEncounterBootstrapCandidate(sourceArgs);
 assert.equal(out.code,'UNSUPPORTED_INSTITUTIONAL_TENANT_CLAIM');deny(out);
});
test('bootstrap: missing adapters and read failures fail closed without secrets',async()=>{
 const {args}=bootstrapFixture();args.source={};
 let out=await inspectPersistedEncounterBootstrapCandidate(args);
 assert.equal(out.code,'BOOTSTRAP_TRUSTED_SOURCE_ADAPTER_MISSING');deny(out);
 const {args:failure}=bootstrapFixture();
 failure.source.readOwnerScopedForActor=async()=>{throw Error('SYNTHETIC_SECRET_DATABASE_UNAVAILABLE')};
 out=await inspectPersistedEncounterBootstrapCandidate(failure);
 assert.equal(out.code,'BOOTSTRAP_FAIL_CLOSED');deny(out);
 assert.equal(JSON.stringify(out).includes('SYNTHETIC_SECRET'),false);
});
test('bootstrap: repeated requests remain candidate only; no implicit idempotency proof',async()=>{
 const {args}=bootstrapFixture('realtime-call.chunk');
 for(let i=0;i<2;i++){
  const out=await inspectPersistedEncounterBootstrapCandidate(args);
  assert.equal(out.status,'PERSISTED_ENCOUNTER_BOOTSTRAP_CANDIDATE_ONLY');
  deny(out);
 }
});


/*
 * LAB-only sequence model: caller MAY propose a second admission inspection
 * after owner-bound bootstrap, but neither candidate grants egress. This is
 * NOT a production dispatcher: it does not invoke a provider or send audio.
 * Each distinct SDP, fallback chunk and retry uses FRESH adapters/state.
 * A prior candidate result must never be reused to satisfy a later attempt.
 */
test('egress sequence: SDP, fallback chunk and retry require fresh owner + consent reads',async()=>{
 const state={
  userId:USER,ownerId:USER,version:1,persisted:true,ack:true,
  pendingEdits:false,revoked:false,consentVersion:1,sessionStarted:false
 };
 const counts={source:0,consent:0,identity:0,externalSend:0};
 const auth={getUser:async()=>{counts.identity++;return{id:state.userId}}};
 const source={readOwnerScopedForActor:async()=>{
  counts.source++;
  return{
   sourceRowId:SOURCE,encounterId:ENC,ownerUserId:state.ownerId,
   syncVersion:state.version,clinicalAccessVerified:true,
   activeSlotVerified:true,serverPersistedVerified:state.persisted,
   serverSyncAckVerified:state.ack,ownerBindingVerified:true,
   serverRowUniquenessVerified:true,noPendingLocalEditsVerified:!state.pendingEdits,
   sourceLockedVerified:false,externalSessionAlreadyStartedVerified:state.sessionStarted,
   effectivePolicyVersion:'policy-v1'
  };
 }};
 const consent={readLatestPurposeEvent:async()=>{
  counts.consent++;
  return{
   eventId:EVENT,actorId:USER,encounterId:ENC,sourceRowId:SOURCE,
   purpose:'realtime_audio',sourceSyncVersion:state.consentVersion,
   provider:'openai',policyVersion:'policy-v1',
   serverCommittedVerified:true,explicitActionVerified:true,
   scopeValidatedVerified:true,revoked:state.revoked,
   serverSequenceBeforeExternalDispatchVerified:true
  };
 }};
 async function proposedAttempt(route){
  // Every proposed egress starts with fresh bootstrap; no cached result.
  const input={route,request:{encounterId:ENC},identity:auth,source};
  const boot=await inspectPersistedEncounterBootstrapCandidate(input);
  deny(boot);
  if(boot.status!=='PERSISTED_ENCOUNTER_BOOTSTRAP_CANDIDATE_ONLY')
   return{boot,admission:null};
  const admission=await inspectExternalAiAdmissionCandidate({
   ...input,configuredProvider:'openai',consent
  });
  deny(admission);
  // Never call any provider, even when both synthetic checks look favorable.
  if(admission.externalAiAuthorized)counts.externalSend++;
  return{boot,admission};
 }
 let result=await proposedAttempt('realtime-call.webrtc');
 assert.equal(result.boot.status,'PERSISTED_ENCOUNTER_BOOTSTRAP_CANDIDATE_ONLY');
 assert.equal(result.admission.status,'ADMISSION_PREFLIGHT_CANDIDATE_ONLY');
 assert.equal(counts.source,2);assert.equal(counts.consent,1);
 // A fallback chunk must re-evaluate consent; prior SDP candidate is invalid.
 state.revoked=true;
 result=await proposedAttempt('realtime-call.chunk');
 assert.equal(result.admission.code,'PURPOSE_SPECIFIC_DURABLE_CONSENT_NOT_VERIFIED');
 assert.equal(counts.source,4);assert.equal(counts.consent,2);
 // Retry after reconnect cannot reuse SDP candidate if local edits are pending.
 state.revoked=false;state.pendingEdits=true;state.version=2;
 result=await proposedAttempt('realtime-call.webrtc');
 assert.equal(result.boot.code,'BOOTSTRAP_DURABLE_SOURCE_ACK_NOT_VERIFIED');
 assert.equal(result.admission,null);assert.equal(counts.consent,2);
 // After edits settle, a stale consent version still fails per attempt.
 state.pendingEdits=false;
 result=await proposedAttempt('realtime-call.chunk');
 assert.equal(result.boot.status,'PERSISTED_ENCOUNTER_BOOTSTRAP_CANDIDATE_ONLY');
 assert.equal(result.admission.code,'PURPOSE_SPECIFIC_DURABLE_CONSENT_NOT_VERIFIED');
 assert.equal(counts.consent,3);
 // New user/owner mismatch or session already started cannot inherit admission.
 state.ownerId=OTHER;
 result=await proposedAttempt('realtime-call.webrtc');
 assert.equal(result.boot.code,'BOOTSTRAP_OWNER_OR_SOURCE_VERSION_NOT_VERIFIED');
 assert.equal(result.admission,null);
 state.ownerId=USER;state.sessionStarted=true;
 result=await proposedAttempt('realtime-call.chunk');
 assert.equal(result.boot.code,'BOOTSTRAP_DURABLE_SOURCE_ACK_NOT_VERIFIED');
 assert.equal(result.admission,null);
 assert.equal(counts.consent,3);
 assert.equal(counts.source,10);
 assert.equal(counts.externalSend,0);
});
