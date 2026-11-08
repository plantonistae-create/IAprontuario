import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyOfflineRealtimeOutcome as classify} from '../labs/nexa-webrtc/offline-outcome.LAB-ONLY.mjs';
test('upstream HTTP 400 differs from wrapper 502, which alone proves no provider status',()=>{
 const x=classify({phase:'webrtc',upstreamStatus:400,wrapperStatus:502});
 assert.equal(x.outcome,'UPSTREAM_HTTP_400');assert.equal(x.source,'upstream_http');
 assert.equal(x.wrapper_http_status,502);assert.equal(x.automatic_retry_allowed,false);
 const y=classify({phase:'webrtc',wrapperStatus:502});
 assert.equal(y.outcome,'WRAPPER_ERROR_NO_UPSTREAM_EVIDENCE');
 assert.equal(y.upstream_http_status,null);
});
test('upstream 502, auth rejections, throttling and success stay separate',()=>{
 for(const [status,expected] of [[502,'UPSTREAM_SERVER_ERROR'],[503,'UPSTREAM_SERVER_ERROR'],
  [401,'UPSTREAM_AUTH_REJECTED'],[403,'UPSTREAM_AUTH_REJECTED'],
  [429,'UPSTREAM_RATE_LIMITED'],[200,'UPSTREAM_HTTP_SUCCESS']])
  assert.equal(classify({phase:'webrtc',upstreamStatus:status}).outcome,expected);
});
test('transport timeout, user cancel, unverified abort and network failure are never auto-retried',()=>{
 for(const [extra,expected] of [
  [{exception:'TimeoutError'},'TIMEOUT_BEFORE_HTTP_STATUS'],
  [{exception:'AbortError',abortedByUser:true},'CANCELLED_BY_USER'],
  [{exception:'AbortError'},'ABORT_SOURCE_UNVERIFIED'],
  [{exception:'TypeError'},'NETWORK_OR_UNKNOWN_ERROR_BEFORE_STATUS']]){
  const x=classify({phase:'chunk',...extra});
  assert.equal(x.outcome,expected);assert.equal(x.human_review_required,true);
  assert.equal(x.automatic_retry_allowed,false);
 }
});
test('raw responses, SDP, audio, user identifiers and unknown keys are forbidden',()=>{
 for(const key of ['transcript','audio','sdp','apiKey','user_id','request_body','message'])
  assert.throws(()=>classify({phase:'webrtc',exception:'UnknownError',[key]:'secret'}),
   /DIAGNOSTIC_INPUT_INVALID/);
 assert.throws(()=>classify({phase:'webrtc',upstreamStatus:400,exception:'AbortError'}),
  /DIAGNOSTIC_INPUT_INVALID/);
 assert.throws(()=>classify({phase:'webrtc',upstreamStatus:0}),/DIAGNOSTIC_INPUT_INVALID/);
});
test('hosted WebRTC code still maps upstream failures to 502 and uncaught timeout to generic 500',()=>{
 const source=readFileSync(new URL('../supabase/functions/realtime-call/index.ts',import.meta.url),'utf8');
 assert.match(source,/AbortSignal\.timeout\(18000\)/);
 assert.match(source,/error:\s*"REALTIME_SESSION_FAILED"/);
 assert.match(source,/error:\s*"INTERNAL_ERROR"/);
 assert.match(source,/emitRealtimeUpstreamStatus\("webrtc", upstream\.status\)/);
});
