/**
 * Real-JWT integration tests; never run on production.
 * Required env: NEXA_STAGING_URL, NEXA_STAGING_PUBLISHABLE_KEY,
 * NEXA_STAGING_SERVICE_ROLE_KEY, NEXA_TENANT_FIXTURES_JSON.
 * Fixtures must be exclusively synthetic and created using Supabase Auth Admin.
 * No credentials or patient data are logged.
 */
import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { createClient } from '@supabase/supabase-js';

const url=process.env.NEXA_STAGING_URL ?? '';
const pub=process.env.NEXA_STAGING_PUBLISHABLE_KEY ?? '';
const svc=process.env.NEXA_STAGING_SERVICE_ROLE_KEY ?? '';
const project='phaitiijsjwrggdnoxiz';
if(!url.includes(project+'.supabase.co')) throw new Error('Refusing non-staging project');
if(!pub||!svc||!process.env.NEXA_TENANT_FIXTURES_JSON) throw new Error('Missing required staging-only credentials/fixture manifest');
const fixture=JSON.parse(process.env.NEXA_TENANT_FIXTURES_JSON);
const client=(key)=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const service=client(svc);
const actors={};
const required=['global','adminA','doctorA','reviewerB','unaffiliated','ownerC1','ownerC2'];
const ids=fixture.memberships??{};
const db=async(table,columns='*')=>{
  const {data,error}=await service.from(table).select(columns);
  if(error)throw new Error('Admin fixture verification failed: '+error.message);
  return data;
};
async function login(name){
  const actor=fixture.actors?.[name];
  assert.ok(actor?.email&&actor?.password,'Missing fixture account '+name);
  const c=client(pub);
  const {data,error}=await c.auth.signInWithPassword({email:actor.email,password:actor.password});
  if(error||!data?.session?.access_token)throw new Error('Synthetic login failed for '+name);
  assert.equal(data.user.id,actor.id,'Fixture JWT identity mismatch');
  actors[name]=c;
}
async function membership(id){
  const {data,error}=await service.from('organization_memberships')
    .select('id,organization_id,user_id,status,revoked_at,roles').eq('id',id).single();
  if(error)throw new Error('Cannot inspect synthetic membership: '+error.message);
  return data;
}
async function invoke(actor,rpc,args){
  const {data,error}=await actors[actor].rpc(rpc,args);
  return {data,error};
}
function denied(result,label){
  assert.ok(result.error,label+' must be denied');
  assert.equal(result.error.code,'42501',label+' must return privilege error');
}
async function denyAndUnchanged(actor,target,label){
  const previous=await membership(target);
  denied(await invoke(actor,'revoke_organization_membership',{p_membership_id:target}),label);
  assert.deepEqual(await membership(target),previous,label+' modified a denied target');
}
before(async()=>{
  assert.ok(fixture.organizations?.A&&fixture.organizations?.B,'Two synthetic organizations required');
  const orgs=await db('organizations','id,slug,status');
  for(const key of ['A','B']){
    const org=orgs.find(row=>row.id===fixture.organizations[key]);
    assert.ok(org?.slug?.startsWith('qa-tenant-')&&org.status==='active','Refusing non-synthetic organization '+key);
  }
  for(const key of ['adminA','doctorA','ownerA','ownerC1','ownerC2','doctorB']){
    assert.ok(ids[key],'Missing synthetic membership '+key);
  }
  assert.ok(ids.doctorA!==ids.doctorB,'Fixtures not isolated');
  await Promise.all(required.map(login));
});
test('cross-tenant admin, physician, reviewer and unaffiliated calls are denied',async()=>{
  await denyAndUnchanged('adminA',ids.doctorB,'admin A -> B');
  await denyAndUnchanged('doctorA',ids.doctorB,'doctor A -> B');
  await denyAndUnchanged('doctorA',ids.doctorA,'doctor A -> own org');
  await denyAndUnchanged('reviewerB',ids.doctorA,'reviewer B -> A');
  await denyAndUnchanged('unaffiliated',ids.doctorA,'unaffiliated -> A');
});
test('self revocation and last-owner revocation fail without changing records',async()=>{
  await denyAndUnchanged('adminA',ids.adminA,'admin A self');
  await denyAndUnchanged('adminA',ids.ownerA,'only-owner target');
});
test('concurrent revocations preserve at least one active owner',async()=>{
  const targets=[ids.ownerC1,ids.ownerC2];
  const beforeRows=await Promise.all(targets.map(membership));
  assert.ok(beforeRows.every(x=>x.status==='active'));
  let results;
  try{
    results=await Promise.all([
      invoke('ownerC1','revoke_organization_membership',{p_membership_id:ids.ownerC2}),
      invoke('ownerC2','revoke_organization_membership',{p_membership_id:ids.ownerC1})
    ]);
    const success=results.filter(x=>!x.error).length;
    assert.equal(success,1,'Expected exactly one winner of concurrent owner revocation');
    for(const result of results.filter(x=>x.error)) assert.equal(result.error.code,'42501');
    const remaining=await Promise.all(targets.map(membership));
    assert.ok(remaining.some(x=>x.status==='active'),'Both owners were revoked');
  } finally {
    for(const previous of beforeRows) {
      const state=await membership(previous.id);
      if(state.status!==previous.status) {
        const restored=await service.from('organization_memberships')
          .update({status:previous.status,revoked_at:previous.revoked_at})
          .eq('id',previous.id);
        assert.ifError(restored.error);
      }
    }
  }
});
test('institutional actors cannot elevate global privileges',async()=>{
  const original=await service.from('profiles').select('id,is_admin,is_reviewer,clinical_access,access_status').eq('id',fixture.actors.doctorB.id).single();
  assert.ifError(original.error);
  const change={p_profile_id:fixture.actors.doctorB.id,p_is_admin:true,p_is_reviewer:false,p_clinical_access:true,p_access_status:'active',p_reason:'synthetic denied permission test'};
  denied(await invoke('adminA','admin_set_profile_access',change),'institutional admin global role');
  const current=await service.from('profiles').select('id,is_admin,is_reviewer,clinical_access,access_status').eq('id',fixture.actors.doctorB.id).single();
  assert.ifError(current.error);
  assert.deepEqual(current.data,original.data);
});
test('dataset approval requires explicit governance rights, not clinical reviewer role',async()=>{
  if(!fixture.auditCaseB) throw new Error('Synthetic auditCaseB fixture missing; dataset test must not be skipped');
  const previous=await service.from('nexa_core_dataset_approvals').select('*').eq('audit_case_id',fixture.auditCaseB);
  assert.ifError(previous.error);
  const args={p_audit_case_id:fixture.auditCaseB,p_approved:true,p_deidentified:true,p_rights_basis_reference:'SYNTHETIC-TEST-ONLY',p_policy_version:'qa-v1'};
  denied(await invoke('reviewerB','review_nexa_core_dataset_rights',args),'reviewer B dataset rights');
  const current=await service.from('nexa_core_dataset_approvals').select('*').eq('audit_case_id',fixture.auditCaseB);
  assert.ifError(current.error);
  assert.deepEqual(current.data,previous.data);
});
test('authorized scoped revocation is persisted with audit entry, repeated call is idempotent',async()=>{
  const id=ids.doctorA,prior=await membership(id);
  assert.equal(prior.status,'active','Fixture must start active');
  let changed=false;
  try{
    const result=await invoke('adminA','revoke_organization_membership',{p_membership_id:id});
    assert.ifError(result.error);
    changed=true;
    assert.equal((await membership(id)).status,'revoked');
    const repeat=await invoke('adminA','revoke_organization_membership',{p_membership_id:id});
    assert.ifError(repeat.error);
    const events=await service.from('audit_log').select('id,metadata')
      .eq('user_id',fixture.actors.adminA.id).eq('action','update')
      .contains('metadata',{operation:'organization_membership_revoked',membership_id:id});
    assert.ifError(events.error);
    assert.equal(events.data.length,1,'Expected exactly one committed audit event');
  }finally{
    if(changed){
      const restore=await service.from('organization_memberships').update({status:prior.status,revoked_at:prior.revoked_at}).eq('id',id);
      assert.ifError(restore.error);
    }
  }
});
test('audit queue for authorized reviewer excludes other organization',async()=>{
  const {data,error}=await invoke('reviewerB','get_audit_queue_v2',{limit_count:200,offset_count:0});
  assert.ifError(error);
  assert.ok(Array.isArray(data));
  // Synthetic org-A audit IDs must not appear even when the client supplies no org filter.
  for(const row of data)assert.ok(!fixture.auditCaseA||row.id!==fixture.auditCaseA,'Cross-tenant audit row exposed');
});
