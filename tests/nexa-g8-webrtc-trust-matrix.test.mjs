import test from 'node:test';
import assert from 'node:assert/strict';
import {replayOfflineRealtimeTrace as replay} from '../labs/nexa-webrtc/trace-replay.G5-LAB-ONLY.mjs';
import {decideOfflineTransportFallback as decide} from '../labs/nexa-webrtc/fallback-policy.G7-LAB-ONLY.mjs';
const r=(events,transport='webrtc')=>replay({transport,events});
const run=(events,localReady=true,confirmedUserCancellation=false,transport='webrtc')=>
 decide(r(events,transport),{localReady,confirmedUserCancellation});
test('only an observed upstream 502 can be called upstream 502, not a wrapper-only 502',()=>{
 const upstream=r([{kind:'upstream_http',status:502},{kind:'wrapper_http',status:502}]);
 const wrapper=r([{kind:'wrapper_http',status:502}]);
 assert.equal(upstream.outcome,'UPSTREAM_SERVER_ERROR');
 assert.equal(wrapper.outcome,'WRAPPER_ERROR_NO_UPSTREAM_EVIDENCE');
 assert.equal(wrapper.upstream_http_status,null);
 assert.equal(upstream.provider_root_cause_verified,false);
});
test('400, 401, 429, 502 all remain review-only with no automatic paid retry',()=>{
 for(const status of [400,401,429,502]){
  const x=run([{kind:'upstream_http',status},{kind:'wrapper_http',status:502}],true);
  assert.equal(x.route,'LOCAL_REVIEW_REQUIRED');
  assert.equal(x.automatic_paid_retry,false);
  assert.equal(x.root_cause_verified,false);
  assert.equal(x.provider_charge_verified,false);
 }
});
test('timeout and unverified abort with local fallback failure result in explicit STOP',()=>{
 for(const kind of ['timeout','abort_unverified','network_exception']){
  const x=run([{kind}],false,false,'chunk');
  assert.equal(x.route,'STOP_NO_LOCAL_FALLBACK');
  assert.equal(x.no_charge_verified,false);
  assert.equal(x.automatic_paid_retry,false);
 }
});
test('no user cancel proof means abort must not become user cancellation',()=>{
 const ambiguous=r([{kind:'abort_unverified'}]);
 assert.equal(ambiguous.outcome,'ABORT_SOURCE_UNVERIFIED');
 assert.throws(()=>decide(ambiguous,
  {localReady:true,confirmedUserCancellation:true}),/CANCELLATION_PROVENANCE_CONFLICT/);
});
test('actual synthetic user cancellation suppresses both remote retry and unsolicited local fallback',()=>{
 const x=run([{kind:'cancel_by_user'}],true,true);
 assert.equal(x.route,'USER_CANCELLED_NO_AUTOMATIC_LOCAL_OR_REMOTE_RETRY');
 assert.equal(x.automatic_paid_retry,false);
});
test('HTTP 2xx success is a transport observation, not a validated clinical response',()=>{
 const x=run([{kind:'upstream_http',status:200}],true);
 assert.equal(x.route,'REMOTE_HTTP_RECEIVED_CLINICAL_RESULT_UNVERIFIED');
 assert.equal(x.clinical_safety_verified,false);
 assert.equal(x.provider_charge_verified,false);
});
test('sensitive network payload fields are forbidden in offline trace fixtures',()=>{
 for(const field of ['audio','sdp','transcript','user_id','api_key','patient']){
  assert.throws(()=>r([{kind:'wrapper_http',status:502,[field]:'PHI'}]),/TRACE_INVALID/);
 }
});
