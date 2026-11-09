/* NEXA G59: OFFLINE-ONLY receipt contract. No browser import, no reset authorization. */
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';

export const SCHEMA = 'nexa.audit.review-receipt.offline.v1';
export const FIELD_KEYS = Object.freeze([
  'alergias', 'antecedentes', 'comorbidades', 'conduta', 'exame_fisico',
  'hda', 'hipotese_diagnostica', 'medicacoes', 'orientacoes_alta',
  'queixa_principal', 'sinais_vitais', 'sugestoes_perguntas',
].sort());

const REQUIRED_CLAIMS = Object.freeze([
  'schema', 'issuer', 'audience', 'receipt_id', 'audit_case_id',
  'encounter_id', 'owner_user_id', 'tenant_id', 'source_sync_version',
  'clinical_fields_digest', 'review_status', 'reviewed_at', 'issued_at',
  'expires_at', 'reset_nonce',
].sort());

function record(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x) &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
}
function exactKeys(x, keys) {
  return record(x) && Object.keys(x).sort().join('\u0000') === keys.join('\u0000');
}
function meaningfulId(x) {
  return typeof x === 'string' && x.length >= 3 && x.length <= 128 &&
    x.trim() === x && !/[\u0000-\u001f]/.test(x);
}
export function canonicalFields(fields) {
  if (!exactKeys(fields, FIELD_KEYS) || !FIELD_KEYS.every(k => typeof fields[k] === 'string')) {
    throw new Error('FIELD_SCHEMA_INCOMPLETE');
  }
  // Exact text comparison: no trimming, case folding or normalization that could hide edits.
  return JSON.stringify(Object.fromEntries(FIELD_KEYS.map(k => [k, fields[k]])));
}
export function digestFields(fields) {
  return 'sha256:' + createHash('sha256').update(canonicalFields(fields), 'utf8').digest('hex');
}
export function canonicalClaims(claims) {
  if (!exactKeys(claims, REQUIRED_CLAIMS)) throw new Error('RECEIPT_SCHEMA_INVALID');
  // Known flat keys only; no noncanonical nested objects or ambiguous fields.
  for (const key of REQUIRED_CLAIMS) {
    if (key === 'source_sync_version') {
      if (!Number.isSafeInteger(claims[key]) || claims[key] < 1) throw new Error('RECEIPT_VERSION_INVALID');
    } else if (typeof claims[key] !== 'string') throw new Error('RECEIPT_SCHEMA_INVALID');
  }
  return JSON.stringify(Object.fromEntries(REQUIRED_CLAIMS.map(k => [k, claims[k]])));
}
function fail(code) { return Object.freeze({status:'STOP', code, resetAuthorized:false}); }
function strictTime(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)) return NaN;
  const value = Date.parse(s);
  return Number.isFinite(value) && new Date(value).toISOString() === s ? value : NaN;
}

/**
 * Fail-closed verifier for a FUTURE, server-signed receipt; never authorizes reset.
 * trust.publicKeyPem MUST be pinned by a trusted deployment process in future.
 * This lab has NO production trust root and NO interaction with the NEXA reset guard.
 */
export function assessOfflineReceipt({receipt, current, trust, now = Date.now()} = {}) {
  try {
    if (!record(trust) || !meaningfulId(trust.keyId) || !meaningfulId(trust.issuer) ||
        !meaningfulId(trust.audience) || typeof trust.publicKeyPem !== 'string' ||
        !trust.publicKeyPem.includes('BEGIN PUBLIC KEY')) return fail('TRUST_ROOT_MISSING');
    if (!record(receipt) || !record(receipt.claims) || receipt.algorithm !== 'Ed25519' ||
        receipt.key_id !== trust.keyId || typeof receipt.signature !== 'string' ||
        !/^[A-Za-z0-9_-]{80,120}$/.test(receipt.signature)) return fail('RECEIPT_ENVELOPE_INVALID');
    const c = receipt.claims;
    const data = canonicalClaims(c);
    if (c.schema !== SCHEMA || c.issuer !== trust.issuer || c.audience !== trust.audience ||
        c.review_status !== 'reviewed' ||
        ![c.receipt_id,c.audit_case_id,c.encounter_id,c.owner_user_id,c.tenant_id,c.reset_nonce].every(meaningfulId) ||
        !/^sha256:[a-f0-9]{64}$/.test(c.clinical_fields_digest)) return fail('RECEIPT_CLAIMS_INVALID');
    let key;
    try { key = createPublicKey(trust.publicKeyPem); }
    catch { return fail('TRUST_ROOT_INVALID'); }
    if (key.asymmetricKeyType !== 'ed25519') return fail('TRUST_ALGORITHM_INVALID');
    const signature = Buffer.from(receipt.signature, 'base64url');
    if (signature.length !== 64 || !verifySignature(null, Buffer.from(data, 'utf8'), key, signature))
      return fail('SIGNATURE_INVALID');
    const issued = strictTime(c.issued_at), expires = strictTime(c.expires_at), reviewed = strictTime(c.reviewed_at);
    if (![issued, expires, reviewed, now].every(Number.isFinite) ||
        issued > now + 30_000 || now >= expires || expires - issued > 300_000 ||
        expires <= issued || reviewed > issued || issued - reviewed > 86_400_000)
      return fail('RECEIPT_TIME_INVALID');
    if (!record(current) || ![current.encounterId,current.ownerUserId,current.tenantId,current.expectedNonce].every(meaningfulId))
      return fail('CURRENT_IDENTITY_MISSING');
    if (c.encounter_id !== current.encounterId || c.owner_user_id !== current.ownerUserId ||
        c.tenant_id !== current.tenantId || c.reset_nonce !== current.expectedNonce)
      return fail('IDENTITY_OR_NONCE_MISMATCH');
    if (!Number.isSafeInteger(current.sourceSyncVersion) || current.sourceSyncVersion < 1 ||
        current.sourceSyncVersion !== c.source_sync_version) return fail('SOURCE_VERSION_MISMATCH');
    if (current.checkpointVerified !== true || current.consentVerified !== true ||
        current.synced !== true || current.online !== true || current.recordingActive !== false ||
        current.unprocessedAudio !== false || current.reconciliationPending !== false ||
        current.auditState !== 'locked' || current.clinicalEditsPending !== false)
      return fail('CLINICAL_SAFETY_GATE_FAILED');
    const visible = canonicalFields(current.visibleFields);
    const stored = canonicalFields(current.checkpointFields);
    if (visible !== stored) return fail('VISIBLE_CHECKPOINT_MISMATCH');
    if (digestFields(current.visibleFields) !== c.clinical_fields_digest)
      return fail('REVIEWED_CONTENT_MISMATCH');
    // An offline comparison cannot prove no concurrent remote mutation/replay.
    // Only an authenticated, one-time server decision can authorize a reset.
    return Object.freeze({status:'PROVISIONAL_MATCH', code:'FRESH_SERVER_CONFIRMATION_REQUIRED', resetAuthorized:false});
  } catch (error) {
    return fail(error?.message === 'FIELD_SCHEMA_INCOMPLETE' ? 'FIELD_SCHEMA_INCOMPLETE' : 'RECEIPT_INVALID');
  }
}
