/**
 * Integration suite with REAL staging Auth sessions and JWTs.
 * Run: NEXA_TENANT_FIXTURES_JSON="$(cat /tmp/nexa-tenant-fixtures.json)" \
 *      node --test tests/security/staging-tenant-jwt.test.mjs
 * Requires NEXA_STAGING_URL, NEXA_STAGING_PUBLISHABLE_KEY, NEXA_STAGING_DB_URL.
 * The PostgreSQL connection is used ONLY for synthetic fixture inspection/cleanup,
 * never as the acting identity for RPC authorization checks.
 */
import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const url=process.env.NEXA_STAGING_URL??'';
const publishable=process.env.NEXA_STAGING_PUBLISHABLE_KEY??'';
const dbURL=process.env.NEXA_STAGING_DB_URL??'';
if(new URL(url).origin!=='https://phaitiijsjwrggdnoxiz.supabase.co')throw new Error('Only staging project permitted');
if(!publishable||!dbURL||!process.env.NEXA_TENANT_FIXTURES_JSON)throw new Error('Missing required staging credentials / synthetic fixture manifest');
const dbTarget=new URL(dbURL);
if(!['postgres:','postgresql:'].includes(dbTarget.protocol) ||
   !(dbTarget.hostname==='db.phaitiijsjwrggdnoxiz.supabase.co' ||
     (dbTarget.hostname.endsWith('.pooler.supabase.com') &&
      decodeURIComponent(dbTarget.username).endsWith('.phaitiijsjwrggdnoxiz')))){
 throw new Error('Refusing PostgreSQL connection not uniquely tied to staging');
}
const fixture=JSON.parse(process.env.NEXA_TENANT_FIXTURES_JSON);
const actors={};
const members=fixture.memberships??{};
const uuid=value=>{
  assert.match(String(value),/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  return "'"+value+"'::uuid";
};
function dbCommand(sql){
  return execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','--quiet','--no-align','--tuples-only',
    '--dbname',dbURL,'--command',sql],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
}
function dbRows(select){
  const raw=dbCommand("SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM ("+select+") AS t;");
  return JSON.parse(raw);
}
const dbRow=select=>dbRows(select)[0];
const membership=id=>dbRow('SELECT id,organization_id,user_id,status,revoked_at,roles FROM public.organization_memberships WHERE id='+uuid(id));
function updateFixture(sql){dbCommand(sql);}
async function login(name){
  const entry=fixture.actors[name];
  assert.ok(entry?.email&&entry?.password&&entry?.id,'Missing synthetic account '+name);
  const c=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {data,error}=await c.auth.signInWithPassword({email:entry.email,password:entry.password});
  if(error||!data?.session?.access_token)throw new Error('JWT login failed for '+name);
  assert.equal(data.user.id,entry.id);
  actors[name]=c;
}
const invoke=(name,rpc,args)=>actors[name].rpc(rpc,args);
function denied(result,label){
  assert.ok(result.error,label+': expected denial');
  assert.equal(result.error.code,'42501',label+': wrong SQLSTATE');
}
async function deniedUnchanged(actor,id,label){
  const previous=membership(id);
  denied(await invoke(actor,'revoke_organization_membership',{p_membership_id:id}),label);
  assert.deepEqual(membership(id),previous,label+': denied operation mutated row');
}
before(async()=>{
  assert.equal(fixture.synthetic,true);
  const required=['global','adminA','doctorA','doctorB','reviewerB','unaffiliated','ownerC1','ownerC2'];
  for(const name of required)assert.ok(fixture.actors?.[name]);
  for(const name of ['adminA','doctorA','doctorB','ownerA','ownerC1','ownerC2'])assert.ok(members[name]);
  for(const name of ['A','B','C']){
    const oid=fixture.organizations?.[name];
    const org=dbRow('SELECT id,slug,status FROM public.organizations WHERE id='+uuid(oid));
    assert.ok(org?.slug?.startsWith('qa-tenant-')&&org.status==='active','Unsafe/non-synthetic org '+name);
  }
  await Promise.all(required.map(login));
});

