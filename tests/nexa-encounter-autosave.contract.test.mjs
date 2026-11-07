import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../nexa-encounter-autosave-v18.10.1.js',import.meta.url),'utf8');
for(const item of ['indexedDB.open','encounter_id','ready_for_audit','consultation_history','sync_version',
 'nexa:encounter-local-saved','nexa:encounter-synced','nexa:encounter-locked',
 'audit_priority','pagehide','visibilitychange','online','offline','resolveConflict','comparePut']){
 assert.ok(source.includes(item),'missing '+item);
}
assert.ok(!source.includes('.upsert(remotePayload(rec)'),'Autosave must not use blind upsert for concurrent drafts');
new Function(source);

const records=new Map(),server=new Map(),session=new Map();
const fields={queixa_principal:'Dor torácica fictícia',hda:'',exame_fisico:'',hipotese_diagnostica:'',conduta:'',antecedentes:''};
const profileId='11111111-1111-4111-8111-111111111111';
const storage={getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,String(v)),removeItem:k=>session.delete(k)};
let online=false,nextId=0;
function supabase(){
 return{from(table){
   assert.equal(table,'consultation_history');
   let op='',payload=null,where={};
   const query={
     insert(x){op='insert';payload=structuredClone(x);return query},
     update(x){op='update';payload=structuredClone(x);return query},
     select(){if(!op)op='select';return query},
     eq(k,v){where[k]=v;return query},
     async single(){return run()},
     async maybeSingle(){return run()}
   };
   function run(){
     const id=where.id||payload?.id;
     const old=server.get(id);
     if(op==='select'){
       if(!old||Object.entries(where).some(([key,value])=>old[key]!==value))return{data:null,error:null};
       return{data:structuredClone(old),error:null};
     }
     if(op==='insert'){
       if(old)return{data:null,error:{code:'23505'}};
       const row={...payload,sync_version:0,updated_at:new Date().toISOString()};
       server.set(id,row);return{data:structuredClone(row),error:null};
     }
     if(op==='update'){
       if(!old||Object.entries(where).some(([key,value])=>old[key]!==value))return{data:null,error:null};
       const row={...old,...payload,sync_version:old.sync_version+1,updated_at:new Date().toISOString()};
       server.set(id,row);return{data:structuredClone(row),error:null};
     }
     throw new Error('Query must be select, insert or conditional update');
   }
   return query;
 }};
}
const sb=supabase();
const context={
  console,structuredClone,document:{
    documentElement:{dataset:{}},
    querySelectorAll:selector=>selector==='.field[data-key]'?Object.keys(fields).map(key=>({
      dataset:{key},querySelector:selector=>({value:selector==='textarea'?fields[key]:(key==='exame_fisico'?'auxiliary-checkbox-value':fields[key])})
    })):[],
    getElementById:()=>null,addEventListener(){}
  },
  navigator:{get onLine(){return online}},
  sessionStorage:storage,indexedDB:{open(){throw new Error('Adapter expected')}},
  crypto:{randomUUID:()=> '00000000-0000-4000-8000-'+String(++nextId).padStart(12,'0')},
  CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},
  setTimeout:()=>0,clearTimeout(){},addEventListener(){},dispatchEvent(){},
  currentProf:{id:profileId},collect:()=>structuredClone(fields),nexaClinicalSupabase18101:sb,
  window:null
};
context.window=context;
vm.runInNewContext(source,context);
const api=context.nexaEncounterAutosave18101;
api.setStoreAdapter({
 get:async id=>structuredClone(records.get(id)||null),
 put:async rec=>{records.set(rec.encounter_id,structuredClone(rec));return rec},
 all:async()=>structuredClone([...records.values()]),
 comparePut:async(expected,rec)=>{
   const old=records.get(expected.encounter_id);
   if(!old||old.local_revision!==expected.local_revision||old.sync_state!==expected.sync_state)return false;
   records.set(rec.encounter_id,structuredClone(rec));return true;
 }
});
const first=await api.startNew('first');
assert.ok(first.encounter_id);assert.equal(records.size,1);assert.equal(server.size,0);
online=true;
assert.equal((await api.syncOne(await api.get(first.encounter_id))).sent,true);
assert.equal(server.get(first.encounter_id).id,first.encounter_id);
online=false;
fields.hda='Paciente fictício com dor iniciada há duas horas, sem síncope.';
fields.exame_fisico='Bom estado geral, eupneico.';
const ready=await api.preserve('input',{sync:false});
assert.equal(ready.encounter_state,'ready_for_audit');
assert.equal(ready.fields.exame_fisico,'Bom estado geral, eupneico.','a clinical textarea must take precedence over auxiliary exam inputs');
assert.ok(ready.audit_ready_at);
fields.hda='';fields.exame_fisico='';
const revision=await api.preserve('next',{sync:false});
assert.equal(revision.encounter_state,'ready_for_audit','Audit-ready state must not regress');
assert.equal(revision.audit_ready_at,ready.audit_ready_at);
const prioritized=await api.prioritize();
assert.equal(prioritized.audit_priority,1);
api.rotateEncounter();
const second=await api.startNew('second');
assert.notEqual(second.encounter_id,first.encounter_id);
assert.equal(records.size,2);
const terminal={...(await api.get(first.encounter_id)),encounter_state:'audited',sync_state:'locked'};
await api.put(terminal);api.setActiveId(first.encounter_id);
const after=await api.preserve('later',{sync:false});
assert.equal(after.encounter_state,'audited');
assert.equal(after.sync_state,'locked','An audited encounter must remain locked after local edits');
console.log('NEXA encounter autosave offline, audit, CAS contract: PASS');


