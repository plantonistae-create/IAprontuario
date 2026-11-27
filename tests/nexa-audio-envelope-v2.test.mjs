import test from 'node:test'; import assert from 'node:assert/strict'; import { Buffer } from 'node:buffer'; import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createEnvelopeCodecV2, createEnvelopeCodecCompat, sessionKeyId } from '../supabase/functions/_shared/nexa-audio-envelope-v2.mjs'; import { createEnvelopeCodec } from '../supabase/functions/_shared/nexa-audio-backup-core.mjs';
const O = '11111111-1111-4111-8111-111111111111', E = '33333333-3333-4333-8333-333333333333', S = '44444444-4444-4444-8444-444444444444', S2 = '55555555-5555-4555-8555-555555555555';
const sc = (seq = 0, o = {}) => ({ ownerId: O, encounterId: E, sessionId: S, sequence: seq, sourceVersion: 1, ...o });
function kms() { const kek = randomBytes(32); const c = { wraps: 0, unwraps: 0, down: false, revoked: false };
  c.custody = { async wrap({ aad, key }) { if (c.down) throw Error('KMS_DOWN'); c.wraps++; const iv = randomBytes(12), x = createCipheriv('aes-256-gcm', kek, iv); x.setAAD(Buffer.from(aad)); const ct = Buffer.concat([x.update(key), x.final()]); return { keyId: 'kms/v1', blob: Buffer.concat([iv, x.getAuthTag(), ct]).toString('base64') }; },
    async unwrap({ aad, wrapped }) { if (c.down || c.revoked) throw Error('KMS_DOWN'); c.unwraps++; const raw = Buffer.from(wrapped.blob, 'base64'), d = createDecipheriv('aes-256-gcm', kek, raw.subarray(0, 12)); d.setAAD(Buffer.from(aad)); d.setAuthTag(raw.subarray(12, 28)); return Buffer.concat([d.update(raw.subarray(28)), d.final()]); } }; return c; }
