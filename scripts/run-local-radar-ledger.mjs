/** Disposable PostgreSQL rehearsal for the candidate Radar event ledger. */
import {randomBytes} from 'node:crypto';
import {existsSync,mkdtempSync,mkdirSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
if(process.cwd()!==root)throw new Error('Run from repository root');
for(const key of ['SUPABASE_ACCESS_TOKEN','NEXA_STAGING_DB_URL','NEXA_STAGING_SERVICE_ROLE_KEY'])
  if(process.env[key])throw new Error('Hosted credentials forbidden in local Radar rehearsal');
const id=randomBytes(4).toString('hex'),stack=`nexa-radar-ledger-${id}`;
const workdir=mkdtempSync(`/tmp/${stack}-`),home=mkdtempSync(`/tmp/${stack}-home-`);
const cliBinary=process.env.NEXA_SUPABASE_CLI||'npx';
const cliBase=process.env.NEXA_SUPABASE_CLI?[]:['--yes','supabase@2.122.0'];
const cliEnv={...process.env,SUPABASE_EXPERIMENTAL_STACK:'1',SUPABASE_HOME:home};
function call(bin,args,env=cliEnv){
  const r=spawnSync(bin,args,{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:600000,maxBuffer:4*1024*1024});
  if(r.error||r.status!==0){
    const safe=String(r.stderr||'').replace(/postgres(?:ql)?:\/\/\S+/gi,'[redacted-db-url]')
      .replace(/eyJ[A-Za-z0-9._-]{40,}/g,'[redacted-jwt]').split('\n').slice(-8).join(' ').slice(0,1000);
    throw new Error(`Local Radar command failed: ${bin} (${r.status??r.error?.code}) ${safe}`);
  }
  return r.stdout||'';
}
const cli=args=>call(cliBinary,[...cliBase,'--workdir',workdir,'--experimental','stack',...args]);
function nativePsql(){
  if(process.env.NEXA_LOCAL_PSQL_BIN)return process.env.NEXA_LOCAL_PSQL_BIN;
  const base=join(home,'cache','stack','slim-services','postgres');
  for(const version of readdirSync(base).reverse())for(const platform of readdirSync(join(base,version)))
    for(const digest of readdirSync(join(base,version,platform))){
      const path=join(base,version,platform,digest,'bin','psql');if(existsSync(path))return path;
    }
  throw new Error('Disposable PostgreSQL client absent');
}
let started=false,destroyed=false;
try{
  mkdirSync(join(workdir,'supabase'),{recursive:true});
  writeFileSync(join(workdir,'supabase/config.toml'),'[experimental]\nstack = true\n');
  cli(['start','--stack',stack,'--runtime','native','--preparation','on-demand',
    '--exclude','storage,realtime,studio,analytics,pooler,mail','--eager']);
  started=true;
  const status=JSON.parse(cli(['status','--stack',stack,'--env','--output-format','json']));
  const db=new URL(status.DB_URL);
  if(!['127.0.0.1','localhost','::1'].includes(db.hostname))throw new Error('Disposable database is not loopback');
  const pgEnv={...cliEnv,PGHOST:db.hostname,PGPORT:db.port,PGUSER:decodeURIComponent(db.username),
    PGPASSWORD:decodeURIComponent(db.password),PGDATABASE:db.pathname.slice(1),PGSSLMODE:'disable'};
  const psql=nativePsql();
  const sql=statement=>call(psql,['-X','-v','ON_ERROR_STOP=1','--quiet','--no-align','--tuples-only','--command',statement],pgEnv).trim();
  for(const file of ['tests/radar-ledger/local-schema.sql',
    'supabase/migrations/20261102092515_nexa_radar_question_event_ledger_candidate.sql',
    'tests/radar-ledger/ledger-500.sql'])
    call(psql,['-X','-v','ON_ERROR_STOP=1','--file',file],pgEnv);
  // Reapply after data exists: the candidate must preserve every event.
  call(psql,['-X','-v','ON_ERROR_STOP=1','--file',
    'supabase/migrations/20261102092515_nexa_radar_question_event_ledger_candidate.sql'],pgEnv);
  // The stack CLI's db advisors subcommand does not accept this disposable
  // loopback database. Security grants and tenant access are asserted in SQL.
  const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const append=eventId=>`BEGIN; SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub','${actor}',true);
    SELECT public.append_nexa_radar_question_event('${eventId}','synthetic-radar-encounter',
      '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
      'q_concurrent','dyspnea','changed','to_ask','asked','high','high',
      'patient_answer','engine','radar-temporal-v1',NULL,NULL,1); COMMIT;`;
  const runAsync=promisify(execFile);
  await Promise.all([
    '00000000-0000-4000-8000-000000000501','00000000-0000-4000-8000-000000000502'
  ].map(eventId=>runAsync(psql,['-X','-v','ON_ERROR_STOP=1','--quiet','--command',append(eventId)],
    {cwd:root,env:pgEnv,timeout:30000})));
  call(psql,['-X','-v','ON_ERROR_STOP=1','--file','tests/radar-ledger/ledger-final.sql'],pgEnv);
  if(sql('SELECT count(*) FROM public.nexa_radar_question_events')!=='502')throw new Error('Radar event count mismatch');
  console.log('LOCAL_RADAR_LEDGER_PASS: 502 ordered events, idempotency, tenant denial, concurrent sequence');
}finally{
  if(started){try{cli(['destroy','--stack',stack,'--yes']);destroyed=true;}catch{console.error('Inspect disposable stack',stack);}}
  if(destroyed||!started){rmSync(workdir,{recursive:true,force:true});rmSync(home,{recursive:true,force:true});}
}
