import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {verifyBundle,evaluateHost,NETWORK,PORTS} from '../labs/nexa-g1-macos/preflight.mjs';
import {rollbackPlan} from '../labs/nexa-g1-macos/rollback-plan.mjs';
const root=resolve(fileURLToPath(new URL('../labs/nexa-g1-macos/',import.meta.url)));
const good=()=>({platform:'darwin',arch:'arm64',ramBytes:16*1024**3,dockerBytes:8*1024**3,
 diskBytes:25*1024**3,dockerInstalled:true,supabaseInstalled:true,localDockerSocket:true,
 envSafe:true,network:{name:NETWORK,internal:true,loopback:true,owned:true,containers:0},
 ports:Object.fromEntries(PORTS.map(p=>[p,true])),imagesVerified:true});
test('bundle sha256 static contract passes without executing host services',()=>{
 const s=verifyBundle();assert.equal(s.status,'STATIC_PASS_ONLY',s.errors.join(','));
 assert.match(s.manifestSha256,/^[a-f0-9]{64}$/);assert.equal(s.authenticated,false);
});
test('static CLI is read-only on any test platform',()=>{
 const result=JSON.parse(execFileSync(process.execPath,['preflight.mjs','--selfcheck'],{cwd:root,encoding:'utf8'}));
 assert.equal(result.status,'STATIC_PASS_ONLY');assert.equal(result.authorized,false);
});
test('synthetic full host proof cannot imply authorization',()=>{
 const r=evaluateHost(good());assert.equal(r.status,'HOST_PASS_NOT_AUTHORIZED');
 for(const k of ['started','authenticated','paidCalls','productionChanged','authorized'])assert.equal(r[k],false);
});
test('OS, memory, disk, tool and port regressions fail closed',()=>{
 const entries=[['platform','linux','MACOS_REQUIRED'],['ramBytes',2*1024**3,'RAM_INSUFFICIENT'],
 ['dockerBytes',2*1024**3,'RAM_INSUFFICIENT'],['diskBytes',2*1024**3,'DISK_INSUFFICIENT'],
 ['dockerInstalled',false,'LOCAL_TOOLS_UNVERIFIED'],['envSafe',false,'DANGEROUS_ENVIRONMENT']];
 for(const [key,value,reason] of entries){
  const x=good();x[key]=value;assert.ok(evaluateHost(x).errors.includes(reason));
 }
 const x=good();x.ports[55321]=false;assert.ok(evaluateHost(x).errors.includes('PORTS_BUSY_OR_UNVERIFIED'));
});
test('network isolation and image cache are mandatory',()=>{
 for(const [key,value] of [['internal',false],['loopback',false],['owned',false],['containers',1]]){
  const x=good();x.network[key]=value;assert.ok(evaluateHost(x).errors.includes('ISOLATED_NETWORK_UNVERIFIED'));
 }
 const x=good();x.imagesVerified=false;assert.ok(evaluateHost(x).errors.includes('IMAGES_NOT_OFFLINE_VERIFIED'));
});
test('rollback is a plan only, never changes services or credentials',()=>{
 const x=rollbackPlan();assert.equal(x.executed,false);assert.equal(x.authorized,false);
 assert.equal(x.productionChanged,false);
 const out=JSON.parse(execFileSync(process.execPath,['rollback-plan.mjs','--plan'],{cwd:root,encoding:'utf8'}));
 assert.equal(out.mode,'PLAN_ONLY');assert.equal(out.deleted,false);
});
test('source contains no filesystem write or network APIs',()=>{
 for(const name of ['preflight.mjs','rollback-plan.mjs']){
  const s=readFileSync(resolve(root,name),'utf8');
  assert.doesNotMatch(s,/\b(?:writeFileSync|mkdirSync|unlinkSync|rmSync|fetch|execSync|execFileSync)\s*\(/);
 }
});
