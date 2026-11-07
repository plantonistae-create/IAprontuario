import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOSTED_V6,
  RealtimeV6GateError,
  sha256Text,
  proposeWireOnlyPatch,
  reconcileHostedV6,
  __testOnly,
} from '../scripts/nexa-realtime-v6-offline-reconcile.mjs';
import {
  finalLocalOffer,
  waitForIceComplete,
  RealtimeIceGateError,
} from '../scripts/nexa-realtime-ice-offline.mjs';

const fakeSource = [
  'async function getAuthenticatedUser(req) {}',
  'async function createRealtimeCall(body) {',
  ' const sdp = "v=0\\r\\ns=synthetic\\r\\n";',
  ' const session = { type: "realtime", model: "fixture-only" };',
  __testOnly.originalMultipart,
  '  const upstream = await Promise.resolve({ status: 400 });',
  '  emitRealtimeUpstreamStatus("webrtc", upstream.status);',
  '  const timeout = AbortSignal.timeout(18000);',
  '  return { error:',
  '          "REALTIME_SESSION_FAILED" };',
  '}',
  'async function transcribeFallback(req) {',
  '  const upstream = await Promise.resolve({ status: 429 });',
  '  emitRealtimeUpstreamStatus("chunk", upstream.status);',
  '  const timeout = AbortSignal.timeout(18000);',
  '}',
].join('\n');

