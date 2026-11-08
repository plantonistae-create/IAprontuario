import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createOfflineOperatorBoundary} from '../labs/nexa-quota/signed-operator.G9-LAB-ONLY.mjs';
const U='11111111-1111-4111-8111-111111111111';
const T='77777777-7777-4777-8777-777777777777';
const T2='88888888-8888-4888-8888-888888888888';
const NOW=1800000000;
const pair=generateKeyPairSync('ed25519');
const other=generateKeyPairSync('ed25519');
const claims=()=>({typ:'nexa-g9-admin-grant',issuer:'offline-authority-fixture',
 aud:'nexa-g9-lab',key_id:'ephemeral-ed25519',operator_id:U,tenant_id:T,
 role:'reconcile_unknown',not_before:NOW-10,expires_at:NOW+60,
 nonce:'aabbccddeeff00112233445566778899'});
const proof=(c=claims(),key=pair.privateKey)=>({
 claims:c,signature:sign(null,Buffer.from(JSON.stringify(c)),key).toString('base64url')});
function setup(deps={}){
 const consumed=new Set();
 let registryCalls=0,nonceCalls=0;
 const boundary=createOfflineOperatorBoundary({
  publicKey:pair.publicKey,now:()=>NOW,
  lookupAuthority:async ({operatorId,tenantId})=>{registryCalls++;
   return {source:'admin_registry',active:true,admin_authorized:true,
    operator_id:operatorId,tenant_id:tenantId};},
  consumeNonce:async ({tenantId,nonce})=>{nonceCalls++;
   const k=tenantId+':'+nonce;
   if(consumed.has(k))return false;consumed.add(k);return true;},
  ...deps
 });
 return {boundary,stats:()=>({registryCalls,nonceCalls})};
}
test('independent signed attestation with active registry accepts offline only and proves no Supabase auth',async()=>{
 const x=setup(),r=await x.boundary(proof());
 assert.equal(r.authorized,true);
 assert.equal(r.live_approved,false);
 assert.equal(r.trusted_operator_login_proven,false);
 assert.equal(r.automatic_paid_retry,false);
 assert.deepEqual(x.stats(),{registryCalls:1,nonceCalls:1});
});
test('caller-provided role, tenant, identity or metadata cannot modify signed claims',async()=>{
 for(const k of ['role','tenant_id','operator_id']){
  const x=setup(),p=proof();p.claims[k]=k==='role'?'admin':T2;
  const r=await x.boundary(p);
  assert.equal(r.authorized,false);
  assert.ok(['SIGNATURE_UNTRUSTED','CLAIMS_NOT_CURRENT_OR_TRUSTED'].includes(r.reason));
  assert.deepEqual(x.stats(),{registryCalls:0,nonceCalls:0});
 }
 for(const k of ['user_metadata','service_role','request_body','jwt_unverified']){
  const x=setup(),p=proof();p[k]='forged';
  assert.equal((await x.boundary(p)).reason,'ENVELOPE_INVALID');
 }
});
test('a valid signature from an unpinned signer is rejected',async()=>{
 const x=setup(),r=await x.boundary(proof(claims(),other.privateKey));
 assert.equal(r.reason,'SIGNATURE_UNTRUSTED');
 assert.equal(r.authorized,false);
});
test('expired, future, excessive TTL, unexpected audience and issuer fail closed',async()=>{
 const variants=[
  {expires_at:NOW-1},{not_before:NOW+1},{not_before:NOW-500},
  {expires_at:NOW+300},{aud:'different-audience'},{issuer:'unverified'},
  {role:'superadmin'},{key_id:'rotated-or-unknown'}
 ];
 for(const patch of variants){
  const x=setup(),r=await x.boundary(proof({...claims(),...patch}));
  assert.equal(r.authorized,false);assert.equal(r.reason,'CLAIMS_NOT_CURRENT_OR_TRUSTED');
  assert.deepEqual(x.stats(),{registryCalls:0,nonceCalls:0});
 }
});
test('revoked, foreign or user-metadata registry source blocks even genuine signatures',async()=>{
 for(const patch of [
  {active:false},{admin_authorized:false},{source:'user_metadata'},
  {operator_id:'44444444-4444-4444-8444-444444444444'},{tenant_id:T2}
 ]){
  const x=setup({lookupAuthority:async()=>({source:'admin_registry',
   active:true,admin_authorized:true,operator_id:U,tenant_id:T,...patch})});
  assert.equal((await x.boundary(proof())).reason,'ADMIN_NOT_VERIFIED');
 }
});
test('16 concurrent identical grants cannot consume the same synthetic nonce twice',async()=>{
 const x=setup(),p=proof();
 const res=await Promise.all(Array.from({length:16},()=>x.boundary(p)));
 assert.equal(res.filter(y=>y.authorized).length,1);
 assert.equal(res.filter(y=>y.reason==='REPLAY_OR_NONCE_UNAVAILABLE').length,15);
});
test('missing nonce store and authority outages fail STOP without paid retry',async()=>{
 for(const deps of [
  {consumeNonce:async()=>{throw Error('down');}},
  {consumeNonce:async()=>false},
  {lookupAuthority:async()=>{throw Error('down');}}
 ]){
  const x=setup(deps),r=await x.boundary(proof());
  assert.equal(r.authorized,false);
  assert.equal(r.automatic_paid_retry,false);
 }
});
