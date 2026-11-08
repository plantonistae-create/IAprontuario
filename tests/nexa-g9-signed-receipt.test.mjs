import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createOfflineSignedReceiptVerifier} from '../labs/nexa-quota/signed-receipt.G9-LAB-ONLY.mjs';
const NOW=1800000000,R='99999999-9999-4999-8999-000000000901';
const T='77777777-7777-4777-8777-777777777777',T2='88888888-8888-4888-8888-888888888888';
const E='99999999-9999-4999-8999-000000000902';
const k=generateKeyPairSync('ed25519'),bad=generateKeyPairSync('ed25519');
const payload=()=>({type:'nexa-g9-offline-receipt',
 issuer:'offline-provider-fixture',aud:'nexa-g9-lab',
 key_id:'ephemeral-provider-ed25519',request_id:R,tenant_id:T,
 event_id:E,issued_at:NOW-5,observation:'indeterminate'});
const proof=(claims=payload(),key=k.privateKey)=>({
 claims,signature:sign(null,Buffer.from(JSON.stringify(claims)),key).toString('base64url')
});
function make(override={}){
 let lookups=0;
 const check=createOfflineSignedReceiptVerifier({
  publicKey:k.publicKey,clock:()=>NOW,
  getClaim:async()=>{lookups++;return {
   tenant_id:T,state:'outcome_unknown',authenticated_source:'disposable_postgres'
  };},...override
 });
 return {check,lookups:()=>lookups};
}
test('signed synthetic mock with matching tenant and claimed request gives digest only, never billing proof',async()=>{
 const {check}=make(),x=await check(proof(),R);
 assert.equal(x.verified,true);assert.equal(x.reason,'SIGNED_OFFLINE_FIXTURE_ONLY');
 assert.match(x.receipt_digest,/^[0-9a-f]{64}$/);
 assert.equal(x.official_invoice_verified,false);
 assert.equal(x.zero_charge_verified,false);
 assert.equal(x.paid_retry_allowed,false);
 assert.equal(x.clinic_validated,false);
});
test('mutated outcome or tenant after signature cannot change result',async()=>{
 for(const delta of [{observation:'seen'},{tenant_id:T2},{request_id:E}]){
  const x=proof();Object.assign(x.claims,delta);
  const y=await make().check(x,R);
  assert.equal(y.verified,false);
  assert.ok(['RECEIPT_SIGNATURE_INVALID','RECEIPT_CLAIMS_INVALID'].includes(y.reason));
 }
});
test('untrusted signer is not an observed provider event',async()=>{
 const x=await make().check(proof(payload(),bad.privateKey),R);
 assert.equal(x.reason,'RECEIPT_SIGNATURE_INVALID');assert.equal(x.verified,false);
});
test('expired, future, foreign-audience and fabricated billing fields never pass',async()=>{
 for(const patch of [
  {issued_at:NOW-121},{issued_at:NOW+1},{aud:'real-provider'},
  {issuer:'unverified-provider'},{observation:'charged'},
  {event_id:'invalid'}, {key_id:'unknown-key'}
 ]){
  const c=payload(),x=await make().check(proof({...c,...patch}),R);
  assert.equal(x.verified,false);
 }
 const x=proof();x.claims.patient_name='PRIVATE';
 assert.equal((await make().check(x,R)).reason,'RECEIPT_ENVELOPE_INVALID');
});
test('foreign request and foreign tenant claim fail before any billing claim',async()=>{
 const x=make();
 assert.equal((await x.check(proof(),E)).reason,'RECEIPT_CLAIMS_INVALID');
 const y=make({getClaim:async()=>({tenant_id:T2,state:'claimed',
  authenticated_source:'disposable_postgres'})});
 assert.equal((await y.check(proof(),R)).reason,'CLAIM_NOT_AUTHORIZED_OR_VISIBLE');
});
test('unclaimed, unverified and missing claims are rejected',async()=>{
 for(const state of ['reserved','missing','retry_allowed']){
  const y=make({getClaim:async()=>({tenant_id:T,state,
   authenticated_source:'disposable_postgres'})});
  const r=await y.check(proof(),R);assert.equal(r.verified,false);
 }
 const x=make({getClaim:async()=>{throw Error('offline');}});
 assert.equal((await x.check(proof(),R)).reason,'CLAIM_LOOKUP_UNAVAILABLE');
});
test('all signed synthetic observations remain nonauthoritative for provider spend',async()=>{
 for(const observation of ['seen','not_found','indeterminate']){
  const x=await make().check(proof({...payload(),observation}),R);
  assert.equal(x.verified,true);
  assert.equal(x.zero_charge_verified,false);
  assert.equal(x.official_invoice_verified,false);
  assert.equal(x.paid_retry_allowed,false);
 }
});
