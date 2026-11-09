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

test('duplicate or missing synthetic case IDs cannot inflate the cohort denominator',()=>{
 const a=make(),b=make();
 assert.throws(()=>audit([a,b]),/SYNTHETIC_COHORT_DUPLICATE_OR_MISSING_CASE_ID/);
 delete b.case_id;
 assert.throws(()=>audit([b]),/SYNTHETIC_COHORT_DUPLICATE_OR_MISSING_CASE_ID/);
 b.case_id='synthetic-distinct';
 assert.equal(audit([a,b]).synthetic_cases,2);
});

test('whitespace variants of the same synthetic case identifier are duplicates',()=>{
 const a=make(),b=make();b.case_id=' '+a.case_id+' ';
 assert.throws(()=>audit([a,b]),/SYNTHETIC_COHORT_DUPLICATE_OR_MISSING_CASE_ID/);
});

test('case-insensitive aliases cannot double-count synthetic fixtures',()=>{
 const a=make(),b=make();b.case_id=a.case_id.toUpperCase();
 assert.throws(()=>audit([a,b]),/SYNTHETIC_COHORT_DUPLICATE_OR_MISSING_CASE_ID/);
});

test('unicode compatibility aliases cannot double-count synthetic case IDs',()=>{
 const a=make(),b=make();b.case_id=a.case_id.replace('synthetic','ｓｙｎｔｈｅｔｉｃ');
 assert.throws(()=>audit([a,b]),/SYNTHETIC_COHORT_DUPLICATE_OR_MISSING_CASE_ID/);
});

test('oversized synthetic case identifiers fail before shadow replay',()=>{
 const c=make();c.case_id='x'.repeat(129);
 assert.throws(()=>audit([c]),/SYNTHETIC_COHORT_DUPLICATE_OR_MISSING_CASE_ID/);
});

test('synthetic cohort rejects malformed case IDs before shadow replay',()=>{
 for(const case_id of [' a','A-case','case with spaces','case@host','x'.repeat(66)]){
  const c=make();c.case_id=case_id;
  assert.throws(()=>audit([c]),/SYNTHETIC_COHORT_DUPLICATE_OR_MISSING_CASE_ID/);
 }
});

test('synthetic case ID boundary accepts 65 characters and rejects 66',()=>{
 const accepted=make();accepted.case_id='x'.repeat(65);
 assert.equal(audit([accepted]).synthetic_cases,1);
 const rejected=make();rejected.case_id='x'.repeat(66);
 assert.throws(()=>audit([rejected]),/SYNTHETIC_COHORT_DUPLICATE_OR_MISSING_CASE_ID/);
});

test('critical misses never promote shadow cohort to live use',()=>{
 const c=make();c.expected_critical=['sudden'];
 const r=audit([c]);
 assert.equal(r.core_promotable_to_live,false);
 assert.equal(r.clinical_safety_validated,false);
 assert.equal(r.paid_provider_calls,0);
 assert.equal(r.critical_misses_require_manual_review,r.missed_critical_last_frame_count>0);
});
