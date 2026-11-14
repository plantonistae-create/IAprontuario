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
