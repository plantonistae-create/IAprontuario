import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {assessG16PhaseA1Result as gate} from '../labs/nexa-security/phase-a-count-gate.G16-REVIEW-ONLY.mjs';
const valid=(count=12)=>({rows:[{candidate_public_definer_routines:count,
 within_explicit_review_cap:count<=250}],error:null,truncated:false});
test('exactly 1 and 250 pass count screening, NEVER authorize hosted A2',()=>{
 for(const n of [1,11,29,250]){
  const r=gate(valid(n));
  assert.equal(r.count_within_review_cap,true);
  assert.equal(r.aggregate_candidate_count,n);
  assert.equal(r.authorized_to_run_A2,false);
  assert.equal(r.authorized_to_read_hosted_SQL,false);
 }
});
test('A1 count 251+ causes STOP, not first-250 inventory',()=>{
 for(const n of [251,1000]){
  const result=gate(valid(n));
  assert.equal(result.outcome,'STOP');
  assert.equal(result.reason,'A1_OVER_250_STOP');
  assert.equal(result.authorized_to_run_A2,false);
 }
});
test('query error, truncation, no row, duplicate row, unexpected zero all STOP',()=>{
 const set=[
  {...valid(),error:'backend unavailable'},
  {...valid(),truncated:true},
  {...valid(),rows:[]},
  {...valid(),rows:[valid().rows[0],valid().rows[0]]},
  valid(0)
 ];
 for(const s of set){
  const x=gate(s);
  assert.equal(x.outcome,'STOP');
  assert.equal(x.allowed_to_publish_private_inventory,false);
 }
});
test('cannot smuggle PHI, SQL body, raw ACL or credentials into the gate envelope',()=>{
 for(const key of ['patient','sql_body','raw_acl','function_name','api_key','jwt','tenant_id']){
  const s=valid();s[key]='PRIVATE';
  assert.equal(gate(s).outcome,'STOP');
  const t=valid();t.rows[0][key]='PRIVATE';
  assert.equal(gate(t).outcome,'STOP');
 }
});
test('contradictory flag, malformed integer, forged flags and string count all STOP',()=>{
 for(const value of ['12',null,-1,1.7,Number.MAX_SAFE_INTEGER+1]){
  const s=valid();s.rows[0].candidate_public_definer_routines=value;
  assert.equal(gate(s).outcome,'STOP');
 }
 const s=valid(252);s.rows[0].within_explicit_review_cap=true;
 assert.equal(gate(s).reason,'A1_COUNT_CONTRADICTION');
 const t=valid(12);t.rows[0].within_explicit_review_cap=false;
 assert.equal(gate(t).reason,'A1_COUNT_CONTRADICTION');
});
test('A1 and A2 are physically distinct SQL files with defense in depth',()=>{
 const base=new URL('../labs/nexa-security/',import.meta.url);
 const a=readFileSync(new URL('catalog-phase-a.G15-NOT-AUTHORIZED.sql',base),'utf8');
 const b=readFileSync(new URL('catalog-phase-a2.G16-NOT-AUTHORIZED.sql',base),'utf8');
 const noComments=s=>s.replace(/--[^\n]*/g,'');
 const aCode=noComments(a),bCode=noComments(b);
 assert.equal((aCode.match(/\bSELECT\b/gi)||[]).length,1,'A1 must run only one count SELECT');
 assert.match(aCode,/COUNT\(\*\)/i);
 assert.doesNotMatch(aCode,/pg_get_function_identity_arguments|pg_get_functiondef/i);
 assert.match(bCode,/counted AS MATERIALIZED/i);
 assert.match(bCode,/gate\.total BETWEEN 1 AND 250/i);
 assert.match(bCode,/CROSS JOIN counted AS gate/i);
 assert.match(bCode,/LIMIT 250/i);
 for(const code of [aCode,bCode]){
  assert.match(code,/BEGIN TRANSACTION READ ONLY;/i);
  assert.match(code,/ROLLBACK;/i);
  assert.doesNotMatch(code,/\b(REVOKE|GRANT|ALTER|DELETE|UPDATE|INSERT|TRUNCATE|DROP|CREATE|CALL|DO)\b/i);
  assert.doesNotMatch(code,/\bpg_get_functiondef\s*\(/i);
  assert.doesNotMatch(code,/\bauth\.(users|sessions)\b/i);
 }
});
test('CLI refuses private result file in public repository',()=>{
 const runner=fileURLToPath(new URL('../labs/nexa-security/phase-a-count-gate.G16-REVIEW-ONLY.mjs',import.meta.url));
 const publicFile=fileURLToPath(new URL('../package.json',import.meta.url));
 assert.throws(()=>execFileSync(process.execPath,[runner,publicFile],{
  cwd:resolve(fileURLToPath(new URL('../',import.meta.url))),
  encoding:'utf8',stdio:['ignore','pipe','pipe']
 }),e=>String(e.stderr).includes('G16_PRIVATE_A1_RESULT_MUST_STAY_OUTSIDE_REPOSITORY'));
});
