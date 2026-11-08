import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileAggregateCost as reconcile} from '../labs/nexa-cost/aggregate-reconciliation.mjs';
const base=()=>({schema_version:'nexa-cost-aggregate-v1',
 period:{start_utc:'2026-11-01T00:00:00Z',end_utc:'2026-11-08T00:00:00Z'},
 completed_consultations:20,capabilities:[
  {capability:'realtime.radar',request_count:100,declared_cost_usd:.5,
   latency_histogram:[{upper_ms:100,count:50},{upper_ms:500,count:45},{upper_ms:1000,count:5}]},
  {capability:'realtime.transcription',request_count:40,declared_cost_usd:2},
  {capability:'final.transcription',request_count:8,declared_cost_usd:1},
  {capability:'clinical.documentation',request_count:20,declared_cost_usd:4}
 ],provider_bill_total_usd:7.5});
test('aggregate costs separated across radar/transcription/docs; p50/p95 from histogram',()=>{
 const r=reconcile(base());
 assert.deepEqual(r.counts,{requests:168,completed_consultations:20});
 assert.equal(r.categories.transcription.declared_cost_usd,3);
 assert.equal(r.categories.radar.latency_p50_ms,100);
 assert.equal(r.categories.radar.latency_p95_ms,500);
 assert.equal(r.declared_cost_per_completed_consultation_usd,.375);
 assert.equal(r.totals_match_declared_invoice,true);
 assert.equal(r.official_billing_verified_by_connector,false);
 assert.equal(r.causal_savings_attributable_to_nexa_usd,null);
});
test('partial provider billing and missing capability costs do not invent spend',()=>{
 const c=base();c.capabilities[0].declared_cost_usd=null;c.provider_bill_total_usd=7.5;
 const r=reconcile(c);
 assert.equal(r.declared_observational_total_usd,null);
 assert.equal(r.declared_cost_per_completed_consultation_usd,null);
 assert.equal(r.totals_match_declared_invoice,false);
});
test('same request capability counted twice is invalid',()=>{
 const c=base();c.capabilities.push({...c.capabilities[0]});
 assert.throws(()=>reconcile(c),/AGGREGATE_CAPABILITY_INVALID/);
});
test('mismatching provider billing cannot be labeled reconciled',()=>{
 const c=base();c.provider_bill_total_usd=9;
 const r=reconcile(c);assert.equal(r.totals_match_declared_invoice,false);
 assert.equal(r.provider_bill_difference_usd,1.5);
});
test('PHI, raw per-request context, identifiers or additional fields rejected',()=>{
 for(const key of ['user_id','patient_name','encounter_id','transcript','raw_logs']){
  const c=base();c[key]='secret';
  assert.throws(()=>reconcile(c),/AGGREGATE_ONLY_REQUIRED/);
 }
 const c=base();c.capabilities[0].user_id='another_user';
 assert.throws(()=>reconcile(c),/AGGREGATE_ONLY_REQUIRED/);
});
test('only valid monotonic latency buckets with counts equal to request count',()=>{
 const c=base();c.capabilities[0].latency_histogram[0].count=49;
 assert.throws(()=>reconcile(c),/AGGREGATE_HISTOGRAM_COUNT_MISMATCH/);
 const z=base();z.capabilities[0].latency_histogram[1].upper_ms=99;
 assert.throws(()=>reconcile(z),/AGGREGATE_HISTOGRAM_INVALID/);
});
test('zero consultations gives no per-attendance cost; no measured savings claim',()=>{
 const c=base();c.completed_consultations=0;const r=reconcile(c);
 assert.equal(r.declared_cost_per_completed_consultation_usd,null);
 assert.equal(r.causal_savings_attributable_to_nexa_usd,null);
});
