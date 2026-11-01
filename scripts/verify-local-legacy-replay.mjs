/** Production-shaped synthetic migration replay in a second disposable local DB. */
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {dirname,join} from 'node:path';
import {isolatedTarget} from './isolated-clinical-target.mjs';

const statusPath=process.env.NEXA_LOCAL_STATUS_JSON;
if(!statusPath?.startsWith('/tmp/nexa-pr92-stack-'))throw new Error('Disposable local stack status required');
for(const key of ['SUPABASE_ACCESS_TOKEN','NEXA_STAGING_DB_URL','NEXA_STAGING_SERVICE_ROLE_KEY'])
 if(process.env[key])throw new Error('Hosted credential forbidden in replay process');
const status=JSON.parse(readFileSync(statusPath,'utf8'));
isolatedTarget({ref:'local-nexa-pr92',ack:'local-nexa-pr92',url:status.API_URL,
 dbURL:status.DB_URL,authURL:status.API_URL+'/auth/v1',restURL:status.REST_URL,
 functionsURL:status.FUNCTIONS_URL,localOnly:true});
const db=new URL(status.DB_URL),psql=process.env.NEXA_LOCAL_PSQL_BIN||'psql';
const name='nexa_replay_'+randomBytes(5).toString('hex');
const restoreName='nexa_restored_'+randomBytes(5).toString('hex');
const dumpTool=psql.includes('/')?join(dirname(psql),'pg_dump'):'pg_dump';
const restoreTool=psql.includes('/')?join(dirname(psql),'pg_restore'):'pg_restore';
if(psql.includes('/')&&(!existsSync(dumpTool)||!existsSync(restoreTool)))
 throw new Error('Version-matched local dump/restore tools required');
const scratch=mkdtempSync('/tmp/nexa-synthetic-recovery-');
const dumpPath=join(scratch,'synthetic-legacy.dump');
const env={...process.env,PGHOST:db.hostname,PGPORT:db.port,
 PGUSER:decodeURIComponent(db.username),PGPASSWORD:decodeURIComponent(db.password),
 PGDATABASE:decodeURIComponent(db.pathname.slice(1)),PGSSLMODE:'disable'};
function run(args,pgEnv=env){
 const r=spawnSync(psql,['-X','-v','ON_ERROR_STOP=1','--quiet',...args],
  {env:pgEnv,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:4*1024*1024});
 if(r.error||r.status!==0){
  const safe=String(r.stderr||'').split('\n').filter(Boolean).slice(-8).join('\n');
  throw new Error('Synthetic legacy replay SQL failed'+(safe?'\n'+safe:''));
 }
 return r.stdout||'';
}
function runPg(bin,args,pgEnv){
 const r=spawnSync(bin,args,{env:pgEnv,encoding:'utf8',stdio:['ignore','pipe','pipe'],
  timeout:120000,maxBuffer:4*1024*1024});
 if(r.error||r.status!==0){
  const safe=String(r.stderr||'').split('\n').filter(Boolean).slice(-8).join('\n');
  throw new Error('Synthetic backup/restore command failed'+(safe?'\n'+safe:''));
 }
}
const tables=['auth.users','public.profiles','public.consultation_history',
 'public.audit_cases','public.nexa_core_cases','public.audit_log','public.organizations',
 'public.organization_memberships','private.nexa_legacy_tenant_mapping',
 'private.nexa_historical_evidence','private.nexa_historical_evidence_decisions',
 'private.nexa_evidence_source_verifications','private.nexa_external_issuer_proof_events',
 'private.nexa_external_issuer_verified_receipts'];
const fingerprintQuery=`SELECT jsonb_build_object(
 ${tables.map(t=>`'${t}',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb) FROM ${t} x)`).join(',\n ')},
 'relations',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity)
  ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('auth','public','private') AND c.relkind IN ('r','p')
   AND c.relname NOT LIKE 'pg_%'),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,x.conname,pg_get_constraintdef(x.oid))
  ORDER BY n.nspname,c.relname,x.conname) FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('auth','public','private')),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid))
  ORDER BY n.nspname,c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('auth','public','private') AND NOT t.tgisinternal),
 'access',jsonb_build_array(
  has_function_privilege('authenticated','public.nexa_ingest_verified_external_receipt(jsonb)','EXECUTE'),
  has_function_privilege('service_role','public.nexa_ingest_verified_external_receipt(jsonb)','EXECUTE'),
  has_table_privilege('authenticated','private.nexa_external_issuer_verified_receipts','SELECT'))
 )::text`;
