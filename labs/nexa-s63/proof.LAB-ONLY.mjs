// Ordered UTF-8 JSON tuples with domain/version prefixes are the canonical encoding.
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';

export const sha = value => createHash('sha256').update(value).digest('hex');
export const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
export const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const pack = value => Buffer.from(JSON.stringify(value), 'utf8');
const protocol = 'nexa-s63-canonical-proof-v1';
const issuer = 'nexa-s63-ephemeral-lab';
const audience = 'nexa-s63-offline-worker';
const environment = 'synthetic-lab';
const lifetime = 15000;
const fields = [
  'issuer','key_id','audience','environment','schema_version','owner_id','encounter_id',
  'count','head','snapshot_digest','issued_at','expires_at','nonce',
];

function canonicalObject(text) {
  if (typeof text !== 'string') throw Error('S63_CANONICAL_REQUIRED');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw Error('S63_CANONICAL_REQUIRED'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('S63_CANONICAL_REQUIRED');
  return parsed;
}

export function verifySnapshot(snapshot) {
  const { request: r, records, derivatives, count, head, classification, grant } = snapshot ?? {};
  if (!r || ![r.id, r.owner_id, r.encounter_id, grant?.id].every(uuid)
      || classification !== 'synthetic' || !digest(head) || r.head !== head
      || !['asr','documentation','radar'].includes(r.task) || !['evaluation','training'].includes(r.purpose)
      || r.modality !== (r.task === 'asr' ? 'text' : 'structured') || r.policy !== 's63-synthetic-v1'
      || !/^synthetic-[a-z0-9-]{1,40}$/.test(r.dataset) || !Number.isSafeInteger(grant.revision) || grant.revision < 1
      || typeof grant.issuer !== 'string' || typeof grant.reviewer !== 'string' || grant.issuer === grant.reviewer
      || !Array.isArray(records) || records.length !== count || count < 1 || count > 256 || !Array.isArray(derivatives)
      || derivatives.length > count) throw Error('S63_SNAPSHOT_SCOPE');
  let parent = '0'.repeat(64);
  const tuples = records.map((row, index) => {
    canonicalObject(row.payload_canonical);
    if (row.seq !== index + 1 || row.parent_digest !== parent || typeof row.kind !== 'string' || row.kind.includes('|')
        || sha(row.payload_canonical) !== row.payload_digest) throw Error('S63_CHAIN_INVALID');
    const computed = sha([r.owner_id,r.encounter_id,row.seq,row.kind,row.payload_digest,parent].join('|'));
    if (computed !== row.record_digest) throw Error('S63_CHAIN_INVALID');
    parent = computed;
    return [row.seq,row.kind,row.payload_canonical,row.payload_digest,row.parent_digest,row.record_digest];
  });
  if (parent !== head) throw Error('S63_CHAIN_INVALID');
  const derivedTuples = derivatives.map(row => {
    canonicalObject(row.payload_canonical);
    if (!digest(row.source_digest) || !digest(row.digest) || sha(row.payload_canonical) !== row.digest
        || row.transformation !== 's63-deid-fixture-v1' || typeof row.reviewer !== 'string'
        || row.reviewer === grant.issuer) throw Error('S63_DERIVATIVE_INVALID');
    return [row.source_digest,row.payload_canonical,row.digest,row.transformation,row.reviewer];
  });
  return sha(pack(['nexa-s63-snapshot-v1',classification,r.id,r.owner_id,r.encounter_id,head,count,r.task,r.purpose,
    r.modality,r.policy,r.dataset,grant.id,grant.revision,grant.issuer,grant.reviewer,tuples,derivedTuples]));
}

function validClock(now) {
  if (!Number.isSafeInteger(now) || now <= 0 || now > 8.64e15 - lifetime) throw Error('S63_CLOCK_INVALID');
}
const canonical = claims => pack([protocol, ...fields.map(key => claims[key])]);
const fingerprint = key => sha(key.export({ format: 'der', type: 'spki' }));

export function ephemeralLabSigner() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const keyId = fingerprint(publicKey);
  return Object.freeze({
    keyId, publicKey,
    attest(snapshot, now = Date.now()) {
      validClock(now);
      const snapshotDigest = verifySnapshot(snapshot);
      const claims = Object.freeze({ issuer, key_id: keyId, audience, environment, schema_version: protocol,
        owner_id: snapshot.request.owner_id, encounter_id: snapshot.request.encounter_id, count: snapshot.count,
        head: snapshot.head, snapshot_digest: snapshotDigest, issued_at: new Date(now).toISOString(),
        expires_at: new Date(now + lifetime).toISOString(), nonce: snapshot.request.id });
      return Object.freeze({ claims, signature: sign(null, canonical(claims), privateKey).toString('base64url') });
    },
  });
}

export function createLabTrustStore() {
  const keys = new Map();
  const revoked = new Set();
  return Object.freeze({
    pin(publicKey) {
      if (publicKey?.type !== 'public' || publicKey.asymmetricKeyType !== 'ed25519') throw Error('S63_KEY_TYPE');
      const id = fingerprint(publicKey);
      if (revoked.has(id)) throw Error('S63_KEY_REVOKED');
      keys.set(id, publicKey);
      return id;
    },
    revoke(keyId) { revoked.add(keyId); keys.delete(keyId); },
    verify(envelope, snapshot, requestId, now = Date.now()) {
      validClock(now);
      const { claims, signature } = envelope ?? {};
      if (!claims || Object.keys(claims).length !== fields.length || !fields.every(key => Object.hasOwn(claims,key))
          || claims.issuer !== issuer || claims.audience !== audience || claims.environment !== environment
          || claims.schema_version !== protocol || claims.nonce !== requestId || !uuid(requestId)
          || typeof signature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(signature)) throw Error('S63_PROOF_SCOPE');
      const key = keys.get(claims.key_id);
      if (!key) throw Error('S63_UNTRUSTED_KEY');
      const bytes = Buffer.from(signature, 'base64url');
      if (bytes.toString('base64url') !== signature || !verify(null, canonical(claims), key, bytes)) throw Error('S63_BAD_SIGNATURE');
      const issued = Date.parse(claims.issued_at), expires = Date.parse(claims.expires_at);
      if (!Number.isFinite(issued) || !Number.isFinite(expires) || new Date(issued).toISOString() !== claims.issued_at
          || new Date(expires).toISOString() !== claims.expires_at || issued > now || expires <= now
          || expires - issued !== lifetime) throw Error('S63_PROOF_EXPIRED_OR_FUTURE');
      if (snapshot?.request?.id !== requestId || claims.owner_id !== snapshot.request.owner_id
          || claims.encounter_id !== snapshot.request.encounter_id || claims.head !== snapshot.head
          || claims.count !== snapshot.count || claims.snapshot_digest !== verifySnapshot(snapshot)) throw Error('S63_PROOF_SNAPSHOT_MISMATCH');
      return claims;
    },
  });
}
