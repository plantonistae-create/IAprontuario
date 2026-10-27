/**
 * Staging-only cleanup of synthetic JWT fixture users and related data.
 * Run even on test failures. No stdout secrets or credentials.
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync,readFileSync,unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ref='phaitiijsjwrggdnoxiz';
const url=process.env.NEXA_STAGING_URL??'';
if(new URL(url).origin!=='https://'+ref+'.supabase.co' ||
   process.env.NEXA_TENANT_STAGING_ACK!==ref)throw new Error('Refusing non-staging cleanup');
const manifestPath=process.env.NEXA_TENANT_FIXTURE_OUTPUT??'';
if(!manifestPath||!existsSync(manifestPath)){
 console.log('No synthetic fixture manifest to clean');
 process.exit(0);
}
const fixture=JSON.parse(readFileSync(manifestPath,'utf8'));
if(fixture.synthetic!==true||!/^[0-9a-f]{10}$/.test(fixture.runId))
 throw new Error('Invalid synthetic fixture marker');
const key=process.env.NEXA_STAGING_SERVICE_ROLE_KEY;
const db=process.env.NEXA_STAGING_DB_URL;
if(!key||!db)throw new Error('Missing staging cleanup credentials');
const dbTarget=new URL(db);
function stagingPgEnv(target){
 const username=decodeURIComponent(target.username);
 const hostname=target.hostname;
 const port=target.port||'5432';
 const database=decodeURIComponent(target.pathname.slice(1));
 if(!username||!hostname||!database||!/^\\d{2,5}$/.test(port))
   throw new Error('Invalid staging PostgreSQL connection parameters');
 return {...process.env,PGHOST:hostname,PGPORT:port,PGUSER:username,
   PGPASSWORD:decodeURIComponent(target.password),PGDATABASE:database,
   PGSSLMODE:'require',PGCONNECT_TIMEOUT:'15'};
}

if(!['postgres:','postgresql:'].includes(dbTarget.protocol) ||
   !(dbTarget.hostname==='db.phaitiijsjwrggdnoxiz.supabase.co' ||
     (dbTarget.hostname.endsWith('.pooler.supabase.com') &&
      decodeURIComponent(dbTarget.username).endsWith('.phaitiijsjwrggdnoxiz')))){
 throw new Error('Refusing PostgreSQL connection not uniquely tied to staging');
}

const uuid=s=>{
 if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s))throw new Error('Unexpected UUID');
 return "'"+s+"'::uuid";
};
const ids=Object.values(fixture.actors??{}).map(x=>x.id);
const orgids=Object.values(fixture.organizations??{});
if(ids.length<1){unlinkSync(manifestPath);console.log('No accounts were created; empty manifest cleaned');process.exit(0);}
const actorIds=ids.map(uuid).join(',');
const orgIds=(orgids.length ? orgids : ['00000000-0000-0000-0000-000000000000']).map(uuid).join(',');
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
for(const actor of Object.values(fixture.actors)){
 const {data,error}=await admin.auth.admin.getUserById(actor.id);
 if(error||!data?.user)throw new Error('Cannot verify fixture ownership');
 if(data.user.user_metadata?.synthetic_fixture!==true ||
    data.user.user_metadata?.run_id!==fixture.runId ||
    !data.user.email?.startsWith('qa-tenant-'+fixture.runId+'-')){
  throw new Error('Refusing to clean a non-synthetic account');
 }
}
{
 const sql="BEGIN;\n"+
 "DO $guard$ BEGIN IF EXISTS (SELECT 1 FROM public.organizations WHERE id IN ("+orgIds+
 ") AND slug NOT LIKE 'qa-tenant-"+fixture.runId+"-%') THEN RAISE EXCEPTION 'NON_SYNTHETIC_ORGANIZATION'; END IF; END $guard$;\n"+
 "DELETE FROM public.nexa_core_dataset_export_events WHERE organization_id IN ("+orgIds+");\n"+
 "DELETE FROM public.organization_usage_events WHERE organization_id IN ("+orgIds+");\n"+
 "DELETE FROM public.audit_cases WHERE organization_id IN ("+orgIds+");\n"+
 "DELETE FROM public.organization_memberships WHERE organization_id IN ("+orgIds+") OR user_id IN ("+actorIds+");\n"+
 "DELETE FROM public.audit_log WHERE user_id IN ("+actorIds+");\n"+
 "DELETE FROM private.profile_access_events WHERE target_profile_id IN ("+actorIds+") OR actor_user_id IN ("+actorIds+");\n"+
 "UPDATE private.clinical_slots SET profile_id=NULL,assigned_by=NULL,assigned_at=NULL WHERE profile_id IN ("+actorIds+") OR assigned_by IN ("+actorIds+");\n"+
 "UPDATE public.profiles SET default_organization_id=NULL,access_assigned_by=NULL WHERE id IN ("+actorIds+");\n"+
 "DELETE FROM public.organizations WHERE id IN ("+orgIds+") OR (created_by IN ("+actorIds+") AND slug LIKE 'personal-%');\n"+
 "DELETE FROM public.profiles WHERE id IN ("+actorIds+");\nCOMMIT;";
 execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','--quiet','--command',sql],
  {env:stagingPgEnv(dbTarget),stdio:['ignore','pipe','pipe']});
}
let failed=false;
for(const userId of ids){
 const {error}=await admin.auth.admin.deleteUser(userId);
 if(error){failed=true;console.error('Synthetic Auth deletion failed (details hidden)');}
}
if(failed)throw new Error('Incomplete synthetic Auth cleanup');
unlinkSync(manifestPath);
console.log('Synthetic tenant fixtures cleaned from staging.');
