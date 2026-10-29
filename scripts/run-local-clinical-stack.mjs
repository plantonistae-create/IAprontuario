/** One command, one disposable native Supabase stack. No hosted connection. */
import {chmodSync,cpSync,existsSync,mkdtempSync,mkdirSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
if(process.cwd()!==root)throw new Error('Run from repository root');
for(const key of ['SUPABASE_ACCESS_TOKEN','NEXA_STAGING_DB_URL','NEXA_STAGING_SERVICE_ROLE_KEY'])
 if(process.env[key])throw new Error('Hosted credential is forbidden in local stack runner');
const id=randomBytes(4).toString('hex');
const workdir=mkdtempSync(`/tmp/nexa-pr92-stack-${id}-`);
// The native Linux Edge process may run under a separate unprivileged user.
// Only source files are world-readable; status and fixture files remain 0600.
chmodSync(workdir,0o755);
const home=process.env.NEXA_LOCAL_STACK_HOME||mkdtempSync(`/tmp/nexa-pr92-home-${id}-`);
if(!home.startsWith('/tmp/'))throw new Error('Native stack home must be under /tmp');
const stack=`nexa-pr92-${id}`;
const runtime=process.env.NEXA_LOCAL_STACK_RUNTIME||
 (process.env.GITHUB_ACTIONS==='true'?'docker':'native');
if(!['native','docker'].includes(runtime))throw new Error('Local stack runtime must be native or docker');
const cliEnv={...process.env,SUPABASE_EXPERIMENTAL_STACK:'1',SUPABASE_HOME:home};
const cli=['--yes','supabase@2.122.0','--workdir',workdir,'--experimental','stack'];
function command(bin,args,env=cliEnv,inherit=false,timeout=600000,diagnostic=false){
 const r=spawnSync(bin,args,{cwd:root,env,encoding:'utf8',stdio:inherit?'inherit':['ignore','pipe','pipe'],
  timeout,maxBuffer:8*1024*1024});
 if(r.error||r.status!==0){
  if(diagnostic){
   const safe=String(r.stderr||'').replace(/postgres(?:ql)?:\/\/\S+/gi,'[redacted-db-url]')
    .replace(/eyJ[A-Za-z0-9._-]{40,}/g,'[redacted-jwt]')
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g,'[redacted-key]')
    .trim().split('\n').slice(-24).join('\n');
   if(safe)console.error('Local schema diagnostic:\n'+safe);
  }
  throw new Error(`Local stack command failed (${r.status??r.error?.code})`);
 }
 return r.stdout||'';
}
function cliCall(args){return command('npx',[...cli,...args]);}
function nativePsql(){
 if(process.env.NEXA_LOCAL_PSQL_BIN)return process.env.NEXA_LOCAL_PSQL_BIN;
 if(runtime==='docker')return 'psql';
 const base=join(home,'cache','stack','slim-services','postgres');
 for(const version of readdirSync(base).reverse())
  for(const platform of readdirSync(join(base,version)))
   for(const digest of readdirSync(join(base,version,platform))){
    const candidate=join(base,version,platform,digest,'bin','psql');
    if(existsSync(candidate))return candidate;
   }
 throw new Error('Native stack PostgreSQL client not found');
}
let started=false,destroyed=false;
try{
 mkdirSync(join(workdir,'supabase'),{recursive:true});
 cpSync(join(root,'supabase','functions'),join(workdir,'supabase','functions'),{recursive:true});
 if(!existsSync(join(workdir,'supabase/functions/core-dataset-export/index.ts')))
  throw new Error('Local Edge entrypoint was not copied');
 writeFileSync(join(workdir,'supabase/config.toml'),
  '[experimental]\nstack = true\n\n[functions.core-dataset-export]\nenabled = true\nverify_jwt = true\nentrypoint = "./functions/core-dataset-export/index.ts"\n');
 cliCall(['start','--stack',stack,'--runtime',runtime,'--preparation','on-demand',
  '--exclude','storage,realtime,studio,analytics,pooler,mail','--eager']);
 started=true;
 const status=JSON.parse(cliCall(['status','--stack',stack,'--env','--output-format','json']));
 const statusFile=join(workdir,'stack-status.json');
 writeFileSync(statusFile,JSON.stringify(status),{mode:0o600});
 const db=new URL(status.DB_URL);
 const pgEnv={...cliEnv,PGHOST:db.hostname,PGPORT:db.port,PGUSER:decodeURIComponent(db.username),
  PGPASSWORD:decodeURIComponent(db.password),PGDATABASE:db.pathname.slice(1),PGSSLMODE:'disable'};
 const psql=nativePsql();
 command(psql,['-X','-v','ON_ERROR_STOP=1','-f',join(root,'tests/security/isolated-clinical-local-schema.sql')],pgEnv,false,600000,true);
 console.log(`Disposable ${runtime} Auth, REST, Edge and SQL contracts ready`);
 command(process.execPath,['--test','tests/security/isolated-clinical-target.test.mjs'],cliEnv,true);
 try{command(process.execPath,['scripts/run-local-clinical-jwt.mjs'],{
  ...cliEnv,NEXA_LOCAL_STATUS_JSON:statusFile,NEXA_LOCAL_PSQL_BIN:psql,
  NEXA_LOCAL_FIXTURE_FILE:`/tmp/nexa-isolated-clinical-${id}.json`},true);}
 catch(error){
  try{
   const raw=cliCall(['logs','--stack',stack,'--service','functions','--tail','40','--output-format','stream-json']);
   for(const row of raw.trim().split('\n').slice(-20)){
    const event=JSON.parse(row),line=String(event.line||'');
    if(/worker boot error|module not found|serving functions|function not found|permission denied/i.test(line))
     console.error('Local Edge diagnostic:',line.slice(0,300));
   }
  }catch{}
  throw error;
 }
 console.log('Local clinical integration and independent cleanup passed');
}finally{
 try{cliCall(['destroy','--stack',stack,'--yes']);destroyed=true;}
 catch{if(started)console.error('Local stack destruction failed; inspect the disposable stack',stack);}
 if(destroyed){
  rmSync(workdir,{recursive:true,force:true});
  if(!process.env.NEXA_LOCAL_STACK_HOME)rmSync(home,{recursive:true,force:true});
 }
}
