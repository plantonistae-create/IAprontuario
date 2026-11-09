import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import {assessOfflineReceipt, canonicalClaims, digestFields, FIELD_KEYS, SCHEMA} from './receipt-verifier.G59-LAB-ONLY.mjs';

const {publicKey, privateKey}=generateKeyPairSync('ed25519');
const {publicKey:wrongPublic}=generateKeyPairSync('ed25519');
const now=Date.parse('2026-11-09T14:00:00.000Z');
const fields=Object.fromEntries(FIELD_KEYS.map(key=>[key,'']));
fields.queixa_principal='Dor sintética';fields.hda='Sintoma sintético sem identificação pessoal.';fields.conduta='Reavaliação sintética.';
const trust={keyId:'offline-test-key-1',issuer:'test-authority',audience:'test-reset-proof',publicKeyPem:publicKey.export({type:'spki',format:'pem'}).toString()};
const claims={schema:SCHEMA,issuer:trust.issuer,audience:trust.audience,receipt_id:'synthetic-receipt',audit_case_id:'synthetic-audit',encounter_id:'synthetic-encounter',owner_user_id:'synthetic-clinician',tenant_id:'synthetic-tenant',source_sync_version:7,clinical_fields_digest:digestFields(fields),review_status:'reviewed',reviewed_at:'2026-11-09T13:55:00.000Z',issued_at:'2026-11-09T13:59:00.000Z',expires_at:'2026-11-09T14:02:00.000Z',reset_nonce:'synthetic-nonce-unique'};
const current={encounterId:claims.encounter_id,ownerUserId:claims.owner_user_id,tenantId:claims.tenant_id,expectedNonce:claims.reset_nonce,sourceSyncVersion:7,checkpointVerified:true,consentVerified:true,synced:true,online:true,recordingActive:false,unprocessedAudio:false,reconciliationPending:false,auditState:'locked',clinicalEditsPending:false,visibleFields:structuredClone(fields),checkpointFields:structuredClone(fields)};
const signed=(c=claims,priv=privateKey)=>({algorithm:'Ed25519',key_id:trust.keyId,claims:c,signature:sign(null,Buffer.from(canonicalClaims(c),'utf8'),priv).toString('base64url')});
const evaluate=(r=signed(),ctx=current,t=trust,timestamp=now)=>assessOfflineReceipt({receipt:r,current:ctx,trust:t,now:timestamp});
const withClaim=(name,value)=>signed({...claims,[name]:value});
const withCurrent=(k,v)=>({...current,[k]:v});
const blocked=(result,code)=>{assert.equal(result.resetAuthorized,false);assert.equal(result.status,'STOP');if(code)assert.equal(result.code,code)};

