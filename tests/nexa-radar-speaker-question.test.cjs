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

test('knee weight bearing does not invoke ankle-specific examination, while ankle trauma still does',()=>{
 const knee=scan('Paciente: Torci o joelho e não consigo apoiar o peso.');
 for(const id of ['malleoli','midfoot','fourSteps'])
  assert.equal(knee.items.some(item=>item.concept===id),false,'knee must not request '+id);
 assert.ok(knee.items.some(item=>item.concept==='neurovascular'));
 const ankle=scan('Paciente: Torci o tornozelo e dói no pé.');
 for(const id of ['malleoli','midfoot','fourSteps'])
  assert.ok(ankle.items.some(item=>item.concept===id),'ankle/foot must retain '+id);
});

test('first-person fainting in chest pain is an explicit alarm; physician question alone is not',()=>{
 const reported=scan('Paciente: Tenho dor no peito e desmaiei.');
 assert.equal(reported.facts.syncope.state,'known_present');
 assert.ok(reported.alerts.some(alert=>alert.concept==='syncope'));
 const question=scan('Médico: Desmaiou. Paciente: Não.');
 assert.equal(question.facts.syncope.state,'known_absent');
 assert.equal(question.alerts.some(alert=>alert.concept==='syncope'),false);
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

test('physician gender or professional label does not lose a short core-history answer',()=>{
 for(const speaker of ['Médico','Médica','Profissional']){
  for(const [question,concept] of [
   ['Você usa algum medicamento','medicines'],
   ['Você tem alergias','allergies'],
   ['Você tem comorbidades','comorbidities']
  ]){
   const prompt=scan(`${speaker}: ${question}.`);
   assert.equal(prompt.facts[concept].state,'not_asked',`${speaker}: question alone is no patient answer`);
   const answered=scan(`${speaker}: ${question}. Paciente: Não.`);
   assert.equal(answered.facts[concept].state,'known_absent',`${speaker}: ${concept}`);
  }
 }
});

test('five-syndrome matrix preserves explicit answers, unresolved ambiguity and safety questions',()=>{
 const cases=[
  {name:'respiratory short denial',speech:'Médico: Está com falta de ar. Paciente: Não.',
   fact:'dyspnea',state:'known_absent',noAlert:'dyspnea',notAsk:'dyspnea'},
  {name:'respiratory ambiguous answer',speech:'Médico: Está com falta de ar. Paciente: Acho que não.',
   fact:'dyspnea',state:'unknown',noAlert:'dyspnea'},
  {name:'gastrointestinal denied blood',speech:'Paciente: Tenho diarreia, mas não há sangue nas fezes.',
   fact:'stoolBlood',state:'known_absent',noAlert:'stoolBlood',notAsk:'stoolBlood'},
  {name:'gastrointestinal documented blood',speech:'Paciente: Tenho diarreia com sangue nas fezes.',
   fact:'stoolBlood',state:'known_present',alert:'stoolBlood'},
  {name:'musculoskeletal inability to bear weight',speech:'Paciente: Torci o joelho e não consigo apoiar o peso.',
   fact:'weightBearing',state:'known_absent',notAsk:'weightBearing'},
  {name:'neurological sudden headache',speech:'Paciente: Dor de cabeça súbita, a pior da vida.',
   fact:'sudden',state:'known_present',alert:'sudden',ask:'focal'},
  {name:'neurological head trauma',speech:'Paciente: Caí e bati a cabeça.',
   fact:'trauma',state:'known_present',ask:'consciousness'},
  {name:'cardiovascular denied fainting',speech:'Paciente: Tenho dor no peito, mas não desmaiei.',
   fact:'syncope',state:'known_absent',noAlert:'syncope',notAsk:'syncope'},
  {name:'cardiovascular documented fainting',speech:'Paciente: Tenho dor no peito e desmaiei.',
   fact:'syncope',state:'known_present',alert:'syncope'},
  {name:'cardiovascular family report',speech:'Paciente: Tenho dor no peito. Minha mãe desmaiou.',
   fact:'syncope',state:'not_asked',noAlert:'syncope',ask:'syncope'}
 ];
 for(const scenario of cases){
  const result=scan(scenario.speech),ids=new Set(result.items.map(item=>item.concept));
  assert.equal(result.facts[scenario.fact].state,scenario.state,scenario.name);
  if(scenario.ask)assert.ok(ids.has(scenario.ask),scenario.name+' safety gap');
  if(scenario.notAsk)assert.equal(ids.has(scenario.notAsk),false,scenario.name+' repeated answer');
  if(scenario.alert)assert.ok(result.alerts.some(item=>item.concept===scenario.alert),scenario.name+' alarm');
  if(scenario.noAlert)assert.equal(result.alerts.some(item=>item.concept===scenario.noAlert),false,scenario.name+' false alarm');
 }
});

test('explicit correction resolves a prior denial; later contradictory reports require confirmation',()=>{
 const corrected=scan('Paciente: Não tenho falta de ar. Na verdade, tenho falta de ar.');
 assert.equal(corrected.facts.dyspnea.state,'known_present');
 assert.equal(corrected.facts.dyspnea.conflict,false);
 const contradictions=[
  ['stoolBlood','Paciente: Tenho diarreia. Não há sangue nas fezes. Depois vi sangue nas fezes.'],
  ['syncope','Paciente: Tenho dor no peito. Não desmaiei. Depois desmaiei.'],
  ['weightBearing','Paciente: Torci o joelho. Não consigo apoiar o peso. Depois consegui apoiar.']
 ];
 for(const [concept,speech] of contradictions){
  const result=scan(speech);
  assert.equal(result.facts[concept].conflict,true,concept+' must retain conflicting evidence');
  assert.ok(result.items.some(item=>item.id==='conflict:'+concept&&item.status==='confirm'),concept+' needs explicit reconciliation');
 }
});

test('a hypothetical fainting warning does not become an observed episode',()=>{
 const result=scan('Paciente: Tenho dor no peito. Médico: Se desmaiar, procure atendimento urgente.');
 assert.equal(result.facts.syncope.state,'not_asked');
 assert.ok(result.items.some(item=>item.concept==='syncope'));
 assert.equal(result.alerts.some(item=>item.concept==='syncope'),false);
});
