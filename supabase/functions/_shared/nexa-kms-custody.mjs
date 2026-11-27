// V5.23 CANDIDATE (NOT DEPLOYED; from the V5.15 lab-validated adapter): managed-KMS custody adapter for the V5.13 envelope codec ({wrap({aad,key})->{keyId,blob}, unwrap({aad,wrapped})->Buffer}).
import { Buffer } from 'node:buffer';
// No secret lives here: the caller supplies getToken() (workload identity) and the endpoint of a managed KMS/HSM front (e.g. a cloud KMS proxy). Production endpoints must be https.
// Fail-closed by construction: any transport error, timeout, non-200, malformed answer or wrong key length throws LAB_CUSTODY_FAILED. Key material is never logged or put in errors.
const KEY_ID = /^[A-Za-z0-9:_./-]{3,200}$/;
const fail = () => { throw Error('LAB_CUSTODY_FAILED'); };
export function createKmsCustody({ endpoint, getToken, fetchImpl = globalThis.fetch, timeoutMs = 5000, allowLoopbackHttp = false }) {
  const base = new URL(endpoint);
  const loop = ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname);
  if (base.username || base.password || base.search || base.hash || (base.protocol !== 'https:' && !(allowLoopbackHttp && loop && base.protocol === 'http:'))) throw Error('KMS_ENDPOINT_INVALID');
  if (typeof getToken !== 'function') throw Error('KMS_IDENTITY_REQUIRED');
  async function call(path, body) {
    let res;
    try {
      const token = await getToken();
      if (typeof token !== 'string' || !token) fail();
      res = await fetchImpl(new URL(path, base), { method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    } catch { fail(); }
    if (res.status !== 200) fail();
    try { return await res.json(); } catch { fail(); }
  }
  return Object.freeze({
    async wrap({ aad, key }) {
      if (typeof aad !== 'string' || !aad || !Buffer.isBuffer(key) || key.length !== 32) fail();
      const r = await call('/v1/wrap', { aad_b64: Buffer.from(aad).toString('base64'), key_b64: key.toString('base64') });
      if (!r || typeof r.key_id !== 'string' || !KEY_ID.test(r.key_id) || typeof r.blob !== 'string' || !r.blob) fail();
      return { keyId: r.key_id, blob: r.blob };
    },
    async unwrap({ aad, wrapped }) {
      if (typeof aad !== 'string' || !aad || typeof wrapped?.keyId !== 'string' || !KEY_ID.test(wrapped.keyId) || typeof wrapped.blob !== 'string') fail();
      const r = await call('/v1/unwrap', { aad_b64: Buffer.from(aad).toString('base64'), key_id: wrapped.keyId, blob: wrapped.blob });
      const key = typeof r?.key_b64 === 'string' ? Buffer.from(r.key_b64, 'base64') : null;
      if (!key || key.length !== 32) fail();
      return key;
    },
  });
}
