import test from 'node:test';
import assert from 'node:assert/strict';
import {replayOfflineRealtimeTrace as replay} from '../labs/nexa-webrtc/trace-replay.G5-LAB-ONLY.mjs';
test('400 upstream with wrapper 502 is not a 502 upstream',()=>{
 const x=replay({transport:'webrtc',events:[{kind:'upstream_http',status:400},
   {kind:'wrapper_http',status:502},{kind:'local_fallback',ok:true}]});
 assert.equal(x.outcome,'UPSTREAM_HTTP_400');assert.equal(x.wrapper_http_status,502);
 assert.equal(x.provider_root_cause_verified,false);
 assert.equal(x.local_outcome,'LOCAL_REVIEW_REQUIRED');
});
test('wrapper 502 alone leaves provider HTTP response unknown',()=>{
 const x=replay({transport:'webrtc',events:[{kind:'wrapper_http',status:502}]});
 assert.equal(x.outcome,'WRAPPER_ERROR_NO_UPSTREAM_EVIDENCE');
 assert.equal(x.upstream_http_status,null);assert.equal(x.paid_retry_approved,false);
});
test('timeouts, user cancels, unknown aborts, and pre-status network errors are distinct',()=>{
 for(const [event,expected] of [['timeout','TIMEOUT_BEFORE_HTTP_STATUS'],
  ['cancel_by_user','CANCELLED_BY_USER'],
  ['abort_unverified','ABORT_SOURCE_UNVERIFIED'],
  ['network_exception','NETWORK_OR_UNKNOWN_ERROR_BEFORE_STATUS']]){
  const r=replay({transport:'chunk',events:[{kind:event},{kind:'wrapper_http',status:500}]});
  assert.equal(r.outcome,expected);assert.equal(r.remote_response_proven,false);
 }
});
test('local fallback failure produces STOP, never a transparent success',()=>{
 const r=replay({transport:'chunk',events:[{kind:'upstream_http',status:429},
  {kind:'wrapper_http',status:502},{kind:'local_fallback',ok:false}]});
 assert.equal(r.local_outcome,'STOP_LOCAL_FAILED');assert.equal(r.paid_retry_approved,false);
});
test('retry, conflicting HTTP/timeouts, successful remote plus fallback are rejected',()=>{
 for(const events of [
  [{kind:'upstream_http',status:400},{kind:'retry'}],
  [{kind:'upstream_http',status:400},{kind:'timeout'}],
  [{kind:'timeout'},{kind:'upstream_http',status:200}],
  [{kind:'upstream_http',status:200},{kind:'local_fallback',ok:true}],
  [{kind:'local_fallback',ok:true}]
 ])assert.throws(()=>replay({transport:'webrtc',events}),/TRACE_/);
});
test('identifiable or clinical data cannot enter a technical trace',()=>{
 for(const k of ['sdp','audio','patient','transcript','api_key','url']){
  assert.throws(()=>replay({transport:'webrtc',
   events:[{kind:'upstream_http',status:400,[k]:'secret'}]}),/TRACE_INVALID/);
 }
});
