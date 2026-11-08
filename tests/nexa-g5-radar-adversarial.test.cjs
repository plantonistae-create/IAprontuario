'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
global.NexaRadarEngine=require('../nexa-radar-engine');
require('../nexa-radar-controller');
const c=NexaRadarController.classifyEvidence;
const speaker=NexaRadarController.evidenceSpeaker;
const fact=(state,quote,section='transcript',conflict=false)=>({
 state,conflict,currentEvidence:{quote,section,state},
 evidence:[{quote,section,state}]
});
const context=(transcript='',fields={})=>({transcript,fields});
test('even two identical PATIENT turns are not unique evidence origin',()=>{
 const t='Paciente: Nega febre.\nPaciente: Nega febre.';
 assert.equal(speaker({section:'transcript',quote:'Nega febre.'},t),'unknown');
 assert.equal(c(fact('known_absent','Nega febre.'),null,context(t)).resolves_patient_fact,false);
});
test('one PATIENT and one DOCTOR quoting the same symptom do not establish origin',()=>{
 const t='Médico: Tenho falta de ar.\nPaciente: Tenho falta de ar.';
 assert.equal(speaker({section:'transcript',quote:'Tenho falta de ar.'},t),'unknown');
 const result=c(fact('known_present','Tenho falta de ar.'),null,context(t));
 assert.equal(result.code,'uncertain_transcript');assert.equal(result.confidence,'not_measured');
});
test('unfinished recording suppresses otherwise explicit positive evidence until reviewed',()=>{
 const t='Paciente: Relata febre.';
 const result=c(fact('known_present','Relata febre.'),null,context(t),true);
 assert.equal(result.code,'uncertain_transcript');
 assert.equal(result.resolves_patient_fact,false);
});
test('new contradictory speech cannot be overridden by stale manual documentation',()=>{
 const r=c(fact('known_present','Paciente: Febre.', 'transcript',true),
 {action:'answer',documented:'Febre ausente.',section:'hda'},
 context('Paciente: Febre.',{hda:'Febre ausente.'}));
 assert.equal(r.code,'contradictory');assert.equal(r.requires_physician_review,true);
});
test('copied documentation is not an attributed patient statement',()=>{
 const r=c(fact('known_absent','Alergias negadas.','antecedentes'),null,
 context('',{antecedentes:'Alergias negadas.'}));
 assert.equal(r.code,'documented_unattributed');
 assert.equal(r.resolves_patient_fact,false);
});
test('a companion denies a finding; it remains to review, not patient-confirmed',()=>{
 const r=c(fact('unknown','Nega febre.'),null,context('Acompanhante: Nega febre.'));
 assert.equal(r.code,'denied_by_companion');assert.equal(r.requires_physician_review,true);
 assert.equal(r.resolves_patient_fact,false);
});
