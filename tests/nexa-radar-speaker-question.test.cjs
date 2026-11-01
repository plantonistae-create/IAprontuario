'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../nexa-radar-engine.js');
const scan=transcript=>E.analyze({transcript});

test('physician questions without ASR punctuation do not become patient positives',()=>{
 const fever=scan('Médico: Teve febre. Paciente: Não.');
 assert.equal(fever.facts.fever.state,'known_absent');
 assert.equal(fever.alerts.some(a=>a.concept==='fever'),false);
 const breath=scan('Médico: Tem falta de ar. Paciente: Não.');
 assert.equal(breath.facts.dyspnea.state,'known_absent');
 assert.equal(breath.alerts.some(a=>a.concept==='dyspnea'),false);
});

test('a physician prompt alone remains an unanswered gap',()=>{
 for(const transcript of ['Médico: Dor no peito.','Médico: Febre.','Médico: Você tem falta de ar.']){
  const result=scan(transcript);
  assert.equal(result.facts.chest.state==='known_present'||result.facts.fever.state==='known_present'||result.facts.dyspnea.state==='known_present',false,transcript);
 }
});

test('companion statements remain to confirm and cannot resolve the physician question',()=>{
 const answer=scan('Médico: Teve febre. Acompanhante: Não.');
 assert.equal(answer.facts.fever.state,'not_asked');
 const report=scan('Acompanhante: Ele teve febre.');
 assert.equal(report.facts.fever.state,'unknown');
 assert.equal(report.alerts.some(a=>a.concept==='fever'),false);
});

test('explicit patient reports and clinician measurements still count',()=>{
 assert.equal(scan('Paciente: Teve febre.').facts.fever.state,'known_present');
 assert.equal(scan('Médico: PA 80/50.').facts.bp.state,'known_present');
});

test('compound questions with an elliptical response remain unresolved',()=>{
 const result=scan('Médico: Teve febre ou falta de ar. Paciente: Não.');
 assert.equal(result.facts.fever.state,'unknown');
 assert.equal(result.facts.dyspnea.state,'unknown');
});
