import test from 'node:test';
import assert from 'node:assert/strict';
import {createFailSafeQuotaBridge} from '../labs/nexa-quota/fail-safe-bridge.LAB-ONLY.mjs';
const U='11111111-1111-4111-8111-111111111111',T='77777777-7777-4777-8777-777777777777';
const E='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',R='99999999-9999-4999-8999-000000000001';
const request=()=>({authContext:'synthetic-session',encounterId:E,requestId:R,inputTokens:100,outputTokens:50});
function harness(extra={}){
 const calls={remote:0,local:0};
 const config={
  getVerifiedUser:async()=>({id:U,is_anonymous:false}),
  getAdminMembership:async()=>({user_id:U,tenant_id:T,authorized_by:U,
   authorized_at:'2026-11-08T00:00:00Z',active:true,source:'admin_registry'}),
  ownsEncounter:async()=>true,
  reserve:async()=>({allowed:true,reason:'RESERVED'}),
  invokeRemote:async()=>{calls.remote++;return {ok:true};},
  localFallback:async()=>{calls.local++;return true;},
  timeoutMs:30,...extra
 };
 return {run:createFailSafeQuotaBridge(config),calls};
}
test('server-derived verified identity and membership can reserve exactly one remote dispatch',async()=>{
 const x=harness(),r=await x.run(request());
 assert.equal(r.route,'REMOTE_ACCEPTED');assert.equal(x.calls.remote,1);assert.equal(x.calls.local,0);
});
test('user, tenant, role, and user_metadata supplied by a caller cannot grant authority',async()=>{
 for(const key of ['user_id','tenant_id','service_role','user_metadata']){
  const x=harness(),r=await x.run({...request(),[key]:'forged'});
  assert.equal(r.reason,'INVALID_ADMISSION');assert.equal(x.calls.remote,0);assert.equal(x.calls.local,1);
 }
});
test('anonymous or missing verified user must fail closed',async()=>{
 for(const user of [null,{id:'invalid'},{id:U,is_anonymous:true}]){
  const x=harness({getVerifiedUser:async()=>user});
  assert.equal((await x.run(request())).reason,'USER_NOT_VERIFIED');assert.equal(x.calls.remote,0);
 }
});
test('registry mismatch or unapproved source blocks remote, as does foreign encounter',async()=>{
 const original={user_id:U,tenant_id:T,authorized_by:U,authorized_at:'2026-11-08T00:00:00Z',
  active:true,source:'admin_registry'};
 for(const partial of [{user_id:E},{active:false},{authorized_by:null},{source:'user_metadata'}]){
  const x=harness({getAdminMembership:async()=>({...original,...partial})});
  assert.equal((await x.run(request())).reason,'TENANT_NOT_VERIFIED');assert.equal(x.calls.remote,0);
 }
 const x=harness({ownsEncounter:async()=>false});
 assert.equal((await x.run(request())).reason,'ENCOUNTER_NOT_OWNED');assert.equal(x.calls.remote,0);
});
test('quota denies, errors and timeouts: mandatory local fallback, no paid dispatch',async()=>{
 const cases=[
  [{reserve:async()=>({allowed:false,reason:'BUDGET_EXCEEDED'})},'QUOTA_DENIED'],
  [{reserve:async()=>{throw Error('db offline');}},'AUTHORITY_OR_RESERVATION_UNAVAILABLE'],
  [{reserve:()=>new Promise(()=>{})},'AUTHORITY_OR_RESERVATION_UNAVAILABLE']
 ];
 for(const [deps,reason] of cases){
  const x=harness(deps),r=await x.run(request());
  assert.equal(r.reason,reason);assert.equal(r.remote_attempted,false);
  assert.equal(x.calls.local,1);assert.equal(x.calls.remote,0);
 }
});
test('already reserved never triggers a second paid call without completion ledger',async()=>{
 const x=harness({reserve:async()=>({allowed:true,reason:'ALREADY_RESERVED'})});
 assert.equal((await x.run(request())).reason,'DUPLICATE_OUTCOME_UNKNOWN');
 assert.equal(x.calls.remote,0);
});
test('remote timeouts/errors are UNKNOWN outcomes, never silently hidden',async()=>{
 for(const result of [()=>{throw Error('network');},()=>new Promise(()=>{}),()=>({ok:false})]){
  const x=harness({invokeRemote:async()=>{x.calls.remote++;return result();}});
  const r=await x.run(request());
  assert.equal(r.route,'LOCAL_REVIEW_REQUIRED');assert.equal(r.remote_attempted,true);
  assert.equal(r.remote_outcome,'UNKNOWN');assert.equal(x.calls.remote,1);
 }
});
test('local fallback failure produces STOP, not a pretend success',async()=>{
 const x=harness({reserve:async()=>({allowed:false,reason:'BUDGET_EXCEEDED'}),
  localFallback:async()=>{throw Error('local unavailable');}});
 assert.equal((await x.run(request())).route,'STOP');
});
