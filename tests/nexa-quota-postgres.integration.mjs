import test from 'node:test';
import assert from 'node:assert/strict';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';

const exec=promisify(execFile);
const required={NEXA_QUOTA_LAB:'1',PGHOST:'127.0.0.1',PGDATABASE:'nexa_quota_lab',PGUSER:'postgres'};
for(const [key,value] of Object.entries(required))
  if(process.env[key]!==value)throw new Error('STOP: PostgreSQL gate restricted to disposable localhost fixture');
const A='11111111-1111-4111-8111-111111111111',
 B='22222222-2222-4222-8222-222222222222',
 C='33333333-3333-4333-8333-333333333333',
 D='44444444-4444-4444-8444-444444444444',
 T1='77777777-7777-4777-8777-777777777777',
 T2='88888888-8888-4888-8888-888888888888',
 EA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 EB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 EC='cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 ED='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const isUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const request=n=>'99999999-9999-4999-8999-'+n.toString(16).padStart(12,'0');
function reserve({user=A,tenant=T1,encounter=EA,id=request(1),input=100,output=50}={}){
 if(![user,tenant,encounter,id].every(x=>isUuid.test(x))||
    ![input,output].every(x=>Number.isSafeInteger(x)&&x>0))throw Error('TEST_INPUT_INVALID');
 return "select nexa_quota.reserve_radar_call('"+user+"','"+tenant+"','"+encounter+"','"+id+"',"+input+","+output+")::text;";
}
async function sql(query,role='postgres'){
 assert.ok(['postgres','anon','authenticated','service_role'].includes(role));
 const statement=role==='postgres'?query:'set role '+role+'; '+query;
 const {stdout}=await exec('psql',['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-c',statement],{
  env:process.env,timeout:20000,maxBuffer:200000
 });
 return stdout.trim();
}
async function admit(args){
 const raw=await sql(reserve(args),'service_role');
 const row=raw.split('\n').map(x=>x.trim()).find(x=>x.startsWith('{'));
 assert.ok(row,'private quota RPC must return a JSON object');
 const result=JSON.parse(row);
 assert.equal(typeof result.allowed,'boolean');return result;
}
async function wipe(){
 await sql('truncate table nexa_quota.radar_reservations;');
}
test('private schema and reservation cannot be accessed by anon or authenticated',async()=>{
 for(const role of ['anon','authenticated']){
  await assert.rejects(sql('select * from nexa_quota.radar_reservations;',role),/permission denied/i);
  await assert.rejects(sql(reserve(),role),/permission denied/i);
 }
});
test('invalid owner, inactive/absent tenant, and missing clinical access fail closed',async()=>{
 await wipe();
 assert.equal((await admit({user:B,encounter:EA,id:request(2)})).reason,'ENCOUNTER_NOT_OWNED');
 assert.equal((await admit({user:C,encounter:EC,id:request(3)})).reason,'CLINICAL_ACCESS_REQUIRED');
 assert.equal((await admit({user:A,tenant:T2,encounter:EA,id:request(4)})).reason,'TENANT_NOT_VERIFIED');
 assert.equal((await admit({user:A,encounter:ED,id:request(5)})).reason,'ENCOUNTER_NOT_OWNED');
 assert.equal(await sql('select count(*) from nexa_quota.radar_reservations;'),'0');
});
test('input/output token caps and idempotent requests are enforced in PostgreSQL',async()=>{
 await wipe();
 assert.equal((await admit({id:request(10),input:601})).reason,'PER_CALL_TOKEN_CAP');
 assert.equal((await admit({id:request(11),output:201})).reason,'PER_CALL_TOKEN_CAP');
 assert.equal((await admit({id:request(12),input:100,output:50})).reason,'RESERVED');
 assert.equal((await admit({id:request(12),input:100,output:50})).reason,'ALREADY_RESERVED');
 assert.equal((await admit({id:request(12),input:101,output:50})).reason,'IDEMPOTENCY_CONFLICT');
 assert.equal(await sql('select count(*) from nexa_quota.radar_reservations;'),'1');
});
test('24 simultaneous requests across two users cannot exceed five tenant reservations',async()=>{
 await wipe();
 const result=await Promise.all(Array.from({length:24},(_,i)=>admit({
  user:i%2?A:B,tenant:T1,encounter:i%2?EA:EB,id:request(100+i),
  input:100,output:50
 })));
 assert.equal(result.filter(x=>x.reason==='RESERVED').length,5);
 assert.equal(result.filter(x=>x.reason==='BUDGET_EXCEEDED').length,19);
 assert.equal(await sql('select count(*) from nexa_quota.radar_reservations;'),'5');
 const distribution=await sql("select max(n) from (select count(*) n from nexa_quota.radar_reservations group by user_id) s;");
 assert.ok(Number(distribution)<=4,'per-user quota also enforced');
});
test('another tenant remains available after first tenant is exhausted',async()=>{
 const independent=await admit({user:D,tenant:T2,encounter:ED,id:request(250),input:100,output:50});
 assert.equal(independent.reason,'RESERVED');
 assert.equal(await sql("select count(*) from nexa_quota.radar_reservations where tenant_id='"+T2+"';"),'1');
});
test('transaction rollback removes an unused reservation and subsequent retry can reserve',async()=>{
 await wipe();
 const id=request(400);
 const transaction='begin; set role service_role; '+reserve({id})+' rollback;';
 const result=await sql(transaction);
 assert.match(result,/"reason"\s*:\s*"RESERVED"/);
 assert.equal(await sql('select count(*) from nexa_quota.radar_reservations;'),'0');
 assert.equal((await admit({id})).reason,'RESERVED');
 assert.equal(await sql('select count(*) from nexa_quota.radar_reservations;'),'1');
});
