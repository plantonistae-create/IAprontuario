'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
global.NexaRadarEngine=require('../nexa-radar-engine');
require('../nexa-radar-controller');
const {classifyEvidence,evidenceSpeaker}=NexaRadarController;
const fact=(quote,state='known_absent',conflict=false,section='transcript')=>
 ({state,conflict,currentEvidence:{quote,state,section},evidence:[{quote,state,section}]});
const cx=(transcript='',fields={})=>({transcript,fields});
test('speaker ambiguity must persist under permutation of identical patient/companion quotes',()=>{
 for(const transcript of [
  'Paciente: Nega alergias.\nAcompanhante: Nega alergias.',
  'Acompanhante: Nega alergias.\nPaciente: Nega alergias.'
 ]){
  assert.equal(evidenceSpeaker({section:'transcript',quote:'Nega alergias.'},transcript),'unknown');
  const r=classifyEvidence(fact('Nega alergias.'),null,cx(transcript));
  assert.equal(r.code,'uncertain_transcript');
  assert.equal(r.confidence,'not_measured');
  assert.equal(r.resolves_patient_fact,false);
 }
});
test('multiple clinician questions are not evidence that the patient denied anything',()=>{
 const transcript='Médico: Tem falta de ar?\nMédico: Tem falta de ar?';
 const r=classifyEvidence({...fact('Tem falta de ar?','not_asked'),
  asked:{quote:'Tem falta de ar?'}},null,cx(transcript));
 assert.equal(r.resolves_patient_fact,false);
 assert.notEqual(r.code,'denied_by_patient');
});
test('a companion answer alone does not establish direct patient negation',()=>{
 for(const phrase of ['Nega alergias.','Não tem febre.']){
  const r=classifyEvidence(fact(phrase),null,cx('Acompanhante: '+phrase));
  assert.equal(r.resolves_patient_fact,false);
  assert.equal(r.requires_physician_review,true);
 }
});
test('new conflicting evidence overrides a stale answered shortcut',()=>{
 const t='Paciente: Teve febre.';
 for(const action of ['answer','not_applicable']){
  const r=classifyEvidence(fact('Teve febre.','known_present',true),
    {action,documented:'Febre negada.',section:'hda'},cx(t,{hda:'Febre negada.'}));
  assert.equal(r.code,'contradictory');
  assert.equal(r.requires_physician_review,true);
 }
});
test('a copied clinical field never fabricates patient speech and incomplete ASR stays uncertain',()=>{
 const r=classifyEvidence(fact('Nega uso contínuo.','known_absent',false,'medicacoes'),
  null,cx('',{medicacoes:'Nega uso contínuo.'}));
 assert.equal(r.code,'documented_unattributed');
 assert.equal(r.resolves_patient_fact,false);
 const cut=classifyEvidence(fact('Refere febre.','known_present'),null,
  cx('Paciente: Refere febre.'),true);
 assert.equal(cut.code,'uncertain_transcript');
 assert.equal(cut.resolves_patient_fact,false);
});
