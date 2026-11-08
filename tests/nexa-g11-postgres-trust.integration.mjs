import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createIntegratedOfflineRecoveryG11} from '../labs/nexa-quota/integrated-gate.G11-LAB-ONLY.mjs';
import {createOfflineSignedReceiptVerifier} from '../labs/nexa-quota/signed-receipt.G9-LAB-ONLY.mjs';
const exec=promisify(execFile);
for(const [k,v] of Object.entries({NEXA_QUOTA_LAB:'1',PGHOST:'127.0.0.1',
 PGUSER:'postgres',PGDATABASE:'nexa_quota_lab'}))
 if(process.env[k]!==v)throw Error('G11_STOP_NOT_DISPOSABLE_LOCAL_POSTGRES');
const U='11111111-1111-4111-8111-111111111111',
 T='77777777-7777-4777-8777-777777777777',
 T2='88888888-8888-4888-8888-888888888888',
 E='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const A='nexa_g8_tenant_a',B='nexa_g8_tenant_b';
const R=n=>'99999999-9999-4999-8999-'+n.toString(16).padStart(12,'0');
const K=generateKeyPairSync('ed25519'),P=generateKeyPairSync('ed25519');
const now=()=>Math.floor(Date.now()/1000);
let nonceCounter=31000;
const fresh=()=>String((nonceCounter++)).padStart(32,'0');
const logins={[A]:'synthetic-g8-t1-only',[B]:'synthetic-g8-t2-only'};
async function sql(query,actor='postgres'){
 const env={...process.env};
 if(actor===A||actor===B){env.PGUSER=actor;env.PGPASSWORD=logins[actor];}
 else if(!['postgres','service_role'].includes(actor))throw Error('STOP_BAD_TEST_LOGIN');
 const command=actor==='service_role'?'set role service_role; '+query:query;
 const {stdout}=await exec('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1',
  '-c',command],{env,timeout:20000,maxBuffer:150000});
 return stdout.trim();
}
const escape=x=>"'"+String(x).replaceAll("'","''")+"'";
async function rpc(name,args,actor='postgres'){
 const raw=await sql("select nexa_quota."+name+"("+args.map(escape).join(',')+")::text;",actor);
 const row=raw.split('\n').find(x=>x.trim().startsWith('{'));
 assert.ok(row,'JSON expected from PostgreSQL');return JSON.parse(row);
}
async function reset(){
 await sql('truncate nexa_quota.synthetic_receipt_evidence_g9,nexa_quota.consumed_nonces_g10,nexa_quota.radar_dispatch_claims,nexa_quota.radar_reservations;');
}
async function claimFixture(n){
 assert.equal((await rpc('reserve_radar_call',[U,T,E,R(n),100,50],'service_role')).reason,'RESERVED');
 assert.equal((await rpc('claim_radar_dispatch',[U,T,E,R(n)],'service_role')).reason,'CLAIMED_ONCE');
 assert.equal((await rpc('record_radar_dispatch_outcome',[U,T,R(n),'outcome_unknown'],'service_role')).reason,'RECORDED');
}
function signedOperator({nonce=fresh(),tenant_id=T,operator_id=U,db_principal=A,key_epoch=1,expires_at=now()+75}={}){
 const claims={typ:'nexa-g11-offline-operator',issuer:'disposable-independent-auth-fixture',
  aud:'nexa-g11-offline',role:'inspect_unknown_claim',operator_id,tenant_id,
  db_principal,key_epoch,nonce,not_before:now()-4,expires_at};
 return {claims,signature:sign(null,Buffer.from(JSON.stringify(claims)),K.privateKey).toString('base64url')};
}
async function lookupAuthority({tenantId,operatorId}){
 const q="select b.principal_role||','||b.tenant_id::text||','||b.admin_user_id::text||','||"+
 "e.key_epoch||','||case when b.active then '1' else '0' end||','||"+
 "case when a.active then '1' else '0' end||','||case when e.active then '1' else '0' end from nexa_quota.operator_role_bindings b "+
 "join nexa_quota.tenant_admin_approvers a on a.tenant_id=b.tenant_id and a.admin_user_id=b.admin_user_id "+
 "join nexa_quota.operator_credential_epochs_g10 e on e.principal_role=b.principal_role and e.tenant_id=b.tenant_id "+
 "where b.tenant_id="+escape(tenantId)+" and b.admin_user_id="+escape(operatorId)+";";
 const row=await sql(q);if(!row)return null;
 const [principal,tenant,user,epoch,membership,approver,credential]=row.split(',');
 return {source:'disposable_private_registry',operator_id:user,tenant_id:tenant,
  db_principal:principal,key_epoch:Number(epoch),
  active:membership==='1'&&credential==='1',approver_active:approver==='1'};
}
function harness(overrides={}){
 let nonceCalls=0,inspections=0;
 const gate=createIntegratedOfflineRecoveryG11({
  publicKey:K.publicKey,clock:now,lookupAuthority,
  consumeDurableNonce:async ({tenantId,principal,epoch,nonce,expiryISO})=>{
   nonceCalls++;return rpc('consume_operator_nonce_g10',[tenantId,nonce,expiryISO,epoch],principal);
  },
  inspectReceipt:async ({tenantId,principal,requestId})=>{
   inspections++;return rpc('inspect_receipt_after_crash_g10',[tenantId,requestId],principal);
  },...overrides
 });
 return {gate,counts:()=>({nonceCalls,inspections})};
}
async function signedMock(n){
 const ts=now(),claims={type:'nexa-g9-offline-receipt',issuer:'offline-provider-fixture',
  aud:'nexa-g9-lab',key_id:'ephemeral-provider-ed25519',
  request_id:R(n),tenant_id:T,event_id:R(n+10000),issued_at:ts-5,observation:'indeterminate'};
 const signature=sign(null,Buffer.from(JSON.stringify(claims)),P.privateKey).toString('base64url');
 const verify=createOfflineSignedReceiptVerifier({
  publicKey:P.publicKey,clock:now,
  getClaim:async ({requestId})=>{
   const row=await sql("select r.tenant_id::text||','||c.state from nexa_quota.radar_reservations r "+
    "join nexa_quota.radar_dispatch_claims c on c.request_id=r.request_id where r.request_id="+escape(requestId)+";");
   if(!row)return null;const [tenant_id,state]=row.split(',');
   return {tenant_id,state,authenticated_source:'disposable_postgres'};
  }
 });
 const result=await verify({claims,signature},R(n));
 assert.equal(result.verified,true);
 const stored=await rpc('record_synthetic_receipt_g9',[R(n),T,result.observation,result.receipt_digest]);
 assert.equal(stored.stored,true);
}
test('integrated proof: signed operator -> registry -> DB nonce -> signed mock receipt after restart',async()=>{
 await reset();await claimFixture(1200);await signedMock(1200);
 const h=harness(),proof=signedOperator();
 const out=await h.gate(proof,R(1200));
 assert.equal(out.route,'HUMAN_REVIEW_REQUIRED');
 assert.equal(out.outcome,'UNKNOWN_WITH_SIGNED_MOCK_DIGEST');
 assert.equal(out.official_invoice_verified,false);
 assert.equal(out.automatic_paid_retry,false);
 assert.equal(out.real_supabase_auth_verified,false);
 assert.deepEqual(h.counts(),{nonceCalls:1,inspections:1});
 assert.equal(await sql("select state from nexa_quota.radar_dispatch_claims where request_id="+escape(R(1200))+";"),'outcome_unknown');
 const restarted=harness(); // fresh adapters + OS process; consumed nonce stays on DB.
 assert.equal((await restarted.gate(proof,R(1200))).reason,'REPLAY_REVOKED_OR_NONCE_UNVERIFIED');
 assert.deepEqual(restarted.counts(),{nonceCalls:1,inspections:0});
 const review=await restarted.gate(signedOperator(),R(1200)); // fresh signed nonce only reads!
 assert.equal(review.outcome,'UNKNOWN_WITH_SIGNED_MOCK_DIGEST');
 assert.equal(review.automatic_paid_retry,false);
});
test('tampered tenant, principal, role, issuer or signature never reaches DB nonce',async()=>{
 await reset();await claimFixture(1201);
 for(const change of [{tenant_id:T2},{db_principal:B},{role:'dispatch_paid'},
  {operator_id:'44444444-4444-4444-8444-444444444444'},
  {issuer:'outside-issuer'}]){
  const signed=signedOperator();Object.assign(signed.claims,change);
  const h=harness(),out=await h.gate(signed,R(1201));
  assert.equal(out.route,'STOP');
  assert.equal(h.counts().nonceCalls,0);
 }
 const notSigningKey=generateKeyPairSync('ed25519'),signed=signedOperator();
 signed.signature=sign(null,Buffer.from(JSON.stringify(signed.claims)),notSigningKey.privateKey).toString('base64url');
 const h=harness();
 assert.equal((await h.gate(signed,R(1201))).reason,'SIGNATURE_UNVERIFIED');
 assert.equal(h.counts().nonceCalls,0);
});
test('signed but cross-tenant or wrong-principal grant denied by the private registry',async()=>{
 await reset();
 for(const signed of [signedOperator({tenant_id:T2}),signedOperator({db_principal:B})]){
  const h=harness(),out=await h.gate(signed,R(1200));
  assert.equal(out.reason,'AUTHORITY_NOT_LINKED');
  assert.deepEqual(h.counts(),{nonceCalls:0,inspections:0});
 }
});
test('revoked approver or credential epoch fails closed before durable nonce consumption',async()=>{
 await reset();
 await sql("update nexa_quota.tenant_admin_approvers set active=false where tenant_id="+escape(T)+";");
 try{
  const h=harness();assert.equal((await h.gate(signedOperator(),R(1200))).reason,'AUTHORITY_NOT_LINKED');
  assert.equal(h.counts().nonceCalls,0);
 }finally{await sql("update nexa_quota.tenant_admin_approvers set active=true where tenant_id="+escape(T)+";");}
 await sql("update nexa_quota.operator_credential_epochs_g10 set key_epoch=2 where principal_role="+escape(A)+";");
 try{
  const h=harness();assert.equal((await h.gate(signedOperator(),R(1200))).reason,'AUTHORITY_NOT_LINKED');
  assert.equal(h.counts().nonceCalls,0);
  const current=signedOperator({key_epoch:2});
  assert.equal((await h.gate(current,R(1200))).reason,'RECEIPT_NOT_VISIBLE');
 }finally{await sql("update nexa_quota.operator_credential_epochs_g10 set key_epoch=1 where principal_role="+escape(A)+";");}
});
test('crash after nonce consumption returns STOP; reusing token cannot cause second review or dispatch',async()=>{
 await reset();await claimFixture(1202);
 const p=signedOperator();
 const failed=harness({inspectReceipt:async()=>{throw Error('process died');}});
 assert.equal((await failed.gate(p,R(1202))).reason,'CRASH_OR_RECEIPT_READ_UNAVAILABLE');
 const resumed=harness();
 assert.equal((await resumed.gate(p,R(1202))).reason,'REPLAY_REVOKED_OR_NONCE_UNVERIFIED');
 assert.equal(resumed.counts().inspections,0);
 assert.equal((await resumed.gate(signedOperator(),R(1202))).outcome,'UNKNOWN_WITHOUT_MOCK');
});
test('16 concurrent reuse of one signed grant yields at most one durable review',async()=>{
 await reset();await claimFixture(1203);
 const h=harness(),p=signedOperator();
 const results=await Promise.all(Array.from({length:16},()=>h.gate(p,R(1203))));
 assert.equal(results.filter(r=>r.route==='HUMAN_REVIEW_REQUIRED').length,1);
 assert.equal(results.filter(r=>r.reason==='REPLAY_REVOKED_OR_NONCE_UNVERIFIED').length,15);
 assert.equal(h.counts().inspections,1);
});
test('unavailable private authority, nonce DB, or receipt inspection produces STOP and no paid retry',async()=>{
 await reset();await claimFixture(1204);
 const cases=[
  {lookupAuthority:async()=>{throw Error('private registry unavailable');}},
  {consumeDurableNonce:async()=>{throw Error('DB unavailable');}},
  {inspectReceipt:async()=>({status:'UNKNOWN_WITHOUT_MOCK',automatic_paid_retry:true,
   official_provider_bill_verified:false,provider_no_charge_proven:false})}
 ];
 for(const override of cases){
  const h=harness(override),out=await h.gate(signedOperator(),R(1204));
  assert.equal(out.route,'STOP');assert.equal(out.automatic_paid_retry,false);
 }
});
