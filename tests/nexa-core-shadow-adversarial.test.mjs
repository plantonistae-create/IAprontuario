import test from 'node:test';
import assert from 'node:assert/strict';
import {replayShadowCase,LAB_CONTRACT} from '../experimental/nexa-core-shadow-lab.mjs';
const base=()=>({schema_version:LAB_CONTRACT,case_id:'synthetic-adversarial',
 source:'synthetic',deidentification_reviewed:true,fields:{hda:'Cefaleia fictícia.'},
 phrases:[{speaker:'doctor',text:'Você teve febre?'},{speaker:'patient',text:'Não sei informar.'}],
 expected_critical:[]});
test('unexpected alerts and missing alerts are independent clinical shadow gates',()=>{
 const c=base();c.expected_alerts=['sudden'];c.forbidden_alerts=['syncope'];
 const r=replayShadowCase(c);
 assert.equal(r.summary.status,'BLOCKED_CLINICAL_REVIEW_REQUIRED');
 assert.ok(r.summary.missed_expected_alerts_local+r.summary.missed_expected_alerts_core>=1);
 assert.equal(r.summary.unexpected_alerts_local,0);
 assert.equal(r.summary.unexpected_alerts_core,0);
 assert.equal(r.summary.local_and_core_api_calls,0);
 assert.equal(r.summary.remote_billing_usd,null);
});
test('a physician question followed by uncertain patient answer never becomes a negative',()=>{
 const r=replayShadowCase(base()),last=r.frames.at(-1);
 const direct=last.local.evidence.filter(e=>e.concept==='fever'&&e.state==='known_absent');
 assert.equal(direct.length,0);
 assert.equal(last.core.provider,'nexa-core-shadow');
 assert.equal(r.summary.case_review,'not_reviewed');
});
test('companion report cannot be silently promoted to a documented patient finding',()=>{
 const c=base();c.phrases=[{speaker:'companion',text:'Ele desmaiou e teve febre.'}];
 c.forbidden_alerts=['syncope'];
 const r=replayShadowCase(c),last=r.frames.at(-1);
 assert.equal(r.summary.unexpected_alerts_local,0);
 assert.equal(last.local.evidence.some(e=>e.concept==='syncope'&&e.speaker==='patient'),false);
});
test('the same evidence phrase across two speakers is ambiguous',()=>{
 const c=base();c.phrases=[{speaker:'patient',text:'Nega febre.'},{speaker:'companion',text:'Nega febre.'}];
 const r=replayShadowCase(c);
 assert.equal(r.frames.at(-1).local.evidence.some(e=>e.quote.includes('Nega febre.')&&e.speaker==='patient'),false);
});
test('blocked review cannot be reclassified as clinically validated by a lab flag',()=>{
 const c=base();c.medical_review={reviewer_verdict:'approved'};
 c.expected_alerts=['sudden'];
 const r=replayShadowCase(c);
 assert.equal(r.summary.status,'BLOCKED_CLINICAL_REVIEW_REQUIRED');
 assert.equal(r.summary.case_review,'approved');
});
test('unknown clinical concept and conflicting alert rubrics rejected',()=>{
 for(const amend of [c=>c.expected_alerts=['fictitious_concept'],
 c=>c.forbidden_alerts=['missing_concept'],
 c=>c.expected_alerts=['sudden','not_a_concept'],
 c=>c.expected_alerts=new Array(25).fill('sudden')]){
   const c=base();amend(c);
   assert.throws(()=>replayShadowCase(c),/LAB_DEIDENTIFIED_CONTRACT_REQUIRED/);
 }
});
