'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
global.NexaRadarEngine=require('../nexa-radar-engine');
require('../nexa-radar-controller');
const {classifyEvidence:classify,evidenceSpeaker:speaker}=NexaRadarController;
const fact=(quote,state='known_absent',conflict=false,section='transcript')=>({
 state,conflict,currentEvidence:{quote,state,section},evidence:[{quote,state,section}]
});
const ctx=(transcript='',fields={})=>({transcript,fields});
test('unattributed clinical evidence remains unresolved regardless of its positivity',()=>{
 for(const state of ['known_absent','known_present']){
  const t='Acompanhante: Paciente está com febre.';
  const r=classify(fact('Paciente está com febre.',state),null,ctx(t));
  assert.equal(r.resolves_patient_fact,false);
  assert.equal(r.requires_physician_review,true);
 }
});
test('transcript fragments repeated by two roles are speaker-unknown after either permutation',()=>{
 for(const seq of [
  ['Paciente: Refere dispneia.','Médico: Refere dispneia.'],
  ['Médico: Refere dispneia.','Paciente: Refere dispneia.']
 ]){
  const transcript=seq.join('\n');
  assert.equal(speaker({section:'transcript',quote:'Refere dispneia.'},transcript),'unknown');
  const r=classify(fact('Refere dispneia.','known_present'),null,ctx(transcript));
  assert.equal(r.resolves_patient_fact,false);
  assert.equal(r.confidence,'not_measured');
 }
});
test('conflicting fever report cannot be cleared by a previously documented denial',()=>{
 const r=classify(fact('Relata febre.','known_present',true),
   {action:'answer',documented:'Febre ausente.',section:'hda'},
   ctx('Paciente: Relata febre.',{hda:'Febre ausente.'}));
 assert.equal(r.code,'contradictory');
 assert.equal(r.requires_physician_review,true);
 assert.equal(r.resolves_patient_fact,false);
});
test('unknown LOCUTOR and copied documentation do not become first-party patient facts',()=>{
 const s=classify(fact('Sem alergias conhecidas.'),null,
  ctx('LOCUTOR A (papel não confirmado): Sem alergias conhecidas.'));
 assert.equal(s.speaker,'unknown');assert.equal(s.resolves_patient_fact,false);
 const p=classify(fact('Sem alergias conhecidas.','known_absent',false,'alergias'),null,
  ctx('',{alergias:'Sem alergias conhecidas.'}));
 assert.equal(p.code,'documented_unattributed');
 assert.equal(p.resolves_patient_fact,false);
});
test('a partial answer with ASR still recording requires physician review',()=>{
 const x=classify(fact('Nega dispneia.','known_absent'),null,
  ctx('Paciente: Nega dispneia.'),true);
 assert.equal(x.code,'uncertain_transcript');assert.equal(x.resolves_patient_fact,false);
});
