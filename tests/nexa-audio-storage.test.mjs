// V5.24 — retention, space preflight and bitrate option (pure logic with fakes; the real vault is exercised by tests/nexa-audio-retention.e2e.cjs).
import test from 'node:test'; import assert from 'node:assert/strict';
globalThis.window = globalThis; await import('../nexa-audio-storage-v524.js'); const T = window.nexaAudioStorageV524;
const MB = 1048576, DAY = 86400000, NOW = Date.UTC(2026, 10, 26), A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const E = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`, S = n => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
test('bitrate option: null leaves the recorder unchanged; invalid values are rejected', () => {
  assert.deepEqual(T.recorderOptions('audio/webm', { audioBitsPerSecond: null }), { mimeType: 'audio/webm' }); assert.deepEqual(T.recorderOptions('', {}), {});
  assert.deepEqual(T.recorderOptions('audio/webm', { audioBitsPerSecond: 64000 }), { mimeType: 'audio/webm', audioBitsPerSecond: 64000 });
  for (const bad of [0, 8000, 300000, 64000.5, '64000', NaN]) assert.throws(() => T.recorderOptions('audio/webm', { audioBitsPerSecond: bad }), /AUDIO_BITRATE_INVALID/);
});
test('preflight: blocks only when a known quota leaves less than a consultation needs; warns near full; unknown quota never blocks', async () => {
  const v = u => ({ usage: async () => u });
  assert.equal((await T.preflight({ vault: v({ quota: 1000 * MB, usage: 990 * MB, persisted: false }) })).level, 'block');
  const w = await T.preflight({ vault: v({ quota: 1000 * MB, usage: 850 * MB }), bitsPerSecond: 64000 }); assert.equal(w.level, 'warn'); assert.match(w.message, /85%/);
  assert.equal((await T.preflight({ vault: v({ quota: 20000 * MB, usage: 100 * MB }) })).level, 'ok');
  assert.equal((await T.preflight({ vault: v({ quota: null, usage: null }) })).level, 'ok', 'unknown quota (some browsers) never blocks a clinical recording');
  assert.equal((await T.preflight({ vault: { usage: async () => { throw Error('x') } } })).level, 'ok');
  assert.ok(T.needBytes(32000, 60) < T.needBytes(128000, 60) && T.needBytes(1, 1) === 64 * MB);
  const b = await T.preflight({ vault: v({ quota: 1000 * MB, usage: 990 * MB }) }); assert.match(b.message, /nenhum áudio protegido foi apagado/);
});
test('watch only reports (every 6th chunk) and never throws', async () => {
  const msgs = []; const vault = { usage: async () => ({ quota: 100 * MB, usage: 95 * MB }) };
  for (let s = 0; s < 12; s++) await T.watch({ vault, seq: s, onLow: m => msgs.push(m) }); assert.equal(msgs.length, 2);
  await T.watch({ vault: { usage: async () => { throw Error() } }, seq: 5, onLow: () => { throw Error('ui') } });
});
function world({ verifiedDaysAgo = {}, finalized = {}, owner = {} } = {}) {
  const sessions = [1, 2, 3, 4, 5, 6].map(n => ({ encounterId: E(n), sessionId: S(n), finalized: finalized[n] ?? true, createdAt: 'x' }));
  const purged = [];
  const vault = { listOwned: async o => (o === A ? sessions : []), purge: async a => { purged.push(a); return { purgedChunks: 3 } } };
  const jobs = [1, 2, 3, 4, 5, 6].map(n => ({ sessionId: S(n), encounterId: E(n), ownerId: owner[n] ?? A, sourceVersion: 1, state: n === 3 ? 'retry' : 'verified', verifiedAt: n === 4 ? null : NOW - (verifiedDaysAgo[n] ?? 8) * DAY, digest: n === 4 ? null : 'd'.repeat(64) }));
  return { vault, queue: { snapshot: async () => jobs }, purged };
}
const policy = { enabled: true, days: 7 };
test('retention: ONLY verified+aged+finalized+reconfirmed audio is purged; everything else is kept with a reason', async () => {
  const w = world({ verifiedDaysAgo: { 1: 8, 2: 3, 5: 30 }, finalized: { 5: false } });
  const calls = []; const confirm = async (scope, digest) => { calls.push([scope.sessionId, digest]); return true };
  const r = await T.sweep({ vault: w.vault, queue: w.queue, ownerId: A, policy, confirmRemote: confirm, now: NOW, activeEncounterId: E(6) });
  assert.deepEqual(r.purged.map(p => p.sessionId), [S(1)], 'only session 1: verified 8 days ago, finalized, reconfirmed');
  const why = Object.fromEntries(r.kept.map(k => [k.sessionId, k.reason]));
  assert.equal(why[S(2)], 'WITHIN_RETENTION_WINDOW'); assert.equal(why[S(3)], 'NO_VERIFIED_REMOTE_BACKUP', 'queue state retry = no confirmed backup'); assert.equal(why[S(4)], 'NO_VERIFIED_REMOTE_BACKUP'); assert.equal(why[S(5)], 'NOT_FINALIZED'); assert.equal(why[S(6)], 'ACTIVE_ENCOUNTER');
  assert.equal(w.purged.length, 1); assert.equal(w.purged[0].reason, 'remote_verified'); assert.deepEqual(calls, [[S(1), 'd'.repeat(64)]], 'a fresh remote confirmation with the recorded digest was requested for the candidate only');
});
test('retention: never purges when disabled, without re-confirmation, when it fails/differs/throws, for another owner, or with a bad policy', async () => {
  const run = async o => { const w = world(); const r = await T.sweep({ vault: w.vault, queue: w.queue, ownerId: A, policy, now: NOW, ...o }); return { r, purged: w.purged.length } };
  assert.equal((await run({ policy: { enabled: false, days: 7 }, confirmRemote: async () => true })).purged, 0); assert.equal((await run({ policy: null, confirmRemote: async () => true })).purged, 0);
  assert.equal((await run({ policy: { enabled: 'true', days: 7 }, confirmRemote: async () => true })).purged, 0, 'enabled must be exactly true');
  const noConf = await run({}); assert.equal(noConf.purged, 0); assert.ok(noConf.r.kept.some(k => k.reason === 'REMOTE_RECONFIRMATION_UNAVAILABLE'));
  assert.equal((await run({ confirmRemote: async () => false })).purged, 0); assert.equal((await run({ confirmRemote: async () => 'yes' })).purged, 0, 'only a strict true counts'); assert.equal((await run({ confirmRemote: async () => { throw Error('offline') } })).purged, 0, 'network failure keeps the audio');
  const w = world({ owner: { 1: B, 2: B, 3: B, 4: B, 5: B, 6: B } }); const r = await T.sweep({ vault: w.vault, queue: w.queue, ownerId: A, policy, confirmRemote: async () => true, now: NOW }); assert.equal(w.purged.length, 0, 'jobs of another owner never authorize a purge');
  assert.equal((await T.sweep({ vault: world().vault, queue: world().queue, ownerId: '', policy, confirmRemote: async () => true, now: NOW })).purged.length, 0);
  const short = world({ verifiedDaysAgo: { 1: 1 } }); await T.sweep({ vault: short.vault, queue: short.queue, ownerId: A, policy: { enabled: true, days: 0 }, confirmRemote: async () => true, now: NOW }); assert.ok(short.purged.every(p => p.sessionId !== S(1)), 'days<1 falls back to 7, never to "immediately"');
  const refused = world(); refused.vault.purge = async () => { throw Error('AUDIO_PURGE_REFUSED_NOT_FINALIZED') }; const rr = await T.sweep({ vault: refused.vault, queue: refused.queue, ownerId: A, policy, confirmRemote: async () => true, now: NOW }); assert.equal(rr.purged.length, 0); assert.ok(rr.kept.some(k => /^PURGE_REFUSED/.test(k.reason)));
});
