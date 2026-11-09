import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {assessSourceAuthority,syntheticSourceDigest,PINNED_MAIN,PINNED_SUBMIT_BLOB}
 from './source-authority.P0-LAB-ONLY.mjs';

const fixture=()=>{
 const actor={authenticated:true,serverVerified:true,userId:'doctor-fake-1',tenantId:'tenant-fake-1'};
 const capabilities={verifiedByServer:true,userId:actor.userId,tenantId:actor.tenantId,
  accessStatus:'active',clinicalAccess:true,auditSubmit:true};
 const requestedEncounterId='11111111-2222-4333-8444-555555555555';
 const requestedVersion=7;
 const fields=Object.fromEntries([
 'alergias','antecedentes','comorbidades','conduta','exame_fisico',
 'exames_sugeridos','hda','hipotese_diagnostica','medicacoes',
 'orientacoes_alta','prescricao','queixa_principal','sinais_vitais',
 'sugestoes_perguntas'].map(k=>[k,'']));
 fields.hda='História inteiramente fictícia.';
 fields.prescricao='Prescrição fictícia, sem doses.';
 const source={encounter_id:requestedEncounterId,user_id:actor.userId,tenant_id:actor.tenantId,
  encounter_state:'ready_for_audit',sync_version:requestedVersion,
  fields,processing_meta:{hypothesis:'fake',consent:'synthetic',radar:{answered:['x']}},
  protocol_usage:[{protocol:'synthetic-1',version:1}]};
 const checkpoint={verifiedByServer:true,durable:true,status:'confirmed',
  encounterId:requestedEncounterId,ownerUserId:actor.userId,tenantId:actor.tenantId,
  syncVersion:requestedVersion,completeFieldCoverage:true,completeMetadataCoverage:true,
  consentVerified:true,reconciliationPending:false,unprocessedAudio:false,
  postReviewEdits:false,clinicalDigest:syntheticSourceDigest(source)};
 return {actor,capabilities,source,checkpoint,requestedEncounterId,requestedVersion};
};
const copy=structuredClone;
const evaluate=x=>assessSourceAuthority(x);
const fails=(o,code)=>{const r=evaluate(o);assert.equal(r.status,'STOP');assert.equal(r.privilegedWriteAuthorized,false);
 assert.equal(r.resetAuthorized,false);if(code)assert.equal(r.code,code);return r};
const patch=(f,k,x)=>({...f,[k]:x});

