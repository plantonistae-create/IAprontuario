// V5.37 — server-side K1-B test window: user allow-list + self-expiry, both optional (unset = unchanged behaviour). No client flag is involved.
import test from 'node:test'; import assert from 'node:assert/strict'; import { Buffer } from 'node:buffer';
import { world, req, A, B } from './helpers/audio-backup-world.mjs';
const put = (o = {}) => req('chunks', { method: 'PUT', body: Buffer.from('synthetic'), extra: '&seq=0', ...o });
test('unset allow-list and expiry: behaviour unchanged (A with a grant can write)', async () => { const w = world(); assert.equal((await w.mk()(put())).status, 200); });
test('allow-list: listed user passes, unlisted user is refused with no side effect', async () => {
  const w = world(); w.grants.add(`${B}|33333333-3333-4333-8333-333333333333`); const h = w.mk({ NEXA_AUDIO_BACKUP_ALLOWED_USERS: ' ' + A.toUpperCase() });
  assert.equal((await h(put())).status, 200); const before = [w.chunks.size, w.kmsCalls()];
  const rb = await h(put({ token: 'tok-B' })); assert.equal(rb.status, 403); assert.deepEqual(await rb.json(), { error: 'BACKUP_USER_NOT_ALLOWED' }); assert.deepEqual([w.chunks.size, w.kmsCalls()], before, 'no storage, no KMS');
  assert.equal((await h(req('sessions', { token: 'tok-B' }))).status, 403, 'also reads/lists'); assert.equal((await h(req('sessions'))).status, 200);
});
test('allow-list malformed -> 503 AUDIO_BACKUP_UNCONFIGURED for everyone (never allow-all)', async () => {
  for (const bad of [A + ',not-a-uuid', ',', A + ',', ',' + A, Array.from({ length: 21 }, () => A).join(',')]) { const r = await world().mk({ NEXA_AUDIO_BACKUP_ALLOWED_USERS: bad })(put()); assert.equal(r.status, 503, bad.slice(0, 20)); assert.deepEqual(await r.json(), { error: 'AUDIO_BACKUP_UNCONFIGURED' }); }
});
test('expiry: future instant = ON; past/now/garbage = OFF (503 AUDIO_BACKUP_DISABLED) even with the switch enabled', async () => {
  const f = new Date(Date.now() + 3600e3).toISOString(); assert.equal((await world().mk({ NEXA_AUDIO_BACKUP_EXPIRES_AT: f })(put())).status, 200);
  for (const v of [new Date(Date.now() - 1000).toISOString(), 'garbage', '2020-01-01']) { const w = world(), r = await w.mk({ NEXA_AUDIO_BACKUP_EXPIRES_AT: v })(put()); assert.equal(r.status, 503, v); assert.deepEqual(await r.json(), { error: 'AUDIO_BACKUP_DISABLED' }); assert.equal(w.kmsCalls(), 0); }
  assert.equal((await world().mk({ NEXA_AUDIO_BACKUP_EXPIRES_AT: '' })(put())).status, 200, 'empty = not set');
});
test('expiry is evaluated per request (a window that closes mid-flight stops the next call)', async () => { const w = world(); const e = new Date(Date.now() + 150).toISOString(); const h = w.mk({ NEXA_AUDIO_BACKUP_EXPIRES_AT: e }); assert.equal((await h(put())).status, 200); await new Promise(r => setTimeout(r, 250)); assert.equal((await h(put({ extra: '&seq=1' }))).status, 503); });
test('order: the switch still wins, hard-stop still wins, OPTIONS unaffected', async () => {
  const w = world(); assert.equal((await w.mk({ NEXA_AUDIO_BACKUP: '', NEXA_AUDIO_BACKUP_ALLOWED_USERS: 'bad' })(put())).status, 503); assert.equal((await w.mk({ NEXA_ASSIST_GATE_AUDIO_BACKUP: 'hard-stop', NEXA_AUDIO_BACKUP_EXPIRES_AT: 'x' })(put())).status, 423);
  const o = await w.mk({ NEXA_AUDIO_BACKUP_EXPIRES_AT: 'x', NEXA_AUDIO_BACKUP_ALLOWED_USERS: 'bad' })(new Request('https://x.supabase.co/functions/v1/audio-backup/chunks', { method: 'OPTIONS', headers: { Origin: 'https://plantonistae-create.github.io' } })); assert.equal(o.status, 204);
});
