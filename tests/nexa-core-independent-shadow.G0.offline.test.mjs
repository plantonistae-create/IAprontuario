// NEXA Core G0 — offline, wholly fictional examples. No API, DB or audio.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  SHADOW_SCHEMA, TRAIN_SCHEMA,
  compareSyntheticShadow,prepareIndependentSyntheticDataset,
} from '../experimental/nexa-core-independent-shadow.G0-NOT-DEPLOYED.mjs';

const q=(id='fever')=>[{concept_id:id,question:'A temperatura foi aferida?'}];
const shadow=()=>({
  schema_version:SHADOW_SCHEMA,source:'synthetic',case_id:'case_fever_alpha',
  reviewed_synthetic_provenance:true,
  reference:{provider:'openai',model_version:'reference-v1',
    transcript:'Paciente relata febre hoje',
    radar_questions:q(),documentation:'Febre relatada, temperatura não aferida.'},
  core:{provider:'nexa-core',model_version:'core-v0',
    transcript:'Paciente relata febre',radar_questions:[],
    documentation:'Febre relatada.'},
  gold:{origin:'independent_human_original',
    transcript:'Paciente relata febre hoje',radar_questions:q(),
    documentation:'Febre relatada, temperatura não aferida.'},
});
const training=()=>({
  schema_version:TRAIN_SCHEMA,case_id:'case_fever_alpha',
  source:'synthetic',origin:'independent_human_original',
  review:{clinician_reviewed:true,no_real_patient_data:true,
    no_openai_assisted_creation:true,original_material_rights_confirmed:true},
  scenario:'Cenário totalmente inventado: pessoa relata sensação febril.',
  target:{transcript:'Paciente fictício relata febre, sem temperatura aferida.',
    radar_questions:q(),documentation:'Febre relatada, temperatura não aferida.'},
});

test('shadow compares two models and only returns aggregated synthetic evaluation',()=>{
  const result=compareSyntheticShadow(shadow());
  assert.equal(result.reference.transcription.wer,0);
  assert.equal(result.core.transcription.wer,0.25);
  assert.equal(result.core.radar.missing_concepts,1);
  assert.equal(result.reference.radar.recall,1);
  assert.equal(result.training_selection_allowed,false);
  assert.equal(result.training_label_allowed,false);
  assert.equal(result.clinical_release_allowed,false);
  assert.equal(result.external_ai_authorized,false);
  assert.equal(JSON.stringify(result).includes('Paciente'),false);
});

test('real, anonymized or unproven provenance is rejected from lab',()=>{
  for(const source of ['real','deidentified','pseudonymized']){
    const obj=shadow();obj.source=source;
    assert.throws(()=>compareSyntheticShadow(obj),/UNVERIFIED_SYNTHETIC_ONLY/);
  }
  const x=shadow();x.reviewed_synthetic_provenance=false;
  assert.throws(()=>compareSyntheticShadow(x),/UNVERIFIED_SYNTHETIC_ONLY/);
});

test('reference output is never a training label or selection signal',()=>{
  const item=training();
  item.reference=shadow().reference;
  assert.throws(()=>prepareIndependentSyntheticDataset([item]),
    /INDEPENDENT_TRAINING_CONTRACT_REQUIRED/);
  const other=training();other.benchmark_score=0.95;
  assert.throws(()=>prepareIndependentSyntheticDataset([other]),
    /INDEPENDENT_TRAINING_CONTRACT_REQUIRED/);
});

test('human-original synthetic review and independent rights required',()=>{
  const x=training();x.review.no_openai_assisted_creation=false;
  assert.throws(()=>prepareIndependentSyntheticDataset([x]),
    /INDEPENDENT_HUMAN_REVIEW_REQUIRED/);
  const y=training();y.origin='openai_generated';
  assert.throws(()=>prepareIndependentSyntheticDataset([y]),
    /INDEPENDENT_SYNTHETIC_ORIGIN_REQUIRED/);
});

test('obvious identifiers rejected; heuristic never represents anonymization',()=>{
  const x=training();x.scenario='Contato do paciente: demo@example.com';
  assert.throws(()=>prepareIndependentSyntheticDataset([x]),
    /ORIGINAL_SYNTHETIC_SCENARIO_REQUIRED/);
  const y=shadow();y.gold.documentation='CPF 123.456.789-00';
  assert.throws(()=>compareSyntheticShadow(y),/GOLD_DOCUMENTATION_REQUIRED/);
});

test('independent synthetic JSONL can be prepared without OpenAI outputs',()=>{
  const x=training();const out=prepareIndependentSyntheticDataset([x]);
  assert.equal(out.status,'SYNTHETIC_JSONL_PREPARED_REVIEW_ONLY');
  assert.equal(out.record_count,1);
  assert.equal(out.training_authorized,false);
  assert.equal(out.clinical_release_allowed,false);
  assert.equal(out.independent_human_provenance_still_requires_verification,true);
  const rows=out.jsonl.trim().split('\n').map(JSON.parse);
  assert.equal(rows[0].input.scenario,x.scenario);
  assert.equal(rows[0].target.documentation,x.target.documentation);
  assert.equal('reference' in rows[0],false);
  assert.equal('benchmark_score' in rows[0],false);
  assert.equal('provider' in rows[0],false);
});

test('no duplicate case and no unreviewed batch',()=>{
  assert.throws(()=>prepareIndependentSyntheticDataset([]),/SYNTHETIC_BATCH_REQUIRED/);
  assert.throws(()=>prepareIndependentSyntheticDataset([training(),training()]),
    /INDEPENDENT_SYNTHETIC_ORIGIN_REQUIRED/);
});

test('current clinical and audit ingress remain unmodified fail closed',()=>{
  const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
  const edge=read('supabase/functions/nexa-source-actions/index.ts');
  const call=read('supabase/functions/realtime-call/index.ts');
  const process=read('supabase/functions/process-consultation/index.ts');
  const audit=read('supabase/functions/submit-audit-case/index.ts');
  assert.match(edge,/DEPLOYED_SOURCE_ACTION_WRITER_AUTHORIZED = false/);
  assert.match(call,/P0_PRE_EGRESS_GATE_C_NO_GO/);
  assert.match(process,/P0_PRE_EGRESS_GATE_C_NO_GO/);
  assert.match(audit,/AUDIT_GATE_C_NO_GO/);
});
