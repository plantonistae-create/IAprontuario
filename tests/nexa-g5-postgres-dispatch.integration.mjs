import test from 'node:test';
import assert from 'node:assert/strict';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
const exec=promisify(execFile);
const requirements={NEXA_QUOTA_LAB:'1',PGHOST:'127.0.0.1',PGDATABASE:'nexa_quota_lab',PGUSER:'postgres'};
for(const [key,value] of Object.entries(requirements))
 if(process.env[key]!==value)throw Error('STOP: G5 only accepts disposable localhost fixture');
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const D='44444444-4444-4444-8444-444444444444';
const T1='77777777-7777-4777-8777-777777777777';
const T2='88888888-8888-4888-8888-888888888888';
const EA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ED='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const id=n=>'99999999-9999-4999-8999-'+n.toString(16).padStart(12,'0');
async function query(stmt,role='postgres'){
 assert.ok(['postgres','service_role','anon','authenticated'].includes(role));
 const {stdout}=await exec('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',
   (role==='postgres'?'':'set role '+role+'; ')+stmt],
   {env:process.env,timeout:20000,maxBuffer:100000});
 return stdout.trim();
}
async function rpc(fn,args,role='service_role'){
 const raw=await query('select nexa_quota.'+fn+'('+args.map(x=>"'"+x+"'").join(',')+')::text;',role);
 const line=raw.split('\n').find(x=>x.trim().startsWith('{'));
 assert.ok(line,'expected JSON from private-schema RPC');
 return JSON.parse(line);
}
const reserve=(n,user=A,tenant=T1,encounter=EA)=>rpc('reserve_radar_call',[user,tenant,encounter,id(n),100,50]);
const claim=(n,user=A,tenant=T1,encounter=EA)=>rpc('claim_radar_dispatch',[user,tenant,encounter,id(n)]);
const record=(n,state,user=A,tenant=T1)=>rpc('record_radar_dispatch_outcome',[user,tenant,id(n),state]);
async function reset(){await query('truncate nexa_quota.radar_dispatch_claims,nexa_quota.radar_reservations;');}
test('G5 claims are private and cannot be invoked or inspected by browser roles',async()=>{
 for(const role of ['anon','authenticated']){
  await assert.rejects(query('select * from nexa_quota.radar_dispatch_claims;',role),/permission denied/i);
  await assert.rejects(rpc('claim_radar_dispatch',[A,T1,EA,id(1)],role),/permission denied/i);
  await assert.rejects(rpc('record_radar_dispatch_outcome',[A,T1,id(1),'outcome_unknown'],role),/permission denied/i);
 }
});
test('no reservation => no claim and no paid dispatch authorization',async()=>{
 await reset();assert.deepEqual(await claim(600),{dispatch:false,reason:'MISSING_OR_ALREADY_CLAIMED'});
 assert.equal(await query('select count(*) from nexa_quota.radar_dispatch_claims;'),'0');
});
test('one reservation can be claimed exactly once, including 16 racing workers',async()=>{
 await reset();assert.equal((await reserve(601)).reason,'RESERVED');
 const res=await Promise.all(Array.from({length:16},()=>claim(601)));
 assert.equal(res.filter(x=>x.reason==='CLAIMED_ONCE').length,1);
 assert.equal(res.filter(x=>x.reason==='MISSING_OR_ALREADY_CLAIMED').length,15);
 assert.equal(await query('select count(*) from nexa_quota.radar_dispatch_claims;'),'1');
 assert.equal((await reserve(601)).reason,'ALREADY_RESERVED');
 assert.equal((await claim(601)).dispatch,false);
});
test('terminal UNKNOWN cannot be reclassified as confirmed to justify another attempt',async()=>{
 assert.equal((await record(601,'outcome_unknown')).reason,'RECORDED');
 assert.equal((await record(601,'outcome_unknown')).reason,'ALREADY_RECORDED');
 assert.equal((await record(601,'confirmed_response')).reason,'NO_CLAIM_OR_TERMINAL_CONFLICT');
 assert.equal((await claim(601)).dispatch,false);
 assert.equal(await query("select state from nexa_quota.radar_dispatch_claims where request_id='"+id(601)+"';"),'outcome_unknown');
});
test('confirmed response is idempotent; foreign owner/tenant cannot change state',async()=>{
 await reset();assert.equal((await reserve(602)).reason,'RESERVED');
 assert.equal((await claim(602)).reason,'CLAIMED_ONCE');
 assert.equal((await record(602,'confirmed_response',D,T2)).recorded,false);
 assert.equal((await record(602,'confirmed_response',B,T1)).recorded,false);
 assert.equal((await record(602,'confirmed_response')).reason,'RECORDED');
 assert.equal((await record(602,'confirmed_response')).reason,'ALREADY_RECORDED');
 assert.equal((await record(602,'outcome_unknown')).reason,'NO_CLAIM_OR_TERMINAL_CONFLICT');
});
test('a revoked administrative approver prevents a new claim even on an existing reservation',async()=>{
 await reset();assert.equal((await reserve(603)).reason,'RESERVED');
 await query("update nexa_quota.tenant_admin_approvers set active=false where tenant_id='"+T1+"';");
 try{
  assert.equal((await claim(603)).reason,'TENANT_NOT_VERIFIED');
  assert.equal(await query('select count(*) from nexa_quota.radar_dispatch_claims;'),'0');
 }finally{
  await query("update nexa_quota.tenant_admin_approvers set active=true where tenant_id='"+T1+"';");
 }
 assert.equal((await claim(603)).reason,'CLAIMED_ONCE');
});
test('a claim already in flight can be marked UNKNOWN after administrative revocation',async()=>{
 await reset();assert.equal((await reserve(604)).reason,'RESERVED');
 assert.equal((await claim(604)).reason,'CLAIMED_ONCE');
 await query("update nexa_quota.tenant_admin_approvers set active=false where tenant_id='"+T1+"';");
 try{assert.equal((await record(604,'outcome_unknown')).reason,'RECORDED');}
 finally{await query("update nexa_quota.tenant_admin_approvers set active=true where tenant_id='"+T1+"';");}
});
test('invalid outcome, foreign encounter and separate tenant do not leak a claim',async()=>{
 await reset();assert.equal((await reserve(605)).reason,'RESERVED');
 assert.equal((await claim(605,A,T1,EB)).reason,'ENCOUNTER_NOT_OWNED');
 assert.equal((await claim(605,D,T2,ED)).reason,'MISSING_OR_ALREADY_CLAIMED');
 assert.equal((await record(605,'reserved')).reason,'INVALID_OUTCOME');
 assert.equal(await query('select count(*) from nexa_quota.radar_dispatch_claims;'),'0');
});
test('transactional rollback removes a claim and cannot count as dispatched',async()=>{
 await reset();assert.equal((await reserve(606)).reason,'RESERVED');
 const raw=await query("begin; set role service_role; select nexa_quota.claim_radar_dispatch('"+A+"','"+T1+"','"+EA+"','"+id(606)+"')::text; rollback;");
 assert.match(raw,/CLAIMED_ONCE/);
 assert.equal(await query('select count(*) from nexa_quota.radar_dispatch_claims;'),'0');
 assert.equal((await claim(606)).reason,'CLAIMED_ONCE');
});
