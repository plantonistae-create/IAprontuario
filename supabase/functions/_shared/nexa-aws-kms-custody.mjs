// V5.31 CANDIDATE (NOT DEPLOYED, NO SECRETS HERE): AWS KMS custody adapter with the same {wrap,unwrap} contract as nexa-kms-custody.mjs, no SDK, no proxy.
// Uses the KMS JSON API (Encrypt/Decrypt of the 32-byte data key; the key never leaves KMS unwrapped except inside this isolate) signed with SigV4 via node:crypto.
// Fail-closed: any transport error, timeout, non-200, malformed answer, key-id mismatch or wrong key length throws LAB_CUSTODY_FAILED. Credentials/keys are never logged or placed in errors.
// Binding: the caller's AAD (owner/encounter/session/sequence) goes in the KMS EncryptionContext as its SHA-256, so a wrapped key cannot be replayed under another AAD.
import { Buffer } from 'node:buffer';
import { createHash, createHmac } from 'node:crypto';
const fail = () => { throw Error('LAB_CUSTODY_FAILED'); };
const hex = (b) => createHash('sha256').update(b).digest('hex');
const hmac = (k, d) => createHmac('sha256', k).update(d).digest();
const ARN = /^arn:aws[a-z-]*:kms:[a-z0-9-]+:[0-9]{12}:key\/[0-9a-f-]{36}$/;
/** Pure SigV4 signer (exported for the AWS published test vector). headers must include host (and x-amz-target / content-type as sent). */
export function sigv4({ method, path = '/', query = '', headers, body = '', region, service, accessKeyId, secretAccessKey, sessionToken, amzDate }) {
  const h = { ...headers, 'x-amz-date': amzDate }; if (sessionToken) h['x-amz-security-token'] = sessionToken;
  const names = Object.keys(h).map((k) => k.toLowerCase()).sort(), low = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const canon = [method, path, query, names.map((n) => `${n}:${low[n]}\n`).join(''), names.join(';'), hex(body)].join('\n');
  const day = amzDate.slice(0, 8), scope = `${day}/${region}/${service}/aws4_request`;
  const sts = ['AWS4-HMAC-SHA256', amzDate, scope, hex(canon)].join('\n');
  const key = hmac(hmac(hmac(hmac('AWS4' + secretAccessKey, day), region), service), 'aws4_request');
  const signature = createHmac('sha256', key).update(sts).digest('hex');
  return { signature, headers: { ...h, Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` } };
}
export function createAwsKmsCustody({ region, keyId, previousKeyIds = [], getCredentials, fetchImpl = globalThis.fetch, timeoutMs = 5000, now = () => new Date(), allowCustomEndpoint = null }) {
  if (!/^[a-z]{2}-[a-z]+-[0-9]$/.test(String(region))) throw Error('KMS_ENDPOINT_INVALID');
  if (!ARN.test(String(keyId)) || !previousKeyIds.every((k) => ARN.test(k))) throw Error('KMS_KEY_INVALID');          // full ARN pinned: no alias, no other account/region
  if (typeof getCredentials !== 'function') throw Error('KMS_IDENTITY_REQUIRED');
  const allowed = new Set([keyId, ...previousKeyIds]), host = `kms.${region}.amazonaws.com`, url = allowCustomEndpoint || `https://${host}/`;
  async function call(target, payload) {
    let res;
    try {
      const { accessKeyId, secretAccessKey, sessionToken } = await getCredentials(); if (!accessKeyId || !secretAccessKey) fail();
      const body = JSON.stringify(payload), amzDate = now().toISOString().replace(/[-:]|\.\d{3}/g, '');
      const { headers } = sigv4({ method: 'POST', headers: { host: new URL(url).host, 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': 'TrentService.' + target }, body, region, service: 'kms', accessKeyId, secretAccessKey, sessionToken, amzDate });
      const { host: _h, ...send } = headers;
      res = await fetchImpl(url, { method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit', headers: send, body, signal: AbortSignal.timeout(timeoutMs) });
    } catch { fail(); }
    if (res.status !== 200) fail();
    try { return await res.json(); } catch { fail(); }
  }
  const ctx = (aad) => ({ nexa_aad_sha256: hex(aad) });
  return Object.freeze({
    async wrap({ aad, key }) {
      if (typeof aad !== 'string' || !aad || !Buffer.isBuffer(key) || key.length !== 32) fail();
      const r = await call('Encrypt', { KeyId: keyId, Plaintext: key.toString('base64'), EncryptionContext: ctx(aad) });
      if (!r || r.KeyId !== keyId || typeof r.CiphertextBlob !== 'string' || !r.CiphertextBlob) fail();
      return { keyId: r.KeyId, blob: r.CiphertextBlob };
    },
    async unwrap({ aad, wrapped }) {
      if (typeof aad !== 'string' || !aad || typeof wrapped?.keyId !== 'string' || !allowed.has(wrapped.keyId) || typeof wrapped.blob !== 'string') fail();
      const r = await call('Decrypt', { KeyId: wrapped.keyId, CiphertextBlob: wrapped.blob, EncryptionContext: ctx(aad) });
      const key = r && r.KeyId === wrapped.keyId && typeof r.Plaintext === 'string' ? Buffer.from(r.Plaintext, 'base64') : null;
      if (!key || key.length !== 32) fail();
      return key;
    },
  });
}