function fingerprint(pgEnv){
 const raw=run(['--no-align','--tuples-only','--command',fingerprintQuery],pgEnv).trim();
 const parsed=JSON.parse(raw);
 // pg_dump/pg_restore can remove redundant parentheses from this all-AND
 // membership check. Normalize that one known textual rewrite only; exercise
 // the accepted/rejected role behavior independently on both databases.
 parsed.constraints=(parsed.constraints||[]).map(row=>{
  const [schema,table,name,definition]=row;
  if(schema==='public'&&table==='organization_memberships'&&
     name==='organization_memberships_roles_check')
   return [schema,table,name,definition.replace(/[()]/g,'').replace(/\s+/g,' ').trim()];
  return row;
 });
 return {digest:createHash('sha256').update(JSON.stringify(parsed)).digest('hex'),
  counts:Object.fromEntries(tables.map(t=>[t,parsed[t].length])),
  parts:Object.fromEntries(Object.entries(parsed).map(([key,value])=>
   [key,createHash('sha256').update(JSON.stringify(value)).digest('hex')])),
  constraints:Object.fromEntries((parsed.constraints||[]).map(([schema,table,name,definition])=>
   [schema+'.'+table+'.'+name,definition]))};
}
function verifyMembershipRoles(pgEnv){
 const identity="'40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001'";
 run(['--command',`BEGIN; INSERT INTO public.organization_memberships(
  organization_id,user_id,roles,status,activated_at)
  VALUES (${identity},ARRAY['reviewer'],'active','2025-01-01'); ROLLBACK`],pgEnv);
 run(['--command',`DO $role_probe$ DECLARE rejected text; BEGIN
  BEGIN
   INSERT INTO public.organization_memberships(organization_id,user_id,roles,status,activated_at)
   VALUES (${identity},ARRAY['reviewer','untrusted-role'],'active','2025-01-01');
   RAISE EXCEPTION 'invalid membership role accepted';
  EXCEPTION WHEN check_violation THEN
   GET STACKED DIAGNOSTICS rejected=CONSTRAINT_NAME;
   IF rejected<>'organization_memberships_roles_check' THEN RAISE; END IF;
  END;
 END $role_probe$`],pgEnv);
}
let created=false,restored=false;
const started=Date.now();
try{
 run(['--command',`CREATE DATABASE ${name} TEMPLATE template0`]);created=true;
 const replayEnv={...env,PGDATABASE:name};
 for(const file of ['legacy-saas-schema.sql','legacy-saas-homologation.sql',
  'legacy-saas-external-gate.sql','legacy-saas-verified-receipts.sql'])
  run(['--file','tests/security/'+file],replayEnv);
 const result=run(['--file','tests/security/legacy-saas-final-replay.sql'],replayEnv);
 if(!result.includes('PRODUCTION_SHAPED_SYNTHETIC_REPLAY_PASS'))
  throw new Error('Synthetic final replay marker absent');
 const source=fingerprint(replayEnv);
 runPg(dumpTool,['--format=custom','--no-owner','--file',dumpPath],replayEnv);
 run(['--command',`CREATE DATABASE ${restoreName} TEMPLATE template0`]);restored=true;
 const restoredEnv={...env,PGDATABASE:restoreName};
 runPg(restoreTool,['--exit-on-error','--no-owner','--dbname',restoreName,dumpPath],restoredEnv);
 verifyMembershipRoles(replayEnv);
 verifyMembershipRoles(restoredEnv);
 const recovered=fingerprint(restoredEnv);
 if(recovered.digest!==source.digest||JSON.stringify(recovered.counts)!==JSON.stringify(source.counts)){
  const differences=Object.keys(source.parts).filter(key=>source.parts[key]!==recovered.parts[key]);
  const constraintNames=Object.keys({...source.constraints,...recovered.constraints});
  const changed=constraintNames.filter(key=>source.constraints[key]!==recovered.constraints[key]);
  throw new Error('Synthetic restoration differs in: '+differences.join(', ')+
   (changed.length?' (constraint names: '+changed.join(', ')+')':''));
 }
 if(source.counts['auth.users']!==3||source.counts['public.consultation_history']!==3||
    source.counts['public.audit_cases']!==2||source.counts['public.audit_log']!==1)
  throw new Error('Synthetic restoration fixture incomplete');
 console.log(`Production-shaped synthetic replay and isolated PostgreSQL restore passed in ${Date.now()-started} ms; SHA-256 matched`);
}finally{
 if(restored)run(['--command',`DROP DATABASE ${restoreName} WITH (FORCE)`]);
 if(created)run(['--command',`DROP DATABASE ${name} WITH (FORCE)`]);
 rmSync(scratch,{recursive:true,force:true});
}
