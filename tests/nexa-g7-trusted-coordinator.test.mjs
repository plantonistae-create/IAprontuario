import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfflineReconcilerCoordinator} from '../labs/nexa-quota/trusted-coordinator.G7-LAB-ONLY.mjs';
const U='11111111-1111-4111-8111-111111111111',T='77777777-7777-4777-8777-777777777777';
const input=()=>({authContext:'synthetic',tenantId:T,minAgeSeconds:180,batchSize:12});
const authority=()=>({source:'admin_registry',active:true,tenant_id:T,admin_user_id:U});
function setup(overrides={}){
 let rpcCalls=0,stops=[];
 const adapters={
  getVerifiedOperator:async()=>({id:U,verified_via:'auth.getUser',is_anonymous:false}),
  getApprovedAuthority:async()=>authority(),
  reconcile:async()=>{rpcCalls++;return {reconciled:true,closed_unknown_count:2,automatic_paid_retry:false};},
  localStop:async x=>{stops.push(x.reason);},
  ...overrides
 };
 return {run:createOfflineReconcilerCoordinator(adapters),
  calls:()=>rpcCalls,stops:()=>stops};
}
test('valid independently verified administrator may close UNKNOWN but never authorize remote retries',async()=>{
 const s=setup(),x=await s.run(input());
 assert.equal(x.route,'CLOSED_UNKNOWN_ONLY');assert.equal(x.count,2);
 assert.equal(x.automatic_paid_retry,false);assert.equal(x.remote_charge_verified,false);
 assert.equal(s.calls(),1);
});
test('client forgery of admin, tenant, metadata, JWT claims or service role is rejected before RPC',async()=>{
 for(const key of ['adminId','admin_user_id','user_metadata','service_role','jwt_claims','user_id']){
  const s=setup(),x=await s.run({...input(),[key]:'forged'});
  assert.equal(x.reason,'INVALID_REQUEST');assert.equal(s.calls(),0);
 }
});
test('unverified/anonymous/mismatched operator is not a real admin',async()=>{
 for(const operator of [null,{id:U,verified_via:'jwt_decode',is_anonymous:false},
  {id:U,verified_via:'auth.getUser',is_anonymous:true},
  {id:'not-a-uuid',verified_via:'auth.getUser',is_anonymous:false}]){
  const s=setup({getVerifiedOperator:async()=>operator});
  assert.equal((await s.run(input())).reason,'OPERATOR_UNVERIFIED');
  assert.equal(s.calls(),0);
 }
});
test('inactive, foreign or user-metadata authority never permits reconciliation',async()=>{
 for(const p of [{active:false},{admin_user_id:'44444444-4444-4444-8444-444444444444'},
  {source:'user_metadata'},{tenant_id:'88888888-8888-4888-8888-888888888888'}]){
  const s=setup({getApprovedAuthority:async()=>({...authority(),...p})});
  assert.equal((await s.run(input())).reason,'ADMIN_NOT_APPROVED');assert.equal(s.calls(),0);
 }
});
test('auth error and uncertain response fail closed with no automatic retry',async()=>{
 for(const override of [
  {getApprovedAuthority:async()=>{throw Error('private registry offline');}},
  {reconcile:async()=>{throw Error('network');}},
  {reconcile:async()=>({reconciled:true,closed_unknown_count:2,automatic_paid_retry:true})},
  {reconcile:async()=>({reconciled:true,closed_unknown_count:-1,automatic_paid_retry:false})}
 ]){
  const s=setup(override),x=await s.run(input());
  assert.equal(x.route,'STOP');assert.equal(x.automatic_paid_retry,false);
 }
});
test('invalid age or local stop failure produces explicit STOP',async()=>{
 const s=setup({localStop:async()=>{throw Error('offline');}});
 assert.equal((await s.run({...input(),minAgeSeconds:0})).reason,'LOCAL_STOP_FAILED');
 assert.equal(s.calls(),0);
});
