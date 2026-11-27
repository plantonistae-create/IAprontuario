// V5.25 CANDIDATE (NOT DEPLOYED) — envelope v2: ONE data key per backup SESSION (wrapped once by the managed KMS), a fresh HKDF-derived AES-256-GCM key per CHUNK.
// Why: v1 asks the KMS to wrap/unwrap on every 10-second chunk (measured 4 calls/chunk). v2 needs 1 wrap per session and ~1 unwrap per cold Edge isolate.
// Security properties kept (each tested): the data key never leaves the server unwrapped except in a bounded in-memory cache (<=60 s, <=32 sessions, zeroized on eviction/clear);
// KMS key-version revocation still makes stored sessions unreadable (after the cache TTL); every chunk is bound by AAD to owner+encounter+session+sequence+source version;
// a per-chunk random HKDF salt gives every chunk its own key (no IV-reuse limit across a long session); v1 records stay readable (compat codec); v2 records are NOT readable by the v1 codec.
// Trusted-caller rule is unchanged: identity, clinical access and source authorization are established by the handler BEFORE seal/open.
import { Buffer } from 'node:buffer';
import { randomBytes, createCipheriv, createDecipheriv, createHash, hkdfSync } from 'node:crypto';
import { createEnvelopeCodec } from './nexa-audio-backup-core.mjs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, hash = (b) => createHash('sha256').update(b).digest('hex'), fail = (c) => { throw Error(c); };
const MAX = 32 * 1024 * 1024;
function ids(scope, needSeq) {
  const { ownerId, encounterId, sessionId, sequence, sourceVersion } = scope || {};
  if (![ownerId, encounterId, sessionId].every((x) => typeof x === 'string' && uuid.test(x)) || !Number.isSafeInteger(sourceVersion) || sourceVersion < 1) fail('BACKUP_SCOPE_INVALID');
  if (needSeq && (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > 7200)) fail('BACKUP_SCOPE_INVALID');
  return { ownerId, encounterId, sessionId, sequence, sourceVersion };
}
export const sessionKeyId = (s) => JSON.stringify([s.ownerId, s.encounterId, s.sessionId, s.sourceVersion]);
const sessionAad = (s) => JSON.stringify(['nexa-backup-v2-session', s.ownerId, s.encounterId, s.sessionId, s.sourceVersion]);
const chunkAad = (s) => JSON.stringify(['nexa-backup-v2-chunk', s.ownerId, s.encounterId, s.sessionId, s.sequence, s.sourceVersion]);
const chunkKey = (dek, salt, aad) => Buffer.from(hkdfSync('sha256', dek, salt, Buffer.from('nexa-backup-v2|' + aad), 32));
/** sessionKeys = { read(id)->{wrapped}|null, insertIfAbsent(id, wrapped)->boolean }  (server store of WRAPPED data keys only) */
export function createEnvelopeCodecV2({ custody, sessionKeys, cacheTtlMs = 60000, cacheMax = 32, now = () => Date.now() }) {
  if (typeof custody?.wrap !== 'function' || typeof custody?.unwrap !== 'function') fail('CUSTODY_REQUIRED');
  if (typeof sessionKeys?.read !== 'function' || typeof sessionKeys?.insertIfAbsent !== 'function') fail('SESSION_KEY_STORE_REQUIRED');
  const cache = new Map();
  const evict = (k) => { const e = cache.get(k); if (e) { e.dek.fill(0); cache.delete(k); } };
  const sweep = () => { const t = now(); for (const [k, e] of cache) if (e.exp <= t) evict(k); while (cache.size > cacheMax) evict(cache.keys().next().value); };
  const remember = (k, dek) => { if (cacheTtlMs <= 0) return dek; evict(k); const copy = Buffer.from(dek); cache.set(k, { dek: copy, exp: now() + cacheTtlMs }); sweep(); return copy; };
  async function unwrapStored(s, stored) {
    const dek = await custody.unwrap({ aad: sessionAad(s), wrapped: stored.wrapped });
    if (!Buffer.isBuffer(dek) || dek.length !== 32) fail('CUSTODY_UNWRAP_FAILED');
    return dek;
  }
  /** returns a private copy of the data key; the caller MUST call release() (zeroizes it). The cache keeps its own separate copy. */
  async function dataKey(scope, create) {
    const s = ids(scope, false), k = sessionKeyId(s);
    sweep(); const hit = cache.get(k); if (hit) { const own = Buffer.from(hit.dek); return { dek: own, release() { own.fill(0); } }; }   // callers always get a PRIVATE copy: a concurrent eviction can zeroize the cached one without corrupting an operation in flight
    const finish = (dek) => { remember(k, dek); return { dek, release() { dek.fill(0); } }; };
    let stored = await sessionKeys.read(k);
    if (!stored) {
      if (!create) fail('BACKUP_SESSION_KEY_MISSING');
      const fresh = randomBytes(32), wrapped = await custody.wrap({ aad: sessionAad(s), key: fresh });
      if (!wrapped || typeof wrapped.keyId !== 'string' || !wrapped.keyId || typeof wrapped.blob !== 'string' || !wrapped.blob) { fresh.fill(0); fail('CUSTODY_WRAP_FAILED'); }
      const inserted = await sessionKeys.insertIfAbsent(k, { wrapped });
      if (inserted === true) return finish(fresh);
      fresh.fill(0); stored = await sessionKeys.read(k); if (!stored) fail('BACKUP_SESSION_KEY_MISSING');   // lost the race: use the WINNER's key, never our own
    }
    return finish(await unwrapStored(s, stored));
  }
  return Object.freeze({
    async seal(scope, bytes) {
      const s = ids(scope, true), aad = chunkAad(s);
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX) fail('INVALID_CHUNK');
      const { dek, release } = await dataKey(s, true);
      try {
        const salt = randomBytes(16), iv = randomBytes(12), key = chunkKey(dek, salt, aad);
        try { const c = createCipheriv('aes-256-gcm', key, iv); c.setAAD(Buffer.from(aad)); const ct = Buffer.concat([c.update(bytes), c.final()]);
          return { schema: 'nexa-backup-v2', salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ciphertext: ct.toString('base64'), sha256: hash(bytes), size: bytes.length }; }
        finally { key.fill(0); }
      } finally { release(); }
    },
    async open(scope, record) {
      const s = ids(scope, true), aad = chunkAad(s);
      if (record?.schema !== 'nexa-backup-v2' || !Number.isSafeInteger(record.size) || record.size < 1 || record.size > MAX || typeof record.ciphertext !== 'string' || typeof record.salt !== 'string' || typeof record.iv !== 'string' || typeof record.tag !== 'string' || record.ciphertext.length > Math.ceil(record.size / 3) * 4 + 8) fail('BACKUP_RECORD_INVALID');
      const { dek, release } = await dataKey(s, false);
      try {
        const key = chunkKey(dek, Buffer.from(record.salt, 'base64'), aad);
        try { const d = createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv, 'base64')); d.setAAD(Buffer.from(aad)); d.setAuthTag(Buffer.from(record.tag, 'base64'));
          const out = Buffer.concat([d.update(Buffer.from(record.ciphertext, 'base64')), d.final()]);
          if (out.length !== record.size || hash(out) !== record.sha256) fail('BACKUP_READBACK_MISMATCH'); return out; }
        finally { key.fill(0); }
      } finally { release(); }
    },
    clearCache() { for (const k of [...cache.keys()]) evict(k); },
    cacheSize: () => cache.size,
  });
}
/** Reads v1 and v2; writes the version chosen by the operator (default v1 = the already-validated format). */
export function createEnvelopeCodecCompat({ custody, sessionKeys, writeVersion = 'v1', ...opts }) {
  if (!['v1', 'v2'].includes(writeVersion)) fail('ENVELOPE_VERSION_INVALID');
  const v1 = createEnvelopeCodec({ custody }), v2 = sessionKeys ? createEnvelopeCodecV2({ custody, sessionKeys, ...opts }) : null;
  if (writeVersion === 'v2' && !v2) fail('SESSION_KEY_STORE_REQUIRED');
  return Object.freeze({
    seal: (scope, bytes) => (writeVersion === 'v2' ? v2.seal(scope, bytes) : v1.seal(scope, bytes)),
    open: (scope, record) => (record?.schema === 'nexa-backup-v2' ? (v2 ? v2.open(scope, record) : fail('ENVELOPE_V2_UNAVAILABLE')) : v1.open(scope, record)),
    clearCache: () => v2?.clearCache(), writeVersion,
  });
}
