/** Disposable, empty Supabase project only. Usage: node this-file prepare|cleanup.
 * Required: NEXA_ISOLATED_REF, _ACK, _URL, _DB_URL, _SERVICE_ROLE_KEY,
 * _FIXTURE_FILE. The file must be under /tmp and is mode 0600.
 */
import {createClient} from '@supabase/supabase-js';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {isolatedTarget} from './isolated-clinical-target.mjs';

const mode=process.argv[2];
if(!['prepare','cleanup'].includes(mode))throw new Error('Expected prepare or cleanup');
const target=isolatedTarget({ref:process.env.NEXA_ISOLATED_REF,url:process.env.NEXA_ISOLATED_URL,
 dbURL:process.env.NEXA_ISOLATED_DB_URL,ack:process.env.NEXA_ISOLATED_ACK,
 authURL:process.env.NEXA_ISOLATED_AUTH_URL,restURL:process.env.NEXA_ISOLATED_REST_URL,
 functionsURL:process.env.NEXA_ISOLATED_FUNCTIONS_URL,localOnly:process.env.NEXA_LOCAL_ONLY==='1'});
if(target.local&&['NEXA_STAGING_SERVICE_ROLE_KEY','NEXA_STAGING_DB_URL','SUPABASE_ACCESS_TOKEN'].some(x=>process.env[x]))
 throw new Error('Hosted credentials are forbidden in local test process');
const file=process.env.NEXA_ISOLATED_FIXTURE_FILE||'';
if(!/^\/tmp\/nexa-isolated-clinical-[a-z0-9-]+\.json$/.test(file))throw new Error('Fixture file must be a dedicated /tmp path');
const key=process.env.NEXA_ISOLATED_SERVICE_ROLE_KEY||'';
if(!key)throw new Error('Missing isolated service role key');
const admin=createClient(target.api,key,{auth:{persistSession:false,autoRefreshToken:false}});
const db=new URL(target.dbURL);
const pgEnv={...process.env,PGHOST:db.hostname,PGPORT:db.port||'5432',
 PGUSER:decodeURIComponent(db.username),PGPASSWORD:decodeURIComponent(db.password),
 PGDATABASE:decodeURIComponent(db.pathname.slice(1)),PGSSLMODE:target.local?'disable':'require',PGCONNECT_TIMEOUT:'15'};
