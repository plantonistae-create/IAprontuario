// V5.23 — client preservation adapters against the REAL audio-backup handler (in-memory Supabase stand-in, synthetic KMS) over loopback HTTP. No cloud, no real data.
import test from 'node:test'; import assert from 'node:assert/strict'; import http from 'node:http'; import { Buffer } from 'node:buffer';
import { world, A, B, E, S, ORIGIN } from './helpers/audio-backup-world.mjs';
globalThis.window = globalThis; await import('../nexa-preservation-adapters-v523.js');
const P = window.nexaPreservationAdaptersV523;
const buffers = [0, 1, 2].map(i => new Uint8Array(Array.from({ length: 700 }, (_, k) => (k * 7 + i * 31) & 255)).buffer);
const authority = (granted = true) => ({ transport: () => ({ grant: async (enc, purpose) => ({ authorized: granted && purpose === 'clinical_backup', reason: granted ? null : 'ASSISTANCE_GRANT_REQUIRED' }) }) });
const vault = { chunkBuffers: async () => ({ buffers, mime: 'audio/webm;codecs=opus', finalized: true }) };
async function up(w, token = 'tok-A') {
  const h = w.mk(), srv = http.createServer(async (rq, rs) => { const chunks = []; for await (const c of rq) chunks.push(c); const body = Buffer.concat(chunks);
    const r = await h(new Request('http://x' + rq.url.replace(/^\/functions\/v1\/audio-backup/, '/functions/v1/audio-backup'), { method: rq.method, headers: { ...rq.headers, Origin: ORIGIN }, body: ['GET', 'HEAD'].includes(rq.method) ? undefined : body }));
    rs.writeHead(r.status, Object.fromEntries(r.headers)); rs.end(Buffer.from(await r.arrayBuffer())); }).listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  const sb = { auth: { getSession: async () => ({ data: { session: { access_token: token } } }) } };
  return { srv, sb, url: 'http://127.0.0.1:' + srv.address().port };
}
const scope = o => ({ ownerId: o, encounterId: E, sessionId: S, sourceVersion: 1 });
test('V5.23 adapters: start() is inert unless both flags are on and modules exist', () => {
  assert.deepEqual(P.start({ flags: { remotePreservation: false, assistAuthority: true } }), { started: false, reason: 'FLAG_OFF' });
  assert.deepEqual(P.start({ flags: {} }), { started: false, reason: 'FLAG_OFF' });
  assert.deepEqual(P.start({ flags: { remotePreservation: true, assistAuthority: false } }), { started: false, reason: 'AUTHORITY_REQUIRED' });
  assert.equal(P.start({ flags: { remotePreservation: true, assistAuthority: true } }).reason, 'MODULES_MISSING');
});
test('V5.23 adapters: endpoint must be https (loopback http only when explicitly allowed)', () => {
  const mk = (url, allow) => P.backup({ sb: { auth: { getSession() {} } }, supabaseUrl: url, anonKey: 'a', authority: authority(), vault, owner: () => A, allowLoopbackHttp: allow });
  assert.throws(() => mk('http://project.supabase.co', false), /PRESERVATION_ENDPOINT_INVALID/); assert.throws(() => mk('http://192.168.1.5:8000', true), /PRESERVATION_ENDPOINT_INVALID/);
  assert.throws(() => mk('https://user:pw@project.supabase.co', false), /PRESERVATION_ENDPOINT_INVALID/); assert.doesNotThrow(() => mk('https://project.supabase.co', false));
});
test('V5.23 adapters: backup sync with byte-for-byte readback, idempotent replay, owner change, denied grant, corrupted server copy', async () => {
  const w = world(); w.grants.add(`${A}|${E}`); const { srv, sb, url } = await up(w);
  try {
    let owner = A; const mk = (extra = {}) => P.backup({ sb, supabaseUrl: url, anonKey: 'anon', authority: authority(), vault, owner: () => owner, allowLoopbackHttp: true, ...extra });
    const b = mk();
    assert.deepEqual(await b.register(scope(A)), { registered: true, reason: null });
    assert.equal((await mk({ authority: authority(false) }).register(scope(A))).registered, false, 'no server grant => not registered');
    const res = await b.syncChunks(scope(A), buffers, 'audio/webm; codecs=opus'); assert.equal(res.readback, true); assert.match(res.manifest.digest, /^[0-9a-f]{64}$/);
    const again = await b.syncChunks(scope(A), buffers, 'audio/webm;codecs=opus'); assert.equal(again.manifest.digest, res.manifest.digest, 'a second pass (retry after crash) is idempotent');
    assert.equal(w.manifests.size, 1);
    assert.equal((await b.putChunk(scope(A), 0, buffers[0])).duplicate, true, 'replaying an existing chunk of a sealed session is idempotent');
    await assert.rejects(b.putChunk(scope(A), 3, buffers[0]), /PRESERVATION_HTTP_409/, 'a sealed session refuses NEW chunks');
    owner = B; await assert.rejects(b.syncChunks(scope(A), buffers, 'audio/webm'), /PRESERVATION_OWNER_CHANGED/); owner = A;
    await assert.rejects(b.syncChunks({ ...scope(A), encounterId: 'not-a-uuid' }, buffers, 'audio/webm'), /PRESERVATION_SCOPE_REQUIRED/);
    await assert.rejects(b.syncChunks(scope(A), buffers, 'application/json'), /PRESERVATION_AUDIO_INVALID/);
    // a server that returns a DIFFERENT chunk on readback must be caught (fresh session so the manifest is not sealed yet)
    const w2 = world(); w2.grants.add(`${A}|${E}`); const u2 = await up(w2);
    try { const orig = w2.chunks.set.bind(w2.chunks); const real = u2.srv.listeners('request')[0];
      const bad = P.backup({ sb: u2.sb, supabaseUrl: u2.url, anonKey: 'a', authority: authority(), vault, owner: () => A, allowLoopbackHttp: true, fetchImpl: async (u, init) => { const r = await fetch(u, init); if (init.method === 'GET' && String(u).includes('/chunks')) return new Response(new Uint8Array(700).fill(9), { status: 200 }); return r; } });
      await assert.rejects(bad.syncChunks(scope(A), buffers, 'audio/webm'), /PRESERVATION_READBACK_MISMATCH/, 'never "verified" when the readback differs'); void orig; void real;
    } finally { u2.srv.close(); }
  } finally { srv.close(); }
});
test('V5.23 adapters: capture transport maps to the four public RPCs and never sends an owner', async () => {
  const calls = []; const sb = { rpc: async (name, args) => { calls.push([name, Object.keys(args)]); return { data: name.endsWith('read_chain') ? [{ seq: 1 }] : { appended: true, seq: 1 }, error: null }; } };
  const c = P.capture({ sb });
  assert.equal((await c.append(E, 'radar', { a: 1 }, 1)).appended, true); assert.equal((await c.readChain(E)).length, 1); await c.verifyChain(E);
  assert.deepEqual(calls.map(x => x[0]), ['nexa_capture_append', 'nexa_capture_read_chain', 'nexa_capture_verify_chain']);
  assert.ok(calls.every(([, keys]) => !keys.some(k => /owner|user/.test(k))), 'identity is the server\'s auth.uid(), never a client field');
  const bad = P.capture({ sb: { rpc: async () => ({ data: null, error: { code: '42501', message: 'secret detail' } }) } });
  await assert.rejects(bad.append(E, 'radar', {}, 1), e => e.message === 'CAPTURE_RPC_42501', 'errors carry a code only, never server text');
});