const keyStore = () => { const m = new Map(); return { m, async read(k) { return m.get(k) ?? null }, async insertIfAbsent(k, v) { await new Promise(r => setTimeout(r, Math.random() * 3)); if (m.has(k)) return false; m.set(k, v); return true } } };
const data = n => Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 7 + n) & 255));
test('v2 round trip; every chunk bound to owner/encounter/session/sequence/version; tampering of any field is detected', async () => {
  const k = kms(), ks = keyStore(), c = createEnvelopeCodecV2({ custody: k.custody, sessionKeys: ks }); const rec = await c.seal(sc(3), data(3)); assert.equal(rec.schema, 'nexa-backup-v2');
  assert.deepEqual(await c.open(sc(3), rec), data(3)); assert.ok(!JSON.stringify(rec).includes(data(3).toString('base64').slice(0, 20)));
  for (const bad of [sc(4), sc(3, { ownerId: '22222222-2222-4222-8222-222222222222' }), sc(3, { encounterId: '66666666-6666-4666-8666-666666666666' }), sc(3, { sourceVersion: 2 })]) await assert.rejects(c.open(bad, rec));
  await assert.rejects(c.open(sc(3, { sessionId: S2 }), rec), /BACKUP_SESSION_KEY_MISSING/, 'another session has no key and cannot decrypt');
  for (const f of ['ciphertext', 'tag', 'iv', 'salt']) { const b = Buffer.from(rec[f], 'base64'); b[0] ^= 1; await assert.rejects(c.open(sc(3), { ...rec, [f]: b.toString('base64') }), undefined, 'tampered ' + f); }
  await assert.rejects(c.open(sc(3), { ...rec, sha256: 'a'.repeat(64) }), /BACKUP_READBACK_MISMATCH/); await assert.rejects(c.open(sc(3), { ...rec, schema: 'nexa-backup-v1' }), /BACKUP_RECORD_INVALID/);
  const r2 = await c.seal(sc(4), data(3)); assert.notEqual(r2.salt, rec.salt); assert.notEqual(r2.ciphertext, (await c.seal(sc(3), data(3))).ciphertext, 'fresh salt+IV per chunk: same plaintext never repeats');
});
test('KMS calls: v2 = 1 wrap per session and 0 extra with the cache; without the cache 1 unwrap per operation; v1 would be 2 per chunk for seal+verify', async () => {
  const N = 50, k = kms(), c = createEnvelopeCodecV2({ custody: k.custody, sessionKeys: keyStore() });
  for (let i = 0; i < N; i++) { const r = await c.seal(sc(i), data(i)); assert.deepEqual(await c.open(sc(i), r), data(i)); }
  assert.deepEqual([k.wraps, k.unwraps], [1, 0], '50 chunks sealed AND verified: one wrap, zero unwraps (warm cache)');
  c.clearCache(); const r = await c.seal(sc(51), data(1)); assert.equal(k.unwraps, 1, 'cold isolate: one unwrap re-establishes the key');
  const k0 = kms(), nc = createEnvelopeCodecV2({ custody: k0.custody, sessionKeys: keyStore(), cacheTtlMs: 0 }); for (let i = 0; i < 10; i++) { const x = await nc.seal(sc(i), data(i)); await nc.open(sc(i), x); }
  assert.deepEqual([k0.wraps, k0.unwraps], [1, 19], 'cache disabled: 1 wrap + 1 unwrap per later operation (still far below v1)');
  const k1 = kms(), v1 = createEnvelopeCodec({ custody: k1.custody }); for (let i = 0; i < 10; i++) { const x = await v1.seal(sc(i, { sourceVersion: 1 }), data(i)); await v1.open(sc(i), x); } assert.deepEqual([k1.wraps, k1.unwraps], [10, 10], 'v1 baseline: 1 wrap + 1 unwrap per chunk for seal+verify alone');
});
test('cache is bounded (TTL, size) and zeroized; revocation takes effect after the TTL / clearCache; outage fails closed', async () => {
  let t = 0; const k = kms(), ks = keyStore(), c = createEnvelopeCodecV2({ custody: k.custody, sessionKeys: ks, cacheTtlMs: 1000, cacheMax: 2, now: () => t });
  const r = await c.seal(sc(0), data(0)); assert.equal(c.cacheSize(), 1); k.revoked = true; assert.deepEqual(await c.open(sc(0), r), data(0), 'inside the TTL the cached key still serves (documented trade-off)');
  t = 1500; await assert.rejects(c.open(sc(0), r), /KMS_DOWN/, 'after the TTL a revoked KMS key makes the session unreadable'); assert.equal(c.cacheSize(), 0);
  k.revoked = false; for (const s of [S, S2, '77777777-7777-4777-8777-777777777777']) await c.seal(sc(0, { sessionId: s }), data(1)); assert.ok(c.cacheSize() <= 2, 'size cap');
  k.revoked = true; c.clearCache(); await assert.rejects(c.open(sc(0), r), /KMS_DOWN/, 'clearCache = immediate effect');
  const down = kms(); down.down = true; await assert.rejects(createEnvelopeCodecV2({ custody: down.custody, sessionKeys: keyStore() }).seal(sc(0), data(0)), /KMS_DOWN/);
});
test('first-chunk race: concurrent seals converge on ONE stored key and every chunk opens', async () => {
  const k = kms(), ks = keyStore(), a = createEnvelopeCodecV2({ custody: k.custody, sessionKeys: ks }), b = createEnvelopeCodecV2({ custody: k.custody, sessionKeys: ks });   // two isolates, no shared cache
  const recs = await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).seal(sc(i), data(i)))); assert.equal(ks.m.size, 1, 'one session key row');
  const reader = createEnvelopeCodecV2({ custody: k.custody, sessionKeys: ks }); for (let i = 0; i < 12; i++) assert.deepEqual(await reader.open(sc(i), recs[i]), data(i));
});
test('compat codec: reads v1 and v2, writes the chosen version (default v1); v1 codec cannot read v2', async () => {
  const k = kms(), ks = keyStore(), v1 = createEnvelopeCodec({ custody: k.custody }), w1 = createEnvelopeCodecCompat({ custody: k.custody, sessionKeys: ks }), w2 = createEnvelopeCodecCompat({ custody: k.custody, sessionKeys: ks, writeVersion: 'v2' });
  const old = await v1.seal(sc(0), data(0)), neu = await w2.seal(sc(1), data(1)); assert.equal(old.schema, 'nexa-backup-v1'); assert.equal(neu.schema, 'nexa-backup-v2'); assert.equal((await w1.seal(sc(2), data(2))).schema, 'nexa-backup-v1', 'default write stays v1');
  for (const c of [w1, w2]) { assert.deepEqual(await c.open(sc(0), old), data(0)); assert.deepEqual(await c.open(sc(1), neu), data(1)); } await assert.rejects(v1.open(sc(1), neu));
  assert.throws(() => createEnvelopeCodecCompat({ custody: k.custody, writeVersion: 'v2' }), /SESSION_KEY_STORE_REQUIRED/); assert.throws(() => createEnvelopeCodecCompat({ custody: k.custody, writeVersion: 'v3' }), /ENVELOPE_VERSION_INVALID/);
  assert.equal(sessionKeyId({ ownerId: O, encounterId: E, sessionId: S, sourceVersion: 1 }), JSON.stringify([O, E, S, 1]));
});

test('an eviction while an operation is in flight cannot corrupt it (private key copies)', async () => {
  const k = kms(), c = createEnvelopeCodecV2({ custody: k.custody, sessionKeys: keyStore(), cacheMax: 1 }); const rec = await c.seal(sc(0), data(0));
  const ops = []; for (let i = 0; i < 20; i++) { ops.push(c.open(sc(0), rec)); if (i % 3 === 0) await c.seal(sc(0, { sessionId: S2 }), data(1)); }   // keeps evicting S while opens are running
  for (const r of await Promise.all(ops)) assert.deepEqual(r, data(0));
});
