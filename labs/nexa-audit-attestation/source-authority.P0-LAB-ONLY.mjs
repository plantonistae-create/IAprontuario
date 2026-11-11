/* NEXA P0 Gate C: owner-only authority contract. OFFLINE FIXTURES ONLY.
 * Never imported by hosted/browser code. No privileged write or reset authorization.
 * The verified server checkpoint specified here DOES NOT YET EXIST in production. */
import {createHash} from 'node:crypto';

export const PINNED_MAIN='064757d2a39ad4c04c60b0034a8b35756b8eb089';
export const PINNED_SUBMIT_BLOB='7ae2e5f62e6015847db48f39afb8df91f8667725';
const id=x=>typeof x==='string'&&x.length>=3&&x.length<=128&&x.trim()===x&&!/[\u0000-\u001f]/.test(x);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const stop=code=>Object.freeze({status:'STOP',code,privilegedWriteAuthorized:false,resetAuthorized:false});

/* Canonicalizes complete persisted JSON, including dynamic clinical fields.
 * Not RFC 8785. Both ends MUST use the same versioned algorithm and byte limits. */
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
   if(names.length>500||names.some(x=>['__proto__','constructor','prototype'].includes(x)))
     throw Error('INVALID_OBJECT_KEY');
   output='{'+names.map(key=>{
     const descriptor=Object.getOwnPropertyDescriptor(value,key);
     if(!descriptor||!Object.hasOwn(descriptor,'value'))throw Error('ACCESSOR_NOT_ALLOWED');
     return JSON.stringify(key)+':'+canon(descriptor.value,seen,depth+1);
   }).join(',')+'}';
 }else throw Error('NONCANONICAL_DATA');
 seen.delete(value);return output;
}
export function syntheticSourceDigest(source){
 if(!obj(source)||!obj(source.fields)||Object.keys(source.fields).length===0||
    !obj(source.processing_meta)||!Array.isArray(source.protocol_usage)||
    !id(source.consent_recorded_at))
   throw Error('CLINICAL_PAYLOAD_INCOMPLETE');
 // Include the complete server-persisted JSON and recorded consent timestamp.
 // A timestamp alone DOES NOT prove consent scope (external AI + audit).
 const payload={fields:source.fields,processing_meta:source.processing_meta,
   protocol_usage:source.protocol_usage,consent_recorded_at:source.consent_recorded_at};
 const serialized=canon(payload);
 if(Buffer.byteLength(serialized,'utf8')>262144)throw Error('CLINICAL_PAYLOAD_OVERSIZE');
 return 'sha256:'+createHash('sha256').update(serialized,'utf8').digest('hex');
}

/** TRUST BOUNDARY: all objects except requestedEncounterId/requestedVersion
 * are server-queried attestations, NEVER request JSON or JWT user metadata.
 * activeClinicalAccessVerified is the trusted result of the actual access check
 * (including slot membership), NOT a new get_my_capabilities() column.
 * A simulated checkpoint is NEVER sufficient to authorize an actual write.
 */
export function assessSourceAuthority({
 actor,capabilities,source,checkpoint,existingAudit=null,
 requestedEncounterId,requestedVersion
}={}){
 try{
  if(!obj(actor)||actor.authenticated!==true||actor.serverVerified!==true||
     !id(actor.userId))return stop('TRUSTED_ACTOR_REQUIRED');
  if(!obj(capabilities)||capabilities.verifiedByServer!==true||
     capabilities.userId!==actor.userId||
     capabilities.accessStatus!=='active'||capabilities.clinicalAccess!==true||
     capabilities.activeClinicalAccessVerified!==true)
    return stop('ACTIVE_CLINICAL_ACCESS_DENIED');
  if(!id(requestedEncounterId)||!Number.isSafeInteger(requestedVersion)||requestedVersion<1)
    return stop('SOURCE_REQUEST_INVALID');
  if(!obj(source)||!id(source.id)||!id(source.encounter_id))
    return stop('AUTHORITATIVE_SOURCE_MISSING');
  if(source.encounter_id!==requestedEncounterId)return stop('SOURCE_ID_MISMATCH');
  if(!id(source.user_id)||source.user_id!==actor.userId)
    return stop('SOURCE_OWNER_MISMATCH');
  if(source.encounter_state!=='ready_for_audit')return stop('SOURCE_NOT_READY');
  if(!Number.isSafeInteger(source.sync_version)||source.sync_version<1||
     source.sync_version!==requestedVersion)return stop('SOURCE_VERSION_MISMATCH');
  if(!id(source.consent_recorded_at))return stop('CONSENT_SOURCE_MISSING');
  let sourceDigest;
  try{sourceDigest=syntheticSourceDigest(source)}
  catch{return stop('CLINICAL_SOURCE_SCOPE_UNVERIFIED')}
  // The current DDL has consent_recorded_at but no proved durable checkpoint
  // binding consent scope, clinical content, owner and sync_version.
  if(!obj(checkpoint)||checkpoint.verifiedByServer!==true||
     checkpoint.durable!==true||checkpoint.status!=='confirmed'||
     !id(checkpoint.serverReceiptId)||
     checkpoint.canonicalization!=='nexa-json-v1'||
     checkpoint.sourceRowId!==source.id||
     checkpoint.encounterId!==requestedEncounterId||
     checkpoint.ownerUserId!==actor.userId||
     checkpoint.syncVersion!==source.sync_version||
     checkpoint.snapshotVersion!=='final-v1'||
     checkpoint.consentEvidenceServerVerified!==true||
     checkpoint.consentRecordedAt!==source.consent_recorded_at||
     !Array.isArray(checkpoint.consentPurposes)||
     !['external_ai','audit'].every(p=>checkpoint.consentPurposes.includes(p))||
     checkpoint.reconciliationPending!==false||
     checkpoint.unprocessedAudio!==false||
     checkpoint.postReviewEdits!==false)
    return stop('DURABLE_CHECKPOINT_OR_CONSENT_UNVERIFIED');
  if(checkpoint.clinicalDigest!==sourceDigest)
    return stop('CHECKPOINT_CLINICAL_CONTENT_MISMATCH');
  if(existingAudit!==null){
    if(!obj(existingAudit)||existingAudit.source_consultation_id!==requestedEncounterId||
       existingAudit.submitted_by!==actor.userId)
      return stop('EXISTING_AUDIT_SCOPE_MISMATCH');
    if(existingAudit.status!=='pending')
      return stop('IMMUTABLE_AUDIT_ALREADY_REVIEWED');
    if(existingAudit.source_sync_version!==source.sync_version||
       existingAudit.snapshot_version!=='final-v1')
      return stop('EXISTING_AUDIT_VERSION_MISMATCH');
  }
  // No DB atomic recheck after AI. NEVER authorize service-role writes or locked reset.
  return Object.freeze({status:'PROVISIONAL_SOURCE_MATCH',
    code:'ATOMIC_SERVER_AUTHORIZATION_NOT_IMPLEMENTED',
    privilegedWriteAuthorized:false,resetAuthorized:false});
 }catch{return stop('SOURCE_AUTHORITY_EVALUATION_FAILED')}
}