test('V5.24 adapters: confirmRemote and remote recovery of a (locally purged) session, verified against the manifest', async () => {
  const w = world(); w.grants.add(`${A}|${E}`); const { srv, sb, url } = await up(w);
  try {
    const b = P.backup({ sb, supabaseUrl: url, anonKey: 'anon', authority: authority(), vault, owner: () => A, allowLoopbackHttp: true });
    const synced = await b.syncChunks(scope(A), buffers, 'audio/webm;codecs=opus');
    assert.equal(await b.confirmRemote(scope(A), synced.manifest.digest), true, 'fresh confirmation with the recorded digest');
    assert.equal(await b.confirmRemote(scope(A), 'f'.repeat(64)), false, 'a different digest is not a confirmation');
    await assert.rejects(b.confirmRemote({ ...scope(A), sessionId: '99999999-9999-4999-8999-999999999999' }, synced.manifest.digest), /PRESERVATION_HTTP_404/, 'unknown session: no confirmation');
    const r = await b.recover(scope(A)); assert.equal(r.manifest.chunks, 3); const got = Buffer.from(await r.blob.arrayBuffer()), want = Buffer.concat(buffers.map(x => Buffer.from(x)));
    assert.deepEqual(got, want, 'the recovered audio equals the original bytes');
    owner_check: { const other = P.backup({ sb, supabaseUrl: url, anonKey: 'anon', authority: authority(), vault, owner: () => B, allowLoopbackHttp: true }); await assert.rejects(other.recover(scope(A)), /PRESERVATION_OWNER_CHANGED/); }
  } finally { srv.close(); }
});

test('V5.25 multi-device: device 2 (no local vault) lists the owner\'s backups and recovers byte-identical audio; list is validated', async () => {
  const w = world(); w.grants.add(`${A}|${E}`); const { srv, sb, url } = await up(w);
  try {
    const mk = (o) => P.backup({ sb, supabaseUrl: url, anonKey: 'anon', authority: authority(), vault, owner: () => o, allowLoopbackHttp: true });
    const dev1 = mk(A); await dev1.syncChunks(scope(A), buffers, 'audio/webm;codecs=opus');
    const dev2 = mk(A), list = await dev2.listRemote(); assert.equal(list.length, 1); assert.equal(list[0].session_id, S); assert.equal(list[0].chunk_count, 3); assert.equal(list[0].total_bytes, 3 * 700);
    const rec = await dev2.recover({ ownerId: A, encounterId: list[0].encounter_id, sessionId: list[0].session_id, sourceVersion: list[0].source_version });
    assert.deepEqual(Buffer.from(await rec.blob.arrayBuffer()), Buffer.concat(buffers.map(x => Buffer.from(x))), 'device 2 gets exactly what device 1 recorded');
    await assert.rejects(mk(B).listRemote(), /PRESERVATION_LIST_MISMATCH/, 'a list that does not belong to the signed-in owner is refused');
    const evil = P.backup({ sb, supabaseUrl: url, anonKey: 'a', authority: authority(), vault, owner: () => A, allowLoopbackHttp: true, fetchImpl: async () => Response.json({ ownerId: A, trainingAuthorized: false, sessions: [{ encounter_id: 'x' }, { encounter_id: E, session_id: S, source_version: 1, mime: 'text/html', chunk_count: 1, digest: 'a'.repeat(64), committed_at: new Date().toISOString() }, null] }) });
    assert.deepEqual(await evil.listRemote(), [], 'malformed rows and non-audio mime types are dropped');
    const flagged = P.backup({ sb, supabaseUrl: url, anonKey: 'a', authority: authority(), vault, owner: () => A, allowLoopbackHttp: true, fetchImpl: async () => Response.json({ ownerId: A, trainingAuthorized: true, sessions: [] }) }); await assert.rejects(flagged.listRemote(), /PRESERVATION_LIST_MISMATCH/);
  } finally { srv.close(); }
});
