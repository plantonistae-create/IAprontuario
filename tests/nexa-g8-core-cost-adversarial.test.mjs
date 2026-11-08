import test from 'node:test';
import assert from 'node:assert/strict';
import {LAB_CONTRACT} from '../experimental/nexa-core-shadow-lab.mjs';
import {evaluateOfflineEvidenceIntegrity as evaluate} from '../experimental/nexa-g7-shadow-evidence-integrity.mjs';
import {compareDeclaredWindows} from '../labs/nexa-cost/window-comparison.LAB-ONLY.mjs';
const clinical=()=>({schema_version:LAB_CONTRACT,case_id:'synthetic-g8-core',
 source:'synthetic',deidentification_reviewed:true,
 fields:{hda:'Cefaleia fictícia, sem identificação individual.'},
 phrases:[{speaker:'doctor',text:'Teve febre?'},{speaker:'patient',text:'Não sei informar.'}],
 expected_critical:[]});
const cost=()=>({schema_version:'nexa-cost-aggregate-v1',
 period:{start_utc:'2026-11-01T00:00:00Z',end_utc:'2026-11-08T00:00:00Z'},
 completed_consultations:10,capabilities:[
  {capability:'realtime.radar',request_count:20,declared_cost_usd:2},
  {capability:'realtime.transcription',request_count:10,declared_cost_usd:3}],
 provider_bill_total_usd:5});
const observe=window=>({schema_version:'nexa-observability-aggregate-v1',
 window,attempts:10,classified:8,unknown:2,
 completed_consultations:10,declared_cost_usd:5});
const sample=()=>({before:cost(),after:cost(),syntheticCases:[clinical()],
 baselineObservability:observe('baseline'),candidateObservability:observe('candidate')});
test('100% synthetic passing metrics cannot claim live patient safety or official savings',()=>{
 const r=sample();r.candidateObservability.classified=10;r.candidateObservability.unknown=0;
 const x=evaluate(r);
 assert.equal(x.live_release_allowed,false);
 assert.equal(x.provider_invoice_verified,false);
 assert.equal(x.causal_cost_savings_usd,null);
 assert.equal(x.clinical_performance_validated,false);
 assert.equal(x.remote_provider_calls,0);
 assert.equal(JSON.stringify(x).includes('Não sei informar.'),false);
});
test('missed synthetic alert blocks clinical cohort independent of apparently improved cost',()=>{
 const r=sample();r.syntheticCases[0].expected_alerts=['sudden'];
 r.after.capabilities[0].declared_cost_usd=0.01;r.after.provider_bill_total_usd=3.01;
 const out=evaluate(r);
 assert.ok(out.synthetic_blocked_cases>=1);
 assert.equal(out.live_release_allowed,false);
 assert.equal(out.causal_cost_savings_usd,null);
});
test('same duration but changed request intensity cannot be claimed like-for-like',()=>{
 const r=sample();
 r.after.capabilities[0].request_count=35;
 const x=evaluate(r);
 assert.equal(x.request_mix,'REQUEST_INTENSITY_SHIFTED');
 assert.equal(x.provider_invoice_verified,false);
});
test('zero technical attempts produces unknown observation coverage rather than 100%',()=>{
 const r=sample();
 r.baselineObservability.attempts=0;r.baselineObservability.classified=0;r.baselineObservability.unknown=0;
 const x=evaluate(r);
 assert.equal(x.baseline_observability_fraction,null);
 assert.equal(x.live_release_allowed,false);
});
test('mismatched declared cost totals are NOT_COMPARABLE and not accepted as official billing',()=>{
 const a=cost(),b=cost();b.provider_bill_total_usd=99;
 const x=compareDeclaredWindows(a,b);
 assert.equal(x.comparison_status,'NOT_COMPARABLE');
 assert.equal(x.causal_savings_attributable_to_nexa_usd,null);
 assert.equal(x.verified_provider_invoice,false);
});
test('a remote snapshot cannot silently repair missed alerts in local or Core shadow',()=>{
 const r=sample();r.syntheticCases[0].expected_alerts=['sudden'];
 r.syntheticCases[0].remote_snapshots=r.syntheticCases[0].phrases.map(()=>({
  items:[],observations:[],alerts:[{concept:'sudden'}],version:'synthetic'
 }));
 const x=evaluate(r);
 assert.ok(x.synthetic_blocked_cases>0);
 assert.equal(x.live_release_allowed,false);
});
test('raw patient/encounter IDs and non-synthetic material are rejected at the aggregate boundary',()=>{
 const r=sample();r.user_id='PRIVATE';
 assert.throws(()=>evaluate(r),/G7_SYNTHETIC_AGGREGATES_ONLY/);
 const c=sample();c.syntheticCases[0].source='deidentified';
 assert.throws(()=>evaluate(c),/SYNTHETIC_COHORT_REQUIRED/);
 const d=sample();d.before.user_id='PRIVATE';
 assert.throws(()=>evaluate(d),/AGGREGATE_ONLY_REQUIRED/);
});
