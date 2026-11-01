/**
 * One-off recovery of an explicitly identified orphan SYNTHETIC staging fixture run.
 * It refuses non-staging targets and any clinical or cross-user dependencies.
 * Never prints user passwords, keys, emails or connection strings.
 * Requires NEXA_TENANT_ORPHAN_RUN_ID (ten lowercase hex characters).
 */
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';

const ref='phaitiijsjwrggdnoxiz';
const runId=process.env.NEXA_TENANT_ORPHAN_RUN_ID??'';
const url=process.env.NEXA_STAGING_URL??'';
const key=process.env.NEXA_STAGING_SERVICE_ROLE_KEY??'';
const db=process.env.NEXA_STAGING_DB_URL??'';
if(!/^[0-9a-f]{10}$/.test(runId)) throw Error('Explicit synthetic run id required');
if(new URL(url).origin!=='https://'+ref+'.supabase.co' ||
   process.env.NEXA_TENANT_STAGING_ACK!==ref) throw Error('Staging only');
if(!key||!db)throw Error('Missing staging-only credentials');
const target=new URL(db);
const user=decodeURIComponent(target.username);
if(!['postgres:','postgresql:'].includes(target.protocol) ||
   !(target.hostname==='db.'+ref+'.supabase.co' ||
    (target.hostname.endsWith('.pooler.supabase.com') && user==='postgres.'+ref))) {
 throw Error('PostgreSQL connection not tied to verified staging');
}
const env={...process.env,PGHOST:target.hostname,PGPORT:target.port||'5432',
 PGUSER:user,PGPASSWORD:decodeURIComponent(target.password),
 PGDATABASE:decodeURIComponent(target.pathname.slice(1)),PGSSLMODE:'require',PGCONNECT_TIMEOUT:'15'};
function query(sql){
 return execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','--no-align','--tuples-only','--quiet','--command',sql],
  {env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
}
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const prefix='qa-tenant-'+runId+'-';
const actors={};
const seen=new Set();
for(let page=1;page<=200;page++){
 const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});
 if(error)throw Error('Cannot enumerate synthetic staging accounts safely');
 const users=data?.users??[];
 for(const u of users){
  if(!u.email?.startsWith(prefix))continue;
  const safeEmail=new RegExp('^qa-tenant-'+runId+'-[a-z0-9]+@example\\.invalid$');
  if(!safeEmail.test(u.email) || u.user_metadata?.synthetic_fixture!==true ||
     u.user_metadata?.run_id!==runId)throw Error('Ambiguous fixture ownership; abort recovery');
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(u.id))
   throw Error('Invalid Auth fixture identifier');
  const name=u.email.slice(prefix.length).split('@')[0];
  if(seen.has(u.id)||actors[name])throw Error('Duplicate fixture identity');
  actors[name]={id:u.id};
  seen.add(u.id);
 }
 if(users.length<1000)break;
 if(page===200)throw Error('Unexpected Auth user pagination limit');
}
const ids=Object.values(actors).map(x=>"'"+x.id+"'::uuid");
if(!ids.length){console.log('No synthetic accounts for exact requested run');process.exit(0);}
if(ids.length>10)throw Error('Unexpected fixture population; manual audit required');
const set=ids.join(',');
const guards=`
WITH ids AS (SELECT unnest(ARRAY[${set}]::uuid[]) AS id),
personal AS (
 SELECT o.id FROM public.organizations o JOIN ids ON ids.id=o.created_by
 WHERE o.slug LIKE 'personal-%'
),
checks AS (
 SELECT
 (SELECT count(*) FROM auth.users u JOIN ids ON ids.id=u.id
  WHERE u.raw_user_meta_data->>'synthetic_fixture'='true'
    AND u.raw_user_meta_data->>'run_id'='${runId}') AS verified,
 (SELECT count(*) FROM public.consultation_history h
  WHERE h.user_id IN (SELECT id FROM ids)
     OR h.organization_id IN (SELECT id FROM personal)) AS clinical,
 (SELECT count(*) FROM public.audit_cases a
  WHERE a.submitted_by IN (SELECT id FROM ids)
     OR a.organization_id IN (SELECT id FROM personal)) AS audit_cases,
 (SELECT count(*) FROM public.nexa_core_cases c
  WHERE c.organization_id IN (SELECT id FROM personal)) AS core_cases,
 (SELECT count(*) FROM private.clinical_slots s
  WHERE s.profile_id IN (SELECT id FROM ids)) AS slots,
 (SELECT count(*) FROM public.organization_memberships m
  WHERE m.organization_id IN (SELECT id FROM personal)
    AND m.user_id NOT IN (SELECT id FROM ids)) AS foreign_members
)
SELECT (verified=${ids.length} AND clinical=0 AND audit_cases=0
 AND core_cases=0 AND slots=0 AND foreign_members=0)::text FROM checks`;
if(query(guards)!=='true')throw Error('Fixture run has unexpected clinical or cross-account dependencies; refusal to clean');
const original=process.env.NEXA_TENANT_FIXTURE_OUTPUT??'/tmp/nexa-tenant-fixtures.json';
const orphan='/tmp/nexa-orphan-'+runId+'.json';
if(orphan===original||existsSync(orphan))throw Error('Unsafe recovery manifest path');
writeFileSync(orphan,JSON.stringify({runId,actors,organizations:{},memberships:{},synthetic:true,seeded:false}),{mode:0o600,flag:'wx'});
try {
 execFileSync(process.execPath,['scripts/cleanup-staging-tenant-fixtures.mjs'],{
  env:{...process.env,NEXA_TENANT_FIXTURE_OUTPUT:orphan},
  stdio:['ignore','pipe','pipe']});
 console.log('Verified orphan synthetic run cleaned, account count: '+ids.length);
} catch {
 throw Error('Synthetic recovery was incomplete; preserve manifest for controlled retry');
} finally {
 // cleanup-staging-tenant-fixtures.mjs deletes the manifest only on success
 if(existsSync(orphan))console.error('Recovery manifest remains in runner temp for protected troubleshooting');
}
