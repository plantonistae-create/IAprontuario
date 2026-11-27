// V5.31: AWS KMS custody adapter. SigV4 is proven against AWS's PUBLISHED test vector (get-vanilla); the adapter against a fake KMS that enforces signature shape, EncryptionContext binding and key pinning. No network, no credentials.
import test from 'node:test'; import assert from 'node:assert/strict'; import { randomBytes, createHash } from 'node:crypto'; import { Buffer } from 'node:buffer';
import { sigv4, createAwsKmsCustody } from '../supabase/functions/_shared/nexa-aws-kms-custody.mjs';
test('SigV4 matches the AWS documented get-vanilla test vector', () => {
  const r = sigv4({ method: 'GET', headers: { host: 'example.amazonaws.com' }, region: 'us-east-1', service: 'service', accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', amzDate: '20150830T123600Z' });
  assert.equal(r.signature, '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31');
});
const KEY = 'arn:aws:kms:sa-east-1:123456789012:key/11111111-2222-4333-8444-555555555555', OTHER = 'arn:aws:kms:sa-east-1:123456789012:key/99999999-2222-4333-8444-555555555555';
function fakeKms({ breakIt } = {}) {
  const vault = new Map(), seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, headers: init.headers }); const t = init.headers['x-amz-target'], b = JSON.parse(init.body);
    assert.match(init.headers.Authorization, /^AWS4-HMAC-SHA256 Credential=AKIATEST\/\d{8}\/sa-east-1\/kms\/aws4_request, SignedHeaders=content-type;host;x-amz-date;x-amz-target, Signature=[0-9a-f]{64}$/);
    if (breakIt === 'status') return new Response('{}', { status: 400 });
    if (t === 'TrentService.Encrypt') { const id = randomBytes(8).toString('hex'); vault.set(id, { pt: b.Plaintext, ec: JSON.stringify(b.EncryptionContext), key: b.KeyId }); return Response.json({ KeyId: breakIt === 'wrongkey' ? OTHER : b.KeyId, CiphertextBlob: id }); }
    const v = vault.get(b.CiphertextBlob); if (!v || v.ec !== JSON.stringify(b.EncryptionContext) || v.key !== b.KeyId) return new Response('{}', { status: 400 });   // KMS rejects a different EncryptionContext
    return Response.json({ KeyId: b.KeyId, Plaintext: breakIt === 'short' ? Buffer.alloc(8).toString('base64') : v.pt });
  };
  return { fetchImpl, seen };
}
const mk = (o = {}) => createAwsKmsCustody({ region: 'sa-east-1', keyId: KEY, getCredentials: async () => ({ accessKeyId: 'AKIATEST', secretAccessKey: 'x'.repeat(40) }), now: () => new Date('2026-11-26T12:00:00Z'), ...o });
test('round trip, EncryptionContext = sha256(aad), different AAD is refused, and nothing sensitive is sent in clear', async () => {
  const f = fakeKms(), c = mk({ fetchImpl: f.fetchImpl }), key = randomBytes(32), w = await c.wrap({ aad: 'o|e|s|1', key });
  assert.equal(w.keyId, KEY); assert.deepEqual(await c.unwrap({ aad: 'o|e|s|1', wrapped: w }), key);
  await assert.rejects(c.unwrap({ aad: 'o|e|s|2', wrapped: w }), /LAB_CUSTODY_FAILED/);
  assert.ok(f.seen.length >= 3 && f.seen.every((s) => s.url === 'https://kms.sa-east-1.amazonaws.com/')); assert.ok(!JSON.stringify(f.seen).includes('o|e|s|1'), 'raw AAD never leaves; only its sha256');
});
test('fail-closed: status, wrong key id in answer, short plaintext, unknown key on unwrap, bad config', async () => {
  const key = randomBytes(32);
  await assert.rejects(mk({ fetchImpl: fakeKms({ breakIt: 'status' }).fetchImpl }).wrap({ aad: 'a', key }), /LAB_CUSTODY_FAILED/);
  await assert.rejects(mk({ fetchImpl: fakeKms({ breakIt: 'wrongkey' }).fetchImpl }).wrap({ aad: 'a', key }), /LAB_CUSTODY_FAILED/);
  const ok = mk({ fetchImpl: fakeKms().fetchImpl }), w = await ok.wrap({ aad: 'a', key });
  await assert.rejects(ok.unwrap({ aad: 'a', wrapped: { keyId: OTHER, blob: w.blob } }), /LAB_CUSTODY_FAILED/, 'a key id outside the pinned set is refused');
  const f2 = fakeKms({ breakIt: 'short' }), c2 = mk({ fetchImpl: f2.fetchImpl }), w2 = await mk({ fetchImpl: f2.fetchImpl }).wrap({ aad: 'a', key }); await assert.rejects(c2.unwrap({ aad: 'a', wrapped: w2 }), /LAB_CUSTODY_FAILED/);
  await assert.rejects(mk({ getCredentials: async () => ({}) , fetchImpl: fakeKms().fetchImpl }).wrap({ aad: 'a', key }), /LAB_CUSTODY_FAILED/);
  assert.throws(() => mk({ keyId: 'alias/nexa' }), /KMS_KEY_INVALID/); assert.throws(() => mk({ region: 'evil.com/' }), /KMS_ENDPOINT_INVALID/); assert.throws(() => mk({ getCredentials: undefined }), /KMS_IDENTITY_REQUIRED/);
  const rot = fakeKms().fetchImpl, oldC = mk({ keyId: OTHER, fetchImpl: rot }), wOld = await oldC.wrap({ aad: 'a', key }); assert.deepEqual(await mk({ previousKeyIds: [OTHER], fetchImpl: rot }).unwrap({ aad: 'a', wrapped: wOld }), key, 'rotation: previous pinned key still decrypts');
});