test('G59 genuine synthetic signed match is PROVISIONAL only and never authorizes reset',()=>{
 const x=evaluate();assert.equal(x.status,'PROVISIONAL_MATCH');assert.equal(x.code,'FRESH_SERVER_CONFIRMATION_REQUIRED');assert.equal(x.resetAuthorized,false);
});
test('signature tampering and wrong trusted key are rejected',()=>{
 blocked(evaluate({...signed(),signature:'A'.repeat(86)}),'SIGNATURE_INVALID');
 blocked(evaluate(signed(),current,{...trust,publicKeyPem:wrongPublic.export({type:'spki',format:'pem'}).toString()}),'SIGNATURE_INVALID');
 blocked(evaluate({...signed(),claims:{...claims,clinical_fields_digest:'sha256:'+'a'.repeat(64)}}),'SIGNATURE_INVALID');
});
test('client-supplied key ID, issuer and audience are never accepted as trust roots',()=>{
 blocked(evaluate({...signed(),key_id:'another-key'}),'RECEIPT_ENVELOPE_INVALID');
 blocked(evaluate(withClaim('issuer','fake-issuer')),'RECEIPT_CLAIMS_INVALID');
 blocked(evaluate(withClaim('audience','other-app')),'RECEIPT_CLAIMS_INVALID');
 blocked(evaluate(signed(),current,{...trust,publicKeyPem:''}),'TRUST_ROOT_MISSING');
});
test('source, owner, tenant and one-time nonce binding fail closed',()=>{
 for(const [key,val] of [['encounterId','other-encounter'],['ownerUserId','other-clinician'],['tenantId','other-tenant'],['expectedNonce','previous-nonce']])blocked(evaluate(signed(),withCurrent(key,val)),'IDENTITY_OR_NONCE_MISMATCH');
});
test('reviewed source sync version must match the local checkpoint',()=>{
 blocked(evaluate(signed(),withCurrent('sourceSyncVersion',8)),'SOURCE_VERSION_MISMATCH');
 blocked(evaluate(withClaim('source_sync_version',8)),'SOURCE_VERSION_MISMATCH');
});
test('later physician edits and changed whitespace are never treated as equivalent',()=>{
 const modified=structuredClone(fields);modified.hda+=' ADENDO NÃO AUDITADO.';
 blocked(evaluate(signed(),withCurrent('visibleFields',modified)),'VISIBLE_CHECKPOINT_MISMATCH');
 blocked(evaluate(signed(),{...current,visibleFields:modified,checkpointFields:modified}),'REVIEWED_CONTENT_MISMATCH');
 const spaces=structuredClone(fields);spaces.hda+=' ';
 blocked(evaluate(signed(),{...current,visibleFields:spaces,checkpointFields:spaces}),'REVIEWED_CONTENT_MISMATCH');
});
test('partial clinical fields or unknown extras cannot be silently omitted',()=>{
 const partial=structuredClone(fields);delete partial.alergias;
 blocked(evaluate(signed(),{...current,visibleFields:partial,checkpointFields:partial}),'FIELD_SCHEMA_INCOMPLETE');
 const extra={...fields,patient_name:'Never accept unsupported data'};
 blocked(evaluate(signed(),{...current,visibleFields:extra,checkpointFields:extra}),'FIELD_SCHEMA_INCOMPLETE');
});
test('checkpoint, consent, synchronization and pending changes are mandatory',()=>{
 const checks=[['checkpointVerified',false],['consentVerified',false],['synced',false],['online',false],['recordingActive',true],['unprocessedAudio',true],['reconciliationPending',true],['auditState','sending'],['auditState','held_conflict'],['clinicalEditsPending',true]];
 for(const [key,val] of checks)blocked(evaluate(signed(),withCurrent(key,val)),'CLINICAL_SAFETY_GATE_FAILED');
});
test('time validity and replay window fail closed',()=>{
 blocked(evaluate(signed(),current,trust,now+180_000),'RECEIPT_TIME_INVALID');
 blocked(evaluate(signed(),current,trust,now-120_000),'RECEIPT_TIME_INVALID');
 blocked(evaluate(withClaim('expires_at','2026-11-10T15:00:00.000Z')),'RECEIPT_TIME_INVALID');
 blocked(evaluate(withClaim('issued_at','not-time')),'RECEIPT_TIME_INVALID');
});
test('unsigned, malformed, incomplete and false-review receipts are refused',()=>{
 blocked(evaluate(null),'RECEIPT_ENVELOPE_INVALID');
 blocked(evaluate({...signed(),algorithm:'none'}),'RECEIPT_ENVELOPE_INVALID');
 const removed={...claims};delete removed.owner_user_id;
 blocked(evaluate({algorithm:'Ed25519',key_id:trust.keyId,claims:removed,signature:signed().signature}),'RECEIPT_INVALID');
 blocked(evaluate(withClaim('review_status','pending')),'RECEIPT_CLAIMS_INVALID');
});
test('the lab never exports or signals reset approval, even for perfect synthetic receipt',()=>{
 const out=evaluate();assert.equal(out.resetAuthorized,false);assert.notEqual(out.status,'PASS_RESET');
});
