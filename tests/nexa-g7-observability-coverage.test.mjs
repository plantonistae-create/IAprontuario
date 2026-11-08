import test from 'node:test';
import assert from 'node:assert/strict';
import {compareDeclaredObservabilityCoverage as compare} from '../labs/nexa-cost/observability-coverage.G7-LAB-ONLY.mjs';
const a=()=>({schema_version:'nexa-observability-aggregate-v1',window:'baseline',
 attempts:100,classified:70,unknown:30,completed_consultations:10,declared_cost_usd:20});
const b=()=>({...a(),window:'candidate',attempts:80,classified:76,unknown:4,declared_cost_usd:8});
test('better metadata classification and lower declared spending do not prove causal savings',()=>{
 const r=compare(a(),b());
 assert.equal(r.baseline_classification_coverage,0.7);
 assert.equal(r.candidate_classification_coverage,0.95);
 assert.equal(r.claim_of_causal_savings_allowed,false);
 assert.equal(r.original_provider_invoice_verified,false);
 assert.equal(r.official_billing_gap_resolved,false);
 assert.equal(r.paid_retries_approved,false);
});
test('zero attempts cannot be mistaken for 100% observation coverage',()=>{
 const x=a(),y=b();
 x.attempts=0;x.classified=0;x.unknown=0;
 y.attempts=0;y.classified=0;y.unknown=0;
 const r=compare(x,y);
 assert.equal(r.baseline_classification_coverage,null);
 assert.equal(r.candidate_classification_coverage,null);
});
test('unknown counts must reconcile with attempt totals',()=>{
 const x=a();x.unknown=29;
 assert.throws(()=>compare(x,b()),/OBSERVABILITY_AGGREGATE_ONLY/);
});
test('raw request, patient, clinician or encounter fields cannot enter aggregate model',()=>{
 for(const key of ['request_id','patient','clinician','transcript','encounter_id','api_key']){
  assert.throws(()=>compare({...a(),[key]:'PRIVATE'},b()),/OBSERVABILITY_AGGREGATE_ONLY/);
 }
});
test('reversed windows and impossible costs fail closed',()=>{
 assert.throws(()=>compare(b(),a()),/OBSERVABILITY_WINDOW_INVALID/);
 const x=b();x.declared_cost_usd=Number.NaN;
 assert.throws(()=>compare(a(),x),/OBSERVABILITY_AGGREGATE_ONLY/);
});
