// NEXA P0 V5.00: negative-only source contract; no network, DB or real people.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reviewPatientConsentSessionCandidate as review }
  from '../labs/nexa-audit-attestation/nexa-patient-consent-session.P0-NOT-DEPLOYED.mjs';

const A='11111111-1111-4111-8111-111111111111';
const E='22222222-2222-4222-8222-222222222222';
const S='33333333-3333-4333-8333-333333333333';
const R='44444444-4444-4444-8444-444444444444';
const V='55555555-5555-4555-8555-555555555555';
const hash=x=>'sha256:'+x.repeat(64);
const now=1800000000000;

const candidate=()=>({
  request:{encounterId:E,sessionId:S},
  source:{ownerUserId:A,encounterId:E,sourceRowId:R,syncVersion:5,
    sourceDigest:hash('a'),canonicalization:'pg-jsonb-v1',
    ownerAndActiveSlotVerified:true,persistedSyncAckVerified:true},
  policy:{purpose:'realtime_audio',provider:'openai',policyVersion:'policy-v1',
    termDigest:hash('b'),approvedAtEpochMs:now-200000,revokedAtEpochMs:null},
  session:{id:S,encounterId:E,ownerUserId:A,sourceRowId:R,
    sourceSyncVersion:5,sourceDigest:hash('a'),
    purpose:'realtime_audio',provider:'openai',policyVersion:'policy-v1',
    termDigest:hash('b'),tokenVerifierDigest:hash('c'),
    serverIssued:true,issuedAtEpochMs:now-100000,
    expiresAtEpochMs:now+100000,consumedAtEpochMs:null,cancelledAtEpochMs:null},
  receipt:{receiptId:V,sessionId:S,encounterId:E,sourceRowId:R,
    sourceSyncVersion:5,sourceDigest:hash('a'),
    purpose:'realtime_audio',provider:'openai',policyVersion:'policy-v1',
    termDigest:hash('b'),signedArtifactDigest:hash('d'),
    identityService:'synthetic-untrusted',providerConfirmedAtEpochMs:now-50000},
  revocation:{encounterId:E,ownerUserId:A,purpose:'realtime_audio',
    provider:'openai',policyVersion:'policy-v1',revoked:false,
    checkedAtEpochMs:now},
  nowEpochMs:now,
});

const denied=(input, expectedCode)=>{
  const out=review(input);
  assert.equal(out.status,'STOP');
  if(expectedCode)assert.equal(out.code,expectedCode);
  for(const flag of ['qrIssued','sessionConsumed','identityVerified',
    'consentRecorded','externalAiAuthorized','auditAuthorized','gateCVerified']){
    assert.equal(out[flag],false,flag);
  }
  assert.equal(Object.isFrozen(out),true);
  assert.equal(JSON.stringify(out).includes('tokenVerifierDigest'),false);
};

test('patient-facing request rejects actor, identity, consent and callback claims',()=>{
  const x=candidate();
  x.request.patientIdentityVerified=true;
  denied(x,'PATIENT_ROUTE_ONLY_REQUEST_REQUIRED');
});

test('owner, persisted source and term scope remain tightly bound',()=>{
  const x=candidate();
  x.source.ownerUserId='99999999-9999-4999-8999-999999999999';
  denied(x,'SERVER_BOUND_SINGLE_USE_SESSION_NOT_PROVEN');
  const y=candidate();
  y.session.termDigest=hash('e');
  denied(y,'SERVER_BOUND_SINGLE_USE_SESSION_NOT_PROVEN');
  const z=candidate();
  z.policy.revokedAtEpochMs=now-10000;
  denied(z,'APPROVED_TERM_POLICY_NOT_PROVEN');
});

test('expired, consumed and cancelled session never passes',()=>{
  const x=candidate();
  x.session.expiresAtEpochMs=now;
  denied(x,'SESSION_EXPIRED_OR_POLICY_TIMELINE_INVALID');
  const y=candidate();
  y.session.consumedAtEpochMs=now-1;
  denied(y,'SERVER_BOUND_SINGLE_USE_SESSION_NOT_PROVEN');
  const z=candidate();
  z.session.cancelledAtEpochMs=now-1;
  denied(z,'SERVER_BOUND_SINGLE_USE_SESSION_NOT_PROVEN');
});

test('external callback mismatch and impossible confirmation time stop',()=>{
  const x=candidate();
  x.receipt.termDigest=hash('f');
  denied(x,'BOUND_PROVIDER_RECEIPT_NOT_PROVEN');
  const y=candidate();
  y.receipt.providerConfirmedAtEpochMs=y.session.issuedAtEpochMs-1;
  denied(y,'BOUND_PROVIDER_RECEIPT_NOT_PROVEN');
});

test('revocation cannot be bypassed by a receipt-shaped claim',()=>{
  const x=candidate();
  x.revocation.revoked=true;
  denied(x,'CURRENT_REVOCATION_STATE_NOT_PROVEN');
});

test('even a complete forged synthetic receipt cannot authorize consent or egress',()=>{
  const x=candidate();
  x.receipt.signatureVerified=true;
  x.receipt.biometricVerified=true;
  denied(x,'PROVIDER_TRUST_AND_ATOMIC_CONSENT_AUTHORITY_NOT_IMPLEMENTED');
});

test('existing ledger and global STOP remain in place',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const sql=read('supabase/migrations/20261114190000_nexa_p0_source_action_writer_REVIEW_ONLY.sql');
  assert.match(sql,/private\.nexa_p0_source_action_events/);
  assert.match(sql,/STOP_WRITER176_ROLE_RLS_REVIEW_ONLY_NOT_AUTHORIZED/);
  const edge=read('supabase/functions/nexa-source-actions/index.ts');
  assert.match(edge,/DEPLOYED_SOURCE_ACTION_WRITER_AUTHORIZED = false/);
  assert.match(edge,/PATIENT_CONFIRMED_CONSENT_AUTHORITY_NOT_PROVEN/);
});
