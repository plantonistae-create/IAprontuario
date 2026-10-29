/** Run only against a Supabase CLI native/Docker stack whose status JSON was
 * saved to a 0600 file. Schema must already be applied locally. */
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync,execFileSync} from 'node:child_process';
import {isolatedTarget} from './isolated-clinical-target.mjs';

const statusPath=process.env.NEXA_LOCAL_STATUS_JSON;
const psql=process.env.NEXA_LOCAL_PSQL_BIN||'psql';
if(!statusPath?.startsWith('/tmp/'))throw new Error('Local stack status JSON must be under /tmp');
const local=JSON.parse(readFileSync(statusPath,'utf8'));
const ref='local-nexa-pr92',url=local.API_URL,dbURL=local.DB_URL;
isolatedTarget({ref,ack:ref,url,dbURL,authURL:url+'/auth/v1',restURL:local.REST_URL,
 functionsURL:local.FUNCTIONS_URL,localOnly:true});
if(!local.SERVICE_ROLE_KEY||!local.ANON_KEY)throw new Error('Local stack Auth keys missing');
const env={...process.env,NEXA_ISOLATED_REF:ref,NEXA_ISOLATED_ACK:ref,NEXA_LOCAL_ONLY:'1',
 NEXA_ISOLATED_URL:url,NEXA_ISOLATED_AUTH_URL:url+'/auth/v1',
 NEXA_ISOLATED_REST_URL:local.REST_URL,NEXA_ISOLATED_FUNCTIONS_URL:local.FUNCTIONS_URL,
 NEXA_ISOLATED_DB_URL:dbURL,NEXA_ISOLATED_SERVICE_ROLE_KEY:local.SERVICE_ROLE_KEY,
 NEXA_ISOLATED_PUBLISHABLE_KEY:local.ANON_KEY,
 NEXA_ISOLATED_FIXTURE_FILE:process.env.NEXA_LOCAL_FIXTURE_FILE||'/tmp/nexa-isolated-clinical-local-run.json',NEXA_LOCAL_PSQL_BIN:psql};
for(const key of ['NEXA_STAGING_SERVICE_ROLE_KEY','NEXA_STAGING_DB_URL','SUPABASE_ACCESS_TOKEN'])
 if(env[key])throw new Error('Hosted credential present in local runner environment');
const db=new URL(dbURL);
const pgEnv={...env,PGHOST:db.hostname,PGPORT:db.port,PGUSER:db.username,
 PGPASSWORD:decodeURIComponent(db.password),PGDATABASE:db.pathname.slice(1),PGSSLMODE:'disable'};
function run(args){const r=spawnSync(process.execPath,args,{cwd:process.cwd(),env,stdio:'inherit'});
 if(r.status!==0)throw new Error(`Local test command failed: ${args[0]}`);}
let prepared=false,failed=false,cleanupOnly=process.argv[2]==='--cleanup-only';
try{
 if(cleanupOnly){
  run(['scripts/isolated-clinical-fixtures.mjs','cleanup']);
 }else{
 if(existsSync(env.NEXA_ISOLATED_FIXTURE_FILE))
  run(['scripts/isolated-clinical-fixtures.mjs','cleanup']);
 run(['scripts/isolated-clinical-fixtures.mjs','prepare']);prepared=true;
 run(['--test','tests/security/isolated-clinical-jwt.test.mjs']);
 }
}catch(error){failed=true;console.error(error.message);
}finally{
 if(prepared||(!cleanupOnly&&failed)){const r=spawnSync(process.execPath,['scripts/isolated-clinical-fixtures.mjs','cleanup'],
  {cwd:process.cwd(),env,stdio:'inherit'});if(r.status!==0)throw new Error('Synthetic cleanup failed');}
}
const residual=execFileSync(psql,['-X','-v','ON_ERROR_STOP=1','--quiet','--no-align','--tuples-only',
 '--command',"SELECT (SELECT count(*) FROM auth.users)+(SELECT count(*) FROM public.profiles)+"+
  "(SELECT count(*) FROM public.consultation_history)+(SELECT count(*) FROM public.audit_cases)+"+
  "(SELECT count(*) FROM public.nexa_core_cases)+(SELECT count(*) FROM public.audit_log)+"+
  "(SELECT count(*) FROM private.profile_access_events)+"+
  "(SELECT count(*) FROM private.nexa_historical_evidence)+"+
  "(SELECT count(*) FROM private.nexa_historical_evidence_decisions)+"+
  "(SELECT count(*) FROM private.nexa_evidence_source_verifications)+"+
  "(SELECT count(*) FROM private.nexa_external_issuer_proof_events)+"+
  "(SELECT count(*) FROM public.organizations)+(SELECT count(*) FROM public.organization_memberships)+"+
  "(SELECT count(*) FROM private.clinical_slots WHERE profile_id IS NOT NULL)"],
 {env:pgEnv,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
if(residual!=='0')throw new Error(`Independent local cleanup readback found ${residual} residual rows`);
console.log('Independent Auth/clinical fixture cleanup readback: zero residual rows');
if(failed)process.exitCode=1;
