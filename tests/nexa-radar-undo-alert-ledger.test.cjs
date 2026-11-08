const {test}=require('node:test');
const assert=require('node:assert/strict');
global.NexaRadarEngine=require('../nexa-radar-engine');
require('../nexa-radar-controller');
function fixture(fields={hda:'Dor torácica.'}){
 let ctx={fields:{...fields}},saves=0;
 const api=NexaRadarController.create({context:()=>ctx,publish(){},apply:f=>{ctx={...ctx,fields:f}},persist(){saves++},analyze:async()=>({items:[],observations:[]})});
 api.setOwner('synthetic-doctor');api.recalculate();
 return {api,get context(){return ctx},set:c=>ctx=c,get saves(){return saves}};
}
test('last medical answer can be undone without inventing a negative; audited',()=>{
 const f=fixture(),api=f.api,before=structuredClone(f.context.fields);
 assert.equal(api.respond('dyspnea','Não'),true);
 assert.equal(api.state.facts.dyspnea.state,'known_absent');
 assert.equal(api.state.undoAvailable,true);
 assert.equal(api.undoLast(),true);
 assert.deepEqual(f.context.fields,before);
 assert.equal(api.state.facts.dyspnea.state,'not_asked');
 assert.deepEqual(api.snapshot().ledger,{});
 assert.equal(api.snapshot().clinicalAudit.at(-1).action,'undo');
 assert.equal(api.undoLast(),false);api.reset();
});
test('undo refuses new clinician edits, additional spoken evidence and cross-encounter rewind',()=>{
 const f=fixture();f.api.respond('dyspnea','Não');
 const now=f.context.fields.hda;
 f.set({...f.context,fields:{...f.context.fields,hda:now+' Nova observação.'}});
 f.api.recalculate();assert.equal(f.api.undoLast(),false);
 assert.equal(f.context.fields.hda,now+' Nova observação.');
 f.api.reset();
 const x=fixture();x.api.respond('dyspnea','Não');
 x.set({...x.context,transcript:'Paciente: Outra informação.'});x.api.recalculate();
 assert.equal(x.api.undoLast(),false);x.api.reset();
});
test('audit remains scoped to authenticated owner; reload cannot resurrect undo',()=>{
 const f=fixture();f.api.respond('dyspnea','Não');
 const snapshot=f.api.snapshot();
 f.api.restore(snapshot,'synthetic-doctor');
 assert.ok(f.api.snapshot().clinicalAudit.length);
 assert.equal(f.api.undoLast(),false);
 f.api.restore(snapshot,'unrelated-doctor');
 assert.equal(f.api.snapshot().clinicalAudit.length,0);
 assert.deepEqual(f.api.snapshot().ledger,{});
 f.api.reset();
});
test('critical status action stays visible as review-required safety item',()=>{
 const f=fixture({hda:'Cefaleia.'});
 const item=f.api.state.items.find(i=>i.priority==='critical');
 assert.ok(item);
 assert.equal(f.api.respond(item.id,'Já avaliado','evaluated'),true);
 assert.equal(f.api.state.reviewAlerts.some(a=>a.id==='finding:'+item.concept),true);
 assert.equal(f.api.state.dispositionCaution,true);
 assert.equal(f.api.reviewAlert('finding:'+item.concept,'OK'),false);
 assert.equal(f.api.reviewAlert('finding:'+item.concept,'Reavaliado pelo médico, mantendo julgamento clínico.'),true);
 f.api.reset();
});
test('prior alert cannot disappear without medical review justification',()=>{
 const f=fixture({hda:'Cefaleia.',exame_fisico:'Rigidez de nuca presente.'}),api=f.api;
 assert.ok(api.state.alerts.some(a=>a.id==='finding:meningism'));
 f.set({fields:{hda:'Cefaleia.',exame_fisico:''}});api.recalculate();
 assert.equal(api.state.reviewAlerts.some(a=>a.id==='finding:meningism'),true);
 assert.equal(api.state.dispositionCaution,true);
 assert.equal(api.reviewAlert('finding:meningism','OK'),false);
 assert.equal(api.reviewAlert('finding:meningism','Reavaliação médica documentada sem achado atual.'),true);
 assert.equal(api.snapshot().alertJournal.find(e=>e.id==='finding:meningism').status,'reviewed');
 f.set({fields:{hda:'Cefaleia.',exame_fisico:'Rigidez de nuca presente.'}});api.recalculate();
 assert.equal(api.snapshot().alertJournal.find(e=>e.id==='finding:meningism').status,'active');
 api.reset();
});

test('ASR-only safety transitions request owner-scoped persistence without repeated saves',async()=>{
 const f=fixture({hda:'Cefaleia.'});
 const start=f.saves;
 f.set({fields:{hda:'Cefaleia.',exame_fisico:'Rigidez de nuca presente.'}});
 f.api.recalculate();await Promise.resolve();await Promise.resolve();
 assert.equal(f.saves,start+1,'newly detected risk must be persisted');
 f.api.recalculate();await Promise.resolve();await Promise.resolve();
 assert.equal(f.saves,start+1,'identical evidence does not rewrite snapshot');
 f.set({fields:{hda:'Cefaleia.',exame_fisico:''}});
 f.api.recalculate();await Promise.resolve();await Promise.resolve();
 assert.equal(f.saves,start+2,'previously detected risk remains pending and persisted');
 const snapshot=f.api.snapshot();
 assert.ok(snapshot.alertJournal.some(e=>e.id==='finding:meningism'&&e.status==='pending'));
 f.api.reset();
});
