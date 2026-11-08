import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
for(const [k,v] of Object.entries({
 NEXA_QUOTA_LAB:'1',PGHOST:'127.0.0.1',PGDATABASE:'nexa_quota_lab',PGUSER:'postgres'
}))if(process.env[k]!==v)throw Error('STOP: G8 PostgreSQL restricted to disposable localhost fixture');
const U='11111111-1111-4111-8111-111111111111',
 D='44444444-4444-4444-8444-444444444444',
 T1='77777777-7777-4777-8777-777777777777',
 T2='88888888-8888-4888-8888-888888888888',
 EA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 ED='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const request=n=>'99999999-9999-4999-8999-'+n.toString(16).padStart(12,'0');
const login={
 a:{user:'nexa_g8_tenant_a',password:'synthetic-g8-t1-only'},
 b:{user:'nexa_g8_tenant_b',password:'synthetic-g8-t2-only'}
};
async function sql(query,actor='postgres'){
 assert.ok(['postgres','a','b','service_role','authenticated','anon'].includes(actor));
 const env={...process.env};
 if(actor==='a'||actor==='b'){
   env.PGUSER=login[actor].user;env.PGPASSWORD=login[actor].password;
 }
 const statement=['service_role','authenticated','anon'].includes(actor)?
   'set role '+actor+'; '+query:query;
 const {stdout}=await exec('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1',
   '-c',statement],{env,timeout:20000,maxBuffer:100000});
 return stdout.trim();
}
async function rpc(name,args,actor='service_role'){
 const out=await sql("select nexa_quota."+name+"("+
   args.map(x=>"'"+String(x)+"'").join(',')+")::text;",actor);
 const row=out.split('\n').find(x=>x.trim().startsWith('{'));
 assert.ok(row,'JSON RPC required');
 return JSON.parse(row);
}
const reserve=(n,user=U,tenant=T1,encounter=EA)=>
 rpc('reserve_radar_call',[user,tenant,encounter,request(n),100,50]);
const claim=(n,user=U,tenant=T1,encounter=EA)=>
 rpc('claim_radar_dispatch',[user,tenant,encounter,request(n)]);
const reclaim=(tenant=T1,actor='a',age=60,batch=100)=>
 rpc('reconcile_stale_as_session_operator_g8',[tenant,age,batch],actor);
