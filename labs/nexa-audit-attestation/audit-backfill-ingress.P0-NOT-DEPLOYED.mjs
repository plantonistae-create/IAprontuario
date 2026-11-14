/*
 * NEXA P0 — HISTORICAL AUDIT BACKFILL ADMISSION (OFFLINE CONTRACT ONLY).
 *
 * Never import into the hosted Edge Function. No DB/network/AI calls, grants,
 * durable events, real report reads or audit-case writes.
 * Injected adapters and positive test mocks are NOT verified backend roles.
 * EVERY response denies external AI, audit writes, reset and report access.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST=/^sha256:[0-9a-f]{64}$/;
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const plain=x=>x!==null&&typeof x==='object'&&Object.getPrototypeOf(x)===Object.prototype;
const exact=(x,keys)=>plain(x)&&Object.keys(x).length===keys.length&&keys.every(k=>own(x,k));
const same=(a,b)=>typeof a==='string'&&a.length>0&&a===b;
const ver=n=>Number.isSafeInteger(n)&&n>0;
const flags=Object.freeze({
 externalAiAuthorized:false,auditSubmitAuthorized:false,
 adminWriteAuthorized:false,reportReadAuthorized:false,
 clinicalPayloadReleased:false,gateCVerified:false,
 eventDurabilityVerified:false,resetAuthorized:false
});
const stop=code=>Object.freeze({status:'STOP',code,...flags});
export const HISTORICAL_BACKFILL_ACTIONS=Object.freeze({
 REPORT:'audit-backfill.report',
 RUN:'audit-backfill.run'
});

/*
 * backendAction: route selected by the server, NOT a browser-supplied
 * authority. "report" and "run" remain separate.
 *
 * Proposed future run request (NOT the current hosted body):
 * {action:'run',expectedCount:positiveSafeInteger} — routing only.
 * Client confirmed/limit/fields/core_context/actorId/tenantId/attestations
 * are forbidden as sources of authority; historical backfill may not create
 * consent or a physician ACK retroactively from existing clinical text.
 *
 * identity,staff,source,evidence are hypothetical SERVER-OWNED adapters.
 * Backfill staff ≠ physician author. Merely authenticating a reviewer/admin
 * cannot substitute for owner-specific evidence on EVERY source row.
 */
