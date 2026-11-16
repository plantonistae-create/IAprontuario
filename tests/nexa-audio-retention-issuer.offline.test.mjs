import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRetentionIssueRequest,preflightRetentionGrantIssuance,RetentionIssuerError} from '../supabase/functions/_shared/nexa-audio-retention-issuer-contract.mjs';

// No positive grant fixture by design: the dedicated server consent authority
// and transactional issuer RPC DO NOT EXIST in the current deployed system.
const doctor='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const encounter='33333333-3333-4333-8333-333333333333';
const action='44444444-4444-4444-8444-444444444444';
const eventId='55555555-5555-4555-8555-555555555555';
const issued={encounter_id:encounter,client_action_id:action};
const policy={purpose:'clinical_audio_retention',
  version:'audio-retention-review-v1',terms_digest:'a'.repeat(64),
  independently_approved:true};
const context={
  actor:doctor,request:issued,
  source:{user_id:doctor,encounter_id:encounter},
  capabilities:{access_status:'active',clinical_access:true},
  serverPolicy:policy,now:Date.parse('2026-11-16T15:00:00Z')
};
const malformedEvidence={event_id:eventId,
  origin:'client_checkbox',verified_by_server:false,
  attested_by:doctor,owner_user_id:doctor,encounter_id:encounter,
  purpose:'clinical_audio_retention',revoked_at:null,
  policy_version:policy.version,terms_digest:policy.terms_digest,
  expires_at:'2026-11-16T15:10:00Z'};
async function denied(extra,code){
  await assert.rejects(preflightRetentionGrantIssuance({...context,...extra}),
    e=>e instanceof RetentionIssuerError&&e.code===code);
}
test('issuer accepts only opaque encounter and idempotency IDs',()=>{
  assert.deepEqual(parseRetentionIssueRequest(issued),issued);
  for(const forbidden of ['consent','consent_recorded_at','retention_grant_id',
    'server_verified','rights_basis_reference','policy_version','training_approved','terms_digest']){
    assert.throws(()=>parseRetentionIssueRequest({...issued,[forbidden]:true}),
      /UNTRUSTED_ISSUANCE_FIELDS/);
  }
});
test('no owner identity is never a grant',async()=>{
  await denied({actor:''},'UNAUTHENTICATED_ISSUER_ACTOR');
});
test('inactive or nonclinical actor is denied before evidence lookup',async()=>{
  for(const caps of [{access_status:'pending',clinical_access:true},
    {access_status:'active',clinical_access:false}]){
    await denied({capabilities:caps},'CLINICAL_ACCESS_REQUIRED');
  }
});
test('cross-doctor and forged consultation are denied',async()=>{
  await denied({actor:other},'SOURCE_NOT_OWNED_OR_UNAVAILABLE');
  await denied({source:{user_id:other,encounter_id:encounter}},
    'SOURCE_NOT_OWNED_OR_UNAVAILABLE');
});
test('recording consent is not a retention policy',async()=>{
  for(const p of [null,
    {...policy,purpose:'audio_transcription'},
    {...policy,independently_approved:false},
    {...policy,terms_digest:null},
    {...policy,version:''}]){
    await denied({serverPolicy:p},'AUDIO_RETENTION_POLICY_NOT_APPROVED');
  }
});
test('a missing independent evidence authority is a hard STOP',async()=>{
  await denied({},'CONSENT_ISSUER_AUTHORITY_MISSING');
  await denied({evidenceAuthority:{readVerifiedAttestation:null}},
    'CONSENT_ISSUER_AUTHORITY_MISSING');
});
test('browser checkbox, timestamp and client claims cannot become attestation',async()=>{
  let calls=0;
  const evidenceAuthority={async readVerifiedAttestation(){calls++;return malformedEvidence}};
  await denied({evidenceAuthority},'AUDIO_RETENTION_ATTESTATION_NOT_VERIFIED');
  assert.equal(calls,1);
});
test('wrong encounter, purpose, ownership and policy cannot pass',async()=>{
  // A counterfactual shape that only exists inside this negative test.
  // It is NOT an observed or approved consent authority.
  const isolatedSynthetic={...malformedEvidence,
    origin:'immutable_server_retention_ledger_v1',verified_by_server:true};
  for(const tampered of [
    {owner_user_id:other},{encounter_id:other},{attested_by:other},
    {purpose:'training'},{policy_version:'other'},
    {terms_digest:'b'.repeat(64)},{origin:'browser'},
    {verified_by_server:false},{revoked_at:'2026-11-16T14:00:00Z'},
    {expires_at:'2020-01-01T00:00:00Z'}, {event_id:'not-a-uuid'}
  ]){
    await denied({evidenceAuthority:{
      async readVerifiedAttestation(){return {...isolatedSynthetic,...tampered}}
    }},'AUDIO_RETENTION_ATTESTATION_NOT_VERIFIED');
  }
});
test('evidence authority exception fails closed with no grant',async()=>{
  await denied({evidenceAuthority:{
    async readVerifiedAttestation(){throw Error('database unavailable')}
  }},'CONSENT_ISSUER_AUTHORITY_UNAVAILABLE');
});
test('same action reused with different owner, encounter, or purpose is denied',async()=>{
  for(const priorAction of [
    {owner_user_id:other,encounter_id:encounter,client_action_id:action,purpose:'clinical_audio_retention'},
    {owner_user_id:doctor,encounter_id:other,client_action_id:action,purpose:'clinical_audio_retention'},
    {owner_user_id:doctor,encounter_id:encounter,client_action_id:other,purpose:'clinical_audio_retention'},
    {owner_user_id:doctor,encounter_id:encounter,client_action_id:action,purpose:'training'}
  ]){
    await denied({priorAction},'ISSUER_ACTION_CONFLICT');
  }
});
