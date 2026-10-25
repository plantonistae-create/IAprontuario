'use strict';
/* NEXA encounter safety checks — Node built-in test runner. Synthetic clinical content only. */
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','nexa-encounter-autosave-v18.10.1.js'),'utf8');
const copy=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const USER='11111111-1111-4111-8111-111111111111';
let serial=1;
function uuid(){return '00000000-0000-4000-8000-'+String(serial++).padStart(12,'0')}
function local(id,fields,version=0,state='pending'){
 return {encounter_id:id,owner_user_id:USER,fields:copy(fields),encounter_state:'draft',protocol_usage:[],
  audit_priority:0,created_at:new Date().toISOString(),last_client_saved_at:new Date().toISOString(),
  sync_state:state,attempt_count:0,sync_version:version,local_revision:1,legacy_status:'draft'};
}
function memoryStore(){
 const records=new Map();
 return{records,adapter:{
   get:async id=>copy(records.get(id)||null),
   put:async item=>{records.set(item.encounter_id,copy(item));return copy(item)},
   all:async()=>copy([...records.values()]),
   comparePut:async(old,next)=>{
     const item=records.get(old.encounter_id);
     if(!item||item.owner_user_id!==old.owner_user_id||item.sync_state!==old.sync_state||
       item.last_client_saved_at!==old.last_client_saved_at||Number(item.local_revision||0)!==Number(old.local_revision||0))return false;
     records.set(next.encounter_id,copy(next));return true;
   }
 }};
}
function world(){
 const remote=new Map();let fail=0,delay=0,writes=0;
 const db={from(){
   let op='',payload=null,filters={},selection='';
   const q={
     select(s){if(!op)op='select';selection=s;return q},
     update(x){op='update';payload=copy(x);return q},
     insert(x){op='insert';payload=copy(x);return q},
     eq(key,value){filters[key]=value;return q},
     async maybeSingle(){return execute()},
     async single(){return execute()}
   };
   async function execute(){
     if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
     if(fail>0){fail--;return{data:null,error:{code:'TEST_FAILURE',message:'Synthetic network failure'}}}
     const id=filters.id||payload?.id;
     let record=remote.get(id);
     if(op==='select'){
       if(!record||Object.entries(filters).some(([k,v])=>record[k]!==v))return{data:null,error:null};
       return{data:copy(record),error:null};
     }
     if(op==='insert'){
       if(record)return{data:null,error:{code:'23505',message:'duplicate key'}};
       record={...copy(payload),sync_version:0,updated_at:new Date().toISOString()};
       remote.set(id,record);writes++;return{data:copy(record),error:null};
     }
     if(op==='update'){
       if(!record||Object.entries(filters).some(([k,v])=>record[k]!==v))return{data:null,error:null};
       record={...record,...copy(payload),sync_version:record.sync_version+1,updated_at:new Date().toISOString()};
       remote.set(id,record);writes++;return{data:copy(record),error:null};
     }
     throw new Error('Unsupported query');
   }
   return q;
 }};
 function browser(store=memoryStore()){
   const session=new Map(),handlers={};
   const win={currentProf:{id:USER},nexaClinicalSupabase18101:db,input:{},
     addEventListener:(name,fn)=>{(handlers[name]??=[]).push(fn)},
     dispatchEvent:evt=>{for(const fn of handlers[evt.type]||[])fn(evt)}
   };
   win.nexaClinicalBridge18101={collect:()=>copy(win.input),state:()=> 'idle',meta:()=>({})};
   const document={documentElement:{dataset:{}},addEventListener:()=>{},querySelectorAll:()=>[],getElementById:()=>null};
   const navigator={onLine:true};
   const context={window:win,document,navigator,sessionStorage:{
     getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)
   },crypto:{randomUUID:uuid},indexedDB:null,structuredClone:copy,
   CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail}},
   setTimeout:()=>0,clearTimeout:()=>{},addEventListener:()=>{},console};
   vm.runInNewContext(source,context,{filename:'nexa-encounter-autosave-v18.10.1.js'});
   const api=win.nexaEncounterAutosave18101;
   api.setStoreAdapter(store.adapter);
   const archives=[];let archiveError=false;
   api.setArchiveAdapter(async(a,b,choice)=>{if(archiveError)throw new Error('CONFLICT_ARCHIVE_WRITE_FAILED');archives.push({a:copy(a),b:copy(b),choice});return true});
   return{api,win,navigator,store,archives,failArchives:()=>{archiveError=true}};
 }
 return{remote,browser,fail:(n=1)=>{fail=n},slow:ms=>{delay=ms},writes:()=>writes};
}
function remoteDraft(id,fields,version=0){
 return{...local(id,fields,version,'synced'),id,user_id:USER,sync_version:version,updated_at:new Date().toISOString()};
}
test('01 consultation without conflict can be created and updated',async()=>{
 const w=world(),a=w.browser(),id=uuid();
 await a.api.put(local(id,{hda:'Sintomas fictícios'}));
 assert.equal((await a.api.syncOne(await a.api.get(id))).sent,true);
 assert.equal(w.remote.get(id).sync_version,0);
 const row=await a.api.get(id);row.fields.hda='Reavaliação fictícia';row.sync_state='pending';row.local_revision++;
 await a.api.put(row);
 assert.equal((await a.api.syncOne(row)).sent,true);
 assert.equal(w.remote.get(id).fields.hda,'Reavaliação fictícia');
});
test('02 two computers editing same revision get conflict, no silent overwrite',async()=>{
 const w=world(),a=w.browser(),b=w.browser(),id=uuid();
 await a.api.put(local(id,{hda:'Texto inicial'}));
 await a.api.syncOne(await a.api.get(id));
 const shared=await a.api.get(id);
 await b.api.put({...shared,sync_state:'pending'});
 const newer={...shared,fields:{hda:'Revisão no computador A'},sync_state:'pending',local_revision:shared.local_revision+1};
 await a.api.put(newer);await a.api.syncOne(newer);
 assert.equal((await b.api.syncOne(await b.api.get(id))).conflict,true);
 assert.equal(w.remote.get(id).fields.hda,'Revisão no computador A');
});
test('03 typing after conflict stays isolated from auto upload',async()=>{
 const w=world(),a=w.browser(),id=uuid(),rec=local(id,{hda:'Primeiro texto'},3,'conflict');
 w.remote.set(id,remoteDraft(id,{hda:'Outra versão'},4));
 await a.api.put(rec);a.win.input={hda:'Nova anotação local'};a.api.setActiveId(id);
 await a.api.preserve('input');assert.equal((await a.api.get(id)).sync_state,'conflict');
 const count=w.writes();await a.api.flush('online');assert.equal(w.writes(),count);
});
test('04 offline writing stays pending and reconnect flushes',async()=>{
 const w=world(),a=w.browser(),id=uuid();
 a.navigator.onLine=false;a.win.input={hda:'Rascunho clínico sintético'};a.api.setActiveId(id);
 await a.api.preserve('offline',{sync:false});assert.equal((await a.api.get(id)).sync_state,'pending');
 a.navigator.onLine=true;await a.api.flush('online');assert.equal(w.remote.get(id).fields.hda,'Rascunho clínico sintético');
});
test('05 page refresh retains conflict state via local store',async()=>{
 const w=world(),store=memoryStore(),id=uuid(),old=w.browser(store);
 await old.api.put(local(id,{hda:'Cópia local'},2,'conflict'));
 const refreshed=w.browser(store);await refreshed.api.flush('startup');
 assert.equal((await refreshed.api.get(id)).sync_state,'conflict');assert.equal(w.writes(),0);
});
test('06 unexpected browser closure preserves pending data on restart',async()=>{
 const w=world(),store=memoryStore(),id=uuid(),first=w.browser(store);
 await first.api.put(local(id,{hda:'Pendente salvo'}));
 const restart=w.browser(store);await restart.api.flush('startup');
 assert.equal(w.remote.get(id).fields.hda,'Pendente salvo');
});
test('07 server persistence failure does not report synchronized',async()=>{
 const w=world(),a=w.browser(),id=uuid();await a.api.put(local(id,{hda:'Rascunho'}));
 w.fail();
 const saved=await a.api.syncOne(await a.api.get(id));
 assert.equal(saved.sent,false);assert.equal((await a.api.get(id)).sync_state,'pending');
});
test('08 remote change during review prevents overwrite',async()=>{
 const w=world(),a=w.browser(),id=uuid();
 await a.api.put(local(id,{hda:'Local'},2,'conflict'));
 w.remote.set(id,remoteDraft(id,{hda:'Servidor'},2));
 const review=await a.api.reviewConflict(id);
 w.remote.get(id).sync_version++;
 await assert.rejects(()=>a.api.resolveConflict({
   id,expectedVersion:review.remote.sync_version,localRevision:review.local.local_revision,
   localSavedAt:review.local.last_client_saved_at,mode:'local'
 }),{message:'REMOTE_CHANGED_REVIEW_AGAIN'});
 assert.equal((await a.api.get(id)).sync_state,'conflict');
});
test('09 repeated sync requests for same encounter are deduplicated',async()=>{
 const w=world(),a=w.browser(),id=uuid();await a.api.put(local(id,{hda:'Mesmo registro'}));
 w.slow(10);
 const record=await a.api.get(id);
 await Promise.all([a.api.syncOne(record),a.api.syncOne(record),a.api.syncOne(record)]);
 assert.equal(w.writes(),1);
});
test('10 manual merge requires explicit choices and persists once',async()=>{
 const w=world(),a=w.browser(),id=uuid();
 const loc=local(id,{hda:'Local',conduta:'Conduta local'},2,'conflict');
 await a.api.put(loc);w.remote.set(id,remoteDraft(id,{hda:'Servidor',conduta:'Conduta do servidor'},2));
 const review=await a.api.reviewConflict(id);
 assert.throws(()=>a.api.reconcileFields(review.local.fields,review.remote.fields,'merge',{hda:{source:'local'}}),{message:'FIELD_DECISION_REQUIRED'});
 const done=await a.api.resolveConflict({
   id,expectedVersion:2,localRevision:review.local.local_revision,localSavedAt:review.local.last_client_saved_at,
   mode:'merge',decisions:{hda:{source:'local'},conduta:{source:'server'}}
 });
 assert.equal(done.resolved,true);assert.equal(w.remote.get(id).fields.hda,'Local');
 assert.equal(w.remote.get(id).fields.conduta,'Conduta do servidor');
 assert.equal(a.archives.length,1);
});
test('11 two different consultations do not block each other',async()=>{
 const w=world(),a=w.browser(),id1=uuid(),id2=uuid();
 await a.api.put(local(id1,{hda:'Caso 1'}));await a.api.put(local(id2,{hda:'Caso 2'}));
 await Promise.all([a.api.syncOne(await a.api.get(id1)),a.api.syncOne(await a.api.get(id2))]);
 assert.equal(w.remote.get(id1).fields.hda,'Caso 1');assert.equal(w.remote.get(id2).fields.hda,'Caso 2');
});
test('12 keep server archives both copies before replacing local',async()=>{
 const w=world(),a=w.browser(),id=uuid();
 await a.api.put(local(id,{hda:'Cópia local'},3,'conflict'));
 w.remote.set(id,remoteDraft(id,{hda:'Cópia remota'},3));
 const review=await a.api.reviewConflict(id);
 const done=await a.api.resolveConflict({id,expectedVersion:3,localRevision:review.local.local_revision,localSavedAt:review.local.last_client_saved_at,mode:'server'});
 assert.equal(done.resolved,true);assert.equal((await a.api.get(id)).fields.hda,'Cópia remota');
 assert.equal(a.archives[0].a.fields.hda,'Cópia local');
});
test('13 failed archive stops resolution without changing remote',async()=>{
 const w=world(),a=w.browser(),id=uuid();
 await a.api.put(local(id,{hda:'Cópia local'},4,'conflict'));
 w.remote.set(id,remoteDraft(id,{hda:'Cópia remota'},4));a.failArchives();
 const review=await a.api.reviewConflict(id);
 await assert.rejects(()=>a.api.resolveConflict({id,expectedVersion:4,localRevision:review.local.local_revision,localSavedAt:review.local.last_client_saved_at,mode:'local'}));
 assert.equal(w.remote.get(id).fields.hda,'Cópia remota');assert.equal((await a.api.get(id)).sync_state,'conflict');
});
test('14 stale open form after keep-server cannot auto overwrite remote',async()=>{
 const w=world(),a=w.browser(),id=uuid();await a.api.put(local(id,{hda:'Antiga'},3,'conflict'));
 w.remote.set(id,remoteDraft(id,{hda:'Nova remota'},3));
 const review=await a.api.reviewConflict(id);
 await a.api.resolveConflict({id,expectedVersion:3,localRevision:review.local.local_revision,localSavedAt:review.local.last_client_saved_at,mode:'server'});
 a.api.setActiveId(id);a.win.input={hda:'Antiga'};
 await a.api.preserve('input');
 assert.equal((await a.api.get(id)).sync_state,'conflict');assert.equal(w.remote.get(id).fields.hda,'Nova remota');
});