test('current hosted source code is pinned and still has the fallback; this is NOT a fix',()=>{
 const src=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../supabase/functions/submit-audit-case/index.ts');
 const bytes=fs.readFileSync(src);
 const sha=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
 assert.equal(PINNED_MAIN,'064757d2a39ad4c04c60b0034a8b35756b8eb089');
 assert.equal(sha,PINNED_SUBMIT_BLOB);
 const text=bytes.toString('utf8');
 assert.match(text,/const fields=source\?\.fields\?\?body\?\.fields/);
 assert.match(text,/\.maybeSingle\(\)/);
 assert.match(text,/const admin=createClient\(SUPABASE_URL,SERVICE_KEY/);
 assert.match(text,/if\(existing&&existing\.status!=='pending'\)return json\(\{error:'ALREADY_REVIEWED'/);
});
test('perfect synthetic source and checkpoint yield PROVISIONAL only, never privileged write',()=>{
 const out=evaluate(fixture());
 assert.equal(out.status,'PROVISIONAL_SOURCE_MATCH');
 assert.equal(out.code,'ATOMIC_SERVER_AUTHORIZATION_NOT_IMPLEMENTED');
 assert.equal(out.privilegedWriteAuthorized,false);
 assert.equal(out.resetAuthorized,false);
});
test('no authenticated server-verified actor must STOP',()=>{
 for(const a of [null,{},patch(fixture().actor,'authenticated',false),
  patch(fixture().actor,'serverVerified',false)]){
  fails(patch(fixture(),'actor',a),'TRUSTED_ACTOR_REQUIRED');
 }
});
test('capability, tenant and active clinical privileges are mandatory',()=>{
 const cases=[
  {verifiedByServer:false},{userId:'different-doctor'},{tenantId:'other-clinic'},
  {accessStatus:'inactive'},{clinicalAccess:false},{auditSubmit:false}
 ];
 for(const x of cases)fails(patch(fixture(),'capabilities',{...fixture().capabilities,...x}),
  'CAPABILITY_OR_TENANT_DENIED');
});
test('a null, missing or inaccessible source is always STOP, no fallback to client fields',()=>{
 for(const s of [undefined,null,{}]){
  const f={...fixture(),source:s,clientFields:{hda:'FAKE INJECTED TEXT'}};
  fails(f,'AUTHORITATIVE_SOURCE_MISSING');
 }
});
test('source identity must be bound to requested encounter, physician and tenant',()=>{
 const bad=[
  [{encounter_id:'another-encounter'},'SOURCE_ID_MISMATCH'],
  [{user_id:'doctor-fake-2'},'SOURCE_OWNER_OR_TENANT_MISMATCH'],
  [{tenant_id:'tenant-fake-2'},'SOURCE_OWNER_OR_TENANT_MISMATCH'],
  [{tenant_id:null},'SOURCE_OWNER_OR_TENANT_MISMATCH']
 ];
 for(const [change,code] of bad){const f=fixture();f.source={...f.source,...change};fails(f,code)}
});
test('no tenant field in current source select is not accepted by the proposed contract',()=>{
 const f=fixture();delete f.source.tenant_id;fails(f,'SOURCE_OWNER_OR_TENANT_MISMATCH');
});
test('source must be ready_for_audit with a strictly positive matching sync_version',()=>{
 for(const [key,val,code] of [
  ['encounter_state','draft','SOURCE_NOT_READY'],
  ['sync_version',0,'SOURCE_VERSION_MISMATCH'],
  ['sync_version',8,'SOURCE_VERSION_MISMATCH'],
  ['sync_version',7.1,'SOURCE_VERSION_MISMATCH']
 ]){
  const f=fixture();f.source[key]=val;fails(f,code);
 }
 const f=fixture();f.requestedVersion=8;fails(f,'SOURCE_VERSION_MISMATCH');
});
test('unmapped field, missing known field or invalid payload fails closed',()=>{
 const cases=[
  s=>{s.fields.additional_clinical_note='unknown'},
  s=>{delete s.fields.alergias},
  s=>{s.fields.hda=null},
  s=>{s.processing_meta=null},
  s=>{s.protocol_usage='string'},
 ];
 for(const change of cases){
  const f=fixture();change(f.source);fails(f,'CLINICAL_SOURCE_SCOPE_UNVERIFIED');
 }
});
test('missing authoritative checkpoint, false consent and unsafe flags all STOP',()=>{
 const changes=[
  {verifiedByServer:false},{durable:false},{status:'local-only'},
  {ownerUserId:'other-doctor'},{tenantId:'other-clinic'},
  {syncVersion:6},{completeFieldCoverage:false},{completeMetadataCoverage:false},
  {consentVerified:false},{reconciliationPending:true},{unprocessedAudio:true},
  {postReviewEdits:true},{clinicalDigest:'sha256:'+'0'.repeat(64)}
 ];
 for(const change of changes){
  const f=fixture();f.checkpoint={...f.checkpoint,...change};
  const code=Object.hasOwn(change,'clinicalDigest')?'CHECKPOINT_CLINICAL_CONTENT_MISMATCH':
   'DURABLE_CHECKPOINT_OR_CONSENT_UNVERIFIED';
  fails(f,code);
 }
});
test('edits after checkpoint invalidate source contents, even when version is unchanged',()=>{
 for(const change of [
  s=>{s.fields.hda+=' ADENDO SINTÉTICO'},
  s=>{s.fields.prescricao+=' OUTRA PRESCRIÇÃO'},
  s=>{s.processing_meta.radar.answered.push('new-answer')},
  s=>{s.protocol_usage.push({protocol:'new-protocol',version:2})},
 ]){
  const f=fixture();change(f.source);fails(f,'CHECKPOINT_CLINICAL_CONTENT_MISMATCH');
 }
});
test('field insertion order is deterministic, but whitespace is a clinical edit',()=>{
 const f=fixture(),d=syntheticSourceDigest(f.source);
 f.source.fields=Object.fromEntries(Object.entries(f.source.fields).reverse());
 assert.equal(syntheticSourceDigest(f.source),d);
 f.source.fields.hda+=' ';
 assert.notEqual(syntheticSourceDigest(f.source),d);
});
test('already reviewed/locked, cross-tenant, cross-user or stale pending audit is terminal',()=>{
 const f=fixture();
 const base={source_consultation_id:f.requestedEncounterId,tenant_id:f.actor.tenantId,
  submitted_by:f.actor.userId,source_sync_version:7,status:'pending'};
 assert.equal(evaluate({...f,existingAudit:base}).status,'PROVISIONAL_SOURCE_MATCH');
 for(const [change,code] of [
  [{status:'reviewed'},'IMMUTABLE_AUDIT_ALREADY_REVIEWED'],
  [{status:'locked'},'IMMUTABLE_AUDIT_ALREADY_REVIEWED'],
  [{tenant_id:'other-clinic'},'EXISTING_AUDIT_SCOPE_MISMATCH'],
  [{submitted_by:'other-doctor'},'EXISTING_AUDIT_SCOPE_MISMATCH'],
  [{source_consultation_id:'other-encounter'},'EXISTING_AUDIT_SCOPE_MISMATCH'],
  [{source_sync_version:6},'EXISTING_AUDIT_VERSION_MISMATCH']
 ]){
  fails({...fixture(),existingAudit:{...base,...change}},code);
 }
});
test('client-owned fields and metadata cannot override trusted server source',()=>{
 const f=fixture();const before=evaluate(f);
 const changed={...f,
  body:{fields:{hda:'ATTACKER SUPPLIED VALUE'},core_context:{tenant_id:'other-clinic'}},
  clientFields:{hda:'ATTACKER SUPPLIED VALUE'},clientUserId:'other-doctor'};
 const after=evaluate(changed);
 assert.deepEqual(after,before);
 assert.equal(after.privilegedWriteAuthorized,false);
});
test('hypothetical account concurrent source change between check and write never implies write permission',()=>{
 const f=fixture();
 const first=evaluate(f);
 assert.equal(first.privilegedWriteAuthorized,false);
 f.source.sync_version++;
 fails(f,'SOURCE_VERSION_MISMATCH');
});
test('unsafe circular/getter payload fails closed without emitting clinical data',()=>{
 const f=fixture();f.source.processing_meta.circular=f.source.processing_meta;
 fails(f,'CLINICAL_SOURCE_SCOPE_UNVERIFIED');
 const g=fixture();Object.defineProperty(g.source.fields,'hda',{enumerable:true,get(){throw Error('getter')}});
 fails(g,'SOURCE_AUTHORITY_EVALUATION_FAILED');
});
test('untrusted or malformed requested source identity cannot authorize anything',()=>{
 for(const bad of [
  {requestedEncounterId:''},{requestedVersion:0},{requestedVersion:7.2},
  {requestedEncounterId:null}
 ])fails({...fixture(),...bad},'SOURCE_REQUEST_INVALID');
});
test('all outputs have false privilegedWriteAuthorized and resetAuthorized',()=>{
 const base=fixture();const candidates=[
  base,{...base,source:null},{...base,requestedVersion:8},
  {...base,actor:{...base.actor,authenticated:false}},
  {...base,checkpoint:{...base.checkpoint,consentVerified:false}}
 ];
 for(const c of candidates){const result=evaluate(c);assert.equal(result.privilegedWriteAuthorized,false);
 assert.equal(result.resetAuthorized,false);
 assert.ok(['STOP','PROVISIONAL_SOURCE_MATCH'].includes(result.status))}
});
