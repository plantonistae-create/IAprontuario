import test from 'node:test';
import assert from 'node:assert/strict';
import {LAB_CONTRACT} from '../experimental/nexa-core-shadow-lab.mjs';
import {evaluateOfflineEvidenceIntegrity as evaluate} from '../experimental/nexa-g7-shadow-evidence-integrity.mjs';
const synthetic=()=>({schema_version:LAB_CONTRACT,case_id:'synthetic-g7-safety',
 source:'synthetic',deidentification_reviewed:true,
 fields:{hda:'Sintoma artificial sem identidade.'},
 phrases:[{speaker:'doctor',text:'Houve febre?'},{speaker:'patient',text:'Não consigo informar.'}],
 expected_critical:[]});
const cost=()=>({schema_version:'nexa-cost-aggregate-v1',
 period:{start_utc:'2026-11-01T00:00:00Z',end_utc:'2026-11-08T00:00:00Z'},
 completed_consultations:10,capabilities:[
  {capability:'realtime.radar',request_count:20,declared_cost_usd:2},
  {capability:'realtime.transcription',request_count:10,declared_cost_usd:3}],
 provider_bill_total_usd:5});
const obs=(window)=>({schema_version:'nexa-observability-aggregate-v1',
 window,attempts:10,classified:8,unknown:2,
 completed_consultations:10,declared_cost_usd:5});
const req=()=>({syntheticCases:[synthetic()],before:cost(),after:cost(),
 baselineObservability:obs('baseline'),candidateObservability:obs('candidate')});
test('even all green synthetic and cost aggregates never promote clinical release',()=>{
 const x=evaluate(req());assert.equal(x.live_release_allowed,false);
 assert.equal(x.remote_provider_calls,0);assert.equal(x.provider_invoice_verified,false);
 assert.equal(x.causal_cost_savings_usd,null);
 assert.equal(x.clinical_performance_validated,false);
 assert.equal(JSON.stringify(x).includes('Não consigo informar'),false);
});
test('missed critical synthetic alert stays review-blocked despite apparently complete observation',()=>{
 const r=req();r.syntheticCases[0].expected_alerts=['sudden'];
 r.candidateObservability.classified=10;r.candidateObservability.unknown=0;
 const x=evaluate(r);
 assert.ok(x.synthetic_blocked_cases>0);assert.equal(x.live_release_allowed,false);
});
test('non-synthetic data and unexpected request level metadata are never admitted',()=>{
 const r=req();r.syntheticCases[0].source='deidentified';
 assert.throws(()=>evaluate(r),/SYNTHETIC_COHORT_REQUIRED/);
 const x=req();x.request_id='PRIVATE';
 assert.throws(()=>evaluate(x),/G7_SYNTHETIC_AGGREGATES_ONLY/);
});