function sql(statement){try{return execFileSync(process.env.NEXA_LOCAL_PSQL_BIN||'psql',['-X','-v','ON_ERROR_STOP=1','--quiet','--no-align','--tuples-only','--command',statement],
 {env:pgEnv,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
 catch{throw new Error('Isolated SQL operation failed');}}
const uuid=x=>{if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(x))throw new Error('Invalid fixture UUID');return `'${x}'::uuid`};
const quote=x=>`'${String(x).replaceAll("'","''")}'`;
const save=x=>writeFileSync(file,JSON.stringify(x),{mode:0o600});
function owned(manifest){
 if(manifest?.synthetic!==true||manifest?.projectRef!==target.ref||!/^[0-9a-f]{12}$/.test(manifest.runId))
   throw new Error('Fixture belongs to another project or run');
 for(const [name,actor] of Object.entries(manifest.actors||{})){
  uuid(actor.id);
  if(actor.email!==`qa-clinical-${manifest.runId}-${name}@example.invalid`)throw new Error('Non-synthetic account in fixture');
 }
 for(const id of Object.values(manifest.organizations||{}))uuid(id);
}
if(mode==='prepare'){
 if(existsSync(file))throw new Error('Fixture file exists; clean it before another run');
 // No real account, case, or occupied slot may be present in the target.
 const ready=sql(`SELECT (SELECT count(*)=0 FROM auth.users) AND
  (SELECT count(*)=0 FROM public.profiles) AND
  (SELECT count(*)=0 FROM public.organizations) AND
  (SELECT count(*)=0 FROM public.organization_memberships) AND
  (SELECT count(*)=0 FROM public.consultation_history) AND
  (SELECT count(*)=0 FROM public.audit_cases) AND
  (SELECT count(*)=0 FROM public.nexa_core_cases) AND
  (SELECT count(*)=0 FROM public.professionals) AND
  (SELECT count(*)=0 FROM public.audit_log) AND
  (SELECT count(*)=0 FROM private.profile_access_events) AND
  (SELECT count(*)=0 FROM private.nexa_historical_evidence) AND
  (SELECT count(*)=0 FROM private.nexa_historical_evidence_decisions) AND
  (SELECT count(*)=0 FROM private.nexa_evidence_source_verifications) AND
  (SELECT count(*)=0 FROM private.nexa_external_issuer_proof_events) AND
  (SELECT count(*)=0 FROM private.clinical_slots WHERE profile_id IS NOT NULL) AND
  to_regclass('public.organizations') IS NOT NULL AND
  to_regclass('public.organization_memberships') IS NOT NULL AND
  to_regprocedure('public.has_active_clinical_access()') IS NOT NULL`);
 if(ready!=='t')throw new Error('Isolated project is not empty or lacks required schema');
 const runId=randomBytes(6).toString('hex');
 const manifest={synthetic:true,projectRef:target.ref,runId,actors:{},organizations:{},seeded:false};
 writeFileSync(file,JSON.stringify(manifest),{mode:0o600,flag:'wx'});
 try{
  for(const name of ['doctorA','doctorB','doctorNoAccess','adminA','reviewerB','revokedUser','noOrg']){
   const email=`qa-clinical-${runId}-${name}@example.invalid`;
   const password=randomBytes(30).toString('base64url');
   const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,
    user_metadata:{synthetic_fixture:true,run_id:runId,project_ref:target.ref}});
   if(error||!data?.user?.id)throw new Error('Synthetic Auth creation failed');
   manifest.actors[name]={id:data.user.id,email,password};save(manifest);
  }
  manifest.organizations={A:randomUUID(),B:randomUUID()};save(manifest);
  const a=manifest.actors.doctorA.id,b=manifest.actors.doctorB.id,r=manifest.actors.reviewerB.id;
  const noAccess=manifest.actors.doctorNoAccess.id,adminId=manifest.actors.adminA.id;
  const revoked=manifest.actors.revokedUser.id;
  const oa=manifest.organizations.A,ob=manifest.organizations.B;
  manifest.auditCases={A:randomUUID(),B:randomUUID()};save(manifest);
  sql(`BEGIN;
   DO $guard$ BEGIN IF (SELECT count(*) FROM auth.users)<>7 OR
     (SELECT count(*) FROM public.consultation_history)<>0 OR
     (SELECT count(*) FROM private.clinical_slots WHERE profile_id IS NOT NULL)<>0
     THEN RAISE EXCEPTION 'TARGET_NOT_DISPOSABLE'; END IF; END $guard$;
   INSERT INTO public.organizations(id,slug,display_name,status) VALUES
     (${uuid(oa)},${quote(`qa-clinical-${runId}-a`)},'Synthetic A','active'),
     (${uuid(ob)},${quote(`qa-clinical-${runId}-b`)},'Synthetic B','active');
   UPDATE public.profiles SET access_status='active',clinical_access=true,
     default_organization_id=CASE WHEN id=${uuid(a)} THEN ${uuid(oa)} ELSE ${uuid(ob)} END
     WHERE id IN (${uuid(a)},${uuid(b)});
   UPDATE public.profiles SET access_status='active',is_reviewer=true,clinical_access=false,
     default_organization_id=${uuid(ob)} WHERE id=${uuid(r)};
   UPDATE public.profiles SET access_status='active',clinical_access=false,
     default_organization_id=${uuid(oa)} WHERE id=${uuid(noAccess)};
   UPDATE public.profiles SET access_status='active',is_admin=true,clinical_access=false,
     default_organization_id=${uuid(oa)} WHERE id=${uuid(adminId)};
   UPDATE public.profiles SET access_status='revoked',clinical_access=false,
     default_organization_id=${uuid(ob)} WHERE id=${uuid(revoked)};
   UPDATE public.profiles SET access_status='active',clinical_access=false,
     default_organization_id=NULL WHERE id=${uuid(manifest.actors.noOrg.id)};
   INSERT INTO public.organization_memberships(id,organization_id,user_id,roles,status,activated_at)
     VALUES (${uuid(randomUUID())},${uuid(oa)},${uuid(a)},ARRAY['clinician'],'active',now()),
            (${uuid(randomUUID())},${uuid(ob)},${uuid(b)},ARRAY['clinician'],'active',now()),
            (${uuid(randomUUID())},${uuid(ob)},${uuid(r)},ARRAY['reviewer'],'active',now()),
            (${uuid(randomUUID())},${uuid(oa)},${uuid(noAccess)},ARRAY['clinician'],'active',now()),
            (${uuid(randomUUID())},${uuid(oa)},${uuid(adminId)},ARRAY['owner'],'active',now())
     ON CONFLICT (organization_id,user_id) DO UPDATE SET
       roles=EXCLUDED.roles,status='active',activated_at=now(),revoked_at=NULL;
   INSERT INTO public.organization_memberships(id,organization_id,user_id,roles,status,revoked_at)
     VALUES (${uuid(randomUUID())},${uuid(ob)},${uuid(revoked)},ARRAY['clinician'],'revoked',now());
   INSERT INTO public.audit_cases(id,source_consultation_id,submitted_by,deidentified_fields,status,organization_id)
     VALUES (${uuid(manifest.auditCases.A)},${uuid(randomUUID())},${uuid(a)},'{}'::jsonb,'approved',${uuid(oa)}),
            (${uuid(manifest.auditCases.B)},${uuid(randomUUID())},${uuid(b)},'{}'::jsonb,'approved',${uuid(ob)});
   DO $guard$ BEGIN IF (SELECT count(*) FROM private.clinical_slots WHERE profile_id IN (${uuid(a)},${uuid(b)}))<>2
     THEN RAISE EXCEPTION 'SYNTHETIC_CLINICAL_SLOTS_NOT_ASSIGNED'; END IF; END $guard$;
   COMMIT;`);
  manifest.seeded=true;save(manifest);
  console.log('Isolated synthetic fixture prepared; credentials remain in 0600 manifest');
 }catch{console.error('Fixture preparation failed; run cleanup with the same target and manifest');throw new Error('Isolated fixture preparation failed');}
}else if(!existsSync(file)){
 console.log('No fixture manifest; cleanup is already complete');
}else{
 const manifest=JSON.parse(readFileSync(file,'utf8'));owned(manifest);
  const actors=Object.values(manifest.actors);
  const existing=[];
 for(const actor of actors){
  const {data,error}=await admin.auth.admin.getUserById(actor.id);
  if(error?.status===404)continue;
  if(error||!data?.user||data.user.user_metadata?.synthetic_fixture!==true||
    data.user.user_metadata?.run_id!==manifest.runId||data.user.user_metadata?.project_ref!==target.ref||
    data.user.email?.toLowerCase()!==actor.email.toLowerCase())throw new Error('Refusing to delete account without matching Auth ownership');
  existing.push(actor);
 }
 const ids=actors.map(x=>uuid(x.id));
  const orgIds=Object.values(manifest.organizations).map(uuid);
  for(const id of Object.values(manifest.auditCases||{}))uuid(id);
 // Cleanup is scoped to identifiers recorded before creation and verified above.
 if(ids.length){
  const aid=ids.join(','),oid=(orgIds.length?orgIds:[uuid('00000000-0000-0000-0000-000000000000')]).join(',');
  sql(`BEGIN;
   DO $guard$ BEGIN IF EXISTS(SELECT 1 FROM public.organizations WHERE id IN (${oid})
       AND slug NOT LIKE ${quote(`qa-clinical-${manifest.runId}-%`)})
       THEN RAISE EXCEPTION 'NON_SYNTHETIC_ORGANIZATION'; END IF; END $guard$;
   DELETE FROM public.audit_cases WHERE id IN (${Object.values(manifest.auditCases||{}).length?Object.values(manifest.auditCases).map(uuid).join(','):uuid('00000000-0000-0000-0000-000000000000')});
   DELETE FROM public.consultation_history WHERE user_id IN (${aid});
   DELETE FROM public.audit_log WHERE user_id IN (${aid});
   DELETE FROM public.organization_memberships WHERE user_id IN (${aid}) OR organization_id IN (${oid});
   DELETE FROM private.profile_access_events WHERE target_profile_id IN (${aid}) OR actor_user_id IN (${aid});
   UPDATE private.clinical_slots SET profile_id=NULL,assigned_at=NULL,assigned_by=NULL WHERE profile_id IN (${aid});
   UPDATE public.profiles SET clinical_access=false,default_organization_id=NULL WHERE id IN (${aid});
   DELETE FROM private.profile_access_events WHERE target_profile_id IN (${aid}) OR actor_user_id IN (${aid});
   DELETE FROM public.organizations WHERE id IN (${oid}) OR (created_by IN (${aid}) AND slug LIKE 'personal-%');
   DELETE FROM public.profiles WHERE id IN (${aid});
   COMMIT;`);
  for(const actor of existing){const {error}=await admin.auth.admin.deleteUser(actor.id);
   if(error)throw new Error('Synthetic Auth cleanup incomplete');}
 }
 unlinkSync(file);
 console.log('Isolated synthetic fixture cleanup complete');
}
