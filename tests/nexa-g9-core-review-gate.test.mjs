import test from 'node:test';
import assert from 'node:assert/strict';
import {LAB_CONTRACT} from '../experimental/nexa-core-shadow-lab.mjs';
import {aggregateSyntheticReviewReadiness as run} from '../experimental/nexa-g9-core-review-gate.mjs';
const fixture=(id='synthetic-g9-shadow')=>({schema_version:LAB_CONTRACT,case_id:id,
 source:'synthetic',deidentification_reviewed:true,fields:{hda:'Cefaleia sintética.'},
 phrases:[{speaker:'doctor',text:'Tem febre?'},{speaker:'patient',text:'Não sei informar.'}],
 expected_critical:[]});
test('synthetic approved reviewer flag is not independent validation or live authorization',()=>{
 const c=fixture();c.medical_review={reviewer_verdict:'approved'};
 const x=run([c]);
 assert.equal(x.synthetic_review_approved,1);
 assert.equal(x.trusted_clinical_reference_standard_verified,false);
 assert.equal(x.prospective_safety_verified,false);
 assert.equal(x.promotion_to_live_allowed,false);
 assert.equal(x.remote_provider_calls,0);
});
test('missed expected red flag is retained as blocked despite approved synthetic reviewer tag',()=>{
 const c=fixture();c.expected_alerts=['sudden'];
 c.medical_review={reviewer_verdict:'approved'};
 const x=run([c]);
 assert.ok(x.blocked_synthetic_cases>=1);
 assert.ok(x.missed_expected_alerts>0);
 assert.equal(x.promotion_to_live_allowed,false);
});
test('cohort aggregation does not emit raw phrases or patient facts',()=>{
 const c=fixture(),x=run([c]);
 assert.equal(JSON.stringify(x).includes('Não sei informar.'),false);
 assert.equal(JSON.stringify(x).includes('Cefaleia sintética.'),false);
});
test('non-synthetic or not-deidentified cases cannot be counted as clinical clearance',()=>{
 const a=fixture();a.source='deidentified';
 assert.throws(()=>run([a]),/G9_ONLY_SYNTHETIC_SHADOW_CASES/);
 const b=fixture();b.deidentification_reviewed=false;
 assert.throws(()=>run([b]),/G9_ONLY_SYNTHETIC_SHADOW_CASES/);
});
