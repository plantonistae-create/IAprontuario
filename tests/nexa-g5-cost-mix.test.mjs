import test from 'node:test';
import assert from 'node:assert/strict';
import {auditDeclaredCostMix as audit} from '../labs/nexa-cost/mix-gate.G5-LAB-ONLY.mjs';
const sample=()=>({schema_version:'nexa-cost-aggregate-v1',
 period:{start_utc:'2026-11-01T00:00:00Z',end_utc:'2026-11-08T00:00:00Z'},
 completed_consultations:10,capabilities:[
  {capability:'realtime.radar',request_count:20,declared_cost_usd:2},
  {capability:'realtime.transcription',request_count:10,declared_cost_usd:3}],
 provider_bill_total_usd:5});
test('stable declared request intensity is still not verified causal savings',()=>{
 const x=audit(sample(),sample());
 assert.equal(x.mix_status,'REQUEST_INTENSITY_STABLE_DECLARED');
 assert.equal(x.eligible_for_causal_savings_claim,false);
 assert.equal(x.causal_savings_attributable_to_nexa_usd,null);
});
test('new higher per-consultation request mix disqualifies like-for-like assumption',()=>{
 const a=sample(),b=sample();
 b.capabilities[0].request_count=30;
 const r=audit(a,b);
 assert.equal(r.mix_status,'REQUEST_INTENSITY_SHIFTED');
 assert.ok(r.max_relative_request_mix_drift>=0.5);
});
test('unequal duration or incomplete declared bill remains NOT_ASSESSABLE',()=>{
 const a=sample(),b=sample();b.provider_bill_total_usd=50;
 assert.equal(audit(a,b).mix_status,'NOT_ASSESSABLE');
});
test('PHI-like fields and impossible drift thresholds fail closed',()=>{
 const a=sample(),b=sample();b.capabilities[0].user_id='not-allowed';
 assert.throws(()=>audit(a,b),/AGGREGATE_ONLY_REQUIRED/);
 assert.throws(()=>audit(sample(),sample(),{maxRelativeDrift:-1}),/MIX_GATE_INVALID/);
});
