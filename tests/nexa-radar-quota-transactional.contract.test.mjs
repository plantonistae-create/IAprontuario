import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createQuotaModel} from '../labs/nexa-quota/transaction-model.mjs';
const sql=readFileSync(new URL('../labs/nexa-quota/transactional-reservation.REVIEW-ONLY.sql',import.meta.url),'utf8');
const make=()=>createQuotaModel({memberships:['ten_a|doc_a','ten_a|doc_b'],
 encounters:['ten_a|doc_a|enc_a','ten_a|doc_b|enc_b'],
 tenants:{ten_a:{maxInput:900,maxOutput:120,userPerMinute:3,tenantPerMinute:5,encounterPerMinute:3,encounterTokens:2000}}});
test('private RLS schema, caller restrictions and invoker privileges are explicit',()=>{
 for(const marker of ['security invoker',"set search_path = ''",'enable row level security','for update',
 'revoke execute on function','from public, anon, authenticated','grant execute on function',
 'to service_role','for share','c.user_id=p_user_id and c.encounter_id=p_encounter_id'])
 assert.ok(sql.includes(marker),marker);
 assert.doesNotMatch(sql,/security definer|raw_user_meta_data|user_metadata/i);
 assert.ok(sql.startsWith('-- INERT REVIEW CANDIDATE.'));
});
test('all tenant reservations are locked before checking aggregate ceilings',()=>{
 const lock=sql.indexOf('where tenant_id=p_tenant_id for update'),count=sql.indexOf('select count(*) filter(');
 const insert=sql.indexOf('insert into nexa_quota.radar_reservations');
 assert.ok(lock>0&&count>lock&&insert>count);
 assert.ok(sql.includes('request_id uuid primary key'));
});
test('40 simultaneous requests never exceed a five-call tenant ceiling in synthetic model',async()=>{
 const gate=make();
 const responses=await Promise.all(Array.from({length:40},(_,i)=>gate.admit({
  user:i%2?'doc_a':'doc_b',tenant:'ten_a',encounter:i%2?'enc_a':'enc_b',
  request:'req_'+i,input:100,output:50
 })));
 assert.equal(responses.filter(x=>x.reason==='RESERVED').length,5);
 assert.equal(gate.count(),5);
 assert.equal(responses.filter(x=>x.reason==='BUDGET_EXCEEDED').length,35);
});
test('idempotent retry cannot charge twice or change owners',async()=>{
 const gate=make();const q={tenant:'ten_a',user:'doc_a',encounter:'enc_a',request:'req_1',input:150,output:60};
 assert.equal((await gate.admit(q)).reason,'RESERVED');
 assert.equal((await gate.admit(q)).reason,'ALREADY_RESERVED');
 assert.equal((await gate.admit({...q,user:'doc_b'})).reason,'ENCOUNTER_NOT_OWNED');
 assert.equal((await gate.admit({...q,input:200})).reason,'IDEMPOTENCY_CONFLICT');
 assert.equal(gate.count(),1);
});
test('no tenant membership or matching encounter denies without reservation',async()=>{
 const gate=make();
 assert.equal((await gate.admit({tenant:'ten_b',user:'doc_a',encounter:'enc_a',request:'req_one',input:10,output:10})).reason,'TENANT_NOT_VERIFIED');
 assert.equal((await gate.admit({tenant:'ten_a',user:'doc_b',encounter:'enc_a',request:'req_two',input:10,output:10})).reason,'ENCOUNTER_NOT_OWNED');
 assert.equal(gate.count(),0);
});
test('per-call and encounter token budgets fail closed without using real provider prices',async()=>{
 const gate=make();
 const x={tenant:'ten_a',user:'doc_a',encounter:'enc_a',request:'req_x',input:100,output:50};
 assert.equal((await gate.admit({...x,input:1000})).reason,'PER_CALL_TOKEN_CAP');
 for(let i=0;i<3;i++)assert.equal((await gate.admit({...x,request:'req_'+i,input:500,output:120})).allowed,true);
 assert.equal((await gate.admit({...x,request:'req_new',input:500,output:120})).reason,'BUDGET_EXCEEDED');
 assert.equal(gate.count(),3);
});
