import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPTURE_SCHEMA, DATASET_SCHEMA,
  prepareClinicalCaptureEnvelope,
  buildIndependentSyntheticBundle
} from '../experimental/nexa-core-capture-export.G0-NOT-DEPLOYED.mjs';

const sample=()=>({
  case_id:'caso_sintetico_01',origin:'synthetic_original',
  provenance:{
    original_human_authored:true,no_real_patient_data:true,
    no_provider_output_labels:true,reviewed_by_clinician:true,
    rights_confirmed:true
  },
  audio:{
    ref:'lab://audio/caso_sintetico_01.wav',
    mime:'audio/wav',
    sha256:'sha256:'+'b'.repeat(64),duration_ms:5300
  },
  reference_transcript:'Paciente fictício apresenta tosse há dois dias.',
  clinical_context:'Cenário fictício: adulto com tosse há dois dias sem dispneia.',
  radar_questions:[{concept_id:'febre',question:'Apresentou febre?'},{concept_id:'dispneia',question:'Apresentou falta de ar?'}],
  reference_documentation:'HDA: tosse há dois dias, sem dispneia.'
});

test('G0 produces three consistent original synthetic JSONL datasets',()=>{
  const out=buildIndependentSyntheticBundle([sample()],{datasetVersion:'lab-v1'});
  assert.equal(out.status,'SYNTHETIC_LAB_EXPORT_READY');
  assert.deepEqual(out.counts,{asr:1,radar:1,documentation:1});
  assert.equal(out.training_on_real_patients_allowed,false);
  const rows=Object.values(out.files).map(t=>JSON.parse(t.trim()));
  assert(rows.every(x=>x.schema_version===DATASET_SCHEMA&&x.case_id==='caso_sintetico_01'));
  assert.equal(new Set(rows.map(x=>x.split)).size,1);
  assert.equal(rows[0].target.transcript,sample().reference_transcript);
  assert.equal(rows[1].target.questions.length,2);
  assert.equal(rows[2].target.documentation,sample().reference_documentation);
});
test('G0 omits ASR when no licensed synthetic audio is supplied',()=>{
  const s=sample();s.audio=null;
  const result=buildIndependentSyntheticBundle([s],{datasetVersion:'lab-v1'});
  assert.equal(result.counts.asr,0);
  assert.equal(result.files.asr_jsonl,'');
  assert.equal(result.counts.documentation,1);
});
test('G0 never exports clinical assistance even with user-supplied consent flags',()=>{
  const clinical={...sample(),origin:'real_clinical',consent:true,
    training_approved:true};
  assert.throws(()=>buildIndependentSyntheticBundle([clinical],{datasetVersion:'lab-v1'}),/REAL_CLINICAL_TRAINING_EXPORT_BLOCKED/);
  assert.throws(()=>buildIndependentSyntheticBundle([{...clinical,origin:'clinical_assistance'}],{datasetVersion:'lab-v1'}),/REAL_CLINICAL_TRAINING_EXPORT_BLOCKED/);
});
test('G0 rejects provider-derived labels and direct identifiers',()=>{
  const derived=sample();derived.provenance.no_provider_output_labels=false;
  assert.throws(()=>buildIndependentSyntheticBundle([derived],{datasetVersion:'lab-v1'}),/SYNTHETIC_PROVENANCE_NOT_VERIFIED/);
  const pii=sample();pii.reference_transcript='CPF: 123.456.789-01';
  assert.throws(()=>buildIndependentSyntheticBundle([pii],{datasetVersion:'lab-v1'}),/INDEPENDENT_TRANSCRIPT_REQUIRED/);
});
test('G0 rejects duplicates, malformed audio and extra metadata',()=>{
  const one=sample();
  assert.throws(()=>buildIndependentSyntheticBundle([one,one],{datasetVersion:'lab-v1'}),/INDEPENDENT_SYNTHETIC_CASE_REQUIRED/);
  one.audio={...one.audio,ref:'https://example.com/real-patient.wav'};
  assert.throws(()=>buildIndependentSyntheticBundle([one],{datasetVersion:'lab-v1'}),/SYNTHETIC_AUDIO_ASSET_REQUIRED/);
});
test('real clinical capture is only an in-memory non-exportable descriptor',()=>{
  const rec=prepareClinicalCaptureEnvelope({
    schema_version:CAPTURE_SCHEMA,
    encounter_id:'11111111-1111-4111-8111-111111111111',
    owner_user_id:'22222222-2222-4222-8222-222222222222',
    source_version:1,captured_at:'2026-11-22T12:00:00.000Z',
    artifacts:{
      audio_reference:null,raw_transcript:'Fala original',
      corrected_transcript:'Fala revisada',speaker_segments:[],
      clinical_fields:{hda:'Registro assistencial'},radar_events:[],
      physician_corrections:[],model_versions:{}
    }
  });
  assert.equal(rec.origin,'clinical_assistance');
  assert.equal(rec.artifacts.clinical_fields.hda,'Registro assistencial');
  assert.equal(rec.persistently_saved,false);
  assert.equal(rec.training_export_allowed,false);
  assert.equal(rec.external_egress_authorized,false);
  assert.throws(()=>buildIndependentSyntheticBundle([rec],{datasetVersion:'lab-v1'}),/REAL_CLINICAL_TRAINING_EXPORT_BLOCKED/);
});
