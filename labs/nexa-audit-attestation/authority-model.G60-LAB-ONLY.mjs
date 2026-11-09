/* G60 SYNTHETIC MODEL ONLY. Not imported by NEXA. Never authorizes UI reset. */
import {createHash, createPublicKey, randomUUID, sign, verify} from 'node:crypto';

export const ENVELOPE_SCHEMA='nexa.g60.synthetic-clinical-envelope.v1';
export const PROOF_SCHEMA='nexa.g60.synthetic-reset-decision.v1';
export const SECTIONS=Object.freeze([
  'audit_context','clinical_plan','consent','destination','fields',
  'hypothesis_review','medication_review','processing_meta','protocol_usage',
  'radar_review','supplemental_clinical_data','transcription',
].sort());
export const FIELDS=Object.freeze([
  'alergias','antecedentes','comorbidades','conduta','exame_fisico','exames_sugeridos',
  'hda','hipotese_diagnostica','medicacoes','orientacoes_alta','prescricao',
  'queixa_principal','sinais_vitais','sugestoes_perguntas',
].sort());
const CLAIMS=Object.freeze([
  'schema','issuer','audience','key_id','actor_id','tenant_id','session_id',
  'encounter_id','audit_case_id','source_version','audit_version','clinical_digest',
  'consent_reference','nonce','issued_at','expires_at','purpose',
].sort());
const isRecord=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
const exact=(obj,keys)=>isRecord(obj)&&Object.keys(obj).sort().join('\u0000')===keys.join('\u0000');
const nonempty=s=>typeof s==='string'&&s.length>2&&s.length<=160&&s.trim()===s&&!/[\u0000-\u001f]/.test(s);
const stop=code=>Object.freeze({status:'STOP',code,resetAuthorized:false});
function canonical(value, seen=new WeakSet(),depth=0){
  if(depth>24)throw Error('STRUCTURE_DEPTH_INVALID');
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number') {
    if(!Number.isFinite(value)||!Number.isSafeInteger(value))throw Error('UNSAFE_NUMBER');
    return JSON.stringify(value);
  }
  if(typeof value!=='object'||seen.has(value))throw Error('NONCANONICAL_VALUE');
  seen.add(value);
  let result;
  if(Array.isArray(value)){
    if(value.length>1000)throw Error('ARRAY_TOO_LARGE');
    result='['+value.map(v=>canonical(v,seen,depth+1)).join(',')+']';
  }else if(isRecord(value)){
    const keys=Object.keys(value).sort();
    if(keys.length>500||keys.some(k=>['__proto__','constructor','prototype'].includes(k)))throw Error('INVALID_OBJECT_KEY');
    result='{'+keys.map(k=>{
      const descriptor=Object.getOwnPropertyDescriptor(value,k);
      if(!descriptor||!Object.hasOwn(descriptor,'value'))throw Error('ACCESSOR_DISALLOWED');
      return JSON.stringify(k)+':'+canonical(descriptor.value,seen,depth+1);
    }).join(',')+'}';
  }else throw Error('NONCANONICAL_VALUE');
  seen.delete(value);
  return result;
}
export function canonicalEnvelope(e){
  if(!exact(e,['schema','sections'])||e.schema!==ENVELOPE_SCHEMA||
     !exact(e.sections,SECTIONS)||!exact(e.sections.fields,FIELDS))
    throw Error('CLINICAL_SCOPE_INCOMPLETE');
  for(const k of FIELDS)if(typeof e.sections.fields[k]!=='string')throw Error('CLINICAL_FIELD_TYPE');
  for(const k of SECTIONS){
    const v=e.sections[k];
    if(k==='protocol_usage'){
      if(!Array.isArray(v))throw Error('SECTION_TYPE_INVALID');
    }else if(!isRecord(v))throw Error('SECTION_TYPE_INVALID');
  }
  for(const k of ['audit_context','clinical_plan','consent','hypothesis_review','processing_meta']){
    if(Object.keys(e.sections[k]).length===0)throw Error('CRITICAL_SECTION_EMPTY');
  }
  const serialized=canonical(e);
  if(Buffer.byteLength(serialized,'utf8')>262144)throw Error('CLINICAL_SCOPE_OVERSIZE');
  return serialized;
}
export function clinicalDigest(e){
  return 'sha256:'+createHash('sha256').update(canonicalEnvelope(e),'utf8').digest('hex');
}
const clone=o=>structuredClone(o);
function validatedClaims(c){
  if(!exact(c,CLAIMS))throw Error('PROOF_SCHEMA_INVALID');
  if(c.schema!==PROOF_SCHEMA||c.purpose!=='SIMULATION_ONLY'||!CLAIMS.every(k=>
      ['source_version','audit_version','issued_at','expires_at'].includes(k)||
      nonempty(c[k]))||
     !['source_version','audit_version'].every(k=>Number.isSafeInteger(c[k])&&c[k]>0)||
     !['issued_at','expires_at'].every(k=>Number.isSafeInteger(c[k])&&c[k]>=0)||
     !/^sha256:[a-f0-9]{64}$/.test(c.clinical_digest))
     throw Error('PROOF_CLAIMS_INVALID');
  return canonical(c);
}
function identityMatches(a,r){
  return isRecord(a)&&a.authenticated===true&&
    [a.userId,a.tenantId,a.sessionId].every(nonempty)&&
    a.userId===r.ownerId&&a.tenantId===r.tenantId;
}
function safeState(r){
  return r?.sourceVersion>0&&Number.isSafeInteger(r.sourceVersion)&&
    Number.isSafeInteger(r.auditVersion)&&r.auditVersion>0&&
    r.reviewedSourceVersion===r.sourceVersion&&
    r.auditStatus==='reviewed'&&r.auditState==='locked'&&
    r.syncState==='synced'&&r.consentState==='verified'&&
    r.checkpointVerified===true&&r.recordingActive===false&&
    r.unprocessedAudio===false&&r.pendingEdits===false&&
    r.reconciliationPending===false&&r.addendumPending===false;
}
function currentMatches(client,r){
  if(!isRecord(client)||client.encounterId!==r.encounterId||
     client.checkpointVerified!==true||client.consentConfirmed!==true||
     client.pendingEdits!==false||client.reconciliationPending!==false||
     client.addendumPending!==false||client.recordingActive!==false||
     client.unprocessedAudio!==false||client.online!==true||
     client.sourceVersion!==r.sourceVersion)return false;
  try{
    const displayed=canonicalEnvelope(client.visibleEnvelope);
    const checkpoint=canonicalEnvelope(client.checkpointEnvelope);
    return displayed===checkpoint&&
      clinicalDigest(client.visibleEnvelope)===clinicalDigest(r.sourceEnvelope)&&
      clinicalDigest(client.checkpointEnvelope)===clinicalDigest(r.reviewedEnvelope);
  }catch{return false}
}

