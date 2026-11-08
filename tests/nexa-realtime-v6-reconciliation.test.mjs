import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../labs/nexa-realtime-v6/', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const hosted = read('reference/index.ts.txt');
const candidate = read('candidate/index.ts.txt');
const anchor = '  const form =\\n    new FormData();'.replaceAll('\\n', '\n');
const boundary = '\\n  const upstream ='.replaceAll('\\n', '\n');
const replacement = '  const form =\\n    new FormData();\\n\\n  form.set("sdp", sdp);\\n  form.set("session", JSON.stringify(session));\\n'.replaceAll('\\n', '\n');

test('frozen hosted v6 is reconciled with EXACTLY the multipart field substitution', () => {
  const start = hosted.indexOf(anchor);
  const end = hosted.indexOf(boundary, start);
  assert.ok(start > -1 && end > start);
  assert.equal(hosted.indexOf(anchor, start + 1), -1);
  const original = hosted.slice(start, end);
  assert.match(original, /form\.append\(/);
  assert.match(original, /offer\.sdp/);
  assert.match(original, /session\.json/);
  assert.equal(candidate, hosted.slice(0, start) + replacement + hosted.slice(end));
  assert.equal((candidate.match(/form\.set\(/g) ?? []).length, 2);
});

test('JWT, clinical access, fallback, timeout and upstream observability are byte-preserved', () => {
  const required = [
    'getAuthenticatedUser(', 'CLINICAL_ACCESS_REQUIRED',
    'async function transcribeFallback(', 'FALLBACK_TRANSCRIPTION_FAILED',
    'emitRealtimeUpstreamStatus("webrtc", upstream.status)',
    'emitRealtimeUpstreamStatus("chunk", upstream.status)',
    'REALTIME_SESSION_FAILED', 'AbortSignal.timeout(18000)',
    'withTechnicalExecutionHeaders(', 'radar-chunk.webm'
  ];
  for (const token of required) {
    assert.ok(hosted.includes(token), 'v6 baseline missing '+token);
    assert.ok(candidate.includes(token), 'candidate missing '+token);
  }
  assert.equal((candidate.match(/AbortSignal\.timeout\(18000\)/g)??[]).length,
    (hosted.match(/AbortSignal\.timeout\(18000\)/g)??[]).length);
  assert.ok(!candidate.includes('emitUsage("realtime.transcription"'),
    'do not silently insert Git-only usage code into hosted v6');
});

test('SDP and session are multipart STRING fields, not files (no network)', async () => {
  const sdp = 'v=0\r\ns=synthetic-only\r\n';
  const session = { type:'realtime', model:'synthetic-model' };
  const form = new FormData();
  form.set('sdp', sdp);
  form.set('session', JSON.stringify(session));
  assert.equal(form.get('sdp'), sdp);
  assert.equal(form.get('session'), JSON.stringify(session));
  const wire = await new Request('https://example.invalid/not-sent', {
    method:'POST', body:form
  }).text();
  for (const name of ['sdp','session']) {
    const disposition = wire.match(
      new RegExp('Content-Disposition: form-data; name="'+name+'"[^\\r\\n]*')
    )?.[0];
    assert.ok(disposition);
    assert.doesNotMatch(disposition, /filename=/i);
  }
  assert.ok(!wire.includes('offer.sdp') && !wire.includes('session.json'));
});
