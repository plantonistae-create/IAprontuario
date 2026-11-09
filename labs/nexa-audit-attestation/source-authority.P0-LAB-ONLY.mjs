/* NEXA P0: hypothetical authority preflight. Offline fixtures only.
 * No exported function can authorize an audit write or reset.
 * This module is NEVER imported by any hosted or browser code. */
import {createHash} from 'node:crypto';

export const PINNED_MAIN='064757d2a39ad4c04c60b0034a8b35756b8eb089';
export const PINNED_SUBMIT_BLOB='7ae2e5f62e6015847db48f39afb8df91f8667725';
const KNOWN_FIELDS=Object.freeze([
 'alergias','antecedentes','comorbidades','conduta','exame_fisico',
 'exames_sugeridos','hda','hipotese_diagnostica','medicacoes',
 'orientacoes_alta','prescricao','queixa_principal','sinais_vitais',
 'sugestoes_perguntas',
].sort());
const id=x=>typeof x==='string'&&x.length>=3&&x.length<=128&&x.trim()===x&&!/[\u0000-\u001f]/.test(x);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,names)=>obj(x)&&Object.keys(x).sort().join('|')===[...names].sort().join('|');
const stop=(code)=>Object.freeze({status:'STOP',code,privilegedWriteAuthorized:false,resetAuthorized:false});
function canon(value,seen=new WeakSet(),depth=0){
 if(depth>20)throw Error('STRUCTURE_DEPTH_EXCEEDED');
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){
   if(!Number.isSafeInteger(value))throw Error('UNSAFE_NUMBER');
   return JSON.stringify(value);
 }
 if(typeof value!=='object'||seen.has(value))throw Error('NONCANONICAL_DATA');
 seen.add(value);let output;
 if(Array.isArray(value)){
   if(value.length>1000)throw Error('ARRAY_TOO_LARGE');
   output='['+value.map(x=>canon(x,seen,depth+1)).join(',')+']';
 }else if(obj(value)){
   const names=Object.keys(value).sort();
   if(names.length>500||names.some(x=>['__proto__','constructor','prototype'].includes(x)))throw Error('INVALID_OBJECT_KEY');
   output='{'+names.map(key=>{
     const descriptor=Object.getOwnPropertyDescriptor(value,key);
     if(!descriptor||!Object.hasOwn(descriptor,'value'))throw Error('ACCESSOR_NOT_ALLOWED');
     return JSON.stringify(key)+':'+canon(descriptor.value,seen,depth+1);
   }).join(',')+'}';
 }else throw Error('NONCANONICAL_DATA');
 seen.delete(value);return output;
}
export function syntheticSourceDigest(source){
 if(!obj(source)||!exact(source.fields,KNOWN_FIELDS)||
    !KNOWN_FIELDS.every(key=>typeof source.fields[key]==='string')||
    !obj(source.processing_meta)||!Array.isArray(source.protocol_usage))
  throw Error('CLINICAL_PAYLOAD_INCOMPLETE');
 const payload={fields:source.fields,processing_meta:source.processing_meta,protocol_usage:source.protocol_usage};
 const serialized=canon(payload);
 if(Buffer.byteLength(serialized,'utf8')>262144)throw Error('CLINICAL_PAYLOAD_OVERSIZE');
 return 'sha256:'+createHash('sha256').update(serialized,'utf8').digest('hex');
}

/**
 * All objects except requestedEncounterId and requestedVersion must be
 * fetched independently from trusted server-side providers, never request JSON.
 * PROVISIONAL_MATCH deliberately cannot authorize privileged writes.
 */
export function assessSourceAuthority({
  actor,capabilities,source,checkpoint,existingAudit=null,
  requestedEncounterId,requestedVersion
}={}){
 try {
  if(!obj(actor)||actor.authenticated!==true||actor.serverVerified!==true||
     !id(actor.userId)||!id(actor.tenantId))return stop('TRUSTED_ACTOR_REQUIRED');
  if(!obj(capabilities)||capabilities.verifiedByServer!==true||
     capabilities.userId!==actor.userId||capabilities.tenantId!==actor.tenantId||
     capabilities.accessStatus!=='active'||capabilities.clinicalAccess!==true||
     capabilities.auditSubmit!==true)return stop('CAPABILITY_OR_TENANT_DENIED');
  if(!id(requestedEncounterId)||!Number.isSafeInteger(requestedVersion)||requestedVersion<1)
    return stop('SOURCE_REQUEST_INVALID');
  if(!obj(source))return stop('AUTHORITATIVE_SOURCE_MISSING');
  if(source.encounter_id!==requestedEncounterId)return stop('SOURCE_ID_MISMATCH');
  if(!id(source.user_id)||!id(source.tenant_id)||
     source.user_id!==actor.userId||source.tenant_id!==actor.tenantId)
    return stop('SOURCE_OWNER_OR_TENANT_MISMATCH');
  if(source.encounter_state!=='ready_for_audit')return stop('SOURCE_NOT_READY');
  if(!Number.isSafeInteger(source.sync_version)||source.sync_version<1||
     source.sync_version!==requestedVersion)return stop('SOURCE_VERSION_MISMATCH');
  let sourceDigest;
  try{sourceDigest=syntheticSourceDigest(source)}
  catch{return stop('CLINICAL_SOURCE_SCOPE_UNVERIFIED')}
  // A local or client-declared checkpoint is insufficient for a privileged write.
  if(!obj(checkpoint)||checkpoint.verifiedByServer!==true||
     checkpoint.durable!==true||checkpoint.status!=='confirmed'||
     checkpoint.encounterId!==requestedEncounterId||
     checkpoint.ownerUserId!==actor.userId||checkpoint.tenantId!==actor.tenantId||
     checkpoint.syncVersion!==source.sync_version||
     checkpoint.completeFieldCoverage!==true||
     checkpoint.completeMetadataCoverage!==true||
     checkpoint.consentVerified!==true||
     checkpoint.reconciliationPending!==false||
     checkpoint.unprocessedAudio!==false||
     checkpoint.postReviewEdits!==false)
    return stop('DURABLE_CHECKPOINT_OR_CONSENT_UNVERIFIED');
  if(checkpoint.clinicalDigest!==sourceDigest)return stop('CHECKPOINT_CLINICAL_CONTENT_MISMATCH');
  if(existingAudit!==null){
    if(!obj(existingAudit)||existingAudit.source_consultation_id!==requestedEncounterId||
       existingAudit.tenant_id!==actor.tenantId||
       existingAudit.submitted_by!==actor.userId)
      return stop('EXISTING_AUDIT_SCOPE_MISMATCH');
    if(existingAudit.status!=='pending')return stop('IMMUTABLE_AUDIT_ALREADY_REVIEWED');
    if(existingAudit.source_sync_version!==source.sync_version)
      return stop('EXISTING_AUDIT_VERSION_MISMATCH');
  }
  // Time-of-check/time-of-use and multi-tenant DB constraints are NOT proven.
  // Require a fresh authenticated, durable, transactional check before privileged write.
  return Object.freeze({
    status:'PROVISIONAL_SOURCE_MATCH',
    code:'ATOMIC_SERVER_AUTHORIZATION_NOT_IMPLEMENTED',
    privilegedWriteAuthorized:false,
    resetAuthorized:false
  });
 }catch{return stop('SOURCE_AUTHORITY_EVALUATION_FAILED')}
}