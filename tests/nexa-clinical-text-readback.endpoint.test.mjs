// Runs the REAL supabase/functions/nexa-clinical-text-readback/index.ts under a
// local Deno against a LOCAL mock of Supabase (Auth + PostgREST) on 127.0.0.1.
// All clinical data is fictitious. Needs a local Deno and a pre-populated
// DENO_DIR (no downloads: --cached-only, --lock --frozen):
//   NEXA_DENO_BIN=/path/deno NEXA_DENO_DIR=/path/cache NEXA_DENO_LOCK=/path/deno.lock \
//   node --test tests/nexa-clinical-text-readback.endpoint.test.mjs
// Lock: tests/support/nexa-readback-endpoint.deno.lock (15 npm packages with sha512 integrity;
// 10 of them also match the repo package-lock). Validated with Deno 2.1.4 (aarch64-apple-darwin,
// zip sha256 65efe137ee28846427ae7b6c5135439744065ad59ccb3c8cd19e69af066e2db0, equal to the
// .sha256sum published in the same official release). Run the test with real network isolation, e.g.
// macOS: sandbox-exec -p '(version 1)(allow default)(deny network*)(allow network-outbound
// (remote ip "localhost:*"))(allow network-inbound (local ip "localhost:*"))(allow network-bind
// (local ip "localhost:*"))' node --test ...   (verify with curl to an external host: it must fail).
// Without NEXA_DENO_BIN every case is reported as skipped (ENDPOINT_NOT_RUN).
//
// LIMIT: the mock re-implements a few lines of token lookup and owner filtering.
// It does NOT prove hosted Supabase Auth, JWT verification, RLS, ACL or schema.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readVerifiedTextPackage } from '../supabase/functions/_shared/nexa-clinical-text-readback.mjs';

const DENO = process.env.NEXA_DENO_BIN || '';
const DENO_DIR = process.env.NEXA_DENO_DIR || '';
const LOCK = process.env.NEXA_DENO_LOCK || '';
const ENDPOINT = new URL('../supabase/functions/nexa-clinical-text-readback/index.ts', import.meta.url).pathname;
const LAUNCHER = new URL('./support/nexa-endpoint-lab-launcher.ts', import.meta.url).pathname;
const ORIGIN = 'https://plantonistae-create.github.io';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ENC = '33333333-3333-4333-8333-333333333333';
const MISSING = '44444444-4444-4444-8444-444444444444';
const sha = t => createHash('sha256').update(t, 'utf8').digest('hex');
const SECRET_TEXT = 'Atendimento inteiramente fictício SEGREDO-FICTICIO-123';
const row = () => ({ encounter_id: ENC, user_id: A, sync_version: 7, updated_at: '2026-11-16T12:00:00+00:00',
  encounter_state: 'draft', consent_recorded_at: null,
  fields: { hda: SECRET_TEXT, queixa_principal: 'Queixa fictícia' },
  processing_meta: { radar: { n: 1 } }, protocol_usage: [] });

// ---- local mock of Supabase (Auth + PostgREST) -----------------------------
const state = { users: {}, caps: {}, rows: [], leak: false, restFail: null, log: [] };
const mock = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const auth = req.headers.authorization || '';
  const token = auth.replace(/^Bearer /, '');
  const user = state.users[token] || null;
  state.log.push({ method: req.method, path: url.pathname, query: url.search, auth: auth ? 'present' : 'absent', apikey: req.headers.apikey || '', token });
  const send = (code, body, extra = {}) => { res.writeHead(code, { 'content-type': 'application/json', ...extra }); res.end(JSON.stringify(body)); };
  req.resume();
  req.on('end', () => {
    if (url.pathname === '/auth/v1/user' && req.method === 'GET')
      return user ? send(200, { id: user, aud: 'authenticated', role: 'authenticated', email: user + '@invalid.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' })
                  : send(401, { code: 401, msg: 'invalid JWT' });
    if (url.pathname === '/rest/v1/rpc/get_my_capabilities' && req.method === 'POST') {
      const c = state.caps[user];
      if (!user) return send(401, { message: 'JWT invalid' });
      if (c === 'error') return send(500, { message: 'boom', code: 'XX000' });
      return send(200, [c]);
    }
    if (url.pathname === '/rest/v1/consultation_history' && req.method === 'GET') {
      if (!user) return send(401, { message: 'JWT invalid' });
      if (state.restFail) return send(400, { code: '42703', message: 'column consultation_history.consent_recorded_at does not exist' });
      const eq = k => (url.searchParams.get(k) || '').replace(/^eq\./, '');
      let rows = state.rows.filter(r => state.leak || r.user_id === user); // test-local "RLS"
      if (eq('encounter_id')) rows = rows.filter(r => r.encounter_id === eq('encounter_id'));
      if (eq('user_id') && !state.leak) rows = rows.filter(r => r.user_id === eq('user_id')); // leak = filter ignored too
      const cols = (url.searchParams.get('select') || '*').split(',');
      const out = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c] ?? null])));
      if ((req.headers.accept || '').includes('vnd.pgrst.object+json'))
        return out.length === 1 ? send(200, out[0]) : send(406, { code: 'PGRST116', message: 'no rows' });
      return send(200, out);
    }
    return send(404, { message: 'UNEXPECTED ' + req.method + ' ' + url.pathname });
  });
});
await new Promise(r => mock.listen(0, '127.0.0.1', r));
const mockUrl = 'http://127.0.0.1:' + mock.address().port;

