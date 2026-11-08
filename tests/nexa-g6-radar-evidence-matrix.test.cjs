'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
global.NexaRadarEngine=require('../nexa-radar-engine');
require('../nexa-radar-controller');
const {classifyEvidence,evidenceSpeaker}=NexaRadarController;
const f=(state,quote,conflict=false,section='transcript')=>({
  state,conflict,currentEvidence:{quote,section,state},evidence:[{quote,section,state}]
});
const ctx=(transcript='',fields={})=>({transcript,fields});
test('patient and companion repeating identical information never creates attributed certainty',()=>{
 const t='Paciente: Nega febre.\nAcompanhante: Nega febre.';
 const proof=classifyEvidence(f('known_absent','Nega febre.'),null,ctx(t));
 assert.equal(evidenceSpeaker({section:'transcript',quote:'Nega febre.'},t),'unknown');
 assert.equal(proof.code,'uncertain_transcript');
 assert.equal(proof.resolves_patient_fact,false);
 assert.equal(proof.confidence,'not_measured');
});
test('repeating patient evidence on separate turns is not proof of unique quotation',()=>{
 const t='Paciente: Não apresenta falta de ar.\nPaciente: Não apresenta falta de ar.';
 const result=classifyEvidence(f('known_absent','Não apresenta falta de ar.'),null,ctx(t));
 assert.equal(result.code,'uncertain_transcript');
 assert.equal(result.requires_physician_review,true);
});
test('doctor, clinician gender variant and LOCUTOR question remain not a patient answer',()=>{
 for(const name of ['Médico','Médica','Profissional']){
  const s=name+': Teve febre?';
  const result=classifyEvidence({...f('not_asked',s),asked:{quote:s}},null,ctx(s));
  assert.equal(result.resolves_patient_fact,false);
  assert.notEqual(result.code,'denied_by_patient');
 }
 const uncertain=classifyEvidence(f('known_absent','Nega febre.'),null,
   ctx('LOCUTOR A (papel não confirmado): Nega febre.'));
 assert.equal(uncertain.speaker,'unknown');
 assert.equal(uncertain.resolves_patient_fact,false);
});
test('companion report does not supersede a later explicit documented contradiction',()=>{
 const t='Acompanhante: Nega febre.\nPaciente: Refere febre.';
 const companion=classifyEvidence(f('unknown','Nega febre.'),null,ctx(t));
 assert.equal(companion.resolves_patient_fact,false);
 const conflict=classifyEvidence(f('known_present','Refere febre.',true),null,ctx(t));
 assert.equal(conflict.code,'contradictory');
 assert.equal(conflict.requires_physician_review,true);
});
test('stale documentation alone has no patient voice, incomplete ASR leaves speaker unresolved',()=>{
 const doc=classifyEvidence(f('known_absent','Nega alergias.',false,'alergias'),null,
  ctx('',{alergias:'Nega alergias.'}));
 assert.equal(doc.code,'documented_unattributed');
 assert.equal(doc.resolves_patient_fact,false);
 const truncated=classifyEvidence(f('known_present','Relata febre.'),null,ctx('Paciente: Relata febre.'),true);
 assert.equal(truncated.code,'uncertain_transcript');
 assert.equal(truncated.resolves_patient_fact,false);
});
test('explicit conflict cannot be marked not applicable even with a manual shortcut',()=>{
 const c=classifyEvidence(f('known_present','Paciente: Febre.',true),{action:'not_applicable'},
   ctx('Paciente: Febre.'));
 assert.equal(c.code,'contradictory');
 assert.equal(c.requires_physician_review,true);
});
