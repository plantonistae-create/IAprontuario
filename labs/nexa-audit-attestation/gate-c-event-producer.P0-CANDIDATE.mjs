/*
 * NEXA P0 Gate C — LAB CANDIDATE ONLY, NOT DEPLOYED.
 * No direct insert, client claims as authority, or implicit consent/review.
 * Production backend adapters and a private transactional DB boundary remain
 * unimplemented. No hosted Supabase calls or clinical data.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST=/^sha256:[0-9a-f]{64}$/;
const CONSENT='PHYSICIAN_PATIENT_CONSENT_ATTESTATION';
const REVIEW='PHYSICIAN_FINAL_REVIEW_ACK';
const stop=code=>Object.freeze({status:'STOP',code,eventRecorded:false,resetAuthorized:false});
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const plain=x=>!!x&&typeof x==='object'&&Object.getPrototypeOf(x)===Object.prototype;
const exact=(x,keys)=>plain(x)&&Object.keys(x).every(k=>keys.includes(k))&&keys.every(k=>own(x,k));
const version=x=>Number.isSafeInteger(x)&&x>=1;
const same=(a,b)=>typeof a==='string'&&a.length>0&&a===b;

/*
 * Adapters MUST be trusted SERVER implementations:
 * auth.getUser() => server-validated identity {id}
 * source.readVerifiedForActor() => backend-owned source facts, not client data
 * events.commitVerifiedActionAtomic() => DB-locked revalidation, server clock,
 *   durable immutable source event, narrow write privilege and idempotency.
 * Merely injecting a mock adapter does not prove any of those properties.
 */
export async function produceExplicitGateCEvent({request,auth,source,events}={}){
 try{
  if(typeof auth?.getUser!=='function'||
     typeof source?.readVerifiedForActor!=='function'||
     typeof events?.commitVerifiedActionAtomic!=='function')
    return stop('TRUSTED_BACKEND_ADAPTER_MISSING');
  if(!plain(request)||!UUID.test(request.encounterId||'')||
     ![CONSENT,REVIEW].includes(request.kind))
    return stop('EXPLICIT_ACTION_INVALID');

  // Reject unknown keys, especially fields, core_context and reviewed flags.
  const keys=request.kind===CONSENT
   ?['kind','encounterId','confirmation']
   :['kind','encounterId','confirmation','expectedVersion','displayedDigest'];
  if(!exact(request,keys))return stop('CLIENT_PAYLOAD_NOT_ALLOWED');
  if(request.kind===CONSENT){
   if(!exact(request.confirmation,
      ['patientScopeAttested','externalAiAllowed','auditAllowed','policyVersion'])||
      request.confirmation.patientScopeAttested!==true||
      request.confirmation.externalAiAllowed!==true||
      request.confirmation.auditAllowed!==true||
      typeof request.confirmation.policyVersion!=='string'||
      !request.confirmation.policyVersion.trim())
     return stop('EXPLICIT_CONSENT_REQUIRED');
  }else{
   if(!exact(request.confirmation,['physicianReviewedExactVersion'])||
      request.confirmation.physicianReviewedExactVersion!==true||
      !version(request.expectedVersion)||
      !DIGEST.test(request.displayedDigest||''))
     return stop('EXPLICIT_FINAL_REVIEW_REQUIRED');
  }

  const actor=await auth.getUser();
  if(!UUID.test(actor?.id||''))return stop('UNAUTHENTICATED');
  const trusted=await source.readVerifiedForActor({
   actorId:actor.id,encounterId:request.encounterId,kind:request.kind
  });
  if(!plain(trusted)||!same(trusted.ownerUserId,actor.id)||
     !same(trusted.encounterId,request.encounterId)||
     typeof trusted.sourceRowId!=='string'||!trusted.sourceRowId||
     trusted.clinicalAccessVerified!==true||trusted.activeSlotVerified!==true)
   return stop('OWNER_OR_ACTIVE_SLOT_NOT_VERIFIED');

  let intent;
  if(request.kind===CONSENT){
   // MUST be rechecked during DB commit; a prior read alone is insufficient.
   if(trusted.consentPhaseOpen!==true||
      trusted.externalAiAlreadyStarted!==false||
      !same(request.confirmation.policyVersion,trusted.policyVersion))
    return stop('CONSENT_TIME_OR_POLICY_NOT_VERIFIED');
   intent={
    kind:CONSENT,actorId:actor.id,encounterId:request.encounterId,
    sourceRowId:trusted.sourceRowId,expectedPolicyVersion:trusted.policyVersion,
    physicianPatientScopeAttested:true,externalAiAllowed:true,auditAllowed:true,
    enforceBeforeExternalProcessing:true
   };
  }else{
   if(!version(trusted.syncVersion)||
      trusted.syncVersion!==request.expectedVersion||
      !same(request.displayedDigest,trusted.serverDigest)||
      trusted.digestCanonicalization!=='pg-jsonb-v1'||
      trusted.serverSyncAck!==true||trusted.readyForAudit!==true||
      trusted.audioCompleteVerified!==true||
      trusted.reconciliationClearVerified!==true||
      trusted.noPostReviewEditsVerified!==true||
      trusted.validConsentEvidenceVerified!==true)
    return stop('FINAL_REVIEW_VERSION_OR_READINESS_MISMATCH');
   intent={
    kind:REVIEW,actorId:actor.id,encounterId:request.encounterId,
    sourceRowId:trusted.sourceRowId,expectedSyncVersion:trusted.syncVersion,
    expectedDigest:trusted.serverDigest,
    expectedCanonicalization:'pg-jsonb-v1',
    enforceServerAckAndNoPendingEdits:true,
    enforceConsentAlreadyAttested:true
   };
  }

  const actorAgain=await auth.getUser();
  if(!same(actorAgain?.id,actor.id))return stop('AUTH_CHANGED_BEFORE_COMMIT');
  const receipt=await events.commitVerifiedActionAtomic(intent);
  if(!plain(receipt)||!UUID.test(receipt.eventId||'')||
     receipt.kind!==request.kind||receipt.actorId!==actor.id||
     receipt.encounterId!==request.encounterId||
     receipt.committedByTrustedBackend!==true)
    return stop('DURABLE_SERVER_COMMIT_NOT_VERIFIED');

  // A mocked or caller-supplied adapter receipt is NOT independently
  // verified PostgreSQL durability. Never advertise a recorded audit event.
  // Production integration must provide separate server-side attestation.
  return Object.freeze({
   status:'ADAPTER_RECEIPT_LAB_ONLY',kind:request.kind,
   eventId:receipt.eventId,eventRecorded:false,
   durableEventVerified:false,resetAuthorized:false
  });
 }catch{
  return stop('EVENT_PRODUCER_FAIL_CLOSED');
 }
}
