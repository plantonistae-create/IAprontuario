import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Runs the actual consent onchange handler and stopRec from the frontend in an
// isolated VM; no microphone, Supabase account, network, patient data or timers.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const begin = html.indexOf('function stopRec({discard=false}={}){');
const end = html.indexOf(";$('recBtn').onclick=", begin);
assert.ok(begin > 0 && end > begin, 'real stopRec and consent handler must remain discoverable');
const transport = html.slice(begin, end);

function scenario({ consent, recording = false, starting = false, recorderState = 'inactive' }) {
  const counters = {
    radarStops: [], timerStops: 0, micStops: 0, recorderStops: 0,
    audioCloses: 0, recordingCssRemovals: 0,
  };
  const nodes = {
    consent: { checked: consent, onchange: null },
    recBtn: { disabled: false, classList: { remove(name) { if (name === 'recording') counters.recordingCssRemovals++; } } },
    circleShape: { style: {} },
    stopShape: { style: {} },
    processBtn: { disabled: false }, 
    status: { textContent: '' },
  };
  const context = {
    recording, recordingStarting: starting,
    discardStoppedRecording: false,
    audioBlob: new Blob(['synthetic-only']), chunks: [new Blob(['synthetic-only'])],
    mediaRecorder: {
      state: recorderState,
      stop() { counters.recorderStops++; this.state = 'inactive'; },
    },
    stream: { getTracks() { return [{ stop() { counters.micStops++; } }]; } },
    audioCtx: { state: 'running', close() { counters.audioCloses++; } },
    stopRecordingTimer() { counters.timerStops++; },
    stopRealtimeRadar(options) { counters.radarStops.push(options); },
    $(name) { assert.ok(nodes[name], 'synthetic node missing: ' + name); return nodes[name]; },
  };
  vm.runInNewContext(transport, context, { timeout: 1000 });
  assert.equal(typeof nodes.consent.onchange, 'function', 'consent handler must be bound');
  nodes.consent.onchange();
  return { counters, nodes, context };
}

test('revoking consent while recording closes the microphone, recorder and Radar', () => {
  const s = scenario({ consent: false, recording: true, recorderState: 'recording' });
  assert.equal(s.nodes.recBtn.disabled, true);
  assert.equal(s.context.recording, false);
  assert.equal(s.context.discardStoppedRecording, true, 'audio should be marked to discard on recorder stop');
  assert.equal(s.counters.recorderStops, 1);
  assert.equal(s.counters.micStops, 1);
  assert.equal(s.counters.audioCloses, 1);
  assert.equal(s.counters.timerStops, 1);
  assert.equal(s.counters.radarStops.length, 1);
  assert.equal(s.counters.radarStops[0].wipe, false, 'previously processed transcript should not be erased silently');
  assert.match(s.nodes.status.textContent, /Consentimento retirado/);
});

test('revoking consent during pending microphone startup cancels locally', () => {
  const s = scenario({ consent: false, recording: false, starting: true });
  assert.equal(s.counters.radarStops.length, 1);
  assert.equal(s.counters.micStops, 1);
  assert.equal(s.context.discardStoppedRecording, true);
  // Late getUserMedia success is protected independently by startRec's epoch/consent check.
  const originalStart = html.slice(html.indexOf('async function startRec(){'), begin);
  assert.match(originalStart, /const startEpoch=clinicalEpoch,consentEpoch=nexaConsentRevision/);
  assert.match(originalStart, /startEpoch!==clinicalEpoch\|\|consentEpoch!==nexaConsentRevision\|\|!\$\('consent'\)\.checked/);
  assert.match(originalStart, /getTracks\(\)\.forEach\(t=>t\.stop\(\)\)/);
});

test('active recorder stopped on withdrawal even when recording flag already dropped', () => {
  const s = scenario({ consent: false, recording: false, recorderState: 'recording' });
  assert.equal(s.counters.recorderStops, 1);
  assert.equal(s.counters.radarStops.length, 1);
});

test('idle consent toggle does not spuriously stop recording', () => {
  const denied = scenario({ consent: false });
  assert.equal(denied.nodes.recBtn.disabled, true);
  assert.equal(denied.counters.radarStops.length, 0);
  assert.equal(denied.counters.micStops, 0);
  assert.equal(denied.context.discardStoppedRecording, false);
  const granted = scenario({ consent: true });
  assert.equal(granted.nodes.recBtn.disabled, false);
  assert.equal(granted.counters.radarStops.length, 0);
  assert.equal(granted.counters.recorderStops, 0);
});

test('abort of pending chunk and WebRTC work is still delegated to stopRealtimeRadar', () => {
  const start = html.indexOf('function stopRealtimeRadar({wipe=true}={}){');
  const end = html.indexOf('let mediaRecorder,stream,', start);
  assert.ok(start > 0 && end > start);
  const stop = html.slice(start, end);
  assert.match(stop, /radarTransportAbort\?\.abort\(\)/);
  assert.match(stop, /radarNegotiationAbort\?\.abort\(\)/);
  assert.match(stop, /radarChunkQueue=\[\]/);
  assert.match(stop, /radarTransportRevision/);
  const onstop = html.slice(html.indexOf('mediaRecorder.onstop=()=>{'), html.indexOf('mediaRecorder.start();'));
  assert.match(onstop, /if\(discardStoppedRecording\|\|!\$\('consent'\)\.checked\)/);
  assert.match(onstop, /chunks=\[\];audioBlob=null/);
});

test('withdrawn consent discards completed unprocessed audio and disables remote processing', () => {
  const h = scenario({ consent: false, recorderState: 'inactive' });
  assert.equal(h.counters.recorderStops, 0, 'already-completed audio should not invoke stop again');
  assert.equal(h.counters.radarStops.length, 0);
  assert.equal(h.context.audioBlob, null, 'completed audio must be dropped from memory');
  assert.deepEqual(Array.from(h.context.chunks), []);
  assert.equal(h.nodes.processBtn.disabled, true);
  assert.match(h.nodes.status.textContent, /Consentimento retirado/);
});

test('checking consent does not silently discard an earlier recorded blob', () => {
  const h = scenario({ consent: true });
  assert.notEqual(h.context.audioBlob, null);
  assert.equal(h.context.chunks.length, 1);
  assert.equal(h.nodes.processBtn.disabled, false);
});

test('processAudio fails closed before any outbound work without active consent', async () => {
  const start = html.indexOf('async function processAudio(){');
  const end = html.indexOf("}$('processBtn').onclick=processAudio;", start);
  assert.ok(start > 0 && end > start);
  const source = html.slice(start, end + 1);
  const status = [];
  const context = {
    $(name) { assert.equal(name, 'consent'); return { checked: false }; },
    show(message, error) { status.push({ message, error }); },
  };
  vm.runInNewContext('let nexaConsentRevision=0;\n' + source + '\nglobalThis.run=processAudio;', context, { timeout: 1000 });
  await context.run();
  assert.equal(status.length, 1);
  assert.equal(status[0].error, true);
  assert.match(status[0].message, /consentimento/i);
  assert.match(source, /consentRevision!==nexaConsentRevision/, 'in-flight responses must not apply after consent withdrawal');
  assert.match(source, /\$\('processBtn'\)\.disabled=!\$\('consent'\)\.checked/, 'finally must not re-enable processing on withdrawal');
});
