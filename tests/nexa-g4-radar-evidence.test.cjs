'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
global.NexaRadarEngine=require('../nexa-radar-engine');require('../nexa-radar-controller');
const {classifyEvidence,evidenceSpeaker}=NexaRadarController;
const fact=(state,quote,conflict=false)=>({state,conflict,currentEvidence:{section:'transcript',quote,state},
 evidence:[{section:'transcript',quote,state}]});
const ctx=transcript=>({transcript,fields:{hda:'Febre negada e depois relatada.'}});
test('duplicated identical quote between patient and companion remains unknown',()=>{
 const t='Paciente: Nega febre.\nAcompanhante: Nega febre.';
 assert.equal(evidenceSpeaker({section:'transcript',quote:'Nega febre.'},t),'unknown');
 const r=classifyEvidence(fact('known_absent','Nega febre.'),null,ctx(t));
 assert.equal(r.code,'uncertain_transcript');assert.equal(r.resolves_patient_fact,false);
 assert.equal(r.confidence,'not_measured');
});
test('unverified LOCUTOR acoustic clusters cannot become patient evidence',()=>{
 const r=classifyEvidence(fact('known_absent','Nega febre.'),null,
  ctx('LOCUTOR A (papel não confirmado): Nega febre.'));
 assert.equal(r.speaker,'unknown');assert.equal(r.resolves_patient_fact,false);
});
test('companion denials and reports retain provenance without resolving patient facts',()=>{
 for(const [quote,state,code] of [['Nega febre.','unknown','denied_by_companion'],
  ['Relata febre.','unknown','reported_by_companion']]){
  const r=classifyEvidence(fact(state,quote),null,ctx('Acompanhante: '+quote));
  assert.equal(r.code,code);assert.equal(r.resolves_patient_fact,false);
 }
});
test('contradiction outranks manual confirmation and not-applicable cannot hide present evidence',()=>{
 const r=classifyEvidence(fact('known_present','Paciente: Febre.',true),
  {action:'answer',documented:'Febre negada',section:'hda'},
  {transcript:'Paciente: Febre.',fields:{hda:'Febre negada'}});
 assert.equal(r.code,'contradictory');assert.equal(r.requires_physician_review,true);
 const na=classifyEvidence(fact('known_present','Paciente: Febre.'),
  {action:'not_applicable'},ctx('Paciente: Febre.'));
 assert.notEqual(na.code,'not_applicable');
});
test('unknown statement, silence and unanswered physician question cannot be denial',()=>{
 for(const quote of ['Paciente: Não sei informar.','Paciente: Talvez.']){
  const r=classifyEvidence(fact('unknown',quote),null,ctx(quote));
  assert.equal(r.code,'does_not_know');assert.equal(r.resolves_patient_fact,false);
 }
 const r=classifyEvidence({state:'not_asked',asked:{quote:'Médico: Febre?'}},
  null,ctx('Médico: Febre?'));
 assert.equal(r.code,'awaiting_response');
});
