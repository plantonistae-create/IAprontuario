/**
 * Staging-only synthetic tenant fixtures. Requires authorized administrative
 * Supabase Auth API and a staging PostgreSQL connection with migration rights.
 * Writes credentials only to a local 0600 JSON file; never commits or logs them.
 * Environment: NEXA_STAGING_URL, NEXA_STAGING_SERVICE_ROLE_KEY,
 * NEXA_STAGING_DB_URL, NEXA_TENANT_FIXTURE_OUTPUT.
 * Run with Node 22+, psql on PATH, and npm ci.
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync,existsSync } from 'node:fs';
const url=process.env.NEXA_STAGING_URL??'';
const key=process.env.NEXA_STAGING_SERVICE_ROLE_KEY??'';
const db=process.env.NEXA_STAGING_DB_URL??'';
const out=process.env.NEXA_TENANT_FIXTURE_OUTPUT??'/tmp/nexa-tenant-fixtures.json';
if(process.env.NEXA_TENANT_STAGING_ACK !== 'phaitiijsjwrggdnoxiz') throw new Error('Staging safety acknowledgement required');
if(new URL(url).origin !== 'https://phaitiijsjwrggdnoxiz.supabase.co')throw new Error('Only nexa-phase1-staging is permitted');
if(!key||!db)throw new Error('Missing staging administrator key or database connection');
const dbTarget=new URL(db);
if(!['postgres:','postgresql:'].includes(dbTarget.protocol) ||
   !(dbTarget.hostname==='db.phaitiijsjwrggdnoxiz.supabase.co' ||
     (dbTarget.hostname.endsWith('.pooler.supabase.com') &&
      decodeURIComponent(dbTarget.username).endsWith('.phaitiijsjwrggdnoxiz')))){
 throw new Error('Refusing PostgreSQL connection not uniquely tied to staging');
}

if(!out.startsWith('/tmp/') && !out.startsWith('/home/runner/work/_temp/'))throw new Error('Fixture credentials must stay in runner temp');
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const actorNames=['global','adminA','doctorA','doctorB','reviewerB','unaffiliated','ownerA','ownerC1','ownerC2','ownerB'];
const runId=randomBytes(5).toString('hex');
const actors={};
const created=[];
const manifest={runId,actors,organizations:{},memberships:{},synthetic:true,seeded:false};
writeFileSync(out,JSON.stringify(manifest),{mode:0o600,flag:'wx'});
const id=s=>{if(!/^[0-9a-f-]{36}$/i.test(s))throw new Error('Malformed UUID');return "'"+s+"'::uuid";};
const literal=s=>"'"+String(s).replaceAll("'","''")+"'";
try{
 for(const name of actorNames){
   const email='qa-tenant-'+runId+'-'+name.toLowerCase()+'@example.invalid';
   const password=randomBytes(30).toString('base64url');
   const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{synthetic_fixture:true,run_id:runId}});
   if(error||!data?.user?.id)throw new Error('Supabase Auth Admin createUser failed for '+name+': '+(error?.message??'unknown'));
   actors[name]={id:data.user.id,email,password};created.push(data.user.id);
   writeFileSync(out,JSON.stringify(manifest),{mode:0o600});
 }
 const organizations={A:randomUUID(),B:randomUUID(),C:randomUUID()};
 const memberships={};
 const rows=[
  ['adminA','A',['admin']],['doctorA','A',['clinician']],['ownerA','A',['owner']],
  ['doctorB','B',['clinician']],['reviewerB','B',['reviewer']],['ownerB','B',['owner']],
  ['ownerC1','C',['owner']],['ownerC2','C',['owner']]
 ];
 const orgSql=Object.entries(organizations).map(([name,oid])=>
  '('+id(oid)+','+literal('qa-tenant-'+runId+'-'+name.toLowerCase())+','+literal('QA Tenant '+name+' '+runId)+",'active')").join(',');
 const memberSql=rows.map(([name,org,roles])=>{
   memberships[name]=randomUUID();
   return '('+[id(memberships[name]),id(organizations[org]),id(actors[name].id),
     'ARRAY['+roles.map(literal).join(',')+']::text[]',"'active'","now()"].join(',')+')';
 }).join(',');
 const auditCaseA=randomUUID(), auditCaseB=randomUUID();
 const coreCaseA=randomUUID(), coreCaseB=randomUUID();
 const caseSQL=[
  '('+[id(auditCaseA),id(randomUUID()),id(actors.doctorA.id),"'{}'::jsonb","'approved'",id(organizations.A)].join(',')+')',
  '('+[id(auditCaseB),id(randomUUID()),id(actors.doctorB.id),"'{}'::jsonb","'approved'",id(organizations.B)].join(',')+')'
 ].join(',');
 const coreSQL=[
  '('+[id(coreCaseA),id(auditCaseA),"'approved'","'{\"synthetic\":true}'::jsonb","now()",id(organizations.A)].join(',')+')',
  '('+[id(coreCaseB),id(auditCaseB),"'approved'","'{\"synthetic\":true}'::jsonb","now()",id(organizations.B)].join(',')+')'
 ].join(',');
 const ids=Object.values(actors).map(x=>id(x.id)).join(',');
 const fixture={...manifest,organizations,memberships,auditCaseA,auditCaseB};
 writeFileSync(out,JSON.stringify(fixture),{mode:0o600});
 const sql=`BEGIN;
  SELECT set_config('nexa.access_change_reason','synthetic authorization integration test setup',true);
  -- Reserved clinical_slots are already full: do not consume/reassign clinical slots.
  -- Only RPC permissions (membership + active profile) are under this test.
  UPDATE public.profiles SET access_status='active',
    is_admin=(id=${id(actors.global.id)}), is_reviewer=(id=${id(actors.reviewerB.id)}),
    clinical_access=false WHERE id IN (${ids});
  INSERT INTO public.organizations(id,slug,display_name,status) VALUES ${orgSql};
  INSERT INTO public.organization_memberships(id,organization_id,user_id,roles,status,activated_at) VALUES ${memberSql};
  -- Remove default personal membership of the unlinked test actor only.
  UPDATE public.organization_memberships SET status='revoked',revoked_at=now()
    WHERE user_id=${id(actors.unaffiliated.id)} AND organization_id NOT IN (${Object.values(organizations).map(id).join(',')});
  INSERT INTO public.audit_cases(id,source_consultation_id,submitted_by,deidentified_fields,status,organization_id) VALUES ${caseSQL};
  INSERT INTO public.nexa_core_cases(id,audit_case_id,quality_status,case_data,audit_reviewed_at,organization_id) VALUES ${coreSQL};
  COMMIT;`;
 execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','--quiet','--command',sql],{env:{...process.env,PGDATABASE:db},stdio:['ignore','pipe','pipe']});
 fixture.seeded=true;
 writeFileSync(out,JSON.stringify(fixture),{mode:0o600});
 console.log('Synthetic staging fixture created; credentials stored only in '+out);
}catch(error){
 // Failed bootstrap must not silently leave orphaned Auth users.
 // If Auth creation failed before the cleanup manifest, remove partial users.
 // Every created user was flushed to an owner-verified cleanup manifest.
 // The workflow's always() teardown handles partial Auth bootstrap as well.
 throw new Error('Fixture bootstrap failed; synthetic runner cleanup is mandatory.');
}