const state=n=>sql("select state from nexa_quota.radar_dispatch_claims where request_id='"+request(n)+"';");
async function reset(){await sql('truncate nexa_quota.radar_dispatch_claims,nexa_quota.radar_reservations;');}
async function fixture(n,user=U,tenant=T1,encounter=EA){
 assert.equal((await reserve(n,user,tenant,encounter)).reason,'RESERVED');
 assert.equal((await claim(n,user,tenant,encounter)).reason,'CLAIMED_ONCE');
 await sql("update nexa_quota.radar_dispatch_claims set claimed_at=clock_timestamp()-interval '2 hours' where request_id='"+request(n)+"';");
}
test('G8 function cannot be called through service_role, anon or authenticated',async()=>{
 for(const actor of ['service_role','anon','authenticated']){
  await assert.rejects(reclaim(T1,actor),/permission denied/i);
 }
});
test('actual postgres login identity binds session_user independently of client admin IDs',async()=>{
 await reset();await fixture(3001);
 const r=await reclaim(T1,'a');
 assert.equal(r.reconciled,true);
 assert.equal(r.closed_unknown_count,1);
 assert.equal(r.automatic_paid_retry,false);
 assert.equal(r.provider_charge_verified,false);
 assert.equal(await state(3001),'outcome_unknown');
});
test('SET ROLE alone cannot forge the authenticated login session_user',async()=>{
 await reset();await fixture(3002);
 const out=await sql("set role nexa_g8_tenant_a; select nexa_quota.reconcile_stale_as_session_operator_g8('"+T1+"',60,100)::text;");
 const row=out.split('\n').find(s=>s.trim().startsWith('{'));
 assert.ok(row);
 const result=JSON.parse(row);
 assert.equal(result.reason,'SESSION_ADMIN_NOT_VERIFIED');
 assert.equal(await state(3002),'claimed');
});
test('tenant A login cannot reconcile B and B login cannot reconcile A',async()=>{
 await reset();await fixture(3003);
 await fixture(3004,D,T2,ED);
 assert.equal((await reclaim(T2,'a')).reason,'SESSION_ADMIN_NOT_VERIFIED');
 assert.equal((await reclaim(T1,'b')).reason,'SESSION_ADMIN_NOT_VERIFIED');
 assert.equal(await state(3003),'claimed');
 assert.equal(await state(3004),'claimed');
 assert.equal((await reclaim(T2,'b')).closed_unknown_count,1);
 assert.equal((await reclaim(T1,'a')).closed_unknown_count,1);
});
test('revocation of the original bootstrap approver immediately denies reconciliation',async()=>{
 await reset();await fixture(3005);
 await sql("update nexa_quota.tenant_admin_approvers set active=false where tenant_id='"+T1+"';");
 try{
  assert.equal((await reclaim(T1,'a')).reason,'SESSION_ADMIN_NOT_VERIFIED');
  assert.equal(await state(3005),'claimed');
 }finally{await sql("update nexa_quota.tenant_admin_approvers set active=true where tenant_id='"+T1+"';");}
 assert.equal((await reclaim(T1,'a')).closed_unknown_count,1);
});
test('operator role binding cannot be edited by service_role or authenticated operator',async()=>{
 await assert.rejects(sql("update nexa_quota.operator_role_bindings set active=false where principal_role='nexa_g8_tenant_a';",'service_role'),/permission denied/i);
 await assert.rejects(sql("update nexa_quota.operator_role_bindings set active=false where principal_role='nexa_g8_tenant_a';",'a'),/permission denied/i);
 await assert.rejects(sql("select * from nexa_quota.operator_role_bindings;",'a'),/permission denied/i);
});
test('16 concurrent verified logins close a stale claim just once without paid retries',async()=>{
 await reset();await fixture(3006);
 const outcomes=await Promise.all(Array.from({length:16},()=>reclaim(T1,'a')));
 assert.ok(outcomes.every(x=>x.reconciled&&x.automatic_paid_retry===false));
 assert.equal(outcomes.reduce((n,x)=>n+x.closed_unknown_count,0),1);
 assert.equal(await state(3006),'outcome_unknown');
 assert.equal((await claim(3006)).dispatch,false);
});
test('invalid limits, fresh claim and terminal confirmed response never re-open remote dispatch',async()=>{
 await reset();
 assert.equal((await reclaim(T1,'a',0)).reason,'INVALID_RECONCILIATION');
 assert.equal((await reclaim(T1,'a',60,0)).reason,'INVALID_RECONCILIATION');
 assert.equal((await reclaim(T1,'a',60,101)).reason,'INVALID_RECONCILIATION');
 assert.equal((await reserve(3007)).reason,'RESERVED');
 assert.equal((await claim(3007)).reason,'CLAIMED_ONCE');
 assert.equal((await reclaim(T1,'a')).closed_unknown_count,0);
 assert.equal((await rpc('record_radar_dispatch_outcome',[U,T1,request(3007),'confirmed_response'])).reason,'RECORDED');
 assert.equal((await reclaim(T1,'a')).closed_unknown_count,0);
 assert.equal(await state(3007),'confirmed_response');
});

test('legacy G6 RPC can no longer accept a forged p_admin_user_id through service_role',async()=>{
 await reset();await fixture(3008);
 await assert.rejects(rpc('reconcile_stale_radar_claims',[T1,U,60,100],'service_role'),/permission denied/i);
 assert.equal(await state(3008),'claimed');
 assert.equal((await reclaim(T1,'a')).closed_unknown_count,1);
});