// Regression: continuous typing must not postpone every durable local save.
// Timers and IndexedDB are synthetic; no network, credentials or patient data.
{
 const saved=new Map(),listeners=new Map(),timers=new Map(),session=new Map();
 let clock=0,timerId=0,typed='HDA fictícia inicial',uuidCount=0;
 const schedule=(fn,ms=0)=>{const id=++timerId;timers.set(id,{at:clock+ms,fn});return id};
 const clear=id=>timers.delete(id);
 const advance=async ms=>{
   const end=clock+ms;
   while(true){
     const next=[...timers].filter(([,x])=>x.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
     if(!next)break;
     clock=next[1].at;timers.delete(next[0]);next[1].fn();
     for(let n=0;n<12;n++)await Promise.resolve();
   }
   clock=end;
   for(let n=0;n<12;n++)await Promise.resolve();
 };
 const doc={
   documentElement:{dataset:{}},
   getElementById:()=>null,
   querySelectorAll:()=>[],
   addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn)}
 };
 const ctx={
   console,structuredClone,document:doc,navigator:{onLine:false},
   sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,String(v)),removeItem:k=>session.delete(k)},
   indexedDB:{open(){throw new Error('Synthetic adapter must be used')}},
   crypto:{randomUUID:()=> '22222222-2222-4222-8222-'+String(++uuidCount).padStart(12,'0')},
   CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},
   setTimeout:schedule,clearTimeout:clear,addEventListener(){},dispatchEvent(){},
   currentProf:{id:profileId},collect:()=>({hda:typed}),window:null
 };
 ctx.window=ctx;
 vm.runInNewContext(source,ctx);
 const bounded=ctx.nexaEncounterAutosave18101;
 bounded.setStoreAdapter({
   get:async id=>structuredClone(saved.get(id)||null),
   put:async item=>{saved.set(item.encounter_id,structuredClone(item));return item},
   all:async()=>structuredClone([...saved.values()]),
   comparePut:async(expected,item)=>{
     const previous=saved.get(expected.encounter_id);
     if(!previous||previous.local_revision!==expected.local_revision)return false;
     saved.set(item.encounter_id,structuredClone(item));return true;
   }
 });
 timers.clear(); // Synthetic startup flush is irrelevant for this test.
 const initial=await bounded.startNew('synthetic_start');
 assert.equal(initial.local_revision,1);
 for(let i=1;i<=65;i++){
   typed='HDA fictícia em digitação contínua '+String(i);
   for(const listener of listeners.get('input')||[])
     listener({target:{matches:selector=>selector==='textarea,input,select',closest:()=>null}});
   await advance(100);
 }
 const durable=await bounded.get(initial.encounter_id);
 assert.ok(durable.local_revision>=2,'an uninterrupted edit must be saved before typing ends');
 assert.match(durable.fields.hda,/HDA fictícia em digitação contínua/);
 assert.ok(durable.fields.hda!=='HDA fictícia inicial','save must contain newer content');
 const beforeNavigation=durable.local_revision;
 await bounded.preserve('navigation',{sync:false});
 assert.equal(timers.size,0,'manual/navigation persistence must consume both edit timers');
 await advance(6000);
 assert.equal((await bounded.get(initial.encounter_id)).local_revision,beforeNavigation+1,
   'stale input timer must not overwrite a navigation snapshot');
}
console.log('NEXA continuous-edit autosave max-wait regression: PASS');

