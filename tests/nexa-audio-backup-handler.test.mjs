import test from 'node:test'; import assert from 'node:assert/strict'; import { Buffer } from 'node:buffer';
import { world, req, A, B, E, S, ORIGIN } from './helpers/audio-backup-world.mjs';
test('V5.23 audio-backup handler: fail-closed gates', async () => {
  const w = world();
  assert.equal((await w.mk({ NEXA_AUDIO_BACKUP: '' })(req('chunks&seq=0'.replace('&', '?x=1&')))).status, 503, 'default OFF');
  assert.equal((await w.mk({ SUPABASE_SERVICE_ROLE_KEY: '' })(req('chunks', { method: 'PUT', body: 'x', extra: '&seq=0' }))).status, 503, 'unconfigured');
  assert.equal((await w.mk({ NEXA_ASSIST_GATE_AUDIO_BACKUP: 'hard-stop' })(req('chunks', { method: 'PUT', body: 'x', extra: '&seq=0' }))).status, 423, 'hard stop wins');
  assert.equal((await w.mk()(req('chunks', { method: 'PUT', body: 'x', extra: '&seq=0', origin: 'https://evil.example' }))).status, 403, 'origin');
  assert.equal((await w.mk()(req('chunks', { method: 'PUT', body: 'x', extra: '&seq=0', token: null }))).status, 401, 'no JWT');
  assert.equal((await w.mk()(req('chunks', { method: 'PUT', body: 'x', extra: '&seq=0', token: 'tok-X' }))).status, 401, 'bad JWT');
  assert.equal((await w.mk()(req('chunks', { method: 'PUT', body: 'x', extra: '&seq=0&owner=' + B }))).status, 400, 'owner is never client-supplied');
  assert.equal((await w.mk()(req('chunks', { method: 'PUT', body: 'x', extra: '&seq=0&purpose=training' }))).status, 400, 'purpose is never client-supplied');
  assert.equal((await w.mk()(req('chunks', { method: 'PUT', body: 'x', extra: '&seq=0', token: 'tok-B' }))).status, 403, 'no live clinical_backup grant for B');
  assert.equal(w.chunks.size, 0, 'nothing stored by any denied call'); assert.equal(w.kmsCalls(), 0, 'KMS never reached by a denied call');
  assert.equal((await w.mk()(req('chunks', { method: 'PUT', body: new Uint8Array(32 * 1024 * 1024 + 1), extra: '&seq=0' }))).status, 413);
});
test('V5.23 audio-backup handler: encrypted round trip, idempotence, owner isolation, KMS outage', async () => {
  const w = world(), h = w.mk(), plain = [Buffer.from('synthetic-audio-0'.repeat(50)), Buffer.from('synthetic-audio-1'.repeat(50)), Buffer.from('synthetic-audio-2'.repeat(50))];
  for (let i = 0; i < 3; i++) { const r = await h(req('chunks', { method: 'PUT', body: plain[i], extra: '&seq=' + i })); assert.equal(r.status, 200); const j = await r.json(); assert.equal(j.readback, true); assert.equal(j.trainingAuthorized, false); }
  const stored = JSON.stringify([...w.chunks.values()]); assert.ok(!stored.includes('synthetic-audio'), 'only ciphertext is stored'); assert.ok(!Buffer.from(stored).includes(plain[0].subarray(0, 20)));
  const dup = await (await h(req('chunks', { method: 'PUT', body: plain[1], extra: '&seq=1' }))).json(); assert.equal(dup.duplicate, true);
  assert.equal((await h(req('chunks', { method: 'PUT', body: Buffer.from('different bytes'), extra: '&seq=1' }))).status, 409, 'same sequence, different bytes');
  assert.equal((await h(req('manifest', { method: 'POST', body: JSON.stringify({ chunkCount: 4, mime: 'audio/webm' }) }))).status, 409, 'incomplete session cannot be finalized');
  const man = await (await h(req('manifest', { method: 'POST', body: JSON.stringify({ chunkCount: 3, mime: 'audio/webm;codecs=opus' }) }))).json();
  assert.equal(man.chunk_count, 3); assert.equal(man.trainingAuthorized, false); assert.equal(man.ownerId, A);
  for (let i = 0; i < 3; i++) { const r = await h(req('chunks', { extra: '&seq=' + i })); assert.equal(r.status, 200); assert.deepEqual(Buffer.from(await r.arrayBuffer()), plain[i], 'bytes read back equal what was sent'); }
  assert.equal((await h(req('chunks', { method: 'PUT', body: Buffer.from('late'), extra: '&seq=3' }))).status, 409, 'a chunk after finalization is refused (session sealed), never silently accepted');
  assert.equal(w.manifests.size, 1);
  // B holds a grant for the SAME encounter id but is another owner: sees nothing of A's backup
  w.grants.add(`${B}|${E}`); const rb = await h(req('chunks', { token: 'tok-B', extra: '&seq=0' })); assert.equal(rb.status, 404, 'owner is part of the key: B cannot read A\'s session');
  // KMS outage: fail closed, nothing stored for the new session
  const down = world({ kmsDown: true }).mk(), r = await down(req('chunks', { method: 'PUT', body: plain[0], extra: '&seq=0' })); assert.equal(r.status, 500); assert.equal((await r.json()).error, 'AUDIO_BACKUP_FAILED');
});

