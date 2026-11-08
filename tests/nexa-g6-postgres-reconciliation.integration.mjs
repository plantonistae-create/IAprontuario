import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const guard={NEXA_QUOTA_LAB:'1',PGHOST:'127.0.0.1',PGDATABASE:'nexa_quota_lab',PGUSER:'postgres'};
for(const [key,value] of Object.entries(guard))
 if(process.env[key]!==value)throw Error('STOP: G6 uses disposable localhost PostgreSQL only');

const A='11111111-1111-4111-8111-111111111111',
 B='22222222-2222-4222-8222-222222222222',
 D='44444444-4444-4444-8444-444444444444',
 T1='77777777-7777-4777-8777-777777777777',
 T2='88888888-8888-4888-8888-888888888888',
 EA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 EB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 ED='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const id=n=>'99999999-9999-4999-8999-'+n.toString(16).padStart(12,'0');
async function sql(statement,role='postgres'){
 assert.ok(['postgres','service_role','anon','authenticated'].includes(role));
 const {stdout}=await exec('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',
   (role==='postgres'?'':'set role '+role+'; ')+statement],
   {env:process.env,timeout:20000,maxBuffer:100000});
 return stdout.trim();
}
async function rpc(name,args,role='service_role'){
 const raw=await sql("select nexa_quota."+name+"("+args.map(x=>"'"+x+"'").join(',')+")::text;",role);
 const row=raw.split('\n').find(x=>x.trim().startsWith('{'));
 assert.ok(row,'RPC must return JSON');return JSON.parse(row);
}
const reserve=(n,user=A,tenant=T1,encounter=EA)=>
 rpc('reserve_radar_call',[user,tenant,encounter,id(n),100,50]);
const claim=(n,user=A,tenant=T1,encounter=EA)=>
 rpc('claim_radar_dispatch',[user,tenant,encounter,id(n)]);
const record=(n,state,user=A,tenant=T1)=>
 rpc('record_radar_dispatch_outcome',[user,tenant,id(n),state]);
const reconcile=(tenant=T1,admin=A,age=60,batch=100)=>
 rpc('reconcile_stale_radar_claims',[tenant,admin,age,batch]);
const age=n=>sql("update nexa_quota.radar_dispatch_claims set claimed_at=clock_timestamp()-interval '2 hours' where request_id='"+id(n)+"';");
const state=n=>sql("select state from nexa_quota.radar_dispatch_claims where request_id='"+id(n)+"';");
async function reset(){await sql('truncate nexa_quota.radar_dispatch_claims,nexa_quota.radar_reservations;');}
async function fixture(n,user=A,tenant=T1,encounter=EA){
 assert.equal((await reserve(n,user,tenant,encounter)).reason,'RESERVED');
 assert.equal((await claim(n,user,tenant,encounter)).reason,'CLAIMED_ONCE');
}

test('only a verified active administrator can close a tenant-scoped stale claim',async()=>{
 await reset();await fixture(1001);await age(1001);
 assert.equal((await reconcile(T1,B)).reason,'ADMIN_NOT_VERIFIED');
 assert.equal(await state(1001),'claimed');
 const result=await reconcile(T1,A);
 assert.deepEqual(result,{reconciled:true,reason:'STALE_CLAIMS_CLOSED_UNKNOWN',
   closed_unknown_count:1,automatic_paid_retry:false});
 assert.equal(await state(1001),'outcome_unknown');
 assert.equal((await claim(1001)).dispatch,false);
 assert.equal((await record(1001,'confirmed_response')).reason,'NO_CLAIM_OR_TERMINAL_CONFLICT');
});
test('a fresh claim is never silently settled and a terminal confirmed response is retained',async()=>{
 await reset();await fixture(1002);
 assert.equal((await reconcile()).closed_unknown_count,0);
 assert.equal(await state(1002),'claimed');
 assert.equal((await record(1002,'confirmed_response')).reason,'RECORDED');
 await age(1002);
 assert.equal((await reconcile()).closed_unknown_count,0);
 assert.equal(await state(1002),'confirmed_response');
});
test('two tenant pools do not cross-reconcile or expose request IDs in RPC output',async()=>{
 await reset();await fixture(1003,A,T1,EA);await age(1003);
 await fixture(1004,D,T2,ED);await age(1004);
 const r=await reconcile(T1,A);
 assert.equal(r.closed_unknown_count,1);
 assert.equal(await state(1003),'outcome_unknown');
 assert.equal(await state(1004),'claimed');
 assert.equal(JSON.stringify(r).includes(id(1003)),false);
 const other=await reconcile(T2,D);
 assert.equal(other.closed_unknown_count,1);
 assert.equal(await state(1004),'outcome_unknown');
});
test('multiple concurrent reconcilers cannot double-count a stale claim',async()=>{
 await reset();await fixture(1005);await age(1005);
 const results=await Promise.all(Array.from({length:12},()=>reconcile()));
 assert.ok(results.every(r=>r.reconciled===true));
 assert.equal(results.reduce((n,r)=>n+r.closed_unknown_count,0),1);
 assert.equal(await state(1005),'outcome_unknown');
 assert.equal((await reconcile()).closed_unknown_count,0);
});
test('reconciler racing an authenticated completion yields one terminal state with no retry',async()=>{
 await reset();await fixture(1006);await age(1006);
 const outcomes=await Promise.all([reconcile(),record(1006,'confirmed_response')]);
 assert.equal(outcomes[0].automatic_paid_retry,false);
 assert.ok(['confirmed_response','outcome_unknown'].includes(await state(1006)));
 assert.equal((await claim(1006)).dispatch,false);
 const value=await state(1006);
 assert.equal((await record(1006,value)).reason,'ALREADY_RECORDED');
});
test('revocation blocks reconciler, and restoring admin unblocks a safe UNKNOWN settlement',async()=>{
 await reset();await fixture(1007);await age(1007);
 await sql("update nexa_quota.tenant_admin_approvers set active=false where tenant_id='"+T1+"';");
 try{
  assert.equal((await reconcile()).reason,'ADMIN_NOT_VERIFIED');
  assert.equal(await state(1007),'claimed');
 }finally{
  await sql("update nexa_quota.tenant_admin_approvers set active=true where tenant_id='"+T1+"';");
 }
 assert.equal((await reconcile()).closed_unknown_count,1);
});
test('invalid age/batch and public roles fail closed before mutation',async()=>{
 await reset();await fixture(1008);await age(1008);
 for(const args of [[T1,A,0,10],[T1,A,30,10],[T1,A,60,0],[T1,A,60,101]]){
  const x=await rpc('reconcile_stale_radar_claims',args);
  assert.equal(x.reconciled,false);assert.equal(x.reason,'INVALID_RECONCILIATION');
 }
 for(const role of ['anon','authenticated']){
  await assert.rejects(rpc('reconcile_stale_radar_claims',[T1,A,60,1],role),/permission denied/i);
 }
 assert.equal(await state(1008),'claimed');
});
