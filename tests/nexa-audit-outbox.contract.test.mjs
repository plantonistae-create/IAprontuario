import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const code=fs.readFileSync(new URL('../nexa-audit-outbox-v18.9.19.js',import.meta.url),'utf8');
const loader=fs.readFileSync(new URL('../nexa-hotfix.js',import.meta.url),'utf8');
for(const token of ['indexedDB.open','reset_safety_net','manual_early_submit','idempotency_key','owner_user_id','snapshot_version','audit_submission_snapshot','learning_layers','audit_corrected','AbortController','ALREADY_SUBMITTED','RECOVERED_STALE_SENDING','nexa:audit-outbox-queued','nexa:audit-submission-deduplicated'])assert.ok(code.includes(token),`missing ${token}`);
for(const sel of ['#resetBtn','#nexaRadarResetBtn','#nfClear','#nfTopClear','#nexaNewCaseBtn','#nexaTopReset','#submitAuditBtn'])assert.ok(code.includes(sel),`missing ${sel}`);
assert.ok(loader.includes('nexa-audit-outbox-v18.9.19.js'),'outbox not loaded');
assert.ok(loader.indexOf('nexa-audit-outbox-v18.9.19.js')<loader.indexOf('nexa-history-style-audit-v18.9.7.js'),'outbox must bind before legacy finalize handler');
new Function(code);

const local=new Map(),session=new Map(),memory=new Map();
const fieldValues={queixa_principal:'Dor torácica',hda:'Paciente com dor torácica iniciada há duas horas, sem síncope.',exame_fisico:'BEG, eupneico.',hipotese_diagnostica:'Dor torácica a esclarecer',conduta:'ECG e reavaliação.',comorbidades:'HAS',antecedentes:'',medicacoes:'',alergias:'',orientacoes_alta:'',sugestoes_perguntas:''};
const storage=map=>({get length(){return map.size},key:i=>[...map.keys()][i]??null,getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)});
local.set('sb-auth-token',JSON.stringify({access_token:'token-A',user:{id:'doctor-A'}}));
let fetchMode='success',fetchCount=0,uuidN=0;
const document={
  hidden:false,documentElement:{dataset:{}},body:{appendChild(){}},
  querySelector(sel){const m=sel.match(/data-key="([^"]+)"/);return m?{value:fieldValues[m[1]]||''}:null},
  getElementById(id){if(id==='aiHypothesisOriginal')return{textContent:'Síndrome coronariana aguda'};if(id==='physicianHypothesis')return{value:'Dor torácica a esclarecer'};if(id==='physicianCid')return{value:'R07.4'};return null},
  createElement(){return{style:{},remove(){}}},addEventListener(){}
};
const context={console,document,localStorage:storage(local),sessionStorage:storage(session),structuredClone,AbortController,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},crypto:{randomUUID:()=>`uuid-${++uuidN}`},setTimeout:()=>0,clearTimeout(){},addEventListener(){},window:null,indexedDB:{open(){throw new Error('test must use adapter')}},fetch:async()=>{fetchCount++;if(fetchMode==='success')return{ok:true,json:async()=>({id:'case-1'})};if(fetchMode==='already')return{ok:false,status:409,json:async()=>({error:'ALREADY_SUBMITTED'})};return{ok:false,status:500,json:async()=>({error:'SERVER_FAIL'})}}};
context.window=context;context.currentProf={id:'doctor-A'};context.nexaDestinationFlow18915={state:{recommended:'alta',final:'internacao',status:'altered',source:'physician'}};context.dispatchEvent=()=>true;
vm.runInNewContext(code,context);
const api=context.nexaAuditOutbox18919;
api.setStoreAdapter({get:async k=>memory.get(k)||null,put:async x=>{memory.set(x.idempotency_key,structuredClone(x));return structuredClone(x)},all:async()=>[...memory.values()].map(structuredClone)});

assert.equal(api.valid({}),false,'empty case must not be valid');
const s1=await api.buildSnapshot('manual_early_submit');
const s2=await api.buildSnapshot('reset_safety_net');
assert.equal(s1.source_consultation_id,s2.source_consultation_id,'same encounter must keep source id');
assert.equal(s1.idempotency_key,s2.idempotency_key,'manual + reset must share idempotency key');
assert.equal(s1.payload.core_context.destination.recommended,'alta');
assert.equal(s1.payload.core_context.destination.final,'internacao');
await api.enqueue(s1);await api.enqueue(s2);assert.equal(memory.size,1,'duplicate trigger must keep one outbox item');
fieldValues.hda='Texto alterado depois do snapshot.';assert.notEqual(memory.get(s1.idempotency_key).payload.fields.hda,fieldValues.hda,'stored snapshot must be immutable from later UI edits');

fetchMode='success';let result=await api.sendItem(memory.get(s1.idempotency_key));assert.equal(result.sent,true);assert.equal(memory.get(s1.idempotency_key).state,'sent');
const sentCount=fetchCount;
local.set('sb-auth-token',JSON.stringify({access_token:'token-B',user:{id:'doctor-B'}}));result=await api.sendItem({...s1,state:'queued'});assert.equal(result.skipped,true);assert.equal(fetchCount,sentCount,'doctor B must not submit doctor A outbox');
local.set('sb-auth-token',JSON.stringify({access_token:'token-A',user:{id:'doctor-A'}}));

const oldId=s1.source_consultation_id;api.rotateEncounter('doctor-A');const s3=await api.buildSnapshot('new_case');assert.notEqual(s3.source_consultation_id,oldId,'new encounter must rotate identity');
await api.enqueue(s3);fetchMode='already';result=await api.sendItem(memory.get(s3.idempotency_key));assert.equal(result.sent,true);assert.equal(memory.get(s3.idempotency_key).server_result,'ALREADY_SUBMITTED');
api.rotateEncounter('doctor-A');const s4=await api.buildSnapshot('retry_case');await api.enqueue(s4);fetchMode='500';result=await api.sendItem(memory.get(s4.idempotency_key));assert.equal(result.sent,false);assert.equal(memory.get(s4.idempotency_key).state,'queued');assert.equal(memory.get(s4.idempotency_key).last_error,'SERVER_FAIL');assert.ok(memory.get(s4.idempotency_key).next_attempt_at,'failed item needs retry schedule');
assert.ok(api.backoff(2)>=5000,'backoff must be positive and increasing');

console.log('NEXA Audit outbox functional + contract: PASS');
