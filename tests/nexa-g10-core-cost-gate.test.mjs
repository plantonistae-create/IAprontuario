import test from 'node:test';
import assert from 'node:assert/strict';
import {LAB_CONTRACT} from '../experimental/nexa-core-shadow-lab.mjs';
import {evaluateSyntheticReadinessG10 as run} from '../experimental/nexa-g10-safety-readiness.LAB-ONLY.mjs';
const caseOf=()=>({schema_version:LAB_CONTRACT,case_id:'synthetic-g10',
 source:'synthetic',deidentification_reviewed:true,
 fields:{hda:'Sintoma fictício não identificável.'},
 phrases:[{speaker:'doctor',text:'Tem febre?'},{speaker:'patient',text:'Não sei dizer.'}],
 expected_critical:[]});
const windowOf=window=>({window,total_attempts:10,classified_attempts:8,
 unknown_attempts:2,started_consultations:6,completed_consultations:4,declared_cost_usd:2});
const req=()=>({clinicalCases:[caseOf()],before:windowOf('before'),
 after:windowOf('after'),transportCases:[{transport:'webrtc',
 events:[{kind:'wrapper_http',status:502}]}]});
test('synthetic all green quality, lower declared spend and no provider evidence never promote',()=>{
 const input=req();input.after.declared_cost_usd=0;
 const x=run(input);
 assert.equal(x.live_release_allowed,false);
 assert.equal(x.new_paid_api_calls,0);
 assert.equal(x.official_provider_invoice_verified,false);
 assert.equal(x.observed_cost_reduction_causally_attributable,false);
 assert.equal(x.clinical_reference_standard_verified,false);
 assert.equal(JSON.stringify(x).includes('Não sei dizer.'),false);
});
test('missed expected alert survives apparently complete aggregate metrics',()=>{
 const input=req();input.clinicalCases[0].expected_alerts=['sudden'];
 input.after.classified_attempts=10;input.after.unknown_attempts=0;
 const x=run(input);
 assert.ok(x.synthetic_blocked_cases>=1);
 assert.ok(x.synthetic_missed_alerts>0);
 assert.equal(x.live_release_allowed,false);
});
test('zero denominator and unknown transport status remain explicit',()=>{
 const input=req();input.before.total_attempts=0;
 input.before.classified_attempts=0;input.before.unknown_attempts=0;
 input.before.completed_consultations=0;
 const x=run(input);
 assert.equal(x.before_outcome_coverage,null);
 assert.equal(x.unknown_upstream_status_count,1);
 assert.equal(x.live_release_allowed,false);
});
test('forged clinical source or patient-level metadata rejected',()=>{
 const x=req();x.clinicalCases[0].source='deidentified';
 assert.throws(()=>run(x),/G9_ONLY_SYNTHETIC_SHADOW_CASES/);
 const y=req();y.after.patient_name='PRIVATE';
 assert.throws(()=>run(y),/G9_DENOMINATOR_CONTRACT_INVALID/);
 const z=req();z.provider_bill_total=100;
 assert.throws(()=>run(z),/G10_SYNTHETIC_INPUT_REQUIRED/);
});
