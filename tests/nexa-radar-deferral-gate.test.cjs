'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {inspectRadarDeferral,summarizeGateSequence}=
 require('../experimental/nexa-radar-deferral-gate.cjs');
const {simulateRadarCadence}=require('../experimental/nexa-radar-cadence-lab.cjs');

function sample(transcript='Paciente: Tenho tosse há dois dias.',overrides={}){
 return {owner:'medico-sintetico',encounter:'caso-sintetico-1',
  recordingState:'recording',transcriptStatus:'live',
  transcript,fields:{hda:'Tosse há dois dias.'},...overrides};
}
function mustImmediate(before,after,reason=null,flags={}){
 const value=inspectRadarDeferral(before,after,flags);
 assert.equal(value.decision,'immediate',JSON.stringify({reason:value.reason}));
 if(reason)assert.equal(value.reason,reason);
 assert.ok(!JSON.stringify(value).includes('Paciente:'),
  'never leak clinical excerpts through technical decision');
 return value;
}

test('conservative deferral gate is offline and not referenced by clinical production',()=>{
 for(const path of ['index.html','nexa-radar-controller.js',
   'supabase/functions/realtime-radar/index.ts','supabase/functions/realtime-call/index.ts']){
  assert.ok(!readFileSync(path,'utf8').includes('nexa-radar-deferral-gate'));
 }
 assert.deepEqual(inspectRadarDeferral(null,sample()),{
  decision:'immediate',reason:'FIRST_CONTEXT',localChanged:null
 });
 const dup=inspectRadarDeferral(sample(),sample());
 assert.deepEqual(dup,{decision:'exact_duplicate',reason:'IDENTICAL_CONTEXT',localChanged:false});
});

test('new words that the real clinical engine does not recognize still forbid deferral',()=>{
 const a=sample();
 const b=sample(a.transcript+'\nPaciente: termo_inesperado_zxq981.');
 const decision=mustImmediate(a,b,'UNRECOGNIZED_OR_REPHRASED_EVIDENCE');
 assert.equal(decision.localChanged,false,
   'an unchanged rule engine must not justify waiting for remote interpretation');
});

test('negation, numerical doses, speaker and contradictions never permit delay',()=>{
 const variants=[
  ['Paciente: Tenho alergias.','Paciente: Não tenho alergias.'],
  ['Paciente: Uso 5 mg ao dia.','Paciente: Uso 50 mg ao dia.'],
  ['Paciente: Desmaiei.','Acompanhante: Desmaiei.'],
  ['Paciente: Nego dor.','Paciente: Nego dor.\nPaciente: Agora sinto dor intensa.'],
  ['Médico: Teve febre? Paciente: Não.','Médico: Teve febre? Paciente: Sim.']
 ];
 for(const [before,after] of variants)mustImmediate(sample(before),sample(after));
});

test('field updates and clinical boundaries always require immediate fresh processing',()=>{
 const base=sample();
 mustImmediate(base,sample(base.transcript,{fields:{hda:'Tosse com dispneia.'}}),
  'CLINICAL_FIELDS_CHANGED');
 mustImmediate(base,sample(base.transcript,{fields:{hda:base.fields.hda},cid:'R06.0'}),
  'CLINICAL_FIELDS_CHANGED');
 mustImmediate(base,sample(base.transcript,{owner:'outro-medico'}),
  'OWNER_OR_ENCOUNTER_CHANGED');
 mustImmediate(base,sample(base.transcript,{encounter:'outro-caso'}),
  'OWNER_OR_ENCOUNTER_CHANGED');
 for(const state of ['paused','stopped','failed'])
  mustImmediate(base,sample(base.transcript,{recordingState:state}),
   'RECORDING_OR_TRANSCRIPT_STATE_CHANGED');
 mustImmediate(base,sample(base.transcript,{transcriptStatus:'stale'}),
  'RECORDING_OR_TRANSCRIPT_STATE_CHANGED');
 mustImmediate(base,sample(base.transcript,{transcriptStatus:'unavailable'}),
  'RECORDING_OR_TRANSCRIPT_STATE_CHANGED');
 mustImmediate(base,base,null,{closing:true});
 mustImmediate(base,base,null,{retry:true});
 mustImmediate(base,base,null,{force:true});
 mustImmediate(base,sample(base.transcript,{fields:null}),
  'INVALID_OR_MISSING_CONTEXT');
});

test('five clinical domains forbid deferral of every new recognized and unrecognized utterance',()=>{
 const cases=[
  {area:'respiratória',chief:'Tosse.',danger:'Paciente: Estou com falta de ar.'},
  {area:'gastrointestinal',chief:'Diarreia.',danger:'Paciente: Sangue nas fezes.'},
  {area:'osteomuscular',chief:'Dor no joelho.',danger:'Paciente: Caí e não consigo apoiar.'},
  {area:'neurológica',chief:'Cefaleia.',danger:'Paciente: A dor começou de repente.'},
  {area:'cardiovascular',chief:'Palpitações.',danger:'Paciente: Desmaiei.'}
 ];
 for(const c of cases){
  const events=[],lines=['Paciente: '+c.chief];
  for(let index=0;index<9;index++){
   if(index>0)lines.push(index===3?c.danger:'Paciente: Informação nova '+index+'.');
   events.push({atMs:index*8000,urgent:false,fields:{hda:c.chief},
    transcript:lines.join('\n'),owner:'medico-sintetico',encounter:'caso-'+c.area,
    recordingState:'recording',transcriptStatus:'live'});
  }
  const audit=summarizeGateSequence(events);
  assert.equal(audit.mustAnalyzeImmediately,9,c.area);
  assert.equal(audit.exactDuplicates,0,c.area);
  assert.equal(audit.approvedForLongerCadence,false,c.area);
  const fast=simulateRadarCadence(events,{cadenceMs:1500});
  for(const cadenceMs of [12000,16000]){
   const candidate=simulateRadarCadence(events,{cadenceMs});
   assert.ok(candidate.calls<fast.calls,c.area);
   assert.ok(candidate.evidenceDelaysMs.some(ms=>ms>0),
    'fewer remote calls entail delayed unreviewed clinical evidence in '+c.area);
   assert.equal(candidate.finalTranscriptCovered,true);
  }
 }
});

test('true duplicate inputs can be suppressed without a longer clinical cadence',()=>{
 const c=sample(),d={...c,fields:{...c.fields}};
 const audit=summarizeGateSequence([c,d,sample(c.transcript+'\nPaciente: Mais uma informação.')]);
 assert.deepEqual(audit.decisions.map(x=>x.decision),
  ['immediate','exact_duplicate','immediate']);
 assert.equal(audit.exactDuplicates,1);
 assert.equal(audit.approvedForLongerCadence,false);
 assert.ok(!JSON.stringify(audit).includes(c.transcript));
});

test('invalid or ambiguous event shapes always fail closed',()=>{
 assert.equal(inspectRadarDeferral(sample(),{fields:{},transcript:'x'}).decision,'immediate');
 assert.throws(()=>summarizeGateSequence([]),/INVALID_RADAR_GATE_EVENTS/);
 assert.throws(()=>summarizeGateSequence(Array(201).fill(sample())),/INVALID_RADAR_GATE_EVENTS/);
});
