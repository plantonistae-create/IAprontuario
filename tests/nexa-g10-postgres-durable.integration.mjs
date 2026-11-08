import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createOfflineSignedReceiptVerifier} from '../labs/nexa-quota/signed-receipt.G9-LAB-ONLY.mjs';
const exec=promisify(execFile);
for(const [k,v] of Object.entries({
 NEXA_QUOTA_LAB:'1',PGHOST:'127.0.0.1',PGUSER:'postgres',PGDATABASE:'nexa_quota_lab'
}))if(process.env[k]!==v)throw Error('STOP: G10 only disposable localhost PostgreSQL');
const U='11111111-1111-4111-8111-111111111111',T='77777777-7777-4777-8777-777777777777',
 T2='88888888-8888-4888-8888-888888888888',E='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const R=n=>'99999999-9999-4999-8999-'+n.toString(16).padStart(12,'0');
const login={a:['nexa_g8_tenant_a','synthetic-g8-t1-only'],
 b:['nexa_g8_tenant_b','synthetic-g8-t2-only']};
const nonce=n=>n.toString(16).padStart(32,'0');
async function sql(q,actor='postgres'){
 assert.ok(['postgres','a','b','service_role','anon','authenticated'].includes(actor));
 const env={...process.env};
 if(actor==='a'||actor==='b'){env.PGUSER=login[actor][0];env.PGPASSWORD=login[actor][1];}
 const command=['service_role','anon','authenticated'].includes(actor)?'set role '+actor+'; '+q:q;
 const {stdout}=await exec('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',command],
  {env,timeout:20000,maxBuffer:120000});
 return stdout.trim();
}
async function rpc(name,args,actor='postgres'){
 const raw=await sql('select nexa_quota.'+name+'('+args.map(x=>"'"+x+"'").join(',')+')::text;',actor);
 const line=raw.split('\n').find(x=>x.trim().startsWith('{'));assert.ok(line,'expected RPC JSON');
 return JSON.parse(line);
}
const expiry=(mins=1)=>new Date(Date.now()+mins*60e3).toISOString();
const consume=(n,actor='a',tenant=T,epoch=1,date=expiry())=>
 rpc('consume_operator_nonce_g10',[tenant,nonce(n),date,epoch],actor);
const inspect=(n,actor='a',tenant=T)=>
 rpc('inspect_receipt_after_crash_g10',[tenant,R(n)],actor);
