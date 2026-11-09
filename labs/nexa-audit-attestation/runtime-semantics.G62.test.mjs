import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {LOADED_RUNTIME_PINS,REPO_ROOT} from './source-inventory.G61-LAB-ONLY.mjs';
import {REVIEWED_CALLSITES,assessRuntimeSemantics} from './runtime-semantics.G62-LAB-ONLY.mjs';

test('G62 registers all 32 runtime modules with a specific semantic callsite',()=>{
 assert.equal(REVIEWED_CALLSITES.length,32);
 assert.deepEqual(REVIEWED_CALLSITES.map(x=>x.path).sort(),Object.keys(LOADED_RUNTIME_PINS).sort());
 for(const entry of REVIEWED_CALLSITES){
  assert.ok(entry.note.length>8,entry.path);
  assert.ok(entry.marker.length>8,entry.path);
  const actual=fs.readFileSync(path.join(REPO_ROOT,entry.path),'utf8');
  assert.ok(actual.includes(entry.marker),entry.path+' '+entry.marker);
 }
});
test('G62 source-backed semantic review remains BLOCKED for full data-flow coverage',()=>{
 const r=assessRuntimeSemantics();
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.code,'SEMANTIC_CALLSITES_MAPPED_NOT_EXHAUSTIVELY_PROVEN');
 assert.equal(r.reviewedModuleCount,32);
 assert.equal(r.partialReview,true);
 assert.equal(r.completeDataFlowProof,false);
 assert.equal(r.dynamicRuntimeInputsUnbounded,true);
 assert.equal(r.resetAuthorized,false);
 assert.ok(r.clinicalWriters.length>=5);
});
test('safety-critical known modules are not mislabeled presentation-only',()=>{
 const lookup=Object.fromEntries(REVIEWED_CALLSITES.map(x=>[x.path,x.role]));
 for(const name of [
  'nexa-encounter-conflicts-v18.10.2.js',
  'nexa-protocol-library-v18.10.1.js',
  'nexa-summary-state-guard-v18.9.10.js',
  'nexa-conduct-state-guard-v18.9.13.js',
  'nexa-history-style-audit-v18.9.7.js',
 ]){
  assert.equal(lookup[name],'clinical-writer');
 }
 assert.equal(lookup['nexa-auditor-exact-v18.9.js'],'audit-editor');
 assert.equal(lookup['nexa-auth-session-v1.js'],'auth-session');
});
test('clinical content changes in each of 32 runtime modules must STOP before a new proof',()=>{
 for(const entry of REVIEWED_CALLSITES){
  const original=fs.readFileSync(path.join(REPO_ROOT,entry.path),'utf8');
  const changed=original+'\n// additional synthetic medical input sink';
  const r=assessRuntimeSemantics({overrides:{[entry.path]:changed}});
  assert.equal(r.status,'STOP',entry.path);
  assert.equal(r.code,'RUNTIME_SOURCE_DRIFT',entry.path);
  assert.equal(r.resetAuthorized,false);
 }
});
test('missing file never produces inferred semantic approval',()=>{
 const r=assessRuntimeSemantics({root:path.join(REPO_ROOT,'G62-nonexistent')});
 assert.equal(r.status,'STOP');
 assert.equal(r.code,'RUNTIME_SEMANTICS_UNAVAILABLE');
 assert.equal(r.resetAuthorized,false);
});
test('semantic classification can never stand in for authenticated server attestation',()=>{
 const r=assessRuntimeSemantics();
 assert.notEqual(r.status,'APPROVED');
 assert.equal(r.resetAuthorized,false);
 assert.equal('realClinicalDataCoverage' in r,false);
});
