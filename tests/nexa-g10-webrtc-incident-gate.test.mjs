import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateSyntheticTransportTraces} from '../labs/nexa-webrtc/aggregate-outcomes.G9-LAB-ONLY.mjs';
import {replayOfflineRealtimeTrace} from '../labs/nexa-webrtc/trace-replay.G5-LAB-ONLY.mjs';
import {decideOfflineTransportFallback} from '../labs/nexa-webrtc/fallback-policy.G7-LAB-ONLY.mjs';
const caseOf=(transport,...events)=>({transport,events});
const fallback=(c,localReady,confirmedUserCancellation=false)=>
 decideOfflineTransportFallback(replayOfflineRealtimeTrace(c),{localReady,confirmedUserCancellation});
test('wrapper-only 502 with no upstream evidence remains STOP if local fallback absent',()=>{
 const c=caseOf('webrtc',{kind:'wrapper_http',status:502});
 const diag=replayOfflineRealtimeTrace(c);
 assert.equal(diag.upstream_http_status,null);
 assert.equal(diag.outcome,'WRAPPER_ERROR_NO_UPSTREAM_EVIDENCE');
 const d=fallback(c,false);
 assert.equal(d.route,'STOP_NO_LOCAL_FALLBACK');
 assert.equal(d.automatic_paid_retry,false);
 assert.equal(d.no_charge_verified,false);
});
test('explicit cancellation takes priority over otherwise available fallback',()=>{
 const c=caseOf('webrtc',{kind:'cancel_by_user'});
 const x=fallback(c,true,true);
 assert.equal(x.route,'USER_CANCELLED_NO_AUTOMATIC_LOCAL_OR_REMOTE_RETRY');
 assert.equal(x.automatic_paid_retry,false);
});
test('timeouts from independent transports do not reveal underlying paid provider fate',()=>{
 const x=aggregateSyntheticTransportTraces([
  caseOf('webrtc',{kind:'timeout'}),
  caseOf('chunk',{kind:'timeout'}),
  caseOf('webrtc',{kind:'upstream_http',status:400},{kind:'wrapper_http',status:502}),
  caseOf('chunk',{kind:'network_exception'}),
  caseOf('webrtc',{kind:'cancel_by_user'})
 ]);
 assert.equal(x.timeout,2);
 assert.equal(x.upstream_400,1);
 assert.equal(x.synthetic_trace_count,5);
 assert.equal(x.provider_charges_verified,false);
 assert.equal(x.paid_retries_allowed,false);
});
test('no PHI can leak through synthetic transport summaries',()=>{
 const x=aggregateSyntheticTransportTraces([caseOf('webrtc',{kind:'wrapper_http',status:502})]);
 assert.deepEqual(Object.keys(x).filter(k=>/patient|audio|transcript|user_id|sdp|secret/i.test(k)),[]);
 assert.equal(JSON.stringify(x).includes('PRIVATE'),false);
});
test('repeated remote statuses and retry traces do not count as separate legitimate incidents',()=>{
 const cases=[
  caseOf('webrtc',{kind:'upstream_http',status:400},{kind:'upstream_http',status:502}),
  caseOf('chunk',{kind:'timeout'},{kind:'retry'})
 ];
 for(const c of cases)assert.throws(()=>aggregateSyntheticTransportTraces([c]),/TRACE_/);
});