// A shared workstation can change authenticated clinician without reloading.
// IDs, local records and visible note text must never cross that boundary.
{
 const saved=new Map(),session=new Map(),events=[],input={hda:'Consulta sintética da médica A'};
 const currentProf={id:'doctor-A'};
 let count=0;
 const ctx={
   console,structuredClone,currentProf,document:{
     documentElement:{dataset:{}},
     getElementById:()=>null,querySelectorAll:()=>[],addEventListener(){}
   },
   navigator:{onLine:false},
   sessionStorage:{getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,String(v)),removeItem:k=>session.delete(k)},
   indexedDB:{open(){throw new Error('Synthetic store required')}},
   crypto:{randomUUID:()=> '55555555-5555-4555-8555-'+String(++count).padStart(12,'0')},
   CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},
   setTimeout:()=>0,clearTimeout(){},addEventListener(){},
   dispatchEvent:e=>events.push(e),window:null,
   collect:()=>({...input})
 };
 ctx.window=ctx;
 vm.runInNewContext(source,ctx);
 const scoped=ctx.nexaEncounterAutosave18101;
 scoped.setStoreAdapter({
   get:async id=>structuredClone(saved.get(id)||null),
   put:async rec=>{saved.set(rec.encounter_id,structuredClone(rec));return rec},
   all:async()=>structuredClone([...saved.values()]),
   comparePut:async(old,rec)=>{
     saved.set(rec.encounter_id,structuredClone(rec));return true
   }
 });
 const a=await scoped.startNew('synthetic_A');
 await scoped.preserve('input',{sync:false});
 assert.equal(scoped.currentEncounterId(),a.encounter_id);
 assert.equal((await scoped.get(a.encounter_id)).owner_user_id,'doctor-A');
 // Switch in the same tab, while the visible HDA still belongs to A.
 currentProf.id='doctor-B';
 assert.equal(scoped.currentEncounterId(),'','foreign active encounter ID must be cleared');
 assert.equal(ctx.__NEXA_ACTIVE_ENCOUNTER_ID__,'');
 await assert.rejects(scoped.preserve('input',{sync:false}),/OWNER_SWITCH_REQUIRES_NEW_OR_RECOVERED_ENCOUNTER/);
 await assert.rejects(scoped.startNew('synthetic_B'),/OWNER_SWITCH_REQUIRES_CLEAR_FORM/);
 assert.equal((await scoped.get(a.encounter_id)).fields.hda,'Consulta sintética da médica A');
 await assert.rejects(
   scoped.adoptExisting({encounter_id:a.encounter_id,owner_user_id:'doctor-B',fields:{hda:'Fake B'}}),
   /ENCOUNTER_OWNER_MISMATCH/,
   'a forged B-tagged row must not adopt a durable A record'
 );
 assert.equal(scoped.currentEncounterId(),'');
 await assert.rejects(
   scoped.adoptExisting({encounter_id:'66666666-6666-4666-8666-666666666666',user_id:'doctor-A',fields:{hda:'Fake'}}),
   /ENCOUNTER_OWNER_MISMATCH/,
   'remote row from another doctor must be rejected'
 );
 input.hda='';
 const b=await scoped.startNew('synthetic_B_clean_form');
 assert.notEqual(b.encounter_id,a.encounter_id);
 assert.equal(b.owner_user_id,'doctor-B');
 assert.equal(scoped.currentEncounterId(),b.encounter_id);
 assert.equal((await scoped.get(a.encounter_id)).owner_user_id,'doctor-A');
 // Switching back requires owner-verified recovery, not auto-selecting B's ID.
 currentProf.id='doctor-A';
 assert.equal(scoped.currentEncounterId(),'');
 const restored=await scoped.adoptExisting({encounter_id:a.encounter_id,owner_user_id:'doctor-A'});
 assert.equal(restored.fields.hda,'Consulta sintética da médica A');
 assert.equal(scoped.currentEncounterId(),a.encounter_id);
 assert.equal((await scoped.get(b.encounter_id)).owner_user_id,'doctor-B');
}
console.log('NEXA owner-switch encounter isolation regression: PASS');



