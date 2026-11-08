import test from 'node:test';
import assert from 'node:assert/strict';
import {auditSyntheticShadowCohort as audit} from '../experimental/nexa-core-shadow-cohort.G5-LAB-ONLY.mjs';
import {LAB_CONTRACT} from '../experimental/nexa-core-shadow-lab.mjs';
const make=()=>({schema_version:LAB_CONTRACT,case_id:'synthetic-cohort-case',
 source:'synthetic',deidentification_reviewed:true,
 fields:{hda:'Consulta artificial sobre cefaleia.'},
 phrases:[{speaker:'doctor',text:'Houve febre?'},{speaker:'patient',text:'Não sei informar.'}],
 expected_critical:[]});
test('cohort contains no real-case output, API calls, transcript or invented spend',()=>{
 const x=audit([make()]);
 assert.equal(x.synthetic_cases,1);assert.equal(x.synthetic_phrases,2);
 assert.equal(x.paid_provider_calls,0);assert.equal(x.official_provider_cost_usd,null);
 assert.equal(x.core_promotable_to_live,false);assert.equal(x.clinical_safety_validated,false);
 assert.equal(JSON.stringify(x).includes('Não sei informar.'),false);
});
test('unmet alert contract makes shadow cohort BLOCKED despite synthetic medical approval',()=>{
 const c=make();c.expected_alerts=['sudden'];
 c.medical_review={reviewer_verdict:'approved'};
 const x=audit([c]);
 assert.equal(x.status,'OFFLINE_SHADOW_BLOCKED');
 assert.equal(x.review_blocked_cases,1);
 assert.ok(x.expected_or_forbidden_alert_disagreements>0);
});
test('a non-synthetic or unreviewed case cannot enter the offline aggregate',()=>{
 for(const update of [x=>x.source='deidentified',x=>x.deidentification_reviewed=false,
 x=>x.schema_version='malformed']){
  const c=make();update(c);
  assert.throws(()=>audit([c]),/SYNTHETIC_COHORT_REQUIRED/);
 }
});
