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
