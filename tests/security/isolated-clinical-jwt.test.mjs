/** Real Supabase Auth, Data API and Edge integration in an empty separate project.
 * Prepare first with scripts/isolated-clinical-fixtures.mjs prepare; always cleanup.
 * No fake auth.uid(), service-role acting client, skipped tests, or real NEXA refs.
 */
import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {isolatedTarget} from '../../scripts/isolated-clinical-target.mjs';

const target=isolatedTarget({ref:process.env.NEXA_ISOLATED_REF,url:process.env.NEXA_ISOLATED_URL,
 dbURL:process.env.NEXA_ISOLATED_DB_URL,ack:process.env.NEXA_ISOLATED_ACK,
 authURL:process.env.NEXA_ISOLATED_AUTH_URL,restURL:process.env.NEXA_ISOLATED_REST_URL,
 functionsURL:process.env.NEXA_ISOLATED_FUNCTIONS_URL,localOnly:process.env.NEXA_LOCAL_ONLY==='1'});
if(target.local&&['NEXA_STAGING_SERVICE_ROLE_KEY','NEXA_STAGING_DB_URL','SUPABASE_ACCESS_TOKEN'].some(x=>process.env[x]))
 throw new Error('Hosted credentials are forbidden in local test process');
const publishable=process.env.NEXA_ISOLATED_PUBLISHABLE_KEY;
const file=process.env.NEXA_ISOLATED_FIXTURE_FILE||'';
if(!publishable||!/^\/tmp\/nexa-isolated-clinical-[a-z0-9-]+\.json$/.test(file))throw new Error('Missing isolated test configuration');
const fixture=JSON.parse(readFileSync(file,'utf8'));
if(fixture.synthetic!==true||fixture.projectRef!==target.ref||fixture.seeded!==true)throw new Error('Unverified synthetic fixture');
const db=new URL(target.dbURL);
const pgEnv={...process.env,PGHOST:db.hostname,PGPORT:db.port||'5432',PGUSER:decodeURIComponent(db.username),
 PGPASSWORD:decodeURIComponent(db.password),PGDATABASE:decodeURIComponent(db.pathname.slice(1)),
 PGSSLMODE:target.local?'disable':'require',PGCONNECT_TIMEOUT:'15'};