test('15 blank new encounter remains local instead of flooding server with empty draft',async()=>{
 const w=world(),a=w.browser(),id=uuid();
 const blank=local(id,{queixa_principal:'',hda:'',exame_fisico:'',conduta:''});
 await a.api.put(blank);
 const result=await a.api.syncOne(blank);
 assert.equal(result.empty,true);
 assert.equal(w.writes(),0);
 assert.equal(w.remote.has(id),false);
 const stored=await a.api.get(id);
 assert.equal(stored.sync_state,'pending');
});
test('16 same-device edit while previous server save is in-flight must not become a false conflict',async()=>{
 const w=world(),a=w.browser(),id=uuid();
 const initial=local(id,{hda:'Anamnese sintética inicial.'});
 await a.api.put(initial);
 await a.api.syncOne(initial);
 const prior=await a.api.get(id);
 const first={...prior,fields:{hda:'Primeira edição do médico.'},
  sync_state:'pending',local_revision:prior.local_revision+1,
  last_client_saved_at:new Date(Date.now()+1000).toISOString()};
 await a.api.put(first);
 w.slow(35);
 const inflight=a.api.syncOne(first);
 await new Promise(resolve=>setTimeout(resolve,5));
 const newer={...first,fields:{hda:'Primeira edição do médico. Segunda edição enquanto sincroniza.'},
  local_revision:first.local_revision+1,last_client_saved_at:new Date(Date.now()+2000).toISOString()};
 await a.api.put(newer);
 const oldResult=await inflight;
 assert.equal(oldResult.stale,true,'old response must never overwrite newer local fields');
 const now=await a.api.get(id);
 assert.equal(now.sync_state,'pending','same-device edit must remain pending, not conflict');
 assert.equal(now.sync_version,1,'our own acknowledged server version must be forwarded');
 assert.equal(now.fields.hda,newer.fields.hda,'new clinical text must stay untouched');
 const next=await a.api.syncOne(now);
 assert.equal(next.sent,true);
 assert.equal((await a.api.get(id)).sync_state,'synced');
 assert.equal(w.remote.get(id).fields.hda,newer.fields.hda);
});
