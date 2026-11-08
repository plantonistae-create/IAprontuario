import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateDeclaredDenominators} from '../labs/nexa-cost/denominator-contract.G9-LAB-ONLY.mjs';
const sample=w=>({window:w,total_attempts:100,classified_attempts:90,unknown_attempts:10,
 started_consultations:20,completed_consultations:10,declared_cost_usd:5});
test('descriptive request/consultation denominators cannot justify clinical or causal optimization',()=>{
 const r=evaluateDeclaredDenominators(sample('before'),sample('after'));
 assert.equal(r.before_outcome_coverage,.9);
 assert.equal(r.before_attempts_per_completed_consultation,10);
 assert.equal(r.clinical_release_allowed,false);
 assert.equal(r.causal_savings_claim_allowed,false);
 assert.equal(r.verified_provider_invoices,false);
});
test('zero completed consultations or zero requests returns unknown rate, not infinity or success',()=>{
 const a=sample('before');a.total_attempts=0;a.classified_attempts=0;a.unknown_attempts=0;
 a.completed_consultations=0;
 const r=evaluateDeclaredDenominators(a,sample('after'));
 assert.equal(r.before_outcome_coverage,null);
 assert.equal(r.before_attempts_per_completed_consultation,null);
 assert.equal(r.before_declared_cost_per_completed_consultation_usd,null);
});
test('request counts must partition exactly and completed cannot exceed started',()=>{
 const a=sample('before');a.unknown_attempts=9;
 assert.throws(()=>evaluateDeclaredDenominators(a,sample('after')),/G9_DENOMINATOR_CONTRACT_INVALID/);
 const b=sample('before');b.completed_consultations=30;
 assert.throws(()=>evaluateDeclaredDenominators(b,sample('after')),/G9_DENOMINATOR_CONTRACT_INVALID/);
});
test('patient, individual model logs and raw billing source cannot enter aggregates',()=>{
 for(const key of ['patient_id','request_id','raw_transcript','provider_api_key','clinician']){
  const x=sample('before');x[key]='private';
  assert.throws(()=>evaluateDeclaredDenominators(x,sample('after')),/G9_DENOMINATOR_CONTRACT_INVALID/);
 }
});
test('lower declared cost after cannot be called proven provider savings',()=>{
 const a=sample('before'),b=sample('after');b.declared_cost_usd=.01;
 const x=evaluateDeclaredDenominators(a,b);
 assert.ok(x.after_declared_cost_per_completed_consultation_usd<x.before_declared_cost_per_completed_consultation_usd);
 assert.equal(x.causal_savings_claim_allowed,false);
});
