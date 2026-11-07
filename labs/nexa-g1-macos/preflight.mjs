// Read-only macOS local lab safety preflight. No network or mutation API.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const ROOT=path.resolve(fileURLToPath(new URL('.',import.meta.url)));
export const PORTS=Object.freeze([4173,55320,55321,55322,55323,55324]);
export const NETWORK='nexa-g1-macos-20261107';
const REQUIRED=['preflight.mjs','rollback-plan.mjs','supabase/config.toml'];
const PROTECTED=['fmkrcieubrlltiggyauc','phaitiijsjwrggdnoxiz'];
const DENIED_ENV=/^(?:SUPABASE_ACCESS_TOKEN|SUPABASE_URL|SUPABASE_PROJECT_REF|SUPABASE_DB_URL|SUPABASE_SERVICE_ROLE_KEY|NEXA_STAGING_.+|NEXA_PRODUCTION_.+|OPENAI_API_KEY|DATABASE_URL|PGPASSWORD|DOCKER_HOST|DOCKER_CONTEXT)$/i;
const NEVER={started:false,authenticated:false,paidCalls:false,productionChanged:false,authorized:false};
const digest=b=>createHash('sha256').update(b).digest('hex');
function safeFile(root,file){
 if(!REQUIRED.includes(file)&&file!=='manifest.json')throw Error('NOT_ALLOWLISTED');
 let current=root;
 for(const part of file.split('/')){
  current=path.resolve(current,part);
  if(!current.startsWith(root+path.sep))throw Error('OUTSIDE_LAB');
  if(fs.lstatSync(current).isSymbolicLink())throw Error('SYMLINK');
 }
 if(!fs.statSync(current).isFile())throw Error('NOT_FILE');
 return current;
}
export function verifyBundle(root=ROOT){
 const errs=[];let m=null;
 try{
  m=JSON.parse(fs.readFileSync(safeFile(root,'manifest.json'),'utf8'));
  if(m.schema!==1||m.parentHead!=='fc213ce565416720569ce6f157173e6942c20026'||
     m.projectId!=='nexa_g1_macos_local_only'||m.network!==NETWORK||
     Object.keys(m.files||{}).sort().join('|')!==[...REQUIRED].sort().join('|'))errs.push('MANIFEST_MISMATCH');
  for(const file of REQUIRED) {
   try{if(digest(fs.readFileSync(safeFile(root,file)))!==m.files[file])errs.push('HASH_MISMATCH');}
   catch{errs.push('MISSING_OR_SYMLINK_FILE');}
  }
  const cfg=fs.readFileSync(safeFile(root,'supabase/config.toml'),'utf8');
  for(const fragment of ['project_id = "nexa_g1_macos_local_only"','port = 55321','port = 55322',
   'shadow_port = 55320','port = 55323','port = 55324','enable_signup = false',
   'site_url = "http://127.0.0.1:4173"']){
   if(!cfg.includes(fragment))errs.push('LOCAL_CONFIGURATION_CHANGED');
  }
  if(PROTECTED.some(ref=>cfg.includes(ref))||/https?:\/\/(?!127\.0\.0\.1:|localhost:)/i.test(cfg)||
     /(?:env\s*\(|service_role|openai_api_key|supabase_access_token)/i.test(cfg))errs.push('REMOTE_OR_SECRET_CONFIG');
  for(const f of ['.env','.env.local','supabase/.env','supabase/.temp/project-ref','supabase/.temp/pooler-url']){
   if(fs.existsSync(path.join(root,f)))errs.push('LINKED_PROJECT_OR_ENV_FOUND');
  }
 }catch{errs.push('MANIFEST_OR_LAYOUT_INVALID');}
 return {check:'G1_STATIC',status:errs.length?'STOP':'STATIC_PASS_ONLY',errors:[...new Set(errs)].sort(),
  manifestSha256:(()=>{try{return digest(fs.readFileSync(path.join(root,'manifest.json')))}catch{return null}})(),...NEVER};
}
export function evaluateHost(e){
 const errs=[];
 if(e.platform!=='darwin'||!['arm64','x64'].includes(e.arch))errs.push('MACOS_REQUIRED');
 if(e.ramBytes<8*1024**3||e.dockerBytes<7*1024**3)errs.push('RAM_INSUFFICIENT');
 if(e.diskBytes<15*1024**3)errs.push('DISK_INSUFFICIENT');
 if(!e.dockerInstalled||!e.supabaseInstalled||!e.localDockerSocket)errs.push('LOCAL_TOOLS_UNVERIFIED');
 if(!e.envSafe)errs.push('DANGEROUS_ENVIRONMENT');
 if(!e.network||e.network.name!==NETWORK||e.network.internal!==true||
    e.network.loopback!==true||e.network.owned!==true||e.network.containers!==0)errs.push('ISOLATED_NETWORK_UNVERIFIED');
 if(!e.ports||PORTS.some(p=>e.ports[p]!==true))errs.push('PORTS_BUSY_OR_UNVERIFIED');
 if(e.imagesVerified!==true)errs.push('IMAGES_NOT_OFFLINE_VERIFIED');
 return {check:'G1_HOST_READ_ONLY',status:errs.length?'STOP':'HOST_PASS_NOT_AUTHORIZED',
  errors:[...new Set(errs)].sort(),...NEVER};
}
const run=(bin,args)=>{const r=spawnSync(bin,args,{encoding:'utf8',shell:false,timeout:3000,maxBuffer:65536});return {code:r.status,text:r.stdout||''};};
function macHostEvidence(){
 const installed=name=>run('/usr/bin/which',[name]).code===0;
 const dockerInstalled=installed('docker');
 let socket=false,mem=0,network=null;
 if(dockerInstalled){
  const c=run('docker',['context','inspect','--format','{{json .Endpoints.docker.Host}}']);
  try{socket=c.code===0&&JSON.parse(c.text.trim()).startsWith('unix://');}catch{}
  const m=run('docker',['info','--format','{{.MemTotal}}']);mem=m.code===0?Number(m.text.trim()):0;
  const v=run('docker',['network','inspect',NETWORK,'--format','{{json .}}']);
  try{
   const x=JSON.parse(v.text.trim());network={name:x.Name,internal:x.Internal===true,
    loopback:x.Options?.['com.docker.network.bridge.host_binding_ipv4']==='127.0.0.1',
    owned:x.Labels?.['org.nexa.g1']==='offline-only',containers:Object.keys(x.Containers||{}).length};
  }catch{}
 }
 const df=run('/bin/df',['-Pk',ROOT]),words=(df.text.trim().split('\n').at(-1)||'').trim().split(/\s+/);
 const ports=Object.fromEntries(PORTS.map(p=>[p,run('/usr/sbin/lsof',['-nP','-iTCP:'+p,'-sTCP:LISTEN']).code===1]));
 return {platform:process.platform,arch:process.arch,ramBytes:os.totalmem(),dockerBytes:mem,
  diskBytes:df.code===0?Number(words[3])*1024:0,dockerInstalled,
  supabaseInstalled:installed('supabase'),localDockerSocket:socket,network,ports,
  envSafe:Object.keys(process.env).every(k=>!DENIED_ENV.test(k)),imagesVerified:false};
}
export function inspectHost(){
 const s=verifyBundle();
 if(s.status!=='STATIC_PASS_ONLY')return {check:'G1_HOST_READ_ONLY',status:'STOP',errors:s.errors,...NEVER};
 return evaluateHost(macHostEvidence());
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mode=process.argv[2];
 if(process.argv.length!==3||!['--selfcheck','--inspect-host'].includes(mode)){
  console.error('ONLY_--selfcheck_OR_--inspect-host');process.exitCode=2;
 }else{
  const result=mode==='--selfcheck'?verifyBundle():inspectHost();
  console.log(JSON.stringify(result,null,2));
  if(result.status==='STOP')process.exitCode=2;
 }
}