async function reset(){
 await sql('truncate nexa_quota.synthetic_receipt_evidence_g9,nexa_quota.consumed_nonces_g10,nexa_quota.radar_dispatch_claims,nexa_quota.radar_reservations;');
}
async function fixture(n){
 assert.equal((await rpc('reserve_radar_call',[U,T,E,R(n),100,50],'service_role')).reason,'RESERVED');
 assert.equal((await rpc('claim_radar_dispatch',[U,T,E,R(n)],'service_role')).reason,'CLAIMED_ONCE');
}
test('nonce ledger and review RPC are inaccessible to Data API roles',async()=>{
 for(const role of ['anon','authenticated','service_role']){
  await assert.rejects(consume(100,role),/permission denied/i);
  await assert.rejects(inspect(100,role),/permission denied/i);
  await assert.rejects(sql('select * from nexa_quota.consumed_nonces_g10;',role),/permission denied/i);
 }
 for(const role of ['a','b']){
  await assert.rejects(sql('select * from nexa_quota.operator_credential_epochs_g10;',role),/permission denied/i);
  await assert.rejects(sql('update nexa_quota.operator_credential_epochs_g10 set active=false;',role),/permission denied/i);
 }
});
test('nonce stays consumed across independently authenticated PostgreSQL sessions',async()=>{
 await reset();
 const x=await consume(101);
 assert.equal(x.accepted,true);assert.equal(x.reason,'CONSUMED_ONCE_OFFLINE');
 const y=await consume(101); // New psql OS process & new DB connection.
 assert.equal(y.accepted,false);assert.equal(y.reason,'REPLAY_BLOCKED_DURABLY');
 assert.equal(await sql('select count(*) from nexa_quota.consumed_nonces_g10;'),'1');
});
test('16 simultaneous authentic DB sessions consume one nonce, never 16',async()=>{
 await reset();
 const out=await Promise.all(Array.from({length:16},()=>consume(102)));
 assert.equal(out.filter(x=>x.accepted===true).length,1);
 assert.equal(out.filter(x=>x.reason==='REPLAY_BLOCKED_DURABLY').length,15);
 assert.equal(await sql('select count(*) from nexa_quota.consumed_nonces_g10;'),'1');
});
test('session login identity and tenant registry cannot be replaced by SET ROLE or client tenant',async()=>{
 await reset();
 assert.equal((await consume(103,'a',T2)).reason,'REVOKED_OR_WRONG_OPERATOR');
 assert.equal((await consume(103,'b',T)).reason,'REVOKED_OR_WRONG_OPERATOR');
 const forged=await sql("set role nexa_g8_tenant_a; select nexa_quota.consume_operator_nonce_g10('"+
  T+"','"+nonce(103)+"','"+expiry()+"',1)::text;");
 assert.match(forged,/REVOKED_OR_WRONG_OPERATOR/);
 assert.equal(await sql('select count(*) from nexa_quota.consumed_nonces_g10;'),'0');
 assert.equal((await consume(103,'a',T)).accepted,true);
 assert.equal((await consume(103,'b',T2)).accepted,true);
 assert.equal(await sql('select count(*) from nexa_quota.consumed_nonces_g10;'),'2');
});
test('administrative approver revocation prevents a new nonce even with valid DB credentials',async()=>{
 await reset();
 await sql("update nexa_quota.tenant_admin_approvers set active=false where tenant_id='"+T+"';");
 try{
  assert.equal((await consume(104)).reason,'REVOKED_OR_WRONG_OPERATOR');
  assert.equal(await sql('select count(*) from nexa_quota.consumed_nonces_g10;'),'0');
 }finally{await sql("update nexa_quota.tenant_admin_approvers set active=true where tenant_id='"+T+"';");}
 assert.equal((await consume(104)).accepted,true);
});
test('credential epoch rotation revokes old grants, requires new epoch and preserves consumed nonce',async()=>{
 await reset();
 assert.equal((await consume(105)).accepted,true);
 await sql("update nexa_quota.operator_credential_epochs_g10 set active=false,revoked_at=clock_timestamp() where principal_role='nexa_g8_tenant_a';");
 try{
  assert.equal((await consume(106)).reason,'REVOKED_OR_WRONG_OPERATOR');
  await sql("update nexa_quota.operator_credential_epochs_g10 set active=true,revoked_at=null,key_epoch=2 where principal_role='nexa_g8_tenant_a';");
  assert.equal((await consume(106,'a',T,1)).reason,'REVOKED_OR_WRONG_OPERATOR');
  assert.equal((await consume(106,'a',T,2)).accepted,true);
  assert.equal((await consume(105,'a',T,2)).reason,'REPLAY_BLOCKED_DURABLY');
 }finally{await sql("update nexa_quota.operator_credential_epochs_g10 set active=true,revoked_at=null,key_epoch=1 where principal_role='nexa_g8_tenant_a';");}
});
test('expiration, overlong expiration, malformed nonce and invalid epoch fail closed',async()=>{
 await reset();
 assert.equal((await consume(107,'a',T,1,expiry(-1))).reason,'INVALID_OR_EXPIRED_GRANT');
 assert.equal((await consume(107,'a',T,1,expiry(10))).reason,'INVALID_OR_EXPIRED_GRANT');
 assert.equal((await consume(107,'a',T,0)).reason,'INVALID_OR_EXPIRED_GRANT');
 const r=await rpc('consume_operator_nonce_g10',[T,'malformed',expiry(),1],'a');
 assert.equal(r.reason,'INVALID_OR_EXPIRED_GRANT');
 assert.equal(await sql('select count(*) from nexa_quota.consumed_nonces_g10;'),'0');
});
test('crash and restart preserve signed mock digest and terminal UNKNOWN without paid retry',async()=>{
 await reset();await fixture(1100);
 const signer=generateKeyPairSync('ed25519'),NOW=1800000000;
 const verifier=createOfflineSignedReceiptVerifier({
  publicKey:signer.publicKey,clock:()=>NOW,
  getClaim:async({requestId})=>{
   const line=await sql("select r.tenant_id::text||','||c.state from nexa_quota.radar_reservations r join nexa_quota.radar_dispatch_claims c on r.request_id=c.request_id where r.request_id='"+requestId+"';");
   const [tenant_id,state]=line.split(',');
   return {tenant_id,state,authenticated_source:'disposable_postgres'};
  }
 });
 assert.equal((await rpc('record_radar_dispatch_outcome',[U,T,R(1100),'outcome_unknown'],'service_role')).reason,'RECORDED');
 const claims={type:'nexa-g9-offline-receipt',issuer:'offline-provider-fixture',
  aud:'nexa-g9-lab',key_id:'ephemeral-provider-ed25519',request_id:R(1100),
  tenant_id:T,event_id:R(11100),issued_at:NOW-5,observation:'indeterminate'};
 const signed={claims,signature:sign(null,Buffer.from(JSON.stringify(claims)),signer.privateKey).toString('base64url')};
 const evidence=await verifier(signed,R(1100));assert.equal(evidence.verified,true);
 const stored=await rpc('record_synthetic_receipt_g9',[R(1100),T,evidence.observation,evidence.receipt_digest]);
 assert.equal(stored.reason,'STORED_SYNTHETIC_ONLY');
 // Each call below starts an entirely fresh postgres login: simulated process restart.
 const after=await inspect(1100);
 assert.equal(after.status,'UNKNOWN_WITH_SIGNED_MOCK_DIGEST');
 assert.equal(after.automatic_paid_retry,false);
 assert.equal(after.official_provider_bill_verified,false);
 assert.equal(after.provider_no_charge_proven,false);
 assert.equal((await inspect(1100,'b',T)).status,'AUTHORITY_NOT_VERIFIED');
 assert.equal((await rpc('claim_radar_dispatch',[U,T,E,R(1100)],'service_role')).dispatch,false);
 const conflict=await rpc('record_synthetic_receipt_g9',[R(1100),T,'seen','a'.repeat(64)]);
 assert.equal(conflict.reason,'IMMUTABLE_RECEIPT_CONFLICT');
 assert.equal((await inspect(1100)).status,'UNKNOWN_WITH_SIGNED_MOCK_DIGEST');
});
test('revoked operator cannot inspect even mock receipt after restart',async()=>{
 await reset();await fixture(1101);
 await sql("update nexa_quota.operator_credential_epochs_g10 set active=false,revoked_at=clock_timestamp() where principal_role='nexa_g8_tenant_a';");
 try{assert.equal((await inspect(1101)).status,'AUTHORITY_NOT_VERIFIED');}
 finally{await sql("update nexa_quota.operator_credential_epochs_g10 set active=true,revoked_at=null where principal_role='nexa_g8_tenant_a';");}
 assert.equal((await inspect(1101)).status,'CLAIMED_REMOTE_UNVERIFIED');
});
