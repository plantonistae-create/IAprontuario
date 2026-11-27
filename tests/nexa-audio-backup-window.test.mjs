// V5.38 — server-side K1-B test window is ALL-OR-NOTHING: marker + expiry (<= 4 h ahead) + allow-list (1..5 ids). Any partial/empty/malformed/expired state keeps the function closed; unlisted users are refused BY THE ALLOW-LIST
// (not by missing clinical access) before any capability/grant/KMS/storage work. All three absent = unchanged production behaviour.
import test from 'node:test'; import assert from 'node:assert/strict'; import { Buffer } from 'node:buffer';
import { world, req, A, B, E } from './helpers/audio-backup-world.mjs';
const put = (o = {}) => req('chunks', { method: 'PUT', body: Buffer.from('synthetic'), extra: '&seq=0', ...o });
const inH = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const WIN = (o = {}) => ({ NEXA_AUDIO_BACKUP_WINDOW: 'k1b-synthetic', NEXA_AUDIO_BACKUP_EXPIRES_AT: inH(0.5), NEXA_AUDIO_BACKUP_ALLOWED_USERS: A, ...o });
const body = async (r) => (await r.json()).error;
test('production behaviour unchanged when all three window secrets are absent', async () => { assert.equal((await world().mk()(put())).status, 200); });
test('complete valid window: the listed user passes (case/space tolerant); the whole flow works', async () => { const w = world(); const h = w.mk(WIN({ NEXA_AUDIO_BACKUP_ALLOWED_USERS: ' ' + A.toUpperCase() + ' ' })); assert.equal((await h(put())).status, 200); assert.equal((await h(req('sessions'))).status, 200); });
test('EVERY partial state is closed: all 6 proper non-empty subsets of the 3 secrets, with the switch ON', async () => {
  const full = WIN(); const names = Object.keys(full);
  for (let m = 1; m < 7; m++) { const env = Object.fromEntries(names.filter((_, i) => m & (1 << i)).map((n) => [n, full[n]])); const w = world(); const r = await w.mk(env)(put()); assert.equal(r.status, 503, JSON.stringify(Object.keys(env))); assert.equal(await body(r), 'AUDIO_BACKUP_UNCONFIGURED'); assert.equal(w.kmsCalls(), 0); assert.equal(w.chunks.size, 0); assert.deepEqual(w.rpcLog, [], 'nothing reached the database'); }
});
test('empty, whitespace, malformed, wrong-marker, excessive or past values are closed (never "allow all")', async () => {
  const bad = [{ NEXA_AUDIO_BACKUP_WINDOW: '' }, { NEXA_AUDIO_BACKUP_WINDOW: 'K1B-SYNTHETIC' }, { NEXA_AUDIO_BACKUP_WINDOW: 'production' }, { NEXA_AUDIO_BACKUP_EXPIRES_AT: '' }, { NEXA_AUDIO_BACKUP_EXPIRES_AT: 'garbage' }, { NEXA_AUDIO_BACKUP_EXPIRES_AT: inH(4.1) }, { NEXA_AUDIO_BACKUP_EXPIRES_AT: inH(24 * 365) }, { NEXA_AUDIO_BACKUP_ALLOWED_USERS: '' }, { NEXA_AUDIO_BACKUP_ALLOWED_USERS: '   ' }, { NEXA_AUDIO_BACKUP_ALLOWED_USERS: ',' }, { NEXA_AUDIO_BACKUP_ALLOWED_USERS: A + ',' }, { NEXA_AUDIO_BACKUP_ALLOWED_USERS: A + ',x' }, { NEXA_AUDIO_BACKUP_ALLOWED_USERS: Array.from({ length: 6 }, () => A).join(',') }, { NEXA_AUDIO_BACKUP_ALLOWED_USERS: '*' }];
  for (const o of bad) { const w = world(); const r = await w.mk(WIN(o))(put()); assert.equal(r.status, 503, JSON.stringify(o)); assert.equal(w.kmsCalls(), 0); assert.equal(w.chunks.size, 0); }
  for (const o of [{ NEXA_AUDIO_BACKUP_EXPIRES_AT: new Date(Date.now() - 1000).toISOString() }, { NEXA_AUDIO_BACKUP_EXPIRES_AT: new Date().toISOString() }]) { const r = await world().mk(WIN(o))(put()); assert.equal(r.status, 503); assert.equal(await body(r), 'AUDIO_BACKUP_DISABLED'); }
});
test('the window closes by itself mid-flight (abrupt end of the operator process): the very next call is refused', async () => { const w = world(); const h = w.mk(WIN({ NEXA_AUDIO_BACKUP_EXPIRES_AT: new Date(Date.now() + 200).toISOString() })); assert.equal((await h(put())).status, 200); await new Promise((r) => setTimeout(r, 350)); const r = await h(put({ extra: '&seq=1' })); assert.equal(r.status, 503); assert.equal(await body(r), 'AUDIO_BACKUP_DISABLED'); });
test('the left-over state after a killed operator (switch ON + the three secrets) is safe: only the listed user passes, then it expires', async () => {
  const w = world(); w.grants.add(`${B}|${E}`); const h = w.mk(WIN({ NEXA_AUDIO_BACKUP_EXPIRES_AT: new Date(Date.now() + 250).toISOString() }));
  assert.equal((await h(put())).status, 200); assert.equal((await h(put({ token: 'tok-B' }))).status, 403); await new Promise((r) => setTimeout(r, 400)); assert.equal((await h(put({ token: 'tok-B' }))).status, 503); assert.equal((await h(put())).status, 503);
});
test('an UNAUTHORIZED user who HAS clinical access and a live grant is refused BY THE ALLOW-LIST (specific error), before capabilities, grants, KMS or storage', async () => {
  const w = world(); w.grants.add(`${B}|${E}`);   // B: clinical access is active in the fixture AND holds a live clinical_backup grant for the same encounter
  const open = await w.mk({})(put({ token: 'tok-B' })); assert.equal(open.status, 200, 'control: without the window B is fully entitled and would succeed'); w.chunks.clear(); w.rpcLog.length = 0; const kms0 = w.kmsCalls();
  const h = w.mk(WIN()); for (const r of [put({ token: 'tok-B' }), req('sessions', { token: 'tok-B' }), req('manifest', { token: 'tok-B' }), req('chunks', { token: 'tok-B', extra: '&seq=0' })]) { const res = await h(r); assert.equal(res.status, 403); assert.equal(await body(res), 'BACKUP_USER_NOT_ALLOWED'); }
  assert.ok(!w.rpcLog.includes('get_my_capabilities') && !w.rpcLog.includes('nexa_assist_verify'), 'refused before any capability/grant check: ' + w.rpcLog); assert.equal(w.kmsCalls(), kms0); assert.equal(w.chunks.size, 0);
});
test('no JWT / bad JWT still 401, bad origin still 403, hard-stop still 423, OPTIONS unaffected, switch OFF still wins (503 DISABLED) even with a broken window', async () => {
  const w = world(); assert.equal((await w.mk(WIN())(put({ token: null }))).status, 401); assert.equal((await w.mk(WIN())(put({ token: 'tok-X' }))).status, 401); assert.equal((await w.mk(WIN())(put({ origin: 'https://evil.example' }))).status, 403);
  assert.equal((await w.mk({ ...WIN(), NEXA_ASSIST_GATE_AUDIO_BACKUP: 'hard-stop' })(put())).status, 423);
  const off = await w.mk({ ...WIN({ NEXA_AUDIO_BACKUP_ALLOWED_USERS: 'bad' }), NEXA_AUDIO_BACKUP: undefined })(put()); assert.equal(off.status, 503); assert.equal(await body(off), 'AUDIO_BACKUP_DISABLED');
  const o = await w.mk({ NEXA_AUDIO_BACKUP_WINDOW: 'x' })(new Request('https://x.supabase.co/functions/v1/audio-backup/chunks', { method: 'OPTIONS', headers: { Origin: 'https://plantonistae-create.github.io' } })); assert.equal(o.status, 204);
});
test('closing order is safe at every step: switch OFF + window kept = closed; window removed WITH the switch ON is the production state (hence the operator script turns the switch off and confirms 503 first)', async () => {
  const step1 = await world().mk({ ...WIN(), NEXA_AUDIO_BACKUP: undefined })(put()); assert.equal(step1.status, 503);
  for (const partial of [{ NEXA_AUDIO_BACKUP_ALLOWED_USERS: A }, { NEXA_AUDIO_BACKUP_WINDOW: 'k1b-synthetic' }, { NEXA_AUDIO_BACKUP_EXPIRES_AT: inH(1) }]) assert.equal((await world().mk({ ...partial, NEXA_AUDIO_BACKUP: undefined })(put())).status, 503, 'switch off: any removal order stays closed');
  for (const partial of [{ NEXA_AUDIO_BACKUP_ALLOWED_USERS: A }, { NEXA_AUDIO_BACKUP_EXPIRES_AT: inH(1) }, { NEXA_AUDIO_BACKUP_WINDOW: 'k1b-synthetic' }]) assert.equal((await world().mk(partial)(put())).status, 503, 'switch ON with a half-removed window: closed (fail closed, never open)');
});
