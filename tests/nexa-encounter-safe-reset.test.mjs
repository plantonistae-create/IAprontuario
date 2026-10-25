import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync(new URL('../nexa-audit-outbox-v18.9.19.js',import.meta.url),'utf8');
const UUID='11111111-1111-4111-8111-111111111111',WHO='doctor-A';
function fixture({syncState='conflict',confirmSequence=[true,true],getFails=false,outboxFails=false,modifySaved=false,partial=false,locked=false}={}){
 const rows=new Map(),handlers=new Map(),toasts=[],prompts=[];
 let cleared=0,rotated=0,started=0,flushed=0,remoteSends=0;
 const fields={queixa_principal:partial?'':"Dor torácica",hda:partial?'HDA curta':'Dor torácica iniciada há cerca de duas horas, acompanhada por familiar.',comorbidades:'HAS',antecedentes:'',medicacoes:'',alergias:'',hipotese_diagnostica:'Dor torácica',orientacoes_alta:'',sugestoes_perguntas:'',exame_fisico:'Sem sinais de desconforto.',sinais_vitais:'',conduta:'ECG e reavaliação'};
 let stored=null,encounter=UUID;
 const resetButton={onclick:()=>{
   cleared++;
   for(const key of Object.keys(fields))fields[key]='';
   events('nexa:consultation-reset');
 }};
 const recBtn={dataset:{recordingState:'idle'}};
 const document={
  documentElement:{dataset:{}},hidden:false,
  body:{appendChild(el){toasts.push(el)}},
  querySelector(sel){const m=sel.match(/data-key="([^"]+)"/);return m?{value:fields[m[1]]||''}:null},
  getElementById(id){
   if(id==='resetBtn')return resetButton;
   if(id==='recBtn')return recBtn;
   if(id==='conductRecordText')return {value:fields.conduta};
   if(id==='aiHypothesisOriginal')return{textContent:''};
   if(id==='physicianHypothesis')return {value:''};
   if(id==='physicianCid')return {value:''};
   return null;
  },
  createElement(){return{style:{},remove(){},set textContent(v){this._text=v},get textContent(){return this._text}}},
  addEventListener(){}
 };
 function on(type,fn){if(!handlers.has(type))handlers.set(type,new Set());handlers.get(type).add(fn)}
 function off(type,fn){handlers.get(type)?.delete(fn)}
 function events(type,detail){for(const fn of handlers.get(type)||[])fn({type,detail})}
 const autosave={
  currentEncounterId:()=>encounter,
  rotateEncounter:()=>{encounter='';rotated++},
  startNew:async()=>{encounter='22222222-2222-4222-8222-222222222222';started++;return{encounter_id:encounter}},
  preserve:async()=>{stored={
     encounter_id:UUID,owner_user_id:WHO,fields:structuredClone(fields),
     sync_state:syncState,local_revision:3,last_client_saved_at:'2026-10-25T13:00:00Z'
    };if(modifySaved)stored.fields.hda='VERSÃO ANTIGA';return structuredClone(stored)},
  get:async()=>getFails?null:stored&&structuredClone(stored),
  flush:async()=>{flushed++;return{}}
 };
 const context={console,document,structuredClone,AbortController,
  crypto:{randomUUID:()=>UUID},setTimeout:()=>0,clearTimeout(){},
  addEventListener:on,removeEventListener:off,
  dispatchEvent:(x)=>{events(x.type,x.detail);return true},
  CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},
  navigator:{onLine:true},window:null,
  sessionStorage:{getItem:()=>'',setItem(){},removeItem(){}},
  indexedDB:{open(){throw Error('IndexedDB adapter should be installed for test')}},
  confirm:msg=>{prompts.push(msg);return confirmSequence.length?confirmSequence.shift():true},
  fetch:async()=>{remoteSends++;return{ok:true,json:async()=>({ok:true})}}
 };
 context.window=context;
 context.nexaClinicalRuntime18121={getProfile:()=>({id:WHO}),supabaseUrl:'https://synthetic.supabase.co'};
 context.nexaClinicalSupabase18101={supabaseUrl:'https://synthetic.supabase.co',auth:{getSession:async()=>({data:{session:{access_token:'synthetic-token',user:{id:WHO}}},error:null})}};
 context.nexaEncounterAutosave18101=autosave;
 vm.runInNewContext(code,context);
 const api=context.nexaAuditOutbox18919;
 api.setStoreAdapter({
  get:async id=>rows.has(id)?structuredClone(rows.get(id)):null,
  put:async item=>{if(outboxFails)throw Error('SIMULATED_INDEXEDDB_WRITE_FAILURE');rows.set(item.idempotency_key,structuredClone(item));return structuredClone(item)},
  all:async()=>[...rows.values()].map(structuredClone)
 });
 if(locked){
   rows.set(UUID+':final-v1',{idempotency_key:UUID+':final-v1',source_consultation_id:UUID,
    owner_user_id:WHO,state:'locked'});
 }
 return{api,fields,rows,autosave,prompts,toasts,recBtn,
  get cleared(){return cleared},get rotated(){return rotated},get started(){return started},get flushed(){return flushed},get remoteSends(){return remoteSends},
  setRecord:rec=>stored=rec,dispatch:events};
}
test('conflict checkpoint is durable and held from audit while new encounter resets exactly once',async()=>{
 const f=fixture();
 await f.api.beforeReset({id:'nexaTopReset'});
 assert.equal(f.cleared,1);
 assert.equal(f.rotated,1);
 assert.equal(f.started,1);
 assert.equal(f.prompts.length,2);
 const snapshot=f.rows.get(UUID+':final-v1');
 assert.equal(snapshot.state,'held_conflict');
 assert.match(snapshot.payload.fields.hda,/acompanhada por familiar/);
 assert.equal(f.remoteSends,0);
 const result=await f.api.flush('test');
 assert.equal(result.sent,0);
 assert.equal(f.remoteSends,0);
 assert.deepEqual(f.fields,{queixa_principal:'',hda:'',comorbidades:'',antecedentes:'',medicacoes:'',alergias:'',hipotese_diagnostica:'',orientacoes_alta:'',sugestoes_perguntas:'',exame_fisico:'',sinais_vitais:'',conduta:''});
});
test('a clinician can decline new encounter, retaining the conflict and UI',async()=>{
 const f=fixture({confirmSequence:[true,false]});
 await f.api.beforeReset({id:'nexaTopReset'});
 assert.equal(f.cleared,0);
 assert.match(f.fields.hda,/acompanhada/);
 assert.equal(f.rows.get(UUID+':final-v1').state,'held_conflict');
});
test('unverified local checkpoint must never permit deletion',async()=>{
 for(const opts of [{getFails:true},{modifySaved:true},{outboxFails:true},{locked:true}]){
  const f=fixture(opts);
  await f.api.beforeReset({id:'nexaTopReset'});
  assert.equal(f.cleared,0,JSON.stringify(opts));
  assert.match(f.fields.hda,/Dor torácica/,JSON.stringify(opts));
 }
});
test('nonconflicting full case gets audit snapshot and restores blank recording UI',async()=>{
 const f=fixture({syncState:'pending'});
 await f.api.beforeReset({id:'resetBtn'});
 assert.equal(f.cleared,1);
 assert.equal(f.rotated,1);
 assert.equal(f.rows.get(UUID+':final-v1').state,'queued');
 assert.equal(f.prompts.length,1);
});
test('short draft is locally preserved but never represented as a completed audit case',async()=>{
 const f=fixture({syncState:'pending',partial:true});
 await f.api.beforeReset({id:'nexaTopReset'});
 assert.equal(f.cleared,1);
 assert.equal(f.rows.size,0);
 assert.equal(f.prompts.length,1);
});
test('no new patient may be opened while a recording is still running',async()=>{
 const f=fixture();
 f.recBtn.dataset.recordingState='recording';
 await f.api.beforeReset({id:'resetBtn'});
 assert.equal(f.cleared,0);
 assert.equal(f.rows.size,0);
});
test('held snapshot must stay held if reconciliation chose different clinical content',async()=>{
 const f=fixture();
 await f.api.beforeReset({id:'resetBtn'});
 f.setRecord({encounter_id:UUID,owner_user_id:WHO,sync_state:'synced',fields:{hda:'VERSÃO DO SERVIDOR'}});
 const released=await f.api.releaseHeldAfterReconciliation(UUID);
 assert.equal(released,false);
 assert.equal(f.rows.get(UUID+':final-v1').state,'held_conflict');
 assert.equal(f.remoteSends,0);
});
test('held snapshot is released only after matching reconciled physician copy',async()=>{
 const f=fixture();
 const prior=structuredClone(f.fields);
 await f.api.beforeReset({id:'resetBtn'});
 f.setRecord({encounter_id:UUID,owner_user_id:WHO,sync_state:'synced',fields:prior});
 const released=await f.api.releaseHeldAfterReconciliation(UUID);
 assert.equal(released,true);
 assert.notEqual(f.rows.get(UUID+':final-v1').state,'held_conflict');
});
console.log('NEXA reset with checkpoint conflict: preservation, no overwrite and restart validated');
