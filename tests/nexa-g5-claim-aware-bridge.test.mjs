import test from 'node:test';
import assert from 'node:assert/strict';
import {createClaimAwareBridge} from '../labs/nexa-quota/claim-aware-bridge.G5-LAB-ONLY.mjs';
const U='11111111-1111-4111-8111-111111111111';
const T='77777777-7777-4777-8777-777777777777';
const E='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const R='99999999-9999-4999-8999-000000000001';
const input=()=>({authContext:'test',encounterId:E,requestId:R,inputTokens:120,outputTokens:50});
function make(overrides={}){
 let call=0,record=[],claims=0,fallback=0;
 const base={
  getVerifiedUser:async()=>({id:U,is_anonymous:false}),
  getAdminMembership:async()=>({user_id:U,tenant_id:T,authorized_by:U,
   authorized_at:'2026-11-08T00:00:00Z',active:true,source:'admin_registry'}),
  ownsEncounter:async()=>true,
  reserve:async()=>({allowed:true,reason:'RESERVED'}),
  claimDispatch:async()=>{claims++;return {dispatch:true,reason:'CLAIMED_ONCE'};},
  invokeRemote:async()=>{call++;return {ok:true};},
  recordOutcome:async v=>{record.push(v.state);return {recorded:true,reason:'RECORDED'};},
  localFallback:async()=>{fallback++;},
  timeoutMs:100,
  ...overrides
 };
 return {run:createClaimAwareBridge(base),stats:()=>({call,record,claims,fallback})};
}
test('remote dispatch allowed only after actual reservation and atomic claim',async()=>{
 const x=make(),r=await x.run(input());
 assert.equal(r.route,'REMOTE_ACCEPTED');
 assert.deepEqual(x.stats(),{call:1,record:['confirmed_response'],claims:1,fallback:0});
});
test('claim rejected after quota reservation is local only, without provider call',async()=>{
 const x=make({claimDispatch:async()=>({dispatch:false,reason:'MISSING_OR_ALREADY_CLAIMED'})});
 const r=await x.run(input());
 assert.equal(r.route,'LOCAL_REVIEW_REQUIRED');assert.equal(r.reason,'QUOTA_DENIED');
 assert.equal(x.stats().call,0);assert.equal(x.stats().fallback,1);
});
test('DB claim timeouts never authorize a provider dispatch',async()=>{
 const x=make({claimDispatch:()=>new Promise(()=>{}),timeoutMs:30});
 const r=await x.run(input());
 assert.equal(r.route,'LOCAL_REVIEW_REQUIRED');assert.equal(r.remote_attempted,false);
 assert.equal(x.stats().call,0);
});
test('non-2xx response has UNKNOWN terminal outcome, never automatic retry',async()=>{
 const x=make({invokeRemote:async()=>({ok:false})});
 const r=await x.run(input());
 assert.equal(r.route,'LOCAL_REVIEW_REQUIRED');
 assert.equal(r.remote_outcome,'UNKNOWN');
 assert.deepEqual(x.stats().record,['outcome_unknown']);
});
test('failure to settle after provider success must not be reported as successful',async()=>{
 const x=make({recordOutcome:async()=>({recorded:false})});
 const r=await x.run(input());
 assert.equal(r.route,'LOCAL_REVIEW_REQUIRED');assert.equal(r.remote_outcome,'UNKNOWN');
});
test('remote exception is recorded UNKNOWN when possible, and never re-dispatched',async()=>{
 const x=make({invokeRemote:async()=>{throw Error('disconnected');}});
 const r=await x.run(input());
 assert.equal(r.remote_attempted,true);assert.equal(r.remote_outcome,'UNKNOWN');
 assert.deepEqual(x.stats().record,['outcome_unknown']);
});
