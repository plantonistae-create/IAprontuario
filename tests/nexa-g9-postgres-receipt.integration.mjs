import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createOfflineSignedReceiptVerifier} from '../labs/nexa-quota/signed-receipt.G9-LAB-ONLY.mjs';
const exec=promisify(execFile);
for(const [key,value] of Object.entries({
 NEXA_QUOTA_LAB:'1',PGHOST:'127.0.0.1',PGDATABASE:'nexa_quota_lab',PGUSER:'postgres'
}))if(process.env[key]!==value)throw Error('STOP: G9 only disposable localhost PG fixtures');
const U='11111111-1111-4111-8111-111111111111',T='77777777-7777-4777-8777-777777777777',
 T2='88888888-8888-4888-8888-888888888888',EA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const R=n=>'99999999-9999-4999-8999-'+n.toString(16).padStart(12,'0');
const NOW=1800000000,signer=generateKeyPairSync('ed25519');
async function sql(stmt,actor='postgres'){
 assert.ok(['postgres','service_role','anon','authenticated','nexa_g8_tenant_a'].includes(actor));
 const command=actor==='postgres'?stmt:'set role '+actor+'; '+stmt;
 const {stdout}=await exec('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',command],
  {env:process.env,timeout:20000,maxBuffer:150000});
 return stdout.trim();
}
async function rpc(name,args,actor='postgres'){
 const q="select nexa_quota."+name+"("+args.map(x=>"'"+x+"'").join(',')+")::text;";
 const raw=await sql(q,actor),line=raw.split('\n').find(x=>x.trim().startsWith('{'));
 assert.ok(line,'expected isolated RPC JSON');return JSON.parse(line);
}
async function reset(){
 await sql('truncate nexa_quota.synthetic_receipt_evidence_g9,nexa_quota.radar_dispatch_claims,nexa_quota.radar_reservations;');
}
async function fixture(n){
 assert.equal((await rpc('reserve_radar_call',[U,T,EA,R(n),100,50],'service_role')).reason,'RESERVED');
 assert.equal((await rpc('claim_radar_dispatch',[U,T,EA,R(n)],'service_role')).reason,'CLAIMED_ONCE');
}
const state=n=>sql("select state from nexa_quota.radar_dispatch_claims where request_id='"+R(n)+"';");
const rowCount=()=>sql('select count(*) from nexa_quota.synthetic_receipt_evidence_g9;');
function signed(n,observation='indeterminate',key=signer.privateKey){
 const claims={type:'nexa-g9-offline-receipt',issuer:'offline-provider-fixture',aud:'nexa-g9-lab',
  key_id:'ephemeral-provider-ed25519',request_id:R(n),tenant_id:T,
  event_id:R(n+10000),issued_at:NOW-5,observation};
 return {claims,signature:sign(null,Buffer.from(JSON.stringify(claims)),key).toString('base64url')};
}
const verifier=createOfflineSignedReceiptVerifier({
 publicKey:signer.publicKey,clock:()=>NOW,
 getClaim:async({requestId})=>{
  const record=await sql("select r.tenant_id::text||','||c.state from nexa_quota.radar_reservations r join nexa_quota.radar_dispatch_claims c on c.request_id=r.request_id where r.request_id='"+requestId+"';");
  if(!record)return null;
  const [tenant_id,state]=record.split(',');return {tenant_id,state,authenticated_source:'disposable_postgres'};
 }
});
async function verifiedWrite(proof,n){
 const verified=await verifier(proof,R(n));
 if(!verified.verified)return verified;
 return rpc('record_synthetic_receipt_g9',[R(n),T,verified.observation,verified.receipt_digest]);
}
test('browser and service_role cannot inspect or manufacture receipt evidence through Data API roles',async()=>{
 for(const actor of ['service_role','anon','authenticated','nexa_g8_tenant_a']){
  await assert.rejects(sql('select * from nexa_quota.synthetic_receipt_evidence_g9;',actor),/permission denied/i);
  await assert.rejects(rpc('record_synthetic_receipt_g9',[R(901),T,'seen','a'.repeat(64)],actor),/permission denied/i);
 }
});
test('unclaimed or missing reservation is not accepted as a receipt',async()=>{
 await reset();
 const r=await rpc('record_synthetic_receipt_g9',[R(901),T,'seen','a'.repeat(64)]);
 assert.equal(r.reason,'CLAIM_NOT_FOUND_IN_TENANT');
 assert.equal(await rowCount(),'0');
 const attempted=await verifiedWrite(signed(901),901);
 assert.equal(attempted.verified,false);
});
test('valid offline-signed fixture persists digest once while terminal UNKNOWN stays UNKNOWN',async()=>{
 await reset();await fixture(902);
 assert.equal((await rpc('record_radar_dispatch_outcome',[U,T,R(902),'outcome_unknown'],'service_role')).reason,'RECORDED');
 const proof=signed(902,'indeterminate'),a=await verifiedWrite(proof,902),b=await verifiedWrite(proof,902);
 assert.equal(a.reason,'STORED_SYNTHETIC_ONLY');
 assert.equal(b.reason,'ALREADY_STORED_SYNTHETIC');
 assert.equal(a.automatic_paid_retry,false);assert.equal(await rowCount(),'1');
 assert.equal(await state(902),'outcome_unknown');
 assert.equal((await rpc('claim_radar_dispatch',[U,T,EA,R(902)],'service_role')).dispatch,false);
});
test('16 racing writes are idempotent, with a single immutable stored row',async()=>{
 await reset();await fixture(903);
 const proof=signed(903,'seen');
 const results=await Promise.all(Array.from({length:16},()=>verifiedWrite(proof,903)));
 assert.equal(results.filter(x=>x.reason==='STORED_SYNTHETIC_ONLY').length,1);
 assert.equal(results.filter(x=>x.reason==='ALREADY_STORED_SYNTHETIC').length,15);
 assert.equal(await rowCount(),'1');
});
test('conflicting digest, outcome or tenant cannot overwrite an existing observation',async()=>{
 await reset();await fixture(904);
 const first=await verifiedWrite(signed(904,'seen'),904);
 assert.equal(first.stored,true);
 const altered=await verifiedWrite(signed(904,'not_found'),904);
 assert.equal(altered.reason,'IMMUTABLE_RECEIPT_CONFLICT');
 assert.equal((await rpc('record_synthetic_receipt_g9',[R(904),T2,'seen','a'.repeat(64)])).reason,'CLAIM_NOT_FOUND_IN_TENANT');
 assert.equal(await rowCount(),'1');
});
test('a forged provider signer or tampered signed data never reaches storage path',async()=>{
 await reset();await fixture(905);
 const different=generateKeyPairSync('ed25519'),bad=signed(905,'seen',different.privateKey);
 const x=await verifiedWrite(bad,905);
 assert.equal(x.reason,'RECEIPT_SIGNATURE_INVALID');assert.equal(await rowCount(),'0');
 const tampered=signed(905);tampered.claims.observation='seen';
 const y=await verifiedWrite(tampered,905);
 assert.equal(y.reason,'RECEIPT_SIGNATURE_INVALID');assert.equal(await rowCount(),'0');
});
test('invalid digest and invented observation are refused even by privileged mock ledger function',async()=>{
 await reset();await fixture(906);
 for(const args of [[R(906),T,'charged','a'.repeat(64)],[R(906),T,'seen','NOT_HEX']]){
  const r=await rpc('record_synthetic_receipt_g9',args);
  assert.equal(r.reason,'INVALID_MOCK_EVIDENCE');
 }
 assert.equal(await rowCount(),'0');
});