const fin = (h, n) => h(req('manifest', { method: 'POST', body: JSON.stringify({ chunkCount: n, mime: 'audio/webm' }) }));
test('V5.25 reads are owner-keyed and need NO live grant (second device, retention re-confirmation); writes still do', async () => {
  const w = world(), h = w.mk(), bytes = [Buffer.from('a'.repeat(300)), Buffer.from('b'.repeat(300))]; w.grants.add(`${A}|${E}`);
  for (let i = 0; i < 2; i++) assert.equal((await h(req('chunks', { method: 'PUT', body: bytes[i], extra: '&seq=' + i }))).status, 200); assert.equal((await fin(h, 2)).status, 200);
  w.grants.clear();   // the grant expires / is revoked
  assert.equal((await h(req('manifest'))).status, 200, 'manifest readable without a grant'); for (let i = 0; i < 2; i++) assert.deepEqual(Buffer.from(await (await h(req('chunks', { extra: '&seq=' + i }))).arrayBuffer()), bytes[i]);
  assert.equal((await h(req('chunks', { method: 'PUT', body: Buffer.from('c'), extra: '&seq=2' }))).status, 403, 'a NEW write without a live grant is refused'); assert.equal((await h(req('manifest', { method: 'POST', body: JSON.stringify({ chunkCount: 2, mime: 'audio/webm' }) }))).status, 403);
  assert.equal((await h(req('chunks', { token: 'tok-B', extra: '&seq=0' }))).status, 404, 'B (no grant either) cannot see A\'s backup: owner is part of the key'); assert.equal((await h(req('manifest', { token: 'tok-B' }))).status, 404);
});
test('V5.25 sessions route: lists ONLY the caller\'s finalized backups (metadata), nothing else', async () => {
  const w = world(), h = w.mk(); w.grants.add(`${A}|${E}`); w.grants.add(`${B}|${E}`);
  await h(req('chunks', { method: 'PUT', body: Buffer.from('x'.repeat(100)), extra: '&seq=0' })); await fin(h, 1);
  await h(req('chunks', { method: 'PUT', body: Buffer.from('y'.repeat(100)), token: 'tok-B', extra: '&seq=0' })); await fin_b(h);
  async function fin_b(hh) { return hh(req('manifest', { method: 'POST', token: 'tok-B', body: JSON.stringify({ chunkCount: 1, mime: 'audio/webm' }) })); }
  const la = await (await h(new Request('https://x.supabase.co/functions/v1/audio-backup/sessions', { headers: { Origin: ORIGIN, Authorization: 'Bearer tok-A' } }))).json();
  assert.equal(la.sessions.length, 1); assert.equal(la.ownerId, A); assert.deepEqual(Object.keys(la.sessions[0]).sort(), ['chunk_count', 'committed_at', 'digest', 'encounter_id', 'mime', 'session_id', 'source_version', 'total_bytes']); assert.equal(la.sessions[0].total_bytes, 100); assert.equal(la.trainingAuthorized, false);
  const lb = await (await h(new Request('https://x.supabase.co/functions/v1/audio-backup/sessions', { headers: { Origin: ORIGIN, Authorization: 'Bearer tok-B' } }))).json(); assert.equal(lb.sessions.length, 1); assert.equal(lb.ownerId, B);
  assert.equal((await h(new Request('https://x.supabase.co/functions/v1/audio-backup/sessions', { method: 'POST', headers: { Origin: ORIGIN, Authorization: 'Bearer tok-A' } }))).status, 405);
  assert.equal((await h(new Request('https://x.supabase.co/functions/v1/audio-backup/sessions?owner=' + B, { headers: { Origin: ORIGIN, Authorization: 'Bearer tok-A' } }))).status, 400, 'owner is never client-supplied');
  assert.equal((await h(new Request('https://x.supabase.co/functions/v1/audio-backup/sessions', { headers: { Origin: 'https://evil.example', Authorization: 'Bearer tok-A' } }))).status, 403);
});
test('V5.25 envelope v2 behind NEXA_AUDIO_BACKUP_ENVELOPE=v2: session key stored wrapped, far fewer KMS calls, v1 data stays readable, default is v1', async () => {
  const N = 12, run = async (over) => { const w = world(), h = w.mk(over); w.grants.add(`${A}|${E}`); const plain = Array.from({ length: N }, (_, i) => Buffer.from(String(i).repeat(200)));
    for (let i = 0; i < N; i++) assert.equal((await h(req('chunks', { method: 'PUT', body: plain[i], extra: '&seq=' + i }))).status, 200); assert.equal((await fin(h, N)).status, 200);
    for (let i = 0; i < N; i++) assert.deepEqual(Buffer.from(await (await h(req('chunks', { extra: '&seq=' + i }))).arrayBuffer()), plain[i]); return w; };
  const v1 = await run({}), v2 = await run({ NEXA_AUDIO_BACKUP_ENVELOPE: 'v2' });
  assert.ok([...v1.chunks.values()].every(e => e.schema === 'nexa-backup-v1') && v1.sessionKeys.size === 0, 'default = v1');
  assert.ok([...v2.chunks.values()].every(e => e.schema === 'nexa-backup-v2') && v2.sessionKeys.size === 1, 'v2 = one wrapped session key');
  assert.deepEqual(Object.keys([...v2.sessionKeys.values()][0]).sort(), ['blob', 'keyId'], 'only the KMS-wrapped key is stored (keyId + opaque blob)');
  assert.ok(v1.kmsCalls() >= 3 * N, 'v1 measured (write+verify+one read per chunk): ' + v1.kmsCalls()); assert.ok(v2.kmsCalls() <= 2, 'v2 measured: ' + v2.kmsCalls() + ' (1 wrap for the session; reads reuse the cached key)');
  // mixed: a session first written with v1, then served by a v2-writing handler sharing the same store, is still readable
  const w = world(), h1 = w.mk({}), h2 = w.mk({ NEXA_AUDIO_BACKUP_ENVELOPE: 'v2' }); w.grants.add(`${A}|${E}`);
  await h1(req('chunks', { method: 'PUT', body: Buffer.from('old'.repeat(50)), extra: '&seq=0' })); await h2(req('chunks', { method: 'PUT', body: Buffer.from('new'.repeat(50)), extra: '&seq=1' })); assert.equal((await fin(h2, 2)).status, 200);
  assert.equal(Buffer.from(await (await h2(req('chunks', { extra: '&seq=0' }))).arrayBuffer()).toString().slice(0, 3), 'old'); assert.equal(Buffer.from(await (await h2(req('chunks', { extra: '&seq=1' }))).arrayBuffer()).toString().slice(0, 3), 'new');
});
