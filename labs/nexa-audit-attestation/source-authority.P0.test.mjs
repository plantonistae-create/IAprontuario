import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {assessSourceAuthority,syntheticSourceDigest,PINNED_MAIN,PINNED_SUBMIT_BLOB}
 from './source-authority.P0-LAB-ONLY.mjs';

const fixture=()=>{
 const actor={authenticated:true,serverVerified:true,userId:'doctor-fake-1'};
 // activeClinicalAccessVerified models an independently checked access/slot gate.
 const capabilities={verifiedByServer:true,userId:actor.userId,
  accessStatus:'active',clinicalAccess:true,activeClinicalAccessVerified:true};
 const requestedEncounterId='11111111-2222-4333-8444-555555555555',requestedVersion=7;
 const fields={hda:'História inteiramente fictícia.',prescricao:'Prescrição fictícia, sem doses.',
   campo_dinamico:{radar:['pergunta sintética'],texto:'sem dados pessoais'}};
 const source={id:'source-row-fake-1',encounter_id:requestedEncounterId,user_id:actor.userId,
  encounter_state:'ready_for_audit',sync_version:requestedVersion,
  consent_recorded_at:'2026-11-10T12:00:00.000Z',
  fields,processing_meta:{hypothesis:'fake',radar:{answered:['x']}},
  protocol_usage:[{protocol:'synthetic-1',version:1}]};
 const checkpoint={verifiedByServer:true,durable:true,status:'confirmed',
  serverReceiptId:'server-receipt-fake-1',canonicalization:'nexa-json-v1',
  sourceRowId:source.id,encounterId:requestedEncounterId,ownerUserId:actor.userId,
  syncVersion:requestedVersion,snapshotVersion:'final-v1',
  consentEvidenceServerVerified:true,consentRecordedAt:source.consent_recorded_at,
  consentPurposes:['external_ai','audit'],reconciliationPending:false,
  unprocessedAudio:false,postReviewEdits:false,clinicalDigest:syntheticSourceDigest(source)};
 return {actor,capabilities,source,checkpoint,requestedEncounterId,requestedVersion};
};
const evaluate=x=>assessSourceAuthority(x);
const fails=(x,code)=>{
 const r=evaluate(x);assert.equal(r.status,'STOP');
 assert.equal(r.privilegedWriteAuthorized,false);assert.equal(r.resetAuthorized,false);
 if(code)assert.equal(r.code,code);
 return r;
};
const changed=(f,k,v)=>({...f,[k]:v});
test('pinned hosted-code source retains null fallback; lab IS NOT a hosted fix',()=>{
 const p=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../supabase/functions/submit-audit-case/index.ts');
 const b=fs.readFileSync(p);
 const hash=createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
 assert.equal(PINNED_MAIN,'064757d2a39ad4c04c60b0034a8b35756b8eb089');
 assert.equal(hash,PINNED_SUBMIT_BLOB);
 const s=b.toString('utf8');
 assert.match(s,/const fields=source\?\.fields\?\?body\?\.fields/);
 assert.match(s,/\.maybeSingle\(\)/);
 assert.match(s,/const admin=createClient\(SUPABASE_URL,SERVICE_KEY/);
});
test('matching owner and fictional checkpoint are provisional, NEVER a write or reset grant',()=>{
 const r=evaluate(fixture());
 assert.deepEqual(r,{status:'PROVISIONAL_SOURCE_MATCH',
  code:'ATOMIC_SERVER_AUTHORIZATION_NOT_IMPLEMENTED',
  privilegedWriteAuthorized:false,resetAuthorized:false});
});
test('missing or unverified authenticated actor is rejected',()=>{
 for(const actor of [null,{},changed(fixture().actor,'serverVerified',false),
  changed(fixture().actor,'authenticated',false)])
  fails({...fixture(),actor},'TRUSTED_ACTOR_REQUIRED');
});
test('active clinical access includes real slot-check result, not invented auditSubmit',()=>{
 for(const v of [{verifiedByServer:false},{userId:'another-doctor'},
  {accessStatus:'inactive'},{clinicalAccess:false},{activeClinicalAccessVerified:false},
  {activeClinicalAccessVerified:undefined}]){
  const f=fixture();fails({...f,capabilities:{...f.capabilities,...v}},'ACTIVE_CLINICAL_ACCESS_DENIED');
 }
 const f=fixture();f.capabilities.auditSubmit=undefined;f.capabilities.tenantId=undefined;
 assert.equal(evaluate(f).status,'PROVISIONAL_SOURCE_MATCH');
});
test('missing source and forged body never authorize privileged writes',()=>{
 for(const source of [null,undefined,{}]){
  const f=fixture();fails({...f,source,body:{fields:{hda:'injected'}}},'AUTHORITATIVE_SOURCE_MISSING');
 }
});
test('encounter mismatch, missing owner and another physician are denied',()=>{
 for(const [v,code] of [
  [{encounter_id:'different-encounter'},'SOURCE_ID_MISMATCH'],
  [{user_id:null},'SOURCE_OWNER_MISMATCH'],
  [{user_id:'another-doctor'},'SOURCE_OWNER_MISMATCH']]){
  const f=fixture();fails({...f,source:{...f.source,...v}},code);
 }
});
test('source readiness and strictly positive matching sync version enforced',()=>{
 for(const [v,code] of [
  [{encounter_state:'draft'},'SOURCE_NOT_READY'],
  [{sync_version:0},'SOURCE_VERSION_MISMATCH'],
  [{sync_version:8},'SOURCE_VERSION_MISMATCH'],
  [{sync_version:7.1},'SOURCE_VERSION_MISMATCH']]){
  const f=fixture();fails({...f,source:{...f.source,...v}},code);
 }
 const f=fixture();fails({...f,requestedVersion:8},'SOURCE_VERSION_MISMATCH');
});
test('consent timestamp is required, but alone never proves BOTH purposes',()=>{
 const f=fixture();f.source.consent_recorded_at=null;
 fails(f,'CONSENT_SOURCE_MISSING');
 for(const consentPurposes of [[],['audit'],['external_ai']]){
  const g=fixture();g.checkpoint.consentPurposes=consentPurposes;
  fails(g,'DURABLE_CHECKPOINT_OR_CONSENT_UNVERIFIED');
 }
});
test('unmapped dynamic fields and nested clinical content are INCLUDED, never truncated',()=>{
 const f=fixture();const prior=syntheticSourceDigest(f.source);
 f.source.fields.informacao_nova={CID:'Z00.0',anotacoes:['texto fictício']};
 assert.notEqual(syntheticSourceDigest(f.source),prior);
 fails(f,'CHECKPOINT_CLINICAL_CONTENT_MISMATCH');
 f.checkpoint.clinicalDigest=syntheticSourceDigest(f.source);
 assert.equal(evaluate(f).status,'PROVISIONAL_SOURCE_MATCH');
});
test('post-checkpoint edits in content, metadata, protocol or consent fail closed',()=>{
 for(const mutate of [
  s=>{s.fields.hda+=' adendo';},
  s=>{s.fields.campo_dinamico.radar.push('nova pergunta');},
  s=>{s.processing_meta.radar.answered.push('y');},
  s=>{s.protocol_usage.push({protocol:'new',version:2});},
  s=>{s.consent_recorded_at='2026-11-10T13:00:00.000Z';}
 ]){
  const f=fixture();mutate(f.source);
  const expected=f.source.consent_recorded_at!==f.checkpoint.consentRecordedAt?
   'DURABLE_CHECKPOINT_OR_CONSENT_UNVERIFIED':'CHECKPOINT_CLINICAL_CONTENT_MISMATCH';
  fails(f,expected);
 }
});
test('missing or untrusted durable checkpoint, version, receipt, flags and consent are STOP',()=>{
 const changes=[
  {verifiedByServer:false},{durable:false},{status:'local-only'},
  {serverReceiptId:''},{canonicalization:'unknown'},{sourceRowId:'other-row'},
  {ownerUserId:'another-doctor'},{syncVersion:8},{snapshotVersion:'other'},
  {consentEvidenceServerVerified:false},{consentRecordedAt:'other-date'},
  {reconciliationPending:true},{unprocessedAudio:true},{postReviewEdits:true}
 ];
 for(const v of changes){const f=fixture();f.checkpoint={...f.checkpoint,...v};
  fails(f,'DURABLE_CHECKPOINT_OR_CONSENT_UNVERIFIED');}
 fails({...fixture(),checkpoint:null},'DURABLE_CHECKPOINT_OR_CONSENT_UNVERIFIED');
});
test('invalid clinical JSON, hidden accessors and cycles STOP without leaking content',()=>{
 for(const modify of [
  s=>{s.fields=null;},
  s=>{s.processing_meta=null;},
  s=>{s.protocol_usage='invalid';},
  s=>{s.processing_meta.loop=s.processing_meta;},
  s=>{Object.defineProperty(s.fields,'hda',{enumerable:true,get(){throw Error('getter')}});}
 ]){
  const f=fixture();modify(f.source);fails(f,'CLINICAL_SOURCE_SCOPE_UNVERIFIED');
 }
});
test('canonical key order does not change digest; whitespace is a clinical change',()=>{
 const f=fixture(),hash=syntheticSourceDigest(f.source);
 f.source.fields=Object.fromEntries(Object.entries(f.source.fields).reverse());
 assert.equal(syntheticSourceDigest(f.source),hash);
 f.source.fields.hda+=' ';
 assert.notEqual(syntheticSourceDigest(f.source),hash);
});
test('pending audit is provisional; terminal approved/corrected/discarded/locked never reset',()=>{
 const f=fixture();
 const existing={source_consultation_id:f.requestedEncounterId,submitted_by:f.actor.userId,
  source_sync_version:7,snapshot_version:'final-v1',status:'pending'};
 assert.equal(evaluate({...f,existingAudit:existing}).status,'PROVISIONAL_SOURCE_MATCH');
 for(const status of ['approved','corrected','discarded','locked','reviewed'])
  fails({...f,existingAudit:{...existing,status}},'IMMUTABLE_AUDIT_ALREADY_REVIEWED');
 for(const [v,code] of [
  [{submitted_by:'other-doctor'},'EXISTING_AUDIT_SCOPE_MISMATCH'],
  [{source_consultation_id:'other-encounter'},'EXISTING_AUDIT_SCOPE_MISMATCH'],
  [{source_sync_version:6},'EXISTING_AUDIT_VERSION_MISMATCH'],
  [{snapshot_version:'other'},'EXISTING_AUDIT_VERSION_MISMATCH']])
   fails({...f,existingAudit:{...existing,...v}},code);
});
test('body fields, forged metadata, tenant and auditSubmit are never authority',()=>{
 const f=fixture(),before=evaluate(f);
 const after=evaluate({...f,body:{fields:{hda:'malicious'},core_context:{plan:'malicious'}},
  clientFields:{hda:'malicious'},clientTenantId:'fake',auditSubmit:true});
 assert.deepEqual(after,before);
});
test('invalid requests, replay after local change and all results deny privileged writes',()=>{
 for(const req of [{requestedEncounterId:''},{requestedVersion:0},{requestedVersion:7.5}]){
  fails({...fixture(),...req},'SOURCE_REQUEST_INVALID');
 }
 const f=fixture();assert.equal(evaluate(f).privilegedWriteAuthorized,false);
 f.source.sync_version++;fails(f,'SOURCE_VERSION_MISMATCH');
 for(const x of [fixture(),{...fixture(),checkpoint:null},{...fixture(),source:null}]){
  const result=evaluate(x);assert.equal(result.privilegedWriteAuthorized,false);
  assert.equal(result.resetAuthorized,false);
 }
});
