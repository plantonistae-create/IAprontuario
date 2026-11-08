'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
global.NexaRadarEngine=require('../nexa-radar-engine');
require('../nexa-radar-controller');
const {classifyEvidence:classify,evidenceSpeaker:speaker}=NexaRadarController;
const fact=(state,quote,conflict=false,section='transcript')=>({
 state,conflict,currentEvidence:{quote,section,state},evidence:[{quote,section,state}]});
const ctx=(transcript='',fields={})=>({transcript,fields});
test('a clinician repeating a patient quote does not establish patient negation',()=>{
 for(const doctor of ['Médico','Médica','Profissional']){
  const s=doctor+': Nega uso de medicação.\nPaciente: Nega uso de medicação.';
  assert.equal(speaker({section:'transcript',quote:'Nega uso de medicação.'},s),'unknown');
  const r=classify(fact('known_absent','Nega uso de medicação.'),null,ctx(s));
  assert.equal(r.resolves_patient_fact,false);assert.equal(r.confidence,'not_measured');
 }
});
test('explicit contradiction cannot be cleared with not-applicable for a medication field',()=>{
 const t='Paciente: Usa medicação de uso contínuo.';
 const r=classify(fact('known_present','Usa medicação de uso contínuo.',true),
  {action:'not_applicable'},ctx(t,{medicacoes:'Não faz uso contínuo.'}));
 assert.equal(r.code,'contradictory');assert.equal(r.requires_physician_review,true);
 assert.equal(r.resolves_patient_fact,false);
});
test('partial ASR of allergy report remains untrusted even if speaker is labeled patient',()=>{
 for(const state of ['known_present','known_absent']){
  const r=classify(fact(state,'Refere alergia.'),null,
   ctx('Paciente: Refere alergia.'),true);
  assert.equal(r.code,'uncertain_transcript');
  assert.equal(r.resolves_patient_fact,false);
 }
});
test('third-party companion evidence does not override unresolved allergy history',()=>{
 const r=classify(fact('known_absent','Nega alergias.'),null,
  ctx('Acompanhante: Nega alergias.',{alergias:'Não informado'}));
 assert.equal(r.resolves_patient_fact,false);
 assert.equal(r.requires_physician_review,true);
});
test('documentation-only medication history is not first-party speaker evidence',()=>{
 const r=classify(fact('known_absent','Nega medicamentos.','', 'medicacoes'),null,
  ctx('',{medicacoes:'Nega medicamentos.'}));
 assert.equal(r.code,'documented_unattributed');
 assert.equal(r.resolves_patient_fact,false);
});
