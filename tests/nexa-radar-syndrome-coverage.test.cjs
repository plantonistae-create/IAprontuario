'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),E=require('../nexa-radar-engine.js');
const scan=(hda,fields={})=>E.analyze({fields:{hda,...fields}});
const has=(r,id)=>r.items.some(x=>x.concept===id);
const conditions=[
 ['faringite e odinofagia','Dor de garganta há dois dias.','swallowDifficulty'],
 ['otite','Dor no ouvido desde ontem.','earDischarge'],
 ['sinusite','Dor facial e sinusite há 4 dias.','onset'],
 ['joelho atraumático','Dor no joelho com edema, sem queda.','jointHot'],
 ['ombro pós-trauma','Dor no ombro após queda.','neurovascular'],
 ['lombalgia','Lombalgia há dois dias.','saddle'],
 ['constipação','Constipação há quatro dias.','obstruction'],
 ['dispepsia','Epigastralgia e azia desde ontem.','giBleed'],
 ['sangramento gastrointestinal','Hematêmese desde hoje.','bp'],
 ['palpitações','Palpitações há duas horas.','syncope'],
 ['vertigem','Vertigem rotatória desde ontem.','gaitChange'],
 ['crise convulsiva','Paciente apresentou crise convulsiva.','postictal'],
 ['ITU','Disúria há três dias.','flank'],
 ['cólica renal','Cólica renal desde hoje.','hematuria'],
 ['dor pélvica','Dor pélvica há 12 horas.','pregnancy'],
 ['sangramento vaginal','Sangramento vaginal há dois dias.','pregnancy'],
 ['dermatologia','Exantema e manchas na pele.','skinSpread'],
 ['olho vermelho','Dor no olho vermelho há um dia.','visionChange'],
 ['dor torácica','Dor torácica em aperto.','dyspnea'],
 ['dor abdominal','Dor abdominal e náuseas.','peritonism']
];
for(const [name,text,id] of conditions)test('syndrome: '+name,()=>{
 const r=scan(text);assert.ok(has(r,id),name+' must contain '+id);
 assert.ok(r.items.every(i=>i.reason&&i.question),'reason and question must be shown');
 assert.ok(r.items.every(i=>i.concept!=='consciousness')||name==='crise convulsiva','do not require generic neuro examination');
});
test('post-traumatic shoulder prioritizes regional examination, not systemic arthritis checklist',()=>{
 const r=scan('Paciente com dor no ombro após queda.');
 assert.ok(has(r,'neurovascular'));
 assert.ok(!has(r,'jointHot'),'septic arthritis questionnaire is not default for simple mechanical fall');
});
test('documented altered consciousness remains a finding for simple respiratory complaint',()=>{
 const r=scan('Paciente com tosse e rebaixamento de consciência.');
 assert.ok(r.alerts.some(x=>x.concept==='consciousness'));
});
test('remote suggestions never promote a bare Glasgow checklist in uncomplicated A09',()=>{
 const c={fields:{hda:'Paciente com diarreia há dois dias.',cid:'A09'}};
 const a=E.analyze(c,{},[{concept:'consciousness',priority:'critical',contextEvidence:'diarreia há dois dias',category:'red_flags'}]);
 assert.ok(!has(a,'consciousness'));
});
test('historical chronic conditions do not activate active current syndromes',()=>{
 const r=E.analyze({fields:{hda:'Diarreia desde ontem.',antecedentes:'Otite há 4 anos. Dor no joelho em 2020.'}});
 assert.ok(!r.focus.includes('Otalgia'));
 assert.ok(!r.focus.includes('Artralgia / dor articular'));
});
test('provisional non-core CID routes without requiring a spoken positive finding',()=>{
 const r=scan('Queixa de ouvido',{cid:'H66'});
 assert.ok(has(r,'earDischarge'));
 assert.ok(!has(r,'consciousness'));
});