export async function inspectHistoricalAuditBackfillCandidate({
 backendAction,request,identity,staff,source,evidence
}={}){
 try{
  if(backendAction!==HISTORICAL_BACKFILL_ACTIONS.REPORT&&
     backendAction!==HISTORICAL_BACKFILL_ACTIONS.RUN)
   return stop('BACKFILL_ROUTE_UNKNOWN');
  const isReport=backendAction===HISTORICAL_BACKFILL_ACTIONS.REPORT;
  const expectedKeys=isReport?['action']:['action','expectedCount'];
  if(!exact(request,expectedKeys)||
     request.action!==(isReport?'report':'run')||
     (!isReport&&(!ver(request.expectedCount)||request.expectedCount>25)))
   return stop('BACKFILL_CLIENT_CLAIMS_OR_CONFIRMATION_FORBIDDEN');

  if(typeof identity?.getUser!=='function'||
     typeof staff?.requireActiveAuditStaff!=='function')
   return stop('BACKFILL_STAFF_IDENTITY_NOT_VERIFIED');
  const actor=await identity.getUser();
  if(!UUID.test(actor?.id||''))return stop('BACKFILL_ACTOR_NOT_AUTHENTICATED');
  if(own(actor,'tenantId'))return stop('UNSUPPORTED_TENANT_ASSERTION');
  const role=await staff.requireActiveAuditStaff({actorId:actor.id,backendAction});
  if(!plain(role)||role.active!==true||
     role.actorId!==actor.id||(role.isAdmin!==true&&role.isReviewer!==true))
   return stop('BACKFILL_STAFF_PERMISSION_NOT_VERIFIED');

  if(isReport){
   // This is a classification, NOT authority to query private inventory.
   return Object.freeze({
    status:'REPORT_READ_ONLY_CANDIDATE_ONLY',
    code:'SERVER_AGGREGATE_REPORT_ADMISSION_NOT_PROVEN',
    ...flags
   });
  }

  if(typeof source?.readCandidateBatchForStaff!=='function'||
     typeof evidence?.readImmutableEventsForSource!=='function')
   return stop('BACKFILL_TRUSTED_SOURCE_AND_EVENT_ADAPTERS_MISSING');
  const rows=await source.readCandidateBatchForStaff({
   actorId:actor.id,expectedCount:request.expectedCount
  });
  if(!Array.isArray(rows)||rows.length!==request.expectedCount||
     rows.length>25||rows.length<1)
   return stop('BACKFILL_BATCH_SCOPE_NOT_VERIFIED');
  const seen=new Set();
  for(const row of rows){
   if(!plain(row)||!UUID.test(row.sourceRowId||'')||
      !UUID.test(row.encounterId||'')||
      !UUID.test(row.ownerUserId||'')||
      seen.has(row.sourceRowId)||
      !ver(row.syncVersion)||!DIGEST.test(row.serverDigest||'')||
      row.digestCanonicalization!=='pg-jsonb-v1'||
      row.ownerRecordVerified!==true||
      row.clinicianAuthorshipVerified!==true||
      row.noPendingEditsVerified!==true||
      row.sourceLockedVerified!==false||
      !same(row.effectivePolicyVersion,'policy-v1')&&
         (typeof row.effectivePolicyVersion!=='string'||!row.effectivePolicyVersion))
    return stop('BACKFILL_SOURCE_VERSION_AND_DIGEST_NOT_VERIFIED');
   seen.add(row.sourceRowId);
   const events=await evidence.readImmutableEventsForSource({
    actorId:actor.id,sourceRowId:row.sourceRowId,
    encounterId:row.encounterId,ownerUserId:row.ownerUserId,
    purpose:'audit_deidentification'
   });
   if(!plain(events)||!plain(events.consent)||!plain(events.finalReview))
    return stop('BACKFILL_IMMUTABLE_EVENTS_NOT_VERIFIED');
   const c=events.consent,a=events.finalReview;
   if(c.kind!=='PHYSICIAN_PATIENT_CONSENT_ATTESTATION'||
      c.purpose!=='audit_deidentification'||
      !UUID.test(c.eventId||'')||
      !same(c.actorId,row.ownerUserId)||
      !same(c.sourceRowId,row.sourceRowId)||
      c.serverCommittedVerified!==true||
      c.explicitPhysicianActionVerified!==true||
      c.patientScopeAttested!==true||
      c.auditAllowed!==true||
      c.revoked!==false||
      c.beforeExternalDispatchVerified!==true||
      !same(c.policyVersion,row.effectivePolicyVersion))
    return stop('BACKFILL_EXPLICIT_PURPOSE_CONSENT_NOT_VERIFIED');
   if(a.kind!=='PHYSICIAN_FINAL_REVIEW_ACK'||
      !UUID.test(a.eventId||'')||
      !same(a.actorId,row.ownerUserId)||
      !same(a.sourceRowId,row.sourceRowId)||
      a.serverCommittedVerified!==true||
      a.explicitPhysicianActionVerified!==true||
      a.afterServerSyncAckVerified!==true||
      a.noEditsAfterReviewVerified!==true||
      a.sourceSyncVersion!==row.syncVersion||
      a.canonicalDigest!==row.serverDigest)
    return stop('BACKFILL_FINAL_PHYSICIAN_ACK_NOT_VERIFIED');
  }
  const actorAgain=await identity.getUser();
  if(!same(actorAgain?.id,actor.id))
   return stop('BACKFILL_ACTOR_CHANGED');
  // Even favorable mocks cannot prove transactional idempotency, row locks,
  // revocation races or service_role isolation. No clinical data is returned.
  return Object.freeze({
   status:'BACKFILL_RUN_PREFLIGHT_CANDIDATE_ONLY',
   code:'GATE_C_TRANSACTIONAL_BACKFILL_ADMISSION_NOT_PROVEN',
   ...flags
  });
 }catch{
  return stop('BACKFILL_PREFLIGHT_FAIL_CLOSED');
 }
}
