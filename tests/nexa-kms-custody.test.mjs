import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createEnvelopeCodec } from '../supabase/functions/_shared/nexa-audio-backup-core.mjs';
import { createKmsCustody } from '../supabase/functions/_shared/nexa-kms-custody.mjs';

const scope = { ownerId: '11111111-1111-4111-8111-111111111111', encounterId: '33333333-3333-4333-8333-333333333333', sessionId: '44444444-4444-4444-8444-444444444444', sequence: 0, sourceVersion: 1 };
// Synthetic managed KMS: versioned KEKs, current version, per-version disable, bearer identity, AAD-bound wrapping. Lives only in this process.
function fakeKms() {
  const keks = new Map([['kms/v1', randomBytes(32)]]); const disabled = new Set(); let current = 'kms/v1', down = false, hang = false; const token = 'workload-identity-lab';
  const server = createServer((req, res) => {
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
      if (hang) return;                                                     // never answers: the client must time out
      if (down) { res.writeHead(503).end(); return; }
      if (req.headers.authorization !== 'Bearer ' + token) { res.writeHead(401).end(); return; }
      const b = JSON.parse(Buffer.concat(chunks).toString()); const aad = Buffer.from(b.aad_b64, 'base64');
      const out = (code, o) => res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(o));
      if (req.url === '/v1/wrap') {
        const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', keks.get(current), iv); c.setAAD(aad);
        const ct = Buffer.concat([c.update(Buffer.from(b.key_b64, 'base64')), c.final()]);
        return out(200, { key_id: current, blob: Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64') });
      }
      if (req.url === '/v1/unwrap') {
        if (disabled.has(b.key_id) || !keks.has(b.key_id)) return out(403, { error: 'KEY_DISABLED' });
        try { const raw = Buffer.from(b.blob, 'base64'), d = createDecipheriv('aes-256-gcm', keks.get(b.key_id), raw.subarray(0, 12)); d.setAAD(aad); d.setAuthTag(raw.subarray(12, 28));
          return out(200, { key_b64: Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('base64') }); } catch { return out(400, { error: 'UNWRAP_FAILED' }); }
      }
      out(404, {});
    });
  });
  return { server, token, rotate() { keks.set('kms/v2', randomBytes(32)); current = 'kms/v2'; }, disable: id => disabled.add(id), enable: id => disabled.delete(id), setDown: v => { down = v; }, setHang: v => { hang = v; } };
}
test('V5.15 managed-KMS custody adapter: wrap/unwrap through the envelope codec, rotation, revocation, outage, identity, binding (fail-closed)', async () => {
  const k = fakeKms(); await new Promise(r => k.server.listen(0, '127.0.0.1', r)); const endpoint = 'http://127.0.0.1:' + k.server.address().port;
  try {
    assert.throws(() => createKmsCustody({ endpoint, getToken: async () => k.token }), /KMS_ENDPOINT_INVALID/, 'plain http refused outside the loopback LAB');
    assert.throws(() => createKmsCustody({ endpoint: 'https://user:pw@kms.example/', getToken: async () => 't' }), /KMS_ENDPOINT_INVALID/);
    assert.throws(() => createKmsCustody({ endpoint: 'https://kms.example/', getToken: null }), /KMS_IDENTITY_REQUIRED/);
    const custody = createKmsCustody({ endpoint, getToken: async () => k.token, allowLoopbackHttp: true, timeoutMs: 800 });
    const codec = createEnvelopeCodec({ custody }); const bytes = Buffer.from('audio sintetico de teste '.repeat(40));
    const rec1 = await codec.seal(scope, bytes); assert.equal(rec1.wrapped.keyId, 'kms/v1');
    assert.deepEqual(await codec.open(scope, rec1), bytes);
    assert.ok(!JSON.stringify(rec1).includes(bytes.toString('base64').slice(0, 24)), 'ciphertext only');
    // binding: another chunk position/session cannot open it (AAD bound inside the KMS wrap too)
    await assert.rejects(codec.open({ ...scope, sequence: 1 }, rec1));
    await assert.rejects(codec.open({ ...scope, sessionId: '55555555-5555-4555-8555-555555555555' }, rec1));
    // rotation: new data uses v2, old data still opens until v1 is disabled
    k.rotate(); const rec2 = await codec.seal({ ...scope, sequence: 1 }, bytes); assert.equal(rec2.wrapped.keyId, 'kms/v2');
    assert.deepEqual(await codec.open(scope, rec1), bytes); assert.deepEqual(await codec.open({ ...scope, sequence: 1 }, rec2), bytes);
    // revocation of a key version: its data becomes unreadable, other versions unaffected; restoring the version restores access
    k.disable('kms/v1');
    await assert.rejects(codec.open(scope, rec1), /LAB_CUSTODY_FAILED/); assert.deepEqual(await codec.open({ ...scope, sequence: 1 }, rec2), bytes);
    k.enable('kms/v1'); assert.deepEqual(await codec.open(scope, rec1), bytes);
    // wrong / missing workload identity
    const bad = createEnvelopeCodec({ custody: createKmsCustody({ endpoint, getToken: async () => 'stolen-token', allowLoopbackHttp: true }) });
    await assert.rejects(bad.seal(scope, bytes), /LAB_CUSTODY_FAILED/); await assert.rejects(bad.open(scope, rec1), /LAB_CUSTODY_FAILED/);
    const noToken = createEnvelopeCodec({ custody: createKmsCustody({ endpoint, getToken: async () => '', allowLoopbackHttp: true }) });
    await assert.rejects(noToken.seal(scope, bytes), /LAB_CUSTODY_FAILED/);
    // tampered wrapped blob / key id
    await assert.rejects(codec.open(scope, { ...rec1, wrapped: { ...rec1.wrapped, blob: Buffer.from(rec1.wrapped.blob, 'base64').fill(1, 30, 31).toString('base64') } }));
    await assert.rejects(codec.open(scope, { ...rec1, wrapped: { ...rec1.wrapped, keyId: 'kms/../etc' } }));
    // outage and hang: fail closed, never returns plaintext or a fallback key, completes within the timeout
    k.setDown(true); await assert.rejects(codec.seal(scope, bytes), /LAB_CUSTODY_FAILED/); await assert.rejects(codec.open(scope, rec1), /LAB_CUSTODY_FAILED/); k.setDown(false);
    k.setHang(true); const t0 = Date.now(); await assert.rejects(codec.open(scope, rec1), /LAB_CUSTODY_FAILED/); assert.ok(Date.now() - t0 < 3000, 'timeout honoured'); k.setHang(false);
    assert.deepEqual(await codec.open(scope, rec1), bytes, 'recovers when the KMS is back');
  } finally { k.server.closeAllConnections?.(); await new Promise(r => k.server.close(r)); }
});
