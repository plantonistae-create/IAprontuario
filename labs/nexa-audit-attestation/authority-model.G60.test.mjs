import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {clinicalDigest,canonicalEnvelope,createSyntheticAuthority,ENVELOPE_SCHEMA,FIELDS,SECTIONS} from './authority-model.G60-LAB-ONLY.mjs';

const clone=x=>structuredClone(x);
function envelope(){
 const fields=Object.fromEntries(FIELDS.map(k=>[k,'']));
 fields.queixa_principal='Queixa sintética';fields.hda='História inteiramente sintética.';
 fields.alergias='Não informadas no cenário sintético.';fields.prescricao='Conduta fictícia.';
 return {schema:ENVELOPE_SCHEMA,sections:{
   audit_context:{review_reason:'simulated-review',source:'test-only'},
   clinical_plan:{exams:['ECG sintético'],prescription:['Medicação fictícia'],conduct:'Observação'},
   consent:{recorded_at:'2026-11-09T13:00:00.000Z',scope:'test-only',withdrawn:false},
   destination:{outcome:'simulated-followup'},
   fields,
   hypothesis_review:{status:'reviewed',final:'Hipótese simulada',cid:'R07',alternatives:[]},
   medication_review:{allergies:['synthetic'],interactions:[],current:[]},
   processing_meta:{consultation_version:7,transcription_finished:true,frontend:'lab-only'},
   protocol_usage:[],
   radar_review:{provenance:'synthetic',ledger:{},items:[],uncertainties:[]},
   supplemental_clinical_data:{annotations:[],attachments:[],history:[]},
   transcription:{text:'Fala sintética concluída.',attribution:[{speaker:'clinician',confidence:'unknown'}]},
 }};
}
function scenario(){
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 let timestamp=1000000;
 const authority=createSyntheticAuthority({publicKey,privateKey,clock:()=>timestamp});
 const actor={authenticated:true,userId:'doctor-A',tenantId:'clinic-A',sessionId:'session-A'};
 const source=envelope(),reviewed=clone(source);
 const record={encounterId:'encounter-A',ownerId:'doctor-A',tenantId:'clinic-A',auditCaseId:'audit-A',consentReference:'consent-A',
   sourceVersion:7,reviewedSourceVersion:7,auditVersion:4,sourceEnvelope:source,reviewedEnvelope:reviewed,
   auditStatus:'reviewed',auditState:'locked',syncState:'synced',consentState:'verified',
   checkpointVerified:true,recordingActive:false,unprocessedAudio:false,
   pendingEdits:false,reconciliationPending:false,addendumPending:false};
 authority.seed(record);
 const client={encounterId:record.encounterId,sourceVersion:7,visibleEnvelope:clone(source),checkpointEnvelope:clone(source),
   checkpointVerified:true,consentConfirmed:true,pendingEdits:false,recordingActive:false,unprocessedAudio:false,
   reconciliationPending:false,addendumPending:false,online:true};
 return {authority,actor,client,record,setTime:t=>{timestamp=t},time:()=>timestamp};
}
const issue=f=>f.authority.issue({actor:f.actor,client:f.client});
const redeem=(f,proof,actor=f.actor,client=f.client)=>f.authority.redeem({actor,client,proof});
function stopped(out,code){
 assert.equal(out.status,'STOP');
 assert.equal(out.resetAuthorized,false);
 if(code)assert.equal(out.code,code);
}

