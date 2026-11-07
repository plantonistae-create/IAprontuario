import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The actual frontend pauseSession function runs with synthetic transport doubles.
// No microphone/network/login/clinical content and no paid API requests.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf('function pauseSession(){');
const end = html.indexOf("  q('nexaPauseBtn')?.addEventListener('click',pauseSession);", start);
assert.ok(start > 0 && end > start, 'real pauseSession must remain discoverable');
const pauseSource = html.slice(start, end);

function pauseHarness({ fallback = false, channelReady = 'connecting', startPaused = true } = {}) {
  const events = { status: [], intervalClears: 0, recorderPauses: 0, recorderResumes: 0, frameStops: 0, flatCalls: 0, waveCalls: 0, timerUpdates: 0, fallbackStops: 0, uiSync: 0 };
  const track = { enabled: !startPaused };
  const recorder = {
    state: startPaused ? 'paused' : 'recording',
    pause() { this.state = 'paused'; events.recorderPauses++; },
    resume() { this.state = 'recording'; events.recorderResumes++; },
  };
  const widgets = { status: { textContent: '' }, timer: { textContent: '' } };
  const context = {
    recording: true,
    sessionPaused: startPaused,
    mediaRecorder: recorder,
    stream: { getAudioTracks() { return [track]; } },
    timerInt: 1,
    seconds: 8,
    raf: 2,
    radarFallbackActive: fallback,
    realtimeDc: { readyState: channelReady },
    radarChunkRecorder: null,
    q(name) { assert.ok(widgets[name]); return widgets[name]; },
    fmt: value => String(value),
    setInterval: () => { events.timerUpdates++; return 3; },
    clearInterval: () => { events.intervalClears++; },
    clearTimeout: () => {},
    cancelAnimationFrame: () => { events.frameStops++; },
    flat: () => { events.flatCalls++; },
    wave: () => { events.waveCalls++; },
    radarTransportStatus: status => { events.status.push(status); },
    syncRecordingUi: () => { events.uiSync++; },
    console: { warn: () => {} },
    show: () => { throw new Error('unexpected pause error'); },
  };
  vm.runInNewContext(pauseSource + '\nglobalThis.control=pauseSession;', context, { timeout: 1000 });
  return { context, events, track, recorder, widgets, act: () => context.control() };
}

test('resuming chunk fallback stays connecting rather than falsely claiming live WebRTC', () => {
  const h = pauseHarness({ fallback: true, channelReady: 'closed' });
  h.act();
  assert.equal(h.track.enabled, true);
  assert.equal(h.recorder.state, 'recording');
  assert.equal(h.events.status.at(-1), 'connecting');
  assert.ok(!h.events.status.includes('live'));
  assert.equal(h.events.uiSync, 1);
});

test('open WebRTC data channel resumes in live state', () => {
  const h = pauseHarness({ channelReady: 'open' });
  h.act();
  assert.equal(h.events.status.at(-1), 'live');
  assert.equal(h.track.enabled, true);
  assert.equal(h.events.recorderResumes, 1);
});

test('pending WebRTC connection on resume does not claim live status', () => {
  const h = pauseHarness({ channelReady: 'connecting' });
  h.act();
  assert.equal(h.events.status.at(-1), 'connecting');
});

test('pause mutes track and cannot report live status in either transport', () => {
  for (const fallback of [false, true]) {
    const h = pauseHarness({ fallback, channelReady: fallback ? 'closed' : 'open', startPaused: false });
    h.act();
    assert.equal(h.track.enabled, false);
    assert.equal(h.recorder.state, 'paused');
    assert.deepEqual(h.events.status, ['paused']);
    assert.equal(h.events.intervalClears, 1);
    assert.equal(h.events.frameStops, 1);
    assert.equal(h.events.uiSync, 1);
  }
});

test('browser fixture uses genuine DataChannel readyState transitions', () => {
  const fixture = readFileSync(new URL('./browser-fixture.js', import.meta.url), 'utf8');
  assert.match(fixture, /readyState:'connecting'/);
  assert.match(fixture, /this\.channel\.readyState='open';this\.channel\.onopen\?\.\(\)/);
  assert.match(fixture, /close\(\)\{this\.readyState='closed';this\.onclose\?\.\(\)/);
});
