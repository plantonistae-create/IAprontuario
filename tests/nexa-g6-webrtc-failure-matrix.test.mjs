import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {replayOfflineRealtimeTrace} from '../labs/nexa-webrtc/trace-replay.G5-LAB-ONLY.mjs';
const probe=(transport,events)=>replayOfflineRealtimeTrace({transport,events});
test('HTTP upstream 400 is distinguished from wrapper 502; root cause remains unverified',()=>{
 const x=probe('webrtc',[{kind:'upstream_http',status:400},{kind:'wrapper_http',status:502}]);
 assert.equal(x.outcome,'UPSTREAM_HTTP_400');
 assert.equal(x.wrapper_http_status,502);
 assert.equal(x.provider_root_cause_verified,false);
 assert.equal(x.paid_retry_approved,false);
});
test('HTTP upstream 502 is different from wrapper-only 502',()=>{
 const provider=probe('webrtc',[{kind:'upstream_http',status:502},{kind:'wrapper_http',status:502}]);
 const wrapper=probe('webrtc',[{kind:'wrapper_http',status:502}]);
 assert.equal(provider.outcome,'UPSTREAM_SERVER_ERROR');
 assert.equal(wrapper.outcome,'WRAPPER_ERROR_NO_UPSTREAM_EVIDENCE');
 assert.equal(wrapper.upstream_http_status,null);
});
test('abort and timeout before upstream response are independent unknowns',()=>{
 for(const [kind,want] of [['timeout','TIMEOUT_BEFORE_HTTP_STATUS'],
 ['cancel_by_user','CANCELLED_BY_USER'],
 ['abort_unverified','ABORT_SOURCE_UNVERIFIED'],
 ['network_exception','NETWORK_OR_UNKNOWN_ERROR_BEFORE_STATUS']]){
  const x=probe('webrtc',[{kind},{kind:'wrapper_http',status:500}]);
  assert.equal(x.outcome,want);
  assert.equal(x.remote_response_proven,false);
  assert.equal(x.paid_retry_approved,false);
 }
});
test('failed local fallback must be explicit STOP; successful fallback is still review required',()=>{
 const common=[{kind:'upstream_http',status:429},{kind:'wrapper_http',status:502}];
 const yes=probe('chunk',[...common,{kind:'local_fallback',ok:true}]);
 const no=probe('chunk',[...common,{kind:'local_fallback',ok:false}]);
 assert.equal(yes.local_outcome,'LOCAL_REVIEW_REQUIRED');
 assert.equal(no.local_outcome,'STOP_LOCAL_FAILED');
});
test('retry or a second purported upstream status cannot be smuggled into incident evidence',()=>{
 for(const events of [
  [{kind:'timeout'},{kind:'retry'}],
  [{kind:'upstream_http',status:400},{kind:'upstream_http',status:502}],
  [{kind:'abort_unverified'},{kind:'upstream_http',status:400}],
  [{kind:'upstream_http',status:200},{kind:'local_fallback',ok:true}]
 ])assert.throws(()=>probe('webrtc',events),/TRACE_/);
});
test('technical replay never accepts actual SDP, audio, transcript, user ID or secrets',()=>{
 for(const key of ['audio','sdp','transcript','user_id','apiKey','url']){
  assert.throws(()=>probe('webrtc',[{kind:'wrapper_http',status:502,[key]:'PRIVATE'}]),/TRACE_INVALID/);
 }
 const source=readFileSync(new URL('../supabase/functions/realtime-call/index.ts',import.meta.url),'utf8');
 assert.match(source,/AbortSignal\.timeout\(18000\)/);
 assert.match(source,/error:\s*"INTERNAL_ERROR"/);
 // Merely detecting timeout handling is not proof of provider HTTP status.
});
