/**
 * NEXA P0 V5.00 — provider-neutral patient-confirmed consent session candidate.
 * DRAFT / NOT DEPLOYED / NO DATABASE OR NETWORK ACCESS.
 *
 * A patient must confirm the APPROVED purpose/provider-specific term through
 * an independently verified identity/signature service. This module examines
 * the shape and consistency of a future server-resolved session/receipt.
 * It cannot independently authenticate a person, signature or webhook; all
 * supplied objects, including "verified" flags, are potentially forged.
 *
 * Never issue a QR token, consume a session, append an event, approve egress
 * or audit. The ONLY future durable event sink is the existing
 * private.nexa_p0_source_action_events ledger (PR #184/#176).
 * A future implementation requires server-side issuance, hash-only token
 * custody, cryptographic provider verification, atomic single-use consumption
 * and authenticated independent readback. No adapter here grants authority.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA=/^sha256:[0-9a-f]{64}$/;
const PURPOSES=new Set([
  'realtime_audio','radar_context','audio_diarization',
  'final_documentation','audit_deidentification',
]);
const PROVIDERS=new Set(['openai','gemini','nexa-core']);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const uuid=x=>typeof x==='string'&&UUID.test(x);
const hash=x=>typeof x==='string'&&SHA.test(x);
const positive=x=>Number.isSafeInteger(x)&&x>0;
const stop=code=>Object.freeze({
  status:'STOP',code,
  qrIssued:false,sessionConsumed:false,identityVerified:false,
  consentRecorded:false,externalAiAuthorized:false,
  auditAuthorized:false,gateCVerified:false,
});

/**
 * Only routing identifiers may come from the patient-facing client.
 * Never accept a browser-submitted actor, consent, patient identity, source
 * snapshot, policy, receipt, signature, timestamp or verification flag.
 *
 * All further objects are candidate backend observations, not trusted
 * evidence. In particular this function MUST NOT return a positive result
 * even if a mock supplies internally consistent observations.
 */
export function reviewPatientConsentSessionCandidate({
  request, source, session, policy, receipt, revocation, nowEpochMs,
}={}) {
  if(!obj(request)||Object.keys(request).length!==2||
     !Object.hasOwn(request,'encounterId')||
     !Object.hasOwn(request,'sessionId')||
     !uuid(request.encounterId)||!uuid(request.sessionId))
    return stop('PATIENT_ROUTE_ONLY_REQUEST_REQUIRED');

  // The physician/owner and clinical access must eventually come from a
  // server-owned lookup, never from the patient link or an unverified callback.
  if(!obj(source)||!uuid(source.ownerUserId)||
     source.encounterId!==request.encounterId||
     !uuid(source.sourceRowId)||!positive(source.syncVersion)||
     !hash(source.sourceDigest)||source.canonicalization!=='pg-jsonb-v1'||
     source.ownerAndActiveSlotVerified!==true||
     source.persistedSyncAckVerified!==true)
    return stop('OWNER_AND_PERSISTED_SOURCE_NOT_PROVEN');

  // The approved policy and hashed term must be issued by the backend.
  // These fields are NOT proof that the term was legally approved.
  if(!obj(policy)||!PURPOSES.has(policy.purpose)||
     !PROVIDERS.has(policy.provider)||
     typeof policy.policyVersion!=='string'||
     !/^[\w.-]{3,80}$/.test(policy.policyVersion)||
     !hash(policy.termDigest)||!positive(policy.approvedAtEpochMs)||
     policy.revokedAtEpochMs!==null)
    return stop('APPROVED_TERM_POLICY_NOT_PROVEN');

  // No raw link token, patient details, selfie or biometric template is
  // accepted or returned here. Only a backend-stored verifier hash.
  if(!obj(session)||session.id!==request.sessionId||
     session.encounterId!==request.encounterId||
     session.ownerUserId!==source.ownerUserId||
     session.sourceRowId!==source.sourceRowId||
     session.sourceSyncVersion!==source.syncVersion||
     session.sourceDigest!==source.sourceDigest||
     session.purpose!==policy.purpose||
     session.provider!==policy.provider||
     session.policyVersion!==policy.policyVersion||
     session.termDigest!==policy.termDigest||
     !hash(session.tokenVerifierDigest)||
     session.serverIssued!==true||
     session.consumedAtEpochMs!==null||
     session.cancelledAtEpochMs!==null)
    return stop('SERVER_BOUND_SINGLE_USE_SESSION_NOT_PROVEN');

  // The server must enforce expiry and replay resistance in an atomic
  // transaction, not by trusting this in-memory comparison.
  if(!positive(nowEpochMs)||!positive(session.issuedAtEpochMs)||
     !positive(session.expiresAtEpochMs)||
     !(session.issuedAtEpochMs<=nowEpochMs&&
       nowEpochMs<session.expiresAtEpochMs&&
       session.issuedAtEpochMs<session.expiresAtEpochMs&&
       policy.approvedAtEpochMs<=session.issuedAtEpochMs))
    return stop('SESSION_EXPIRED_OR_POLICY_TIMELINE_INVALID');

  // External receipt metadata is ONLY a candidate shape. A webhook's
  // success flag, signed-looking string, selfie or OTP is not identity proof.
  // An authorized verifier must check the provider signature and trusted
  // identity binding out-of-band, with replay/callback protection.
  if(!obj(receipt)||!uuid(receipt.receiptId)||
     receipt.sessionId!==session.id||
     receipt.encounterId!==session.encounterId||
     receipt.sourceRowId!==session.sourceRowId||
     receipt.sourceSyncVersion!==session.sourceSyncVersion||
     receipt.sourceDigest!==session.sourceDigest||
     receipt.purpose!==session.purpose||
     receipt.provider!==session.provider||
     receipt.policyVersion!==session.policyVersion||
     receipt.termDigest!==session.termDigest||
     !hash(receipt.signedArtifactDigest)||
     typeof receipt.identityService!=='string'||
     !/^[a-z0-9._-]{3,80}$/.test(receipt.identityService)||
     !positive(receipt.providerConfirmedAtEpochMs)||
     receipt.providerConfirmedAtEpochMs<session.issuedAtEpochMs||
     receipt.providerConfirmedAtEpochMs>=session.expiresAtEpochMs||
     receipt.providerConfirmedAtEpochMs>nowEpochMs)
    return stop('BOUND_PROVIDER_RECEIPT_NOT_PROVEN');

  // Revocation/replacement must be read against the existing event ledger,
  // not from a form. No new consent table or writer is permitted.
  if(!obj(revocation)||revocation.encounterId!==session.encounterId||
     revocation.ownerUserId!==source.ownerUserId||
     revocation.purpose!==session.purpose||
     revocation.provider!==session.provider||
     revocation.policyVersion!==session.policyVersion||
     revocation.revoked!==false||
     revocation.checkedAtEpochMs<receipt.providerConfirmedAtEpochMs||
     !positive(revocation.checkedAtEpochMs)||
     revocation.checkedAtEpochMs>nowEpochMs)
    return stop('CURRENT_REVOCATION_STATE_NOT_PROVEN');

  // No selected provider, keys, approved term, signed receipt verifier,
  // server-issued nonce/QR, atomic consume+ledger append or readback exists.
  // Even perfectly shaped mocks MUST terminate here, without side effects.
  return stop('PROVIDER_TRUST_AND_ATOMIC_CONSENT_AUTHORITY_NOT_IMPLEMENTED');
}
