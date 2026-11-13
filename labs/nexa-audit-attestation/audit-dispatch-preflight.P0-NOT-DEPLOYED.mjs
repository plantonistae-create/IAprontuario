/*
 * NEXA P0 — AUDIT DISPATCH AUTHORITY PREFLIGHT (OFFLINE CANDIDATE).
 * This is not an endpoint and MUST NOT be imported by the hosted function
 * until the trusted DB boundaries are implemented and Gate C is certified.
 * No networking, DB writes, AI calls, audit release or durable claim.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST=/^sha256:[0-9a-f]{64}$/;
const CONSENT='PHYSICIAN_PATIENT_CONSENT_ATTESTATION';
const REVIEW='PHYSICIAN_FINAL_REVIEW_ACK';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const plain=x=>x!==null&&typeof x==='object'&&
  Object.getPrototypeOf(x)===Object.prototype;
const exact=(o,keys)=>plain(o)&&Object.keys(o).length===keys.length&&
  keys.every(k=>own(o,k));
const same=(a,b)=>typeof a==='string'&&a.length>0&&a===b;
const ver=x=>Number.isSafeInteger(x)&&x>0;
const stop=code=>Object.freeze({
 status:'STOP',code,auditSubmitAuthorized:false,
 externalAiAuthorized:false,adminWriteAuthorized:false,
 gateCVerified:false,resetAuthorized:false
});

/*
 * All adapters described here MUST be SERVER-OWNED and executed under
 * genuinely verified actor/tenant identity with privileged DB reads.
 * A caller can inject mocks in offline tests, but a successful mock result
 * is NEVER authorization for an external AI request or audit-case write.
 *
 * Minimal future database boundary (NOT implemented here):
 * - source ownership and institutional membership at same source row;
 * - immutable consent before external AI start;
 * - final physician acknowledgement after server sync ACK, exact version
 *   and canonical digest, with no later edits or unresolved conflict;
 * - compare event source/owner/tenant/version/digest atomically with current
 *   source under locks, narrow writer grant, idempotent receipt and rollback.
 */
export async function inspectAuditDispatchCandidate({
 request,identity,source,evidence
}={}){
 try{
  if(typeof identity?.getUser!=='function'||
     typeof source?.loadVerifiedForActor!=='function'||
     typeof evidence?.readImmutableEventsForSource!=='function')
   return stop('TRUSTED_BACKEND_PROVIDERS_MISSING');
  // Only routing identity may be supplied by a caller; no clinical contents,
  // audit priority, consent booleans, timestamps or review claims.
  if(!exact(request,['encounterId','snapshotVersion'])||
     !UUID.test(request.encounterId||'')||!ver(request.snapshotVersion))
   return stop('CLIENT_AUDIT_PAYLOAD_FORBIDDEN');

  const actor=await identity.getUser();
  if(!UUID.test(actor?.id||''))return stop('ACTOR_NOT_AUTHENTICATED');
  const row=await source.loadVerifiedForActor({
   actorId:actor.id,encounterId:request.encounterId
  });
  // A null source MUST never fall back to request.fields or service_role.
  if(!plain(row)||!same(row.ownerUserId,actor.id)||
     !same(row.encounterId,request.encounterId)||
     typeof row.sourceRowId!=='string'||!row.sourceRowId||
     row.clinicalAccessVerified!==true||
     row.activeSlotVerified!==true)
   return stop('SOURCE_OWNERSHIP_NOT_VERIFIED');
  // NEXA's institutional tenant assignment is not established in current
  // schema. Missing authoritative membership is always an explicit STOP.
  if(!UUID.test(row.tenantId||'')||
     row.tenantMembershipVerified!==true||
     !same(row.tenantId,actor.tenantId))
   return stop('TENANT_AUTHORITY_NOT_VERIFIED');

  if(row.encounterState!=='ready_for_audit'||
     !ver(row.syncVersion)||!ver(row.snapshotVersion)||
     row.snapshotVersion!==request.snapshotVersion||
     !DIGEST.test(row.serverDigest||'')||
     row.digestCanonicalization!=='pg-jsonb-v1'||
     row.serverSyncAck!==true||
     row.audioCompleteVerified!==true||
     row.reconciliationClearVerified!==true||
     row.noPendingEditsVerified!==true||
     row.sourceLockedVerified!==false)
   return stop('SOURCE_READY_VERSION_DIGEST_NOT_VERIFIED');

  const events=await evidence.readImmutableEventsForSource({
   actorId:actor.id,tenantId:row.tenantId,
   sourceRowId:row.sourceRowId,
   encounterId:row.encounterId
  });
  if(!plain(events))return stop('IMMUTABLE_EVENTS_NOT_VERIFIED');
  const consent=events.consent,review=events.finalReview;
  if(!plain(consent)||consent.kind!==CONSENT||
     consent.serverCommittedVerified!==true||
     !same(consent.actorId,actor.id)||
     !same(consent.tenantId,row.tenantId)||
     !same(consent.sourceRowId,row.sourceRowId)||
     consent.explicitPhysicianActionVerified!==true||
     consent.patientScopeAttested!==true||
     consent.externalAiAllowed!==true||
     consent.auditAllowed!==true||
     consent.beforeAnyExternalAiVerified!==true||
     typeof consent.serverRecordedAt!=='string'||
     !same(consent.policyVersion,row.effectivePolicyVersion))
   return stop('EXPLICIT_CONSENT_EVIDENCE_NOT_VERIFIED');
  if(!plain(review)||review.kind!==REVIEW||
     review.serverCommittedVerified!==true||
     !same(review.actorId,actor.id)||
     !same(review.tenantId,row.tenantId)||
     !same(review.sourceRowId,row.sourceRowId)||
     review.explicitPhysicianActionVerified!==true||
     review.afterServerSyncAckVerified!==true||
     review.noEditsAfterReviewVerified!==true||
     review.sourceVersion!==row.syncVersion||
     review.snapshotVersion!==row.snapshotVersion||
     review.canonicalDigest!==row.serverDigest||
     typeof review.serverRecordedAt!=='string')
   return stop('FINAL_PHYSICIAN_ACK_NOT_VERIFIED');
  const actorAgain=await identity.getUser();
  if(!same(actorAgain?.id,actor.id)||
     !same(actorAgain?.tenantId,row.tenantId))
   return stop('ACTOR_OR_TENANT_CHANGED');

  // Even if all mocks return "verified", no server row locks, privilege,
  // durable event chain or atomic idempotent audit admission were proven.
  return Object.freeze({
   status:'PREFLIGHT_CANDIDATE_ONLY',code:'TRANSACTIONAL_GATE_C_REQUIRED',
   auditSubmitAuthorized:false,externalAiAuthorized:false,
   adminWriteAuthorized:false,gateCVerified:false,
   resetAuthorized:false
  });
 }catch{
  return stop('AUDIT_PREFLIGHT_FAIL_CLOSED');
 }
}
