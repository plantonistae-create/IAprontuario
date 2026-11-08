import test from 'node:test';
import assert from 'node:assert/strict';
import {LAB_CONTRACT} from '../experimental/nexa-core-shadow-lab.mjs';
import {evaluateOfflineReleaseEvidence as run} from '../experimental/nexa-g6-offline-release-guard.mjs';
const synthetic=()=>({schema_version:LAB_CONTRACT,case_id:'synthetic-g6-case',
 source:'synthetic',deidentification_reviewed:true,fields:{hda:'Cefaleia fictícia.'},
 phrases:[{speaker:'doctor',text:'Houve febre?'},{speaker:'patient',text:'Não sei informar.'}],
 expected_critical:[]});
const cost=()=>({schema_version:'nexa-cost-aggregate-v1',
 period:{start_utc:'2026-11-01T00:00:00Z',end_utc:'2026-11-08T00:00:00Z'},
 completed_consultations:10,capabilities:[
  {capability:'realtime.radar',request_count:20,declared_cost_usd:2},
  {capability:'realtime.transcription',request_count:10,declared_cost_usd:3}],
 provider_bill_total_usd:5});
const req=()=>({syntheticCases:[synthetic()],before:cost(),after:cost()});
test('clean synthetic sample and matched cost totals do not constitute clinical GO',()=>{
 const report=run(req());
 assert.equal(report.live_release_allowed,false);
 assert.equal(report.clinician_validated_safety,false);
 assert.equal(report.official_invoice_verified,false);
 assert.equal(report.causal_savings_attributable_to_nexa_usd,null);
 assert.equal(report.paid_provider_calls,0);
 assert.equal(JSON.stringify(report).includes('Não sei informar'),false);
});
test('missing synthetic critical alert blocks metrics without making a model safety claim',()=>{
 const r=req();r.syntheticCases[0].expected_alerts=['sudden'];
 const out=run(r);
 assert.ok(out.synthetic_review_blocked_cases>0);
 assert.ok(out.synthetic_expected_alert_disagreements>0);
 assert.equal(out.live_release_allowed,false);
});
test('declared mix change does not pass as comparable clinical case mix',()=>{
 const r=req();r.after.capabilities[0].request_count=30;
 const x=run(r);assert.equal(x.aggregate_request_mix,'REQUEST_INTENSITY_SHIFTED');
 assert.equal(x.case_mix_comparability_verified,false);
});
test('unknown top-level fields, raw patient text or non-synthetic cases are rejected',()=>{
 const x=req();x.raw_transcript='private';
 assert.throws(()=>run(x),/G6_AGGREGATES_ONLY/);
 const y=req();y.syntheticCases[0].source='deidentified';
 assert.throws(()=>run(y),/SYNTHETIC_COHORT_REQUIRED/);
 const z=req();z.before.user_id='private';
 assert.throws(()=>run(z),/AGGREGATE_ONLY_REQUIRED/);
});