test('hosted v6 reconciliation pins SHA-256 for all four source files and refuses a forged manifest', () => {
  assert.match(HOSTED_V6.ezbr_sha256, /^[a-f0-9]{64}$/);
  assert.equal(Object.keys(HOSTED_V6.files).length, 4);
  assert.equal(sha256Text('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.throws(
    () => reconcileHostedV6({ version: 6, verify_jwt: false, ezbr_sha256: HOSTED_V6.ezbr_sha256, files: [] }),
    { code: 'HOSTED_V6_METADATA_MISMATCH' },
  );
  assert.throws(
    () => reconcileHostedV6({ version: 5, verify_jwt: true, ezbr_sha256: HOSTED_V6.ezbr_sha256, files: [] }),
    { code: 'HOSTED_V6_METADATA_MISMATCH' },
  );
  const files = Object.keys(HOSTED_V6.files).map(name => ({ name, content: name }));
  assert.throws(
    () => reconcileHostedV6({ version: 6, verify_jwt: true, ezbr_sha256: HOSTED_V6.ezbr_sha256, files }),
    { code: 'HOSTED_V6_FILE_HASH_MISMATCH' },
  );
  assert.throws(
    () => reconcileHostedV6({ version: 6, verify_jwt: true, ezbr_sha256: HOSTED_V6.ezbr_sha256, files: files.slice(1) }),
    { code: 'HOSTED_V6_FILE_SET_MISMATCH' },
  );
});

test('multipart patch is reversible, unique and changes only two text fields', async () => {
  const proposed = proposeWireOnlyPatch(fakeSource);
  assert.equal(proposed.updated.replace(__testOnly.textMultipart, __testOnly.originalMultipart), fakeSource);
  assert.equal(proposed.updated.includes('offer.sdp'), false);
  assert.equal(proposed.updated.includes('session.json'), false);
  assert.equal(proposed.updated.includes('form.set("sdp", sdp)'), true);
  assert.equal(proposed.updated.includes('form.set("session", JSON.stringify(session))'), true);
  assert.notEqual(proposed.sourceSha256, proposed.candidateSha256);
  const section = proposed.updated.slice(
    proposed.updated.indexOf('  const form ='),
    proposed.updated.indexOf('  const upstream ='),
  );
  // The evaluated snippet is a constant controlled exclusively by the synthetic fixture.
  const buildForm = new Function('sdp', 'session', section + '\nreturn form;');
  const form = buildForm('v=0\r\ns=fixture\r\n', { type: 'realtime', model: 'fixture' });
  assert.equal(form.get('sdp'), 'v=0\r\ns=fixture\r\n');
  assert.equal(form.get('session'), '{"type":"realtime","model":"fixture"}');
  const wire = await new Request('https://example.invalid/no-fetch', { method: 'POST', body: form }).text();
  for (const name of ['sdp', 'session']) {
    const disposition = wire.match(new RegExp('Content-Disposition: form-data; name="' + name + '"[^\\r\\n]*'))?.[0];
    assert.ok(disposition);
    assert.doesNotMatch(disposition, /filename=/i);
  }
  assert.equal(wire.includes('offer.sdp'), false);
});

test('any mismatched multipart anchor or unexpected hosted transport branch fails closed', () => {
  assert.throws(() => proposeWireOnlyPatch(fakeSource.replace('offer.sdp', 'different.sdp')), {
    code: 'HOSTED_V6_MULTIPART_ANCHOR_MISMATCH',
  });
  assert.throws(() => proposeWireOnlyPatch(fakeSource + '\n' + __testOnly.originalMultipart), {
    code: 'HOSTED_V6_MULTIPART_ANCHOR_MISMATCH',
  });
  assert.throws(() => proposeWireOnlyPatch(fakeSource.replace('async function transcribeFallback', 'async function noFallback')), {
    code: 'HOSTED_V6_SAFETY_INVARIANT_MISMATCH',
  });
  assert.throws(() => proposeWireOnlyPatch(fakeSource.replace('  const upstream =', '  const changedUpstream =')), {
    code: 'HOSTED_V6_TRANSPORT_BRANCH_MISMATCH',
  });
  assert.ok(RealtimeV6GateError);
});

class FakePeer extends EventTarget {
  iceGatheringState = 'gathering';
  localDescription = { sdp: 'v=0\r\ns=initial\r\n' };
  complete(sdp = 'v=0\r\ns=final\r\na=candidate:synthetic\r\n') {
    this.localDescription = { sdp };
    this.iceGatheringState = 'complete';
    this.dispatchEvent(new Event('icegatheringstatechange'));
  }
}
function fakeClock() {
  const entries = [];
  return {
    entries,
    schedule(fn, ms) {
      const entry = { fn, ms, cancelled: false };
      entries.push(entry);
      return entry;
    },
    cancel(entry) { entry.cancelled = true; },
  };
}

test('ICE gate uses final localDescription only after gathering completes', async () => {
  const peer = new FakePeer(), clock = fakeClock();
  const promise = waitForIceComplete(peer, { schedule: clock.schedule, cancel: clock.cancel });
  assert.equal(clock.entries[0].ms, 7500);
  peer.complete();
  assert.equal(await promise, peer.localDescription.sdp);
  assert.ok(clock.entries[0].cancelled);
  peer.localDescription = { sdp: 'v=0\r\ns=changed\r\n' };
  assert.equal(finalLocalOffer(peer), peer.localDescription.sdp);
});

test('ICE cancellation and timeout do not expose SDP or preserve stale listeners', async () => {
  const peer = new FakePeer(), clock = fakeClock(), controller = new AbortController();
  const promise = waitForIceComplete(peer, {
    signal: controller.signal, schedule: clock.schedule, cancel: clock.cancel,
  });
  controller.abort();
  await assert.rejects(promise, { code: 'ICE_CANCELLED' });
  peer.complete();
  assert.ok(clock.entries[0].cancelled);
  assert.equal(await waitForIceComplete(peer), peer.localDescription.sdp);
  const waiting = new FakePeer(), timeout = fakeClock();
  const delayed = waitForIceComplete(waiting, { schedule: timeout.schedule, cancel: timeout.cancel });
  timeout.entries[0].fn();
  await assert.rejects(delayed, { code: 'ICE_TIMEOUT' });
  assert.ok(timeout.entries[0].cancelled);
  assert.ok(RealtimeIceGateError);
});

test('ICE rejects missing final local SDP, invalid peer and unreasonable timeouts', async () => {
  const peer = new FakePeer();
  peer.complete('');
  assert.throws(() => finalLocalOffer(peer), { code: 'FINAL_LOCAL_SDP_MISSING' });
  await assert.rejects(waitForIceComplete(peer), { code: 'FINAL_LOCAL_SDP_MISSING' });
  await assert.rejects(waitForIceComplete(null), { code: 'PEER_REQUIRED' });
  await assert.rejects(waitForIceComplete(peer, { timeoutMs: 20000 }), { code: 'INVALID_ICE_TIMEOUT' });
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(waitForIceComplete(peer, { signal: aborted.signal }), { code: 'ICE_CANCELLED' });
});