/**
 * A deterministic, single-process authority SIMULATION. Key is test-generated,
 * concurrency is only one JS event loop, nonces are memory-only, and data are
 * synthetic. Neither issue nor redeem may authorize a NEXA reset.
 */
export function createSyntheticAuthority({privateKey, publicKey, issuer='synthetic-audit',audience='synthetic-reset',
  keyId='g60-synthetic-key',clock=()=>Date.now()}={}){
  if(!privateKey||!publicKey||![issuer,audience,keyId].every(nonempty))
    throw Error('SYNTHETIC_KEYS_REQUIRED');
  const trustedPublicKey=publicKey?.type==='public'?publicKey:createPublicKey(publicKey);
  if(trustedPublicKey.asymmetricKeyType!=='ed25519')throw Error('INVALID_TEST_KEY');
  const records=new Map(),consumed=new Set();
  function seed(input){
    if(!input||![input.encounterId,input.ownerId,input.tenantId,input.auditCaseId,input.consentReference].every(nonempty))
      throw Error('SYNTHETIC_CASE_IDENTITY_REQUIRED');
    canonicalEnvelope(input.sourceEnvelope);canonicalEnvelope(input.reviewedEnvelope);
    records.set(input.encounterId,clone(input));
  }
  function revise(encounterId,changes){
    const original=records.get(encounterId);
    if(!original)throw Error('SYNTHETIC_CASE_NOT_FOUND');
    records.set(encounterId,{...clone(original),...clone(changes)});
  }
  function state(actor,client){
    if(!isRecord(client)||!nonempty(client.encounterId))return stop('CLIENT_CASE_MISSING');
    const r=records.get(client.encounterId);
    if(!r)return stop('CASE_NOT_FOUND');
    if(!identityMatches(actor,r))return stop('IDENTITY_OR_TENANT_DENIED');
    if(!safeState(r))return stop('SOURCE_OR_AUDIT_NOT_STABLE');
    if(!currentMatches(client,r))return stop('CLINICAL_VERSION_OR_CONSENT_MISMATCH');
    try{
      if(clinicalDigest(r.sourceEnvelope)!==clinicalDigest(r.reviewedEnvelope))
        return stop('REVIEWED_COPY_DIVERGENT');
    }catch{return stop('CLINICAL_SCOPE_INVALID')}
    return null;
  }
  function issue({actor,client}={}){
    const failed=state(actor,client);
    if(failed)return failed;
    const r=records.get(client.encounterId),issued=clock();
    if(!Number.isSafeInteger(issued)||issued<0)return stop('CLOCK_UNAVAILABLE');
    const claims={
      schema:PROOF_SCHEMA,issuer,audience,key_id:keyId,
      actor_id:actor.userId,tenant_id:actor.tenantId,session_id:actor.sessionId,
      encounter_id:r.encounterId,audit_case_id:r.auditCaseId,
      source_version:r.sourceVersion,audit_version:r.auditVersion,
      clinical_digest:clinicalDigest(r.reviewedEnvelope),
      consent_reference:r.consentReference,nonce:randomUUID(),
      issued_at:issued,expires_at:issued+15000,purpose:'SIMULATION_ONLY',
    };
    const payload=validatedClaims(claims);
    const signature=sign(null,Buffer.from(payload,'utf8'),privateKey).toString('base64url');
    return Object.freeze({status:'SYNTHETIC_PROOF_ISSUED',proof:{claims,signature},resetAuthorized:false});
  }
  function redeem({actor,client,proof}={}){
    if(!isRecord(proof)||!isRecord(proof.claims)||typeof proof.signature!=='string')
      return stop('PROOF_MISSING');
    let data;
    try{data=validatedClaims(proof.claims)}catch{return stop('PROOF_INVALID')}
    const c=proof.claims;
    if(c.issuer!==issuer||c.audience!==audience||c.key_id!==keyId)
      return stop('PROOF_TRUST_MISMATCH');
    let good;
    try{
      const signature=Buffer.from(proof.signature,'base64url');
      good=signature.length===64&&verify(null,Buffer.from(data,'utf8'),trustedPublicKey,signature);
    }catch{good=false}
    if(!good)return stop('SIGNATURE_INVALID');
    const now=clock();
    if(!Number.isSafeInteger(now)||now<c.issued_at||now>=c.expires_at||
       c.expires_at-c.issued_at!==15000)return stop('PROOF_EXPIRED_OR_CLOCK_INVALID');
    if(consumed.has(c.nonce))return stop('REPLAY_DENIED');
    const failed=state(actor,client);
    if(failed)return failed;
    const r=records.get(c.encounter_id);
    if(c.actor_id!==actor.userId||c.tenant_id!==actor.tenantId||
       c.session_id!==actor.sessionId||c.encounter_id!==client.encounterId||
       c.audit_case_id!==r.auditCaseId||c.source_version!==r.sourceVersion||
       c.audit_version!==r.auditVersion||c.consent_reference!==r.consentReference||
       c.clinical_digest!==clinicalDigest(r.reviewedEnvelope))return stop('PROOF_OR_STATE_DRIFT');
    // This is a single-process, memory-only analogue of an atomic claim.
    // A real implementation needs a durable, authenticated transaction.
    consumed.add(c.nonce);
    return Object.freeze({
      status:'SYNTHETIC_SINGLE_USE_REDEEMED',wouldPassInMemoryModel:true,
      resetAuthorized:false,code:'SERVER_TRANSACTION_NOT_IMPLEMENTED',
    });
  }
  return Object.freeze({seed,revise,issue,redeem});
}
