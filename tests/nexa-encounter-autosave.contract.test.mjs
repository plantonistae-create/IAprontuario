import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const code=fs.readFileSync(new URL('../nexa-encounter-autosave-v18.10.1.js',import.meta.url),'utf8');
for(const token of ['indexedDB.open','encounter_id','ready_for_audit','consultation_history','upsert','nexa:encounter-local-saved','nexa:encounter-synced','nexa:encounter-locked','audit_priority','pagehide','visibilitychange','online','offline'])assert.ok(code.includes(token),`missing ${token}`);
new Function(code);

const session=new Map(),memory=new Map(),remote=[];
const storage=map=>({getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)});
const fields={
  queixa_principal:'Dor torácica',
  hda:'',
  exame_fisico:'',
  hipotese_diagnostica:'',
  conduta:'',
  antecedentes:'',
  medicacoes:'',
  alergias:''
};
function fieldNodes(){return Object.keys(fields).map(key=>({dataset:{key},querySelector:()=>({value:fields[key]})}))}
let uuidN=0,online=false,forceUpsertError=false,terminalRemoteState='';
const document={
  hidden:false,
  documentElement:{dataset:{}},
  querySelectorAll(sel){return sel==='.field[data-key]'?fieldNodes():[]},
  getElementById(id){if(id==='suggestedExams'||id==='suggestedPrescription'||id==='conductRecordText')return{value:id==='conductRecordText'?fields.conduta:''};return null},
  addEventListener(){}
};
const navigator={get onLine(){return online}};
const sb={
  from(name){
    assert.equal(name,'consultation_history');
    return{
      upsert(payload,{onConflict}){
        assert.equal(onConflict,'id');remote.push(structuredClone(payload));
        return{select(){return{single:async()=>forceUpsertError?{data:null,error:{message:'RLS update denied'}}:{data:{id:payload.id,encounter_id:payload.encounter_id,encounter_state:payload.encounter_state,audit_priority:payload.audit_priority,audit_ready_at:payload.audit_ready_at,updated_at:new Date().toISOString(),sync_version:remote.length,status:payload.status},error:null}}}}
      },
      select(){
        const state={id:null,userId:null};
        const chain={
          eq(k,v){if(k==='id')state.id=v;if(k==='user_id')state.userId=v;return chain},
          maybeSingle:async()=>terminalRemoteState?{data:{id:state.id,encounter_id:state.id,encounter_state:terminalRemoteState,updated_at:new Date().toISOString(),sync_version:99,status:'draft'},error:null}:{data:null,error:null}
        };
        return chain;
      }
    }
  }
};
const context={
  console,structuredClone,document,navigator,sessionStorage:storage(session),indexedDB:{open(){throw new Error('adapter expected')}},
  crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++uuidN).padStart(12,'0')}`},
  CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},
  Event:class{},Date,Math,Promise,
  setTimeout:()=>0,clearTimeout(){},addEventListener(){},dispatchEvent(){return true},window:null,
  currentProf:{id:'11111111-1111-4111-8111-111111111111'},
  collect:()=>structuredClone(fields),
  lastProcessedMeta:{consentRecordedAt:'2026-09-25T10:00:00.000Z'},
  hypothesisReview:{status:'pending'},nexaAlternativeHypotheses:[],nexaDiscardedHypotheses:[],clinicalPlanCache:{},
  sb,nexaClinicalSupabase18101:sb
};
context.window=context;
vm.runInNewContext(code,context);
const api=context.nexaEncounterAutosave18101;
api.setStoreAdapter({
  get:async id=>memory.get(id)||null,
  put:async item=>{memory.set(item.encounter_id,structuredClone(item));return structuredClone(item)},
  all:async()=>[...memory.values()].map(structuredClone)
});

let rec=await api.startNew('qa_new');
assert.ok(rec?.encounter_id,'new encounter must get id');
const firstId=rec.encounter_id;
assert.equal(memory.size,1);
assert.equal(memory.get(firstId).encounter_state,'draft');
assert.equal(remote.length,0,'offline start stays local');

online=true;
let sent=await api.syncOne(memory.get(firstId));
assert.equal(sent.sent,true);
assert.equal(remote.length,1);
assert.equal(remote[0].id,firstId);
assert.equal(remote[0].encounter_id,firstId);

fields.hda='Paciente com dor torácica iniciada há duas horas, sem síncope.';
fields.exame_fisico='BEG, eupneico.';
rec=await api.preserve('input',{sync:false});
assert.equal(rec.encounter_id,firstId,'autosave must update same encounter');
assert.equal(memory.size,1,'autosave must not duplicate');
assert.equal(rec.encounter_state,'ready_for_audit');
const readyAt=rec.audit_ready_at;
assert.ok(readyAt);

fields.hda='';fields.exame_fisico='';
rec=await api.preserve('later_edit',{sync:false});
assert.equal(rec.encounter_state,'ready_for_audit','ready state must be monotonic locally');
assert.equal(rec.audit_ready_at,readyAt);

rec=await api.prioritize();
assert.equal(rec.encounter_id,firstId);
assert.equal(rec.audit_priority,1);
assert.equal(memory.size,1);

api.rotateEncounter();
online=false;
const second=await api.startNew('qa_second');
assert.notEqual(second.encounter_id,firstId);
assert.equal(memory.size,2);

const adopted=await api.adoptExisting({id:firstId,encounter_id:firstId,fields:{hda:'Histórico'},encounter_state:'ready_for_audit',audit_priority:1,status:'draft'});
assert.equal(api.currentEncounterId(),firstId);
assert.equal(adopted.encounter_id,firstId);

// Remote audit completion is terminal: a rejected upsert resolves to the remote audited/discarded state and stops retries.
forceUpsertError=true;terminalRemoteState='audited';
const terminalResult=await api.syncOne({...memory.get(firstId),sync_state:'pending',encounter_state:'ready_for_audit'});
assert.equal(terminalResult.locked,true);
assert.equal(memory.get(firstId).sync_state,'locked');
assert.equal(memory.get(firstId).encounter_state,'audited');
const callsBeforeTerminal=remote.length;
const lockedRetry=await api.syncOne(memory.get(firstId));
assert.equal(lockedRetry.locked,true);
assert.equal(remote.length,callsBeforeTerminal,'locked audited encounter must not retry remote writes');
fields.hda='Alteração posterior local que não pode reabrir auditoria concluída.';
const terminalLocal=await api.preserve('later_edit',{sync:false});
assert.equal(terminalLocal.encounter_state,'audited','terminal encounter must not regress to ready_for_audit');

console.log('NEXA encounter autosave offline/upsert contract: PASS');
