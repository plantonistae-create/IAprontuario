import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {submitGateCOffline} from './gate-c-edge-offline.P0-CANDIDATE.mjs';

const req={source_consultation_id:'11111111-2222-4333-8444-555555555555',expected_sync_version:7};
const fixture=()=>{
 const calls=[];
 let actor='physician-fake-1';
 const f={
  calls,request:{...req},
  auth:{getUser:async()=>{calls.push('auth');return{id:actor}}},
  db:{
   checkpoint:async args=>{
    calls.push('checkpoint');f.checkpointArgs=args;
    return {receipt_id:'receipt-fake-1',payload_digest:'sha256:fake-digest',
     source_version:7,source_payload:{fields:{hda:'FICTÍCIO',dynamic_field:{x:1}},
     processing_meta:{radar:'fictício'},protocol_usage:[]}};
   },
   commit:async args=>{calls.push('atomic-commit');f.commitArgs=args;
    return {outcome:'INSERTED_PENDING',audit_case_id:'case-fake-1'}}
  },
  deidentify:async payload=>{calls.push('deidentify');f.aiInput=payload;
   return {fields:{hda:'FICTÍCIO SEM PII'},core_context:{radar:{}}}},
  validateDeidentified:async raw=>{calls.push('validate');
   return {ok:true,fields:raw.fields,core_context:raw.core_context}},
  changeActor:id=>{actor=id;}
 };
 return f;
};
const run=f=>submitGateCOffline(f);
test('server-authoritative path has two authentication checks and only one atomic commit',async()=>{
 const f=fixture(),r=await run(f);
 assert.equal(r.status,'SAVED_PENDING');
 assert.deepEqual(f.calls,['auth','checkpoint','deidentify','validate','auth','atomic-commit']);
 assert.equal(f.checkpointArgs.p_actor,'physician-fake-1');
 assert.equal(f.commitArgs.p_actor,'physician-fake-1');
 assert.equal(f.commitArgs.p_input_digest,'sha256:fake-digest');
 assert.equal(f.aiInput.fields.dynamic_field.x,1);
 assert.equal(r.resetAuthorized,false);
});
test('client clinical payload or owner forgery rejected before spending',async()=>{
 for(const bad of [{fields:{hda:'forged'}},{core_context:{plan:'forged'}},
  {owner_user_id:'another'},{tenant_id:'fake'}]){
  const f=fixture();f.request={...f.request,...bad};
  const r=await run(f);
  assert.equal(r.status,'STOP');assert.deepEqual(f.calls,[]);
 }
});
test('no checkpoint means no AI or commit',async()=>{
 const f=fixture();f.db.checkpoint=async()=>{f.calls.push('checkpoint');return null};
 assert.equal((await run(f)).code,'SERVER_CHECKPOINT_NOT_ATTESTED');
 assert.deepEqual(f.calls,['auth','checkpoint']);
});
test('revoked auth after AI cannot commit even when generated result exists',async()=>{
 const f=fixture();let seen=0;
 f.auth.getUser=async()=>{f.calls.push('auth');return{id:++seen===1?'physician-fake-1':'other-physician'}};
 assert.equal((await run(f)).code,'AUTH_CHANGED_BEFORE_ATOMIC_COMMIT');
 assert.equal(f.calls.includes('atomic-commit'),false);
});
test('invalid AI output cannot commit, no retries',async()=>{
 const f=fixture();f.validateDeidentified=async()=>{f.calls.push('validate');return {ok:false}};
 assert.equal((await run(f)).code,'DEIDENTIFICATION_NOT_VALIDATED');
 assert.equal(f.calls.filter(x=>x==='deidentify').length,1);
 assert.equal(f.calls.includes('atomic-commit'),false);
});
test('post-AI conflict, terminal review and deadlock all fail closed without repeat',async()=>{
 for(const kind of ['conflict','terminal','deadlock']){
  const f=fixture();
  f.db.commit=async()=>{f.calls.push('atomic-commit');throw Error(kind)};
  const r=await run(f);
  assert.equal(r.status,'STOP');
  assert.equal(r.code,'GATE_C_FAIL_CLOSED');
  assert.equal(f.calls.filter(x=>x==='deidentify').length,1);
  assert.equal(f.calls.filter(x=>x==='atomic-commit').length,1);
  assert.equal(r.resetAuthorized,false);
 }
});
test('pending duplicate is accepted ONLY by the atomic server outcome, not a 409',async()=>{
 const f=fixture();
 f.db.commit=async()=>{f.calls.push('atomic-commit');return {outcome:'ALREADY_MATCHED_PENDING',audit_case_id:'case-fake-1'}};
 assert.equal((await run(f)).status,'MATCHED_PENDING');
 const g=fixture();g.db.commit=async()=>{g.calls.push('atomic-commit');return {error:'ALREADY_SUBMITTED',status:409}};
 assert.equal((await run(g)).status,'STOP');
});
test('SQL candidate is present but no hosted migration or unsafe definer',()=>{
 const sql=readFileSync(join(dirname(fileURLToPath(import.meta.url)),
  'gate-c-checkpoint-atomic.P0-CANDIDATE-NOT-APPLIED.sql'),'utf8');
 assert.match(sql,/CANDIDATE LAB ONLY \/ UNEXECUTED/);
 assert.match(sql,/nexa_gate_c_checkpoint_candidate/);
 assert.match(sql,/nexa_gate_c_commit_candidate/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/for update/);
 assert.match(sql,/SOURCE_CHANGED_POST_AI/);
 assert.match(sql,/CONSENT_CHANGED_POST_AI/);
 assert.match(sql,/AUDIT_TERMINAL_IMMUTABLE/);
 assert.match(sql,/ALREADY_MATCHED_PENDING/);
 assert.doesNotMatch(sql.split('\n').filter(x=>!x.trimStart().startsWith('--')).join('\n'),/security definer/i);
});
