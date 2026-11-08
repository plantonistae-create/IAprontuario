import test from 'node:test';
import assert from 'node:assert/strict';
import {accountRealtimeStatuses as account} from '../scripts/nexa-realtime-status-accounting.mjs';
const sample=()=>({window:{start_utc:'2026-11-07T01:00:00Z',end_utc:'2026-11-08T01:00:00Z'},
 edge:{post_200:771,post_502:30,options_200:808},
 upstream:{webrtc_400:30},
 correlation:{edge_502_linked_webrtc_400:30}});
test('30/30 correlated 502 means technical event pairing, not WebRTC failure rate',()=>{
 const r=account(sample());
 assert.equal(r.counts.correlated_edge_502_to_webrtc_400,30);
 assert.equal(r.correlated_502_pct,100);
 assert.equal(r.unmatched_edge_502,0);
 assert.equal(r.webrtc_success_rate_pct,null);
 assert.equal(r.webrtc_attempts,null);
 assert.equal(r.provider_billed_requests,null);
 assert.equal(r.measured_savings_usd,null);
});
test('zero 502 is not a 100% or 0% WebRTC connection rate',()=>{
 const s=sample();s.edge.post_502=0;s.upstream.webrtc_400=0;s.correlation.edge_502_linked_webrtc_400=0;
 const r=account(s);
 assert.equal(r.correlated_502_pct,null);
 assert.equal(r.webrtc_success_rate_pct,null);
});
test('unmatched 502 retained explicitly, no inferred status',()=>{
 const s=sample();s.correlation.edge_502_linked_webrtc_400=28;
 const r=account(s);
 assert.equal(r.unmatched_edge_502,2);
 assert.equal(r.correlated_502_pct,93.33);
});
test('strict allowlist rejects identifiers, raw logs, SDP and transcripts',()=>{
 for(const field of ['patient','execution_id','transcript','sdp','api_key','raw_logs']){
  const s=sample();s[field]='SYNTHETIC_REJECT';assert.throws(()=>account(s),/AGGREGATE_ALLOWLIST_ONLY/);
  const t=sample();t.upstream[field]='SYNTHETIC_REJECT';assert.throws(()=>account(t),/AGGREGATE_ALLOWLIST_ONLY/);
 }
});
test('rejects overcounting, invalid or >24h windows',()=>{
 const s=sample();s.correlation.edge_502_linked_webrtc_400=31;
 assert.throws(()=>account(s),/CORRELATION_EXCEEDS_EVENTS/);
 const w=sample();w.window.end_utc='2026-11-09T01:00:00Z';
 assert.throws(()=>account(w),/INVALID_WINDOW/);
 const u=sample();u.edge.post_200=-1;
 assert.throws(()=>account(u),/INVALID_COUNT/);
});
