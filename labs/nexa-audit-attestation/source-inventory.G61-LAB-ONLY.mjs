/* NEXA G61: static source inventory, offline only. NEVER authorizes reset. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {FIELDS,SECTIONS} from './authority-model.G60-LAB-ONLY.mjs';

export const REPO_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const G61_BASELINE='064757d2a39ad4c04c60b0034a8b35756b8eb089';
export const PINNED_SOURCES=Object.freeze({
  'index.html':['8128c34b0f9cdaf84a63a15c8f919612d2a48339','form,processing,transcription,consent,assessment'],
  'nexa-hotfix.js':['8af6635f70616b499a8a851982295177eced8f94','runtime-loader'],
  'nexa-encounter-autosave-v18.10.1.js':['25bca75f9263c080baf034b42a2c7496401e1ae1','autosave,processing-metadata,consent'],
  'nexa-audit-outbox-v18.9.19.js':['2d00ebf2b1e132fec0b74966cadad9189cb92bdd','audit-fields,review-state'],
  'nexa-audit-autosave-v18.5.js':['e41019e647e07c615b7fe2e9b9af75bd2f30d092','audit-legacy'],
  'nexa-radar-controller.js':['7ec6dc10029857a8640364880b12fbcef52fe163','transcription,radar-controller'],
  'nexa-radar-engine.js':['aaeeeb398cead6205a70000b4434ae6b83f3b341','radar-engine'],
  'nexa-radar-v4.js':['f0499355a9bd274903c07b2bee7f16d0d5a9e70a','radar-ui'],
  'nexa-radar-state-bridge-v18.9.9.js':['250025ea055c38d9aac46883b600289fd0e8dbfa','radar-state'],
  'nexa-radar-auto-review-v18.12.js':['3297f5af35973ba7f602d3233b89df210f709751','radar-review'],
  'nexa-clinical-plan-guard-v18.9.12.js':['11adfc0bdf7ed37cfa66d80c17129c822ef57ad6','plan'],
  'nexa-continuous-soap-v18.11.js':['5215abd5281fd406367e29201d594ab14bb156e7','soap'],
  'nexa-hypothesis-cid-guard-v18.9.11.js':['1c053a5b16671e5b1047fc95809e915dc547610e','hypothesis,cid'],
  'nexa-destination-flow-v18.9.15.js':['295bf9612dd79edc5e365ea7bb43101f5854e058','destination'],
  'nexa-core-radar-review-v3.js':['f38152761908c0a0342f9744c08b5a80bf53d202','radar-review'],
  'supabase/functions/_shared/nexa-medication-review.mjs':['3100e7b42a3b659e681efab2599e7b8f6ce7579a','medication-review-contract'],
  'supabase/functions/process-consultation/index.ts':['e7382926b954bc344fa3c553eb88ee4150ff1e7a','processing-response'],
  'supabase/functions/submit-audit-case/index.ts':['7ae2e5f62e6015847db48f39afb8df91f8667725','audit-server-contract'],
  'supabase/functions/submit-audit-case/audit-contract.mjs':['8972264c61d92ba48b2a31b0bcafc79674f9cfe4','audit-payload'],
});
const LIMIT=1024*1024;
const ORDERED=x=>[...new Set(x)].sort();
const STOP=(code,detail={})=>Object.freeze({status:'STOP',code,...detail,resetAuthorized:false});
export function gitBlobSha(bytes){
  const buffer=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes,'utf8');
  return createHash('sha1').update(Buffer.from('blob '+buffer.length+'\0')).update(buffer).digest('hex');
}
export function literalKeys(body){
  if(!/^(?:\s*'[-_a-z0-9]+'\s*,?)*\s*$/i.test(body))throw Error('NONLITERAL_KEY_ARRAY');
  return ORDERED([...body.matchAll(/'([-_a-z0-9]+)'/g)].map(m=>m[1]));
}
export function parseSourceFieldSets(index,audit,autosave){
  const match=index.match(/const fieldKeys=\[([^\]]+)\],sideKeys=\[([^\]]+)\],manualKeys=\[([^\]]+)\];/);
  const outbox=audit.match(/const KEYS=\[([^\]]+)\];/);
  const extra=autosave.match(/const extra=\{\s*([\s\S]*?)\s*\n \};/);
  if(!match||!outbox||!extra)throw Error('CLINICAL_SOURCE_EXTRACTOR_CHANGED');
  const form=ORDERED(match.slice(1).flatMap(literalKeys));
  const auditKeys=literalKeys(outbox[1]);
  const extras=ORDERED([...extra[1].matchAll(/^\s*([a-z][a-z_]+)\s*:/gm)].map(m=>m[1]));
  if(!form.length||!auditKeys.length||!extras.length)throw Error('EMPTY_FIELD_EXTRACTOR');
  return {form,auditKeys,extras,autosaveKnown:ORDERED([...form,...extras])};
}
export function mapSyntheticFieldNames(observed,manifest=FIELDS){
  if(!Array.isArray(observed)||observed.some(k=>typeof k!=='string'))return STOP('INVALID_FIELD_SOURCE');
  const unknown=ORDERED(observed.filter(k=>!manifest.includes(k)));
  return unknown.length?STOP('UNMAPPED_CLINICAL_FIELD',{unknown}):
    Object.freeze({status:'SYNTHETIC_FIELD_NAMES_MAPPED',count:ORDERED(observed).length,resetAuthorized:false});
}
function requireMarkers(sources){
  const checks=[
    ['index.html',['function collect(){','_include_hipotese','window.nexaClinicalBridge18101={','lastProcessedMeta={','realtimeTranscript']],
    ['nexa-encounter-autosave-v18.10.1.js',['function collectFields(){',"'.field[data-key]'","field.dataset?.key",'function processingMeta(reason)','protocol_usage:','consent_recorded_at:']],
    ['nexa-audit-outbox-v18.9.19.js',['const KEYS=','function buildSnapshot(','window.nexaRadar?.state','hypothesis_validation','learning_layers','destination:dest']],
    ['nexa-hotfix.js',['const modules=','nexa-encounter-autosave-v18.10.1.js','nexa-audit-outbox-v18.9.19.js']],
    ['supabase/functions/submit-audit-case/index.ts',['ALREADY_REVIEWED','source_sync_version','source_consultation_id']],
    ['nexa-radar-controller.js',['transcript']],
  ];
  for(const [file,markers] of checks){
    for(const marker of markers)if(!sources[file].includes(marker))throw Error('MISSING_SOURCE_MARKER:'+file+':'+marker);
  }
}
export function checkInventory({root=REPO_ROOT,overrides={}}={}){
  try{
    const sources={};
    for(const [file,[expectedSha]] of Object.entries(PINNED_SOURCES)){
      const filename=path.join(root,file);
      const bytes=Object.hasOwn(overrides,file)?Buffer.from(overrides[file],'utf8'):fs.readFileSync(filename);
      if(bytes.length>LIMIT) return STOP('SOURCE_FILE_OVERSIZE',{source:file});
      if(gitBlobSha(bytes)!==expectedSha)return STOP('SOURCE_CHANGED_NEEDS_REVIEW',{source:file});
      sources[file]=bytes.toString('utf8');
    }
    requireMarkers(sources);
    const sets=parseSourceFieldSets(sources['index.html'],sources['nexa-audit-outbox-v18.9.19.js'],
      sources['nexa-encounter-autosave-v18.10.1.js']);
    if(JSON.stringify(sets.form)!==JSON.stringify(sets.auditKeys))return STOP('AUDIT_FORM_FIELD_DRIFT');
    if(JSON.stringify(sets.autosaveKnown)!==JSON.stringify(ORDERED(FIELDS)))return STOP('MANIFEST_FIELD_DRIFT');
    if(SECTIONS.length!==12)return STOP('MANIFEST_SECTION_DRIFT');
    const loader=ORDERED([...sources['nexa-hotfix.js'].matchAll(/\.\/(nexa-[\w.-]+\.js)\?v=/g)].map(x=>x[1]));
    const mainScripts=ORDERED([...sources['index.html'].matchAll(/<script\b[^>]*src=["']([^"']+)/g)].map(x=>x[1]));
    const runtimeModules=ORDERED([...loader,...mainScripts.filter(s=>s.startsWith('./')).map(s=>s.slice(2).split('?')[0])]);
    const mapped=Object.keys(PINNED_SOURCES);
    const unreviewedRuntimeModules=runtimeModules.filter(m=>!mapped.includes(m));
    const externalScripts=mainScripts.filter(s=>/^https?:\/\//.test(s));
    const auditMissing=sets.autosaveKnown.filter(k=>!sets.auditKeys.includes(k));
    return Object.freeze({
      status:'BLOCKED',
      code:'DYNAMIC_CLINICAL_SCOPE_AND_PRODUCTION_AUTHORITY_UNPROVEN',
      staticSourceIntegrity:'PASS',staticFieldMappings:'PASS',
      sourceCount:Object.keys(PINNED_SOURCES).length,
      runtimeModuleCount:runtimeModules.length,
      manifestSections:SECTIONS.length,manifestFields:FIELDS.length,
      formFields:sets.form,auditFields:sets.auditKeys,autosaveKnownFields:sets.autosaveKnown,
      auditMissingFields:auditMissing,
      unreviewedRuntimeModules,externalScripts,
      dynamicFieldsUnbounded:true,clinicalMetadataUnbounded:true,authoritativeServerProof:false,
      resetAuthorized:false,
    });
  }catch(e){return STOP('STATIC_INVENTORY_UNVERIFIED',{reason:String(e?.message||e)})}
}
