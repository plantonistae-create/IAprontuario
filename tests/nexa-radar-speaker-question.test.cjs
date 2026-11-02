'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../nexa-radar-engine.js');
const scan=transcript=>E.analyze({transcript});

test('synthetic syndrome matrix keeps the next questions tied to the current complaint',()=>{
 const cases=[
  {name:'gastroenterite',speech:'Paciente: Estou com diarreia desde ontem.',finding:'diarrhea',must:['stoolBlood','hydration','oralTolerance'],unrelated:['focal','fourSteps']},
  {name:'cefaleia',speech:'Paciente: Estou com dor de cabeça desde hoje.',finding:'headache',must:['sudden','focal'],unrelated:['stoolBlood','fourSteps']},
  {name:'trauma de joelho',speech:'Paciente: Torci o joelho jogando futebol.',finding:'trauma',must:['neurovascular','jointRange','weightBearing'],unrelated:['stoolBlood','focal']},
  {name:'TCE',speech:'Paciente: Caí e bati a cabeça.',finding:'trauma',must:['consciousness','focal'],unrelated:['stoolBlood','malleoli']},
  {name:'dispneia',speech:'Paciente: Estou com falta de ar.',finding:'dyspnea',must:['spo2','effort','rr'],unrelated:['stoolBlood','fourSteps']},
  {name:'broncoespasmo',speech:'Paciente: Estou chiando e com falta de ar.',finding:'dyspnea',must:['spo2','speechLimit','effort'],unrelated:['stoolBlood','fourSteps']},
  {name:'dor torácica',speech:'Paciente: Tenho dor no peito.',finding:'chest',must:['bp','dyspnea','syncope'],unrelated:['stoolBlood','fourSteps']},
  {name:'dor abdominal',speech:'Paciente: Tenho dor abdominal.',finding:'abdomen',must:['bp','peritonism'],unrelated:['fourSteps','focal']},
  {name:'febre',speech:'Paciente: Estou com febre.',finding:'fever',must:['temperature','immuno'],unrelated:['fourSteps','focal']}
 ];
 for(const scenario of cases){
  const start=performance.now(),result=scan(scenario.speech),elapsed=performance.now()-start;
  const ids=new Set(result.items.map(item=>item.concept));
  assert.equal(result.facts[scenario.finding].state,'known_present',scenario.name+' explicit report');
  for(const id of scenario.must)assert.ok(ids.has(id),scenario.name+' missing '+id);
  for(const id of scenario.unrelated)assert.equal(ids.has(id),false,scenario.name+' irrelevant '+id);
  assert.ok(elapsed<2000,scenario.name+' local analysis exceeded 2 seconds');
 }
});

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

test('speaker attribution carries through multiple sentences until the next labeled turn',()=>{
 const result=scan('Médico: Teve febre. Dor no peito. Paciente: Não.');
 assert.equal(result.facts.fever.state,'not_asked');
 assert.equal(result.facts.chest.state,'known_absent');
 assert.equal(result.alerts.some(a=>a.concept==='chest'),false);
 const reported=scan('Médico: Teve febre. Paciente: Não. Tenho dor no peito.');
 assert.equal(reported.facts.fever.state,'known_absent');
 assert.equal(reported.facts.chest.state,'known_present');
});

test('a head strike activates cranial safety questions without inventing a neurological deficit',()=>{
 const result=scan('Paciente: Bati a cabeça.');
 assert.equal(result.facts.trauma.state,'known_present');
 assert.ok(result.items.some(item=>item.concept==='consciousness'&&item.priority==='critical'));
 assert.ok(result.items.some(item=>item.concept==='focal'&&item.priority==='critical'));
 assert.equal(result.facts.focal.state,'not_asked');
 assert.equal(result.alerts.some(alert=>alert.concept==='focal'),false);
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
