'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
global.NexaRadarEngine=require('../nexa-radar-engine');
require('../nexa-radar-controller');
const {classifyEvidence: classify,evidenceSpeaker: speaker}=NexaRadarController;
const proof=(quote,state='known_absent',conflict=false,section='transcript')=>({
 state,conflict,currentEvidence:{quote,state,section},evidence:[{quote,state,section}]
});
const ctx=(transcript='',fields={})=>({transcript,fields});
test('same utterance by two speakers has unknown origin, regardless of chronological order',()=>{
 for(const turns of [
  ['Paciente: Nega febre.','Acompanhante: Nega febre.'],
  ['Acompanhante: Nega febre.','Paciente: Nega febre.'],
  ['Médico: Nega febre.','Paciente: Nega febre.'],
  ['Paciente: Nega febre.','Paciente: Nega febre.']
 ]){
  const text=turns.join('\n');
  assert.equal(speaker({section:'transcript',quote:'Nega febre.'},text),'unknown');
  const r=classify(proof('Nega febre.'),null,ctx(text));
  assert.equal(r.resolves_patient_fact,false);
  assert.equal(r.confidence,'not_measured');
 }
});
test('companion denial, copied histories and unknown LOCUTOR are not attributed patient negations',()=>{
 const a=classify(proof('Nega alergias.'),null,ctx('Acompanhante: Nega alergias.'));
 assert.equal(a.requires_physician_review,true);
 assert.equal(a.resolves_patient_fact,false);
 const b=classify(proof('Nega alergias.','known_absent',false,'alergias'),null,
  ctx('',{alergias:'Nega alergias.'}));
 assert.equal(b.code,'documented_unattributed');
 assert.equal(b.resolves_patient_fact,false);
 const c=classify(proof('Nega alergias.'),null,
  ctx('LOCUTOR A (papel não confirmado): Nega alergias.'));
 assert.equal(c.speaker,'unknown');
 assert.equal(c.resolves_patient_fact,false);
});
test('contradiction takes precedence over both documented answer and not-applicable shortcut',()=>{
 const transcript='Paciente: Refere febre.';
 for(const action of ['answer','not_applicable']){
  const r=classify(proof('Refere febre.','known_present',true),
   {action,documented:'Nega febre.',section:'hda'},
   ctx(transcript,{hda:'Nega febre.'}));
  assert.equal(r.code,'contradictory');
  assert.equal(r.requires_physician_review,true);
 }
});
test('partial ASR quote remains uncertain even if superficially explicit',()=>{
 const r=classify(proof('Relata falta de ar.','known_present'),null,
  ctx('Paciente: Relata falta de ar.'),true);
 assert.equal(r.code,'uncertain_transcript');
 assert.equal(r.resolves_patient_fact,false);
});
test('clinician question alone is never a direct patient answer',()=>{
 const line='Médico: Teve febre?';
 const r=classify({...proof('Teve febre?','not_asked'),asked:{quote:'Teve febre?'}},null,ctx(line));
 assert.equal(r.resolves_patient_fact,false);
 assert.notEqual(r.code,'denied_by_patient');
});