// ---- the real endpoint under Deno ------------------------------------------
let portSeed = 18400 + Math.floor(Math.random() * 400);
async function startEndpoint(env) {
  const port = portSeed++;
  const child = spawn(DENO, ['run', '--no-config', '--cached-only', '--lock=' + LOCK, '--frozen',
    '--allow-net=127.0.0.1', '--allow-env', '--allow-read=' + DENO_DIR + ',' + ENDPOINT + ',' + ENDPOINT.replace(/\/nexa-clinical-text-readback\/index\.ts$/, '/_shared'), LAUNCHER],
  { env: { PATH: '/usr/bin:/bin', HOME: DENO_DIR, DENO_DIR, NO_COLOR: '1', DENO_NO_UPDATE_CHECK: '1', LAB_PORT: String(port), LAB_ENDPOINT: ENDPOINT, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', d => { logs += d }); child.stderr.on('data', d => { logs += d });
  const t0 = Date.now();
  await new Promise((resolve, reject) => {
    const tick = () => {
      if (/Listening on/.test(logs)) return resolve();
      if (child.exitCode !== null) return reject(new Error('deno exited early: ' + logs.slice(0, 600)));
      if (Date.now() - t0 > 20000) return reject(new Error('deno start timeout: ' + logs.slice(0, 600)));
      setTimeout(tick, 100);
    }; tick();
  });
  return { port, logs: () => logs, stop: () => new Promise(r => { child.once('exit', r); child.kill('SIGKILL') }) };
}
function call(port, { method = 'POST', headers = {}, body, raw } = {}) {
  return new Promise((resolve, reject) => {
    const payload = raw !== undefined ? raw : (body === undefined ? undefined : JSON.stringify(body));
    const req = http.request({ host: '127.0.0.1', port, method, path: '/', headers: { ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}), ...headers } }, res => {
      let data = ''; res.on('data', c => { data += c }); res.on('end', () => {
        let json = null; try { json = JSON.parse(data) } catch {}
        resolve({ status: res.statusCode, headers: res.headers, json, text: data });
      });
    });
    req.on('error', reject); if (payload) req.write(payload); req.end();
  });
}
const base = { cache: 'x' };
const good = { 'content-type': 'application/json', origin: ORIGIN, authorization: 'Bearer tok-A' };
const reset = () => {
  state.users = { 'tok-A': A, 'tok-B': B, 'tok-I': '55555555-5555-4555-8555-555555555555' };
  state.caps = { [A]: { access_status: 'active', clinical_access: true }, [B]: { access_status: 'active', clinical_access: true },
    '55555555-5555-4555-8555-555555555555': { access_status: 'active', clinical_access: false } };
  state.rows = [row()]; state.leak = false; state.restFail = null; state.log = [];
};
const noStore = r => {
  assert.equal(r.headers['cache-control'], 'no-store, max-age=0');
  assert.equal(r.headers['pragma'], 'no-cache');
  assert.match(r.headers['vary'], /(^|, )Origin(,|$)/); // Deno may append Accept-Encoding
};
const T = DENO && DENO_DIR && LOCK ? test : (name, fn) => test(name, { skip: 'ENDPOINT_NOT_RUN (no local Deno configured)' }, fn);
const bodyOk = { encounter_id: ENC, expected_sync_version: 7 };

T('real index.ts: disabled by default (no flag, wrong flag) and never reaches the backend', async () => {
  reset();
  for (const env of [{ SUPABASE_URL: mockUrl, SUPABASE_ANON_KEY: 'anon' }, { SUPABASE_URL: mockUrl, SUPABASE_ANON_KEY: 'anon', NEXA_TEXT_READBACK_ENABLED: 'true' }]) {
    const ep = await startEndpoint(env);
    try {
      const r = await call(ep.port, { headers: good, body: bodyOk });
      assert.equal(r.status, 503); assert.deepEqual(r.json, { error: 'TEXT_READBACK_DISABLED' }); noStore(r);
      assert.equal(state.log.length, 0, 'disabled endpoint must not call Auth or the database');
      assert.equal((await call(ep.port, { headers: { ...good, origin: 'https://evil.invalid' }, body: bodyOk })).status, 403);
      assert.equal((await call(ep.port, { method: 'GET', headers: good })).status, 405);
      const o = await call(ep.port, { method: 'OPTIONS', headers: { origin: ORIGIN } });
      assert.equal(o.status, 204); assert.equal(o.headers['access-control-allow-origin'], ORIGIN); assert.equal(o.headers['access-control-allow-methods'], 'POST, OPTIONS');
      const bad = await call(ep.port, { method: 'OPTIONS', headers: { origin: 'https://evil.invalid' } });
      assert.equal(bad.headers['access-control-allow-origin'] || '', '');
    } finally { await ep.stop() }
  }
});

T('real index.ts: enabled flag, but missing backend config fails closed', async () => {
  reset();
  const ep = await startEndpoint({ NEXA_TEXT_READBACK_ENABLED: 'synthetic-review-v1' });
  try { const r = await call(ep.port, { headers: good, body: bodyOk }); assert.equal(r.status, 503); assert.deepEqual(r.json, { error: 'READBACK_UNAVAILABLE' }); noStore(r); assert.equal(state.log.length, 0) }
  finally { await ep.stop() }
});

T('real index.ts (enabled): auth, capability, ownership, version, hash, no-store, validation', async () => {
  reset();
  const ep = await startEndpoint({ SUPABASE_URL: mockUrl, SUPABASE_ANON_KEY: 'anon-key-synthetic', NEXA_TEXT_READBACK_ENABLED: 'synthetic-review-v1' });
  const oracle = async (expected_sha256) => readVerifiedTextPackage({ actor: A, capability: { access_status: 'active', clinical_access: true },
    request: { encounter_id: ENC, expected_sync_version: 7, ...(expected_sha256 ? { expected_sha256 } : {}) }, lookup: async () => row(), hashCanonical: async t => sha(t) });
  try {
    // missing / malformed Authorization
    let r = await call(ep.port, { headers: { ...good, authorization: '' }, body: bodyOk });
    assert.equal(r.status, 401); assert.deepEqual(r.json, { error: 'UNAUTHORIZED' }); noStore(r);
    r = await call(ep.port, { headers: { ...good, authorization: 'Token abc' }, body: bodyOk }); assert.equal(r.status, 401);
    assert.equal(state.log.length, 0, 'malformed header rejected before any backend call');
    // invalid JWT (Auth says 401)
    r = await call(ep.port, { headers: { ...good, authorization: 'Bearer forged' }, body: bodyOk });
    assert.equal(r.status, 401); assert.deepEqual(r.json, { error: 'UNAUTHORIZED' }); noStore(r);
    assert.ok(state.log.some(l => l.path === '/auth/v1/user'));
    assert.ok(!state.log.some(l => l.path.startsWith('/rest/')), 'no capability or data query with an invalid JWT');
    // inactive clinical access / capability lookup error
    state.log = [];
    r = await call(ep.port, { headers: { ...good, authorization: 'Bearer tok-I' }, body: bodyOk });
    assert.equal(r.status, 403); assert.deepEqual(r.json, { error: 'CLINICAL_ACCESS_REQUIRED' }); noStore(r);
    assert.ok(!state.log.some(l => l.path === '/rest/v1/consultation_history'), 'no data query without clinical access');
    state.caps[A] = 'error';
    r = await call(ep.port, { headers: good, body: bodyOk }); assert.equal(r.status, 403); assert.deepEqual(r.json, { error: 'CAPABILITIES_UNAVAILABLE' });
    state.caps[A] = { access_status: 'inactive', clinical_access: true };
    r = await call(ep.port, { headers: good, body: bodyOk }); assert.equal(r.status, 403); assert.deepEqual(r.json, { error: 'CLINICAL_ACCESS_REQUIRED' });
    state.caps[A] = { access_status: 'active', clinical_access: true };
    // nonexistent encounter
    r = await call(ep.port, { headers: good, body: { encounter_id: MISSING, expected_sync_version: 7 } });
    assert.equal(r.status, 404); assert.deepEqual(r.json, { error: 'SOURCE_NOT_FOUND' }); noStore(r);
    // different user (test-local RLS hides the row)
    r = await call(ep.port, { headers: { ...good, authorization: 'Bearer tok-B' }, body: bodyOk });
    assert.equal(r.status, 404); assert.deepEqual(r.json, { error: 'SOURCE_NOT_FOUND' });
    assert.ok(!r.text.includes('SEGREDO-FICTICIO'));
    // data layer ignores BOTH RLS and the user_id predicate and returns A's row to B: the endpoint's own owner check refuses
    state.leak = true; state.log = [];
    r = await call(ep.port, { headers: { ...good, authorization: 'Bearer tok-B' }, body: bodyOk });
    assert.equal(r.status, 403); assert.deepEqual(r.json, { error: 'OWNER_SCOPE_VIOLATION' }); assert.ok(!r.text.includes('SEGREDO-FICTICIO'));
    const q = state.log.find(l => l.path === '/rest/v1/consultation_history');
    assert.ok(q.query.includes('encounter_id=eq.' + ENC) && q.query.includes('user_id=eq.' + B), 'both ownership predicates sent: ' + q.query);
    state.leak = false;
    // version divergence
    r = await call(ep.port, { headers: good, body: { encounter_id: ENC, expected_sync_version: 6 } });
    assert.equal(r.status, 409); assert.deepEqual(r.json, { error: 'SOURCE_VERSION_CHANGED' }); noStore(r);
    // success: canonical SHA-256 equals the independent oracle; scope flags; no-store
    state.log = [];
    r = await call(ep.port, { headers: good, body: bodyOk });
    const want = await oracle();
    assert.equal(r.status, 200); noStore(r);
    assert.equal(r.headers['access-control-allow-origin'], ORIGIN);
    assert.equal(r.json.verified, true); assert.equal(r.json.durable_archive, false); assert.equal(r.json.audio_included, false);
    assert.equal(r.json.canonical_sha256, want.canonical_sha256);
    assert.deepEqual(r.json.package, want.package);
    assert.equal(r.json.package.schema_version, 'nexa-clinical-text-readback-v1');
    // backend usage: user JWT + anon apikey, only reads, never the service role
    for (const l of state.log) {
      assert.equal(l.auth, 'present'); assert.equal(l.token, 'tok-A'); assert.equal(l.apikey, 'anon-key-synthetic');
      assert.ok(l.method === 'GET' || (l.method === 'POST' && l.path === '/rest/v1/rpc/get_my_capabilities'), 'unexpected ' + l.method + ' ' + l.path);
    }
    // expected_sha256: match passes, mismatch blocks
    r = await call(ep.port, { headers: good, body: { ...bodyOk, expected_sha256: want.canonical_sha256 } }); assert.equal(r.status, 200);
    r = await call(ep.port, { headers: good, body: { ...bodyOk, expected_sha256: '0'.repeat(64) } });
    assert.equal(r.status, 409); assert.deepEqual(r.json, { error: 'SOURCE_CONTENT_MISMATCH' }); noStore(r);
    // content changed on the server at the same version: previous hash no longer verifies
    state.rows[0].fields.hda = SECRET_TEXT + ' ALTERADO';
    r = await call(ep.port, { headers: good, body: { ...bodyOk, expected_sha256: want.canonical_sha256 } });
    assert.equal(r.status, 409); assert.deepEqual(r.json, { error: 'SOURCE_CONTENT_MISMATCH' });
    state.rows[0].fields.hda = SECRET_TEXT;
    // request validation
    r = await call(ep.port, { headers: good, body: { ...bodyOk, fields: { hda: 'injetado' } } }); assert.equal(r.status, 400); assert.deepEqual(r.json, { error: 'INVALID_REQUEST' });
    r = await call(ep.port, { headers: good, body: { encounter_id: 'nao-uuid', expected_sync_version: 7 } }); assert.equal(r.status, 400);
    r = await call(ep.port, { headers: good, raw: '{ nao json' }); assert.equal(r.status, 400); assert.deepEqual(r.json, { error: 'INVALID_REQUEST' });
    r = await call(ep.port, { headers: good, raw: JSON.stringify({ ...bodyOk, pad: 'x'.repeat(5000) }) }); assert.equal(r.status, 413); noStore(r);
    // backend schema failure (e.g. missing consent_recorded_at) fails closed, no raw DB error leaks
    state.restFail = true;
    r = await call(ep.port, { headers: good, body: bodyOk });
    assert.equal(r.status, 503); assert.deepEqual(r.json, { error: 'READBACK_UNAVAILABLE' });
    assert.ok(!/consent_recorded_at|42703|column/i.test(r.text), 'raw database error must not be returned');
    state.restFail = null;
    // nothing clinical or credential-like in the process logs
    assert.ok(!ep.logs().includes('SEGREDO-FICTICIO'), 'clinical text must not be logged');
    assert.ok(!/tok-A|anon-key-synthetic/.test(ep.logs()), 'credentials must not be logged');
  } finally { await ep.stop() }
});

test.after(() => mock.close());