function sql(query){return execFileSync(process.env.NEXA_LOCAL_PSQL_BIN||'psql',['-X','-v','ON_ERROR_STOP=1','--quiet','--no-align','--tuples-only','--command',query],
 {env:pgEnv,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
const uuid=x=>{assert.match(x,/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);return `'${x}'::uuid`};
const clients={},tokens={};
const ids={A:randomUUID(),B:randomUUID()};
before(async()=>{
 assert.equal(sql('SELECT count(*) FROM public.profiles'), '7');
 assert.equal(sql("SELECT to_regclass('private.nexa_historical_evidence') IS NOT NULL"),'t');
 assert.equal(sql("SELECT has_table_privilege('authenticated','private.nexa_historical_evidence','SELECT')"),'f');
 assert.equal(sql(`SELECT count(*) FROM private.clinical_slots WHERE profile_id IN (${Object.values(fixture.actors).map(x=>uuid(x.id)).join(',')})`),'2');
 for(const name of ['doctorA','doctorB','doctorNoAccess','adminA','reviewerB','revokedUser','noOrg']){
  const actor=fixture.actors[name];
  assert.equal(actor.email,`qa-clinical-${fixture.runId}-${name}@example.invalid`);
  const client=createClient(target.api,publishable,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {data,error}=await client.auth.signInWithPassword({email:actor.email,password:actor.password});
  assert.ifError(error);assert.equal(data.user.id,actor.id);
  assert.equal(data.session.access_token.split('.').length,3);
  const verified=await client.auth.getUser(data.session.access_token);
  assert.ifError(verified.error);assert.equal(verified.data.user.id,actor.id);
  clients[name]=client;tokens[name]=data.session.access_token;
 }
});
test('signed physician JWTs create, read, update and delete only their own consultations',async()=>{
 for(const [name,org,id] of [['doctorA','A',ids.A],['doctorB','B',ids.B]]){
  const actor=fixture.actors[name],client=clients[name];
  const now=new Date().toISOString();
  const payload={id,encounter_id:id,user_id:actor.id,fields:{queixa_principal:'Synthetic-only clinical test'},
   status:'draft',encounter_state:'draft',consent_recorded_at:now,created_at:now,last_client_saved_at:now,
   protocol_usage:[],audit_priority:0,processing_meta:{}};
  const created=await client.from('consultation_history').insert(payload).select('id,organization_id,user_id').single();
  assert.ifError(created.error);assert.equal(created.data.organization_id,fixture.organizations[org]);
  assert.equal(created.data.user_id,actor.id);
  const read=await client.from('consultation_history').select('id').eq('id',id);
  assert.ifError(read.error);assert.deepEqual(read.data.map(x=>x.id),[id]);
  const updated=await client.from('consultation_history').update({fields:{queixa_principal:'Synthetic revised'}}).eq('id',id).select('id,fields');
  assert.ifError(updated.error);assert.equal(updated.data[0]?.fields?.queixa_principal,'Synthetic revised');
 }
 for(const [name,other] of [['doctorA',ids.B],['doctorB',ids.A]]){
  const read=await clients[name].from('consultation_history').select('id').eq('id',other);
  assert.ifError(read.error);assert.deepEqual(read.data,[],'Cross-organization RLS leak');
  const write=await clients[name].from('consultation_history').update({fields:{queixa_principal:'Forbidden'}}).eq('id',other).select('id');
  assert.ifError(write.error);assert.deepEqual(write.data,[],'Cross-organization write reached row');
 }
 const prior=await clients.doctorA.from('consultation_history').select('organization_id,fields').eq('id',ids.A).single();
 assert.ifError(prior.error);
 const reassigned=await clients.doctorA.from('consultation_history').update({organization_id:fixture.organizations.B}).eq('id',ids.A).select('id');
 assert.ok(reassigned.error,'Encounter tenant reassignment was accepted');
 const afterReassignment=await clients.doctorA.from('consultation_history').select('organization_id,fields').eq('id',ids.A).single();
 assert.ifError(afterReassignment.error);assert.deepEqual(afterReassignment.data,prior.data,'Rejected write changed the consultation');
 const wrongTenant=await clients.doctorA.from('consultation_history').insert({
  id:randomUUID(),encounter_id:randomUUID(),user_id:fixture.actors.doctorA.id,
  organization_id:fixture.organizations.B,fields:{queixa_principal:'Synthetic forbidden'},
  status:'draft',encounter_state:'draft',consent_recorded_at:new Date().toISOString()}).select('id');
 assert.ok(wrongTenant.error,'Cross-organization insert was accepted');
 const reviewer=await clients.reviewerB.from('consultation_history').select('id').eq('id',ids.B);
 assert.ifError(reviewer.error);assert.deepEqual(reviewer.data,[],'Reviewer gained clinical access');
 const anonymous=createClient(target.api,publishable,{auth:{persistSession:false,autoRefreshToken:false}});
 const anon=await anonymous.from('consultation_history').select('id').eq('id',ids.A);
 if(anon.error)assert.equal(anon.error.code,'42501');else assert.deepEqual(anon.data,[]);
 const audit=sql(`SELECT count(*) FROM public.audit_log WHERE consultation_id IN ('${ids.A}','${ids.B}') AND action IN ('create','update')`);
 assert.ok(Number(audit)>=4,'Authorized changes were not audited');
 const ownAudit=await clients.doctorA.from('audit_log').select('consultation_id').eq('consultation_id',ids.A);
 assert.ifError(ownAudit.error);assert.ok(ownAudit.data.length>=2);
 const foreignAudit=await clients.doctorB.from('audit_log').select('consultation_id').eq('consultation_id',ids.A);
 assert.ifError(foreignAudit.error);assert.deepEqual(foreignAudit.data,[]);
 const foreignProfile=await clients.doctorA.from('profiles').select('id').eq('id',fixture.actors.doctorB.id);
 assert.ifError(foreignProfile.error);assert.deepEqual(foreignProfile.data,[]);
 const deleted=await clients.doctorA.from('consultation_history').delete().eq('id',ids.A).select('id');
 assert.ifError(deleted.error);assert.deepEqual(deleted.data.map(x=>x.id),[ids.A]);
});
test('real JWTs without a clinical slot or active organization cannot read or write encounters',async()=>{
 for(const name of ['doctorNoAccess','adminA','reviewerB','revokedUser','noOrg']){
  const read=await clients[name].from('consultation_history').select('id').eq('id',ids.B);
  assert.ifError(read.error);assert.deepEqual(read.data,[],name+' read a clinical row');
  const created=await clients[name].from('consultation_history').insert({
   id:randomUUID(),encounter_id:randomUUID(),user_id:fixture.actors[name].id,
   fields:{queixa_principal:'Synthetic forbidden'},status:'draft',encounter_state:'draft',
   consent_recorded_at:new Date().toISOString()}).select('id');
  assert.ok(created.error,name+' inserted a clinical row');
 }
 assert.equal(sql('SELECT count(*) FROM public.consultation_history'), '1');
});
test('revoked membership blocks the same previously issued JWT',async()=>{
 const actor=fixture.actors.doctorB.id,org=fixture.organizations.B;
 const before=await clients.doctorB.from('consultation_history').select('id').eq('id',ids.B);
 assert.ifError(before.error);assert.deepEqual(before.data.map(x=>x.id),[ids.B]);
 try{
  sql(`UPDATE public.organization_memberships SET status='revoked',revoked_at=now() WHERE user_id=${uuid(actor)} AND organization_id=${uuid(org)}`);
  const after=await clients.doctorB.from('consultation_history').select('id').eq('id',ids.B);
  assert.ifError(after.error);assert.deepEqual(after.data,[]);
  const write=await clients.doctorB.from('consultation_history').update({fields:{queixa_principal:'Forbidden after revocation'}}).eq('id',ids.B).select('id');
  assert.ifError(write.error);assert.deepEqual(write.data,[]);
  const current=await clients.doctorB.auth.getSession();
  assert.equal(current.data.session.access_token,tokens.doctorB,'Token was refreshed during revocation test');
 }finally{
  sql(`UPDATE public.organization_memberships SET status='active',revoked_at=NULL,activated_at=now() WHERE user_id=${uuid(actor)} AND organization_id=${uuid(org)}`);
 }
});
test('audit queue is tenant scoped and clinical JWT never grants training export',async()=>{
 const queue=await clients.reviewerB.rpc('get_audit_queue_v2',{limit_count:200,offset_count:0});
 assert.ifError(queue.error);assert.ok(queue.data.some(x=>x.id===fixture.auditCases.B));
 assert.ok(!queue.data.some(x=>x.id===fixture.auditCases.A));
 const adminQueue=await clients.adminA.rpc('get_audit_queue_v2',{limit_count:200,offset_count:0});
 assert.ifError(adminQueue.error);assert.ok(adminQueue.data.some(x=>x.id===fixture.auditCases.A));
 assert.ok(!adminQueue.data.some(x=>x.id===fixture.auditCases.B));
 for(const name of ['doctorA','doctorB','doctorNoAccess','reviewerB','revokedUser','noOrg']){
  const response=await fetch(target.api+'/functions/v1/core-dataset-export',{method:'POST',
   headers:{apikey:publishable,Authorization:'Bearer '+tokens[name],
    Origin:process.env.NEXA_ISOLATED_ORIGIN||'https://plantonistae-create.github.io','Content-Type':'application/json'},
   body:JSON.stringify({dataset_version:'synthetic-denied-test',limit:1,offset:0}),signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,403,name+' must not export training data');
  assert.equal((await response.json()).error,'DATASET_ADMIN_REQUIRED');
 }
 const endpoint=target.api+'/functions/v1/core-dataset-export';
 const missing=await fetch(endpoint,{method:'POST',headers:{Origin:process.env.NEXA_ISOLATED_ORIGIN||'https://plantonistae-create.github.io'},signal:AbortSignal.timeout(20000)});
 assert.equal(missing.status,401,'Edge gateway accepted missing JWT');
 const forged=await fetch(endpoint,{method:'POST',headers:{apikey:publishable,Authorization:'Bearer invalid.jwt.signature',
  Origin:process.env.NEXA_ISOLATED_ORIGIN||'https://plantonistae-create.github.io'},signal:AbortSignal.timeout(20000)});
 assert.equal(forged.status,401,'Edge gateway accepted invalid JWT');
});
test('Edge rechecks profile status against an already issued JWT',async()=>{
 const actor=fixture.actors.adminA.id;
 const headers={apikey:publishable,Authorization:'Bearer '+tokens.adminA,
  Origin:process.env.NEXA_ISOLATED_ORIGIN||'https://plantonistae-create.github.io','Content-Type':'application/json'};
 const invoke=()=>fetch(target.api+'/functions/v1/core-dataset-export',{method:'POST',headers,
  body:JSON.stringify({dataset_version:'synthetic-denied-test',limit:1,offset:0}),signal:AbortSignal.timeout(20000)});
 const before=await invoke();
 assert.equal(before.status,503);assert.equal((await before.json()).error,'DATASET_EXPORT_NOT_CONFIGURED');
 try{
  sql(`UPDATE public.profiles SET access_status='revoked' WHERE id=${uuid(actor)}`);
  const after=await invoke();assert.equal(after.status,403);assert.equal((await after.json()).error,'DATASET_ADMIN_REQUIRED');
  const current=await clients.adminA.auth.getSession();
  assert.equal(current.data.session.access_token,tokens.adminA);
 }finally{sql(`UPDATE public.profiles SET access_status='active' WHERE id=${uuid(actor)}`);}
});
test('historical issuer evidence is not exposed through a physician JWT',async()=>{
 for(const name of ['doctorA','doctorB']){
  const evidence=await clients[name].schema('private').from('nexa_historical_evidence').select('id').limit(1);
  assert.ok(evidence.error,name+' unexpectedly reached the private evidence ledger');
 }
});