test('G60 synthetic evidence never authorizes actual NEXA reset',()=>{
 const f=scenario(),p=issue(f);
 assert.equal(p.status,'SYNTHETIC_PROOF_ISSUED');assert.equal(p.resetAuthorized,false);
 const result=redeem(f,p.proof);
 assert.equal(result.status,'SYNTHETIC_SINGLE_USE_REDEEMED');
 assert.equal(result.wouldPassInMemoryModel,true);
 assert.equal(result.resetAuthorized,false);
 assert.equal(result.code,'SERVER_TRANSACTION_NOT_IMPLEMENTED');
});
test('clinical coverage manifest contains the complete hypothetical section list and 14 field names',()=>{
 const e=envelope();
 assert.equal(SECTIONS.length,12);assert.equal(FIELDS.length,14);
 assert.equal(typeof canonicalEnvelope(e),'string');
 assert.match(clinicalDigest(e),/^sha256:[a-f0-9]{64}$/);
});
test('missing clinical sections, unknown sections or dropped dynamic clinical field fail closed',()=>{
 const original=envelope();const omitted=clone(original);
 delete omitted.sections.medication_review;
 assert.throws(()=>clinicalDigest(omitted),/CLINICAL_SCOPE_INCOMPLETE/);
 const extra=clone(original);extra.sections.future_medical_field={flag:true};
 assert.throws(()=>clinicalDigest(extra),/CLINICAL_SCOPE_INCOMPLETE/);
 const field=clone(original);delete field.sections.fields.prescricao;
 assert.throws(()=>clinicalDigest(field),/CLINICAL_SCOPE_INCOMPLETE/);
 const altered=clone(original);altered.sections.fields.new_field='not allowed silently';
 assert.throws(()=>clinicalDigest(altered),/CLINICAL_SCOPE_INCOMPLETE/);
});
test('hypothesis, medication, protocol, consent, physical fields and radar changes enter fingerprint',()=>{
 const original=envelope(),base=clinicalDigest(original);
 const alterations=[
  e=>{e.sections.medication_review.allergies.push('Alergia adicionada')},
  e=>{e.sections.clinical_plan.prescription.push('Nova prescrição fictícia')},
  e=>{e.sections.hypothesis_review.final='Outra hipótese sintética'},
  e=>{e.sections.fields.exame_fisico+='Alterado'},
  e=>{e.sections.fields.sinais_vitais='PA sintética'},
  e=>{e.sections.radar_review.uncertainties.push('Dúvida sintética')},
  e=>{e.sections.protocol_usage.push({code:'synthetic-protocol'})},
  e=>{e.sections.consent.withdrawn=true},
  e=>{e.sections.transcription.text+=' mais texto'},
  e=>{e.sections.supplemental_clinical_data.attachments.push({name:'fake-image'})},
  e=>{e.sections.destination.outcome='outro destino'},
  e=>{e.sections.processing_meta.consultation_version=8}
 ];
 for(const edit of alterations){const next=clone(original);edit(next);assert.notEqual(clinicalDigest(next),base)}
});
test('canonical fingerprint stable across key insertion order; whitespace edits remain different',()=>{
 const e=envelope();
 const reordered=clone(e);reordered.sections=Object.fromEntries(Object.entries(reordered.sections).reverse());
 assert.equal(clinicalDigest(reordered),clinicalDigest(e));
 reordered.sections.fields.hda+=' ';
 assert.notEqual(clinicalDigest(reordered),clinicalDigest(e));
});
test('invalid object, cycles, getters and unsafe numeric values are rejected',()=>{
 const invalid=envelope();invalid.sections.processing_meta.extra=Number.NaN;
 assert.throws(()=>clinicalDigest(invalid),/UNSAFE_NUMBER/);
 const cyc=envelope();cyc.sections.processing_meta.loop=cyc.sections.processing_meta;
 assert.throws(()=>clinicalDigest(cyc),/NONCANONICAL_VALUE/);
 const getter=envelope();Object.defineProperty(getter.sections.processing_meta,'hidden',{enumerable:true,get(){return 'sneaky'}});
 assert.throws(()=>clinicalDigest(getter),/ACCESSOR_DISALLOWED/);
 const polluted=envelope();Object.defineProperty(polluted.sections.processing_meta,'__proto__',{enumerable:true,value:'unsafe'});
 assert.throws(()=>clinicalDigest(polluted),/INVALID_OBJECT_KEY/);
});
test('auth, user, tenant, session identity and case identity are mandatory',()=>{
 const f=scenario();
 stopped(f.authority.issue({actor:{...f.actor,authenticated:false},client:f.client}),'IDENTITY_OR_TENANT_DENIED');
 stopped(f.authority.issue({actor:{...f.actor,userId:'doctor-B'},client:f.client}),'IDENTITY_OR_TENANT_DENIED');
 stopped(f.authority.issue({actor:{...f.actor,tenantId:'clinic-B'},client:f.client}),'IDENTITY_OR_TENANT_DENIED');
 stopped(f.authority.issue({actor:f.actor,client:{...f.client,encounterId:'missing-encounter'}}),'CASE_NOT_FOUND');
 const p=issue(f);
 stopped(redeem(f,p.proof,{...f.actor,sessionId:'session-B'}),'PROOF_OR_STATE_DRIFT');
});
test('client must hold a durable checkpoint matching visible and reviewed version',()=>{
 const f=scenario();
 stopped(f.authority.issue({actor:f.actor,client:{...f.client,checkpointVerified:false}}),'CLINICAL_VERSION_OR_CONSENT_MISMATCH');
 const next=clone(f.client);next.visibleEnvelope.sections.fields.hda+=' adendo';
 stopped(f.authority.issue({actor:f.actor,client:next}),'CLINICAL_VERSION_OR_CONSENT_MISMATCH');
 const other=clone(f.client);other.sourceVersion=8;
 stopped(f.authority.issue({actor:f.actor,client:other}),'CLINICAL_VERSION_OR_CONSENT_MISMATCH');
});
test('a post-review medical edit on the server blocks issuance',()=>{
 const f=scenario();const source=clone(f.record.sourceEnvelope);
 source.sections.fields.hda+=' servidor mudou';
 f.authority.revise(f.record.encounterId,{sourceEnvelope:source});
 stopped(issue(f),'CLINICAL_VERSION_OR_CONSENT_MISMATCH');
});
test('source version advancing beyond reviewed source blocks issue and redeem',()=>{
 const f=scenario(),p=issue(f);
 f.authority.revise(f.record.encounterId,{sourceVersion:8});
 stopped(redeem(f,p.proof),'SOURCE_OR_AUDIT_NOT_STABLE');
});
test('concurrent review status, audit case identity or audit revision change blocks old proof',()=>{
 const cases=[
  {auditStatus:'reopened'}, {auditCaseId:'new-audit'}, {auditVersion:5},
  {auditState:'sending'},
 ];
 for(const change of cases){
  const f=scenario(),p=issue(f);
  f.authority.revise(f.record.encounterId,change);
  const out=redeem(f,p.proof);
  stopped(out);
 }
});
test('consent withdrawal and explicit addendum/reconciliation stop issue and redeem',()=>{
 const variants=[{consentState:'withdrawn'}, {addendumPending:true}, {reconciliationPending:true}, {pendingEdits:true}];
 for(const change of variants){
  const f=scenario(),p=issue(f);
  f.authority.revise(f.record.encounterId,change);
  stopped(redeem(f,p.proof),'SOURCE_OR_AUDIT_NOT_STABLE');
  stopped(issue(f),'SOURCE_OR_AUDIT_NOT_STABLE');
 }
});
test('client consent, audio, recording, offline, reconciliation and adendo failures block',()=>{
 const changes=[
  {consentConfirmed:false},{recordingActive:true},{unprocessedAudio:true},
  {reconciliationPending:true},{addendumPending:true},{pendingEdits:true},{online:false},
 ];
 for(const change of changes){
  const f=scenario(),p=issue(f);
  stopped(redeem(f,p.proof,f.actor,{...f.client,...change}),'CLINICAL_VERSION_OR_CONSENT_MISMATCH');
 }
});
test('fake proof, signature changes and issuer/purpose tampering all fail closed',()=>{
 const f=scenario(),p=issue(f);
 stopped(redeem(f,{claims:p.proof.claims,signature:'A'.repeat(86)}),'SIGNATURE_INVALID');
 stopped(redeem(f,{claims:{...p.proof.claims,issuer:'evil-lab'},signature:p.proof.signature}),'PROOF_TRUST_MISMATCH');
 stopped(redeem(f,{claims:{...p.proof.claims,purpose:'PRODUCTION'},signature:p.proof.signature}),'PROOF_INVALID');
 stopped(redeem(f,null),'PROOF_MISSING');
});
test('freshness rejects expired and backwards timestamps and no proof is spent',()=>{
 const f=scenario(),p=issue(f);
 f.setTime(f.time()+15000);
 stopped(redeem(f,p.proof),'PROOF_EXPIRED_OR_CLOCK_INVALID');
 f.setTime(999999);
 stopped(redeem(f,p.proof),'PROOF_EXPIRED_OR_CLOCK_INVALID');
});
test('one-time redemption denies repeated use',()=>{
 const f=scenario(),p=issue(f);
 const first=redeem(f,p.proof),second=redeem(f,p.proof);
 assert.equal(first.status,'SYNTHETIC_SINGLE_USE_REDEEMED');
 stopped(second,'REPLAY_DENIED');
});
test('simulated concurrent requests redeem at most once (single-process only)',async()=>{
 const f=scenario(),p=issue(f);
 const results=await Promise.all(Array.from({length:12},()=>Promise.resolve().then(()=>redeem(f,p.proof))));
 assert.equal(results.filter(x=>x.status==='SYNTHETIC_SINGLE_USE_REDEEMED').length,1);
 assert.equal(results.filter(x=>x.code==='REPLAY_DENIED').length,11);
 assert.ok(results.every(x=>x.resetAuthorized===false));
});
test('no cross-encounter reuse of an otherwise valid proof',()=>{
 const f=scenario(),p=issue(f);
 const other=clone(f.client);other.encounterId='encounter-B';
 stopped(redeem(f,p.proof,f.actor,other),'CASE_NOT_FOUND');
});
test('after reset trial, audited record itself was never mutated by the model',()=>{
 const f=scenario(),snapshot=clone(f.record),p=issue(f);
 assert.equal(redeem(f,p.proof).resetAuthorized,false);
 const again=issue(f);
 assert.equal(again.status,'SYNTHETIC_PROOF_ISSUED','test model never mutates clinical/audit source state');
 assert.deepEqual(snapshot,f.record);
});
