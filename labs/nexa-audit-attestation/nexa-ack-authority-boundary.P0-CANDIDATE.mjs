/**
 * NEXA P0 medical ACK authority boundary — isolated, never deployed.
 *
 * All evidence comes from backend-owned adapters, never the caller's body.
 * This module does not persist anything, mint challenges, consume challenges,
 * accept consent, or release audit / external AI. Even complete synthetic
 * fixtures finish with a STOP until an independently reviewed PostgreSQL
 * transaction binds the immutable processing ledger and the #176 action ledger.
 *
 * No database, network, clock, environment, token or patient-data dependency.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43,128}$/;
const kinds = Object.freeze(['receipt', 'issue', 'consume']);
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const exact = (x, keys) => isObj(x) && Object.keys(x).sort().join('|') === [...keys].sort().join('|');
const uuid = x => typeof x === 'string' && UUID.test(x);
const digest = x => typeof x === 'string' && DIGEST.test(x);
const version = x => Number.isSafeInteger(x) && x > 0;
const stop = code => Object.freeze({
  status: 'STOP', code,
  processingReceiptRecorded: false,
  challengeIssued: false, challengeConsumed: false,
  ackRecorded: false, externalAiAuthorized: false,
  auditAuthorized: false, gateCVerified: false,
});

function validateRequest(kind, request) {
  if (!kinds.includes(kind)) return false;
  if (kind === 'receipt') {
    return exact(request, ['encounterId', 'executionId']) &&
      uuid(request.encounterId) && uuid(request.executionId);
  }
  if (kind === 'issue') {
    return exact(request, ['encounterId', 'expectedSyncVersion', 'displayedDigest']) &&
      uuid(request.encounterId) && version(request.expectedSyncVersion) &&
      digest(request.displayedDigest);
  }
  return exact(request, [
    'encounterId', 'challengeId', 'challengeToken', 'actionId',
    'expectedSyncVersion', 'displayedDigest', 'confirmation',
  ]) && uuid(request.encounterId) && uuid(request.challengeId) &&
    uuid(request.actionId) && typeof request.challengeToken === 'string' &&
    TOKEN.test(request.challengeToken) && version(request.expectedSyncVersion) &&
    digest(request.displayedDigest) &&
    exact(request.confirmation, ['physicianReviewedExactPersistedSnapshot']) &&
    request.confirmation.physicianReviewedExactPersistedSnapshot === true;
}

function sameIds(actor, encounterId, source) {
  return isObj(source) && uuid(source.ownerUserId) &&
    source.ownerUserId === actor && source.encounterId === encounterId &&
    typeof source.sourceRowId === 'string' && source.sourceRowId.length > 0 &&
    version(source.syncVersion) && digest(source.clinicalDigest) &&
    source.canonicalization === 'pg-jsonb-v1' &&
    source.ownerAndActiveSlotVerified === true && source.serverSyncAck === true;
}

function matchVersion(kind, request, source) {
  return kind === 'receipt' ||
    (request.expectedSyncVersion === source.syncVersion &&
      request.displayedDigest === source.clinicalDigest);
}

function processingOK(actor, encounterId, source, execution, id) {
  return isObj(execution) && uuid(execution.executionId) &&
    (id === undefined || execution.executionId === id) &&
    execution.ownerUserId === actor && execution.encounterId === encounterId &&
    execution.sourceRowId === source.sourceRowId &&
    execution.sourceSyncVersion === source.syncVersion &&
    execution.sourceDigest === source.clinicalDigest &&
    execution.canonicalization === 'pg-jsonb-v1' &&
    execution.terminalState === 'COMPLETED' &&
    execution.producedByServer === true &&
    execution.immutableServerReceiptReadback === true &&
    uuid(execution.receiptId) && digest(execution.outputDigest) &&
    typeof execution.provider === 'string' && execution.provider.length > 0 &&
    typeof execution.modelVersion === 'string' && execution.modelVersion.length > 0;
}

function completenessOK(actor, encounterId, source, facts, execution) {
  const {audio, reconciliation, consent} = facts;
  return isObj(audio) && audio.ownerUserId === actor &&
    audio.encounterId === encounterId && audio.sourceRowId === source.sourceRowId &&
    uuid(audio.evidenceId) && audio.finishedByTrustedServer === true &&
    audio.allChunksAccountedFor === true && audio.pendingChunks === 0 &&
    audio.archiveRequired === (audio.archiveRequired === true) &&
    (!audio.archiveRequired || audio.verifiedArchiveReceipt === true) &&
    isObj(reconciliation) && reconciliation.ownerUserId === actor &&
    reconciliation.encounterId === encounterId &&
    reconciliation.sourceSyncVersion === source.syncVersion &&
    reconciliation.sourceDigest === source.clinicalDigest &&
    reconciliation.processingReceiptId === execution.receiptId &&
    reconciliation.serverVerified === true && reconciliation.pending === false &&
    reconciliation.conflict === false && reconciliation.postReviewEdits === false &&
    isObj(consent) && consent.ownerUserId === actor &&
    consent.encounterId === encounterId && consent.purpose === 'audit_deidentification' &&
    consent.serverVerified === true && consent.revoked === false &&
    uuid(consent.eventId);
}

function challengeOK(request, actor, source, facts, execution, challenge, now) {
  return isObj(challenge) && uuid(challenge.id) &&
    challenge.id === request.challengeId && challenge.ownerUserId === actor &&
    challenge.encounterId === request.encounterId &&
    challenge.sourceRowId === source.sourceRowId &&
    challenge.sourceSyncVersion === source.syncVersion &&
    challenge.sourceDigest === source.clinicalDigest &&
    challenge.processingReceiptId === execution.receiptId &&
    challenge.audioEvidenceId === facts.audio.evidenceId &&
    challenge.consentEventId === facts.consent.eventId &&
    challenge.issuedByServer === true && challenge.consumedAt === null &&
    Number.isFinite(challenge.expiresAtEpochMs) &&
    Number.isFinite(now) && challenge.expiresAtEpochMs > now &&
    challenge.nonceHashVerifiedByServer === true;
}

/** The adapters here are an interface under review, NOT a trusted implementation. */
export async function reviewAuthorityBoundaryCandidate({kind, request, auth, source, evidence, challengeStore, clock} = {}) {
  if (!validateRequest(kind, request)) return stop('REQUEST_REJECTED');
  if (typeof auth?.getUser !== 'function' ||
      typeof source?.readOwnedSyncedSource !== 'function' ||
      typeof evidence?.readServerProcessingReceipt !== 'function' ||
      (kind !== 'receipt' && (
        typeof evidence.readServerAudioCompletion !== 'function' ||
        typeof evidence.readServerReconciliation !== 'function' ||
        typeof evidence.readServerConsent !== 'function'))) {
    return stop('SERVER_AUTHORITY_ADAPTER_MISSING');
  }
  try {
    const user = await auth.getUser();
    const actor = user?.id;
    if (!uuid(actor)) return stop('UNAUTHENTICATED');
    const row = await source.readOwnedSyncedSource({actor, encounterId: request.encounterId});
    if (!sameIds(actor, request.encounterId, row)) return stop('OWNER_SOURCE_OR_SYNC_NOT_VERIFIED');
    if (!matchVersion(kind, request, row)) return stop('SOURCE_VERSION_OR_DIGEST_CHANGED');

    const execution = await evidence.readServerProcessingReceipt({actor, encounterId: request.encounterId});
    if (!processingOK(actor, request.encounterId, row, execution,
      kind === 'receipt' ? request.executionId : undefined)) {
      return stop('PROCESSING_SERVER_RECEIPT_NOT_VERIFIED');
    }
    if (kind !== 'receipt') {
      const [audio, reconciliation, consent] = await Promise.all([
        evidence.readServerAudioCompletion({actor, encounterId: request.encounterId}),
        evidence.readServerReconciliation({actor, encounterId: request.encounterId}),
        evidence.readServerConsent({actor, encounterId: request.encounterId, purpose: 'audit_deidentification'}),
      ]);
      const facts = {audio, reconciliation, consent};
      if (!completenessOK(actor, request.encounterId, row, facts, execution)) {
        return stop('COMPLETE_SERVER_EVIDENCE_NOT_VERIFIED');
      }
      if (kind === 'consume') {
        if (typeof challengeStore?.readVerifiedChallenge !== 'function' ||
            typeof clock?.nowEpochMs !== 'function') {
          return stop('CHALLENGE_SERVER_AUTHORITY_MISSING');
        }
        const challenge = await challengeStore.readVerifiedChallenge({actor, challengeId: request.challengeId,
          token: request.challengeToken});
        const now = await clock.nowEpochMs();
        if (!challengeOK(request, actor, row, facts, execution, challenge, now)) {
          return stop('CHALLENGE_MISMATCH_EXPIRED_OR_CONSUMED');
        }
      }
    }
    const actorAgain = (await auth.getUser())?.id;
    if (actorAgain !== actor) return stop('SESSION_CHANGED');
    // Do not call the potential persistence/issuer/consumer adapters. Their
    // ownership, transaction, isolation, uniqueness and RLS are NOT proven.
    return stop(kind === 'receipt' ? 'PROCESSING_LEDGER_TRANSACTION_NOT_PROVEN' :
      kind === 'issue' ? 'SERVER_CHALLENGE_ISSUER_NOT_PROVEN' :
      'ATOMIC_CHALLENGE_CONSUMPTION_NOT_PROVEN');
  } catch {
    return stop('SERVER_EVIDENCE_READ_FAILED');
  }
}
