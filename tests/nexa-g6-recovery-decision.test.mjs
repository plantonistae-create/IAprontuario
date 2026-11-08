import test from 'node:test';
import assert from 'node:assert/strict';
import {decideSyntheticClaimRecovery as decide} from '../labs/nexa-quota/recovery-decision.G6-LAB-ONLY.mjs';
const q=(state,age_seconds=3600,authority_verified=true,fallback_available=true)=>
 ({state,age_seconds,authority_verified,fallback_available});
test('stale claimed outcome can close UNKNOWN but never authorize a second paid call',()=>{
 const x=decide(q('claimed'));
 assert.equal(x.policy,'SET_OUTCOME_UNKNOWN_IF_STILL_CLAIMED');
 assert.equal(x.automatic_paid_retry,false);
 assert.equal(x.provider_charge_verified,false);
 assert.equal(x.no_charge_verified,false);
});
test('new claimed or unverified authority must not settle unknown',()=>{
 assert.equal(decide(q('claimed',59)).policy,'DO_NOT_SETTLE_WITHOUT_AUTHORITY_OR_AGE');
 assert.equal(decide(q('claimed',3600,false)).policy,'DO_NOT_SETTLE_WITHOUT_AUTHORITY_OR_AGE');
});
test('reserved, unknown and missing claims never become automatic remote sends',()=>{
 for(const state of ['reserved','outcome_unknown','missing']){
  const x=decide(q(state));assert.equal(x.automatic_paid_retry,false);
  assert.equal(x.review_required,true);
 }
});
test('no available local fallback is STOP rather than hidden success',()=>{
 for(const state of ['reserved','claimed','outcome_unknown','missing'])
  assert.equal(decide(q(state,3600,true,false)).policy,'STOP_LOCAL_FALLBACK_UNAVAILABLE');
});
test('confirmed response remains terminal and does not imply clinician validation',()=>{
 const x=decide(q('confirmed_response'));
 assert.equal(x.policy,'KEEP_EXISTING_TERMINAL');
 assert.equal(x.automatic_paid_retry,false);
});
test('raw patient identifiers or missing decision inputs are rejected',()=>{
 assert.throws(()=>decide({...q('claimed'),user_id:'PRIVATE'}),/G6_RECOVERY_INPUT_INVALID/);
 assert.throws(()=>decide({state:'claimed'}),/G6_RECOVERY_INPUT_INVALID/);
});
