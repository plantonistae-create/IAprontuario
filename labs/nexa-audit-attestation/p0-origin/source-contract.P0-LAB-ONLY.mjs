/**
 * NEXA P0: OFFLINE source-origin contract. Synthetic only.
 * There is NO database client, service key, network, browser import, or reset action.
 * A positive result is PROVISIONAL and NEVER authorizes a privileged write.
 */
import { createHash } from 'node:crypto';

const FIELDS=Object.freeze([
  'alergias','antecedentes','comorbidades','conduta','exame_fisico',
  'exames_sugeridos','hda','hipotese_diagnostica','medicacoes',
  'orientacoes_alta','prescricao','queixa_principal','sinais_vitais',
  'sugestoes_perguntas'
].sort());
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const keys=x=>Object.keys(x).sort();
const exact=(x,list)=>object(x)&&JSON.stringify(keys(x))===JSON.stringify([...list].sort());
const id=x=>typeof x==='string'&&UUID.test(x);
const stop=code=>Object.freeze({status:'STOP',code,privilegedWriteAuthorized:false,resetAuthorized:false});
const provisional=fieldsDigest=>Object.freeze({
  status:'PROVISIONAL_SOURCE_CHECKED',code:'HOSTED_TENANT_AND_TRANSACTION_UNPROVEN',
  syntheticSourceDigest:fieldsDigest,privilegedWriteAuthorized:false,resetAuthorized:false
});
export function canonicalClinicalFields(fields){
  if(!exact(fields,FIELDS)||FIELDS.some(k=>typeof fields[k]!=='string'))
    throw new Error('UNMAPPED_OR_MISSING_CLINICAL_FIELD');
  if(!FIELDS.some(k=>fields[k].trim().length>=5))
    throw new Error('EMPTY_CLINICAL_SOURCE');
  // Canonicalization is deliberately exact: do not trim/change clinical values.
  return JSON.stringify(Object.fromEntries(FIELDS.map(k=>[k,fields[k]])));
}
export function syntheticDigest(fields){
  return 'sha256:'+createHash('sha256').update(canonicalClinicalFields(fields),'utf8').digest('hex');
}

/**
 * All arguments are SYNTHETIC fixtures.
 * In a future implementation: actor from getUser; caps from an authenticated RPC;
 * source from a user-scoped RLS query; tenantBinding and atomicallyObserved
 * MUST be resolved by trusted server code, never copied from the request body.
 */
export function assessSourceOrigin({
  actor,caps,source,request,tenantBinding,atomicallyObserved
}={}){
  try{
    if(!object(actor)||actor.authenticated!==true||!id(actor.userId))
      return stop('UNAUTHENTICATED');
    if(!object(caps)||caps.access_status!=='active'||caps.clinical_access!==true)
      return stop('CLINICAL_ACCESS_REQUIRED');
    if(!object(request)||!id(request.sourceConsultationId)||
       request.snapshotVersion!=='final-v1')
      return stop('REQUEST_IDENTITY_INVALID');
    // This is a mandatory explicit STOP. The hosted v9 currently lacks it.
    if(!object(source))return stop('SOURCE_NOT_ACCESSIBLE');
    if(!id(source.encounter_id)||source.encounter_id!==request.sourceConsultationId)
      return stop('SOURCE_IDENTITY_MISMATCH');
    if(!id(source.user_id)||source.user_id!==actor.userId)
      return stop('SOURCE_OWNER_MISMATCH');
    if(source.encounter_state!=='ready_for_audit')
      return stop('SOURCE_NOT_READY');
    if(!Number.isSafeInteger(source.sync_version)||source.sync_version<1)
      return stop('SOURCE_VERSION_UNVERIFIED');
    if(!Number.isSafeInteger(request.expectedSourceVersion)||request.expectedSourceVersion<1||
       request.expectedSourceVersion!==source.sync_version)
      return stop('STALE_CLIENT_SOURCE_VERSION');
    if(typeof source.updated_at!=='string'||!Number.isFinite(Date.parse(source.updated_at)))
      return stop('SOURCE_TIMESTAMP_UNVERIFIED');
    let digest;
    try{digest=syntheticDigest(source.fields)}
    catch{return stop('SOURCE_FIELDS_NOT_VERIFIED')}
    // Explicit authority gap: the deployed select has user_id, not tenant_id.
    // No tenant can be derived from body, user_metadata, or a client claim.
    if(!object(tenantBinding)||tenantBinding.resolvedByTrustedServer!==true||
      !id(tenantBinding.userId)||!id(tenantBinding.sourceEncounterId)||
      !id(tenantBinding.tenantId)||!id(tenantBinding.sourceTenantId))
      return stop('AUTHORITATIVE_TENANT_BINDING_MISSING');
    if(tenantBinding.userId!==actor.userId||
       tenantBinding.sourceEncounterId!==source.encounter_id||
       tenantBinding.tenantId!==tenantBinding.sourceTenantId)
      return stop('AUTHORITATIVE_TENANT_MISMATCH');
    // Preflight is insufficient across the asynchronous model call.
    // The real implementation needs an authenticated durable CAS/transaction.
    if(!object(atomicallyObserved)||atomicallyObserved.serverResolved!==true||
       atomicallyObserved.conditionalWriteSucceeded!==true)
      return stop('ATOMIC_SERVER_RECHECK_MISSING');
    if(atomicallyObserved.userId!==actor.userId||
       atomicallyObserved.encounterId!==source.encounter_id||
       atomicallyObserved.tenantId!==tenantBinding.tenantId||
       atomicallyObserved.sourceVersion!==source.sync_version||
       atomicallyObserved.state!=='ready_for_audit'||
       atomicallyObserved.reviewStatus!=='pending'||
       atomicallyObserved.clinicalDigest!==digest)
      return stop('SOURCE_CHANGED_BEFORE_PRIVILEGED_WRITE');
    // Never return raw fields or authorize an admin client in this laboratory.
    return provisional(digest);
  }catch{return stop('INVALID_SOURCE_PROOF')}
}
export const SYNTHETIC_CLINICAL_FIELD_NAMES=FIELDS;
