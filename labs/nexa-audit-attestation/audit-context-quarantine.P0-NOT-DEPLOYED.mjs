/*
 * NEXA P0 — AUDIT CONTEXT SOURCE QUARANTINE — OFFLINE CANDIDATE ONLY.
 * Does not call AI, network or database. Deliberately NEVER releases audit
 * content, even if test adapters claim ownership/consent/review.
 *
 * A stored consultation may contain clinician/browser-authored fields.
 * Server retrieval and syntactic sanitization do not establish authorship
 * or an immutable physician final-review acknowledgement.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const plain=o=>o!==null&&typeof o==='object'&&
 Object.getPrototypeOf(o)===Object.prototype;
const ver=n=>Number.isSafeInteger(n)&&n>0;
const deny=(code)=>Object.freeze({
 status:'STOP',code,auditSubmitAuthorized:false,
 externalAiAuthorized:false,adminWriteAuthorized:false,
 gateCVerified:false,reviewEvidenceVerified:false
});

/*
 * Pure, deliberately non-authorizing inspection of provenance.
 *
 * Client request MUST be reduced to { encounterId, expectedSyncVersion }.
 * In particular, NEVER merge body.fields, body.core_context, priority,
 * snapshot_version, consent, physicianReviewed or provenance into server
 * evidence. Server source is a MOCK of a backend lookup in this LAB candidate,
 * and cannot be used as proof of durable origin/tenant/ACK/digest.
 */
export function inspectAuditContextQuarantine({request,actor,source}={}){
 if(!plain(request)||Object.keys(request).length!==2||
    !own(request,'encounterId')||!own(request,'expectedSyncVersion')||
    !UUID.test(request.encounterId||'')||
    !ver(request.expectedSyncVersion))
  return deny('CLIENT_CONTEXT_OR_CLAIM_FORBIDDEN');
 if(!plain(actor)||!UUID.test(actor.id||''))
  return deny('SERVER_AUTHENTICATION_NOT_PROVEN');
 if(!plain(source)||!UUID.test(source.encounterId||''))
  return deny('EXISTING_SOURCE_REQUIRED');
 if(source.encounterId!==request.encounterId||
    source.ownerUserId!==actor.id||
    source.clinicalAccessVerified!==true||
    source.activeSlotVerified!==true)
  return deny('AUTHORITATIVE_OWNER_AND_ACCESS_REQUIRED');
 if(source.encounterState!=='ready_for_audit'||
    !ver(source.syncVersion)||
    source.syncVersion!==request.expectedSyncVersion)
  return deny('CURRENT_SOURCE_VERSION_REQUIRED');
 // No unverified text or nested metadata is returned to the caller.
 // Client-authored source fields remain untrusted until immutable provenance,
 // consent and ACK are checked inside an authorized transactional boundary.
 return Object.freeze({
  status:'SOURCE_CONTENT_QUARANTINED',
  code:'DURABLE_CONTEXT_PROVENANCE_AND_GATE_C_REQUIRED',
  auditSubmitAuthorized:false,externalAiAuthorized:false,
  adminWriteAuthorized:false,gateCVerified:false,
  reviewEvidenceVerified:false,
  sourceBoundCandidateOnly:true
 });
}

/*
 * Stable documentation inventory. No clinical payload ever enters it.
 * Explicitly separates read-from-DB from authenticated-and-attested.
 */
export const AUDIT_CONTEXT_TRUST_BOUNDARIES=Object.freeze({
 requestRoutingOnly:Object.freeze(['encounterId','expectedSyncVersion']),
 forbiddenRequestClaims:Object.freeze([
  'fields','core_context','audit_priority','snapshot_version',
  'reviewed_documentation','consent_recorded_at',
  'audit_submission_snapshot','learning_layers','destination'
 ]),
 browserOrClientEditableEvenWhenStored:Object.freeze([
  'consultation_history.fields',
  'consultation_history.processing_meta.encounter_autosave',
  'consultation_history.processing_meta.speaker_attribution',
  'consultation_history.protocol_usage'
 ]),
 metadataNotReviewProof:Object.freeze([
  'core_context.provenance.reviewed_documentation',
  'core_context.learning_layers.physician_final',
  'core_context.audit_submission_snapshot.reviewed_at',
  'body.core_context.audit_submission_snapshot.capture_reason'
 ]),
 requiredOutsideThisLab:Object.freeze([
  'server-validated auth.getUser() identity',
  'existing owner-bound source and live active clinical slot',
  'canonical server digest bound to sync_version',
  'durable specific consent before external AI processing',
  'durable physician final ACK after server sync',
  'transactional recheck with locks and idempotency',
  'authorized narrow-privilege write to audit_cases'
 ])
});
