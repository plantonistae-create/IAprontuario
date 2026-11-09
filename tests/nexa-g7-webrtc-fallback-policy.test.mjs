import test from 'node:test';
import assert from 'node:assert/strict';
import {replayOfflineRealtimeTrace} from '../labs/nexa-webrtc/trace-replay.G5-LAB-ONLY.mjs';
import {decideOfflineTransportFallback as policy} from '../labs/nexa-webrtc/fallback-policy.G7-LAB-ONLY.mjs';
const event=(kind,status)=>({kind,...(status===undefined?{}:{status})});
const trace=(events,transport='webrtc')=>replayOfflineRealtimeTrace({transport,events});
const fallback=(t,localReady=true,confirmedUserCancellation=false)=>
 policy(t,{localReady,confirmedUserCancellation});
test('400 upstream with 502 wrapper requests local review, not an automatic provider retry',()=>{
 const x=fallback(trace([event('upstream_http',400),event('wrapper_http',502)]));
 assert.equal(x.route,'LOCAL_REVIEW_REQUIRED');
 assert.equal(x.automatic_paid_retry,false);assert.equal(x.root_cause_verified,false);
});
test('502 wrapper-only cannot prove upstream response or lack of provider billing',()=>{
 const x=fallback(trace([event('wrapper_http',502)]));
 assert.equal(x.route,'LOCAL_REVIEW_REQUIRED');
 assert.equal(x.no_charge_verified,false);assert.equal(x.provider_charge_verified,false);
});
test('timeouts, unverified aborts and network failure require local fallback or STOP',()=>{
 for(const kind of ['timeout','abort_unverified','network_exception']){
  const t=trace([event(kind)]);
  assert.equal(fallback(t,true).route,'LOCAL_REVIEW_REQUIRED');
  assert.equal(fallback(t,false).route,'STOP_NO_LOCAL_FALLBACK');
  assert.equal(fallback(t,false).automatic_paid_retry,false);
 }
});
test('explicit cancellation does not silently restart any paid or local processing',()=>{
 const t=trace([event('cancel_by_user')]);
 const p=fallback(t,true,true);
 assert.equal(p.route,'USER_CANCELLED_NO_AUTOMATIC_LOCAL_OR_REMOTE_RETRY');
 assert.equal(p.human_review_required,false);
 assert.equal(p.automatic_paid_retry,false);
 assert.throws(()=>fallback(trace([event('timeout')]),true,true),/CANCELLATION_PROVENANCE_CONFLICT/);
});
test('confirmed 200 response is not equal to clinical validity or invoice evidence',()=>{
 const t=trace([event('upstream_http',200)]);
 const x=fallback(t);
 assert.equal(x.route,'REMOTE_HTTP_RECEIVED_CLINICAL_RESULT_UNVERIFIED');
 assert.equal(x.clinical_safety_verified,false);assert.equal(x.provider_charge_verified,false);
});
test('metadata policy refuses inappropriate argument shapes',()=>{
 const t=trace([event('wrapper_http',502)]);
 assert.throws(()=>policy(t,{localReady:true,confirmedUserCancellation:false,transcript:'PHI'}),/TRANSPORT_POLICY_INVALID/);
 assert.throws(()=>policy({phase:'webrtc',outcome:'INVENTED'},{localReady:true,confirmedUserCancellation:false}),/TRANSPORT_POLICY_INVALID/);
});

test('fallback policy rejects inherited transport status and non-plain option records',()=>{
 const forged=Object.create({outcome:'TIMEOUT_BEFORE_HTTP_STATUS',phase:'webrtc'});
 assert.throws(()=>policy(forged,{localReady:true,confirmedUserCancellation:false}),/TRANSPORT_POLICY_INVALID/);
 const legitimate=trace([event('timeout')]);
 assert.throws(()=>policy(legitimate,Object.assign(Object.create(null),{localReady:true,confirmedUserCancellation:false})),/TRANSPORT_POLICY_INVALID/);
});
