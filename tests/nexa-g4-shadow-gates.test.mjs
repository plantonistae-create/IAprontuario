import test from 'node:test';
import assert from 'node:assert/strict';
import {replayShadowCase,LAB_CONTRACT} from '../experimental/nexa-core-shadow-lab.mjs';
const caseBase=()=>({schema_version:LAB_CONTRACT,case_id:'synthetic-g4-shadow',
 source:'synthetic',deidentification_reviewed:true,
 fields:{hda:'Cefaleia fictícia sem dados identificáveis.'},
 phrases:[{speaker:'doctor',text:'Teve febre?'},{speaker:'patient',text:'Não sei informar.'}],
 expected_critical:[]});
test('local and Core never turn uncertain answers into proven patient denials',()=>{
 const x=replayShadowCase(caseBase()),last=x.frames.at(-1);
 for(const frame of [last.local,last.core]){
  assert.equal(frame.evidence.some(e=>e.concept==='fever'&&e.state==='known_absent'),false);
 }
 assert.equal(x.summary.local_and_core_api_calls,0);
 assert.equal(x.summary.remote_billing_usd,null);
});
test('unmet critical alert contract remains BLOCKED even with approved local lab flag',()=>{
 const c=caseBase();c.expected_alerts=['sudden'];
 c.medical_review={reviewer_verdict:'approved'};
 const x=replayShadowCase(c);
 assert.equal(x.summary.status,'BLOCKED_CLINICAL_REVIEW_REQUIRED');
 assert.equal(x.summary.case_review,'approved');
 assert.ok(x.summary.missed_expected_alerts_local+x.summary.missed_expected_alerts_core>0);
});
test('equal utterance repeated by two speakers must never gain unique patient provenance',()=>{
 const c=caseBase();c.phrases=[{speaker:'patient',text:'Nega febre.'},
  {speaker:'companion',text:'Nega febre.'}];
 const x=replayShadowCase(c);
 assert.equal(x.frames.at(-1).local.evidence.some(e=>
  e.quote.includes('Nega febre.')&&e.speaker==='patient'),false);
});
test('remote snapshots, if supplied, cannot silently repair a missing Core alert',()=>{
 const c=caseBase();c.expected_alerts=['sudden'];
 c.remote_snapshots=c.phrases.map(()=>({version:'synthetic',items:[],observations:[],alerts:[{concept:'sudden'}]}));
 const x=replayShadowCase(c);
 assert.equal(x.summary.status,'BLOCKED_CLINICAL_REVIEW_REQUIRED');
 assert.equal(x.summary.remote_status,'offline_snapshots_only');
});
