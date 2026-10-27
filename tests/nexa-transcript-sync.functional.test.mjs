import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const page=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=page.indexOf('async function nexaPersistAssistiveTranscript(');
const end=page.indexOf('async function processAudio(){',start);
assert.ok(start>=0&&end>start,'Expected clinical transcript integration hook');

function runner({synced=true,consent=true,writeError=null,verifiedData=null,consultError=null}={}){
 const captured={rows:null,options:null,writes:0,flushes:0};
 const consult={id:'11111111-1111-4111-8111-111111111111',
   encounter_id:'11111111-1111-4111-8111-111111111111',
   user_id:'22222222-2222-4222-8222-222222222222',
   organization_id:'33333333-3333-4333-8333-333333333333',
   consent_recorded_at:consent?'2026-10-27T11:00:00Z':null};
 const provenance={schema_version:'nexa-transcript-v1',
   source_event_id:'44444444-4444-4444-8444-444444444444',
   original_final_text:'Paciente nega febre.',structuring_input_text:'Paciente nega febre.',
   provider:'openai',transcriber_model:'synthetic-test-model',structuring_model:'synthetic-test-structurer',
   pipeline_version:'synthetic-v1',training_eligible:false};
 const rec={encounter_id:consult.encounter_id,owner_user_id:consult.user_id};
 const query=(value)=>({
   select(){return this},eq(){return this},
   async maybeSingle(){return {data:consultError?null:value,error:consultError}},
   then(ok,fail){return Promise.resolve({data:value,error:null}).then(ok,fail)}
 });
 const sb={from(name){
   if(name==='consultation_history')return query(consult);
   assert.equal(name,'encounter_transcript_versions');
   return {...query(verifiedData??captured.rows?.map(x=>({transcript_kind:x.transcript_kind,transcript_text:x.transcript_text}))??[]),
     async upsert(rows,options){captured.rows=rows;captured.options=options;captured.writes++;return {error:writeError};}};
 }};
 const context={sb,Promise,Error,console,
  setTimeout(){return 1;}, // no retained timeout in synthetic test
  clinicalEpoch:4,currentProf:{id:consult.user_id},
  window:{nexaEncounterAutosave18101:{async flush(){captured.flushes++;return {sent:1}},
    async get(){return {sync_state:synced?'synced':'pending',owner_user_id:consult.user_id}}}}};
 vm.createContext(context);
 vm.runInContext(page.slice(start,end)+'\nthis.fn=nexaPersistAssistiveTranscript;',context);
 return {fn:context.fn,provenance,rec,captured};
}
test('gate disabled causes no upload',async()=>{
 const x=runner();
 assert.equal(await x.fn(null,x.rec,4),true);
 assert.equal(x.captured.writes,0);
});
test('require remote encounter ack before transmitting raw consultation',async()=>{
 const x=runner({synced:false});
 await assert.rejects(x.fn(x.provenance,x.rec,4),/TRANSCRIPT_ENCOUNTER_NOT_SYNCHRONIZED/);
 assert.equal(x.captured.writes,0);
});
test('require documented consent before saving transcript',async()=>{
 const x=runner({consent:false});
 await assert.rejects(x.fn(x.provenance,x.rec,4),/TRANSCRIPT_CONSENT_OR_ENCOUNTER_MISSING/);
 assert.equal(x.captured.writes,0);
});
test('persist original and structuring input with verified ack and idempotent conflict option',async()=>{
 const x=runner();
 assert.equal(await x.fn(x.provenance,x.rec,4),true);
 assert.equal(x.captured.writes,1);
 assert.equal(x.captured.rows.length,2);
 assert.deepEqual(Array.from(x.captured.rows,y=>y.transcript_kind),['final_original','structuring_input']);
 assert.equal(x.captured.options.ignoreDuplicates,true);
 assert.ok(x.captured.rows.every(y=>y.owner_user_id===x.rec.owner_user_id));
});
test('do not acknowledge remote persistence if database rejects or has differing text',async()=>{
 const x=runner({writeError:{message:'denied'}});
 await assert.rejects(x.fn(x.provenance,x.rec,4),/TRANSCRIPT_REMOTE_WRITE_FAILED/);
 const y=runner({verifiedData:[{transcript_kind:'final_original',transcript_text:'different'}]});
 await assert.rejects(y.fn(y.provenance,y.rec,4),/TRANSCRIPT_REMOTE_ACK_MISMATCH/);
});

test('expired clinical session must not upload raw transcript',async()=>{
 const x=runner({consultError:{message:'JWT expired',code:'PGRST301'}});
 await assert.rejects(x.fn(x.provenance,x.rec,4),/TRANSCRIPT_CONSENT_OR_ENCOUNTER_MISSING/);
 assert.equal(x.captured.writes,0);
});
