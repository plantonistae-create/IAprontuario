/* Decision-impact Radar triage: synthetic cases, no patient information. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../nexa-radar-engine.js');
const scan=(hda,extra={})=>E.analyze({fields:{hda,...extra}});
const present=(r,id)=>r.items.find(x=>x.concept===id);
test('A09 uncomplicated: contextual stool/hydration questions, not Glasgow or generic neuro',()=>{
 const r=scan('Paciente relata diarreia aquosa há dois dias. Sem febre, sem sangue nas fezes, sem dor abdominal intensa.',{hipotese_diagnostica:'A09 - Gastroenterite aguda'});
 for(const id of ['hydration','oralTolerance','urineOutput','stoolMucus'])assert.ok(present(r,id),id);
 assert.equal(present(r,'consciousness'),undefined);
 assert.equal(present(r,'focal'),undefined);
 assert.equal(present(r,'stoolBlood'),undefined,'negative blood in stool was documented');
 assert.equal(present(r,'character'),undefined,'negated abdominal pain must not trigger a generic pain questionnaire');
 assert.equal(present(r,'intensity'),undefined,'negated abdominal pain must not trigger intensity question');
 assert.ok(r.items.indexOf(present(r,'hydration'))<r.items.indexOf(present(r,'allergies')),'decision-relevant item outranks generic history');
 assert.ok(!r.alerts.some(a=>a.concept==='consciousness'));
});
test('A09 without completed history prioritizes blood over hydration and general chart background',()=>{
 const r=scan('Diarreia há um dia.');
 assert.deepEqual(r.items.slice(0,3).map(x=>x.concept),['stoolBlood','hydration','oralTolerance']);
 assert.equal(present(r,'allergies')?.priority,'low');
});
test('A09 with bloody stools: flag documented finding, do not infer bacterial cause or antibiotic treatment',()=>{
 const r=scan('Diarreia com sangue, cólicas intensas, febre alta.',{hipotese_diagnostica:'CID A09'});
 assert.ok(r.alerts.some(a=>a.concept==='stoolBlood'));
 assert.equal(r.facts.stoolBlood.state,'known_present');
 assert.ok(!JSON.stringify(r).toLowerCase().includes('antibiotico indicado'),'bloody stools alone cannot mandate empiric antibiotic');
});
test('A09 spontaneous verbal negatives must not trigger fever or vomiting pathways',()=>{
 const r=scan('Diarreia há dois dias. Não teve febre e não apresenta vômitos.');
 assert.equal(r.facts.fever.state,'known_absent');
 assert.equal(r.facts.giVomiting.state,'known_absent');
 assert.equal(present(r,'fever'),undefined);
 assert.equal(present(r,'giVomiting'),undefined);
});
test('CID A09 routes even when transcript has just early symptom history',()=>{
 const r=scan('Evacuações líquidas há um dia.',{cid:'A09'});
 assert.ok(present(r,'hydration'));
 assert.ok(present(r,'oralTolerance'));
 assert.ok(!present(r,'consciousness'));
});
test('ordinary headache: red-flag onset and focal symptoms precede migrainous characterization',()=>{
 const r=scan('Paciente de 28 anos com cefaleia desde ontem, sem sinais de alarme informados.');
 for(const id of ['sudden','focal','photophobia','phonophobia','headacheNausea','headachePattern'])assert.ok(present(r,id),id);
 assert.equal(present(r,'consciousness'),undefined,'no routine mental status questionnaire in ordinary alert patient');
 assert.ok(r.items.indexOf(present(r,'sudden'))<r.items.indexOf(present(r,'photophobia')));
});
test('real mental-status abnormality is a safety alert across diagnoses, without prior neuro checklist',()=>{
 const gi=scan('Paciente com diarreia e confusão mental.',{hipotese_diagnostica:'A09'});
 assert.ok(gi.alerts.some(x=>x.concept==='consciousness'));
 const headache=scan('Cefaleia súbita. Rebaixamento de consciência.');
 assert.ok(headache.alerts.some(x=>x.concept==='consciousness'));
 assert.equal(present(gi,'consciousness'),undefined);
});
test('URI cough: respiratory physiology and pneumonia differential, not mandatory global neuro',()=>{
 const r=scan('Paciente com tosse e coriza há dois dias.',{hipotese_diagnostica:'J06.9 IVAS'});
 for(const id of ['spo2','rr','fever','auscultation','respFocal'])assert.ok(present(r,id),id);
 assert.equal(present(r,'consciousness'),undefined);
 assert.equal(present(r,'neurovascular'),undefined);
});
test('bronchospasm: severity and ability to speak move into context',()=>{
 const r=scan('Paciente com crise de broncoespasmo, chiado e dispneia.',{cid10:'J45'});
 for(const id of ['speechLimit','spo2','rr','effort'])assert.ok(present(r,id),id);
 assert.equal(present(r,'consciousness'),undefined,'documented altered consciousness would be an alert, not default gap');
});
test('model suggestions cannot elevate unrelated neuro or background history as high-priority A09 prompts',()=>{
 const ctx={fields:{hda:'Diarreia há dois dias.',hipotese_diagnostica:'A09'}};
 const ai=[
  {concept:'consciousness',priority:'critical',contextEvidence:'Diarreia há dois dias.',category:'red_flags'},
  {concept:'allergies',priority:'critical',contextEvidence:'Diarreia há dois dias.',category:'red_flags'},
 ];
 const r=E.analyze(ctx,{},ai);
 assert.equal(present(r,'consciousness'),undefined);
 assert.equal(present(r,'allergies')?.priority,'low');
});
test('extreme documented vital sign is still flagged even in common gastroenteritis',()=>{
 const r=E.analyze({transcript:'Paciente de 32 anos. Diarreia há dois dias. PA 80/50. FC 130.'});
 assert.ok(r.alerts.some(a=>a.concept==='bp'));
});
