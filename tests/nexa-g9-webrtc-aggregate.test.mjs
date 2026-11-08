import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateSyntheticTransportTraces as sum} from '../labs/nexa-webrtc/aggregate-outcomes.G9-LAB-ONLY.mjs';
const caseOf=(...events)=>({transport:'webrtc',events});
test('distinguish 400 upstream, wrapper-only 502, real upstream 502 and user-cancel',()=>{
 const r=sum([
  caseOf({kind:'upstream_http',status:400},{kind:'wrapper_http',status:502}),
  caseOf({kind:'wrapper_http',status:502}),
  caseOf({kind:'upstream_http',status:502},{kind:'wrapper_http',status:502}),
  caseOf({kind:'cancel_by_user'}),
  caseOf({kind:'timeout'}),
  caseOf({kind:'abort_unverified'}),
 ]);
 assert.equal(r.upstream_400,1);assert.equal(r.upstream_5xx,1);
 assert.equal(r.wrapper_only,1);assert.equal(r.user_cancelled,1);
 assert.equal(r.timeout,1);assert.equal(r.unknown_abort,1);
 assert.equal(r.no_status,4);
 assert.equal(r.provider_root_causes_verified,false);
 assert.equal(r.paid_retries_allowed,false);
});
test('failed fallback aggregates STOP without inventing a successful session',()=>{
 const x=sum([caseOf({kind:'upstream_http',status:429},
  {kind:'wrapper_http',status:502},{kind:'local_fallback',ok:false})]);
 assert.equal(x.local_stop,1);assert.equal(x.clinical_results_verified,false);
});
test('raw session IDs, PHI, SDP, audio and secrets are rejected',()=>{
 for(const key of ['patient','transcript','sdp','audio','api_key','user_id']){
  assert.throws(()=>sum([{...caseOf({kind:'wrapper_http',status:502}),[key]:'PRIVATE'}]),
   /G9_TRANSPORT_AGGREGATE_INPUT_INVALID/);
 }
});
test('mutually incompatible timeout/status histories and automated retries are forbidden',()=>{
 for(const events of [
  [{kind:'upstream_http',status:400},{kind:'timeout'}],
  [{kind:'timeout'},{kind:'retry'}]
 ])assert.throws(()=>sum([caseOf(...events)]),/TRACE_/);
});
