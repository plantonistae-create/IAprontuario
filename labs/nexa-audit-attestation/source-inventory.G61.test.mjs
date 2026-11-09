import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {checkInventory,parseSourceFieldSets,mapSyntheticFieldNames,gitBlobSha,REPO_ROOT,PINNED_SOURCES,LOADED_RUNTIME_PINS,literalKeys} from './source-inventory.G61-LAB-ONLY.mjs';
import {FIELDS,SECTIONS,canonicalEnvelope,ENVELOPE_SCHEMA} from './authority-model.G60-LAB-ONLY.mjs';

test('G61 static source baseline is byte-for-byte pinned on 19 critical sources',()=>{
 assert.equal(Object.keys(PINNED_SOURCES).length,19);
 for(const [file,[sha]] of Object.entries(PINNED_SOURCES)){
  assert.equal(gitBlobSha(fs.readFileSync(path.join(REPO_ROOT,file))),sha,file);
 }
});
test('G61 source inventory identifies mapped fields without declaring clinical completion',()=>{
 const r=checkInventory();
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.code,'DYNAMIC_CLINICAL_SCOPE_AND_PRODUCTION_AUTHORITY_UNPROVEN');
 assert.equal(r.staticSourceIntegrity,'PASS');
 assert.equal(r.staticFieldMappings,'PASS');
 assert.equal(r.resetAuthorized,false);
 assert.equal(r.sourceCount,51);
 assert.equal(r.runtimePinnedCount,32);
 assert.equal(r.manifestSections,12);
 assert.equal(r.manifestFields,14);
 assert.equal(r.formFields.length,12);
 assert.equal(r.auditFields.length,12);
 assert.deepEqual(r.auditMissingFields,['exames_sugeridos','prescricao']);
 assert.equal(r.dynamicFieldsUnbounded,true);
 assert.equal(r.clinicalMetadataUnbounded,true);
 assert.equal(r.authoritativeServerProof,false);
 assert.ok(r.runtimeModuleCount>=30);
 assert.ok(r.unreviewedRuntimeModules.length>=5);
 assert.ok(r.externalScripts.length>=1);
});
test('every known frontend form field and autosave extra maps to the G60 model',()=>{
 const index=fs.readFileSync(path.join(REPO_ROOT,'index.html'),'utf8');
 const audit=fs.readFileSync(path.join(REPO_ROOT,'nexa-audit-outbox-v18.9.19.js'),'utf8');
 const autosave=fs.readFileSync(path.join(REPO_ROOT,'nexa-encounter-autosave-v18.10.1.js'),'utf8');
 const s=parseSourceFieldSets(index,audit,autosave);
 assert.deepEqual(s.form,s.auditKeys);
 assert.deepEqual(s.autosaveKnown,[...FIELDS].sort());
 assert.deepEqual(s.extras,['conduta','exames_sugeridos','prescricao']);
});
test('dynamic unexpected medical field must fail closed',()=>{
 const r=mapSyntheticFieldNames([...FIELDS,'novo_campo_clinico']);
 assert.equal(r.status,'STOP');assert.equal(r.code,'UNMAPPED_CLINICAL_FIELD');assert.equal(r.resetAuthorized,false);
 assert.deepEqual(r.unknown,['novo_campo_clinico']);
});
test('dynamic known field names are mapped provisionally, never authorized',()=>{
 const r=mapSyntheticFieldNames(['hda','prescricao','exames_sugeridos']);
 assert.equal(r.status,'SYNTHETIC_FIELD_NAMES_MAPPED');assert.equal(r.resetAuthorized,false);
});
test('invalid field names and nonliteral registry declarations are rejected',()=>{
 assert.equal(mapSyntheticFieldNames([null]).status,'STOP');
 assert.throws(()=>literalKeys("'hda', ...extraKeys"),/NONLITERAL_KEY_ARRAY/);
 assert.throws(()=>parseSourceFieldSets('invalid','invalid','invalid'),/CLINICAL_SOURCE_EXTRACTOR_CHANGED/);
});
test('modifying any of the 19 pinned source files prevents inventory approval',()=>{
 for(const file of Object.keys(PINNED_SOURCES)){
  const source=fs.readFileSync(path.join(REPO_ROOT,file),'utf8');
  const out=checkInventory({overrides:{[file]:source+'\n/* synthetic source drift */\n'}});
  assert.equal(out.status,'STOP',file);
  assert.equal(out.code,'SOURCE_CHANGED_NEEDS_REVIEW',file);
  assert.equal(out.resetAuthorized,false,file);
 }
});
test('a dynamic UI field addition is blocked rather than omitted from the audit scope',()=>{
 const file='index.html',source=fs.readFileSync(path.join(REPO_ROOT,file),'utf8');
 const result=checkInventory({overrides:{[file]:source.replace('const fieldKeys=[', "const fieldKeys=['campo_novo',") }});
 assert.equal(result.status,'STOP');assert.equal(result.code,'SOURCE_CHANGED_NEEDS_REVIEW');
});
test('a new backend medication metadata field cannot be silently ignored',()=>{
 const file='supabase/functions/_shared/nexa-medication-review.mjs';
 const source=fs.readFileSync(path.join(REPO_ROOT,file),'utf8');
 const r=checkInventory({overrides:{[file]:source+'\n// synthetic medication field drift'}});
 assert.equal(r.status,'STOP');assert.equal(r.resetAuthorized,false);
});
test('missing source file, external path and inaccessible source never authorize reset',()=>{
 const r=checkInventory({root:path.join(REPO_ROOT,'folder-not-present')});
 assert.equal(r.status,'STOP');assert.equal(r.code,'STATIC_INVENTORY_UNVERIFIED');assert.equal(r.resetAuthorized,false);
});
test('the G60 clinical envelope rejects supplemental unknown sections',()=>{
 const fields=Object.fromEntries(FIELDS.map(f=>[f,'']));
 const sections=Object.fromEntries(SECTIONS.map(section=>[section,{}]));
 sections.fields=fields;sections.protocol_usage=[];
 sections.audit_context={reason:'synthetic'};sections.clinical_plan={plan:'synthetic'};
 sections.consent={confirmed:true};sections.hypothesis_review={final:'synthetic'};
 sections.processing_meta={source:'synthetic'};
 const envelope={schema:ENVELOPE_SCHEMA,sections};
 assert.equal(typeof canonicalEnvelope(envelope),'string');
 envelope.sections.invisible_new_medical_source={secret:'synthetic'};
 assert.throws(()=>canonicalEnvelope(envelope),/CLINICAL_SCOPE_INCOMPLETE/);
});
test('never represent the static inventory as authoritative version attestation',()=>{
 const r=checkInventory();
 assert.notEqual(r.status,'APPROVED');assert.equal(r.resetAuthorized,false);
 assert.ok(r.unreviewedRuntimeModules.length>0);
 assert.ok(r.auditMissingFields.length>0);
});

test('all 32 additional loader modules have pinned byte integrity (not semantic attestation)',()=>{
 assert.equal(Object.keys(LOADED_RUNTIME_PINS).length,32);
 for(const [file,[sha]] of Object.entries(LOADED_RUNTIME_PINS)){
  assert.equal(gitBlobSha(fs.readFileSync(path.join(REPO_ROOT,file))),sha,file);
 }
 const report=checkInventory();
 assert.equal(report.runtimePinnedCount,32);
 assert.ok(report.runtimeModuleCount>=45);
 assert.equal(report.unreviewedRuntimeModules.length,32,'pinned source != reviewed clinical semantics');
});
test('changes in any runtime-loaded module also trigger STOP even if outside 19 critical sources',()=>{
 for(const file of Object.keys(LOADED_RUNTIME_PINS)){
  const src=fs.readFileSync(path.join(REPO_ROOT,file),'utf8');
  const result=checkInventory({overrides:{[file]:src+'\n// synthetic future code modification'}});
  assert.equal(result.status,'STOP',file);
  assert.equal(result.code,'SOURCE_CHANGED_NEEDS_REVIEW',file);
  assert.equal(result.source,file);
  assert.equal(result.resetAuthorized,false);
 }
});
