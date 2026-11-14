/* P0 offline-only synthetic characterization and non-authorizing quarantine. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {
 inspectAuditContextQuarantine, AUDIT_CONTEXT_TRUST_BOUNDARIES
} from './audit-context-quarantine.P0-NOT-DEPLOYED.mjs';

const SRC=readFileSync(new URL('../../supabase/functions/submit-audit-case/index.ts',import.meta.url),'utf8');
const CONTRACT=readFileSync(new URL('../../supabase/functions/submit-audit-case/audit-contract.mjs',import.meta.url),'utf8');
const UID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EID='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const r=()=>({encounterId:EID,expectedSyncVersion:9});
const user=()=>({id:UID});
const source=()=>({
 encounterId:EID,ownerUserId:UID,clinicalAccessVerified:true,
 activeSlotVerified:true,encounterState:'ready_for_audit',syncVersion:9,
 fields:{hda:'FICTITIOUS_LOCAL_CLINICAL_TEXT'},
 processing_meta:{encounter_autosave:{clinicalPlan:{notes:'CLIENT_STORED_PLAN'}}}
});
const deny=out=>{
 assert.equal(out.auditSubmitAuthorized,false);
 assert.equal(out.externalAiAuthorized,false);
 assert.equal(out.adminWriteAuthorized,false);
 assert.equal(out.gateCVerified,false);
 assert.equal(out.reviewEvidenceVerified,false);
};
function actualSourceCoreContext(){
 const start=SRC.indexOf('function sourceCoreContext(body:any,source:any){');
 const end=SRC.indexOf('\n\nserve(',start);
 assert.ok(start>=0&&end>start,'real handler sourceCoreContext boundary changed');
 const snippet=SRC.slice(start,end).replace(
  'function sourceCoreContext(body:any,source:any){',
  'function sourceCoreContext(body,source){'
 );
 // Parse only this pure function; NEVER import or execute the Edge handler.
 const sandbox={
  isPlainObject:value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value)),
  safeCoreContext:input=>input,
  sanitizeRadarCapture:()=>({from_synthetic_test:true}),
  fetch:()=>{throw Error('NO_NETWORK')},
  Date,Math,Number,String,Array
 };
 vm.runInNewContext(snippet+'\nthis.fn=sourceCoreContext;',sandbox,{timeout:1000});
 return sandbox.fn;
}

test('characterize real handler: client learning_layers and destination survive a valid source',()=>{
 const fn=actualSourceCoreContext();
 const body={core_context:{
  learning_layers:{physician_final:{text:'FORGED_FROM_CLIENT'}},
  destination:{final:'CLIENT_CLAIM'},
  audit_submission_snapshot:{capture_reason:'CLIENT_CLAIM'}
 }};
 const db={
  encounter_id:EID,updated_at:'2026-11-13',sync_version:9,
  processing_meta:{encounter_autosave:{destination:{final:'SERVER_STORED'}}}
 };
 const out=fn(body,db);
 assert.equal(out.learning_layers.physician_final.text,'FORGED_FROM_CLIENT');
 assert.equal(out.destination.final,'CLIENT_CLAIM');
 assert.equal(out.audit_submission_snapshot.capture_reason,'CLIENT_CLAIM');
 assert.equal(out.audit_submission_snapshot.source_consultation_id,EID);
});
test('characterize real handler: null source still constructs context from caller',()=>{
 const fn=actualSourceCoreContext();
 const out=fn({
  source_consultation_id:EID,
  core_context:{learning_layers:{physician_final:{text:'CLIENT_ONLY'}}}
 },null);
 assert.equal(out.learning_layers.physician_final.text,'CLIENT_ONLY');
 assert.equal(out.audit_submission_snapshot.source_consultation_id,EID);
 assert.equal(out.audit_submission_snapshot.source_sync_version,0);
});
test('real handler and sanitization are not authenticity proof',()=>{
 assert.match(SRC,/const base=isPlainObject\(body\?\.core_context\)\?body\.core_context:\{\}/);
 assert.match(SRC,/const fields=source\?\.fields\?\?body\?\.fields/);
 assert.match(SRC,/const requireLearningLayers=isPlainObject\(body\?\.core_context\?\.learning_layers\)/);
 assert.match(CONTRACT,/reviewed_documentation:true/);
 assert.match(CONTRACT,/safeObject\(layers\.physician_final\)/);
});
test('quarantine rejects fields, core_context and metadata from client before any model call',()=>{
 for(const [key,value] of [
  ['fields',{hda:'FORGED'}],
  ['core_context',{learning_layers:{physician_final:{text:'FORGED'}}}],
  ['audit_priority',2],
  ['snapshot_version','final-v1'],
  ['reviewed_documentation',true],
  ['consent_recorded_at','2026-11-13T00:00:00Z'],
  ['learning_layers',{physician_final:'FORGED'}],
  ['destination',{final:'FORGED'}],
  ['audit_submission_snapshot',{reviewed_at:'NOW'}],
 ]) {
  const request={...r(),[key]:value};
  const out=inspectAuditContextQuarantine({request,actor:user(),source:source()});
  assert.equal(out.status,'STOP',key);
  assert.equal(out.code,'CLIENT_CONTEXT_OR_CLAIM_FORBIDDEN',key);
  deny(out);
 }
});
test('source must exist: no fallback to client fields',()=>{
 const out=inspectAuditContextQuarantine({request:r(),actor:user(),source:null});
 assert.equal(out.code,'EXISTING_SOURCE_REQUIRED');deny(out);
});
test('owner must match the authenticated actor',()=>{
 const s=source();s.ownerUserId=OTHER;
 const out=inspectAuditContextQuarantine({request:r(),actor:user(),source:s});
 assert.equal(out.code,'AUTHORITATIVE_OWNER_AND_ACCESS_REQUIRED');deny(out);
});
test('ready state and current server version are mandatory',()=>{
 const s=source();s.syncVersion=10;
 const out=inspectAuditContextQuarantine({request:r(),actor:user(),source:s});
 assert.equal(out.code,'CURRENT_SOURCE_VERSION_REQUIRED');deny(out);
 const t=source();t.encounterState='audited';
 const done=inspectAuditContextQuarantine({request:r(),actor:user(),source:t});
 assert.equal(done.code,'CURRENT_SOURCE_VERSION_REQUIRED');deny(done);
});
test('even matching source and forged positive consent/review flags cannot authorize or leak text',()=>{
 const s=source();s.serverConsent=true;s.reviewed_documentation=true;
 s.clinicalText='FICTITIOUS_UNVERIFIED_CONTENT';
 const out=inspectAuditContextQuarantine({request:r(),actor:user(),source:s});
 assert.equal(out.status,'SOURCE_CONTENT_QUARANTINED');
 assert.equal(out.sourceBoundCandidateOnly,true);
 deny(out);
 const dumped=JSON.stringify(out);
 for(const forbidden of ['FICTITIOUS_UNVERIFIED_CONTENT','FICTITIOUS_LOCAL_CLINICAL_TEXT','CLIENT_STORED_PLAN'])
  assert.equal(dumped.includes(forbidden),false);
 assert.equal(Object.hasOwn(out,'fields'),false);
 assert.equal(Object.hasOwn(out,'core_context'),false);
});
test('provenance inventory distinguishes stored client-authored data and review evidence',()=>{
 assert.ok(AUDIT_CONTEXT_TRUST_BOUNDARIES.browserOrClientEditableEvenWhenStored.includes('consultation_history.fields'));
 assert.ok(AUDIT_CONTEXT_TRUST_BOUNDARIES.metadataNotReviewProof.includes('core_context.provenance.reviewed_documentation'));
 assert.ok(AUDIT_CONTEXT_TRUST_BOUNDARIES.requiredOutsideThisLab.includes('durable physician final ACK after server sync'));
});
