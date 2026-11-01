/** Real local Auth/JWT and REST recovery across separate signed-in clients. */
import {createClient} from '@supabase/supabase-js';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {chmodSync,existsSync,mkdtempSync,mkdirSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
if(process.cwd()!==root)throw new Error('Run from repository root');
for(const key of ['SUPABASE_ACCESS_TOKEN','NEXA_STAGING_DB_URL','NEXA_STAGING_SERVICE_ROLE_KEY'])
 if(process.env[key])throw new Error('Hosted credential forbidden in local transcript recovery');
const id=randomBytes(4).toString('hex');
const workdir=mkdtempSync(`/tmp/nexa-pr93-transcript-${id}-`);
chmodSync(workdir,0o755);
const home=mkdtempSync(`/tmp/nexa-pr93-home-${id}-`);
const stack=`nexa-pr93-${id}`;
const runtime=process.env.GITHUB_ACTIONS==='true'?'docker':'native';
const cliBinary=process.env.NEXA_SUPABASE_CLI||'npx';
const cliBase=process.env.NEXA_SUPABASE_CLI?[]:['--yes','supabase@2.122.0'];
const cliEnv={...process.env,SUPABASE_EXPERIMENTAL_STACK:'1',SUPABASE_HOME:home};
function call(bin,args,env=cliEnv){
 const r=spawnSync(bin,args,{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:600000,maxBuffer:4*1024*1024});
 if(r.error||r.status!==0){
  const safe=String(r.stderr||'').replace(/postgres(?:ql)?:\/\/\S+/gi,'[redacted-db-url]')
   .replace(/eyJ[A-Za-z0-9._-]{40,}/g,'[redacted-jwt]').split('\n').slice(-4).join(' ').slice(0,500);
  const advisor=args.includes('advisors')?String(r.stdout||'').slice(-1000):'';
  throw new Error(`Disposable transcript command failed: ${bin} (${r.status??r.error?.code}) ${safe} ${advisor}`);
 }
 return r.stdout||'';
}
const cli=args=>call(cliBinary,[...cliBase,'--workdir',workdir,'--experimental','stack',...args]);
function nativePsql(){
 if(process.env.NEXA_LOCAL_PSQL_BIN)return process.env.NEXA_LOCAL_PSQL_BIN;
 if(runtime==='docker')return 'psql';
 const base=join(home,'cache','stack','slim-services','postgres');
 for(const version of readdirSync(base).reverse())for(const platform of readdirSync(join(base,version)))
  for(const digest of readdirSync(join(base,version,platform))){
   const path=join(base,version,platform,digest,'bin','psql');if(existsSync(path))return path;
  }
 throw new Error('Local PostgreSQL client absent');
}
const sha=text=>createHash('sha256').update(text).digest('hex');
const q=s=>`'${String(s).replaceAll("'","''")}'`;
let started=false,destroyed=false;
try{
 mkdirSync(join(workdir,'supabase'),{recursive:true});
 writeFileSync(join(workdir,'supabase/config.toml'),'[experimental]\nstack = true\n');
 cli(['start','--stack',stack,'--runtime',runtime,'--preparation','on-demand',
  '--exclude','storage,realtime,studio,analytics,pooler,mail','--eager']);
 started=true;
 const status=JSON.parse(cli(['status','--stack',stack,'--env','--output-format','json']));
 const db=new URL(status.DB_URL);
 if(!['127.0.0.1','localhost','::1'].includes(db.hostname)||
    !['127.0.0.1','localhost','::1'].includes(new URL(status.API_URL).hostname))
  throw new Error('Disposable stack is not loopback');
 const pgEnv={...cliEnv,PGHOST:db.hostname,PGPORT:db.port,PGUSER:decodeURIComponent(db.username),
  PGPASSWORD:decodeURIComponent(db.password),PGDATABASE:db.pathname.slice(1),PGSSLMODE:'disable'};
 const psql=nativePsql();
 const sql=(statement)=>call(psql,['-X','-v','ON_ERROR_STOP=1','--quiet','--no-align','--tuples-only','--command',statement],pgEnv).trim();
 call(psql,['-X','-v','ON_ERROR_STOP=1','--file','tests/transcript/local-transcript-schema.sql'],pgEnv);
 const advisorDB=new URL(status.DB_URL);advisorDB.searchParams.set('sslmode','disable');
 call(cliBinary,[...cliBase,'db','advisors','--db-url',advisorDB.href,'--type','security','--level','warn','--fail-on','error']);
 const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const password=randomBytes(24).toString('base64url');
 const emailA=`transcript-${id}-a@example.invalid`,emailB=`transcript-${id}-b@example.invalid`;
 const a=(await admin.auth.admin.createUser({email:emailA,password,email_confirm:true}));
 const b=(await admin.auth.admin.createUser({email:emailB,password,email_confirm:true}));
 if(a.error||b.error||!a.data?.user||!b.data?.user)throw new Error('Local Auth fixture creation failed');
 const oa=randomUUID(),ob=randomUUID(),encounter=randomUUID(),consultation='synthetic-transcript-'+id;
 sql(`INSERT INTO public.organizations VALUES (${q(oa)}),(${q(ob)});
  INSERT INTO public.profiles VALUES (${q(a.data.user.id)},true,'active'),(${q(b.data.user.id)},true,'active');
  INSERT INTO public.organization_memberships VALUES (${q(oa)},${q(a.data.user.id)},'active'),(${q(ob)},${q(b.data.user.id)},'active');`);
 const client=()=>createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const session1=client(),foreign=client();
 assert.equal((await session1.auth.signInWithPassword({email:emailA,password})).error,null);
 assert.equal((await foreign.auth.signInWithPassword({email:emailB,password})).error,null);
 const {error:consultError}=await session1.from('consultation_history').insert({id:consultation,encounter_id:encounter,user_id:a.data.user.id,organization_id:oa,consent_recorded_at:new Date().toISOString()});
 assert.equal(consultError,null,consultError?.message);
 const original='Pessoa fictícia relata dor abdominal há três dias. Nega febre.';
 const event=randomUUID();
 const base={consultation_id:consultation,encounter_id:encounter,organization_id:oa,owner_user_id:a.data.user.id,
  revision:1,source_event_id:event,source_provider:'synthetic',source_model:'local-test',
  consent_recorded_at:new Date().toISOString()};
 const rows=[{...base,transcript_kind:'final_original',transcript_text:original},
  {...base,transcript_kind:'structuring_input',transcript_text:original}];
 assert.equal((await session1.from('encounter_transcript_versions').insert(rows)).error,null);
 assert.equal((await session1.from('encounter_transcript_versions').upsert(rows,
  {onConflict:'consultation_id,transcript_kind,source_event_id',ignoreDuplicates:true})).error,null);
 await session1.auth.signOut();
 const session2=client();
 assert.equal((await session2.auth.signInWithPassword({email:emailA,password})).error,null);
 const read=async c=>{const {data,error}=await c.from('encounter_transcript_versions')
  .select('id,consultation_id,encounter_id,organization_id,owner_user_id,transcript_kind,revision,transcript_text,transcript_sha256,source_event_id,created_at')
  .eq('consultation_id',consultation).order('created_at');assert.equal(error,null,error?.message);return data};
 const restored=await read(session2);
 assert.equal(restored.length,2);
 assert.deepEqual(restored.map(x=>x.transcript_kind).sort(),['final_original','structuring_input']);
 assert.ok(restored.every(x=>x.transcript_text===original&&x.transcript_sha256===sha(original)&&
  x.encounter_id===encounter&&x.organization_id===oa&&x.owner_user_id===a.data.user.id));
 assert.equal((await read(foreign)).length,0);
 const parent=restored.find(x=>x.transcript_kind==='final_original');
 const corrected='Pessoa fictícia relata dor abdominal há quatro dias. Nega febre.';
 const correction={...base,transcript_kind:'corrected',revision:1,source_event_id:randomUUID(),
  corrected_from_id:parent.id,transcript_text:corrected};
 assert.equal((await session2.from('encounter_transcript_versions').insert(correction)).error,null);
 assert.notEqual((await session2.from('encounter_transcript_versions').insert(correction)).error,null);
 assert.notEqual((await session2.from('encounter_transcript_versions').update({transcript_text:'altered'}).eq('id',parent.id)).error,null);
 const session3=client();
 assert.equal((await session3.auth.signInWithPassword({email:emailA,password})).error,null);
 const versions=await read(session3);
 assert.equal(versions.length,3);
 assert.equal(versions.find(x=>x.id===parent.id)?.transcript_text,original);
 assert.equal(versions.find(x=>x.transcript_kind==='corrected')?.transcript_sha256,sha(corrected));
 const sessionFile=join(workdir,'session.json');
 writeFileSync(sessionFile,JSON.stringify({api:status.API_URL,anon:status.ANON_KEY,
  email:emailA,password,consultation,encounter,organization:oa,owner:a.data.user.id,
  original,corrected}),{mode:0o600});
 const separate=call(process.execPath,['scripts/verify-transcript-new-process.mjs',sessionFile]);
 assert.ok(separate.includes('FRESH_PROCESS_TRANSCRIPT_RECOVERY_PASS'));
 sql(`UPDATE public.profiles SET status='revoked' WHERE id=${q(a.data.user.id)}`);
 assert.equal((await read(session3)).length,0);
 sql(`DELETE FROM public.encounter_transcript_versions; DELETE FROM public.consultation_history;
  DELETE FROM public.organization_memberships; DELETE FROM public.profiles; DELETE FROM public.organizations;`);
 assert.equal((await admin.auth.admin.deleteUser(a.data.user.id)).error,null);
 assert.equal((await admin.auth.admin.deleteUser(b.data.user.id)).error,null);
 assert.equal(sql(`SELECT (SELECT count(*) FROM auth.users)+(SELECT count(*) FROM public.encounter_transcript_versions)+
  (SELECT count(*) FROM public.consultation_history)+(SELECT count(*) FROM public.organizations)`),'0');
 console.log('LOCAL_TRANSCRIPT_AUTH_RECOVERY_PASS: separate Auth sessions, original/correction SHA-256, tenant denial, revocation, no duplicate');
}finally{
 if(started){try{cli(['destroy','--stack',stack,'--yes']);destroyed=true;}catch{console.error('Inspect disposable stack',stack);}}
 if(destroyed||!started){rmSync(workdir,{recursive:true,force:true});rmSync(home,{recursive:true,force:true});}
}