test('synthetic identities have least privilege and consume no clinical slots',()=>{
  const read=name=>dbRow('SELECT is_admin,is_reviewer,clinical_access,access_status FROM public.profiles WHERE id='+uuid(fixture.actors[name].id));
  for(const name of ['adminA','doctorA','doctorB','unaffiliated','ownerA','ownerC1','ownerC2','ownerB']){
    const p=read(name);
    assert.equal(p.is_admin,false,name+' unexpectedly became global administrator');
    assert.equal(p.is_reviewer,false,name+' unexpectedly became global reviewer');
    assert.equal(p.clinical_access,false,name+' unexpectedly consumed clinical access');
    assert.equal(p.access_status,'active');
  }
  assert.equal(read('global').is_admin,true);
  assert.equal(read('global').is_reviewer,false);
  assert.equal(read('reviewerB').is_reviewer,true);
  assert.equal(read('reviewerB').is_admin,false);
  assert.equal(dbRows('SELECT slot_id FROM private.clinical_slots WHERE profile_id IN ('+
    Object.values(fixture.actors).map(a=>uuid(a.id)).join(',')+')').length,0,
    'Synthetic identities consumed reserved clinical slots');
});
test('admins, doctors, reviewers and unaffiliated users cannot cross tenants',async()=>{
  await deniedUnchanged('adminA',members.doctorB,'admin A -> B doctor');
  await deniedUnchanged('doctorA',members.doctorB,'doctor A -> B doctor');
  await deniedUnchanged('doctorA',members.doctorA,'doctor A -> own org');
  await deniedUnchanged('reviewerB',members.doctorA,'reviewer B -> A');
  await deniedUnchanged('unaffiliated',members.doctorA,'unaffiliated -> A');
});
test('self revocation and attempt against sole owner are denied',async()=>{
  await deniedUnchanged('adminA',members.adminA,'self revoke');
  await deniedUnchanged('adminA',members.ownerA,'institution admin -> sole owner');
});
test('two independent owner JWT sessions cannot both revoke the other owner',async()=>{
  const keys=['ownerC1','ownerC2'];
  const previous=keys.map(key=>membership(members[key]));
  assert.ok(previous.every(x=>x.status==='active'));
  try{
    const results=await Promise.all([
      invoke('ownerC1','revoke_organization_membership',{p_membership_id:members.ownerC2}),
      invoke('ownerC2','revoke_organization_membership',{p_membership_id:members.ownerC1})
    ]);
    assert.equal(results.filter(x=>!x.error).length,1,'Only one competing revocation may commit');
    results.filter(x=>x.error).forEach(result=>assert.equal(result.error.code,'42501'));
    const after=keys.map(key=>membership(members[key]));
    assert.equal(after.filter(x=>x.status==='active').length,1,'Owner invariant violated');
  }finally{
    for(const row of previous)updateFixture('UPDATE public.organization_memberships SET status='+JSON.stringify(row.status).replaceAll('"',"'")+
      ',revoked_at='+(row.revoked_at?"'"+row.revoked_at+"'::timestamptz":'NULL')+' WHERE id='+uuid(row.id)+';');
  }
});
test('institutional administration cannot grant global profile privileges',async()=>{
  const target=uuid(fixture.actors.doctorB.id);
  const snapshot=()=>dbRow('SELECT id,is_admin,is_reviewer,clinical_access,access_status FROM public.profiles WHERE id='+target);
  const original=snapshot();
  const args={p_profile_id:fixture.actors.doctorB.id,p_is_admin:true,p_is_reviewer:true,
    p_clinical_access:false,p_access_status:'active',p_reason:'Synthetic denied test'};
  denied(await invoke('adminA','admin_set_profile_access',args),'institutional global elevation');
  assert.deepEqual(snapshot(),original);
  const positive=await invoke('global','admin_set_profile_access',{...args,p_is_admin:false,p_is_reviewer:false,p_reason:'Synthetic global admin positive test'});
  assert.ifError(positive.error);
  assert.deepEqual(snapshot(),original,'Global-admin no-op changed synthetic profile unexpectedly');
});
test('dataset rights are separate from clinical reviewer role',async()=>{
  const caseId=uuid(fixture.auditCaseB);
  const get=()=>dbRows('SELECT audit_case_id,approved,deidentification_reviewed,rights_basis_reference,revoked_at FROM public.nexa_core_dataset_approvals WHERE audit_case_id='+caseId);
  const original=get();
  const args={p_audit_case_id:fixture.auditCaseB,p_approved:true,p_deidentified:true,
    p_rights_basis_reference:'SYNTHETIC-ONLY-TEST',p_policy_version:'test-v1'};
  denied(await invoke('reviewerB','review_nexa_core_dataset_rights',args),'clinical reviewer dataset grant');
  denied(await invoke('adminA','review_nexa_core_dataset_rights',args),'institutional admin dataset grant');
  assert.deepEqual(get(),original);
  const authorized=await invoke('global','review_nexa_core_dataset_rights',args);
  assert.ifError(authorized.error);
  assert.equal(get()[0]?.approved,true);
  const revoked=await invoke('global','review_nexa_core_dataset_rights',{...args,p_approved:false});
  assert.ifError(revoked.error);
  assert.equal(get()[0]?.approved,false);
  assert.ok(get()[0]?.revoked_at,'Revocation timestamp missing');
  // Only remove the synthetic fixture approval, never a real case.
  if(original.length===0)updateFixture('DELETE FROM public.nexa_core_dataset_approvals WHERE audit_case_id='+caseId+';');
});
test('authorized same-org revocation is durable, idempotent and audit logged',async()=>{
  const target=members.doctorA,original=membership(target);
  assert.equal(original.status,'active');
  try{
    assert.ifError((await invoke('adminA','revoke_organization_membership',{p_membership_id:target})).error);
    assert.equal(membership(target).status,'revoked');
    assert.ifError((await invoke('adminA','revoke_organization_membership',{p_membership_id:target})).error);
    const audit=dbRows("SELECT id,metadata FROM public.audit_log WHERE user_id="+uuid(fixture.actors.adminA.id)+
      " AND action='update' AND metadata @> '"+JSON.stringify({operation:'organization_membership_revoked',membership_id:target})+"'::jsonb");
    assert.equal(audit.length,1,'Exactly one committed administrative audit entry expected');
  }finally{
    updateFixture('UPDATE public.organization_memberships SET status='+"'"+original.status+"'"+
      ',revoked_at='+(original.revoked_at?"'"+original.revoked_at+"'::timestamptz":'NULL')+' WHERE id='+uuid(target)+';');
  }
});
test('tenant filtered audit queue contains B case, not A case',async()=>{
  const {data,error}=await invoke('reviewerB','get_audit_queue_v2',{limit_count:200,offset_count:0});
  assert.ifError(error);
  assert.ok(Array.isArray(data));
  assert.ok(data.some(row=>row.id===fixture.auditCaseB),'Authorized synthetic case B missing');
  assert.ok(!data.some(row=>row.id===fixture.auditCaseA),'Cross-tenant case A exposed');
});