// Regression: a failed IndexedDB write must not disappear inside a timer's
// rejected Promise. No real accounts, patient data or requests are involved.
{
 const saved=new Map(),timers=new Map(),listeners=new Map(),events=[];
 let sequence=0,timerId=0,failWrite=false,note='HDA sintética inicial';
 const schedule=(fn,ms=0)=>{const id=++timerId;timers.set(id,{fn,ms});return id};
 const clear=id=>timers.delete(id);
 const fire=async()=>{
   const entry=[...timers.entries()].sort((a,b)=>a[1].ms-b[1].ms)[0];
   assert.ok(entry,'expected queued local checkpoint');
   timers.delete(entry[0]);entry[1].fn();
   for(let i=0;i<30;i++)await Promise.resolve();
 };
 const doc={
   documentElement:{dataset:{}},
   getElementById:()=>null,querySelectorAll:()=>[],
   addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn)}
 };
 const synthetic={
   console,structuredClone,document:doc,navigator:{onLine:false},
   sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
   indexedDB:{open(){throw Error('Synthetic store expected')}},
   crypto:{randomUUID:()=> '44444444-4444-4444-8444-'+String(++sequence).padStart(12,'0')},
   CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},
   setTimeout:schedule,clearTimeout:clear,addEventListener(){},
   dispatchEvent:e=>events.push(e),
   currentProf:{id:profileId},collect:()=>({hda:note}),window:null
 };
 synthetic.window=synthetic;
 vm.runInNewContext(source,synthetic);
 const item=synthetic.nexaEncounterAutosave18101;
 item.setStoreAdapter({
   get:async id=>structuredClone(saved.get(id)||null),
   put:async rec=>{
     if(failWrite)throw Error('Synthetic quota write failure, no patient text');
     saved.set(rec.encounter_id,structuredClone(rec));return rec;
   },
   all:async()=>structuredClone([...saved.values()]),
   comparePut:async(expected,rec)=>{
     saved.set(rec.encounter_id,structuredClone(rec));return true;
   }
 });
 timers.clear();
 const initial=await item.startNew('synthetic_first');
 assert.ok(initial?.encounter_id);
 events.length=0;
 failWrite=true;note='Texto fictício que ainda não foi persistido';
 for(const listener of listeners.get('input')||[])
   listener({target:{matches:selector=>selector==='textarea,input,select',closest:()=>null}});
 await fire();
 const failures=events.filter(e=>e.type==='nexa:encounter-local-save-failed');
 assert.equal(failures.length,1,'deferred local save failure must produce a visible failure signal');
 assert.equal(failures[0].detail.code,'LOCAL_CHECKPOINT_FAILED');
 assert.equal(failures[0].detail.reason,'input');
 assert.ok(!JSON.stringify(failures[0]).includes(note),'failure signal cannot expose clinical text');
 assert.equal((await item.get(initial.encounter_id)).fields.hda,'HDA sintética inicial');
 failWrite=false;
 for(const listener of listeners.get('input')||[])
   listener({target:{matches:selector=>selector==='textarea,input,select',closest:()=>null}});
 await fire();
 assert.equal((await item.get(initial.encounter_id)).fields.hda,note);
}
console.log('NEXA deferred local checkpoint errors surface safely and retry: PASS');
