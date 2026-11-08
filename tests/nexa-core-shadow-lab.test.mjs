import test from 'node:test';
import assert from 'node:assert/strict';
import {replayShadowCase,LAB_CONTRACT} from '../experimental/nexa-core-shadow-lab.mjs';
const sample=()=>({schema_version:LAB_CONTRACT,case_id:'synthetic-headache',
 source:'synthetic',deidentification_reviewed:true,fields:{hda:'Cefaleia.'},
 phrases:[{speaker:'doctor',text:'Você tem febre?'},{speaker:'patient',text:'Não sei informar.'}],
 expected_critical:[]});
test('phrase-by-phrase local+Core shadow replay does not make remote or paid calls',()=>{
 const r=replayShadowCase(sample());
 assert.equal(r.frames.length,2);
 assert.equal(r.summary.local_and_core_api_calls,0);
 assert.equal(r.summary.remote_billing_usd,null);
 assert.equal(r.summary.remote_status,'unavailable');
 assert.equal(r.mode,'shadow_offline');
 assert.equal(r.frames.every(f=>f.remote===null&&f.api_calls===0),true);
 assert.equal(r.frames.every(f=>f.local.provider==='local'&&f.core.provider==='nexa-core-shadow'),true);
 assert.ok(r.summary.latency_p95_ms>=r.summary.latency_p50_ms);
});
test('unanswered question and uncertainty cannot be silently treated as confirmed denial',()=>{
 const r=replayShadowCase(sample());
 for(const frame of r.frames) {
  const status=[...frame.local.evidence,...frame.core.evidence];
  assert.equal(status.some(e=>e.speaker==='doctor'&&e.state==='known_absent'),false);
  assert.equal(frame.local.responses.length,0);
  assert.equal(frame.core.responses.length,0);
 }
});
test('critical expected question not present blocks release for clinical review',()=>{
 const c=sample();c.expected_critical=['sudden'];
 const r=replayShadowCase(c);
 assert.equal(['BLOCKED_CLINICAL_REVIEW_REQUIRED','SYNTHETIC_PASSED_NOT_CLINICALLY_VALIDATED'].includes(r.summary.status),true);
 const missed=r.frames.at(-1).metrics.local.missing_required_critical;
 assert.equal(r.summary.status==='BLOCKED_CLINICAL_REVIEW_REQUIRED',missed.length>0||r.frames.at(-1).metrics.core.missing_required_critical.length>0||r.summary.speaker_attribution_risk_frames>0);
});
test('unreviewed deidentification, identifiers and unapproved data fields fail closed',()=>{
 for(const modify of [
  c=>c.deidentification_reviewed=false,
  c=>c.phrases[0].text='contato teste@empresa.com',
  c=>c.phrases[0].text='Telefone 67999999999',
  c=>c.patient_id='hidden-identity',
  c=>c.phrases[0].speaker='nurse',
  c=>c.fields.nome='Paciente X',
  c=>c.remote_snapshots=[null],
 ]){
  const c=sample();modify(c);assert.throws(()=>replayShadowCase(c),/LAB_DEIDENTIFIED_CONTRACT_REQUIRED/);
 }
});
test('remote provider is never invoked: missing snapshots stays unavailable, supplied ones labeled offline',()=>{
 const c=sample();c.remote_snapshots=[null,{items:[],observations:[],version:'recorded-fixture'}];
 const r=replayShadowCase(c);
 assert.equal(r.frames[0].remote,null);
 assert.equal(r.frames[1].remote.provider,'remote-offline-snapshot');
 assert.equal(r.summary.remote_status,'offline_snapshots_only');
 assert.equal(r.summary.remote_billing_usd,null);
});
