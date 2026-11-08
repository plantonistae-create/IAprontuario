import test from 'node:test';
import assert from 'node:assert/strict';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
const exec=promisify(execFile);
for(const [key,value] of Object.entries({
 NEXA_QUOTA_LAB:'1',PGHOST:'127.0.0.1',PGDATABASE:'nexa_quota_lab',PGUSER:'postgres'
}))if(process.env[key]!==value)throw Error('STOP: G7 strictly disposable localhost PostgreSQL');
const U='11111111-1111-4111-8111-111111111111',
 X='22222222-2222-4222-8222-222222222222',
 D='44444444-4444-4444-8444-444444444444',
 T='77777777-7777-4777-8777-777777777777',
 T2='88888888-8888-4888-8888-888888888888',
 E='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 EX='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 E2='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const id=n=>'99999999-9999-4999-8999-'+n.toString(16).padStart(12,'0');
async function sql(query,role='postgres'){
 assert.ok(['postgres','service_role','anon','authenticated'].includes(role));
 const {stdout}=await exec('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',
  (role==='postgres'?'':'set role '+role+'; ')+query],
  {env:process.env,timeout:20000,maxBuffer:120000});
 return stdout.trim();
}
async function rpc(name,args,role='service_role'){
 const s=await sql('select nexa_quota.'+name+'('+args.map(v=>"'"+v+"'").join(',')+')::text;',role);
 const line=s.split('\n').find(v=>v.trim().startsWith('{'));
 assert.ok(line,'RPC must return JSON');return JSON.parse(line);
}
const reserve=(n,user=U,tenant=T,encounter=E)=>
 rpc('reserve_radar_call',[user,tenant,encounter,id(n),100,50]);
const claim=(n,user=U,tenant=T,encounter=E)=>
 rpc('claim_radar_dispatch',[user,tenant,encounter,id(n)]);
const inspect=(n,user=U,tenant=T,encounter=E)=>
 rpc('inspect_dispatch_crash_boundary',[user,tenant,encounter,id(n)]);
const terminal=(n,state,user=U,tenant=T)=>
 rpc('record_radar_dispatch_outcome',[user,tenant,id(n),state]);
async function reset(){await sql('truncate nexa_quota.radar_dispatch_claims,nexa_quota.radar_reservations;');}
test('crash BEFORE reservation: no visible request, no implicit first or retry dispatch',async()=>{
 await reset();const x=await inspect(2101);
 assert.equal(x.status,'NO_VISIBLE_RESERVATION');
 assert.equal(x.automatic_paid_retry,false);
});
test('crash AFTER committed reservation BEFORE claim: unclaimed != permission to automatically dispatch',async()=>{
 await reset();assert.equal((await reserve(2102)).reason,'RESERVED');
 const x=await inspect(2102);
 assert.equal(x.status,'RESERVED_NOT_CLAIMED');
 assert.equal(x.automatic_paid_retry,false);
 assert.equal(x.provider_charge_verified,false);
});
test('crash AFTER claim BEFORE provider response: claimed once and no second paid dispatch',async()=>{
 await reset();assert.equal((await reserve(2103)).reason,'RESERVED');
 assert.equal((await claim(2103)).reason,'CLAIMED_ONCE');
 assert.equal((await inspect(2103)).status,'CLAIMED_REMOTE_UNVERIFIED');
 const results=await Promise.all(Array.from({length:10},()=>claim(2103)));
 assert.equal(results.filter(r=>r.dispatch).length,0);
 assert.ok(results.every(r=>r.reason==='MISSING_OR_ALREADY_CLAIMED'));
});
test('provider response recorded vs remote unknown remain distinct immutable terminal states',async()=>{
 await reset();
 assert.equal((await reserve(2104)).reason,'RESERVED');
 assert.equal((await claim(2104)).reason,'CLAIMED_ONCE');
 assert.equal((await terminal(2104,'confirmed_response')).reason,'RECORDED');
 let x=await inspect(2104);assert.equal(x.status,'TERMINAL_RESPONSE_RECORDED');
 assert.equal(x.provider_charge_verified,false);
 assert.equal((await terminal(2104,'outcome_unknown')).recorded,false);
 assert.equal((await claim(2104)).dispatch,false);

 assert.equal((await reserve(2105)).reason,'RESERVED');
 assert.equal((await claim(2105)).reason,'CLAIMED_ONCE');
 assert.equal((await terminal(2105,'outcome_unknown')).reason,'RECORDED');
 x=await inspect(2105);assert.equal(x.status,'TERMINAL_OUTCOME_UNKNOWN');
 assert.equal(x.automatic_paid_retry,false);
 assert.equal((await terminal(2105,'confirmed_response')).recorded,false);
});
test('rollback after claim before commit restores reservation-only state',async()=>{
 await reset();assert.equal((await reserve(2106)).reason,'RESERVED');
 const raw=await sql("begin; set role service_role; select nexa_quota.claim_radar_dispatch('"+
 U+"','"+T+"','"+E+"','"+id(2106)+"')::text; rollback;");
 assert.match(raw,/CLAIMED_ONCE/);
 assert.equal((await inspect(2106)).status,'RESERVED_NOT_CLAIMED');
 assert.equal(await sql("select count(*) from nexa_quota.radar_dispatch_claims where request_id='"+id(2106)+"';"),'0');
});
test('revocation and foreign user/encounter hide the visible reservation',async()=>{
 await reset();assert.equal((await reserve(2107)).reason,'RESERVED');
 assert.equal((await inspect(2107,X,T,EX)).status,'NO_VISIBLE_RESERVATION');
 assert.equal((await inspect(2107,D,T2,E2)).status,'NO_VISIBLE_RESERVATION');
 assert.equal((await inspect(2107,U,T,EX)).status,'AUTHORITY_NOT_VERIFIED');
 await sql("update nexa_quota.tenant_admin_approvers set active=false where tenant_id='"+T+"';");
 try{assert.equal((await inspect(2107)).status,'AUTHORITY_NOT_VERIFIED');}
 finally{await sql("update nexa_quota.tenant_admin_approvers set active=true where tenant_id='"+T+"';");}
});
test('no schema function accessible via anon/authenticated',async()=>{
 for(const role of ['anon','authenticated']){
  await assert.rejects(rpc('inspect_dispatch_crash_boundary',[U,T,E,id(2107)],role),
   /permission denied/i);
 }
});
